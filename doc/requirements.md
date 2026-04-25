# Requirements

WalletOS is an API-first wallet management service. Any product team can integrate it to give their users a wallet — balance tracking, transaction history, audit logs, admin tooling — without writing balance logic themselves.

Phase 1 covers core wallet operations, a user-facing UI, and an admin dashboard. Payment gateways (Razorpay, Stripe, UPI) are Phase 2.

---

## Who uses this

**End users** — customers of whatever project has integrated WalletOS. They view their balance and transaction history through the embedded UI. They cannot credit, debit, or freeze their own wallet.

**Developers** — engineers at integrating companies. They call the REST API with an API key, receive webhook events, and optionally embed the UI components.

**Support agents** — view any wallet, credit or debit with a reason, freeze wallets, read audit logs. They use the admin dashboard, not the API directly.

**Finance/admin** — aggregate reports, total outstanding balances, CSV exports, tenant configuration.

**Automated systems** — backend services that credit wallets on order completion or debit on checkout. They call the API with idempotency keys to handle retries safely.

---

## Functional requirements

### Wallets

- Create a wallet for a user. Accepts `external_user_id`, `currency` (default INR), `label`, and a metadata JSON blob. Returns `wallet_id`, `balance: 0.00`, `status: active`, `created_at`.
- One wallet per user per tenant in Phase 1.
- Fetch by `wallet_id` or by `external_user_id` within a tenant.
- Update `label` and `metadata`. Balance and status cannot be changed through this endpoint.
- Freeze a wallet with a required reason. Frozen wallets reject all credits and debits.
- Unfreeze a wallet with a required reason.
- Close a wallet permanently. Only allowed when balance is exactly `0.00`. Irreversible.
- List all wallets for a tenant (admin only). Paginated, filterable by status, currency, date range.

### Transactions

Transactions are append-only. No transaction record is ever modified or deleted. Corrections go through reversals — a new transaction of the opposite type linked to the original.

- Credit a wallet: `wallet_id`, `amount` (positive), `description`, `idempotency_key`. Optional `reference_id` and `metadata`.
- Debit a wallet: same fields. Returns 422 if balance is insufficient, 409 if the wallet is frozen. Balance update is atomic with the transaction record.
- Transfer between two wallets in the same tenant. Creates one debit and one credit in a single database transaction. Both succeed or both roll back.
- Reverse a transaction: accepts `original_transaction_id` and `reason`. Creates a new transaction of the opposite type. Cannot reverse a reversal.
- Fetch a single transaction with all fields including linked reversals.
- List transactions for a wallet. Filters: type, date range, min/max amount, `reference_id`. Sorted by `created_at` descending. Cursor-based pagination.

### Idempotency

Every write endpoint accepts an `Idempotency-Key` header. If the same key is reused within 24 hours, the API returns the original response without re-executing the operation. This prevents double-credits on network retries.

### Balance locking

Before any credit or debit, the wallet row is locked with `SELECT FOR UPDATE` inside a Postgres transaction. This prevents race conditions when two requests modify the same wallet balance simultaneously.

### Multi-tenancy and API keys

- Each integrating project is a tenant. Tenants are fully isolated — Tenant A's API key cannot touch Tenant B's wallets even if they share an `external_user_id`.
- Creating a tenant generates a live key (`wlt_live_xxx`) and a test key (`wlt_test_xxx`).
- API keys are hashed in the database with bcrypt. The plain-text key is shown once on creation and never again.
- Keys have scopes: `read_only`, `read_write`, `admin`. A `read_only` key can only call GET endpoints.
- Rotating a key: old key stays valid for 10 minutes after revocation to let in-flight requests finish.
- Test keys use a separate data namespace. Sandbox data never mixes with live data.
- Per-tenant config: default currency, wallet auto-create on first use, transaction description max length, optional metadata schema validation.

### Audit log

- Every wallet and transaction write creates an audit log entry automatically. No opt-out.
- Each entry records: what changed, before/after state, who did it (`api_key_id`, `admin:email`, or `system`), and when.
- Audit records have no update or delete path in the application. The Postgres user the application connects with has `DELETE` and `UPDATE` revoked on the `audit_logs` table at the database level.
- Audit logs are retained for 7 years (regulatory minimum for financial records).
- Admins can query by `wallet_id`, actor, action type, and date range. Read-only, paginated. CSV export available.

### Webhooks

Events emitted:

