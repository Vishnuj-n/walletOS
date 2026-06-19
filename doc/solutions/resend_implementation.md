# Walkthrough - Resend HTTP API support

Added capability to send transaction/invite emails via Resend HTTP API instead of SMTP based on the `GLOBAL_SMTP` environment flag.

## Changes Made

### 1. Backend Service
- [mail.service.ts](../../apps/api/src/services/mail.service.ts):
  - Imported `Resend` client.
  - Dynamically evaluates `GLOBAL_SMTP` flag.
  - Instantiates and caches Resend client when `GLOBAL_SMTP === 'false'`.
  - Added sending logic via `Resend` HTTP API inside `sendInviteEmail`.
  - Updated `verifyGlobalSmtpHealth` to output Resend config health if SMTP is disabled.

### 2. Environment Configurations
- [.env.example](../../.env.example):
  - Documented `GLOBAL_SMTP="true" | "false"` toggles.
  - Added placeholders for `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.

### 3. Tests
- Created [mail.service.test.ts](../../apps/api/src/__tests__/mail.service.test.ts) to verify correct branching for SMTP vs. Resend configurations.

## Verification

### Automated Tests
- Ran backend api tests:
  ```bash
  npm run test:api
  ```
  All 14 test suites passed.
- Ran linter:
  ```bash
  npx nx run-many -t lint
  ```
- Checked builds:
  ```bash
  npx nx build api
  ```
