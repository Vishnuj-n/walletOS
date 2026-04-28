import request from 'supertest';
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
    // Create test tenant with ID 'default' to match the mock Supabase user's app_metadata.tenantId
    const tenant = await prisma.tenant.create({
      data: {
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
        role: 'superadmin',
        isActive: true,
      },
    });

    // Mock admin auth token (in real implementation, this would be a valid Supabase JWT)
    adminAuthToken = 'Bearer mock-admin-jwt-token';
  });

  afterAll(async () => {
    // Cleanup
    await prisma.auditLog.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.transaction.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.wallet.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.adminUser.deleteMany({ where: { tenantId: testTenantId, supabaseUid: 'test-admin-uuid' } });
    await prisma.tenant.delete({ where: { id: testTenantId } });
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
      const response = await request(app)
        .post(`/api/v1/admin/transactions/${testTransactionId}/reverse`)
        .set('Authorization', adminAuthToken)
        .send({ reason: 'Test reversal reason' });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe('reversal');
      expect(response.body.original_tx_id).toBe(testTransactionId);
      
      // Verify audit log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'admin.reverse',
        },
      });
      expect(auditLog).toBeDefined();
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
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'wallet.created',
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
      const response = await request(app)
        .get('/api/v1/admin/tenants')
        .set('Authorization', adminAuthToken);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
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
        .patch(`/api/v1/admin/wallets/${testWalletId}`)
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
      const response = await request(app)
        .post('/api/v1/admin/transactions/credit')
        .set('Authorization', adminAuthToken)
        .send({
          wallet_id: testWalletId,
          amount: '25.00',
          description: 'Test audit metadata',
          reason: 'Audit metadata test',
        });

      expect(response.status).toBe(201);

      // Verify audit log contains proper actor metadata
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          action: 'admin.credit',
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.actorId).toBe('admin@test.com');
      expect(auditLog?.actorType).toBe('admin');
      expect(auditLog?.isSandbox).toBe(false);
    });
  });
});
