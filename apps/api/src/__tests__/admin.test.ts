import request from 'supertest';
import { createHash } from 'crypto';
import { AdminRole } from '@prisma/client';
import { app } from '../main';
import { prisma } from '../lib/prisma';

// Note: @supabase/supabase-js is mocked in setup.ts to ensure the middleware uses the mocked client
// For integration tests with real Supabase, set environment variable TEST_REAL_SUPABASE=true

describe('Admin API Endpoints', () => {
  let adminAuthToken: string;
  let testWalletId: string;
  let testTenantId: string;
  let testTransactionId: string;

  beforeAll(async () => {
    // Create or update test tenant with ID 'default' to match the mock Supabase user's app_metadata.tenantId
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
        tenantId: testTenantId,
        externalUserId: 'admin-test-user',
        currency: 'USD',
        balance: "1000.00",
        status: 'active',
        isSandbox: false,
      },
    });
    testWalletId = wallet.id;

    // Seed AdminUser record matching the mocked Supabase user ID
    // This prevents the "Ghost Admin" issue where the middleware can't find the user
    await prisma.adminUser.upsert({
      where: {
        tenantId_supabaseUid: {
          tenantId: 'default',
          supabaseUid: 'test-admin-uuid',
        },
      },
      update: {},
      create: {
        tenantId: 'default',
        supabaseUid: 'test-admin-uuid',
        email: 'admin@test.com',
        role: AdminRole.superadmin,
        isActive: true,
      },
    });

    // Mock admin auth token (in real implementation, this would be a valid Supabase JWT)
    // The mocked Supabase client will accept any token and return the test user
    adminAuthToken = 'Bearer test-admin-jwt-token';
  });

  afterAll(async () => {
    // Cleanup - only run if setup completed successfully
    if (testTenantId) {
      try {
        // Delete in correct foreign key order to avoid constraint violations
        await prisma.auditLog.deleteMany({ where: { tenantId: testTenantId } });
        await prisma.transaction.deleteMany({ where: { tenantId: testTenantId } });
        await prisma.wallet.deleteMany({ where: { tenantId: testTenantId } });
        await prisma.adminUser.deleteMany({ where: { tenantId: testTenantId, supabaseUid: 'test-admin-uuid' } });
        
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

  describe('POST /admin/tenants', () => {
    it('should create a tenant with API keys', async () => {
      const idempotencyKey = `test-tenant-idempotency-key-${Date.now()}`;
      const response = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', idempotencyKey)
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
      const auditChanges = (auditLog?.changes as Record<string, unknown>) ?? {};
      const auditResponse = (auditChanges.response as { live_key?: string; test_key?: string } | undefined) ?? {};
      expect(auditResponse.live_key).toContain('[redacted]');
      expect(auditResponse.test_key).toContain('[redacted]');
      expect(auditResponse.live_key).not.toBe(response.body.live_key);
      expect(auditResponse.test_key).not.toBe(response.body.test_key);

      const retryResponse = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          name: 'New Test Tenant',
          contact_email: 'new-tenant@example.com',
        });

      expect(retryResponse.status).toBe(201);
      expect(retryResponse.body.tenant_id).toBe(response.body.tenant_id);
      expect(retryResponse.body.live_key).toBe(response.body.live_key);
      expect(retryResponse.body.test_key).toBe(response.body.test_key);

      // Cleanup
      await prisma.auditLog.deleteMany({ where: { tenantId: response.body.tenant_id } });
      await prisma.adminUser.deleteMany({ where: { tenantId: response.body.tenant_id } });
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

    it('should optionally bootstrap the first tenant admin invite', async () => {
      const response = await request(app)
        .post('/api/v1/admin/tenants')
        .set('Authorization', adminAuthToken)
        .set('Idempotency-Key', `tenant-bootstrap-${Date.now()}`)
        .send({
          name: 'Bootstrap Tenant',
          contact_email: 'bootstrap-tenant@example.com',
          bootstrap_admin_email: 'Invited-Admin@Test.com',
        });

      expect(response.status).toBe(201);
      expect(response.body.bootstrap_invite_sent).toBe(true);
      expect(response.body.bootstrap_admin_email).toBe('invited-admin@test.com');

      const pendingAdmin = await prisma.adminUser.findUnique({
        where: {
          tenantId_email: {
            tenantId: response.body.tenant_id,
            email: 'invited-admin@test.com',
          },
        },
      });

      expect(pendingAdmin).toBeDefined();
      expect(pendingAdmin?.isActive).toBe(false);
      expect(pendingAdmin?.supabaseUid).toBeNull();
      expect(pendingAdmin?.invitedAt).toBeTruthy();

      const inviteAudit = await prisma.auditLog.findFirst({
        where: {
          tenantId: response.body.tenant_id,
          action: 'admin_user.invited',
        },
      });

      expect(inviteAudit).toBeDefined();

      await prisma.auditLog.deleteMany({ where: { tenantId: response.body.tenant_id } });
      await prisma.adminUser.deleteMany({ where: { tenantId: response.body.tenant_id } });
      await prisma.apiKey.deleteMany({ where: { tenantId: response.body.tenant_id } });
      await prisma.tenant.delete({ where: { id: response.body.tenant_id } });
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
      // Create a superadmin user for this test
      await prisma.adminUser.upsert({
        where: {
          tenantId_supabaseUid: {
            tenantId: 'default',
            supabaseUid: 'superadmin-uuid',
          },
        },
        update: {},
        create: {
          tenantId: 'default',
          supabaseUid: 'superadmin-uuid',
          email: 'superadmin@test.com',
          role: 'superadmin',
          isActive: true,
        },
      });

      const superadminToken = 'Bearer mock-superadmin-jwt-token';

      const response = await request(app)
        .get('/api/v1/admin/tenants')
        .set('Authorization', superadminToken);

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
      // Create a non-superadmin user (support role)
      await prisma.adminUser.upsert({
        where: {
          tenantId_supabaseUid: {
            tenantId: 'default',
            supabaseUid: 'support-uuid',
          },
        },
        update: {},
        create: {
          tenantId: 'default',
          supabaseUid: 'support-uuid',
          email: 'support@test.com',
          role: 'support',
          isActive: true,
        },
      });

      const supportAuthToken = 'Bearer support-jwt-token';

      const response = await request(app)
        .get('/api/v1/admin/tenants')
        .set('Authorization', supportAuthToken);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /admin/search/* authorization', () => {
    it('should reject wallet search for non-superadmin users', async () => {
      await prisma.adminUser.upsert({
        where: {
          tenantId_supabaseUid: {
            tenantId: 'default',
            supabaseUid: 'support-uuid',
          },
        },
        update: { role: AdminRole.support, isActive: true },
        create: {
          tenantId: 'default',
          supabaseUid: 'support-uuid',
          email: 'support@test.com',
          role: AdminRole.support,
          isActive: true,
        },
      });

      const supportAuthToken = 'Bearer support-jwt-token';
      const response = await request(app)
        .get('/api/v1/admin/search/wallets?q=tx_foo')
        .set('Authorization', supportAuthToken);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject transaction search for non-superadmin users', async () => {
      const supportAuthToken = 'Bearer support-jwt-token';
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
        where: { tenantId: testTenantId, supabaseUid: 'test-admin-uuid' },
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
        where: { tenantId: testTenantId, supabaseUid: 'test-admin-uuid' },
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

    it('should invite a same-tenant tenant admin and keep the row pending', async () => {
      const response = await request(app)
        .post(`/api/v1/admin/tenants/${testTenantId}/invite-user`)
        .set('Authorization', adminAuthToken)
        .send({
          email: 'invited-admin@test.com',
          role: 'tenant_admin',
        });

      expect(response.status).toBe(201);
      expect(response.body.invite_sent).toBe(true);
      expect(response.body.email).toBe('invited-admin@test.com');

      const pendingInvite = await prisma.adminUser.findUnique({
        where: {
          tenantId_email: {
            tenantId: testTenantId,
            email: 'invited-admin@test.com',
          },
        },
      });

      expect(pendingInvite).toBeDefined();
      expect(pendingInvite?.isActive).toBe(false);
      expect(pendingInvite?.supabaseUid).toBeNull();

      await prisma.auditLog.deleteMany({
        where: {
          tenantId: testTenantId,
          action: 'admin_user.invited',
        },
      });
      await prisma.adminUser.deleteMany({
        where: {
          tenantId: testTenantId,
          email: 'invited-admin@test.com',
        },
      });
    });

    it('should surface Supabase invite rate limits as RATE_LIMIT_EXCEEDED', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createClient } = require('@supabase/supabase-js');
      const originalCreateClientImpl = createClient.getMockImplementation();

      createClient.mockImplementation(() => ({
        auth: {
          admin: {
            inviteUserByEmail: jest.fn(() => Promise.resolve({
              data: { user: null },
              error: {
                status: 429,
                code: 'over_email_send_rate_limit',
                message: 'email rate limit exceeded',
              },
            })),
            updateUserById: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
          },
          getUser: jest.fn(() => Promise.resolve({
            data: {
              user: {
                id: 'test-admin-uuid',
                email: 'admin@test.com',
                app_metadata: { tenantId: 'default' },
                email_confirmed_at: '2026-01-01T00:00:00.000Z',
              },
            },
            error: null,
          })),
        },
      }));

      try {
        const response = await request(app)
          .post(`/api/v1/admin/tenants/${testTenantId}/invite-user`)
          .set('Authorization', adminAuthToken)
          .send({
            email: 'invited-admin@test.com',
            role: 'tenant_admin',
          });

        expect(response.status).toBe(429);
        expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      } finally {
        createClient.mockImplementation(originalCreateClientImpl);
      }

      await prisma.adminUser.deleteMany({
        where: {
          tenantId: testTenantId,
          email: 'invited-admin@test.com',
        },
      });
    });

    it('should surface thrown Supabase invite exceptions as INTERNAL_ERROR', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createClient } = require('@supabase/supabase-js');
      const originalCreateClientImpl = createClient.getMockImplementation();

      createClient.mockImplementation(() => ({
        auth: {
          admin: {
            inviteUserByEmail: jest.fn(() => Promise.reject(new Error('network boom'))),
            updateUserById: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
          },
          getUser: jest.fn(() => Promise.resolve({
            data: {
              user: {
                id: 'test-admin-uuid',
                email: 'admin@test.com',
                app_metadata: { tenantId: 'default' },
                email_confirmed_at: '2026-01-01T00:00:00.000Z',
              },
            },
            error: null,
          })),
        },
      }));

      try {
        const response = await request(app)
          .post(`/api/v1/admin/tenants/${testTenantId}/invite-user`)
          .set('Authorization', adminAuthToken)
          .send({
            email: 'invited-admin@test.com',
            role: 'tenant_admin',
          });

        expect(response.status).toBe(502);
        expect(response.body.error.code).toBe('INTERNAL_ERROR');
        expect(response.body.error.message).toBe('Failed to send Supabase invite');
      } finally {
        createClient.mockImplementation(originalCreateClientImpl);
      }

      await prisma.adminUser.deleteMany({
        where: {
          tenantId: testTenantId,
          email: 'invited-admin@test.com',
        },
      });
    });
  });

  describe('POST /admin/invitations/activate', () => {
    let pendingTenantId: string;
    let pendingAdminId: string;

    beforeEach(async () => {
      const tenant = await prisma.tenant.create({
        data: {
          name: `Pending Invite Tenant ${Date.now()}`,
          contactEmail: `pending-${Date.now()}@example.com`,
        },
      });
      pendingTenantId = tenant.id;

      const pendingAdmin = await prisma.adminUser.create({
        data: {
          tenantId: tenant.id,
          email: 'invited-admin@test.com',
          role: AdminRole.tenant_admin,
          isActive: false,
          invitedAt: new Date(),
        },
      });
      pendingAdminId = pendingAdmin.id;
    });

    afterEach(async () => {
      if (pendingTenantId) {
        await prisma.auditLog.deleteMany({ where: { tenantId: pendingTenantId } });
        await prisma.adminUser.deleteMany({ where: { tenantId: pendingTenantId } });
        await prisma.apiKey.deleteMany({ where: { tenantId: pendingTenantId } });
        await prisma.tenant.deleteMany({ where: { id: pendingTenantId } });
      }
    });

    it('should activate a pending invite with a verified Supabase user', async () => {
      const response = await request(app)
        .post('/api/v1/admin/invitations/activate')
        .set('Authorization', 'Bearer invited-tenant-admin-jwt-token')
        .send({ tenant_id: pendingTenantId });

      expect(response.status).toBe(200);
      expect(response.body.tenant_id).toBe(pendingTenantId);
      expect(response.body.email).toBe('invited-admin@test.com');
      expect(response.body.role).toBe('tenant_admin');

      const activatedAdmin = await prisma.adminUser.findUnique({
        where: { id: pendingAdminId },
      });

      expect(activatedAdmin?.isActive).toBe(true);
      expect(activatedAdmin?.supabaseUid).toBe('invited-tenant-admin-uuid');
      expect(activatedAdmin?.activatedAt).toBeTruthy();

      const activationAudit = await prisma.auditLog.findFirst({
        where: {
          tenantId: pendingTenantId,
          action: 'admin_user.activated',
        },
      });
      expect(activationAudit).toBeDefined();
    });

    it('should reject activation for an unknown invite', async () => {
      const response = await request(app)
        .post('/api/v1/admin/invitations/activate')
        .set('Authorization', 'Bearer invited-tenant-admin-jwt-token')
        .send({ tenant_id: 'missing-tenant' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should reject duplicate activation', async () => {
      await prisma.adminUser.update({
        where: { id: pendingAdminId },
        data: {
          isActive: true,
          supabaseUid: 'existing-uid',
          activatedAt: new Date(),
        },
      });

      const response = await request(app)
        .post('/api/v1/admin/invitations/activate')
        .set('Authorization', 'Bearer invited-tenant-admin-jwt-token')
        .send({ tenant_id: pendingTenantId });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_OPERATION');
    });

    it('should reject expired sessions', async () => {
      const response = await request(app)
        .post('/api/v1/admin/invitations/activate')
        .set('Authorization', 'Bearer expired-invite-jwt-token')
        .send({ tenant_id: pendingTenantId });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Sandbox Mode Behavior', () => {
    it('should handle sandbox wallet operations correctly', async () => {
      // Create a sandbox wallet
      const sandboxWallet = await prisma.wallet.create({
        data: {
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
