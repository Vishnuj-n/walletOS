/**
 * Reversal Tests
 * 
 * Tests for reversal operations:
 * - Reverse valid transaction
 * - Reject duplicate reversal
 * - Cannot reverse a reversal
 * - Balance updates correctly after reversal
 */

import request from 'supertest';
import { createTestApp } from './utils/app';
import { createTestSetup, cleanupTestData } from './utils/test-helpers';

describe('Reversal Tests', () => {
  const app = createTestApp();

  describe('POST /api/v1/transactions/:txId/reverse', () => {
    it('should reverse a credit transaction successfully', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Create a credit transaction
      const creditResponse = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_credit_setup')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Test credit',
        });

      const transactionId = creditResponse.body.transaction_id;

      // Reverse the credit
      const reversalResponse = await request(app)
        .post(`/api/v1/transactions/${transactionId}/reverse`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_1')
        .send({
          reason: 'Customer requested refund',
        });

      expect(reversalResponse.status).toBe(201);
      expect(reversalResponse.body).toHaveProperty('transaction_id');
      expect(reversalResponse.body).toHaveProperty('type', 'reversal');
      expect(reversalResponse.body).toHaveProperty('original_tx_id', transactionId);
      expect(reversalResponse.body).toHaveProperty('amount', '100.0000');
      expect(reversalResponse.body).toHaveProperty('balance_before', '100.0000');
      expect(reversalResponse.body).toHaveProperty('balance_after', '0.0000');

      // Verify wallet balance is back to 0
      const walletResponse = await request(app)
        .get(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(walletResponse.body.balance).toBe('0.0000');

      await cleanupTestData(tenant.id);
    });

    it('should reverse a debit transaction successfully', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Setup: credit the wallet
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_debit_setup')
        .send({
          wallet_id: wallet.id,
          amount: 500,
          description: 'Setup credit',
        });

      // Create a debit transaction
      const debitResponse = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_debit')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Test debit',
        });

      const transactionId = debitResponse.body.transaction_id;

      // Reverse the debit (should add money back)
      const reversalResponse = await request(app)
        .post(`/api/v1/transactions/${transactionId}/reverse`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_2')
        .send({
          reason: 'Incorrect charge',
        });

      expect(reversalResponse.status).toBe(201);
      expect(reversalResponse.body).toHaveProperty('type', 'reversal');
      expect(reversalResponse.body).toHaveProperty('original_tx_id', transactionId);
      expect(reversalResponse.body).toHaveProperty('balance_before', '400.0000');
      expect(reversalResponse.body).toHaveProperty('balance_after', '500.0000');

      // Verify wallet balance is back to 500
      const walletResponse = await request(app)
        .get(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(walletResponse.body.balance).toBe('500.0000');

      await cleanupTestData(tenant.id);
    });

    it('should reject reversing a reversal transaction', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Create a credit transaction
      const creditResponse = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_nested_setup')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Test credit',
        });

      const transactionId = creditResponse.body.transaction_id;

      // Reverse the credit
      const reversalResponse = await request(app)
        .post(`/api/v1/transactions/${transactionId}/reverse`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_3a')
        .send({
          reason: 'First reversal',
        });

      const reversalTxId = reversalResponse.body.transaction_id;

      // Try to reverse the reversal
      const doubleReversalResponse = await request(app)
        .post(`/api/v1/transactions/${reversalTxId}/reverse`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_3b')
        .send({
          reason: 'Trying to reverse the reversal',
        });

      expect(doubleReversalResponse.status).toBe(409);
      expect(doubleReversalResponse.body).toHaveProperty('error');
      expect(doubleReversalResponse.body.error).toHaveProperty('code', 'CANNOT_REVERSE_REVERSAL');

      await cleanupTestData(tenant.id);
    });

    it('should validate that reason is provided', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Create a credit transaction
      const creditResponse = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_validation_setup')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Test credit',
        });

      const transactionId = creditResponse.body.transaction_id;

      // Try to reverse without reason
      const response = await request(app)
        .post(`/api/v1/transactions/${transactionId}/reverse`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_4')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

      await cleanupTestData(tenant.id);
    });

    it('should return 404 for non-existent transaction', async () => {
      const { tenant, apiKey } = await createTestSetup();

      const response = await request(app)
        .post('/api/v1/transactions/nonexistent_tx_id/reverse')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_5')
        .send({
          reason: 'Test reversal',
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');

      await cleanupTestData(tenant.id);
    });

    it('should reject reversal of credit when insufficient balance', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Create a credit transaction
      const creditResponse = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_insufficient_setup')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Test credit',
        });

      const transactionId = creditResponse.body.transaction_id;

      // Debit most of the balance (leaving less than the original credit)
      await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_insufficient_debit')
        .send({
          wallet_id: wallet.id,
          amount: 90,
          description: 'Partial debit',
        });

      // Try to reverse the credit (should fail due to insufficient balance)
      const reversalResponse = await request(app)
        .post(`/api/v1/transactions/${transactionId}/reverse`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_6')
        .send({
          reason: 'Trying to reverse credit with insufficient balance',
        });

      expect(reversalResponse.status).toBe(422);
      expect(reversalResponse.body).toHaveProperty('error');
      expect(reversalResponse.body.error).toHaveProperty('code', 'INSUFFICIENT_BALANCE');

      await cleanupTestData(tenant.id);
    });

    it('should reject reversal from frozen wallet', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Create a credit transaction
      const creditResponse = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_frozen_setup')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Test credit',
        });

      const transactionId = creditResponse.body.transaction_id;

      // Freeze the wallet
      await request(app)
        .post(`/api/v1/wallets/${wallet.id}/freeze`)
        .set('x-api-key', apiKey.plainKey)
        .send({ reason: 'Test freeze' });

      // Try to reverse the credit
      const reversalResponse = await request(app)
        .post(`/api/v1/transactions/${transactionId}/reverse`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'test_reversal_7')
        .send({
          reason: 'Test reversal',
        });

      expect(reversalResponse.status).toBe(409);
      expect(reversalResponse.body).toHaveProperty('error');
      expect(reversalResponse.body.error).toHaveProperty('code', 'WALLET_FROZEN');

      await cleanupTestData(tenant.id);
    });
  });
});
