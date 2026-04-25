# WalletOS API Postman Collection

This directory contains Postman collections for manual regression testing of the WalletOS API.

## Setup

1. Import the collection file `WalletOS_API_Tests.postman_collection.json` into Postman
2. Configure the following environment variables:
   - `baseUrl`: The base URL of your API (default: `http://localhost:3333`)
   - `apiKey`: Your test API key (generate from your tenant)
   - `walletId`: Will be auto-populated after creating a wallet
   - `transactionId`: Will be auto-populated after creating a transaction

## Collection Structure

### Wallet Operations
- Create Wallet
- Get Wallet by ID
- Get Wallet by External User ID
- Update Wallet
- Freeze Wallet
- Unfreeze Wallet
- Close Wallet

### Transaction Operations
- Credit Wallet
- Debit Wallet
- Transfer Between Wallets
- Reverse Transaction
- Get Transaction by ID
- List Transactions

### Test Scenarios
- Duplicate Wallet Rejection - Tests that creating a wallet with the same external_user_id fails
- Insufficient Funds Test - Tests that debiting more than available balance fails
- Idempotency Test - Tests that duplicate requests with the same idempotency key return the original response
- Frozen Wallet Test - Tests that transactions are rejected on frozen wallets
- Invalid Amount Test - Tests that zero and negative amounts are rejected

## Usage

1. Run the "Create Wallet" request first to get a wallet ID
2. Use the wallet ID in subsequent requests
3. For transaction tests, run credit operations first to fund the wallet
4. Use the transaction ID from responses for reversal tests

## Running Tests

You can run individual requests or entire folders as collections in Postman Runner.

## Notes

- All write operations require an `Idempotency-Key` header
- The collection uses Postman variables for dynamic values
- Update the `apiKey` variable with your actual test API key before running tests
- Ensure your API server is running before executing requests
