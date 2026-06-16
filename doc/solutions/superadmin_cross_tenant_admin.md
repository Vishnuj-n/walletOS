# Walkthrough - Superadmin Cross-Tenant Wallet Management

Implemented cross-tenant access controls for users with the `superadmin` role, allowing them to view and manage wallets belonging to any tenant.

## Changes Made

### 1. Helper function in Backend API Routes
* Added `resolveWalletAndTenantScope` in [admin.routes.ts](file:///c:/Users/vishn/PROJECT/walletOS/walletOS/apps/api/src/routes/admin.routes.ts#L239-L268):
  * Locates the wallet by ID/publicId.
  * If the user is a `superadmin`, skips the tenant-scoped query limitation. Otherwise, enforces the session admin's `tenantId`.
  * Returns the wallet details and its resolved owner `tenantId`.

### 2. Route Refactoring
Refactored administrative routes to use the new helper, ensuring that the target wallet's actual `tenantId` is used for auditing, idempotency checks, and database modifications:
* `GET /admin/wallets/:walletId`
* `PATCH /admin/wallets/:walletId`
* `DELETE /admin/wallets/:walletId`
* `POST /admin/wallets/:walletId/freeze`
* `POST /admin/wallets/:walletId/unfreeze`
* `POST /admin/transactions/credit`
* `POST /admin/transactions/debit`

### 3. Integration Tests
* Added a new test suite (`Superadmin Cross-Tenant Wallet Operations`) in [admin.test.ts](file:///c:/Users/vishn/PROJECT/walletOS/walletOS/apps/api/src/__tests__/admin.test.ts#L1291-L1453) to verify that:
  * Superadmin users can successfully query and modify wallets belonging to a different tenant.
  * Regular/support users are blocked (receiving `404 Not Found` or `403 Forbidden`).

## Validation Results

* Ran tests via `npx nx test api` successfully:
  * **126/126 tests passed** including the new cross-tenant integration test cases.
