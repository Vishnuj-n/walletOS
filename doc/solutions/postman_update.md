# Walkthrough - Postman Collection & Documentation Update for Webhooks and Scopes

Updated the Postman collection and the developer guide to support testing of webhook administration and granular API key scopes (read_only, read_write, admin).

## Changes Made

### Postman Collection

#### [MODIFY] [WalletOS_API_Tests.postman_collection.json](file:///c:/Users/vishn/PROJECT/walletOS/walletOS/apps/api/postman/WalletOS_API_Tests.postman_collection.json)
- Added new variables: `webhookId`, `readOnlyApiKey`, `readWriteApiKey`.
- Appended Webhook CRUD requests under **Admin Operations**:
  - **Create Webhook** (`POST /api/v1/admin/webhooks`): Creates a webhook and sets the `webhookId` collection variable.
  - **List Webhooks** (`GET /api/v1/admin/webhooks`): Lists all webhooks.
  - **Test Webhook** (`POST /api/v1/admin/webhooks/{{webhookId}}/test`): Dispatches a test payload.
  - **Delete Webhook** (`DELETE /api/v1/admin/webhooks/{{webhookId}}`): Deactivates/soft-deletes the webhook.
- Added **API Key Scope Tests** under **Test Scenarios**:
  - **Read-Only: Get Wallet (Succeed)**
  - **Read-Only: Try Create Wallet (Fail 403)**
  - **Read-Write: Create Wallet (Succeed)**
  - **Read-Write: Try Delete Wallet (Fail 403)**

### Developer Documentation

#### [MODIFY] [POSTMAN.md](file:///c:/Users/vishn/PROJECT/walletOS/walletOS/doc/POSTMAN.md)
- Added a section on **Granular API Key Scope Testing** showing how to generate keys with `read_only` and `read_write` scopes and run the scope tests in Postman.
- Added a section on **Webhook Operations** documenting how to configure variables and test webhook CRUD operations.

---

## Verification Results

### Automated Tests
Ran the NX test suites for the API application:
```bash
npx nx test api
```
**Results**:
- 12 Test Suites passed (121 tests total), including `sprint7.test.ts`, `admin.test.ts`, and `userSessionAuth.test.ts`.

### JSON Validation
Ran JSON parser check to guarantee Postman collection format remains valid:
```bash
node -e "JSON.parse(require('fs').readFileSync('apps/api/postman/WalletOS_API_Tests.postman_collection.json', 'utf8')); console.log('JSON is valid!')"
```
**Results**:
- JSON format is fully valid.
