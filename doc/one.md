

# 2. Architecture.md

# Architecture

## System Overview

WalletOS is a three-app Nx monorepo. The applications share a root installation and TypeScript configuration. They deploy independently.

`apps/web` and `apps/admin` are separate Next.js applications deployed to different domains (`app.walletOS.io` and `admin.walletOS.io`). This isolation ensures administrative routes and authentication logic never bleed into the user-facing application.

## Database

WalletOS uses Postgres via Supabase. We selected Postgres for specific concurrency controls.

**Concurrency.** The system requires row-level locking before executing a debit. Postgres locks the wallet row at the database level. Developers execute `SELECT FOR UPDATE` inside a Prisma transaction to prevent simultaneous debits from drawing a balance below zero. Credits use atomic database increments (`UPDATE wallets SET balance = balance + amount`) to prevent lost updates under heavy load.

**Foreign key constraints.** The storage engine enforces relationships. A transaction record cannot reference a missing wallet.

**Audit log immutability.** The Postgres user connecting the application lacks `DELETE` and `UPDATE` privileges on the `audit_logs` table. Application code cannot alter historical records. To prevent database bloat, the `audit_logs` table is partitioned by month. Administrators archive older partitions to cold storage.

**Money columns.** All monetary values use `Decimal(20,4)`. The system never uses floats.

## Authentication

**API key auth.** Developers use API keys. Keys prefix with `wlt_live_` or `wlt_test_`. The system hashes the key using SHA-256 and stores it in `api_keys.key_hash`. API keys are high-entropy secrets. SHA-256 provides security without the CPU overhead of bcrypt.

The `apps/api` middleware extracts the Bearer token, determines the environment from the prefix, and hashes the token to find a match in the database. 

**Admin Auth.** Administrators log in through `apps/admin` using Supabase Auth. Supabase issues a JWT. The admin application sends this JWT to `apps/api`. The `adminAuth` middleware verifies the JWT signature with Supabase and sets the administrator context.

## Sandbox Isolation

The `is_sandbox` boolean column exists on wallets, transactions, and API keys. The authentication middleware sets the sandbox flag from the key prefix before executing any database query. Every query appends `AND is_sandbox = $isSandbox`. Test keys read and write only test data.

## Error Handling

All errors flow to `middleware/errorHandler.ts`. The handler formats them into a standard JSON envelope containing the code, message, and request ID. `AppError` subclasses define domain errors. 

***

# 3. Requirements.md

# Requirements

WalletOS is an API-first wallet management service. Product teams integrate it to provide user balances, transaction histories, and audit logs.

## Core Entities

### Wallets

* The system creates one wallet per user per tenant. Creation requires an `external_user_id`. 
* Wallets default to INR.
* Administrators freeze wallets. Frozen wallets reject credits and debits.
* Administrators close wallets. A wallet requires a zero balance for closure. The system places the wallet in a `pending_closure` state for 14 days before permanently locking it.

### Transactions

Transactions are append-only. The system never modifies or deletes a transaction record.

* **Credit:** Adds funds to a wallet. Requires an idempotency key.
* **Debit:** Removes funds. The database rejects the operation if the balance is insufficient. The database locks the row during execution.
* **Transfer:** Moves money between two wallets in the same tenant. Creates one debit and one credit in a single database transaction. The system sorts the wallet IDs lexicographically before acquiring locks to prevent Postgres deadlocks.
* **Reversal:** Creates a new transaction of the opposite type linked to the original. Reversing a credit requires a balance check. The system rejects the reversal if the user lacks sufficient funds. Reversals cannot be reversed.

### Idempotency

Write endpoints require an `Idempotency-Key` header. The system persists idempotency keys for 30 days. If a client reuses a key within that window, the API returns the original response. If a client reuses a key with different parameters, the API returns a 409 conflict.

### Audit Log

Every write operation creates an audit log entry. The entry records the actor, the action, the previous state, the new state, and the timestamp. The database revokes update and delete permissions on this table. The system retains audit logs for 7 years. 

