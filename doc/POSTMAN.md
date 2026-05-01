# WalletOS Postman Guide (REST API Tests)

This repo includes a ready-to-run Postman collection for **manual regression testing** of the WalletOS API.

- **Postman collection**: `apps/api/postman/WalletOS_API_Tests.postman_collection.json`
- **Existing notes**: `apps/api/postman/README.md`

This document expands those notes with **step-by-step setup** for:

- **Basic** (API-key tenant usage)
- **Superadmin/Admin** (Supabase JWT-protected admin APIs)

---

## Prerequisites

- **API running**:

```bash
npx nx serve api
```

- **Env configured** (required for admin auth middleware):
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

See `doc/ENV_SETUP_GUIDE.md`.

---

## Import the collection

1. Open Postman.
2. Click **Import**.
3. Import `apps/api/postman/WalletOS_API_Tests.postman_collection.json`.

---

## Create a Postman Environment (recommended)

Create a Postman environment called something like `WalletOS Local` and add these variables.

### Required variables (basic + admin)

- **`baseUrl`**: `http://localhost:3333`
- **`apiKey`**: set this after you generate it (next section)

### Variables used by the collection

These are auto-populated by test scripts after certain requests run:

- **`walletId`**
- **`externalUserId`**
- **`transactionId`**

These you may need to set manually:

- **`targetWalletId`**: another wallet id (for transfer tests)

---

## Basic flow: run REST API tests with `x-api-key`

### 1) Generate an API key (test tenant)

From repo root:

```bash
npx dotenv-cli -e .env.test -- npx ts-node apps/api/src/scripts/generate-key.ts
```

Copy the **plain API key** from the output.

### 2) Set Postman variables

In your Postman environment:

- Set **`apiKey`** = the key you copied
- Confirm **`baseUrl`** = `http://localhost:3333`

### 3) Run the collection in the right order

In the imported collection (`WalletOS API Tests`), run in this order:

- **Wallet Operations**
  - **Create Wallet** (this sets `walletId` + `externalUserId`)
  - Get/Update/Freeze/Unfreeze/Close as needed

- **Transaction Operations**
  - **Credit Wallet** (funds wallet and sets `transactionId`)
  - Debit / Transfer / Reverse / Get Transaction / List Transactions

- **Test Scenarios**
  - Run any scenario folders you want (they are designed to pass/fail intentionally as described by their names)

### 4) Idempotency headers (important)

For these endpoints, the API requires an `Idempotency-Key` header:

- All `/api/v1/transactions/*` write endpoints (credit/debit/transfer/reverse)
- Several wallet mutation endpoints (freeze/unfreeze/close/update)

The collection already sends an `Idempotency-Key` for most transaction requests. If you manually create requests, add:

- `Idempotency-Key: <unique value>`

---

## “Basic user session” flow: use a session token (Bearer `sess_…`)

Wallet “read” endpoints support **either**:

- `x-api-key: ...` (tenant access), or
- `Authorization: Bearer sess_...` (wallet-scoped session token)

### Steps

1. Run **Wallet Operations → Create Wallet** (sets `walletId`).
2. Run **Authentication → Create Session Token**.
3. Copy the returned `token` (it begins with `sess_`).
4. Use it in requests as:
   - `Authorization: Bearer <sess_token>`

Notes:
- A session token is valid only for the single wallet encoded in its scope.
- Session tokens expire (see `expires_at` in the response).

---

## Admin/Superadmin flow: run admin APIs (Supabase JWT)

### Critical difference vs basic flow

Admin endpoints under `/api/v1/admin/*` are protected by `adminAuthMiddleware` and require:

- **`Authorization: Bearer <supabase access token (JWT)>`**

They do **not** authenticate with `x-api-key`.

Also, admin endpoints support an optional sandbox toggle:

- `X-Sandbox: true` (sandbox mode)
- `X-Sandbox: false` (live mode)

### Important: the collection’s “Admin Login” request is outdated

The Postman collection currently contains a request named **“Admin Login”** calling `POST /api/v1/admin/login`, but there is **no** such route in `apps/api/src`.

