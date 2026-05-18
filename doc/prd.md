**WalletOS**

Product Requirements Document

_Standalone Wallet Management Service - Web App_

| **Version** | 1.0 - Initial Release                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| **Status**  | Draft - Awaiting Review                                                                |
| **Date**    | June 2025                                                                              |
| **Scope**   | Phase 1 - Core wallet CRUD. Web app (desktop + mobile responsive). No payment gateway. |

**1\. Executive Summary**

WalletOS is a standalone, API-first wallet management service designed to be embedded into any project as a plug-in module - similar to how projects integrate third-party services like Stripe or Firebase Auth. Any product team can integrate WalletOS to provide wallet functionality to their users without building balance management, transaction history, audit trails, or admin tooling from scratch.

This PRD covers Phase 1 only: core wallet CRUD operations, transaction management, a user-facing wallet UI, and an admin dashboard. Payment gateway integration (Razorpay, Stripe, UPI) is explicitly out of scope for Phase 1 and will be addressed in Phase 2.

| **Goal** | Build once, integrate everywhere. Every consuming project gets a production-grade wallet without writing a single line of balance logic. |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |

**2\. Problem Statement**

Every product that needs wallet functionality (cashback wallets, in-app credits, loyalty points, driver earnings, referral rewards) ends up re-building the same core logic: balance tracking, transaction history, idempotency handling, audit logs, and admin tooling. This is wasteful, inconsistent, and error-prone.

### **Pain points today**

- Teams build wallet logic ad hoc - no standards, no audit trail, high bug rate.
- Balance inconsistencies due to race conditions (no proper locking).
- No reusable admin UI - support teams cannot view or adjust wallets without database access.
- No multi-tenant isolation - one project's wallet logic bleeds into another.
- Duplicate development effort across teams for the same solved problem.

**3\. Goals & Non-Goals**

## **3.1 Goals**

- Deliver a standalone REST API service that any project can integrate via API key.
- Provide complete wallet lifecycle management: create, read, update, freeze, close.
- Provide a robust transaction engine with credit, debit, reversal, and history.
- Ship a white-label user-facing wallet web UI (React component library or embeddable iframe). Desktop and tablet optimised; mobile responsive.
- Ship an admin dashboard for support and operations teams.
- Ensure financial-grade data integrity: idempotency, double-entry ledger, row-level locking.
- Multi-tenant isolation: each consuming project is fully sandboxed.

## **3.2 Non-Goals (this scope)**

- Payment gateway integration (Razorpay, Stripe, UPI, NEFT) - not in this scope.
- KYC / AML compliance workflows - not in this scope.
- Multi-currency and FX conversion - not in this scope.
- Crypto / Web3 wallet support - not in this scope.
- Native mobile apps (iOS / Android) - not in this scope.

| **Note** | Wallets are funded via direct API calls only in this scope (e.g. admin manually credits). Real money movement via payment rails is a future addition. |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |

**4\. Personas & Stakeholders**

| **Persona**         | **Who**                            | **What they need**                                                                     |
| ------------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| **End User**        | Customer of the consuming project  | View balance, transaction history, receive/spend credits. Clean, mobile-friendly UI.   |
| **Developer**       | Engineer integrating WalletOS      | Simple REST API, clear docs, SDK client, sandbox environment, webhooks.                |
| **Support Agent**   | Customer support / ops team        | View any user's wallet, add/deduct credits with reason, freeze wallet, view audit log. |
| **Admin / Finance** | Product owner or finance team      | Aggregate reports, total balances outstanding, bulk operations, tenant config.         |
| **System / API**    | Automated services calling the API | Credit on order completion, debit on checkout, idempotent calls, webhook delivery.     |

**5\. Feature Breakdown**

Every feature is tagged by priority: P0 = must-have for launch, P1 = required before GA, P2 = important but deferrable.

## **5.1 Wallet Management (Core)**

The fundamental wallet entity. A wallet belongs to a user (identified by an external user ID from the consuming project) and holds a balance in a single currency. In Phase 1, one user can have exactly one wallet per tenant.

