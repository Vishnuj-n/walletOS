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
└── doc/
    ├── requirements.md
    ├── app_flow.md
    ├── architecture.md
    ├── data_api.md
    ├── phase_flow.md
    └── schema.md
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
cp .env.example .env
cp .env.example .env.test
```

Fill in `.env` with your Supabase credentials:

```
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:6543/postgres?pgbouncer=true&sslmode=require
DIRECT_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres?sslmode=require
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:3333/api/v1
NODE_ENV=development
```

`.env.test` uses local Docker database (ensure Docker is running) and only needs Supabase auth credentials. See `doc/ENV_SETUP_GUIDE.md` for details.

**3. Run the database migration**

```bash
cd apps/api
npx prisma migrate dev --name init
```

After the first migration runs, revoke delete/update on the audit log table. In the Supabase SQL editor:

```sql
REVOKE UPDATE, DELETE ON audit_logs FROM your_actual_app_DB_role;
```

**4. Start all three apps**

Open three terminals from the repo root:

```bash
# Terminal 1 — API (loads .env)
npx dotenv-cli -e .env -- npx nx run @walletOS/api:serve

# Terminal 2 — User UI (loads .env.local)
npx nx run web:serve

# Terminal 3 — Admin dashboard (loads .env.local)
npx nx run admin:serve --port 3002
```

> **Note:** Use `nx serve <app>` for quick local development. Use `npx nx run @walletOS/<app>:serve` in workspace scripts or CI for explicit namespacing.

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

**Session tokens** — the live API key never reaches the browser. Your backend calls `POST /api/v1/auth/session` server-to-server and sends the resulting short-lived token (1 hour, scoped to one wallet) to your frontend.

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

**Development mode** (loads `.env`):
```bash
npx dotenv-cli -e .env -- nx serve api
```

**Production mode** (uses CI/CD environment variables):
```bash
nx serve api
```

> **Note:** Use `nx serve api` for local development. Use `npx nx run @walletOS/api:serve` in CI or workspace scripts. Prefix with `npx dotenv-cli -e .env --` for development when environment variables need to be loaded. For production, use CI/CD environment variables instead of .env files.

The API will be available at `http://localhost:3333`

---

## Testing

**Run admin dashboard tests:**
```bash
npx nx test admin
```

**Run all API tests (requires local Postgres container):**
```bash
# 1. Start test database container from root
docker compose up -d

# 2. Run migrations on the test database
cd apps/api
npx dotenv-cli -e ../../.env.test -- npx prisma migrate dev

# 3. Run the tests (from repo root)
cd ../..
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

- [Requirements](./doc/requirements.md) — full feature list
- [App Flow](./doc/app_flow.md) — request flows for each actor
- [Architecture](./doc/architecture.md) — database, auth, middleware, deployment decisions
- [Data API](./doc/data_api.md) — endpoint reference with request/response shapes
- [Phase Flow](./doc/phase_flow.md) — build order and phases
- [Schema](./doc/schema.md) — Prisma schema reference