### SPRINT.md

### Sprint 1: The Secure Foundation
**Goal:** Establish the Nx monorepo, secure database schema, and global middleware.

**Tasks:**
* Initialize the Nx workspace with Express and Next.js applications.
* Configure Prisma and run the partitioned audit log migration.
* Revoke database-level `UPDATE` and `DELETE` privileges on the `AuditLog` table.
* Implement the global error handler and request ID middleware.
* Build the API key authentication middleware using SHA-256 hashing.

**Agent to Use:** `root AGENTS.md` + `apps/api/AGENTS.md`
**Skills to Use:** `design`, `write`, `check`
**Docs / Context:** `Architecture.md`, `Schema.md`, `Plan Scope.md`

---

### Sprint 2: Core Ledger & Concurrency
**Goal:** Build the wallet, transaction, and concurrency-safe ledger logic.

**Tasks:**
* **Wallet creation/retrieval:** Implement unique constraints on `(tenantId, externalUserId, isSandbox)`.
* **Transactional writes:** Implement `SELECT FOR UPDATE` locking for all credits, debits, and reversals.
* **Idempotency:** Build middleware checking the `(tenantId, idempotencyKey)` combination with 30-day retention.
* **Audit logging:** Wire automatic record creation into every state-changing database transaction.
* **Reversal logic:** Implement opposite-type transactions with mandatory balance checks.

**Agent to Use:** `apps/api/AGENTS.md`
**Skills to Use:** `think`, `write`, `check`
**Docs / Context:** `Data API.md`, `Schema.md`, `Requirements.md`

---

### Sprint 3: Administrative Control
**Goal:** Deliver internal tools for support and operations staff.

**Tasks:**
* **Admin Auth:** Integrate Supabase Auth JWT verification for administrative routes.
* **Management UI:** Build the wallet search, list, and detail views in the admin dashboard.
* **Manual Actions:** Implement dashboard-driven credits, debits, and reversals with mandatory reasons.
* **Account Controls:** Build wallet freeze and unfreeze functionality with audit-logged reasons.
* **Onboarding:** Create the tenant management flow to generate live and test API keys.

**Agent to Use:** `apps/admin/AGENTS.md` + `apps/api/AGENTS.md`
**Skills to Use:** `read`, `write`, `check`
**Docs / Context:** `APP FLOW.md`, `Requirements.md`, `Data API.md`

---

### Sprint 4: Webhooks & System Resilience
**Goal:** Implement asynchronous event processing and system reliability.

**Tasks:**
* **Webhook Dispatcher:** Build the worker with exponential backoff (up to 5 attempts) and HMAC-SHA256 signing.
* **Circuit Breaker:** Mark failing endpoints as `degraded` and pause dispatch after 10 consecutive failures.
* **Rate Limiting:** Implement per-API key limits for read and write operations.
* **Transfers:** Implement atomic transfers with lexicographical wallet ID sorting to prevent deadlocks.

**Agent to Use:** `root AGENTS.md` + `apps/api/AGENTS.md`
**Skills to Use:** `design`, `hunt`, `check`
**Docs / Context:** `Architecture.md`, `Data API.md`, `Plan Scope.md`

---

### Sprint 5: Embedded User UI
**Goal:** Deliver the end-user wallet experience and embeddable components.

**Tasks:**
* **Session Tokens:** Build the server-to-server endpoint for 1-hour scoped UI tokens.
* **Core Components:** Create the balance card and transaction list in the shared UI library.
* **Iframe Integration:** Build the embeddable script for non-React projects.
* **Advanced Features:** Add transaction filters and the slide-up detail panel.
* **Branding:** Implement theme support for tenant-specific colors and fonts.

**Agent to Use:** `apps/web/AGENTS.md`
**Skills to Use:** `design`, `write`, `check`
**Docs / Context:** `APP FLOW.md`, `README.md`, `Requirements.md`

***

### Scoring

| Dimension | Score | Rationale |
| :--- | :--- | :--- |
| Directness | 9/10 | Statements provide clear, executable tasks. |
| Rhythm | 8/10 | Varies task length and complexity appropriately. |
| Trust | 10/10 | Strictly adheres to the corrected architecture and `AGENTS.md` paths. |
| Authenticity | 9/10 | Professional project management tone. |
| Density | 9/10 | High information density per line. |
| **Total** | **45/50** | Passes. |