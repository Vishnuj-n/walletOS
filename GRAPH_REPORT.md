# Graph Report - .  (2026-05-01)

## Corpus Check
- Corpus is ~43,410 words - fits in a single context window. You may not need a graph.

## Summary
- 268 nodes · 185 edges · 40 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Web App Wallet UI & API Integration|Web App Wallet UI & API Integration]]
- [[_COMMUNITY_API Integration & Concurrency Tests|API Integration & Concurrency Tests]]
- [[_COMMUNITY_API Authentication & Routing Middleware|API Authentication & Routing Middleware]]
- [[_COMMUNITY_Admin Dashboard UI & Auth Context|Admin Dashboard UI & Auth Context]]
- [[_COMMUNITY_Core Architecture & Schema Design|Core Architecture & Schema Design]]
- [[_COMMUNITY_Admin Wallet Dashboard Operations|Admin Wallet Dashboard Operations]]
- [[_COMMUNITY_Test Helpers & Database Utilities|Test Helpers & Database Utilities]]
- [[_COMMUNITY_Admin Manual Actions & Audit UI|Admin Manual Actions & Audit UI]]
- [[_COMMUNITY_Web Client API Interface|Web Client API Interface]]
- [[_COMMUNITY_Admin App Authentication & UI|Admin App Authentication & UI]]
- [[_COMMUNITY_Admin Wallet Detail View|Admin Wallet Detail View]]
- [[_COMMUNITY_Admin Role-Based Authentication|Admin Role-Based Authentication]]
- [[_COMMUNITY_API Error Handling Framework|API Error Handling Framework]]
- [[_COMMUNITY_Financial Safety Idempotency & Locking|Financial Safety: Idempotency & Locking]]
- [[_COMMUNITY_Root Application Layouts|Root Application Layouts]]
- [[_COMMUNITY_Hello World API Routes|Hello World API Routes]]
- [[_COMMUNITY_Manual Transaction Form Logic|Manual Transaction Form Logic]]
- [[_COMMUNITY_Idempotency Implementation|Idempotency Implementation]]
- [[_COMMUNITY_API Key Generation Scripts|API Key Generation Scripts]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 109|Community 109]]
- [[_COMMUNITY_Community 110|Community 110]]
- [[_COMMUNITY_Community 111|Community 111]]
- [[_COMMUNITY_Community 112|Community 112]]
- [[_COMMUNITY_Community 113|Community 113]]
- [[_COMMUNITY_Community 114|Community 114]]

## God Nodes (most connected - your core abstractions)
1. `createTestApp` - 8 edges
2. `createTestSetup` - 8 edges
3. `Index` - 7 edges
4. `fetchWallets()` - 6 edges
5. `ManualActionsPage` - 5 edges
6. `useAuth()` - 4 edges
7. `userSessionAuthMiddleware()` - 4 edges
8. `createTestSetup()` - 4 edges
9. `useAuth` - 4 edges
10. `LedgerActivityTable` - 4 edges

## Surprising Connections (you probably didn't know these)
- `HomePage()` --calls--> `useAuth()`  [INFERRED]
  apps\admin\src\app\page.tsx → apps\admin\src\contexts\AuthContext.tsx
- `DashboardLayout()` --calls--> `useAuth()`  [INFERRED]
  apps\admin\src\app\dashboard\layout.tsx → apps\admin\src\contexts\AuthContext.tsx
- `DashboardPage()` --calls--> `useAuth()`  [INFERRED]
  apps\admin\src\app\dashboard\page.tsx → apps\admin\src\contexts\AuthContext.tsx
- `transactionReadAuth()` --calls--> `apiKeyAuthMiddleware()`  [INFERRED]
  apps\api\src\routes\transaction.routes.ts → apps\api\src\middleware\auth.ts
- `walletReadAuth()` --calls--> `apiKeyAuthMiddleware()`  [INFERRED]
  apps\api\src\routes\wallet.routes.ts → apps\api\src\middleware\auth.ts

## Communities

### Community 0 - "Web App Wallet UI & API Integration"
Cohesion: 0.14
Nodes (18): ActivityRow, fetchLedgerActivities, fetchSessionForWallet, fetchWallet, requestJson, BalanceCard, LedgerActivityTable, Index (+10 more)

### Community 1 - "API Integration & Concurrency Tests"
Cohesion: 0.31
Nodes (11): Admin API Endpoints, createTestApp, Audit Tests, Concurrency Tests, Credit Tests, Debit Tests, Idempotency Tests, Reversal Tests (+3 more)

### Community 2 - "API Authentication & Routing Middleware"
Cohesion: 0.24
Nodes (5): apiKeyAuthMiddleware(), parseSessionScope(), userSessionAuthMiddleware(), transactionReadAuth(), walletReadAuth()

### Community 4 - "Admin Dashboard UI & Auth Context"
Cohesion: 0.22
Nodes (4): HomePage(), useAuth(), DashboardLayout(), DashboardPage()

### Community 6 - "Core Architecture & Schema Design"
Cohesion: 0.29
Nodes (8): Session Token, PostgreSQL, Prisma ORM, Pessimistic Locking, Idempotency, Audit Log, Transaction, Wallet

### Community 7 - "Admin Wallet Dashboard Operations"
Cohesion: 0.52
Nodes (6): fetchWallets(), handleCreateWallet(), handleDeleteWallet(), handleEditWallet(), handleFreeze(), handleUnfreeze()

### Community 9 - "Test Helpers & Database Utilities"
Cohesion: 0.43
Nodes (4): createTestApiKey(), createTestSetup(), createTestTenant(), createTestWallet()

