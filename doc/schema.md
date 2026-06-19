# Schema.md

## Database Overview

WalletOS uses **PostgreSQL + Prisma ORM** with a multi-tenant architecture.  
Every core table is scoped to a `tenantId` for isolation.

The schema supports:

- Multi-tenant wallets
- Secure API key access
- Immutable financial transactions
- Audit logging
- Admin management
- Session tokens
- Webhook delivery system

---

# Core Design Principles

## Multi-Tenant Isolation

Every important entity belongs to a tenant:

- Wallets
- Transactions
- API Keys
- Admin Users
- Audit Logs
- Webhooks

## Financial Integrity

- Wallet balances use `Decimal(20,4)`
- No float arithmetic
- Reversals instead of destructive edits
- Full before/after balances stored

## Security

- API keys stored as SHA-256 hash
- Session tokens stored as hash
- Role-based admin users

---

# Enums

## KeyScope

Defines API key permission level.

| Value | Meaning |
|------|---------|
| read_only | Can only fetch data |
| read_write | Can create financial actions |
| admin | Full tenant API access |

---

## AdminRole

Defines dashboard privileges. Rank hierarchy enforces minimum role access.

| Value | Meaning | Rank |
|-------|---------|------|
| support | View wallets, transactions, audit logs; manual credit/debit | 0 |
| finance | View + export reports, audit log export | 1 |
| tenant_admin | Tenant-scoped management, webhook CRUD, invite users | 2 |
| superadmin | Full internal control, cross-tenant operations, tenant CRUD | 3 |

---

## WalletStatus

| Value | Meaning |
|------|---------|
| active | Normal wallet |
| frozen | Transactions blocked |
| pending_closure | Awaiting closure |
| closed | Permanently closed |

---

## TransactionType

| Value | Meaning |
|------|---------|
| credit | Add funds |
| debit | Remove funds |
| reversal | Undo previous transaction |

---

# Tables

---

# Tenant

Stores each client/business using WalletOS.

| Field | Type |
|------|------|
| id | String |
| name | String |
| contactEmail | String? |
| config | Json? |
| createdAt | DateTime |
| updatedAt | DateTime |

## Relations

A tenant owns:

- API keys
- Admin users
- Wallets
- Transactions
- Audit logs
- Webhooks

---

# ApiKey

Stores tenant API credentials.

| Field | Type |
|------|------|
| id | String |
| tenantId | String |
| keyHash | String |
| prefix | String |
| scope | KeyScope |
| isSandbox | Boolean |
| isActive | Boolean |

## Notes

- Real key is never stored
- Only SHA-256 hash stored
- Prefix helps identify key quickly

---

# Wallet

Main user balance account.

| Field | Type |
|------|------|
| id | String |
| tenantId | String |
| externalUserId | String |
| label | String? |
| balance | Decimal(20,4) |
| currency | String |
| status | WalletStatus |
| isSandbox | Boolean |
| metadata | Json? |
| closureScheduledAt | DateTime? |

## Constraints

Unique:

```text
tenantId + externalUserId + isSandbox
```

---

# AdminUser

Dashboard admin users with local email/password authentication.

| Field | Type | Notes |
|-------|------|-------|
| id | String | Primary key (CUID) |
| publicId | String | Unique public identifier (adm_xxx) |
| tenantId | String | FK to Tenant |
| email | String | Unique admin email |
| passwordHash | String? | bcrypt hash (set during invite claim) |
| role | AdminRole | support, finance, tenant_admin, or superadmin |
| isActive | Boolean | Activation status (set to true after claim) |
| invitedAt | DateTime? | When invite was created |
| activatedAt | DateTime? | When user claimed invite |

## Unique Constraints

```text
email
publicId
```

## Relations

An admin user has:

- `verifications`: PendingVerification records (invite tokens)

## Invite Flow

1. **Superadmin/tenant_admin** invites via `POST /api/v1/admin/invite-user`
2. An `AdminUser` record is created with `isActive: false`, no `passwordHash`
3. A `PendingVerification` record stores the SHA-256 hashed invite token
4. Email sent via SMTP with activation link containing raw token
5. User claims via `POST /api/v1/auth/claim-account` with token + password
6. Password is bcrypt-hashed (cost factor 12) and stored in `passwordHash`
7. `AdminUser.isActive` set to `true`
8. `PendingVerification` record deleted

## Authentication

- **Login**: `POST /api/v1/auth/login` with email + password
- Password verified against `passwordHash` using bcryptjs.compare
- On success: `adm_` session token generated, SHA-256 hashed, stored in `SessionToken`
- Token scope: `admin:<adminUserId>`, expires in 24 hours
- All admin API requests use `Authorization: Bearer adm_xxx`

---

# SessionToken

Short-lived session tokens for both admin and end-user sessions.

| Field | Type | Notes |
|-------|------|-------|
| id | String | Primary key |
| tenantId | String | FK to Tenant |
| tokenHash | String | SHA-256 hash of raw token (unique) |
| scope | String | Identifies what the token accesses |
| expiresAt | DateTime | Token expiration |
| createdAt | DateTime | Creation timestamp |

## Token Types

| Prefix | scope pattern | Use | TTL |
|--------|--------------|-----|-----|
| `sess_` | `wallet:<walletId>:sandbox:0/1` | End-user wallet UI | 1 hour |
| `adm_` | `admin:<adminUserId>` | Admin dashboard API | 24 hours |

