# Data API

Base URL: `https://api.walletOS.io/v1`

All requests require `Authorization: Bearer wlt_live_xxx` or `Authorization: Bearer wlt_test_xxx`. Write endpoints additionally require an `Idempotency-Key` header.

All responses are JSON. Errors use the envelope:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Wallet balance is too low for this debit.",
    "request_id": "req_a1b2c3d4e5f6g7h8"
  }
}
```

Pagination uses cursors. All list endpoints accept `limit` (max 100, default 20) and `after` (cursor from previous response). Responses include `next_cursor: null` when there are no more pages.

---

## Rate limits

| Endpoint type | Limit |
|---|---|
| Read (GET) | 1,000 req/min per API key |
| Write (POST, PATCH, DELETE) | 500 req/min per API key |

Headers on every response: `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Exceeded: HTTP 429 `RATE_LIMIT_EXCEEDED`.

---

## Wallets

### POST /wallets

Create a wallet for a user. Requires `read_write` scope.

**Request**
```json
{
  "external_user_id": "user_123",
  "currency": "INR",
  "label": "Cashback Wallet",
  "metadata": {}
}
```

**Parameters**

| Field | Type | Required | Description |
|---|---|---|---|
| `external_user_id` | string | Yes | Unique identifier for the user in the tenant's system |
| `currency` | string | Yes | 3-letter currency code (e.g., "INR", "USD") |
| `label` | string | No | Human-readable label for the wallet |
| `metadata` | object | No | Arbitrary JSON metadata for the wallet |

`currency` is required. `label` and `metadata` are optional.

**Response 201**
```json
{
  "wallet_id": "clxyz...",
  "external_user_id": "user_123",
  "label": "Cashback Wallet",
  "balance": "0.0000",
  "currency": "INR",
  "status": "active",
  "is_sandbox": false,
  "metadata": {},
  "created_at": "2025-06-01T10:00:00.000Z"
}
```

**Errors**

| Code | HTTP | Condition |
|---|---|---|
| `WALLET_ALREADY_EXISTS` | 409 | A wallet already exists for this `external_user_id` in this tenant and environment |
| `VALIDATION_ERROR` | 400 | Missing required fields or invalid currency |

---

### GET /wallets/:walletId

Fetch wallet by ID. Requires `read_only` or higher.

**Response 200**
```json
{
  "wallet_id": "clxyz...",
  "external_user_id": "user_123",
  "label": "Cashback Wallet",
  "balance": "1250.0000",
  "currency": "INR",
  "status": "active",
  "is_sandbox": false,
  "metadata": {},
  "created_at": "2025-06-01T10:00:00.000Z",
  "updated_at": "2025-06-15T14:22:00.000Z"
}
```

**Errors:** `NOT_FOUND` (404), `TENANT_ISOLATION` (403)

---

### GET /wallets/user/:externalUserId

Fetch wallet by `external_user_id` within the authenticated tenant. Requires `read_only` or higher.

Same response shape as above.

---

### PATCH /wallets/:walletId

Update `label` or `metadata`. Balance and status cannot be changed via this endpoint. Requires `read_write` scope.

**Request**
```json
{
  "label": "Rewards Wallet",
  "metadata": { "program": "loyalty_v2" }
}
```

**Response 200** — full wallet object.

---

### POST /wallets/:walletId/freeze

Freeze a wallet. Frozen wallets reject all credits and debits. Requires `admin` scope.

**Request**
```json
{
  "reason": "Suspected fraudulent activity"
}
```

`reason` is required.

**Response 200** — full wallet object with `status: "frozen"`.

**Errors:** `NOT_FOUND` (404), `WALLET_ALREADY_FROZEN` (409)

---

### POST /wallets/:walletId/unfreeze

Restore a frozen wallet to active. Requires `admin` scope.

**Request**
```json
{
  "reason": "Investigation concluded, no fraud found"
}
```

**Response 200** — full wallet object with `status: "active"`.

---

### POST /wallets/:walletId/close

Permanently close a wallet. Only allowed when `balance = 0.0000`. Irreversible. Requires `admin` scope. The system supports a `pending_closure` status with a grace period to allow account recovery before permanent closure.

**Request**
```json
{
  "reason": "User requested account closure"
}
```

**Response 200** — full wallet object with `status: "closed"`.

**Errors:** `WALLET_BALANCE_NOT_ZERO` (422), `WALLET_ALREADY_CLOSED` (409)

---

### GET /wallets

List all wallets for the tenant. Admin-only endpoint (requires Supabase admin auth, not an API key).

**Query params:** `status`, `currency`, `from` (ISO date), `to` (ISO date), `limit`, `after`

**Response 200**
```json
{
  "data": [ /* wallet objects */ ],
  "next_cursor": "clxyz...",
  "total": 4821
}
```

---

### POST /api/v1/auth/session

Issue a short-lived session token for the user-facing UI. Server-to-server only. Requires `read_write` scope.

**Request**
```json
{
  "wallet_id": "clxyz..."
}
```

**Response 200**
```json
{
  "token": "sess_xxx",
  "expires_at": "2025-06-01T11:00:00.000Z",
  "wallet_id": "clxyz..."
}
```