| Event | Trigger |
|---|---|
| `wallet.created` | New wallet provisioned |
| `wallet.credited` | Credit transaction committed |
| `wallet.debited` | Debit transaction committed |
| `wallet.reversed` | Transaction reversed |
| `wallet.frozen` | Wallet frozen |
| `wallet.unfrozen` | Wallet unfrozen |
| `wallet.closed` | Wallet permanently closed |
| `wallet.low_balance` | Balance falls below per-tenant threshold |

Payloads are signed with HMAC-SHA256 using a per-tenant secret. Delivery is retried up to 5 times with exponential backoff: 10s, 30s, 2m, 10m, 1h. Delivery logs (status, attempt count, response code) are visible in the admin dashboard.

---

## User-facing UI

Two integration modes:

- **Iframe** — one script tag and a div. Pass a session token. The full wallet UI renders inside the consuming project's page.
- **React component library** — `npm install @walletOS/ui`. Use `<WalletCard />`, `<TransactionHistory />`, `<WalletSummary />` directly.

The UI is desktop-first, responsive to 360px minimum width. Desktop layout: two-column (balance panel left, transaction list right). Collapses to single column below 768px.

Required screens and components:

- Balance card showing current balance, currency, wallet label, and status badge.
- Status banner when wallet is frozen (orange) or closed (gray). All action buttons disabled when frozen.
- Quick stats: total earned, total spent, transactions this month.
- Transaction list: paginated, each row shows icon, description, date, and signed amount. Clicking a row opens a detail panel.
- Transaction filters: type tabs, date range picker, search by description or `reference_id`.
- Transaction detail: all fields including `balance_before`, `balance_after`, metadata (collapsed by default).
- Empty state, skeleton loaders, error states with retry.

Users cannot modify their wallet. View only.

### UI authentication

The consuming project calls the WalletOS API server-to-server to get a short-lived session token scoped to a single `wallet_id`. That token expires in 1 hour. The frontend uses this token for all UI API calls. The live API key never reaches the browser.

---

## Admin dashboard

Hosted at `admin.walletOS.io`. Requires Supabase Auth credentials separate from API keys.

**Wallet search and detail:**
- Global search by `wallet_id`, `external_user_id`, or `reference_id`. Debounced at 300ms.
- Wallet list: paginated table. Columns: `wallet_id`, `external_user_id`, label, balance, currency, status, `created_at`. Filterable by status, sortable by balance and date.
- Wallet detail: all fields, two tabs — Transactions and Audit Log.
- Transaction detail: all fields including `idempotency_key`, `balance_before`, `balance_after`, `created_by`, IP address, linked reversal.

**Admin actions:**
- Manual credit with amount, description (required), internal note (not shown to the user).
- Manual debit with reason from a dropdown. Warns if balance is insufficient.
- Reverse any transaction with a confirmation dialog showing the original and the new balance after reversal.
- Freeze/unfreeze with mandatory reason.
- Close wallet (only when balance is `0.00`). Two-step confirmation.
- Full audit log for a wallet or the entire tenant. CSV export.
- Impersonation view: see the user-facing UI as the end user would. Read-only. (P2)

**Reports:**
- Summary dashboard: total wallets, total outstanding balance, transaction counts for today/week/month, top wallets by balance. Refreshes every 5 minutes.
- Daily bar chart: credit vs debit volume over 30 days.
- Balance distribution histogram: wallets per bucket (₹0, ₹1–100, ₹101–1000, ₹1000+).
- CSV export of all transactions for a date range.

**Tenant settings:**
- API keys: create, revoke, view (name, scope, last used, created date). Key value shown once on creation.
- Webhook endpoints: register, update, delete. Select events. Send test payload. View delivery logs.
- Tenant profile: project name, contact email, support URL.
- Low-balance threshold: per-tenant default with per-wallet override.

---

## Non-functional requirements

| Requirement | Target |
|---|---|
| API latency | p99 < 300ms for single-wallet read/write, excluding network |
| Throughput | 500 TPS sustained across all tenants |
| Availability | 99.9% uptime (~8.7 hours downtime/year) |
| Data durability | Zero data loss. Postgres with synchronous replication |
| Balance consistency | Strong consistency. Row-level locking. No eventual consistency for balances |
| Transport security | TLS 1.3 |
| API key storage | bcrypt hashed. Never stored in plain text |
| Audit retention | 7 years |
| Admin UI load time | Wallet detail page (including first page of transactions) < 2s |

---

## Out of scope for Phase 1

- Payment gateway integration (Razorpay, Stripe, UPI, NEFT)
- KYC/AML compliance workflows
- Multi-currency and FX conversion
- Crypto/Web3 wallet support
- Native iOS/Android apps
- Multiple wallets per user per tenant