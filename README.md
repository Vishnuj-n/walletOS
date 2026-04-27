# WalletOS

An API-first wallet management service. Integrate it into any project to give users a balance, transaction history, and audit trail — without writing balance logic.

---

## What's in the repo

```
walletOS/
├── apps/
│   ├── api/      Express + Prisma. All REST endpoints and business logic.
│   ├── web/      Next.js. User-facing wallet UI.
│   └── admin/    Next.js. Admin dashboard for support and operations teams.
└── docs/
    ├── Requirements.md
    ├── APP FLOW.md
    ├── Architecture.md
    ├── Data API.md
    ├── Plan Scope.md
    └── Schema.md
```

---

## Prerequisites

- Node.js 20+
- npm 10+
- A Supabase project (handles Postgres and Auth)

---

## Local setup

**1. Clone and install**

```bash
git clone <repo>
cd walletOS
npm install
```

**2. Set up environment variables**

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
```

Fill in `apps/api/.env` with your Supabase credentials:

```
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
USER_SESSION_SECRET=any-random-string-min-32-chars
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

**3. Run the database migration**

```bash
cd apps/api
npx prisma migrate dev --name init
```

After the first migration runs, revoke delete/update on the audit log table. In the Supabase SQL editor:

```sql
REVOKE UPDATE, DELETE ON audit_logs FROM postgres;
```

Replace `postgres` with your actual app DB role if different.

**4. Start all three apps**

Open three terminals from the repo root:

```bash
# Terminal 1 — API
npx nx run @walletOS/api:serve

# Terminal 2 — User UI
npx nx run web:serve

# Terminal 3 — Admin dashboard
npx nx run admin:serve
```

| App | URL |
|---|---|
| API | http://localhost:3333 |
| User UI | http://localhost:3000 |
| Admin dashboard | http://localhost:3001 |

Check the API is up: `GET http://localhost:3333/api/health`

---

## Creating a tenant and first API key

The admin dashboard is the UI for this. Alternatively, hit the API directly as a superadmin:

```bash
curl -X POST http://localhost:3333/api/tenants \
  -H "Authorization: Bearer <supabase_admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "My Project" }'
```

Response includes `live_key` and `test_key`. Copy them immediately — they are not shown again.

---

## Making your first API call

```bash
# Create a wallet
curl -X POST http://localhost:3333/api/wallets \
  -H "Authorization: Bearer wlt_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user_123",
    "label": "Cashback Wallet"
  }'

# Credit the wallet
curl -X POST http://localhost:3333/api/transactions/credit \
  -H "Authorization: Bearer wlt_live_xxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: first_credit_user_123" \
  -d '{
    "wallet_id": "clxyz...",
    "amount": "250.00",
    "description": "Welcome bonus"
  }'
```

Use `wlt_test_xxx` to work in the sandbox. Sandbox data never mixes with live data.

---

## Key concepts

**Sandbox** — every tenant gets a test key (`wlt_test_xxx`) that operates in a completely separate data namespace. Use it for development and staging. Switch to `wlt_live_xxx` for production.

**Idempotency** — all write endpoints require an `Idempotency-Key` header. If your request fails mid-flight, retry with the same key — the operation won't execute twice. Keys are unique for 24 hours.

**Immutable transactions** — transaction records are never modified or deleted. Corrections go through reversals: a new transaction of the opposite type linked to the original.

**Audit log** — every wallet and transaction change writes an audit entry automatically. The database user the API connects with cannot delete or update audit records.

**Session tokens** — the live API key never reaches the browser. Your backend calls `POST /wallets/session-token` server-to-server and sends the resulting short-lived token (1 hour, scoped to one wallet) to your frontend.

---

## Useful commands

```bash
# View all Nx project names
npx nx show projects

# Dependency graph
npx nx graph

# Run linter
npx nx run @walletOS/api:lint
npx nx run web:lint
npx nx run admin:lint

# Build for production
npx nx run @walletOS/api:build
npx nx run web:build
npx nx run admin:build

# Prisma studio (browse DB in browser)
cd apps/api && npx prisma studio

# Generate Prisma client after schema changes
cd apps/api && npx prisma generate

# Run a new migration
cd apps/api && npx prisma migrate dev --name <migration-name>
```

---

## Running the API

**Development mode:**
```bash
npx dotenv-cli -e .env.development -- nx serve api
```

**Production mode:**
```bash
npx dotenv-cli -e .env.production -- nx serve api
```

The API will be available at `http://localhost:3333`

---

## Testing

**Run all API tests:**
```bash
npx dotenv-cli -e .env.test -- npx nx test api --silent
```

**Run tests in band (sequential execution):**
```bash
npx dotenv-cli -e .env.test -- npx nx test api --silent --runInBand
```

**Limiting Prisma connections for testing:**

To limit Prisma database connections to 3 during testing, add `connection_limit=3` to your `DATABASE_URL` in `.env.test`:

```
DATABASE_URL="postgresql://user:password@localhost:6543/postgres?pgbouncer=true&connection_limit=3"
```

Or run with a custom connection limit:
```bash
DATABASE_URL="postgresql://user:password@localhost:6543/postgres?pgbouncer=true&connection_limit=3" npx nx test api
```

---

## Generating API Keys for Testing

To generate API keys for use with Postman or manual testing:

```bash
# Generate with default tenant name
npx dotenv-cli -e .env.test -- npx ts-node apps/api/src/scripts/generate-key.ts

# Generate with custom tenant name
npx dotenv-cli -e .env.test -- npx ts-node apps/api/src/scripts/generate-key.ts "My Tenant"
```

The script will output:
- Tenant name
- Plain API key (use this in Postman or API requests)

The generated key has `read_write` scope and is in sandbox mode.

---

## Docs

- [Requirements](./docs/Requirements.md) — full feature list with P0/P1/P2 tags
- [App Flow](./docs/APP%20FLOW.md) — request flows for each actor
- [Architecture](./docs/Architecture.md) — database, auth, middleware, deployment decisions
- [Data API](./docs/Data%20API.md) — endpoint reference with request/response shapes
- [Plan Scope](./docs/Plan%20Scope.md) — build order and open questions
- [Schema](./docs/Schema.md) — Prisma schema reference