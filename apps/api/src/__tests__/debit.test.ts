/**
 * Debit Tests
 * 
 * Tests for debit operations:
 * - Successful debit
 * - Insufficient funds rejection
 * - Balance update verification
 * - Debit from frozen wallet rejection
 * - Debit from closed wallet rejection
 */

import request from 'supertest';
import { createTestApp } from './utils/app';
import { createTestSetup, cleanupTestData } from './utils/test-helpers';

describe('Debit Tests', () => {
  const app = createTestApp();

  describe('POST /api/v1/transactions/debit', () => {
    it('should debit a wallet successfully with sufficient balance', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // First credit the wallet
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_setup')
        .send({
          wallet_id: wallet.id,
          amount: 500,
          description: 'Setup credit',
        });

      // Now debit
      const response = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_1')
        .send({
          wallet_id: wallet.id,
          amount: 200,
          description: 'Test debit',
          reference_id: 'ref_456',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('transaction_id');
      expect(response.body).toHaveProperty('wallet_id', wallet.id);
      expect(response.body).toHaveProperty('type', 'debit');
      expect(response.body).toHaveProperty('amount', '200.0000');
      expect(response.body).toHaveProperty('balance_before', '500.0000');
      expect(response.body).toHaveProperty('balance_after', '300.0000');
      expect(response.body).toHaveProperty('description', 'Test debit');
      expect(response.body).toHaveProperty('reference_id', 'ref_456');

      await cleanupTestData(tenant.id);
    });

    it('should reject debit with insufficient funds', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Credit with small amount
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_setup_2')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Setup credit',
        });

      // Try to debit more than available
      const response = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_2')
        .send({
          wallet_id: wallet.id,
          amount: 200,
          description: 'Test debit',
        });

      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'INSUFFICIENT_BALANCE');

      await cleanupTestData(tenant.id);
    });

    it('should reject debit with zero balance', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_3')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Test debit',
        });

      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'INSUFFICIENT_BALANCE');

      await cleanupTestData(tenant.id);
    });

    it('should reject debit with invalid amount (zero)', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_4')
        .send({
          wallet_id: wallet.id,
          amount: 0,
          description: 'Test debit',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

      await cleanupTestData(tenant.id);
    });

    it('should reject debit with invalid amount (negative)', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_5')
        .send({
          wallet_id: wallet.id,
          amount: -100,
          description: 'Test debit',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

      await cleanupTestData(tenant.id);
    });

    it('should validate required fields', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_6')
        .send({
          wallet_id: wallet.id,
          // missing amount and description
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

      await cleanupTestData(tenant.id);
    });

    it('should update wallet balance correctly after debit', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Credit first
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_setup_7')
        .send({
          wallet_id: wallet.id,
          amount: 1000,
          description: 'Setup credit',
        });

      // First debit
      await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_7a')
        .send({
          wallet_id: wallet.id,
          amount: 300,
          description: 'First debit',
        });

      // Second debit
      const debitResponse = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_7b')
        .send({
          wallet_id: wallet.id,
          amount: 200,
          description: 'Second debit',
        });

      expect(debitResponse.status).toBe(201);
      expect(debitResponse.body).toHaveProperty('balance_before', '700.0000');
      expect(debitResponse.body).toHaveProperty('balance_after', '500.0000');

      // Verify wallet balance
      const walletResponse = await request(app)
        .get(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(walletResponse.body).toHaveProperty('balance', '500.0000');

      await cleanupTestData(tenant.id);
    });

    it('should reject debit from frozen wallet', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Credit first
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_setup_8')
        .send({
          wallet_id: wallet.id,
          amount: 500,
          description: 'Setup credit',
        });

      // Freeze the wallet
      await request(app)
        .post(`/api/v1/wallets/${wallet.id}/freeze`)
        .set('x-api-key', apiKey.plainKey)
        .send({ reason: 'Test freeze' });

      // Try to debit
      const response = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_8')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Test debit',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'WALLET_FROZEN');

      await cleanupTestData(tenant.id);
    });

    it('should reject debit from closed wallet', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Credit first
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_setup_9')
        .send({
          wallet_id: wallet.id,
          amount: 500,
          description: 'Setup credit',
        });

      // Close the wallet (will fail due to non-zero balance, so we need to debit first)
      await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_setup_9b')
        .send({
          wallet_id: wallet.id,
          amount: 500,
          description: 'Clear balance',
        });

      await request(app)
        .post(`/api/v1/wallets/${wallet.id}/close`)
        .set('x-api-key', apiKey.plainKey)
        .send({ reason: 'Test close' });

      // Try to debit
      const response = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_9')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Test debit',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'WALLET_CLOSED');

      await cleanupTestData(tenant.id);
    });

    it('should return 404 for non-existent wallet', async () => {
      const { tenant, apiKey } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_debit_10')
        .send({
          wallet_id: 'nonexistent_wallet_id',
          amount: 100,
          description: 'Test debit',
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');

      await cleanupTestData(tenant.id);
    });
  });
});