### Community 10 - "Admin Manual Actions & Audit UI"
Cohesion: 0.29
Nodes (7): Admin Audit Log API, Admin Credit Transaction API, Admin Debit Transaction API, Admin Transaction Reversal API, AuditLogPage, ManualActionsPage, supabase client

### Community 11 - "Web Client API Interface"
Cohesion: 0.6
Nodes (3): fetchLedgerActivities(), fetchWallet(), requestJson()

### Community 12 - "Admin App Authentication & UI"
Cohesion: 0.4
Nodes (5): useAuth, DashboardLayout, DashboardPage, HomePage, LoginPage

### Community 13 - "Admin Wallet Detail View"
Cohesion: 0.83
Nodes (3): fetchWallet(), handleFreeze(), handleUnfreeze()

### Community 14 - "Admin Role-Based Authentication"
Cohesion: 0.67
Nodes (2): adminAuthMiddleware(), getSupabaseClient()

### Community 15 - "API Error Handling Framework"
Cohesion: 0.5
Nodes (1): AppError

### Community 16 - "Financial Safety: Idempotency & Locking"
Cohesion: 0.67
Nodes (4): Idempotency Control Middleware, Prisma Client Singleton, Atomic Wallet Transfer Service, Pessimistic Row Locking Utility

### Community 17 - "Root Application Layouts"
Cohesion: 0.67
Nodes (1): RootLayout()

### Community 18 - "Hello World API Routes"
Cohesion: 0.67
Nodes (1): GET()

### Community 19 - "Manual Transaction Form Logic"
Cohesion: 1.0
Nodes (2): generateUUID(), handleSubmit()

### Community 21 - "Idempotency Implementation"
Cohesion: 1.0
Nodes (2): computeRequestFingerprint(), idempotencyMiddleware()

### Community 22 - "API Key Generation Scripts"
Cohesion: 1.0
Nodes (2): main(), sanitizeTenantName()

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (3): Admin Wallet Management API, WalletDetailPage, WalletsPage

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (3): Lead Staff Engineer Guidelines, Graphify Instructions, WalletOS

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (2): AuthProvider, RootLayout

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (2): Admin Tenant Management API, TenantsPage

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (2): Admin Authentication Middleware, WalletOS API Main Application

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (2): Core Ledger Schema, Audit Log Immutability Policy

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (2): index exports, types function

### Community 101 - "Community 101"
Cohesion: 1.0
Nodes (1): API_BASE_URL

### Community 102 - "Community 102"
Cohesion: 1.0
Nodes (1): API Key Authentication Middleware

### Community 103 - "Community 103"
Cohesion: 1.0
Nodes (1): User Session Auth Middleware

### Community 104 - "Community 104"
Cohesion: 1.0
Nodes (1): Audit Logging Service

### Community 105 - "Community 105"
Cohesion: 1.0
Nodes (1): TransactionMetadata

### Community 106 - "Community 106"
Cohesion: 1.0
Nodes (1): TransactionResponse

### Community 107 - "Community 107"
Cohesion: 1.0
Nodes (1): ListTransactionsQuery

### Community 108 - "Community 108"
Cohesion: 1.0
Nodes (1): userSessionAuthMiddleware Tests

### Community 109 - "Community 109"
Cohesion: 1.0
Nodes (1): cleanupTestData

### Community 110 - "Community 110"
Cohesion: 1.0
Nodes (1): Page Render Test

### Community 111 - "Community 111"
Cohesion: 1.0
Nodes (1): AppProviders

### Community 112 - "Community 112"
Cohesion: 1.0
Nodes (1): Supabase Auth

### Community 113 - "Community 113"
Cohesion: 1.0
Nodes (1): Tenant

### Community 114 - "Community 114"
Cohesion: 1.0
Nodes (1): API Key

## Knowledge Gaps
- **46 isolated node(s):** `RootLayout`, `AuthProvider`, `HomePage`, `LoginPage`, `DashboardLayout` (+41 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Admin Role-Based Authentication`** (4 nodes): `adminAuth.ts`, `adminAuthMiddleware()`, `getSupabaseClient()`, `requireAdminRole()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API Error Handling Framework`** (4 nodes): `errorHandler.ts`, `AppError`, `.constructor()`, `errorHandlerMiddleware()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Root Application Layouts`** (3 nodes): `RootLayout()`, `layout.tsx`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Hello World API Routes`** (3 nodes): `route.ts`, `route.ts`, `GET()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Manual Transaction Form Logic`** (3 nodes): `generateUUID()`, `handleSubmit()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Idempotency Implementation`** (3 nodes): `idempotency.ts`, `computeRequestFingerprint()`, `idempotencyMiddleware()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API Key Generation Scripts`** (3 nodes): `generate-key.ts`, `main()`, `sanitizeTenantName()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `AuthProvider`, `RootLayout`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `Admin Tenant Management API`, `TenantsPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (2 nodes): `Admin Authentication Middleware`, `WalletOS API Main Application`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `Core Ledger Schema`, `Audit Log Immutability Policy`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `index exports`, `types function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (1 nodes): `API_BASE_URL`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (1 nodes): `API Key Authentication Middleware`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (1 nodes): `User Session Auth Middleware`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (1 nodes): `Audit Logging Service`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (1 nodes): `TransactionMetadata`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (1 nodes): `TransactionResponse`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (1 nodes): `ListTransactionsQuery`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (1 nodes): `userSessionAuthMiddleware Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (1 nodes): `cleanupTestData`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 110`** (1 nodes): `Page Render Test`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 111`** (1 nodes): `AppProviders`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 112`** (1 nodes): `Supabase Auth`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 113`** (1 nodes): `Tenant`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 114`** (1 nodes): `API Key`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `RootLayout`, `AuthProvider`, `HomePage` to the rest of the system?**
  _46 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Web App Wallet UI & API Integration` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._