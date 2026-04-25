# Architecture

---

## System overview

WalletOS is a three-app Nx monorepo. The apps share one root install and one TypeScript config but deploy independently.

```
walletOS/
├── apps/
│   ├── api/      Express + Prisma. The only process that touches the database.
│   ├── web/      Next.js. User-facing wallet UI. Calls apps/api.
│   └── admin/    Next.js. Admin dashboard. Calls apps/api with Supabase JWTs.
└── docs/
```

`apps/web` and `apps/admin` are separate Next.js apps. They do not share a Next.js instance. They are deployed to different domains (`app.walletOS.io` and `admin.walletOS.io`). Keeping them separate means admin auth, admin routing, and admin deploys are completely isolated from the user-facing app.

---

## Database

**Postgres via Supabase.** Chosen over MongoDB for three concrete reasons this project required:

`SELECT FOR UPDATE` — the PRD mandates row-level locking before any debit to prevent simultaneous debits from producing a negative balance. Postgres locks the wallet row at the database level. MongoDB has no equivalent primitive; the workaround requires application-level conditional updates that are easier to misconfigure.

Foreign key constraints — the double-entry ledger requires that a transaction record can never reference a wallet that doesn't exist. Postgres enforces this at the storage engine. MongoDB enforces it only in application code, which means a bug can create orphaned records.

Audit log immutability — the PRD requires that the database user the application connects with has `DELETE` and `UPDATE` revoked on `audit_logs`. In Postgres this is two SQL lines. In MongoDB it requires a custom role with non-standard granularity.

**Prisma** is the ORM. It provides type-safe queries, a migration system, and connection pooling. The Prisma client is a singleton in `src/config/database.ts`. All database access goes through it — no raw `pg` queries except for the `SELECT 1` health check and the `SELECT FOR UPDATE` lock.

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

**Money columns** use `Decimal(20,4)` throughout. No `Float` anywhere. Floats cannot represent monetary values exactly.

---

## Auth — two separate systems

**API key auth (for developer integrations):**

Keys are prefixed: `wlt_live_` for production, `wlt_test_` for sandbox. The prefix is the first filter before any hash comparison. The key is hashed with SHA-256 and stored in `api_keys.key_hash`. The plain text is shown once on creation.

Every request to `apps/api` from a developer context goes through `middleware/auth.ts`:
1. Extract Bearer token
2. Determine sandbox from prefix
3. Query `api_keys` filtered by prefix and `is_active`
4. SHA-256 hash comparison against each candidate
5. Set `req.tenantId`, `req.apiKeyId`, `req.apiKeyScope`, `req.isSandbox`

Key scopes: `read_only` → read-only GET access. `read_write` → create wallets, credit, debit, transfer. `admin` → freeze, close, list all wallets, manage webhooks.

**Supabase Auth (for admin dashboard):**

Admins log in through `apps/admin` using Supabase Auth (email + password). Supabase issues a JWT. Every request from the admin app sends this JWT as a Bearer token to `apps/api`, where `middleware/adminAuth.ts`:
1. Calls `supabaseAdmin.auth.getUser(token)` to verify the JWT
2. Looks up `AdminUser` by `supabase_uid`
3. Checks `isActive`
4. Sets `req.adminUser = { id, email, tenantId, role }`

Admin roles: `support` (view + manual credit/debit), `finance` (view + export reports), `superadmin` (everything including tenant management and key revocation).

The live API key never reaches the browser. The admin dashboard uses Supabase JWTs. The user-facing web app uses short-lived session tokens scoped to a single wallet.

---

## Sandbox isolation

`is_sandbox: boolean` is a column on `wallets`, `transactions`, and `api_keys`. The `apiKeyAuth` middleware sets `req.isSandbox` from the key prefix before any database query runs. Every query that reads or writes wallet or transaction data filters by `AND is_sandbox = ${req.isSandbox}`.

A `wlt_test_` key cannot read live wallets. A `wlt_live_` key cannot read sandbox wallets. The separation is enforced in every query, not just at the route level.