| **Feature**                      | **Description**                                                                                                                                                                                               | **Priority** | **API** |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------- |
| **Create wallet**                | Provision a new wallet for a user. Accepts: external_user_id, currency (default INR), label (e.g. "Cashback Wallet"), metadata (custom JSON). Returns wallet_id, balance (0.00), status (active), created_at. | **P0**       | POST    |
| **Get wallet by ID**             | Fetch wallet details including current balance, status, currency, metadata, created_at, updated_at. Used by the UI to render the wallet card.                                                                 | **P0**       | GET     |
| **Get wallet by user**           | Fetch wallet for a given external_user_id within the tenant. Convenient lookup - callers don't need to store wallet_id if they have user_id.                                                                  | **P0**       | GET     |
| **Update wallet label/metadata** | Allow updating the human-readable label and custom metadata fields. Balance and status cannot be changed via this endpoint.                                                                                   | **P1**       | PATCH   |
| **Freeze wallet**                | Set status to "frozen". Frozen wallets reject all credit and debit operations. Reason field (string) is required. Reversible via unfreeze.                                                                    | **P0**       | POST    |
| **Unfreeze wallet**              | Restore status to "active". Requires reason. Creates an audit log entry.                                                                                                                                      | **P0**       | POST    |
| **Close wallet**                 | Permanently close a wallet. Only allowed when balance is 0.00. Irreversible. Emits wallet.closed event.                                                                                                       | **P1**       | POST    |
| **List wallets (admin)**         | Paginated list of all wallets for a tenant. Supports filtering by status, currency, date range. For admin dashboard.                                                                                          | **P1**       | GET     |

## **5.2 Transaction Engine**

Every money movement is a Transaction. Transactions are immutable once created - you cannot edit or delete a transaction. Corrections are made by creating reversal transactions. This is the core financial integrity rule.

| **Rule** | Transactions are append-only. Once committed, a transaction record is never modified or deleted. All corrections go through reversals. |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |

| **Feature**                    | **Description**                                                                                                                                                                                    | **Priority** | **API**  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------- |
| **Credit wallet**              | Add funds to a wallet. Required fields: wallet_id, amount (positive), description, idempotency_key. Optional: reference_id (e.g. order_id), metadata. Returns transaction record.                  | **P0**       | POST     |
| **Debit wallet**               | Deduct funds from a wallet. Same fields as credit. Returns 422 if balance is insufficient. Returns 409 if wallet is frozen. Atomic with balance update.                                            | **P0**       | POST     |
| **Transfer between wallets**   | Move funds from one wallet to another within the same tenant. Creates two transaction records (debit + credit) in a single atomic operation. Both succeed or both fail.                            | **P1**       | POST     |
| **Reverse transaction**        | Create a reversal for a previous credit or debit. Accepts: original_transaction_id, reason. Creates a new transaction of the opposite type with a link to the original. Cannot reverse a reversal. | **P0**       | POST     |
| **Get transaction**            | Fetch a single transaction by ID. Returns full detail including linked transactions (e.g. the original for a reversal).                                                                            | **P0**       | GET      |
| **List transactions**          | Paginated transaction history for a wallet. Filters: type (credit/debit/reversal), date range, min/max amount, reference_id. Sorted by created_at DESC.                                            | **P0**       | GET      |
| **Idempotency**                | All write operations accept an idempotency_key header. If a key is reused within 24 hours, the original response is returned without re-executing. Prevents double-credit on retries.              | **P0**       | Header   |
| **Balance lock (concurrency)** | Wallet row is locked using SELECT FOR UPDATE inside a database transaction before any debit. Prevents race conditions when two requests debit simultaneously.                                      | **P0**       | Internal |

## **5.3 Multi-Tenancy & API Keys**

Each consuming project is a Tenant. Tenants are fully isolated - a wallet created under Tenant A cannot be accessed by Tenant B's API key, even if they accidentally use the same external_user_id.

| **Feature**             | **Description**                                                                                                                                                           | **Priority** |     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --- |
| **Create tenant**       | Register a new project as a tenant. Generates a tenant_id, live API key (wlt_live_xxx) and test API key (wlt_test_xxx). Admin-only operation.                             | **P0**       |     |
| **API key auth**        | All API requests require Authorization: Bearer wlt_live_xxx. Keys are hashed in the database (never stored in plain text). Every request resolves tenant_id from the key. | **P0**       |     |
| **Scoped keys**         | API keys have scopes: read_only \| read_write \| admin. A read_only key can only call GET endpoints. An admin key can freeze, close, and list all wallets.                | **P1**       |     |
| **Rotate API key**      | Revoke and regenerate an API key. Old key becomes invalid after a 10-minute grace period (to allow in-flight requests to complete).                                       | **P1**       |     |
| **Sandbox environment** | test keys use a separate data namespace. Data from sandbox never mixes with live data. Sandbox transactions are not real.                                                 | **P0**       |     |
| **Tenant config**       | Per-tenant settings: default currency, wallet auto-create on first use (boolean), transaction description max length, metadata schema validation (optional).              | **P1**       |     |