## Notes

- Raw token is never stored in the database
- Lookup is by SHA-256 hash only
- Expired tokens are cleaned up during login

---

# PendingVerification

One-time invite tokens for admin account activation.

| Field | Type | Notes |
|-------|------|-------|
| id | String | Primary key |
| email | String | FK to AdminUser.email (ON DELETE CASCADE) |
| tokenHash | String | SHA-256 hash of invite token (unique) |
| tenantId | String | FK to Tenant |
| expiresAt | DateTime | Token expiration (24 hours) |
| createdAt | DateTime | Creation timestamp |

## Notes

- Token is delivered via SMTP email to the admin user
- Raw token never stored; SHA-256 hash used for lookup
- Record is deleted atomically during account claim

---

# TenantConfig

Per-tenant configuration with CORS and wallet defaults.

| Field | Type | Notes |
|-------|------|-------|
| id | String | Primary key |
| tenantId | String | FK to Tenant (unique) |
| defaultCurrency | String | Default: "USD" |
| autoCreateWallet | Boolean | Auto-create wallet on first transaction |
| allowedOrigins | String[] | Per-tenant CORS origins |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

## CORS Resolution

1. Request `Origin` checked against `TenantConfig.allowedOrigins` for the tenant
2. If not matched, checked against env `CORS_ORIGINS` (comma-separated)
3. If neither matches, CORS is denied

---

# Transaction

Immutable financial event on a wallet. Never updated or deleted.

| Field | Type | Notes |
|-------|------|-------|
| id | String | Primary key (CUID) |
| publicId | String | Unique public identifier (txn_xxx) |
| tenantId | String | FK to Tenant |
| walletId | String | FK to Wallet |
| type | TransactionType | credit, debit, or reversal |
| amount | Decimal(20,4) | Transaction amount |
| currency | String | 3-letter currency code |
| balanceBefore | Decimal(20,4) | Wallet balance before transaction |
| balanceAfter | Decimal(20,4) | Wallet balance after transaction |
| referenceId | String? | External reference ID |
| idempotencyKey | String? | Deduplication key (unique per tenant) |
| metadata | Json? | Arbitrary metadata |
| createdAt | DateTime | Immutable creation timestamp |

## Constraints

```text
tenantId + idempotencyKey  (unique, for idempotency within 30-day window)
```

## Notes

- Transactions are **immutable** — never updated or deleted
- Reversals create a new transaction of type `reversal`, they don't modify the original
- Balance delta must equal `amount` for credits, `-amount` for debits

---

# AuditLog

Permanent record of all state changes across the system.

| Field | Type | Notes |
|-------|------|-------|
| id | String | Primary key |
| tenantId | String | FK to Tenant |
| entityType | String | Type of entity changed (wallet, admin_user, etc.) |
| entityId | String | ID of the entity |
| action | String | What action was performed |
| changes | Json? | Before/after state diff |
| actorId | String? | Who performed the action |
| actorType | String? | Actor category (admin, api_key, system) |
| actorRole | String? | Role stamped at action time (immutable) |
| isSandbox | Boolean | Whether action was in sandbox |
| timestamp | DateTime | When the change occurred |

## Notes

- **Immutable** — never updated or deleted
- `actorRole` is a snapshot of the admin's role at the time of action, not a live reference
- Separate `AdminAuditLog` table (in code) tracks cross-tenant superadmin actions

---

# Webhook

Registered webhook endpoint for outgoing event notifications.

| Field | Type | Notes |
|-------|------|-------|
| id | String | Primary key (CUID) |
| tenantId | String | FK to Tenant |
| url | String | Target URL for delivery |
| events | String[] | List of events to subscribe to |
| secret | String | HMAC-SHA256 signing secret |
| isActive | Boolean | Whether endpoint is active |
| lastAttempt | DateTime? | Last delivery attempt timestamp |
| failureCount | Int | Consecutive failure count (0 = healthy) |
| status | String | active or failed (circuit breaker) |
| idempotencyKey | String? | Deduplication key |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update |

## Relations

A webhook has:

- `deliveries`: WebhookDelivery records (attempt log)

## Circuit Breaker

- After **5 consecutive failures**, status is set to `failed`
- Delivery attempts stop until webhook is re-registered or reactivated
- Retry backoff: 30s → 2m → 15m → 2h

---

# WebhookDelivery

Delivery log for webhook events with retry tracking.

| Field | Type | Notes |
|-------|------|-------|
| id | String | Primary key |
| webhookId | String | FK to Webhook (ON DELETE CASCADE) |
| eventType | String | Event that triggered delivery |
| payload | Json | Full event payload |
| statusCode | Int? | HTTP response status |
| response | String? | Response body (truncated) |
| attemptNum | Int | Current attempt number |
| nextAttempt | DateTime? | Scheduled retry time |
| deliveredAt | DateTime? | When delivery succeeded |
| createdAt | DateTime | Creation timestamp |
| idempotencyKey | String? | Delivery deduplication key |

## Retry Backoff

| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | 30 seconds |
| 3 | 2 minutes |
| 4 | 15 minutes |
| 5 | 2 hours |

After 5 consecutive failures, the webhook's `status` is set to `failed` and no more retries are attempted (circuit breaker).