Use one of the JWT methods below instead, then set the admin Authorization header in Postman.

---

## Get an admin JWT (2 options)

### Option A (recommended): login via the Admin UI and copy the token

1. Start the admin app:

```bash
npx nx serve admin
```

2. Login in the browser with your Supabase admin user.
3. Open browser devtools → **Application/Storage** and find Supabase auth session.
4. Copy the **access token** (JWT).

In Postman, set:

- `adminJwt` = that access token

### Option B: login directly to Supabase Auth from Postman

You can obtain an access token via Supabase Auth using the project URL + anon key.

1. In Postman environment, add:
   - `supabaseUrl` = your Supabase project URL (example: `https://xxxxx.supabase.co`)
   - `supabaseAnonKey` = your **anon** key (not service role)
   - `adminEmail` and `adminPassword` = your admin user credentials

2. Create a Postman request:
   - **POST** `{{supabaseUrl}}/auth/v1/token?grant_type=password`
   - Headers:
     - `apikey: {{supabaseAnonKey}}`
     - `Content-Type: application/json`
   - Body (raw JSON):

```json
{
  "email": "{{adminEmail}}",
  "password": "{{adminPassword}}"
}
```

3. Send it and copy `access_token` into:
   - `adminJwt`

Security note: never use `SUPABASE_SERVICE_ROLE_KEY` in Postman for login; keep it server-side only.

---

## Configure Postman for Admin Operations (support/finance/superadmin)

### 1) Add `adminJwt` to your environment

Create environment variable:

- **`adminJwt`**: `<paste JWT here>`

### 2) Apply Authorization to admin requests

For every request under **Admin Operations**, ensure it sends:

- `Authorization: Bearer {{adminJwt}}`

Fastest way in Postman:

- Click the **Admin Operations** folder → **Authorization** tab
- Type: **Bearer Token**
- Token: `{{adminJwt}}`
- Save

### 3) Add `X-Sandbox` when needed

If you want sandbox-mode admin operations:

- Add header: `X-Sandbox: true`

If you omit it, it defaults to live-mode behavior.

---

## What “superadmin tasks” mean in WalletOS

Roles are enforced by `requireAdminRole()` with this hierarchy:

- `support` < `finance` < `superadmin`

Examples from `apps/api/src/routes/admin.routes.ts`:

- **Support**:
  - Create/update/close wallets (within your tenant)
  - Freeze/unfreeze wallets
  - List/get wallets

- **Finance**:
  - Admin credit/debit adjustments (requires `reason`)
  - Admin reversal (requires `reason`)

- **Superadmin**:
  - Create new tenants: `POST /api/v1/admin/tenants`
  - List all tenants: `GET /api/v1/admin/tenants`
  - Cross-tenant wallet creation is allowed only for superadmins (by passing `tenant_id`)

### Superadmin: create a tenant (example)

Request:

- **POST** `{{baseUrl}}/api/v1/admin/tenants`
- Headers:
  - `Authorization: Bearer {{adminJwt}}`
  - `Idempotency-Key: tenant_create_{{$timestamp}}`
  - (optional) `X-Sandbox: true`
- Body (raw JSON):

```json
{
  "name": "Acme Inc",
  "contact_email": "ops@acme.com",
  "config": {}
}
```

Response includes `live_key` and `test_key` for that tenant.

---

## Running everything (Postman Runner)

To run the whole suite:

1. Open the collection in Postman.
2. Click **Run collection**.
3. Select your environment (`WalletOS Local`).
4. Recommended order:
   - Run **Wallet Operations**
   - Then **Transaction Operations**
   - Then **Test Scenarios**
5. For admin testing:
   - Set `adminJwt` first
   - Then run **Admin Operations** requests/folder

Troubleshooting tips:

- **401 on basic endpoints**: check `apiKey` and that API server is running.
- **401 on admin endpoints**: missing/expired `adminJwt`, or Supabase user missing `app_metadata.tenantId`.
- **403 on admin endpoints**: your admin role isn’t high enough for that action.
- **409 idempotency conflict**: you reused the same `Idempotency-Key` with different request body.

