# Architecture

---

## System overview

WalletOS is a three-app Nx monorepo. The apps share one root install and one TypeScript config but deploy independently.

```
walletOS/
├── apps/
│   ├── api/      Express + Prisma. The only process that touches the database.
│   ├── web/      Next.js. User-facing wallet UI. Calls apps/api.
│   └── admin/    Next.js. Admin dashboard. Calls apps/api with admin session tokens.
└── doc/
```

`apps/web` and `apps/admin` are separate Next.js apps. They do not share a Next.js instance. They are deployed to different domains (`app.walletOS.io` and `admin.walletOS.io`). Keeping them separate means admin auth, admin routing, and admin deploys are completely isolated from the user-facing app.

---

## Database

**Postgres.** Chosen over MongoDB for three concrete reasons this project required:

`SELECT FOR UPDATE` — the PRD mandates row-level locking before any debit to prevent simultaneous debits from producing a negative balance. Postgres locks the wallet row at the database level. MongoDB has no equivalent primitive; the workaround requires application-level conditional updates that are easier to misconfigure.

Foreign key constraints — the double-entry ledger requires that a transaction record can never reference a wallet that doesn't exist. Postgres enforces this at the storage engine. MongoDB enforces it only in application code, which means a bug can create orphaned records.

Audit log immutability — the PRD requires that the database user the application connects with has `DELETE` and `UPDATE` revoked on `audit_logs`. In Postgres this is two SQL lines. In MongoDB it requires a custom role with non-standard granularity.

**Prisma** is the ORM. It provides type-safe queries, a migration system, and connection pooling. The Prisma client is a singleton in `src/lib/prisma.ts`. All database access goes through it — no raw `pg` queries except for the `SELECT 1` health check and the `SELECT FOR UPDATE` lock.

**`SELECT FOR UPDATE` pattern for debits and credits:**

The system executes `SELECT FOR UPDATE` inside a Prisma transaction for both credits and debits.

```typescript
await prisma.$transaction(async (tx) => {
  const wallet = await tx.$queryRaw`
    SELECT * FROM wallets WHERE id = ${walletId} FOR UPDATE
  `
  // balance check, debit/credit, transaction record, audit log — all in one atomic block
})
```

**Transfer pattern** locks both wallets in lexicographic order to prevent deadlocks:

```typescript
await prisma.$transaction(async (tx) => {
  const wallets = [fromId, toId].sort()
  const [walletA] = await tx.$queryRaw`SELECT * FROM wallets WHERE id = ${wallets[0]} FOR UPDATE`
  const [walletB] = await tx.$queryRaw`SELECT * FROM wallets WHERE id = ${wallets[1]} FOR UPDATE`
  // debit from source, credit to destination — both or neither
})
```

**Money columns** use `Decimal(20,4)` throughout. No `Float` anywhere. Floats cannot represent monetary values exactly.

---

## Auth — three separate systems

**API key auth (for developer integrations):**

Keys are prefixed: `wlt_live_` for production, `wlt_test_` for sandbox. The prefix is the first filter before any hash comparison. The key is hashed with SHA-256 and stored in `api_keys.key_hash`. The plain text is shown once on creation.

Every request to `apps/api` from a developer context goes through `middleware/auth.ts`:
1. Extract Bearer token
2. Determine sandbox from prefix
3. Query `api_keys` filtered by prefix and `is_active`
4. SHA-256 hash comparison against each candidate
5. Set `req.tenantId`, `req.apiKeyId`, `req.apiKeyScope`, `req.isSandbox`

Key scopes: `read_only` → read-only GET access. `read_write` → create wallets, credit, debit, transfer. `admin` → freeze, close, list all wallets, manage webhooks.

**Admin session auth (for admin dashboard):**

Admins log in through `apps/admin` using email + password. A custom session token (`adm_xxx`) is created and stored in `session_tokens`. Every request from the admin app sends this token as a Bearer token to `apps/api`, where `middleware/adminAuth.ts`:
1. Extract Bearer token starting with `adm_`
2. SHA-256 hash the token
3. Lookup in `session_tokens` by hash, verify not expired
4. Parse scope (`admin:<adminUserId>`)
5. Look up `AdminUser` by id, verify `isActive`, match tenant
6. Sets `req.adminUser = { id, email, tenantId, role }`

