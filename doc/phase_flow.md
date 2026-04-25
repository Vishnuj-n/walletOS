### Plan Scope

Phase 1 provides the core product including the API, user interface, and admin dashboard. This phase excludes payment gateways and real money movement. Users fund and drain wallets through direct API calls.

### P0 Required for Launch

The following items are blocking. The product does not ship without these features.

**API Requirements**
* Create, fetch, freeze, and unfreeze wallets.
* Execute credit, debit, and reversal transactions.
* Implement 30-day idempotency using a permanent database unique constraint on the tenant ID and idempotency key.
* Lock wallet rows using `SELECT FOR UPDATE` for all credits and debits to ensure ledger consistency.
* Authenticate API keys using SHA-256 hashes and prefixes for live and test environments.
* Isolate sandbox data using an environment boolean enforced in every database query.
* Create tenants and generate initial live and test keys.
* Write audit logs for every state change with no application-level path to delete records.
* Provide a health endpoint for monitoring.

**User Interface**
* Display the balance card with currency, labels, and status badges.
* Show frozen and closed banners that disable all user actions.
* List transactions with icons, descriptions, dates, and signed amounts.
* Authenticate sessions with short-lived tokens scoped to a single wallet.

**Admin Dashboard**
* Search by wallet ID, external user ID, and reference ID.
* Provide a paginated wallet list with status filters.
* Offer wallet detail pages with transaction and audit log tabs.
* Execute manual credits, debits, and reversals.
* Freeze and unfreeze wallets with mandatory reason fields.
* Manage API keys including creation and revocation.
* Log in via Supabase Auth.

---

### P1 General Availability

These features complete the product and may ship after an initial closed beta.

**API Enhancements**
* Execute transfers between wallets in the same tenant using lexicographical ID sorting to prevent deadlocks.
* Implement wallet closure with a 14-day `pending_closure` grace period.
* Update wallet labels and metadata via PATCH requests.
* Provide scoped API keys for read-only, read-write, and administrative access.
* Rotate API keys with a 10-minute grace period for the revoked key.
* Configure per-tenant settings for currency and auto-creation logic.
* Query audit logs by wallet, actor, action, and date range.
* Register and test webhook endpoints with exponential backoff for deliveries.
* Implement a circuit breaker that marks failing webhook endpoints as degraded.

**User Interface Enhancements**
* Display statistics for total earnings, spending, and monthly transaction counts.
* Filter transactions by type, date, and search terms.
* Show a detail panel for transactions with metadata.
* Include silent background token refreshing to maintain session continuity.
* Provide skeleton loaders and error states with retry logic.

**Admin Dashboard Enhancements**
* Execute the two-step wallet closure with a zero-balance guard.
* View full audit logs across the entire tenant.
* Export audit logs and transaction histories to CSV.
* Refresh the summary dashboard every five minutes.
* Display a 30-day bar chart of transaction volumes.
* Manage tenant profile settings and support URLs.

---

### P2 Deferrable Items

* Trigger webhooks for low-balance alerts based on tenant thresholds.
* Show a histogram of wallet balance distributions.
* Provide an impersonation view to see the user interface as a specific end user.

---

### Phase 2 Out of Scope

* Integrating payment gateways like Razorpay, Stripe, or UPI.
* Building KYC and AML compliance workflows.
* Supporting multiple currencies and FX conversions.
* Managing crypto or Web3 wallets.
* Developing native mobile applications.
* Allowing multiple wallets per user per tenant.

---

### Build Order

Follow this sequence to ensure the API supports frontend development.

1. Set up the Supabase project, Prisma schema, and initial migration.
2. Revoke update and delete privileges on the `audit_logs` table.
3. Configure partitioning for the audit log table by month.
4. Implement the logger, error classes, and request ID middleware.
5. Build the API key auth and sandbox isolation middleware.
6. Develop wallet management endpoints.
7. Build transaction logic using `SELECT FOR UPDATE` for all balance changes.
8. Wire automatic audit log writes into the wallet and transaction services.
9. Implement Supabase admin authentication.
10. Build the admin dashboard wallet views and manual transaction tools.
11. Build the user interface session token flow and balance views.
12. Complete the P1 features including the webhook circuit breaker and transfer deadlock protection.

How do you want to handle the initial deployment of the partitioned audit tables during the first migration?