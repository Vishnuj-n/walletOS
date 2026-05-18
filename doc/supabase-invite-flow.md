🥷 Supabase Invitation & Tenant Onboarding: Recommended Two-Step Pattern

Building: A concise, secure design for using Supabase's passwordless invitation system to invite tenant-scoped admin/staff, allow invitees to claim accounts, set passwords, and safely link `auth.users` to the application's `public.AdminUser` records.

Not building: Any code changes, SMTP relay configuration, or alternative invite flows (magic links constructed manually). This document is design-only and assumes implementation will follow after approval.

Approach (Recommended)
- Use Supabase's admin invitation API (Service Role Key) to send email invites with `user_metadata` containing `tenantId` and `role`.
- Create a pending `AdminUser` record locally keyed by invited email + `tenantId`, then attach the verified Supabase user ID only after the user completes the claim flow.
- Provide a frontend claim page that relies on the Supabase client session after the magic-link redirect; on password set, call the backend activation endpoint with the verified Supabase access token so the server can resolve the authenticated user safely.

Why this approach
- Security: Supabase manages token lifecycle, link routing, and email delivery; we avoid storing or rotating verification tokens ourselves.
- Consistency: The local `AdminUser` row keeps application-specific metadata (tenantId, role) and a permanent foreign key to `auth.users` for auditability.
- Compliance with Multi-Tenancy: By embedding `tenantId` and role into the invitation metadata and gating `POST /admin/tenants/:tenantId/invite-user` to `tenant_admin`, we keep tenant isolation intact.

Key decisions
1. Use a Service-Role Supabase client in the backend to call the native invite API and set `user_metadata` (tenantId, role).
2. Create a local pending `AdminUser` row immediately after invite, keyed by email + `tenantId`, and reconcile the Supabase identity only after claim verification.
3. Keep `isActive: false` until the client completes the Supabase password handshake and the backend activation API verifies the signed Supabase session.
4. Require the frontend claim route to validate that a Supabase session exists before showing password fields, then send the signed access token to the backend.
5. Do not replicate or store raw verification tokens or SMTP credentials in our DB; rely on Supabase's mail relays during implementation.

Unknowns / Risks
- Assumes Supabase will deliver invites reliably in your target regions. If your customers require branded email domains or higher deliverability guarantees, you'll need to configure a verified SMTP provider in Supabase (out of scope for this doc).
- Premise collapse: This plan assumes the backend can verify a Supabase access token on activation. If token verification is unavailable or the token is missing, the backend must reject activation and keep the account pending.
- Race conditions: If the invited user clicks the link immediately and Supabase creates the Auth user before our DB transaction completes, ensure idempotent writes and database transactions to avoid duplicate or orphan records.

Operational notes
- Keep `SUPABASE_SERVICE_ROLE_KEY` secret and only usable from the server-side environment (no browser exposure).
- Record audit entries for every invitation and activation event (who invited, tenantId, idempotency key, timestamp).
- Use idempotency keys for invite endpoints to prevent duplicate invites from repeated client retries.

Can this flow be used when tenants are created and tenants need to login?
- Short answer: Yes. Use the same invite+claim pattern for initial tenant bootstrap and tenant admin creation. When a tenant is created and an initial `tenant_admin` must be provisioned, the `superadmin` or orchestration process can trigger the same invite path, sending an invite to the initial admin's email and creating the pending `AdminUser` record keyed by email + tenant. After they claim the link, set a password, and the backend verifies their Supabase access token, their account is linked and `isActive` is set to true.

Differences for tenant bootstrap vs. standard invite
- Tenant bootstrap often originates from `superadmin` flows and may require a slightly different audit trail (mark origin as `system:tenant-bootstrap`). Keep the same security assumptions (Service Role Key, `user_metadata`).
- If you must show tenant API keys or other one-time secrets during bootstrap, present them only inside the admin UI after the user is authenticated and their `isActive` status is true.
- Do not trust a client-supplied user ID for activation. The backend should verify the Supabase JWT/access token and derive identity server-side.

Sprint recommendation
- Implement in Sprint 6 (Secure Tenant Credential Lifecycle). This aligns with the planned tenant credential work, email claim flow, and one-time-key reveal tasks.

Next steps if approved
1. Implement the backend invite route using the Service Role Key and create the pending `AdminUser` row. (apps/api)
2. Implement the frontend claim page to validate Supabase session and allow password creation. (apps/admin)
3. Add the backend activation endpoint that accepts a verified Supabase access token and flips `isActive` only after server-side verification. (apps/api)
4. Add tests for idempotency, race conditions, and audit logging.