Admin roles: `support` (0) → view-only, manual credit/debit. `finance` (1) → view + export reports. `tenant_admin` (2) → tenant-scoped management. `superadmin` (3) → everything including tenant management, key revocation, cross-tenant search.

**User session auth (for end-user wallet UI):**

The consuming project's backend requests a short-lived session token (`sess_xxx`) scoped to a single wallet. The end-user browser uses this token via `middleware/userSessionAuth.ts`. Session tokens expire in 1 hour and are cryptographically scoped to one `wallet_id`.

---

## Sandbox isolation

`is_sandbox: boolean` is a column on `wallets`, `transactions`, and `api_keys`. The `apiKeyAuth` middleware sets `req.isSandbox` from the key prefix before any database query runs. Every query that reads or writes wallet or transaction data filters by `AND is_sandbox = ${req.isSandbox}`.

A `wlt_test_` key cannot read live wallets. A `wlt_live_` key cannot read sandbox wallets. The separation is enforced in every query, not just at the route level.

For admin routes, sandbox mode is controlled via `X-Sandbox: true` header.

---

## Request lifecycle

Every request passes through this middleware stack in order:

```
cors()            → dynamic CORS: global CORS_ORIGINS env + per-tenant DB-backed allowedOrigins
express.json()    → body parsing, 1mb limit
requestId()       → attaches req_xxx to req and X-Request-Id response header
[route handlers]
errorHandler()    → last middleware, formats all errors to PRD error shape
```

Rate limiting sits inside the route handlers, after `apiKeyAuth` has set `req.apiKeyId`, so limits apply per API key rather than per IP.

**Dynamic CORS detail:**

```
1. Check global CORS_ORIGINS env var (comma-separated, supports /regex/ patterns)
2. If no match, check if tenant can be identified via:
   a. X-Tenant-Id header
   b. X-API-Key header → SHA-256 hash → lookup api_keys
   c. Authorization header (sess_/adm_ token) → SHA-256 hash → lookup session_tokens
   d. Subdomain of Host header
3. Look up TenantConfig allowed origins:
   - If tenant is identified: check allowedOrigins for that tenant.
   - If no tenant is identified (preflight OPTIONS): check if origin is allowed by any tenant.
4. Allow if origin matches, reject otherwise
```

---

## Idempotency

Every write endpoint requires an `Idempotency-Key` header (max 255 chars). The middleware:

1. Checks for existing transaction with same `(tenantId, idempotencyKey)` within a **30-day** window
2. If found with matching parameters → returns cached response (200/201)
3. If found with different parameters → returns 409 `IDEMPOTENCY_CONFLICT`
4. Uses `pg_advisory_xact_lock` for concurrency-safe transfer idempotency
5. After response is sent, stores the response in transaction metadata for future lookups

---

## Webhook subsystem

After any wallet or transaction write commits, `webhookService.publishWebhookEvent()` fires asynchronously:

1. Queries `webhooks` for the tenant where `isActive = true`
2. Filters by event subscription match (exact event or wildcard `*`)
3. Creates `WebhookDelivery` record with attempt 1
4. Dispatches POST with `X-WalletOS-Signature` header (HMAC-SHA256)

**SSRF protection:** Validates URLs before dispatch — resolves DNS, blocks private IPv4/IPv6 ranges, rejects non-http/https protocols.

**Retry backoff (after failed delivery):**
| Attempt | Delay |
|---|---|
| 2 | 30s |
| 3 | 2m |
| 4 | 15m |
| 5 | 2h |
| After 5 failures | Status → `failed`, no more retries |

**Circuit breaker:** After 5 consecutive failures, webhook status is set to `failed`. Admin can re-enable manually.

**Background retry worker:** Polls every 30s for pending deliveries with `nextAttempt <= now`. Concurrency limited (default 5). Uses atomic lease pattern (`updateMany` with time-bounded condition) to prevent double-dispatch.

---

## Error handling

