/**
 * Resend Tenant Bootstrap Invite — Integration Tests
 *
 * Covers:
 * - 403 for non-superadmin
 * - 404 for unknown tenant
 * - 400 for tenant with no contact email
 * - 409 for tenant with no pending bootstrap invite
 * - 200 success: rotates token, writes audit log, calls sendInviteEmail
 * - Idempotency-Key required
 */

// Mock mail service BEFORE any module that imports it
jest.mock('../services/mail.service', () => ({
  sendInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import { createHash, randomBytes } from 'crypto';
import { AdminRole } from '@prisma/client';
import { app } from '../main';
import { prisma } from '../lib/prisma';
import { generateAdminUserPublicId } from '../lib/publicId';
import { sendInviteEmail } from '../services/mail.service';

const mockSendInviteEmail = sendInviteEmail as jest.MockedFunction<typeof sendInviteEmail>;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function makeAdminToken(role: AdminRole, email: string, tenantId: string): Promise<string> {
  const adminUser = await prisma.adminUser.upsert({
    where: { email },
    update: { role, isActive: true, tenantId },
    create: {
      publicId: generateAdminUserPublicId(),
      tenantId,
      email,
      role,
      isActive: true,
    },
  });

  const rawToken = `adm_${randomBytes(32).toString('hex')}`;
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  await prisma.sessionToken.create({
    data: {
      tokenHash,
      tenantId,
      scope: `admin:${adminUser.id}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return `Bearer ${rawToken}`;
}

async function cleanTenant(tenantId: string) {
  await prisma.pendingVerification.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.sessionToken.deleteMany({ where: { tenantId } });
  await prisma.adminUser.deleteMany({ where: { tenantId } });
  await prisma.apiKey.deleteMany({ where: { tenantId } });
  await prisma.wallet.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /admin/tenants/:tenantId/resend-invite', () => {
  const ROOT_TENANT = 'resend-invite-root';
  let superAdminToken: string;
  let supportToken: string;

  beforeAll(async () => {
    // Root tenant for the superadmin caller
    await prisma.tenant.upsert({
      where: { id: ROOT_TENANT },
      update: { name: 'Resend Invite Root' },
      create: { id: ROOT_TENANT, name: 'Resend Invite Root' },
    });

    superAdminToken = await makeAdminToken(
      AdminRole.superadmin,
      'resend-sa@test.com',
      ROOT_TENANT
    );
    supportToken = await makeAdminToken(
      AdminRole.support,
      'resend-sup@test.com',
      ROOT_TENANT
    );
  });

  afterAll(async () => {
    await cleanTenant(ROOT_TENANT);
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mockSendInviteEmail.mockClear();
  });

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('returns 403 for non-superadmin (support)', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/tenants/some-tenant/resend-invite`)
      .set('Authorization', supportToken)
      .set('Idempotency-Key', `resend-403-${Date.now()}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 when no auth token provided', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/tenants/some-tenant/resend-invite`)
      .set('Idempotency-Key', `resend-401-${Date.now()}`);

    expect(res.status).toBe(401);
  });

  it('returns 400 when Idempotency-Key header is missing', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/tenants/some-tenant/resend-invite`)
      .set('Authorization', superAdminToken);

    expect(res.status).toBe(400);
  });

  // ─── Business-logic guards ────────────────────────────────────────────────

  it('returns 404 for unknown tenant', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/tenants/nonexistent-tenant-xyz/resend-invite`)
      .set('Authorization', superAdminToken)
      .set('Idempotency-Key', `resend-404-${Date.now()}`);

    expect(res.status).toBe(404);
    expect(mockSendInviteEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when tenant has no contact email', async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'No Email Tenant',
        tenantConfig: { create: {} },
      },
    });

    try {
      const res = await request(app)
        .post(`/api/v1/admin/tenants/${tenant.id}/resend-invite`)
        .set('Authorization', superAdminToken)
        .set('Idempotency-Key', `resend-no-email-${Date.now()}`);

      expect(res.status).toBe(400);
      expect(mockSendInviteEmail).not.toHaveBeenCalled();
    } finally {
      await prisma.tenant.delete({ where: { id: tenant.id } });
    }
  });

  it('returns 409 when tenant has no pending bootstrap admin user', async () => {
    // Tenant with contactEmail but NO matching inactive adminUser
    const tenant = await prisma.tenant.create({
      data: {
        name: 'No Pending Admin',
        contactEmail: 'bootstrap@noadmin.com',
        tenantConfig: { create: {} },
      },
    });

    try {
      const res = await request(app)
        .post(`/api/v1/admin/tenants/${tenant.id}/resend-invite`)
        .set('Authorization', superAdminToken)
        .set('Idempotency-Key', `resend-409-${Date.now()}`);

      expect(res.status).toBe(409);
      expect(mockSendInviteEmail).not.toHaveBeenCalled();
    } finally {
      await prisma.tenant.delete({ where: { id: tenant.id } });
    }
  });

  // ─── Success path ─────────────────────────────────────────────────────────

  it('200: rotates token, writes audit, calls sendInviteEmail', async () => {
    const contactEmail = `bootstrap-${Date.now()}@tenant.com`;
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Pending Tenant',
        contactEmail,
        tenantConfig: { create: {} },
      },
    });

    // Seed inactive bootstrap admin user matching contact email
    await prisma.adminUser.create({
      data: {
        publicId: generateAdminUserPublicId(),
        tenantId: tenant.id,
        email: contactEmail,
        role: AdminRole.tenant_admin,
        isActive: false,
      },
    });

    // Seed an old pending verification token to verify rotation
    const oldTokenHash = createHash('sha256').update('old-token').digest('hex');
    await prisma.pendingVerification.create({
      data: {
        tenantId: tenant.id,
        email: contactEmail,
        tokenHash: oldTokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    try {
      const timestamp = Date.now();
      const res = await request(app)
        .post(`/api/v1/admin/tenants/${tenant.id}/resend-invite`)
        .set('Authorization', superAdminToken)
        .set('Idempotency-Key', `resend-ok-${timestamp}`);

      expect(res.status).toBe(200);
      expect(res.body.tenant_id).toBe(tenant.id);
      expect(res.body.contact_email).toBe(contactEmail);
      expect(res.body.message).toMatch(contactEmail);

      // Old token deleted, new one created
      const verifications = await prisma.pendingVerification.findMany({
        where: { tenantId: tenant.id, email: contactEmail },
      });
      expect(verifications).toHaveLength(1);
      expect(verifications[0].tokenHash).not.toBe(oldTokenHash);

      // Audit log written
      const audit = await prisma.auditLog.findFirst({
        where: {
          tenantId: tenant.id,
          action: 'tenant.bootstrap_invite_resent',
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe('resend-sa@test.com');

      // Mail sent exactly once with new token (not old one)
      expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
      const [calledTenantId, calledEmail] = mockSendInviteEmail.mock.calls[0];
      expect(calledTenantId).toBe(tenant.id);
      expect(calledEmail).toBe(contactEmail);
    } finally {
      await cleanTenant(tenant.id);
    }
  });

  it('does not expose token in response body', async () => {
    const contactEmail = `bootstrap-nodeep-${Date.now()}@tenant.com`;
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Token Safe Tenant',
        contactEmail,
        tenantConfig: { create: {} },
      },
    });

    await prisma.adminUser.create({
      data: {
        publicId: generateAdminUserPublicId(),
        tenantId: tenant.id,
        email: contactEmail,
        role: AdminRole.tenant_admin,
        isActive: false,
      },
    });

    try {
      const res = await request(app)
        .post(`/api/v1/admin/tenants/${tenant.id}/resend-invite`)
        .set('Authorization', superAdminToken)
        .set('Idempotency-Key', `resend-no-token-leak-${Date.now()}`);

      expect(res.status).toBe(200);
      const responseText = JSON.stringify(res.body);
      expect(responseText).not.toMatch(/token/i);
    } finally {
      await cleanTenant(tenant.id);
    }
  });
});
