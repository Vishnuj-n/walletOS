/**
 * Credit Tests
 * 
 * Tests for credit operations:
 * - Valid credit
 * - Invalid amount rejection
 * - Balance update verification
 * - Credit to frozen wallet rejection
 * - Credit to closed wallet rejection
 */

import request from 'supertest';
import { createTestApp } from './utils/app';
import { createTestSetup, cleanupTestData } from './utils/test-helpers';

describe('Credit Tests', () => {
  const app = createTestApp();

  describe('POST /api/v1/transactions/credit', () => {
    it('should credit a wallet successfully', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_credit_1')
        .send({
          wallet_id: wallet.id,
          amount: 250.00,
          description: 'Test credit',
          reference_id: 'ref_123',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('transaction_id');
      expect(response.body).toHaveProperty('wallet_id', wallet.id);
      expect(response.body).toHaveProperty('type', 'credit');
      expect(response.body).toHaveProperty('amount', '250.0000');
      expect(response.body).toHaveProperty('balance_before', '0.0000');
      expect(response.body).toHaveProperty('balance_after', '250.0000');
      expect(response.body).toHaveProperty('description', 'Test credit');
      expect(response.body).toHaveProperty('reference_id', 'ref_123');

      await cleanupTestData(tenant.id);
    });

    it('should reject credit with invalid amount (zero)', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_credit_2')
        .send({
          wallet_id: wallet.id,
          amount: 0,
          description: 'Test credit',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

      await cleanupTestData(tenant.id);
    });

    it('should reject credit with invalid amount (negative)', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_credit_3')
        .send({
          wallet_id: wallet.id,
          amount: -100,
          description: 'Test credit',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

      await cleanupTestData(tenant.id);
    });

    it('should validate required fields', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_credit_4')
        .send({
          wallet_id: wallet.id,
          // missing amount and description
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

      await cleanupTestData(tenant.id);
    });

    it('should update wallet balance correctly after credit', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // First credit
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_credit_5a')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'First credit',
        });

      // Second credit
      const creditResponse = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_credit_5b')
        .send({
          wallet_id: wallet.id,
          amount: 150,
          description: 'Second credit',
        });

      expect(creditResponse.status).toBe(201);
      expect(creditResponse.body).toHaveProperty('balance_before', '100.0000');
      expect(creditResponse.body).toHaveProperty('balance_after', '250.0000');

      // Verify wallet balance
      const walletResponse = await request(app)
        .get(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(walletResponse.body).toHaveProperty('balance', '250.0000');

      await cleanupTestData(tenant.id);
    });

    it('should reject credit to frozen wallet', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Freeze the wallet
      await request(app)
        .post(`/api/v1/wallets/${wallet.id}/freeze`)
        .set('x-api-key', apiKey.plainKey)
        .send({ reason: 'Test freeze' });

      // Try to credit
      const response = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_credit_6')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Test credit',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'WALLET_FROZEN');

      await cleanupTestData(tenant.id);
    });

    it('should reject credit to closed wallet', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Close the wallet
      await request(app)
        .post(`/api/v1/wallets/${wallet.id}/close`)
        .set('x-api-key', apiKey.plainKey)
        .send({ reason: 'Test close' });

      // Try to credit
      const response = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_credit_7')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Test credit',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'WALLET_CLOSED');

      await cleanupTestData(tenant.id);
    });

    it('should return 404 for non-existent wallet', async () => {
      const { tenant, apiKey } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_credit_8')
        .send({
          wallet_id: 'nonexistent_wallet_id',
          amount: 100,
          description: 'Test credit',
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');

      await cleanupTestData(tenant.id);
    });
  });
});
