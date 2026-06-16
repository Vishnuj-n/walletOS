/**
 * Concurrency Tests
 * 
 * Tests for concurrent operations:
 * - Parallel debit requests preserve correct final balance
 * - Parallel credit requests sum correctly
 * - Mixed parallel operations maintain consistency
 */

import request from 'supertest';
import { createTestApp } from './utils/app';
import { createTestSetup, cleanupTestData, disconnectPrisma } from './utils/test-helpers';

interface Transaction {
  type: 'credit' | 'debit' | 'reversal';
  amount: string;
}


describe('Concurrency Tests', () => {
  const app = createTestApp();

  afterAll(async () => {
    await disconnectPrisma();
  });

  describe('Parallel Debit Operations', () => {
    it('should handle parallel debit requests and preserve correct final balance', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Setup: credit the wallet with 1000
      const setupRes = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'concurrency_debit_setup')
        .send({
          wallet_id: wallet.id,
          amount: 1000,
          description: 'Setup credit',
        });
      
      expect(setupRes.status).toBe(201);
      expect(setupRes.body).toHaveProperty('transaction_id');
      expect(setupRes.body.amount).toBe('1000.0000');

      // Execute 10 parallel debit requests of 50 each (total 500)
      const debitPromises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post('/api/v1/transactions/debit')
          .set('x-api-key', apiKey.plainKey)
          .set('Idempotency-Key', `concurrency_debit_${i}`)
          .send({
            wallet_id: wallet.id,
            amount: 50,
            description: `Concurrent debit ${i}`,
          })
      );

      const responses = await Promise.all(debitPromises);

      // All should succeed
      const successCount = responses.filter(r => r.status === 201).length;
      expect(successCount).toBe(10);

      // Final balance should be 500 (1000 - 10 * 50)
      const walletResponse = await request(app)
        .get(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(walletResponse.body.balance).toBe('500.0000');

      // Ledger consistency assertion: sum of all transactions should equal final balance
      const transactionsResponse = await request(app)
        .get(`/api/v1/transactions?wallet_id=${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(transactionsResponse.status).toBe(200);
      const transactions: Transaction[] = transactionsResponse.body.data;

      // Calculate expected balance: initial (0) + credit (1000) - debits (10 * 50) = 500
      const creditSum = transactions
        .filter((tx: Transaction) => tx.type === 'credit')
        .reduce((sum: number, tx: Transaction) => sum + parseFloat(tx.amount), 0);

      const debitSum = transactions
        .filter((tx: Transaction) => tx.type === 'debit')
        .reduce((sum: number, tx: Transaction) => sum + parseFloat(tx.amount), 0);

      const expectedBalance = creditSum - debitSum;
      expect(expectedBalance).toBe(500);
      expect(parseFloat(walletResponse.body.balance)).toBe(expectedBalance);

      await cleanupTestData(tenant.id);
    });

    it('should handle parallel debit requests that exceed balance (some should fail)', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Setup: credit the wallet with 300
      const setupRes = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'concurrency_debit_exceed_setup')
        .send({
          wallet_id: wallet.id,
          amount: 300,
          description: 'Setup credit',
        });
      
      expect(setupRes.status).toBe(201);
      expect(setupRes.body).toHaveProperty('transaction_id');
      expect(setupRes.body.amount).toBe('300.0000');

      // Execute 10 parallel debit requests of 50 each (total 500, but only 300 available)
      const debitPromises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post('/api/v1/transactions/debit')
          .set('x-api-key', apiKey.plainKey)
          .set('Idempotency-Key', `concurrency_debit_exceed_${i}`)
          .send({
            wallet_id: wallet.id,
            amount: 50,
            description: `Concurrent debit ${i}`,
          })
      );

      const responses = await Promise.all(debitPromises);

      // Enforce deterministic serialization: exactly 6 succeed, 4 fail
      const successCount = responses.filter(r => r.status === 201).length;
      const failureCount = responses.filter(r => r.status === 422).length;

      expect(successCount).toBe(6);
      expect(failureCount).toBe(4);

      // Final balance should be 0 (300 - 6 * 50 = 0)
      const walletResponse = await request(app)
        .get(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(walletResponse.body.balance).toBe('0.0000');

      await cleanupTestData(tenant.id);
    });
  });

  describe('Parallel Credit Operations', () => {
    it('should handle parallel credit requests and sum correctly', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Execute 10 parallel credit requests of 100 each (total 1000)
      const creditPromises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post('/api/v1/transactions/credit')
          .set('x-api-key', apiKey.plainKey)
          .set('Idempotency-Key', `concurrency_credit_${i}`)
          .send({
            wallet_id: wallet.id,
            amount: 100,
            description: `Concurrent credit ${i}`,
          })
      );

      const responses = await Promise.all(creditPromises);

      // All should succeed
      const successCount = responses.filter(r => r.status === 201).length;
      expect(successCount).toBe(10);

      // Final balance should be 1000
      const walletResponse = await request(app)
        .get(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(walletResponse.body.balance).toBe('1000.0000');

      await cleanupTestData(tenant.id);
    });
  });

  describe('Mixed Parallel Operations', () => {
    it('should handle mixed parallel credit and debit operations', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Setup: credit the wallet with 500
      const setupRes = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'concurrency_mixed_setup')
        .send({
          wallet_id: wallet.id,
          amount: 500,
          description: 'Setup credit',
        });
      
      expect(setupRes.status).toBe(201);
      expect(setupRes.body).toHaveProperty('transaction_id');
      expect(setupRes.body.amount).toBe('500.0000');

      // Execute 5 parallel credit requests of 100 each (total 500)
      const creditPromises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/v1/transactions/credit')
          .set('x-api-key', apiKey.plainKey)
          .set('Idempotency-Key', `concurrency_mixed_credit_${i}`)
          .send({
            wallet_id: wallet.id,
            amount: 100,
            description: `Concurrent credit ${i}`,
          })
      );

      // Execute 3 parallel debit requests of 150 each (total 450)
      const debitPromises = Array.from({ length: 3 }, (_, i) =>
        request(app)
          .post('/api/v1/transactions/debit')
          .set('x-api-key', apiKey.plainKey)
          .set('Idempotency-Key', `concurrency_mixed_debit_${i}`)
          .send({
            wallet_id: wallet.id,
            amount: 150,
            description: `Concurrent debit ${i}`,
          })
      );

      const allResponses = await Promise.all([...creditPromises, ...debitPromises]);

      // All should succeed
      const successCount = allResponses.filter(r => r.status === 201).length;
      expect(successCount).toBe(8);

      // Final balance should be 550 (500 + 500 - 450)
      const walletResponse = await request(app)
        .get(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(walletResponse.body.balance).toBe('550.0000');

      await cleanupTestData(tenant.id);
    });
  });

  describe('Parallel Wallet Operations', () => {
    it('should handle parallel wallet updates without conflicts', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Execute 5 parallel wallet update requests
      const updatePromises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .patch(`/api/v1/wallets/${wallet.id}`)
          .set('x-api-key', apiKey.plainKey)
          .set('Idempotency-Key', Date.now().toString() + Math.random())
          .send({
            label: `Updated Label ${i}`,
            metadata: { iteration: i },
          })
      );

      const responses = await Promise.all(updatePromises);

      // All should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBe(5);

      // Final wallet should have the last update
      const walletResponse = await request(app)
        .get(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey);

      expect(walletResponse.body).toHaveProperty('label');
      expect(walletResponse.body).toHaveProperty('metadata');

      await cleanupTestData(tenant.id);
    });
  });
});
