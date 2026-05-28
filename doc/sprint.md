# Sprint 1: The Secure Foundation [DONE]

## Goal
Establish the Nx monorepo, secure database schema, and global middleware.

## Tasks
- Initialize the Nx workspace with Express and Next.js applications.
- Configure Prisma and run the partitioned audit log migration.
- Revoke database-level UPDATE and DELETE privileges on the AuditLog table.
- Implement the global error handler and request ID middleware.
- Build the API key authentication middleware using SHA-256 hashing.

**Agent to Use:** root AGENTS.md + apps/api/AGENTS.md  
**Skills to Use:** design, write, check  
**Docs / Context:** Architecture.md, Schema.md, Plan Scope.md


# Sprint 2: Core Ledger & Concurrency [DONE]

## Goal
Build the wallet, transaction, and concurrency-safe ledger logic.

## Tasks
- Wallet creation/retrieval: Implement unique constraints on (tenantId, externalUserId, isSandbox).
- Transactional writes: Implement SELECT FOR UPDATE locking for all credits, debits, and reversals.
- Idempotency: Build middleware checking the (tenantId, idempotencyKey) combination with 30-day retention.
- Audit logging: Wire automatic record creation into every state-changing database transaction.
- Reversal logic: Implement opposite-type transactions with mandatory balance checks.
- Transfers: Implement atomic transfers with lexicographical wallet ID sorting to prevent deadlocks (Completed ahead of schedule).
- Pagination: Build compound cursor logic for stable, high-performance transaction listing.

**Agent to Use:** apps/api/AGENTS.md  
**Skills to Use:** think, write, check  
**Docs / Context:** Data API.md, Schema.md, Requirements.md


# Sprint 2.5: Ledger Testing & Validation [DONE]

## Goal
Verify Sprint 2 financial correctness, edge cases, and transaction safety.

## Tasks
- Setup Jest / Supertest / Nx test target for API.
- Wallet Tests: create wallet, duplicate wallet rejection, retrieval success.
- Credit Tests: valid credit, invalid amount rejection, balance update.
- Debit Tests: successful debit, insufficient funds rejection.
- Idempotency Tests: duplicate request with same key does not double charge.
- Reversal Tests: reverse valid transaction, reject duplicate reversal.
- Concurrency Tests: parallel debit requests preserve correct final balance.
- Audit Tests: state-changing actions create audit log entries.
- Infrastructure Tuning: Tune Prisma connection pooling and timeouts to manage high-concurrency testing and prevent connection leaks.
- Add Postman collection for manual regression testing.

**Agent to Use:** apps/api/AGENTS.md  
**Skills to Use:** check, think, write  
**Docs / Context:** Data API.md, Schema.md, Requirements.md


# Sprint 3: Administrative Control [DONE]

## Goal
Deliver internal tools for support and operations staff.

## Tasks
- Admin Auth: Integrate Supabase Auth JWT verification for administrative routes.
- Management UI: Build the wallet search, list, and detail views in the admin dashboard.
- Manual Actions: Implement dashboard-driven credits, debits, and reversals with mandatory reasons.
- Account Controls: Build wallet freeze and unfreeze functionality with audit-logged reasons.
- Onboarding: Create the tenant management flow to generate live and test API keys.
- Add admin auth and critical action tests for freeze, reversal, and tenant creation.

**Agent to Use:** apps/admin/AGENTS.md + apps/api/AGENTS.md  
**Skills to Use:** read, write, check  
**Docs / Context:** APP FLOW.md, Requirements.md, Data API.md


# Sprint 4: Advanced Governance, RBAC & Scoped Dashboards [DONE]

## Goal
Transition from a single-admin MVP to a professional Multi-Tenant platform using Hierarchical RBAC, strict type contracts, and scoped data visibility.

