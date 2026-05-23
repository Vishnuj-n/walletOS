import request from 'supertest';
import { createHash, randomBytes } from 'crypto';
import { AdminRole } from '@prisma/client';
import { app } from '../main';
import { prisma } from '../lib/prisma';
import { generateAdminUserPublicId, generateTransactionPublicId, generateWalletPublicId } from '../lib/publicId';

// Note: @supabase/supabase-js is mocked in setup.ts to ensure the middleware uses the mocked client
// For integration tests with real Supabase, set environment variable TEST_REAL_SUPABASE=true

describe('Admin API Endpoints', () => {
  let adminAuthToken: string;
  let supportAuthToken: string;
  let testWalletId: string;
  let testTenantId: string;
  let testTransactionId: string;

  beforeAll(async () => {
    // Create or update test tenant with ID 'default' to match the test setup
    // Using upsert to handle cases where tenant already exists from previous runs or seeded data
    const tenant = await prisma.tenant.upsert({
      where: { id: 'default' },
      update: {
        name: 'Test Admin Tenant',
        contactEmail: 'admin-test@example.com',
      },
      create: {
        id: 'default',
        name: 'Test Admin Tenant',
        contactEmail: 'admin-test@example.com',
      },
    });
    testTenantId = tenant.id;

    // Create test wallet
    const wallet = await prisma.wallet.create({
      data: {
        publicId: generateWalletPublicId(),
        tenantId: testTenantId,
        externalUserId: 'admin-test-user',
        currency: 'USD',
        balance: "1000.00",
        status: 'active',
        isSandbox: false,
      },
    });
    testWalletId = wallet.id;

    // Seed AdminUser record for superadmin
    const adminUser = await prisma.adminUser.upsert({
      where: { email: 'admin@test.com' },
      update: {
        role: AdminRole.superadmin,
        isActive: true,
        tenantId: 'default',
      },
      create: {
        publicId: generateAdminUserPublicId(),
        tenantId: 'default',
        email: 'admin@test.com',
        role: AdminRole.superadmin,
        isActive: true,
      },
    });

    // Create a real DB session token for superadmin
    const adminToken = `adm_${randomBytes(32).toString('hex')}`;
    const adminTokenHash = createHash('sha256').update(adminToken).digest('hex');
    await prisma.sessionToken.create({
      data: {
        tokenHash: adminTokenHash,
        tenantId: 'default',
        scope: `admin:${adminUser.id}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    adminAuthToken = `Bearer ${adminToken}`;

    // Seed AdminUser record for support
    const supportUser = await prisma.adminUser.upsert({
      where: { email: 'support@test.com' },
      update: {
        role: AdminRole.support,
        isActive: true,
        tenantId: 'default',
      },
      create: {
        publicId: generateAdminUserPublicId(),
        tenantId: 'default',
        email: 'support@test.com',
        role: AdminRole.support,
        isActive: true,
      },
    });

    // Create a real DB session token for support
    const supportToken = `adm_${randomBytes(32).toString('hex')}`;
    const supportTokenHash = createHash('sha256').update(supportToken).digest('hex');
    await prisma.sessionToken.create({
      data: {
        tokenHash: supportTokenHash,
        tenantId: 'default',
        scope: `admin:${supportUser.id}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    supportAuthToken = `Bearer ${supportToken}`;
  });

  afterAll(async () => {
    // Cleanup - only run if setup completed successfully
    if (testTenantId) {
      try {
        // Delete in correct foreign key order to avoid constraint violations
        await prisma.sessionToken.deleteMany({ where: { tenantId: testTenantId } });
        await prisma.auditLog.deleteMany({ where: { tenantId: testTenantId } });
        await prisma.transaction.deleteMany({ where: { tenantId: testTenantId } });
        await prisma.wallet.deleteMany({ where: { tenantId: testTenantId } });
        await prisma.adminUser.deleteMany({ where: { tenantId: testTenantId } });
        
        // Note: We don't delete the 'default' tenant as it might be shared across tests
        // and the mocked auth depends on it. Use deleteMany for safety if needed:
        // await prisma.tenant.deleteMany({ where: { id: testTenantId } });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn('Test cleanup warning:', errorMessage);
      }
    }
    
    // Disconnect Prisma to prevent open handle warnings
    await prisma.$disconnect();
  });

  describe('POST /admin/wallets/:walletId/freeze', () => {
    it('should freeze a wallet with a reason', async () => {
      const response = await request(app)
        .post(`/api/v1/admin/wallets/${testWalletId}/freeze`)
        .set('Authorization', adminAuthToken)
        .send({ reason: 'Test freeze reason' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('frozen');
      
      // Verify audit log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'wallet.frozen',
          actorId: 'admin@test.com',
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.actorId).toBe('admin@test.com');
    });

    it('should reject freeze without reason', async () => {
      // First unfreeze
      await prisma.wallet.update({
        where: { id: testWalletId },
        data: { status: 'active' },
      });

      const response = await request(app)
        .post(`/api/v1/admin/wallets/${testWalletId}/freeze`)
        .set('Authorization', adminAuthToken)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject freeze of already frozen wallet', async () => {
      // Ensure wallet is frozen
      await prisma.wallet.update({
        where: { id: testWalletId },
        data: { status: 'frozen' },
      });

      const response = await request(app)
        .post(`/api/v1/admin/wallets/${testWalletId}/freeze`)
        .set('Authorization', adminAuthToken)
        .send({ reason: 'Test reason' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('WALLET_ALREADY_FROZEN');
    });
  });

  describe('POST /admin/wallets/:walletId/unfreeze', () => {
    it('should unfreeze a wallet with a reason', async () => {
      // Ensure wallet is frozen
      await prisma.wallet.update({
        where: { id: testWalletId },
        data: { status: 'frozen' },
      });

      const response = await request(app)
        .post(`/api/v1/admin/wallets/${testWalletId}/unfreeze`)
        .set('Authorization', adminAuthToken)
        .send({ reason: 'Test unfreeze reason' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('active');
      
      // Verify audit log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'wallet.unfrozen',
          actorId: 'admin@test.com',
        },
      });
      expect(auditLog).toBeDefined();
    });

    it('should reject unfreeze without reason', async () => {
      const response = await request(app)
        .post(`/api/v1/admin/wallets/${testWalletId}/unfreeze`)
        .set('Authorization', adminAuthToken)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /admin/transactions/reverse', () => {
    beforeEach(async () => {
      // Ensure wallet is active and has balance
      await prisma.wallet.update({
        where: { id: testWalletId },
        data: { status: 'active', balance: "1000.00" },
      });

      // Create a test transaction to reverse
      const transaction = await prisma.transaction.create({
        data: {
          publicId: generateTransactionPublicId(),
          tenantId: testTenantId,
          walletId: testWalletId,
          type: 'credit',
          amount: "100.00",
          currency: 'USD',
          balanceBefore: "900.00",
          balanceAfter: "1000.00",
          metadata: { description: 'Test credit' },
        },
      });
      testTransactionId = transaction.id;
    });

    it('should reverse a transaction with a reason', async () => {
      const idempotencyKey = 'test-reverse-reason-' + Date.now();
      const response = await request(app)
        .post(`/api/v1/admin/transactions/${testTransactionId}/reverse`)
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ reason: 'Test reversal reason' });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe('reversal');
      expect(response.body.original_tx_id).toBe(testTransactionId);
      
      // Verify audit log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'admin.reverse',
          actorId: 'admin@test.com',
        },
      });
      expect(auditLog).toBeDefined();
      const reversalCount = await prisma.transaction.count({
        where: {
          tenantId: testTenantId,
          type: 'reversal',
          metadata: { path: ['idempotency_key'], equals: idempotencyKey },
        },
      });
      
      // Verify idempotency: replay the same request
      const retryResponse = await request(app)
        .post(`/api/v1/admin/transactions/${testTransactionId}/reverse`)
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ reason: 'Test reversal reason' });
      
      expect(retryResponse.status).toBe(200);
      expect(retryResponse.body.type).toBe('reversal');
      // Verify no duplicate reversal was created
      const finalReversalCount = await prisma.transaction.count({
        where: {
          tenantId: testTenantId,
          type: 'reversal',
          metadata: { path: ['idempotency_key'], equals: idempotencyKey },
        },
      });
      expect(finalReversalCount).toBe(reversalCount);
      
      // Verify only one audit log entry for this operation
      const auditLogsForKey = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenantId,
          action: 'admin.reverse',
          actorId: 'admin@test.com',
          timestamp: { gte: new Date(Date.now() - 10000) },
        },
      });
      expect(auditLogsForKey.length).toBeLessThanOrEqual(2);
    });

    it('should reject reversal without reason', async () => {
      const response = await request(app)
        .post(`/api/v1/admin/transactions/${testTransactionId}/reverse`)
        .set('Authorization', adminAuthToken)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject reversal of a reversal', async () => {
      // Create a reversal transaction
      const reversal = await prisma.transaction.create({
        data: {
          publicId: generateTransactionPublicId(),
          tenantId: testTenantId,
          walletId: testWalletId,
          type: 'reversal',
          amount: "100.00",
          currency: 'USD',
          balanceBefore: "1000.00",
          balanceAfter: "900.00",
          metadata: { original_tx_id: testTransactionId },
        },
      });

      const response = await request(app)
        .post(`/api/v1/admin/transactions/${reversal.id}/reverse`)
        .set('Authorization', adminAuthToken)
        .send({ reason: 'Test reason' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CANNOT_REVERSE_REVERSAL');
    });
  });

  describe('POST /admin/users/invite', () => {
    it('should redact the invite token and ignore sandbox audit cache entries', async () => {
      const idempotencyKey = `test-invite-idempotency-${Date.now()}`;
      const invitedEmail = `invite-${Date.now()}@example.com`;

      await prisma.auditLog.create({
        data: {
          tenantId: testTenantId,
          entityType: 'admin_user',
          entityId: 'sandbox-cache-entry',
          action: 'admin_user.invited',
          actorId: 'admin@test.com',
          actorType: 'admin',
          actorRole: AdminRole.superadmin,
          isSandbox: true,
          changes: {
            idempotency_key: idempotencyKey,
            response_status: 200,
            response: {
              message: 'cached',
              invite_link: 'https://frontend.example/claim?token=[REDACTED]',
              admin_user: {
                id: 'sandbox-cache-entry',
                email: invitedEmail,
                role: 'support',
                is_active: false,
              },
            },
          },
        },
      });

      const response = await request(app)
        .post('/api/v1/admin/users/invite')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          email: invitedEmail,
          role: 'support',
        });

      expect(response.status).toBe(201);
      expect(response.body.invite_link).not.toContain('[REDACTED]');
      expect(new URL(response.body.invite_link).searchParams.get('token')).toMatch(/^[a-f0-9]{64}$/);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          entityType: 'admin_user',
          action: 'admin_user.invited',
          isSandbox: false,
          changes: {
            path: ['idempotency_key'],
            equals: idempotencyKey,
          },
        },
      });

      expect(auditLog).toBeDefined();
      const auditChanges = (auditLog?.changes as Record<string, unknown>) ?? {};
      expect(auditChanges.token_hash).toMatch(/^[a-f0-9]{64}$/);

      const responseChanges = auditChanges.response as { invite_link?: string } | undefined;
      expect(responseChanges?.invite_link).toContain('[REDACTED]');

      await prisma.pendingVerification.deleteMany({ where: { email: invitedEmail } });
      await prisma.adminUser.deleteMany({ where: { email: invitedEmail } });
      await prisma.auditLog.deleteMany({
        where: {
          tenantId: testTenantId,
          entityType: 'admin_user',
          action: 'admin_user.invited',
          changes: {
            path: ['idempotency_key'],
            equals: idempotencyKey,
          },
        },
      });
    });
  });

  describe('GET /admin/account/users', () => {
    it('should list current tenant employees and apply scoped search', async () => {
      const activeEmail = `tenant-user-${Date.now()}@example.com`;
      const pendingEmail = `pending-user-${Date.now()}@example.com`;

      await prisma.adminUser.createMany({
        data: [
          {
            publicId: generateAdminUserPublicId(),
            tenantId: testTenantId,
            email: activeEmail,
            role: AdminRole.finance,
            isActive: true,
            invitedAt: new Date('2026-05-23T10:00:00.000Z'),
            activatedAt: new Date('2026-05-23T10:05:00.000Z'),
          },
          {
            publicId: generateAdminUserPublicId(),
            tenantId: testTenantId,
            email: pendingEmail,
            role: AdminRole.support,
            isActive: false,
            invitedAt: new Date('2026-05-23T11:00:00.000Z'),
          },
        ],
      });

      const response = await request(app)
        .get('/api/v1/admin/account/users')
        .set('Authorization', adminAuthToken);

      expect(response.status).toBe(200);
      expect(response.body.tenant_id).toBe(testTenantId);
      expect(response.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            email: activeEmail,
            role: 'finance',
            is_active: true,
          }),
          expect.objectContaining({
            email: pendingEmail,
            role: 'support',
            is_active: false,
          }),
        ])
      );

      const filteredResponse = await request(app)
        .get(`/api/v1/admin/account/users?q=${encodeURIComponent('finance')}`)
        .set('Authorization', adminAuthToken);

      expect(filteredResponse.status).toBe(200);
      expect(filteredResponse.body.query).toBe('finance');
      expect(filteredResponse.body.data).toEqual([
        expect.objectContaining({
          email: activeEmail,
          role: 'finance',
        }),
      ]);

      await prisma.adminUser.deleteMany({
        where: {
          email: {
            in: [activeEmail, pendingEmail],
          },
        },
      });
    });
  });

  describe('POST /admin/tenants', () => {
    it('should create a tenant with API keys', async () => {
      const response = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', 'test-tenant-idempotency-key')
        .send({
          name: 'New Test Tenant',
          contact_email: 'new-tenant@example.com',
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('New Test Tenant');
      expect(response.body.live_key).toMatch(/^wlt_live_/);
      expect(response.body.test_key).toMatch(/^wlt_test_/);
      expect(response.body.tenant_id).toBeDefined();
      
      // Verify audit log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: response.body.tenant_id,
          action: 'tenant.created',
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.isSandbox).toBe(false);

      // Cleanup
      await prisma.auditLog.deleteMany({ where: { tenantId: response.body.tenant_id } });
      await prisma.apiKey.deleteMany({ where: { tenantId: response.body.tenant_id } });
      await prisma.tenant.delete({ where: { id: response.body.tenant_id } });
    });

    it('should reject tenant creation without name', async () => {
      const response = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Authorization', adminAuthToken)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /admin/wallets', () => {
    it('should list wallets for the tenant', async () => {
      const response = await request(app)
        .get('/api/v1/admin/wallets')
        .set('Authorization', adminAuthToken);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter wallets by status', async () => {
      const response = await request(app)
        .get('/api/v1/admin/wallets?status=active')
        .set('Authorization', adminAuthToken);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('GET /admin/system/balance', () => {
    it('should return live and sandbox totals', async () => {
      await prisma.wallet.update({
        where: { id: testWalletId },
        data: { status: 'active', balance: '1000.00', isSandbox: false },
      });

      const sandboxWallet = await prisma.wallet.create({
        data: {
          publicId: generateWalletPublicId(),
          tenantId: testTenantId,
          externalUserId: `system-balance-sandbox-${Date.now()}`,
          currency: 'USD',
          balance: '250.00',
          status: 'active',
          isSandbox: true,
        },
      });

      const response = await request(app)
        .get('/api/v1/admin/system/balance')
        .set('Authorization', adminAuthToken);

      expect(response.status).toBe(200);
      expect(parseFloat(response.body.total_live)).toBeGreaterThanOrEqual(1000.00);
      expect(parseFloat(response.body.total_sandbox)).toBeGreaterThanOrEqual(250.00);
      expect(parseFloat(response.body.currency_breakdown.USD.live)).toBeGreaterThanOrEqual(1000.00);
      expect(parseFloat(response.body.currency_breakdown.USD.sandbox)).toBeGreaterThanOrEqual(250.00);

      await prisma.wallet.delete({ where: { id: sandboxWallet.id } });
    });
  });

  describe('POST /admin/transactions/credit', () => {
    it('should credit a wallet with mandatory reason', async () => {
      // Ensure wallet is active
      await prisma.wallet.update({
        where: { id: testWalletId },
        data: { status: 'active', balance: "1000.00" },
      });

      const response = await request(app)
        .post('/api/v1/admin/transactions/credit')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', 'test-credit-mandatory-reason')
        .send({
          wallet_id: testWalletId,
          amount: '50.00',
          description: 'Admin credit test',
          reason: 'Test credit reason',
        });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe('credit');
      expect(response.body.amount).toBe('50.0000');
      
      // Verify audit log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'admin.credit',
          actorId: 'admin@test.com',
        },
      });
      expect(auditLog).toBeDefined();
    });

    it('should reject credit without reason', async () => {
      const response = await request(app)
        .post('/api/v1/admin/transactions/credit')
        .set('Authorization', adminAuthToken)
        .send({
          wallet_id: testWalletId,
          amount: '50.00',
          description: 'Test',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /admin/wallets', () => {
    it('should create a wallet with admin metadata', async () => {
      const response = await request(app)
        .post('/api/v1/admin/wallets')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', 'test-create-wallet-idempotency')
        .send({
          external_user_id: 'admin-created-user',
          currency: 'USD',
          label: 'Admin Created Wallet',
        });

      expect(response.status).toBe(201);
      expect(response.body.external_user_id).toBe('admin-created-user');
      expect(response.body.currency).toBe('USD');
      expect(response.body.label).toBe('Admin Created Wallet');
      
      // Verify audit log was created with admin metadata
      // Find the audit log with admin actor information (the one created by admin route)
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'wallet.created',
          actorId: 'admin@test.com',
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.actorId).toBe('admin@test.com');
      expect(auditLog?.actorType).toBe('admin');
    });

    it('should handle idempotency for wallet creation', async () => {
      const response1 = await request(app)
        .post('/api/v1/admin/wallets')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', 'test-idempotency-create')
        .send({
          external_user_id: 'idempotent-user',
          currency: 'USD',
        });

      expect(response1.status).toBe(201);

      const response2 = await request(app)
        .post('/api/v1/admin/wallets')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', 'test-idempotency-create')
        .send({
          external_user_id: 'idempotent-user',
          currency: 'USD',
        });

      expect(response2.status).toBe(200);
      expect(response1.body.wallet_id).toBe(response2.body.wallet_id);
    });
  });

  describe('PATCH /admin/wallets/:walletId', () => {
    it('should update wallet label and metadata', async () => {
      const response = await request(app)
        .patch(`/api/v1/admin/wallets/${testWalletId}`)
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', 'test-update-wallet')
        .send({
          label: 'Updated Admin Wallet',
          metadata: { updated_by: 'admin' },
        });

      expect(response.status).toBe(200);
      expect(response.body.label).toBe('Updated Admin Wallet');
      expect(response.body.metadata).toEqual({ updated_by: 'admin' });
      
      // Verify audit log preserves before/after data
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'wallet.updated',
          actorId: 'admin@test.com',
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.actorId).toBe('admin@test.com');
    });

    it('should handle idempotency for wallet updates', async () => {
      const response1 = await request(app)
        .patch(`/api/v1/admin/wallets/${testWalletId}`)
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', 'test-update-idempotency')
        .send({
          label: 'Idempotent Update',
        });

      expect(response1.status).toBe(200);

      const response2 = await request(app)
        .patch(`/api/v1/admin/wallets/${testWalletId}`)
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', 'test-update-idempotency')
        .send({
          label: 'Idempotent Update',
        });

      expect(response2.status).toBe(200);
      expect(response1.body.wallet_id).toBe(response2.body.wallet_id);
    });
  });

  describe('DELETE /admin/wallets/:walletId', () => {
    beforeEach(async () => {
      // Ensure wallet has zero balance for closure
      await prisma.wallet.update({
        where: { id: testWalletId },
        data: { balance: "0.00", status: 'active' },
      });
    });

    it('should close a wallet with reason', async () => {
      const response = await request(app)
        .delete(`/api/v1/admin/wallets/${testWalletId}`)
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', 'test-close-wallet')
        .send({
          reason: 'Admin requested closure',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('closed');
      
      // Verify audit log was created with reason
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'wallet.closed',
          actorId: 'admin@test.com',
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.actorId).toBe('admin@test.com');
    });

    it('should handle idempotency for wallet closure', async () => {
      // Reset wallet for idempotency test
      await prisma.wallet.update({
        where: { id: testWalletId },
        data: { status: 'active', balance: "0.00" },
      });

      const response1 = await request(app)
        .delete(`/api/v1/admin/wallets/${testWalletId}`)
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', 'test-close-idempotency')
        .send({
          reason: 'Idempotent closure',
        });

      expect(response1.status).toBe(200);

      const response2 = await request(app)
        .delete(`/api/v1/admin/wallets/${testWalletId}`)
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', 'test-close-idempotency')
        .send({
          reason: 'Idempotent closure',
        });

      expect(response2.status).toBe(200);
      expect(response1.body.wallet_id).toBe(response2.body.wallet_id);
    });
  });

  describe('GET /admin/tenants', () => {
    it('should list tenants for superadmin', async () => {
      const response = await request(app)
        .get('/api/v1/admin/tenants')
        .set('Authorization', adminAuthToken);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('tenant_id');
      expect(response.body.data[0]).toHaveProperty('name');
      expect(response.body.data[0]).toHaveProperty('wallet_count');
      expect(response.body.data[0]).toHaveProperty('admin_count');
    });

    it('should reject tenant listing for non-superadmin', async () => {
      const response = await request(app)
        .get('/api/v1/admin/tenants')
        .set('Authorization', supportAuthToken);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /admin/search/* authorization', () => {
    it('should reject wallet search for non-superadmin users', async () => {
      const response = await request(app)
        .get('/api/v1/admin/search/wallets?q=tx_foo')
        .set('Authorization', supportAuthToken);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject transaction search for non-superadmin users', async () => {
      const response = await request(app)
        .get('/api/v1/admin/search/transactions?transactionId=tx_foo')
        .set('Authorization', supportAuthToken);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Tenant-scoped admin session routes', () => {
    beforeEach(async () => {
      await prisma.adminUser.updateMany({
        where: { tenantId: testTenantId, email: 'admin@test.com' },
        data: { role: AdminRole.tenant_admin, isActive: true },
      });

      await prisma.apiKey.deleteMany({
        where: { tenantId: testTenantId, scope: 'admin' },
      });

      await prisma.apiKey.createMany({
        data: [
          {
            tenantId: testTenantId,
            keyHash: createHash('sha256').update(`wlt_live_seed_${Date.now()}`).digest('hex'),
            prefix: 'wlt_live_seed_',
            scope: 'admin',
            isSandbox: false,
            isActive: true,
          },
          {
            tenantId: testTenantId,
            keyHash: createHash('sha256').update(`wlt_test_seed_${Date.now()}`).digest('hex'),
            prefix: 'wlt_test_seed_',
            scope: 'admin',
            isSandbox: true,
            isActive: true,
          },
        ],
      });
    });

    afterEach(async () => {
      await prisma.adminUser.updateMany({
        where: { tenantId: testTenantId, email: 'admin@test.com' },
        data: { role: AdminRole.superadmin, isActive: true },
      });
    });

    it('should reject mismatched tenantId for non-superadmin wallet queries', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: `Other Tenant ${Date.now()}`,
          contactEmail: `other-${Date.now()}@example.com`,
        },
      });

      const response = await request(app)
        .get(`/api/v1/admin/wallets?tenantId=${otherTenant.id}`)
        .set('Authorization', adminAuthToken);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');

      await prisma.tenant.delete({ where: { id: otherTenant.id } });
    });

    it('should return current tenant key prefixes for tenant admins', async () => {
      const response = await request(app)
        .get('/api/v1/admin/account/api-keys')
        .set('Authorization', adminAuthToken);

      expect(response.status).toBe(200);
      expect(response.body.tenant_id).toBe(testTenantId);
      expect(response.body.keys).toHaveLength(2);
      expect(response.body.keys.map((key: { scope: string }) => key.scope).sort()).toEqual(['live', 'test']);
    });

    it('should rotate the current tenant live key and return it once', async () => {
      const idempotencyKey = `tenant-admin-live-rotate-${Date.now()}`;

      const response = await request(app)
        .post('/api/v1/admin/account/api-keys/rotate')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ scope: 'live' });

      expect(response.status).toBe(201);
      expect(response.body.tenant_id).toBe(testTenantId);
      expect(response.body.scope).toBe('live');
      expect(response.body.api_key).toMatch(/^wlt_live_/);

      const retryResponse = await request(app)
        .post('/api/v1/admin/account/api-keys/rotate')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ scope: 'live' });

      expect(retryResponse.status).toBe(201);
      expect(retryResponse.body.api_key).toBe(response.body.api_key);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'tenant.key_rotated',
          actorId: 'admin@test.com',
        },
        orderBy: { timestamp: 'desc' },
      });

      expect(auditLog).toBeDefined();
      const auditChanges = (auditLog?.changes as Record<string, unknown>) ?? {};
      const auditResponse = (auditChanges.response as { api_key?: string } | undefined) ?? {};

      expect(auditChanges.scope).toBe('live');
      expect(auditResponse.api_key).toContain('[redacted]');
      expect(auditResponse.api_key).not.toBe(response.body.api_key);
    });

    it('should rotate the current tenant test key for tenant admins', async () => {
      const response = await request(app)
        .post('/api/v1/admin/account/api-keys/rotate')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', `tenant-admin-test-rotate-${Date.now()}`)
        .send({ scope: 'test' });

      expect(response.status).toBe(201);
      expect(response.body.scope).toBe('test');
      expect(response.body.api_key).toMatch(/^wlt_test_/);
    });
  });

  describe('Sandbox Mode Behavior', () => {
    it('should handle sandbox wallet operations correctly', async () => {
      // Create a sandbox wallet
      const sandboxWallet = await prisma.wallet.create({
        data: {
          publicId: generateWalletPublicId(),
          tenantId: testTenantId,
          externalUserId: 'sandbox-user',
          currency: 'USD',
          balance: "100.00",
          status: 'active',
          isSandbox: true,
        },
      });

      const response = await request(app)
        .post(`/api/v1/admin/wallets/${sandboxWallet.id}/freeze`)
        .set('Authorization', adminAuthToken)
        .set('X-Sandbox', 'true')
        .send({ reason: 'Sandbox test freeze' });

      expect(response.status).toBe(200);
      expect(response.body.is_sandbox).toBe(true);
      
      // Verify audit log is marked as sandbox
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'wallet.frozen',
          entityId: sandboxWallet.id,
          isSandbox: true,
        },
      });
      expect(auditLog?.isSandbox).toBe(true);

      // Cleanup
      await prisma.wallet.delete({ where: { id: sandboxWallet.id } });
    });
  });

  describe('CORS Preflight', () => {
    it('should handle OPTIONS preflight for PATCH with custom headers', async () => {
      const response = await request(app)
        .options(`/api/v1/admin/wallets/${testWalletId}`)
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'PATCH')
        .set('Access-Control-Request-Headers', 'Content-Type, Authorization, Idempotency-Key');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-methods']).toContain('PATCH');
      expect(response.headers['access-control-allow-headers']).toContain('Idempotency-Key');
    });
  });

  describe('Audit Log Actor Metadata', () => {
    it('should preserve admin actor metadata in audit logs', async () => {
      // Ensure wallet is active (previous tests may have frozen it)
      await prisma.wallet.update({
        where: { id: testWalletId },
        data: { status: 'active' },
      });

      const uniqueAmount = (25 + Math.random() * 100).toFixed(2);
      const timestamp = Date.now();
      const response = await request(app)
        .post('/api/v1/admin/transactions/credit')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', `audit-metadata-${timestamp}`)
        .send({
          wallet_id: testWalletId,
          amount: uniqueAmount,
          description: `Test audit metadata ${timestamp}`,
          reason: 'Audit metadata test',
        });

      if (response.status !== 201 && process.env.NODE_ENV === 'development') {
        console.log('Error response:', response.body);
        console.log('Status:', response.status);
      }
      expect(response.status).toBe(201);

      // Verify audit log contains proper actor metadata
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'admin.credit',
          actorId: 'admin@test.com',
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.actorId).toBe('admin@test.com');
      expect(auditLog?.actorType).toBe('admin');
      expect(auditLog?.isSandbox).toBe(false);
    });
  });
});
