Use these tables to navigate the WalletOS monorepo.

### Development CLI

| Task | Command | Result |
| :--- | :--- | :--- |
| **Start Server** | `npx nx serve api` | Launches the backend on port 3333. |
| **Sync Database** | `npx nx db-push api` | Pushes Prisma schema changes to your local DB. |
| **View Data** | `npx nx db-studio api` | Opens the Prisma Studio GUI in your browser. |
| **Run All Tests** | `npx nx run-many -t test` | Executes tests across all apps and libs. |

### Testing Environment

You run these commands to verify logic without altering your development data.

| Action | Command | Note |
| :--- | :--- | :--- |
| **API Test Suite** | `npx dotenv-cli -e .env.test -- npx nx test api --runInBand` | Use `runInBand` to prevent WSL port conflicts. |
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
