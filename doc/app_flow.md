# App Flow

Three distinct request flows run through WalletOS: a developer calling the REST API, an end user viewing the wallet UI, and an admin acting through the dashboard. Each has a different auth path and a different surface area.

---

## 1. Developer API flow

This is the primary integration path. The consuming project's backend calls WalletOS to create wallets and move money.

```
Consuming project backend
  │
  ├─ Authorization: Bearer wlt_live_xxx
  │
  ▼
apps/api — Express
  │
  ├─ requestId middleware        → attaches req_xxx to every request
  ├─ apiKeyAuth middleware       → bcrypt-compares key, resolves tenantId + scope + isSandbox
  ├─ rateLimiter middleware      → 1000/min read, 500/min write per API key
  │
  ├─ Route handler
  │   ├─ Validates request body
  │   ├─ Checks idempotency_key (returns cached response if seen within 24h)
  │   │
  │   ├─ For debits and credits:
  │   │   └─ prisma.$transaction(async (tx) => {
  │   │         const wallet = await tx.wallet.findUnique({
  │   │           where: { id },
  │   │           lock: { for: 'update' }   ← SELECT FOR UPDATE
  │   │         })
  │   │         // execute balance check (if debit) or reversal check
  │   │         // write transaction record
  │   │         // update wallet.balance
  │   │         // write audit log entry
  │   │       })
  │   │
  │   └─ Emits webhook event async (non-blocking)
  │
  └─ JSON response { data } or { error: { code, message, request_id } }
```

**Idempotency check detail:**

Before executing any write, the handler queries `transactions` for an existing record with the same `idempotency_key`. If found and the request parameters match, it returns the original response immediately. If found with different parameters, it returns 409 `IDEMPOTENCY_CONFLICT`.

**Sandbox routing:**

`apiKeyAuth` sets `req.isSandbox = true` when the key starts with `wlt_test_`. Every database query appends `AND is_sandbox = $isSandbox`. A test key physically cannot read or write live data.

---

## 2. User-facing wallet UI flow

The end user never calls the WalletOS API directly. Their frontend receives a short-lived session token from the consuming project's backend.

```
End user browser
  │
  └─ Consuming project's frontend
       │
       ├─ On mount: calls consuming project's own backend
       │     "give me a wallet session token for user_123"
       │
       └─ Consuming project backend
             │
             ├─ POST /api/wallets/session-token
             │   Authorization: Bearer wlt_live_xxx   ← live key, server-side only
             │   Body: { wallet_id }
             │
             ▼
           apps/api
             │
             └─ Creates UserSessionToken (1 hour TTL, scoped to wallet_id)
                  Returns: { token: "sess_xxx" }
                  │
                  ▼
           Consuming project backend → sends token to frontend
                  │
                  ▼
           apps/web (WalletOS UI)
             │
             ├─ Uses sess_xxx for all subsequent API calls
             ├─ GET /api/wallets/:walletId      → balance card
             ├─ GET /api/transactions?wallet_id → transaction list
             │
             └─ UI is read-only for the end user
                  No credit / debit / freeze from the user side
```

**Session token validation:**
Every request from the UI goes through a `userSessionAuth` middleware that checks the token hash against `user_session_tokens`, verifies expiry, and confirms the requested `wallet_id` matches the token's scope.

---

## 3. Admin dashboard flow

Admins authenticate with Supabase Auth. The admin app uses a Supabase session, not an API key.

```
Admin user
  │
  └─ apps/admin (Next.js, port 3001)
       │
       ├─ Login page → Supabase Auth (email + password)
       │   Supabase returns access_token (JWT)
       │
       ├─ All API calls:
       │   Authorization: Bearer <supabase_access_token>
       │
       ▼
     apps/api
       │
       ├─ adminAuth middleware
       │   ├─ supabaseAdmin.auth.getUser(token)  → verifies JWT with Supabase
       │   ├─ Looks up AdminUser by supabase_uid
       │   ├─ Checks isActive
       │   └─ Sets req.adminUser = { id, email, tenantId, role }
       │
       ├─ requireAdminRole middleware (where applicable)
       │   └─ role rank: support(0) < finance(1) < tenant_admin(2) < superadmin(3)
       │
       └─ Admin-scoped route handlers
            ├─ Manual credit/debit → same prisma.$transaction path as API
            │   created_by = "admin:email@domain.com"
            │
            ├─ Freeze/unfreeze → writes audit log with admin actor
            ├─ Audit log queries → read-only, paginated
            └─ Reports → aggregate Postgres queries, no app-level aggregation
```

---

## 4. Webhook delivery flow

After any wallet or transaction write commits, the webhook worker fires asynchronously.

```
Write completes (transaction committed)
  │
  └─ Async: webhookService.emit(event, payload)
       │
       ├─ Queries webhook_endpoints for tenant where event is subscribed
       │
       ├─ For each endpoint:
       │   ├─ Signs payload: HMAC-SHA256(secret, JSON.stringify(payload))
       │   ├─ POST to endpoint URL
       │   ├─ Logs attempt to webhook_deliveries
       │   │
       │   ├─ On 2xx → marks succeeded_at, done
       │   └─ On non-2xx or timeout:
       │         Schedules retry with exponential backoff
       │         Attempt 1: 10s
       │         Attempt 2: 30s
       │         Attempt 3: 2m
       │         Attempt 4: 10m
       │         Attempt 5: 1h
       │         After 5 failures → marks failed_at, no more retries
```

The webhook delivery never blocks the API response. A slow or unreachable endpoint does not slow down the credit/debit that triggered it.

---

## 5. Tenant onboarding flow

Done by a superadmin in the admin dashboard.

```
Superadmin
  │
  ├─ POST /api/tenants
  │   Body: { name, contactEmail, config }
  │
  ▼
apps/api — adminAuth + requireAdminRole('superadmin')
  │
  ├─ Creates Tenant record
  ├─ Generates wlt_live_xxx key → hashes with bcrypt → stores ApiKey record
  ├─ Generates wlt_test_xxx key → hashes with bcrypt → stores ApiKey record (isSandbox: true)
  │
  └─ Returns:
       {
         tenant_id: "...",
         live_key: "wlt_live_xxx",   ← shown once, never again
         test_key: "wlt_test_xxx"    ← shown once, never again
       }
```

After this point, the plain-text keys are gone. The tenant copies them immediately.

---

## 6. Wallet state machine

```
           POST /wallets
               │
               ▼
           [ active ] ──────────────────────────────┐
               │                                    │
      POST /freeze                         POST /close (balance = 0 only)
               │                                    │
               ▼                                    ▼
           [ frozen ]                          [ closed ]
               │
      POST /unfreeze
               │
               ▼
           [ active ]
```

- `active` → accepts credits and debits.
- `frozen` → rejects all credits and debits with 409. Reversible.
- `closed` → permanent. No further operations. Requires balance = `0.00` to close.

Closing a frozen wallet: must unfreeze first, withdraw balance, then close.