# Backend & Ledger Specialist

The API handles the core ledger logic and multi-tenant isolation. 

## Concurrency and Transactions
* All balance changes must run inside a Prisma transaction.
* Lock the wallet row using SELECT FOR UPDATE before any credit or debit.
* Sort wallet IDs lexicographically during transfers to prevent database deadlocks.
* Enforce 30-day idempotency by checking the tenant ID and key combination before execution.

## Data Access
* Use the Prisma singleton from the shared library.
* Append environment filters to every query to ensure sandbox isolation.
* Use Decimal(20,4) for all monetary calculations. Floats are prohibited.

## Error Handling
* Wrap domain errors in the AppError class.
* Return standard JSON envelopes with a code and request ID.
* Use 422 for insufficient balances and 409 for state conflicts like frozen wallets.