---

## Request lifecycle

Every request passes through this middleware stack in order:

```
helmet()          → security headers
cors()            → origins from ALLOWED_ORIGINS env var, never hardcoded
express.json()    → body parsing, 1mb limit
requestId()       → attaches req_xxx to req and X-Request-Id response header
[route handlers]
errorHandler()    → last middleware, formats all errors to PRD error shape
```

Rate limiting sits inside the route handlers, after `apiKeyAuth` has set `req.apiKeyId`, so limits apply per API key rather than per IP.

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

Pino is the logger. `NODE_ENV=production` → structured JSON to stdout. `NODE_ENV=development` → pino-pretty with colours and timestamps. The logger is a singleton in `utils/logger.ts`. No `console.log` in application code.

Every error log includes the `request_id` so a single log line can be correlated to the API response the caller received.

---

## Config and environment

All environment variables are read in `src/config/index.ts`. The module throws on startup if a required variable is missing. No other file reads `process.env` directly.

Variables split by concern:

```
Database:   DATABASE_URL
Supabase:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, SUPABASE_ANON_KEY
CORS:       ALLOWED_ORIGINS (comma-separated)
Rate limit: RATE_LIMIT_READ, RATE_LIMIT_WRITE
Sessions:   USER_SESSION_SECRET, USER_SESSION_TTL_SECONDS
```

Dev uses `.env`. Production uses the hosting platform's secret manager (Supabase, Railway, Render). `.env.example` is committed with every variable name and a comment. `.env` is gitignored.

---
## Deployment targets

| App | Dev port | Prod domain |
|---|---|---|
| `apps/api` | 3333 | `api.walletOS.io` |
| `apps/web` | 3000 | `app.walletOS.io` |
| `apps/admin` | 3001 | `admin.walletOS.io` |

Each app deploys independently. `apps/api` is a Node.js server. `apps/web` and `apps/admin` are Next.js apps that can run on any Node.js hosting or export as static builds where appropriate.

Supabase hosts the Postgres database. The `DATABASE_URL` in production points at the Supabase connection string with PgBouncer pooling enabled for the API server.

---

## Key decisions and why

**Three apps, not one.** A single Next.js app with both user and admin routes would share an auth boundary. Keeping them in separate apps means a misconfigured admin route cannot accidentally expose admin functionality to end users. Deploy targets are also independent — the admin app can be taken offline for maintenance without affecting the user-facing app.

**Prisma over raw SQL.** The type safety catches column-name mistakes at compile time. Migrations are versioned and reproducible. The tradeoff is that `SELECT FOR UPDATE` requires a raw query inside `prisma.$transaction` — that's one raw query in the entire codebase, which is acceptable.

**SHA-256 over bcrypt for API keys.** API keys are high-entropy secrets, not low-entropy human passwords. SHA-256 provides complete security for high-entropy values without the CPU penalty of bcrypt. This is critical for performance since the hash comparison runs on every API request.

**Supabase Auth for admins, not a custom session system.** Building session management, token rotation, and credential storage correctly is expensive. Supabase Auth handles this and adds MFA support for free. The tradeoff is a runtime dependency on Supabase's auth service — mitigated by the fact that the database is already on Supabase.

**`is_sandbox` column, not a separate schema.** A separate schema (or separate database) for sandbox data is cleaner in principle but adds deployment complexity — migrations must run twice, connection configs multiply. A boolean column keeps migrations simple and the isolation is enforced in every query through the middleware-set `req.isSandbox`. If sandbox data volume becomes a problem in Phase 2, the column makes it straightforward to partition or archive.

**Wallet closure with grace period.** The system uses a `pending_closure` status to allow account recovery before permanent closure. Users and support agents can make mistakes, and a grace period provides a safety window for recovery.

**Webhook circuit breaker.** The system implements a circuit breaker for webhook delivery. Endpoints that fail repeatedly are marked as `degraded` and dispatching is paused to prevent dead tenant endpoints from trapping thousands of events in the retry queue.