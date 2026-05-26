# types

This library was generated with [Nx](https://nx.dev).

## Building

Run `nx build types` to build the library.

## Running unit tests

Run `nx test types` to execute the unit tests via [Jest](https://jestjs.io).

## Shared API Types

This library serves as the single source of truth for shared TypeScript type definitions across the WalletOS monorepo. Following Nx monorepo best practices, both `apps/api` and `apps/admin` should import types from here to establish clear dependency relationships in the codebase graph.

### Available Types

**Transaction Types:**
- `TransactionMetadata` - Additional metadata for transactions
- `TransactionResponse` - API response structure for transactions
- `ListTransactionsQuery` - Query parameters for transaction listing

**Wallet Types:**
- `Wallet` - Wallet entity structure
- `WalletListResponse` - Paginated wallet list response
- `CreateWalletRequest` - Request to create a wallet
- `UpdateWalletRequest` - Request to update wallet
- `FreezeWalletRequest` - Request to freeze a wallet

**Audit Types:**
- `AuditLog` - Audit log entry structure
- `AuditLogListResponse` - Paginated audit log response

**Transaction Request Types:**
- `CreditTransactionRequest` - Credit transaction request
- `DebitTransactionRequest` - Debit transaction request
- `ReversalTransactionRequest` - Transaction reversal request

### Current Implementation Status

**Shared types are defined here as the source of truth.**

The actual imports into `apps/api` and `apps/admin` are currently deferred due to TypeScript configuration complexity:
- Module system mismatch: `libs/types` uses CommonJS while `apps/admin` uses ES modules
- Nx project reference configuration requires proper composite project setup
- Path mapping in `tsconfig.base.json` needs project references to resolve correctly

### Next Steps to Complete Monorepo Best Practices

1. **Verify project wiring**: Confirm `apps/api/tsconfig.json` and `apps/admin/tsconfig.json` keep `@walletos/types` in the workspace build graph through references or path mapping.
2. **Build the types library**: Keep `@walletos/types` building cleanly so both apps consume the shared contract instead of drifting copies.
3. **Document any module-format follow-up**: Record only the remaining ESM/CJS work that still blocks publishing or runtime consumption.

The repo has already moved past deferred shared imports: `api` and `admin` should treat `@walletos/types` as the common source of truth.