All errors flow to `middleware/errorHandler.ts`. The handler formats them into the PRD error shape:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Wallet balance is too low for this debit.",
    "request_id": "req_a1b2c3d4e5f6g7h8"
  }
}
```

`AppError` subclasses in `utils/errors.ts` cover every domain error the PRD names. Throwing one anywhere in a route handler or service reaches the error handler automatically through Express's `next(err)` chain.

---

## Logging

Pino is the logger. `NODE_ENV=development` → pino-pretty with colours and timestamps. `NODE_ENV=test` → structured JSON to stdout for testing. The logger is a singleton in `utils/logger.ts`. No `console.log` in application code.

Every error log includes the `request_id` so a single log line can be correlated to the API response the caller received.

---

## Config and environment

Environment is read directly via `process.env` throughout the codebase. Key variables:

```
Database:   DATABASE_URL
CORS:       CORS_ORIGINS (comma-separated, supports /regex/ patterns)
Rate limit: RATE_LIMIT_READ, RATE_LIMIT_WRITE
Sessions:   USER_SESSION_SECRET, USER_SESSION_TTL_SECONDS
Webhooks:   WEBHOOK_CONCURRENCY_LIMIT (default 5)
Port:       PORT (default 3333)
```

Dev uses `.env`. Production uses the hosting platform's secret manager. `.env.example` is committed with every variable name and a comment. `.env` is gitignored.

---

## Deployment targets

| App | Dev port | Prod domain |
|---|---|---|
| `apps/api` | 3333 | `api.walletOS.io` |
| `apps/web` | 3000 | `app.walletOS.io` |
| `apps/admin` | 3001 | `admin.walletOS.io` |

Each app deploys independently. `apps/api` is a Node.js server. `apps/web` and `apps/admin` are Next.js apps that can run on any Node.js hosting or export as static builds where appropriate.

---

## Key decisions and why

**Three apps, not one.** A single Next.js app with both user and admin routes would share an auth boundary. Keeping them in separate apps means a misconfigured admin route cannot accidentally expose admin functionality to end users. Deploy targets are also independent — the admin app can be taken offline for maintenance without affecting the user-facing app.

**Prisma over raw SQL.** The type safety catches column-name mistakes at compile time. Migrations are versioned and reproducible. The tradeoff is that `SELECT FOR UPDATE` requires a raw query inside `prisma.$transaction` — that's one raw query in the entire codebase, which is acceptable.

**SHA-256 over bcrypt for API keys.** API keys are high-entropy secrets, not low-entropy human passwords. SHA-256 provides complete security for high-entropy values without the CPU penalty of bcrypt. This is critical for performance since the hash comparison runs on every API request.

**Custom admin sessions over Supabase Auth.** Supabase Auth adds a runtime dependency on Supabase's auth service. Custom `adm_` session tokens keep the auth path entirely in the Postgres database, eliminating an external dependency for admin operations. SHA-256 hashing, expiry enforcement, and scope isolation provide equivalent security without network calls to Supabase.

**Dynamic CORS over static env.** Multi-tenant deployments need per-tenant origin control. A static env var cannot scale to hundreds of tenants each with custom domains. The two-tier approach (global `CORS_ORIGINS` env + per-tenant `allowedOrigins` from DB) covers both first-party and tenant-specific deployments.

**`is_sandbox` column, not a separate schema.** A separate schema (or separate database) for sandbox data is cleaner in principle but adds deployment complexity — migrations must run twice, connection configs multiply. A boolean column keeps migrations simple and the isolation is enforced in every query through the middleware-set `req.isSandbox`. If sandbox data volume becomes a problem in Phase 2, the column makes it straightforward to partition or archive.

**30-day idempotency window.** Longer than the standard 24h because financial operations (reversals, refunds, settlement reconciliation) often span weeks. The 30-day window matches typical billing cycles and reduces support tickets for expired idempotency keys.

**Webhook circuit breaker.** Endpoints that fail repeatedly are marked as `failed` and dispatching is paused to prevent dead tenant endpoints from trapping thousands of events in the retry queue.

**Admin audit log.** A separate `AdminAuditLog` table tracks all admin actions independently from the system `AuditLog`. This ensures admin activity can be reviewed without mixing with transaction-level audit trails and provides a clear separation of concerns for compliance.
