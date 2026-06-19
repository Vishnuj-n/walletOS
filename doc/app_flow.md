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
  ├─ apiKeyAuth middleware       → SHA-256 hash comparison, resolves tenantId + scope + isSandbox
  ├─ rateLimiter middleware      → 1000/min read, 500/min write per API key
  │
  ├─ Route handler
  │   ├─ Validates request body
  │   ├─ Checks idempotency_key (returns cached response if seen within 30 days)
  │   │
  │   ├─ For debits and credits:
  │   │   └─ prisma.$transaction(async (tx) => {
  │   │         const wallet = await tx.$queryRaw`
  │   │           SELECT * FROM wallets WHERE id = ${walletId} FOR UPDATE
  │   │         `
  │   │         // execute balance check (if debit) or reversal check
  │   │         // write transaction record
  │   │         // update wallet.balance
  │   │         // write audit log entry
  │   │       })
  │   │
  │   ├─ For transfers (same tenant only):
  │   │   └─ prisma.$transaction(async (tx) => {
  │   │         const wallets = [fromId, toId].sort()
  │   │         const [walletA] = await tx.$queryRaw`
  │   │           SELECT * FROM wallets WHERE id = ${wallets[0]} FOR UPDATE
  │   │         `
  │   │         const [walletB] = await tx.$queryRaw`
  │   │           SELECT * FROM wallets WHERE id = ${wallets[1]} FOR UPDATE
  │   │         `
  │   │         // debit from source, credit to destination
  │   │         // both succeed or both roll back
  │   │       })
  │   │
  │   └─ Emits webhook event async (non-blocking)
  │
  └─ JSON response { data } or { error: { code, message, request_id } }
```

**Idempotency check detail:**

Before executing any write, the handler queries `transactions` for an existing record with the same `idempotency_key` within a **30-day** window. If found and the request parameters match, it returns the original response immediately. If found with different parameters, it returns 409 `IDEMPOTENCY_CONFLICT`. Transfers use `pg_advisory_xact_lock` for concurrency-safe idempotency.

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
             ├─ POST /api/v1/auth/session
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
             ├─ GET /api/v1/wallets/:walletId      → balance card
             ├─ GET /api/v1/transactions?wallet_id → transaction list
             │
             └─ UI is read-only for the end user
                  No credit / debit / freeze from the user side
```

**Session token validation:**
Every request from the UI goes through `userSessionAuth` middleware that SHA-256 hashes the token, checks `session_tokens` for a match, verifies expiry, and confirms the requested `wallet_id` matches the token's scope.

---

## 3. Admin dashboard flow

Admins authenticate with custom `adm_` session tokens, not API keys or Supabase JWTs.

```
Admin user
  │
  └─ apps/admin (Next.js, port 3001)
       │
       ├─ Login page → email + password
       │   POST /api/v1/admin/auth/login
       │   On success: returns session token (adm_xxx)
       │
       ├─ All API calls:
       │   Authorization: Bearer adm_xxx
       │
       ▼
     apps/api
       │
       ├─ adminAuth middleware
       │   ├─ SHA-256 hash of Bearer token
       │   ├─ Lookup session_tokens by hash, check expiry
       │   ├─ Parse scope "admin:<adminUserId>"
       │   ├─ Lookup AdminUser by id, check isActive
       │   ├─ Match session tenantId to AdminUser tenantId
       │   └─ Sets req.adminUser = { id, email, tenantId, role }
       │
       ├─ requireAdminRole middleware (where applicable)
       │   └─ role rank: support(0) < finance(1) < tenant_admin(2) < superadmin(3)
       │
       ├─ Idempotency middleware on write endpoints
       │   └─ 30-day window for duplicate detection
       │
       └─ Admin-scoped route handlers
            ├─ Manual credit/debit → same prisma.$transaction path as API
            │   created_by = "admin:email@domain.com"
            │
            ├─ Freeze/unfreeze/close → writes audit log with admin actor
            ├─ Wallet list → supports status filter (active/frozen/pending_closure/closed)
            ├─ Webhook CRUD → create, list, delete, test
            ├─ Admin user management → create, list, update roles, invite flow
            ├─ Tenant management → create, rotate keys, revoke keys (superadmin only)
            ├─ Audit log queries → read-only, paginated
            ├─ Admin audit log → tracks all admin actions (AdminAuditLog table)
            ├─ Reports → aggregate Postgres queries, no app-level aggregation
            └─ Cross-tenant search → wallet search, transaction tracer (superadmin only)
```

**Admin login flow:**

