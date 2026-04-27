/**
 * Idempotency Tests
 * 
 * Tests for idempotency behavior:
 * - Duplicate request with same key returns original response
 * - Does not double charge
 * - Different parameters with same key returns conflict
 */

import request from 'supertest';
import { createTestApp } from './utils/app';
import { createTestSetup, cleanupTestData, disconnectPrisma } from './utils/test-helpers';

describe('Idempotency Tests', () => {
  const app = createTestApp();

  afterAll(async () => {
    await disconnectPrisma();
  });

  describe('Credit Idempotency', () => {
    it('should return original response on duplicate credit request', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const idempotencyKey = 'test_idempotency_credit_1';
      const creditRequest = {
        wallet_id: wallet.id,
        amount: 100,
        description: 'Test credit',
        reference_id: 'ref_1',
      };

      // First request
      const firstResponse = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(creditRequest);

      expect(firstResponse.status).toBe(201);
      const firstTransactionId = firstResponse.body.transaction_id;

      // Second request with same idempotency key
      const secondResponse = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(creditRequest);

      expect(secondResponse.status).toBe(201);
      expect(secondResponse.body.transaction_id).toBe(firstTransactionId);
      expect(secondResponse.body.amount).toBe(firstResponse.body.amount);

      await cleanupTestData(tenant.id);
    });

    it('should not double charge on duplicate credit request', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      const idempotencyKey = 'test_idempotency_credit_2';
      const creditRequest = {
        wallet_id: wallet.id,
        amount: 100,
        description: 'Test credit',
      };

      // First request
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(creditRequest);

      // Second request with same idempotency key
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(creditRequest);

      // Check wallet balance - should be 100, not 200
      const walletResponse = await request(app)
        .get(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(walletResponse.body.balance).toBe('100.0000');

      await cleanupTestData(tenant.id);
    });
  });

  describe('Debit Idempotency', () => {
    it('should return original response on duplicate debit request', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Setup: credit the wallet
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_idempotency_debit_setup')
        .send({
          wallet_id: wallet.id,
          amount: 500,
          description: 'Setup credit',
        });

      const idempotencyKey = 'test_idempotency_debit_1';
      const debitRequest = {
        wallet_id: wallet.id,
        amount: 100,
        description: 'Test debit',
      };

      // First request
      const firstResponse = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(debitRequest);

      expect(firstResponse.status).toBe(201);
      const firstTransactionId = firstResponse.body.transaction_id;

      // Second request with same idempotency key
      const secondResponse = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(debitRequest);

      expect(secondResponse.status).toBe(201);
      expect(secondResponse.body.transaction_id).toBe(firstTransactionId);
      expect(secondResponse.body.amount).toBe(firstResponse.body.amount);

      await cleanupTestData(tenant.id);
    });

    it('should not double debit on duplicate debit request', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Setup: credit the wallet
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_idempotency_debit_setup_2')
        .send({
          wallet_id: wallet.id,
          amount: 500,
          description: 'Setup credit',
        });

      const idempotencyKey = 'test_idempotency_debit_2';
      const debitRequest = {
        wallet_id: wallet.id,
        amount: 100,
        description: 'Test debit',
      };

      // First request
      await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(debitRequest);

      // Second request with same idempotency key
      await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(debitRequest);

      // Check wallet balance - should be 400, not 300
      const walletResponse = await request(app)
        .get(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(walletResponse.body.balance).toBe('400.0000');

      await cleanupTestData(tenant.id);
    });
  });

  describe('Transfer Idempotency', () => {
    it('should return original response on duplicate transfer request', async () => {
      const { tenant, apiKey, wallet: wallet1 } = await createTestSetup('user_transfer_1');
      const wallet2 = await request(app)
        .post('/api/v1/wallets')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', `wallet2_${Date.now()}_${Math.random()}`)
        .send({
          external_user_id: 'user_transfer_2',
          currency: 'INR',
        });

      const wallet2Id = wallet2.body.wallet_id;

      // Setup: credit wallet1
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_idempotency_transfer_setup')
        .send({
          wallet_id: wallet1.id,
          amount: 500,
          description: 'Setup credit',
        });

      const idempotencyKey = 'test_idempotency_transfer_1';
      const transferRequest = {
        from_wallet_id: wallet1.id,
        to_wallet_id: wallet2Id,
        amount: 100,
        description: 'Test transfer',
      };

      // First request
      const firstResponse = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(transferRequest);

      expect(firstResponse.status).toBe(201);
      const firstDebitTxId = firstResponse.body.debit_transaction.transaction_id;

      // Wait 300ms before second request
      await new Promise(resolve => setTimeout(resolve, 300));

      // Second request with same idempotency key
      const secondResponse = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(transferRequest);

      expect(secondResponse.status).toBe(201);
      expect(secondResponse.body.debit_transaction.transaction_id).toBe(firstDebitTxId);

      await cleanupTestData(tenant.id);
    });
  });

  describe('Reversal Idempotency', () => {
    it('should return original response on duplicate reversal request', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Setup: credit the wallet
      const creditResponse = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_idempotency_reversal_setup')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Setup credit',
        });

      const transactionId = creditResponse.body.transaction_id;

      const idempotencyKey = 'test_idempotency_reversal_1';
      const reversalRequest = {
        reason: 'Test reversal',
      };

      // First request
      const firstResponse = await request(app)
        .post(`/api/v1/transactions/${transactionId}/reverse`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(reversalRequest);

      expect(firstResponse.status).toBe(201);
      const firstReversalTxId = firstResponse.body.transaction_id;

      // Second request with same idempotency key
      const secondResponse = await request(app)
        .post(`/api/v1/transactions/${transactionId}/reverse`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(reversalRequest);

      expect(secondResponse.status).toBe(201);
      expect(secondResponse.body.transaction_id).toBe(firstReversalTxId);

      await cleanupTestData(tenant.id);
    });
  });
});