## Tasks
- Contract-First Type Consolidation [DONE]: Extracted duplicated interfaces into @walletos/types and refactored adminService.ts to consume shared contracts.
- Typed API Wrapper [DONE]: Implemented apiClient.ts with centralized auth, idempotency, and query serialization.
- Auth Context Migration [DONE]: Migrated AuthContext.tsx to shared types and added runtime /admin/me guards.
- Hierarchical RBAC [DONE]: Implemented tenant-scoped role hierarchy where `support` and `finance` are strictly tenant-level sandbox permissions for internal staff workflows. `superadmin` is a platform-wide role with no auxiliary staff assignment. Hierarchy enforced in middleware/context.
- Global Error Mapping [DONE]: Implemented shared error dictionary and professional mapping from ErrorCode to UI strings.
- Tenant Data Scoping [DONE]: Enforced strict tenantId boundaries in API and global search routes to prevent cross-tenant querying.
- Permission Gating (UI) [DONE]: Replaced remaining hardcoded dashboard role checks with the declarative <PermissionGate> wrapper.
- Runtime Safety (Phase 2) [DONE]: Implemented Zod runtime validation for /admin/me, transaction search, and wallet creation payloads.

**Agent to Use:** apps/admin/AGENTS.md + apps/api/AGENTS.md  
**Skills to Use:** design, write, check  
**Docs / Context:** Architecture.md, Data API.md


# Sprint 4.5: The Unified Multi-Tenant Dashboard [DONE]

## Goal
Enforce dynamic multi-tenant data isolation and role-based feature gating inside our single, shared admin dashboard layout (`/dashboard`), ensuring tenant users only see their own workspace metrics without duplicating UI code.

## Tasks
- UI Extraction [DONE]: Ensure `StatCard`, `NavItem`, and `ActionButton` live inside a shared `components/ui` directory to prevent styling and behavior duplication.
- Context-Driven Sidebar Gating [DONE]: Refactored the primary dashboard sidebar to use the existing `<PermissionGate>` component. Platform-level administrative tabs hidden for sessions with `tenant_admin` or lower roles. Tenant staff (`support`, `finance`) see only their tenant workspace.
- Implicit Tenant Data Scoping [DONE]: Dashboard listing tables and KPI queries automatically forward the active session's `tenantId` to backend queries.
- API Key Management Component [DONE]: Added scoped configuration panel on the dashboard account settings tab for `tenant_admin` users to view key prefixes.
- Tenant Team Management [DONE]: `tenant_admin` users can invite workspace staff via `POST /admin/tenants/:tenantId/invite-user` using Supabase passwordless email invitations. Invited users assume `support` or `finance` roles within that tenant only.

**Agent to Use:** apps/admin/AGENTS.md  
**Skills to Use:** design, write, check  
**Docs / Context:** APP FLOW.md, Requirements.md

---

# Sprint 5: The End-User Experience (Wallet Web App) [DON]

## Goal
Build the consumer-facing wallet web application with **complete PRD compliance** for Phase 1 UI components. This is the core product delivery — the UI that Zomato's end-users will see when they click "My Wallet."

## Context
- **Session Token Flow:** Zomato's backend calls `POST /auth/session` with their API key → receives 1-hour token (e.g., `sess_abc123`) scoped to a specific `wallet_id`
- **Handoff:** Zomato passes `sess_abc123` to their frontend, which loads our `apps/web` iframe
- **Zero Admin Controls:** Web app is strictly read-only. No "Add Funds" or "Reverse" buttons. End-users are viewers only.
- **Sandbox Flag (P0):** All wallets carry an `isSandbox` flag; test data must be visually distinguished from live data.

## Tasks

### Core Authentication & Layout
- **Task 5a: Session Token Authentication:** Implement JWT verification for `Bearer sess_...` tokens. Safely read query param or localStorage token. Inject into all API calls. Add runtime guards for non-read endpoints.
- **Task 5b: Sandbox Environment Banner (P0):** Check `wallet.isSandbox` and display a global platform banner reading "Test Mode Data" when true. Toggles off in live environment.