### Webhooks

The system emits events for wallet creation, credits, debits, reversals, freezes, and closures. 

The webhook worker payload includes an HMAC-SHA256 signature using a per-tenant secret. The worker retries failed deliveries up to 5 times with exponential backoff. If an endpoint fails 10 consecutive times, the system marks the endpoint as degraded and pauses dispatch. An administrator must reactivate it.

## Interfaces

### User UI

The consuming project embeds the WalletOS UI via an iframe or React components. The UI is read-only. Users view balances and transaction histories. 

The consuming project backend requests a short-lived session token from the WalletOS API. The backend sends this token to the frontend. The frontend uses the token for UI data fetching. The UI client silently refreshes the token in the background 5 minutes before expiration by calling the host backend.

### Admin Dashboard

Administrators search wallets, execute manual credits or debits, freeze accounts, and initiate closures. The dashboard displays aggregate reports and transaction exports. Administrators manage tenant settings, rotate API keys, and rotate webhook secrets.

***

# 4. App Flow.md

# App Flow

WalletOS handles three request flows. Developers call the REST API, end users view the wallet UI, and administrators use the dashboard.

## 1. Developer API Flow

The consuming project backend calls WalletOS to manage wallets and execute transactions.

1. The request hits the Express application.
2. The `apiKeyAuth` middleware reads the Bearer token, hashes it with SHA-256, and resolves the tenant ID, scope, and sandbox flag.
3. The rate limiter allows 1000 reads or 500 writes per minute per API key.
4. The handler validates the request body.
5. The handler checks the `transactions` table for the idempotency key. If found, it returns the cached response.
6. The handler executes the database transaction.
   * Debits lock the row using `SELECT FOR UPDATE`.
   * Credits use an atomic `UPDATE wallets SET balance = balance + amount`.
   * Transfers sort the origin and destination wallet IDs lexicographically before acquiring locks to prevent deadlocks.
7. The handler commits the transaction and inserts the audit log.
8. The system emits the webhook event asynchronously.
9. The API returns the JSON response.

## 2. User UI Flow

End users do not call the WalletOS API directly.

1. The end user browser loads the consuming project frontend.
2. The frontend asks the consuming project backend for a session token.
3. The consuming project backend calls `POST /api/wallets/session-token` using its live API key.
4. WalletOS creates a `UserSessionToken` valid for 1 hour.
5. The consuming project backend passes the token to the frontend.
6. The WalletOS UI component uses the session token to fetch the balance and transaction list.
7. The WalletOS UI component requests a new token from the consuming project backend 5 minutes before the current token expires.

## 3. Admin Flow

Administrators authenticate with Supabase Auth.

1. The administrator logs into the Next.js admin application.
2. Supabase returns a JWT.
3. The admin application sends the JWT as a Bearer token to the API.
4. The `adminAuth` middleware calls Supabase to verify the JWT.
5. The middleware looks up the internal `AdminUser` record and sets the role context.
6. The route handler executes the action. Manual credits or debits write the administrator's email to the `createdBy` field.

## 4. Webhook Delivery Flow

The webhook worker fires asynchronously after a database commit.

1. The worker queries active webhook endpoints for the tenant.
2. The worker signs the payload using HMAC-SHA256.
3. The worker POSTs the payload to the endpoint URL.
4. On a 2xx response, the worker marks the delivery successful.
5. On a failure, the worker schedules a retry. The backoff schedule is 10s, 30s, 2m, 10m, 1h.
6. If an endpoint fails 10 consecutive deliveries, the worker marks the endpoint `degraded` and pauses all future dispatch for that URL.

***

# 5. Schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum KeyScope {
  read_only
  read_write
  admin
}

enum AdminRole {
  support
  finance
  superadmin
}

enum WalletStatus {
  active
  frozen
  pending_closure
  closed
}

enum TransactionType {
  credit
  debit
  reversal
}