```
POST /api/v1/admin/auth/login
Body: { email, password }
  │
  ├─ Lookup AdminUser by email
  ├─ Verify password against stored hash
  ├─ Check isActive
  ├─ Create session_tokens record (adm_xxx prefix)
  │   - SHA-256 hash stored, raw token returned
  │   - Scope: "admin:<adminUserId>"
  │   - TTL: configurable, default 24h
  └─ Returns { token: "adm_xxx", expires_at, adminUser: { id, email, role } }
```

**Invite flow:**

```
POST /api/v1/admin/invite (superadmin only)
Body: { email, role, tenantId }
  │
  ├─ Creates AdminInvite record with JWT token
  ├─ Sends email with invite link
  └─ On accept: AdminUser created, welcome email sent
```

---

## 4. Webhook delivery flow

After any wallet or transaction write commits, the webhook worker fires asynchronously.

```
Write completes (transaction committed)
  │
  └─ Async: webhookService.publishWebhookEvent(event, payload)
       │
       ├─ Queries webhooks for tenant where isActive = true
       │
       ├─ Filter webhooks subscribing to this event (exact match or wildcard '*')
       │
       ├─ For each matching webhook:
       │   ├─ Create WebhookDelivery record (attempt 1)
       │   │
       │   └─ dispatchWebhookDelivery(delivery.id)
       │       ├─ SSRF check: DNS lookup, block private IP ranges
       │       ├─ HMAC-SHA256(secret, JSON.stringify(payload))
       │       ├─ Header: X-WalletOS-Signature: sha256=<hex>
       │       ├─ Header: X-Tenant-ID: <tenantId>
       │       ├─ Header: Idempotency-Key: <uuid>
       │       ├─ POST to endpoint URL (10s timeout)
       │       │
       │       ├─ On 2xx → marks deliveredAt, resets failureCount to 0, status = 'active'
       │       └─ On non-2xx or timeout:
       │             Increments failureCount
       │             Schedules retry with exponential backoff:
       │               Attempt 2: 30s
       │               Attempt 3: 2m
       │               Attempt 4: 15m
       │               Attempt 5: 2h
       │             After 5 failures → status = 'failed', no more retries
       │
       └── Background retry worker (runs every 30s)
             ├─ Sweeps pending deliveries where nextAttempt <= now
             ├─ Concurrency limit: WEBHOOK_CONCURRENCY_LIMIT (default 5)
             ├─ Atomic lease: updateMany sets nextAttempt forward by 120s
             └─ Dispatches claimed deliveries
```

The webhook delivery never blocks the API response. A slow or unreachable endpoint does not slow down the credit/debit that triggered it.

---

## 5. Tenant onboarding flow

Done by a superadmin in the admin dashboard.

```
Superadmin
  │
  ├─ POST /api/v1/admin/tenants
  │   Authorization: Bearer adm_xxx
  │   Body: { name, contactEmail, config }
  │
  ▼
apps/api — adminAuth + requireAdminRole('superadmin')
  │
  ├─ Creates Tenant record
  ├─ Generates wlt_live_xxx key → SHA-256 hash → stores ApiKey record
  ├─ Generates wlt_test_xxx key → SHA-256 hash → stores ApiKey record (isSandbox: true)
  │
  └─ Returns:
       {
         tenant_id: "...",
         live_key: "wlt_live_xxx",   ← shown once, never again
         test_key: "wlt_test_xxx"    ← shown once, never again
       }
```

After this point, the plain-text keys are gone. The tenant copies them immediately.

**Key rotation and revocation:**

```
POST /api/v1/admin/tenants/:tenantId/rotate-key → generates new key, keeps old active during transition window
POST /api/v1/admin/tenants/:tenantId/revoke-key  → deactivates ApiKey record immediately
```

---

## 6. Wallet state machine

```
           POST /wallets
               │
               ▼
           [ active ] ──────────────────────────────────┐
               │                                        │
      POST /freeze                            POST /close (balance = 0 only)
               │                                        │
               ▼                                        ▼
           [ frozen ]                            [ pending_closure ] ← grace period
               │                                        │
      POST /unfreeze                            Admin confirms or auto-expires
               │                                        │
               ▼                                        ▼
           [ active ]                               [ closed ]
               │
               └── POST /close (must unfreeze → drain balance → close)
```

- `active` → accepts credits and debits.
- `frozen` → rejects all credits and debits with 409. Reversible.
- `pending_closure` → wallet queued for closure with a grace period for recovery. Reversible by admin.
- `closed` → permanent. No further operations. Requires balance = `0.00` to close.

Closing a frozen wallet: must unfreeze first, withdraw balance, then close.