### Balance Display & Quick Stats
- **Task 5c: Balance Card:** Build a clean, prominent balance display with currency formatting, last-updated timestamp, wallet label, and status badge (Active/Frozen/Closed).
- **Task 5d: Quick Stats Tiles (P1):** Implement 3 visual card blocks below balance: Total Earned (sum of credits), Total Spent (sum of debits), Transactions This Month (count). Parse from ledger history.

### Transaction History & Filtering
- **Task 5e: Transaction History List:** Implement paginated transaction table with credit/debit color coding (green up arrow / red down arrow), timestamps, descriptions, and amounts. Sort by created_at DESC.
- **Task 5f: Transaction Filter Bar (P1):** Add filter selectors for Type (All | Credits | Debits | Reversals) and date range picker above the transaction list.
- **Task 5g: Transaction Detail Modal (P1):** Wire row selection to open a slide-over or modal displaying full transaction details: `transaction_id`, type, amount, description, `reference_id`, `created_at`, `balance_before`, `balance_after`, `idempotency_key`, and metadata (collapsed by default).

### Error Handling & Polish
- **Task 5h: Empty State UI (P1):** Design an illustrative empty vector state to replace flat text when transaction array is zero. Copy: "No transactions yet. Credits and spending will appear here."
- **Task 5i: Error & Loading States:** Skeleton loaders on data fetch. Error states with retry button. If API returns 503, show "Service temporarily unavailable" with support link.
- **Task 5j: Responsive Design & Accessibility:** Mobile-first design, minimum 360px width. Two-column layout on desktop (balance left, transactions right), single column below 768px. WCAG 2.1 AA: ARIA labels, keyboard navigation, semantic HTML.

**Target Deliverable:** A feature-complete, production-quality end-user wallet UI fully compliant with PRD Section 6.1 that Zomato can embed in their app.

**Effort Estimate:** 3 days (tasks 5a-5e baseline in 2 days; tasks 5f-5j P1 components in 1 day)

**Agent to Use:** apps/web/AGENTS.md  
**Skills to Use:** design, write, check  
**Docs / Context:** APP FLOW.md, Requirements.md


# Sprint 6: Secure Tenant Credential Lifecycle [DONE]

## Goal
Deliver a secure, professional Tenant credential generation and revelation flow that works for both immediate access (MVP) and email-based onboarding (stretch goal).

## Context

## Tasks

### Lean Path (MVP — Required)

### Full Path (Stretch — If Time Permits After Sprint 5-7 Baseline)

**Target Deliverable:** 

**Effort Estimate:** 3 hours (Lean) + 1 day optional (Full)

**Agent to Use:** apps/api/AGENTS.md + apps/web/AGENTS.md  
**Skills to Use:** think, write, check, supabase  
**Docs / Context:** APP FLOW.md, Requirements.md, Architecture.md

**Related Design:** See [Supabase invitation & onboarding flow](doc/supabase-invite-flow.md) — recommended design for Sprint 6 implementation.

# Sprint 7: PRD Feature Completion & Webhook Dispatcher [PRIORITY: HIGH]

## Goal
Implement the missing Phase 1 features from the PRD and deploy the critical Webhook event dispatcher. These are contractual requirements, not optional.

## Context
- **PRD Requirement:** Wallets are useless to Zomato without webhooks — they cannot react to wallet events in real-time.
- **Phase 1 Scope:** Event publisher + HMAC signing + retry queue (dispatcher infrastructure). Admin UI (webhook management) is optional polish for Sprint 8.

## Tasks

