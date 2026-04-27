import request from 'supertest';
import { app } from '../main';
import { prisma } from '../lib/prisma';

// Mock @supabase/supabase-js entirely to prevent real network calls
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(() => Promise.resolve({
        data: {
          user: {
            id: 'test-admin-uuid',
            email: 'admin@test.com',
            app_metadata: {
              tenantId: 'default',
            },
          },
        },
        error: null,
      })),
    },
  })),
}));

describe('Admin API Endpoints', () => {
  let adminAuthToken: string;
  let testWalletId: string;
  let testTenantId: string;
  let testTransactionId: string;

  beforeAll(async () => {
    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
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
    await prisma.adminUser.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.adminUser.deleteMany({ where: { tenantId: 'default', supabaseUid: 'test-admin-uuid' } });
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
      expect(auditLog?.actorId).toBe('admin@example.com');
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
});
