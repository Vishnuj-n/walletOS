/**
 * Wallet Tests
 * 
 * Tests for wallet operations:
 * - Create wallet
 * - Duplicate wallet rejection
 * - Retrieval success
 * - Update wallet
 * - Freeze/unfreeze wallet
 * - Close wallet
 */

import request from 'supertest';
import { createTestApp } from './utils/app';
import { createTestSetup, cleanupTestData } from './utils/test-helpers';

describe('Wallet Tests', () => {
  const app = createTestApp();

  describe('POST /api/v1/wallets', () => {
    it('should create a wallet successfully', async () => {
      const { tenant, apiKey } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/wallets')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'wallet_create_success_test_1')
        .send({
          external_user_id: 'user_123',
          currency: 'INR',
          label: 'Test Wallet',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('wallet_id');
      expect(response.body).toHaveProperty('external_user_id', 'user_123');
      expect(response.body).toHaveProperty('balance', '0.0000');
      expect(response.body).toHaveProperty('currency', 'INR');
      expect(response.body).toHaveProperty('status', 'active');
      expect(response.body).toHaveProperty('is_sandbox', true);

      await cleanupTestData(tenant.id);
    });

    it('should reject duplicate wallet creation', async () => {
      const { tenant, apiKey } = await createTestSetup();

      const firstResponse = await request(app)
        .post('/api/v1/wallets')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'wallet_duplicate_first_1')
        .send({
          external_user_id: 'user_duplicate_test',
          currency: 'INR',
        });

      expect(firstResponse.status).toBe(201);

      const secondResponse = await request(app)
        .post('/api/v1/wallets')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'wallet_duplicate_second_1')
        .send({
          external_user_id: 'user_duplicate_test',
          currency: 'INR',
        });

      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body).toHaveProperty('error');
      expect(secondResponse.body.error).toHaveProperty('code', 'WALLET_ALREADY_EXISTS');

      await cleanupTestData(tenant.id);
    });

    it('should validate required fields', async () => {
      const { tenant, apiKey } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/wallets')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'wallet_validation_test_1')
        .send({
          external_user_id: 'user_123',
          // missing currency
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

      await cleanupTestData(tenant.id);
    });
  });

  describe('GET /api/v1/wallets/:walletId', () => {
    it('should retrieve wallet by ID successfully', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .get(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('wallet_id', wallet.id);
      expect(response.body).toHaveProperty('external_user_id', wallet.externalUserId);
      expect(response.body).toHaveProperty('balance', '0.0000');
      expect(response.body).toHaveProperty('currency', wallet.currency);

      await cleanupTestData(tenant.id);
    });

    it('should return 404 for non-existent wallet', async () => {
      const { tenant, apiKey } = await createTestSetup();

      const response = await request(app)
        .get('/api/v1/wallets/nonexistent_id')
        .set('x-api-key', apiKey.plainKey);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');

      await cleanupTestData(tenant.id);
    });
  });

  describe('GET /api/v1/wallets/user/:externalUserId', () => {
    it('should retrieve wallet by external user ID successfully', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup('user_retrieve');

      const response = await request(app)
        .get(`/api/v1/wallets/user/${wallet.externalUserId}`)
        .set('x-api-key', apiKey.plainKey);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('wallet_id', wallet.id);
      expect(response.body).toHaveProperty('external_user_id', wallet.externalUserId);

      await cleanupTestData(tenant.id);
    });

    it('should return 404 for non-existent external user ID', async () => {
      const { tenant, apiKey } = await createTestSetup();

      const response = await request(app)
        .get('/api/v1/wallets/user/nonexistent_user')
        .set('x-api-key', apiKey.plainKey);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');

      await cleanupTestData(tenant.id);
    });
  });

  describe('PATCH /api/v1/wallets/:walletId', () => {
    it('should update wallet label and metadata', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .patch(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'wallet_update_label_1')
        .send({
          label: 'Updated Label',
          metadata: { key: 'value' },
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('label', 'Updated Label');
      expect(response.body).toHaveProperty('metadata');
      expect(response.body.metadata).toEqual({ key: 'value' });

      await cleanupTestData(tenant.id);
    });

    it('should validate that label or metadata is provided', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .patch(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'wallet_update_validation_1')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

      await cleanupTestData(tenant.id);
    });
  });

  describe('POST /api/v1/wallets/:walletId/freeze', () => {
    it('should freeze a wallet successfully', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .post(`/api/v1/wallets/${wallet.id}/freeze`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'wallet_freeze_success_1')
        .send({
          reason: 'Test freeze',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'frozen');

      await cleanupTestData(tenant.id);
    });

    it('should validate that reason is provided', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .post(`/api/v1/wallets/${wallet.id}/freeze`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'wallet_freeze_validation_1')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

      await cleanupTestData(tenant.id);
    });
  });

  describe('POST /api/v1/wallets/:walletId/unfreeze', () => {
    it('should unfreeze a wallet successfully', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // First freeze the wallet
      await request(app)
        .post(`/api/v1/wallets/${wallet.id}/freeze`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'wallet_freeze_setup_1')
        .send({ reason: 'Test freeze' });

      // Then unfreeze it
      const response = await request(app)
        .post(`/api/v1/wallets/${wallet.id}/unfreeze`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'wallet_unfreeze_success_1')
        .send({
          reason: 'Test unfreeze',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'active');

      await cleanupTestData(tenant.id);
    });
  });

  describe('POST /api/v1/wallets/:walletId/close', () => {
    it('should close a wallet with zero balance', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .post(`/api/v1/wallets/${wallet.id}/close`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'wallet_close_zero_balance_1')
        .send({
          reason: 'Test close',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'closed');

      await cleanupTestData(tenant.id);
    });

    it('should reject closing a wallet with non-zero balance', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Credit the wallet first
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_credit')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Test credit',
        });

      // Try to close the wallet
      const response = await request(app)
        .post(`/api/v1/wallets/${wallet.id}/close`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'wallet_close_nonzero_balance_1')
        .send({
          reason: 'Test close',
        });

      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'WALLET_BALANCE_NOT_ZERO');

      await cleanupTestData(tenant.id);
    });
  });
});