### 7a-7c: Webhook Dispatcher (P1 Core)
- **Task 7a: Transaction State Event Publisher:** Embed execution hooks inside `transaction.service.ts` to capture finalized database commits. When a transaction is created or reversed, instantiate a corresponding `WebhookDelivery` entry with event type (`wallet.credited`, `wallet.debited`, `wallet.reversed`), tenant ID, and raw payload.
- **Task 7b: Cryptographic Signature Engine:** Author utility functions computing HMAC-SHA256 signature hashes using the tenant's webhook secret. Sign each outbound payload with `X-WalletOS-Signature: sha256=<hex>` header. Document signature verification in API docs.
- **Task 7c: Post-Commit Delivery Queue Worker:** Construct background job handlers (Bull/BullMQ) managing webhook deliveries. Implement exponential backoff retries: immediate, 30s, 2m, 15m, 2h. After 5 failures, move to dead-letter queue. Store attempt logs (timestamp, status, response code) for debugging.

### 7d: Wallet-to-Wallet Transfers (P1)
- Implement `POST /wallets/:id/transfer` endpoint that atomically moves funds between two wallets in the same tenant.
- Use lexicographical wallet ID sorting to prevent deadlock cycles.
- Create reversible transfer transaction records with the direction preserved (source→target).
- Add comprehensive tests: successful transfer, insufficient funds rejection, same-wallet rejection, cross-tenant rejection.

### 7e: Scoped API Keys (P1)
- Add `scope` field to `ApiKey` table: `read_only` | `read_write` | `admin` (default: `admin`).
- Modify `apiKeyAuthMiddleware` to enforce scope checks: `read_only` keys can only call GET endpoints; `read_write` can call GET + POST/PUT (non-destructive); `admin` can call all endpoints.
- Update admin dashboard API key management to show scopes and allow rotation with new scope selection.
- Add comprehensive tests for each scope level.

### 7f: Tenant Configuration (P1)
- Add `TenantConfig` table with fields: `defaultCurrency` (enum: USD, INR), `autoCreateWallet` (boolean).
- Implement `GET/PUT /admin/tenant-config` endpoint (superadmin + tenant_admin only).
- Update admin dashboard to show and edit these settings in tenant detail view.

### 7g: Wallet Closure Rules (P1)
- Modify `DELETE /wallets/:id` to reject closure unless `balance === 0.00` exactly.
- Return clear error: "Cannot close wallet with non-zero balance: {balance}. Please reverse or settle all outstanding transactions first."
- Add UI helper in admin dashboard to show the blocking balance and suggest next steps.

### 7h: Reporting & Exports (P1/P2)
- Implement `GET /admin/audit-log/export?format=csv` endpoint. Return CSV with: timestamp, action, user, wallet, amount, balance, reason, status.
- Implement `GET /admin/transactions/report?period=week|month|quarter` endpoint. Return JSON with: total_credits, total_debits, net_change, top_wallets, transaction_volume_by_day.
- Add admin dashboard pages:
  - **CSV Export Panel:** Search filters (date range, action type) → one-click CSV download.
  - **Transaction Report Chart:** Line chart showing transaction volume over time, bar chart for top wallets.

## Sprint 7 Summary (by Component)
- **API Changes:** Add 3 webhook + 3 feature endpoints (total 6), update middleware, add validation.
- **Database:** Add `WebhookDelivery` table, `scope` field to ApiKey, new TenantConfig table. Add `isSandbox` flag to Wallet if not already present.
- **Background Jobs:** Deploy Bull/BullMQ webhook delivery dispatcher.
- **Admin UI:** Add webhook event logs (read-only for Sprint 7), tenant config form, API key scope selector, CSV export panel, transaction report charts.
- **Tests:** 25+ new tests covering webhooks (publisher, signing, retry) and feature endpoints.

**Target Deliverable:** Webhook dispatcher (fully operational) + all Phase 1 PRD feature endpoints. Webhook admin UI is optional Sprint 8 polish.

**Effort Estimate:** 2–3 days (webhooks + transfers: 2 days; configs + closure + reporting: 1 day)

**Agent to Use:** apps/api/AGENTS.md + apps/admin/AGENTS.md  
**Skills to Use:** think, write, check, supabase  
**Docs / Context:** Requirements.md, Architecture.md, Data API.md


