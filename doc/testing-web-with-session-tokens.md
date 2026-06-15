# Testing the Wallet Web Embed with Short-Lived Session Tokens

## Overview

The `apps/web` wallet is a **read-only embed** that authenticates via short-lived session tokens (`sess_...`). You generate these tokens from the API using a privileged API key, then pass the token to the web app via URL query param.

## Prerequisites

- API server running on `http://localhost:3333`
- Web app running on `http://localhost:3000`
- An API key with `read_write` or `admin` scope (sandbox keys won't work—they can only be used for their own operations)

## Step 1: Generate an API Key

If you don't have one, create a tenant + API key:

```bash
npx dotenv-cli -e .env -- npx ts-node apps/api/src/scripts/generate-key.ts
```

Output looks like:

```text
Created tenant "Default Tenant" (tnt_live_abc123...)
API Key: wlt_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Copy the API key — you'll use it in Postman.

## Step 2: Create a Wallet

You need a wallet ID before you can create a session token.

**In Postman**, send:

```http
POST {{baseUrl}}/api/v1/wallets
x-api-key: {{apiKey}}
Content-Type: application/json

{
  "external_user_id": "test-user-1",
  "label": "Test Wallet",
  "currency": "USD"
}
```

Save the returned `wallet_id` from the response — that's your `walletId`.

*(If you already have a wallet, skip this step.)*

## Step 3: Create a Session Token (via Postman)

In the WalletOS API Postman collection (`apps/api/postman/WalletOS_API_Tests.postman_collection.json`):

1. Import the collection into Postman
2. Set collection variables:
   - `baseUrl` → `http://localhost:3333`
   - `apiKey` → the key from Step 1
   - `walletId` → the wallet ID from Step 2
3. Navigate to **Authentication > Create Session Token** and **Send**

**Raw request equivalent:**

```http
POST {{baseUrl}}/api/v1/auth/session
x-api-key: {{apiKey}}
Content-Type: application/json

{
  "wallet_id": "wal_abc123..."
}
```

**Response:**

```json
{
  "token": "sess_<64-hex-chars>",
  "expires_at": "2026-06-15T21:06:00.000Z",
  "wallet": {
    "id": "wal_abc123...",
    "externalUserId": "test-user-1",
    "label": "Test Wallet",
    "balance": 0,
    "currency": "USD",
    "status": "active",
    "isSandbox": false,
    "metadata": null
  }
}
```

The session token expires in **1 hour**.

## Step 4: Load the Web Wallet with the Token

Open in your browser:

```text
http://localhost:3000?token=sess_<64-hex-chars>
```

The web app reads the `token` query param (also accepts `session_token` or `session`), stores it in `localStorage`, and uses it for all API calls (`GET /auth/session/profile`, `GET /wallets/:id`, `GET /transactions`).

Full URL example:

```text
http://localhost:3000?token=sess_4f8a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a
```

You should see the wallet dashboard with the balance and transaction list.

## Quickstart Script (PowerShell)

```powershell
# 1. Set vars
$apiKey = "wlt_live_YOUR_API_KEY"
$baseUrl = "http://localhost:3333/api/v1"
$webUrl  = "http://localhost:3000"

# 2. Create a wallet (if needed)
$wallet = Invoke-RestMethod -Uri "$baseUrl/wallets" -Method Post `
  -Headers @{"x-api-key" = $apiKey} `
  -Body (@{external_user_id="test-user-1"; label="Test Wallet"; currency="USD"} | ConvertTo-Json) `
  -ContentType "application/json"
$walletId = $wallet.wallet_id
Write-Host "Wallet: $walletId"

# 3. Create session token
$session = Invoke-RestMethod -Uri "$baseUrl/auth/session" -Method Post `
  -Headers @{"x-api-key" = $apiKey} `
  -Body (@{wallet_id = $walletId} | ConvertTo-Json) `
  -ContentType "application/json"
Write-Host "Token: $($session.token)"
Write-Host "Expires: $($session.expires_at)"

# 4. Open browser
Start-Process "${webUrl}?token=$($session.token)"
```

## Token Lifecycle

| Aspect | Detail |
|---|---|
| Prefix | `sess_` |
| Expiry | 1 hour from creation |
| Storage (web) | `localStorage` under `walletos.session.token` |
| Read expiry (web) | `localStorage` under `walletos.session.expires_at` |
| Web token detection | URL params: `token`, `session_token`, or `session` |
| Regeneration | Create a new token via `POST /auth/session` and reload the URL |

## Troubleshooting

| Error | Likely Cause |
|---|---|
| `wallet_id is required` | Missing `wallet_id` in POST body |
| `Wallet not found` | Wallet belongs to a different tenant or is sandbox-only |
| `API key scope does not allow issuing session tokens` | API key is `read_only` — use a `read_write` or `admin` key |
| `Invalid session token format` | Token doesn't start with `sess_` |
| `401 Unauthorized` on profile | Token expired or invalid — generate a new one |
| Blank page / no wallet data | Web server can't reach API — check `NEXT_PUBLIC_API_URL` |