Token expires in 1 hour. Scoped to the one `wallet_id`. The consuming project sends this to their frontend. The live API key never leaves the server. The authentication flow includes a silent background refresh mechanism to maintain session continuity.

---

## Admin API

Admin routes use Supabase JWTs, not API keys. Requests must send `Authorization: Bearer <admin_jwt>`.

Role hierarchy:

- `support` < `finance` < `superadmin`

Selected routes:

- `GET /admin/me` - current admin identity and role
- `GET /admin/audit` - tenant-scoped audit logs
- `GET /admin/tenants` - list all tenants, superadmin only
- `POST /admin/tenants` - create a tenant, superadmin only
- `POST /admin/tenants/:tenantId/rotate-key` - rotate a tenant API key, superadmin only
- `POST /admin/tenants/:tenantId/revoke-key` - revoke a tenant API key, superadmin only
- `GET /admin/audit/admin-activity` - cross-tenant admin activity, superadmin only
- `GET /admin/system/errors` - recent system errors, superadmin only
- `GET /admin/search/wallets` - cross-tenant wallet search, superadmin only
- `GET /admin/search/transactions` - transaction tracer, superadmin only
- `GET /admin/system/balance` - total live and sandbox balances across all tenants, superadmin only

Sandbox mode for admin routes is controlled with `X-Sandbox: true`.

---

## Transactions

All write endpoints require `Idempotency-Key` header. Max 255 characters. The database enforces a permanent unique constraint on the tenant ID and idempotency key combination. If reused with the same parameters, the original response is returned. If reused with different parameters, returns 409 `IDEMPOTENCY_CONFLICT`.

### POST /transactions/credit

Credit a wallet. Requires `read_write` scope. The wallet row is locked with `SELECT FOR UPDATE` before the credit to prevent lost updates under load.

**Headers:** `Idempotency-Key: order_789_credit`

**Request**
```json
{
  "wallet_id": "clxyz...",
  "amount": "250.00",
  "description": "Cashback for order #789",
  "reference_id": "order_789",
  "metadata": { "order_total": "2500.00" }
}
```

`amount` must be positive. `description` is required. `reference_id` and `metadata` are optional.

**Response 201**
```json
{
  "transaction_id": "clabc...",
  "wallet_id": "clxyz...",
  "type": "credit",
  "amount": "250.0000",
  "balance_before": "1000.0000",
  "balance_after": "1250.0000",
  "description": "Cashback for order #789",
  "reference_id": "order_789",
  "idempotency_key": "order_789_credit",
  "created_by": "api_key:clkeyid...",
  "is_sandbox": false,
  "metadata": { "order_total": "2500.00" },
  "created_at": "2025-06-15T14:22:00.000Z"
}
```

**Errors:** `WALLET_FROZEN` (409), `WALLET_CLOSED` (409), `NOT_FOUND` (404), `IDEMPOTENCY_CONFLICT` (409)

---

### POST /transactions/debit

Debit a wallet. Requires `read_write` scope. The wallet row is locked with `SELECT FOR UPDATE` before the balance check.

**Headers:** `Idempotency-Key: checkout_456_debit`

**Request**
```json
{
  "wallet_id": "clxyz...",
  "amount": "500.00",
  "description": "Purchase at checkout #456",
  "reference_id": "checkout_456"
}
```

**Response 201** — same shape as credit with `type: "debit"`.

**Errors:** `INSUFFICIENT_BALANCE` (422), `WALLET_FROZEN` (409), `WALLET_CLOSED` (409), `NOT_FOUND` (404), `IDEMPOTENCY_CONFLICT` (409)

---

### POST /transactions/transfer

Transfer between two wallets in the same tenant. Both succeed or both roll back. Requires `read_write` scope. The application sorts the wallet IDs lexicographically before acquiring database locks to prevent deadlocks.

**Headers:** `Idempotency-Key: transfer_from_aaa_to_bbb_20250615`

**Request**
```json
{
  "from_wallet_id": "claaa...",
  "to_wallet_id": "clbbb...",
  "amount": "100.00",
  "description": "Reward transfer",
  "reference_id": "transfer_ref_001"
}
```

**Response 201**
```json
{
  "debit_transaction": { /* full transaction object */ },
  "credit_transaction": { /* full transaction object */ }
}
```

**Errors:** `INSUFFICIENT_BALANCE` (422), `WALLET_FROZEN` (409), `CROSS_TENANT_TRANSFER` (403), `NOT_FOUND` (404)

---

### POST /transactions/:txId/reverse

Reverse a credit or debit. Creates a new transaction of the opposite type. Cannot reverse a reversal. Requires `read_write` scope. The system executes a balance check during reversal to prevent pushing the user balance below zero.

**Headers:** `Idempotency-Key: reverse_clabc_20250615`

**Request**
```json
{
  "reason": "Customer reported incorrect charge"
}
```

**Response 201**
```json
{
  "transaction_id": "clrev...",
  "type": "reversal",
  "original_tx_id": "clabc...",
  "amount": "250.0000",
  "balance_before": "1000.0000",
  "balance_after": "1250.0000",
  "description": "Reversal of: Cashback for order #789",
  "created_at": "2025-06-15T15:00:00.000Z"
}
```

