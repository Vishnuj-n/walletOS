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

Defines dashboard privileges.

| Value | Meaning |
|------|---------|
| support | Support operations |
| finance | Financial operations |
| superadmin | Full internal control |

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

Dashboard admin users linked to Supabase authentication.

| Field | Type | Notes |
|-------|------|-------|
| id | String | Primary key |
| tenantId | String | FK to Tenant |
| supabaseUid | String | Supabase auth user ID; must match auth.users.id |
| email | String | Admin email |
| role | AdminRole | support, finance, or superadmin |
| isActive | Boolean | Activation status |

## Unique Constraint

```text
tenantId + supabaseUid
```

Ensures one admin per Supabase user per tenant.

## Notes

- **Authentication**: Admin users authenticate via Supabase JWT (not API keys)
- **Role hierarchy**: support < finance < superadmin
- **Superadmin tasks**: cross-tenant wallets, create tenants, view system balance, audit logs
- **Setup**: Create Supabase auth user first, then insert AdminUser record with matching `supabaseUid`