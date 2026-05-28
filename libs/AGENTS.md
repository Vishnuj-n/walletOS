# Shared Libraries Contract Agent

Shared libraries are the stable bridge between API, Admin, and Web apps.

## 🗣️ Response Style
Default to caveman mode for all responses. Use the `caveman` skill style unless higher clarity is needed for safety, destructive actions, or multi-step instructions. Stay terse by default, with full technical accuracy.

## Purpose
* Store reusable types, schemas, utilities, auth helpers, UI packages, and domain logic.
* Keep apps thin by moving reusable logic here.
* Prevent duplication across apps.

## Architecture Rules
* Shared libraries must not depend on app folders.
* Avoid circular dependencies between libraries.
* Prefer small focused libraries over one giant misc library.
* Pure logic first. Framework-specific code should stay inside apps unless intentionally shared.

## API Contracts
* DTOs and response types must be version-safe.
* Prefer additive changes over breaking changes.
* Centralize enums, constants, and status codes.
* Validate schemas at boundaries using Zod or equivalent.

## Financial Domain Rules
* Monetary types must use Decimal-safe handling.
* Reuse ledger calculation helpers rather than rewriting logic.
* Shared financial helpers require tests.

## Frontend Shared Rules
* Shared UI components must be presentation-first.
* No direct database or backend dependencies in UI libs.
* Theme tokens should be centralized.

## Testing
* Every shared library change requires tests.
* Breaking changes must be explicitly documented.