## **5.4 Audit Log**

Every action that changes data is recorded in an immutable audit log. This is the source of truth for "what happened and who did it." Audit records are never deleted.

| **Feature**                | **Description**                                                                                                                                                   | **Priority** |     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --- |
| **Automatic log on write** | Every wallet create/update/freeze/close and every transaction automatically creates an audit log entry. No opt-out.                                               | **P0**       |     |
| **Actor attribution**      | Each audit entry records who performed the action: API key ID (for programmatic), admin user email (for dashboard actions), or "system" for automated operations. | **P0**       |     |
| **Query audit log**        | Admins can query the audit log by wallet_id, actor, action type, and date range. Paginated. Read-only endpoint.                                                   | **P1**       |     |
| **Audit log immutability** | Audit records have no UPDATE or DELETE path in the application. DB-level: no DELETE privilege for the application DB user on the audit_logs table.                | **P0**       |     |

## **5.5 Webhooks & Events**

Consuming projects register webhook URLs to receive real-time notifications when wallet events occur. This allows the consuming project to react (e.g. show a push notification to the user, update their own database) without polling.

| **Event**              | **Triggered when**                                                 |
| ---------------------- | ------------------------------------------------------------------ |
| **wallet.created**     | A new wallet is provisioned.                                       |
| **wallet.credited**    | A credit transaction is committed.                                 |
| **wallet.debited**     | A debit transaction is committed.                                  |
| **wallet.reversed**    | A transaction is reversed.                                         |
| **wallet.frozen**      | A wallet is frozen.                                                |
| **wallet.unfrozen**    | A wallet is unfrozen.                                              |
| **wallet.closed**      | A wallet is permanently closed.                                    |
| **wallet.low_balance** | Balance falls below a configurable threshold (per-tenant setting). |

### **Webhook delivery**

- Payloads are signed with HMAC-SHA256 using a per-tenant webhook secret. Consuming projects verify the signature before processing.
- Delivery retried up to 5 times with exponential backoff (10s, 30s, 2m, 10m, 1h) on non-2xx responses.
- Webhook delivery log is accessible via the admin dashboard, showing status, attempt count, and response code per delivery.

**6\. User-Facing UI**

WalletOS ships a ready-to-use web frontend that consuming projects can embed. This removes the need for consuming projects to build their own wallet UI. The primary experience is a desktop web application - fully responsive down to tablet and mobile browser widths. Two integration modes:

- Embeddable iframe - drop a single script tag + div into any web page, point it at the WalletOS CDN with a session token, and get the full wallet UI rendered inside your page.
- React component library - npm install @walletOS/ui and use &lt;WalletCard /&gt;, &lt;TransactionHistory /&gt;, &lt;WalletSummary /&gt; directly in your React web app.

## **6.1 Wallet Dashboard Page**

The main view a user sees. Displays their wallet balance prominently, status indicator, and a summary of recent transactions.

| **Component**                | **Content & Behaviour**                                                                                                                                                                                              | **Priority** |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --- |
| **Balance card**             | Large display of current balance (e.g. ₹1,250.00), currency, wallet label, and status badge (Active / Frozen / Closed). Refreshes on mount and after any action.                                                     | **P0**       |     |
| **Status banner**            | If wallet is frozen, show a prominent orange banner explaining it is frozen and to contact support. All action buttons are disabled. If closed, show a gray "closed" banner.                                         | **P0**       |     |
| **Quick stats**              | Three tiles below the balance card: Total earned (sum of all credits), Total spent (sum of all debits), Transactions this month (count).                                                                             | **P1**       |     |
| **Transaction history list** | Paginated list of transactions. Each row: icon (credit = green arrow up, debit = red arrow down, reversal = gray rotate), description, date, and amount with sign (+ or -). Clicking a row opens transaction detail. | **P0**       |     |
| **Transaction filters**      | Filter bar above the list: All \| Credits \| Debits \| Reversals. Date range picker. Search by description or reference_id.                                                                                          | **P1**       |     |
| **Transaction detail sheet** | Slide-up panel or modal showing: transaction_id, type, amount, description, reference_id, created_at, balance_before, balance_after, and metadata (collapsed by default).                                            | **P1**       |     |
| **Empty state**              | When wallet has no transactions, show an illustration and copy: "No transactions yet. Credits and spending will appear here."                                                                                        | **P1**       |     |
| **Loading & error states**   | Skeleton loaders on data fetch. Error states with retry button. If API returns 503, show "Service temporarily unavailable" with support link.                                                                        | **P1**       |     |

