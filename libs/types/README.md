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

1. **Configure Nx project references**: Add proper project references in `apps/api/tsconfig.json` and `apps/admin/tsconfig.json` to reference the types library
2. **Unify module systems**: Either convert the entire monorepo to ES modules or properly configure composite builds
3. **Update imports**: Replace local type definitions in both apps with imports from `@walletOS/types`
4. **Build the types library**: Ensure the types library builds correctly before referencing it

Once complete, the graph will show clear dependency lines: `admin → types` and `api → types`, demonstrating the logical coupling through shared types.