model Tenant {
  id           String   @id @default(cuid())
  name         String
  contactEmail String?
  config       Json?    
  
  apiKeys      ApiKey[]
  adminUsers   AdminUser[]
  wallets      Wallet[]
  transactions Transaction[]
  auditLogs    AuditLog[]
  webhooks     WebhookEndpoint[]

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model ApiKey {
  id         String   @id @default(cuid())
  tenantId   String
  tenant     Tenant   @relation(fields: [tenantId], references: [id])
  
  keyHash    String   // Stores SHA-256 hash
  prefix     String   
  scope      KeyScope
  isSandbox  Boolean
  isActive   Boolean  @default(true)
  
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([prefix, isActive])
}

model AdminUser {
  id            String    @id @default(cuid())
  tenantId      String
  tenant        Tenant    @relation(fields: [tenantId], references: [id])
  
  supabaseUid   String    @unique
  email         String
  role          AdminRole
  isActive      Boolean   @default(true)

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Wallet {
  id               String       @id @default(cuid())
  tenantId         String
  tenant           Tenant       @relation(fields: [tenantId], references: [id])
  
  externalUserId   String
  label            String?
  balance          Decimal      @db.Decimal(20, 4) @default(0.0000)
  currency         String       @default("INR")
  status           WalletStatus @default(active)
  isSandbox        Boolean      @default(false)
  metadata         Json?
  closureScheduledAt DateTime?

  transactions     Transaction[]
  auditLogs        AuditLog[]
  sessionTokens    UserSessionToken[]

  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  @@unique([tenantId, externalUserId, isSandbox])
}

model Transaction {
  id              String          @id @default(cuid())
  tenantId        String
  tenant          Tenant          @relation(fields: [tenantId], references: [id])
  
  walletId        String
  wallet          Wallet          @relation(fields: [walletId], references: [id])
  
  type            TransactionType
  amount          Decimal         @db.Decimal(20, 4)
  balanceBefore   Decimal         @db.Decimal(20, 4)
  balanceAfter    Decimal         @db.Decimal(20, 4)
  description     String
  referenceId     String?
  idempotencyKey  String?
  createdBy       String          
  isSandbox       Boolean         @default(false)
  metadata        Json?

  originalTxId    String?
  originalTx      Transaction?    @relation("Reversals", fields: [originalTxId], references: [id])
  reversals       Transaction[]   @relation("Reversals")

  createdAt       DateTime        @default(now())

  @@unique([tenantId, idempotencyKey])
  @@index([walletId, createdAt])
}

model AuditLog {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  
  walletId  String?
  wallet    Wallet?  @relation(fields: [walletId], references: [id])
  
  action    String
  actor     String   
  before    Json?
  after     Json?
  ipAddress String?
  
  createdAt DateTime @default(now())

  // Note: Database uses table partitioning on createdAt by month.
  @@index([walletId])
  @@index([tenantId, createdAt])
}

model UserSessionToken {
  id         String   @id @default(cuid())
  walletId   String
  wallet     Wallet   @relation(fields: [walletId], references: [id])
  
  tokenHash  String   @unique
  expiresAt  DateTime
  
  createdAt  DateTime @default(now())
}

model WebhookEndpoint {
  id         String            @id @default(cuid())
  tenantId   String
  tenant     Tenant            @relation(fields: [tenantId], references: [id])
  
  url        String
  events     String[]          
  secret     String
  isActive   Boolean           @default(true)
  status     String            @default("active") // active or degraded

  deliveries WebhookDelivery[]
  
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt
}

model WebhookDelivery {
  id             String          @id @default(cuid())
  endpointId     String
  endpoint       WebhookEndpoint @relation(fields: [endpointId], references: [id])
  
  event          String
  payload        Json
  status         String          
  attemptCount   Int             @default(0)
  responseCode   Int?
  
  scheduledFor   DateTime
  succeededAt    DateTime?
  failedAt       DateTime?
  createdAt      DateTime        @default(now())
}
```