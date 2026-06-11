Use these tables to navigate the WalletOS monorepo.

### Development CLI

| Task | Command | Result |
| :--- | :--- | :--- |
| **Start API Server** | `npx nx serve api` | Launches the backend on port 3333. |
| **Start Admin Dashboard** | `npx nx dev admin` | Launches the admin dashboard on port 3000. |
| **Sync Database** | `npx nx db-push api` | Pushes Prisma schema changes to your local DB. |
| **Generate Prisma Client** | `npx nx prisma generate api` | Generates TypeScript types from Prisma schema. |
| **Run Prisma Migrations** | `npx nx prisma migrate dev api` | Creates and applies database migrations. |
| **View Data** | `npx nx db-studio api` | Opens the Prisma Studio GUI in your browser. |
| **Run All Tests** | `npx nx run-many -t test` | Executes tests across all apps and libs. |

### Testing Environment

You run these commands to verify logic without altering your development data.

| Action | Command | Note |
| :--- | :--- | :--- |
| **Admin Test Suite** | `npx nx test admin` | Runs Jest + React Testing Library specs for the admin dashboard. |
| **API Test Suite** | `npx nx test api -- --runInBand` | Use `runInBand` to prevent WSL port conflicts. |
| **Schema Sync** | `npx nx db-push api --configuration=test` | Targets the test database specifically. |
| **Generate Key** | `npx dotenv-cli -e .env.test -- npx ts-node apps/api/src/scripts/generate-key.ts` | Creates a valid API key for your test headers. |



### Architectural Constraints

These rules prevent financial loss and data corruption.

| Rule | Requirement | Purpose |
| :--- | :--- | :--- |
| **Pessimistic Locking** | `SELECT FOR UPDATE` | Prevents double-spending during balance updates. |
| **Idempotency** | `Idempotency-Key` header | Ensures duplicate requests do not create duplicate transactions. |
| **Immutability** | No updates/deletes on `AuditLog` | Maintains a permanent record of all state changes. |
| **Transaction Safety** | `{ timeout: 30000 }` | Prevents database hangs during heavy load. |

### Manual Verification

Follow this order to test the API in Postman.

| Step | Resource | Action |
| :--- | :--- | :--- |
| **1. Import** | `apps/api/postman/...` | Load the collection into your workspace. |
| **2. Auth** | `apiKey` variable | Use the key from your generation script. |
| **3. Seed** | POST `/wallets` | Run this first to set the `walletId` for other tests. |

The core ledger and concurrency logic are stable. You will build the admin dashboard in `apps/admin` next.

### Wallet Embed Integration (iframe Pattern)

The wallet UI (`apps/web`) is designed to be embedded in third-party applications using iframe embeds with secure session tokens.

#### Architecture

- **Token-Scoped Security:** Session tokens (`sess_...`) are cryptographically linked to a specific wallet at creation time. Clients cannot modify which wallet they access.
- **Zero Front-End State Overhead:** The consuming application's backend creates a session token and passes it to the embed. The embed uses only the token to authenticate.
- **Opaque Token Pattern:** The frontend only needs the `token` parameter. The backend resolves the wallet ID and profile from the token scope.

#### Implementation Steps

**Step 1: Create a Session Token (Server-Side)**

Your consuming app's backend calls:

```bash
POST /api/v1/auth/session
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "wallet_id": "wallet_12345"
}
```

**Response:**

```json
{
  "token": "sess_xxx",
  "expires_at": "2026-05-19T11:30:00.000Z",
  "wallet": {
    "id": "wallet_12345",
    "external_user_id": "user_zomato_5678",
    "label": "Zomato Credits",
    "balance": "125.5000",
    "currency": "INR",
    "status": "active",
    "is_sandbox": false,
    "metadata": {}
  }
}
```

**Step 2: Pass Token to iframe**

Your consuming app renders the embed with **only the token**:

```html
<iframe 
  src="https://wallet.yourapp.com/?token=sess_b0ac548cd56140be3da75f045e7358cbbb4843c90912db50ab35d377e8e8e6ce"
  width="100%"
  height="600"
/>
```

**Step 3: Embedded App Loads (iframe)**

The embedded wallet app:
1. Extracts the token from the URL: `?token=sess_...`
2. Validates the token format (`sess_` prefix)
3. Calls `GET /api/v1/auth/session/profile` with the token
4. Backend returns the wallet profile (ID, balance, label, etc.)
5. UI renders the wallet, ledger, and transaction details

#### Error Handling

| Error | Meaning | Action |
| :--- | :--- | :--- |
| Missing `token` | No session provided | Embed shows: "Pass `token=sess_...` to load this wallet embed." |
| Invalid format | Token doesn't start with `sess_` | Embed shows: "Invalid session token format." |
| Token expired | Session beyond `expires_at` | Embed shows: "Session expired. Request a new token." |
| Wallet not found | Backend cannot resolve wallet | Embed shows: "Unable to load wallet." |

#### Security Notes

- Session tokens expire after **1 hour** by default.
- Each token is scoped to a single wallet; accessing other wallets returns `403 Forbidden`.
- Tokens are hashed in the database; raw tokens are never stored.
- The consuming app's API key controls which wallets can create tokens.
- Use HTTPS in production to protect tokens in transit.

### Creating a Superadmin User (Supabase Remote)

Use magic links or the Supabase dashboard for secure account creation. Direct SQL insertion is not recommended for production use.

#### 1) Insert user record (auth schema)

```sql
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password,
  raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at
) VALUES (
  '<UUID>', 'authenticated', 'authenticated',
  'admin@example.com', '', '{}',
  '{"tenantId":"your-tenant-id"}', now(), now()
);
```

Replace:
- `<UUID>`: a valid UUID (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- `admin@example.com`: your admin email
- `your-tenant-id`: the tenant ID (e.g., `default`)

Note: For production, use Supabase dashboard or magic links to create users securely.

#### 2) Mark email as confirmed (optional)

```sql
UPDATE auth.users
SET email_confirmed_at = now()
```

#### 3) Create the AdminUser record (app database)

```sql
INSERT INTO "AdminUser"
  ("id", "tenantId", "supabaseUid", "email", "role", "isActive")
VALUES
  ('<cuid-or-uuid>', 'your-tenant-id', '<UUID>', 'admin@example.com', 'superadmin', true);
```

**Valid roles:** `support`, `finance`, `tenant_admin`, `superadmin`

Replace:
- `<cuid-or-uuid>`: a unique identifier (CUID or UUID)
- `your-tenant-id`: same tenant ID as above
- `<UUID>`: the **same UUID** used in step 1
- `admin@example.com`: same email

**Important**: The `supabaseUid` must match the `id` you created in the Supabase auth user (step 1), otherwise authentication will fail.

#### Recommended: Use Supabase Dashboard instead

For production, prefer:
1. **Supabase Dashboard** → Auth → Create user manually
2. Add `tenantId` to `app_metadata` via the dashboard
3. Run step 3 above to link the app DB record