# Sprint 8: Webhook Admin UI & Stretch Features [PRIORITY: OPTIONAL]

## Goal
Add management and monitoring features for webhooks (deferred from Sprint 7 core). If you have time after Sprints 5–7, build these for polish. Otherwise, document as "Phase 2."

## Context
- **Sprint 7 Delivered:** Event publisher, HMAC signing, retry queue, resilience — all operational.
- **Sprint 8 Polish:** Admin UI, delivery logs, health dashboard.
- **If Time Runs Out:** Core webhooks work perfectly without the admin UI. Clients can manage via direct API calls or documentation.

## Tasks (Optional Polish)
- **Webhook Admin UI:** Allow tenant_admin users to create, test, and monitor webhooks from the admin dashboard. Show event type selection, endpoint URL, secret generation.
- **Delivery Logs:** Store and display webhook delivery attempts (timestamp, status, response code, retry count) for debugging. Filterable by webhook ID or date range.
- **Health Metrics Dashboard Widget:** Show webhook success rate, failed deliveries, retry attempts, and delivery latency percentiles.
- **Test Webhook:** Send a sample payload to a registered webhook URL so clients can verify their receiving endpoint.

**Target Deliverable:** Full webhook lifecycle management and monitoring UI (if time permits). Otherwise, skip and note as Phase 2.

**Agent to Use:** apps/admin/AGENTS.md  
**Skills to Use:** design, write, check  
**Docs / Context:** Architecture.md, Requirements.md

---

## Summary: Path to Production

| Sprint | Focus | Deliverable | Timeline | Status |
|--------|-------|-------------|----------|--------|
| 4.5 | Multi-Tenant Admin Dashboard | ✅ Complete | Done | ✅ Done |
| **5** | **End-User Wallet Web App (PRD §6.1)** | **Balance + history + 4 P1 components + sandbox** | **Days 1–3** | 🔴 Priority |
| **6** | **Tenant Credential Lifecycle** | **MVP (3h): Credential display. Stretch (1d): Email flow** | **Days 3–4** | 🟡 High |
| **7** | **PRD Features + Webhook Dispatcher** | **Transfers + scopes + config + closure + reports + webhooks** | **Days 4–6** | 🔴 Priority |
| **8** | **Webhook Admin UI & Stretch** | **Management UI, delivery logs, health dashboard (optional)** | **Days 6+ (if time)** | 🟢 Optional |

**Professional Context:** This is a client-facing internship project.
- **Critical Path (Sprints 5–7):** Web app + credentials + core features + webhooks = **production-ready SaaS**. Target: deliver by end of week.
- **Stretch (Sprint 8):** Admin UI polish. Skip if running short on time — core webhooks work perfectly without it.
- **If Client Tests:** Sprint 5 (end-user view) will impress immediately. Sprint 6 lean path (3h credential display) unblocks client onboarding. Sprint 7 webhooks make the product actually useful.

---

# Architectural Guardrails (Enforced)

## RBAC Boundaries
- **`support` & `finance`**: Tenant-level sandbox permissions only. Cannot access other tenant workspaces. No platform-wide visibility.
- **`tenant_admin`**: Full control over their tenant's wallets, transactions, team invitations, and API key management. Cannot view or modify other tenants.
- **`superadmin`**: Platform-wide administrative access only. No subordinate staff roles, no "support dashboard," no "cross-tenant support staff tables." Single user or small founding team only.

## Enforcement Mechanisms
- All API endpoints validate `tenantId` from session JWT and explicitly reject cross-tenant requests with 403 Forbidden.
- UI routes implicitly scope all data retrieval and display to active session `tenantId`.
- Invite flow (`POST /admin/tenants/:tenantId/invite-user`) restricted to `tenant_admin` of the target tenant only.
- Sidebar and feature gating use declarative `<PermissionGate>` wrapper to prevent unauthorized UI access.
