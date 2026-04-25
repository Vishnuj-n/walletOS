# WalletOS Global Standards

This project is a multi-tenant financial ledger built with Nx. 

## Architectural Rules
* The monorepo uses strict TypeScript.
* Developers isolate domain logic from the framework layer.
* Shared libraries contain only pure logic or types to prevent circular dependencies.
* Every feature requires automated tests before merging.

## Financial Integrity
* Follow a double-entry ledger mindset.
* Money never disappears. Every credit has a source and every debit has a destination.
* Data is immutable. Use reversals instead of deletions or updates on transaction records.
* Audit logs are mandatory for every state change.

## Security 
* Use SHA-256 for hashing high-entropy secrets like API keys.
* Never log PII or sensitive keys to the console.
* Assume all external input is malicious until validated.