## **6.2 UI Design Principles**

- Web-first, fully responsive. Designed for desktop browsers as the primary experience. Fully responsive and usable on tablets and mobile browsers - minimum supported width is 360px.
- Desktop layout uses a two-column or sidebar layout where space allows (e.g. balance summary on the left, transaction list on the right). On smaller screens it collapses to a single column.
- Themeable. Consuming project can pass a theme object (primary color, font, border radius) to match their brand.
- Accessible. WCAG 2.1 AA. All interactive elements keyboard navigable. Screen reader labels on icons.
- Optimistic UI. Show balance update immediately on action success; revert if API returns an error.
- No wallet modification by the user. End users can only view. They cannot credit, debit, or freeze their own wallet - those are controlled by the consuming project's backend.
- Desktop layout: two-column where space allows - balance summary panel on the left, transaction list on the right. Collapses to single column below 768px.

## **6.3 Authentication for the UI**

The consuming project generates a short-lived User Session Token by calling the WalletOS API server-to-server. This token is scoped to a single wallet_id and expires in 1 hour. The frontend receives this token and uses it to authenticate all UI API calls.

| **Security** | The live API key is never sent to the browser. Only the short-lived session token (scoped, read-only for the UI) is sent to the frontend. |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |

**7\. Admin Dashboard**

A full-featured web dashboard for support agents, operations staff, and product admins. Hosted at admin.walletOS.io (or self-hosted). Requires admin credentials, separate from API keys.

## **7.1 Wallet Search & Detail**

| **Screen / Feature**   | **Detail**                                                                                                                                                                          | **Priority** |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --- |
| **Global search**      | Search by wallet_id, external_user_id, or reference_id. Instant results (debounced, 300ms). Works across all wallets in the tenant.                                                 | **P0**       |     |
| **Wallet list page**   | Paginated table of all wallets. Columns: wallet_id (truncated), external_user_id, label, balance, currency, status, created_at. Filterable by status. Sortable by balance and date. | **P0**       |     |
| **Wallet detail page** | Full wallet record. Shows all fields, current balance, status. Two tabs: Transactions (same list as user UI, full detail) and Audit Log (all events on this wallet).                | **P0**       |     |
| **Transaction detail** | All transaction fields including internal ones (idempotency_key, balance_before/after, created_by, IP address, linked reversal if any).                                             | **P0**       |     |

## **7.2 Admin Actions**

| **Action**                   | **Detail**                                                                                                                                                                                            | **Priority** |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --- |
| **Manual credit**            | Credit a wallet directly from the admin dashboard. Fields: amount, description (required), internal_note (not shown to user). Confirmation dialog. Creates transaction with created_by = admin:email. | **P0**       |     |
| **Manual debit**             | Same as credit but debit. Shows warning if balance is insufficient. Requires a reason from a dropdown (e.g. "Correction", "Fraud reversal", "System error").                                          | **P0**       |     |
| **Reverse transaction**      | Select any transaction and create a reversal. Confirmation dialog shows the original transaction summary and new balance after reversal. Requires reason.                                             | **P0**       |     |
| **Freeze / Unfreeze wallet** | Toggle wallet status with a mandatory reason field. Confirmation dialog. Immediately reflected in user UI (frozen banner).                                                                            | **P0**       |     |
| **Close wallet**             | Available only when balance = 0.00. Two-step confirmation. Shows warning that this is irreversible.                                                                                                   | **P1**       |     |
| **View audit log**           | Full audit log for a wallet or for the entire tenant. Filters: actor, action type, date range. Non-paginated export as CSV.                                                                           | **P1**       |     |
| **Impersonation view**       | "View as user" - see the user-facing wallet UI exactly as the end user would see it. Read-only. Useful for support calls.                                                                             | **P2**       |     |

## **7.3 Reports & Analytics**