**Errors:** `CANNOT_REVERSE_REVERSAL` (409), `NOT_FOUND` (404), `WALLET_FROZEN` (409)

---

### GET /transactions/:txId

Fetch a single transaction. Returns all fields including linked reversals.

**Response 200** — full transaction object. If the transaction is a reversal, includes `original_tx` object nested. If it has been reversed, includes `reversals: [...]`.

---

### GET /transactions

Paginated transaction list for a wallet.

**Query params:**
- `wallet_id` (required)
- `type`: `credit`, `debit`, `reversal`
- `from`, `to`: ISO dates
- `min_amount`, `max_amount`
- `reference_id`
- `limit`, `after`

**Response 200**
```json
{
  "data": [ /* transaction objects */ ],
  "next_cursor": "clabc...",
  "total": 143
}
```

---

## Webhooks

### POST /webhooks

Register a webhook endpoint. Requires `admin` scope.

**Request**
```json
{
  "url": "https://yourproject.io/webhooks/wallet",
  "events": ["wallet.credited", "wallet.debited", "wallet.frozen"]
}
```

**Response 201**
```json
{
  "endpoint_id": "clwh...",
  "url": "https://yourproject.io/webhooks/wallet",
  "events": ["wallet.credited", "wallet.debited", "wallet.frozen"],
  "secret": "whsec_xxx",
  "created_at": "2025-06-01T10:00:00.000Z"
}
```

`secret` is shown once. Store it. Use it to verify the `X-WalletOS-Signature` header on incoming webhook payloads.

**Verifying a payload:**
```
expected = HMAC-SHA256(secret, raw_request_body)
received = X-WalletOS-Signature header value
valid = timingSafeEqual(expected, received)
```

---

### GET /webhooks

List all webhook endpoints for the tenant. Requires `read_only` or higher.

---

### DELETE /webhooks/:endpointId

Deactivate a webhook endpoint. Requires `admin` scope.

---

### POST /webhooks/:endpointId/test

Send a sample `wallet.credited` payload to the endpoint. Requires `admin` scope.

---

### GET /webhooks/:endpointId/deliveries

Delivery log for an endpoint. Returns attempt history with status codes and timestamps. The system implements a circuit breaker that marks unresponsive endpoints as `degraded` and pauses dispatching to prevent queue blocking.

---

## Webhook payload shape

All webhook payloads follow this envelope:

```json
{
  "event": "wallet.credited",
  "tenant_id": "cltenant...",
  "timestamp": "2025-06-15T14:22:00.000Z",
  "data": {
    "wallet": { /* wallet object */ },
    "transaction": { /* transaction object, where applicable */ }
  }
}
```

---

## Audit log (admin only)

All audit endpoints require Supabase admin auth.

### GET /audit

Query the audit log.

**Query params:** `wallet_id`, `actor`, `action`, `from`, `to`, `limit`, `after`

**Response 200**
```json
{
  "data": [
    {
      "id": "claudit...",
      "tenant_id": "cltenant...",
      "wallet_id": "clxyz...",
      "action": "wallet.frozen",
      "actor": "admin:support@company.io",
      "before": { "status": "active" },
      "after": { "status": "frozen" },
      "ip_address": "203.0.113.42",
      "created_at": "2025-06-15T14:22:00.000Z"
    }
  ],
  "next_cursor": "claudit2..."
}
```

### GET /audit/export

Stream audit log as CSV for a date range. No pagination — full export.

**Query params:** `wallet_id` (optional), `from` (required), `to` (required)

Response: `Content-Type: text/csv` with `Content-Disposition: attachment; filename=audit_export.csv`

---

## Error codes reference

| Code | HTTP | Meaning |
|---|---|---|
| `INSUFFICIENT_BALANCE` | 422 | Debit amount exceeds current balance |
| `WALLET_FROZEN` | 409 | Wallet is frozen, no credits or debits accepted |
| `WALLET_CLOSED` | 409 | Wallet is permanently closed |
| `WALLET_ALREADY_EXISTS` | 409 | Wallet already exists for this user in this tenant/environment |
| `WALLET_BALANCE_NOT_ZERO` | 422 | Cannot close a wallet with a non-zero balance |
| `IDEMPOTENCY_CONFLICT` | 409 | Idempotency key reused with different parameters |
| `CANNOT_REVERSE_REVERSAL` | 409 | Cannot create a reversal of a reversal |
| `CROSS_TENANT_TRANSFER` | 403 | Transfer targets a wallet in a different tenant |
| `TENANT_ISOLATION` | 403 | Resource does not belong to the authenticated tenant |
| `NOT_FOUND` | 404 | Resource does not exist |
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `FORBIDDEN` | 403 | API key scope insufficient for this action |
| `RATE_LIMIT_EXCEEDED` | 429 | Request rate exceeded |
| `VALIDATION_ERROR` | 400 | Request body failed validation |
| `INTERNAL_ERROR` | 500 | Unexpected server error |