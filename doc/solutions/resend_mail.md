# Resend Tenant Bootstrap Invite — Walkthrough

## What problem does this solve?

When a superadmin creates a tenant with a `contact_email`, WalletOS auto-generates
a **bootstrap invite** — a time-limited token emailed to that address so the tenant
owner can claim their account. If the link expires or lands in spam, there was no way
to resend it. This feature adds that capability.

---

## Full Request Flow

```
Superadmin clicks "Resend Claim Email"
       │
       ▼
[Admin UI — page.tsx]
handleResendTenantInvite(tenant)
  │  guard: tenant.contact_email must exist
  │  sets actionLoading state
       │
       ▼
[adminService.ts]
resendTenantInvite(tenantId)
  POST /admin/tenants/:tenantId/resend-invite
  headers: Authorization + Idempotency-Key
       │
       ▼
[API — admin.routes.ts]
requireAdminRole('superadmin')          ← 403 if not superadmin
       │
       ▼
prisma.tenant.findUnique(tenantId)      ← 404 if not found
       │
       ▼
guard: contactEmail must exist          ← 400 if missing
       │
       ▼
guard: inactive adminUser with          ← 409 if none found
       email === contactEmail
       │
       ▼
prisma.$transaction([
  deleteMany pendingVerification        ← rotate: kill old token
    where { tenantId, email }
  create pendingVerification            ← new SHA-256 hashed token
    { tokenHash, expiresAt: +24h }      ← raw token never stored
  create auditLog                       ← action: tenant.bootstrap_invite_resent
    { actorId, changes: { contact_email,  admin_user_id, resent_by, token_hash } }
])
       │
       ▼
sendInviteEmail(tenantId, email, rawToken)
  builds activation URL: /claim?token=<rawToken>
  sends via nodemailer SMTP
       │
       ▼
res 200 { tenant_id, contact_email, message }
  ← rawToken NOT in response
       │
       ▼
[Admin UI]
setAlertModal({ message, type: 'success' })
refetch() ← tenant list reloads
```

---

## Key Design Decisions

### Token Rotation (not append)
Old `pendingVerification` rows for that `(tenantId, email)` pair are **deleted before** creating
the new one. Only one active invite token exists at any time. Old links go dead immediately.

### SHA-256 — raw token never stored
```
rawToken = randomBytes(32).toString('hex')   ← sent in email
tokenHash = sha256(rawToken)                 ← stored in DB
```
If DB is compromised, attacker cannot reconstruct the activation link.

### Audit log includes token_hash, not rawToken
Audit captures `token_hash` (safe) + `expires_at` + `resent_by` for full traceability
without ever logging the cleartext secret.

### Guard: pending bootstrap admin user must exist
The route checks for an **inactive** `adminUser` with `email === contactEmail`.
This is the bootstrap admin seeded at tenant creation. If they've already activated
(i.e., `isActive: true`) the button never appears — the UI gate (`isPendingClaim`) 
prevents it. The 409 is a backend safety net.

---

## UI Gate — when does the menu item appear?

```typescript
// page.tsx
const isPendingClaim = tenant.has_pending_bootstrap_invite ?? tenant.admin_count === 0;

// Menu item renders only when:
isPendingClaim && tenant.contact_email
```

`has_pending_bootstrap_invite` comes from the backend counting `pendingVerifications`:

```typescript
// admin.routes.ts — GET /admin/tenants
has_pending_bootstrap_invite: t._count.pendingVerifications > 0
```

This is the **authoritative signal** — not a heuristic. A tenant is pending if and only
if a live `pendingVerification` row exists in the DB.

---

## Files Changed

| File | Role |
|---|---|
| [types.ts](file:///c:/Users/vishn/PROJECT/walletOS/walletOS/libs/types/src/lib/types.ts#L182-L271) | `Tenant.has_pending_bootstrap_invite`, `ResendTenantInviteResponse` |
| [adminService.ts](file:///c:/Users/vishn/PROJECT/walletOS/walletOS/apps/admin/src/services/adminService.ts#L140-L146) | `resendTenantInvite()` client fn |
| [page.tsx](file:///c:/Users/vishn/PROJECT/walletOS/walletOS/apps/admin/src/app/dashboard/tenants/page.tsx#L475-L500) | `handleResendTenantInvite` + menu item |
| [admin.routes.ts](file:///c:/Users/vishn/PROJECT/walletOS/walletOS/apps/api/src/routes/admin.routes.ts#L1652-L1743) | `POST /tenants/:id/resend-invite` endpoint |
| [admin.routes.ts](file:///c:/Users/vishn/PROJECT/walletOS/walletOS/apps/api/src/routes/admin.routes.ts#L2398-L2430) | `GET /admin/tenants` — added `has_pending_bootstrap_invite` |
| [resend-invite.test.ts](file:///c:/Users/vishn/PROJECT/walletOS/walletOS/apps/api/src/__tests__/resend-invite.test.ts) | 7 integration tests |
| [test-helpers.ts](file:///c:/Users/vishn/PROJECT/walletOS/walletOS/apps/api/src/__tests__/utils/test-helpers.ts#L152-L162) | `cleanupTestData` now clears `pendingVerification` + `adminUser` |

---

## Test Coverage (all 134 pass ✅)

| Test | Guards |
|---|---|
| 403 non-superadmin | `requireAdminRole('superadmin')` |
| 401 no auth | `adminAuthMiddleware` |
| 400 missing Idempotency-Key | `getValidatedIdempotencyKey` |
| 404 unknown tenant | `prisma.tenant.findUnique` |
| 400 no contact email | `contactEmail?.trim()` guard |
| 409 no pending bootstrap user | `bootstrapAdmin` guard |
| 200 success | token rotated, audit written, email sent, rawToken not in response |