| **Report**                   | **Detail**                                                                                                                                                     | **Priority** |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --- |
| **Summary dashboard**        | Home page of admin: total wallets, total outstanding balance, transactions today/this week/this month, top wallets by balance. Auto-refreshes every 5 minutes. | **P1**       |     |
| **Transaction volume chart** | Daily bar chart of credit vs debit volume over the last 30 days. Selectable date range.                                                                        | **P1**       |     |
| **Balance distribution**     | Histogram or table showing how many wallets fall in each balance bucket (₹0, ₹1-100, ₹101-1000, ₹1000+). Useful for understanding liability.                   | **P2**       |     |
| **Export transactions**      | Download all transactions for a date range as CSV. Fields: transaction_id, wallet_id, external_user_id, type, amount, description, reference_id, created_at.   | **P1**       |     |

## **7.4 Tenant Settings**

| **Setting**               | **Detail**                                                                                                                                                          | **Priority** |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --- |
| **API keys management**   | View all API keys (name, scope, last used, created date). Create new keys with name and scope. Revoke any key. Copy key value only on creation (never shown again). | **P0**       |     |
| **Webhook endpoints**     | Register, update, and delete webhook URLs. Select which events to receive. Test webhook (sends a sample payload). View delivery logs per endpoint.                  | **P1**       |     |
| **Tenant profile**        | Edit project name, contact email, support URL (used in user-facing error messages).                                                                                 | **P1**       |     |
| **Low balance threshold** | Set the balance threshold that triggers a wallet.low_balance webhook (per tenant, with a per-wallet override).                                                      | **P2**       |     |

**8\. API Design Principles**

## **8.1 Base URL & versioning**

All API endpoints are versioned. The base URL is: <https://api.walletOS.io/v1/>

When breaking changes are needed, /v2/ is released. /v1/ remains supported for a minimum of 12 months after /v2/ GA.

## **8.2 Response format**

All responses are JSON. Success responses use HTTP 200 or 201. Errors use standard codes (400, 401, 403, 404, 409, 422, 429, 500) with a consistent error envelope:

{ "error": { "code": "INSUFFICIENT_BALANCE",

"message": "Wallet balance is too low for this debit.",

"request_id": "req_abc123" } }

## **8.3 Pagination**

All list endpoints support cursor-based pagination via after (cursor for the next page) and limit (max 100, default 20). Responses include a next_cursor field (null if no more pages).

## **8.4 Rate limiting**

Rate limits are enforced per API key: 1,000 requests/minute for read endpoints and 500 requests/minute for write endpoints. Responses include X-RateLimit-Remaining and X-RateLimit-Reset headers. When exceeded, returns HTTP 429.

**9\. Non-Functional Requirements**

| **Requirement**         | **Target**                  | **Notes**                                                |
| ----------------------- | --------------------------- | -------------------------------------------------------- |
| **API latency**         | p99 < 300ms                 | For single-wallet read/write. Excluding network.         |
| **Throughput**          | 500 TPS sustained           | Transactions per second across all tenants.              |
| **Availability**        | 99.9% uptime (SLA)          | ~8.7 hours downtime/year maximum.                        |
| **Data durability**     | Zero data loss              | Postgres with synchronous replication. No async writes.  |
| **Balance consistency** | Strong consistency          | Row-level locking. No eventual consistency for balances. |
| **Security**            | TLS 1.3, at-rest encryption | API keys hashed (bcrypt). PII fields encrypted at rest.  |
| **Audit retention**     | 7 years                     | Regulatory minimum for financial records.                |
| **Admin UI load**       | < 2s for wallet detail      | Including transaction list (first page).                 |

**10\. Open Questions**

| **#** | **Question**                                                                               | **Notes**                                                             |
| ----- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1     | Should one user be allowed multiple wallets per tenant in Phase 1?                         | Default: one wallet per user per tenant. Multi-wallet can be Phase 2. |
| 2     | What is the default currency? Is INR the only supported currency in Phase 1?               | Recommend INR-only for Phase 1 to avoid FX complexity.                |
| 3     | Who hosts the Admin Dashboard - WalletOS-managed SaaS, or self-hosted by each tenant?      | Start with SaaS (simpler). Self-hosted option can be Phase 2.         |
| 4     | Is the user-facing UI always iframe-embedded, or do we also ship an npm component library? | Both. Iframe for non-React projects, npm package for React.           |
| 5     | How long are idempotency keys retained?                                                    | Recommend 24 hours as baseline. Could make this configurable.         |

_End of Document - WalletOS PRD v1.0_