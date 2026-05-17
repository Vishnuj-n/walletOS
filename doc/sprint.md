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


# Sprint 4: Advanced Governance, RBAC & Scoped Dashboards [IN PROGRESS]

## Goal
Transition from a single-admin MVP to a professional Multi-Tenant platform using Hierarchical RBAC, strict type contracts, and scoped data visibility.

## Tasks
- Contract-First Type Consolidation [DONE]: Extracted duplicated interfaces into @walletOS/types and refactored adminService.ts to consume shared contracts.
- Typed API Wrapper [DONE]: Implemented apiClient.ts with centralized auth, idempotency, and query serialization.
- Auth Context Migration [DONE]: Migrated AuthContext.tsx to shared types and added runtime /admin/me guards.
- Hierarchical RBAC [DONE]: Implemented the hierarchy climb (support < finance < tenant_admin < superadmin) and verified logic in middleware/context.
- Global Error Mapping [DONE]: Implemented shared error dictionary and professional mapping from ErrorCode to UI strings.
- Tenant Data Scoping: Enforce strict tenantId boundaries in the API and search routes so tenants cannot query cross-tenant data.
- Permission Gating (UI): Build the flexible <PermissionGate> component to replace hardcoded role checks in the dashboard.
- Runtime Safety (Phase 2): Implement Zod-based runtime validation for /admin/me, transaction search, and wallet creation payloads.

**Agent to Use:** apps/admin/AGENTS.md + apps/api/AGENTS.md  
**Skills to Use:** design, write, check  
**Docs / Context:** Architecture.md, Data API.md


# Sprint 4.5: The Unified Multi-Tenant Dashboard

## Goal
Enforce dynamic multi-tenant data isolation and role-based feature gating inside our single, shared admin dashboard layout (`/dashboard`), ensuring tenant users only see their own workspace metrics without duplicating UI code.

## Tasks
- UI Extraction [DONE]: Ensure `StatCard`, `NavItem`, and `ActionButton` live inside a shared `components/ui` directory to prevent styling and behavior duplication.
- Context-Driven Sidebar Gating: Refactor the primary dashboard sidebar to use the existing `<PermissionGate>` component. Hide platform-level tabs (Global Tenant Creation, System Balances, Audit Streams) for sessions with `tenant_admin` or lower roles.
- Implicit Tenant Data Scoping: Ensure dashboard listing tables and KPI queries automatically forward the active session's `tenantId` to backend queries. The UI should not require separate tenant-specific routes to show isolated data.
- API Key Management Component: Add a scoped configuration panel on the dashboard account settings tab that allows `tenant_admin` users to view key prefixes and request rotations via the backend API.

**Agent to Use:** apps/admin/AGENTS.md  
**Skills to Use:** design, write, check  
**Docs / Context:** APP FLOW.md, Requirements.md


# Sprint 5: The End-User Experience (Wallet Web App)

## Goal
Replace hardcoded user wallets with real database connections and finalize the consumer-facing web app.

## Tasks
- Session Auth Wiring: Implement the /auth/session token exchange on the apps/web client to securely authenticate the end-user.
- Live Balance & Ledger: Replace hardcoded UI values in apps/web with live API calls fetching the user's wallet balance and history.
- Real-time Polish: Implement data polling or refetching on the wallet UI so users see balance changes immediately.
- Responsive Audit: Ensure the end-user web application looks flawless on mobile screens.

**Agent to Use:** apps/web/AGENTS.md  
**Skills to Use:** design, write, check  
**Docs / Context:** APP FLOW.md, Requirements.md