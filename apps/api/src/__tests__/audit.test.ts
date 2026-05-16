/**
 * Audit Tests
 * 
 * Tests for audit logging:
 * - State-changing actions create audit log entries
 * - Audit log contains correct before/after state
 * - Audit log records actor information
 */

import request from 'supertest';
import { createTestApp } from './utils/app';
import { createTestSetup, cleanupTestData, disconnectPrisma } from './utils/test-helpers';
import { prisma } from '../lib/prisma';

describe('Audit Tests', () => {
  const app = createTestApp();

  afterAll(async () => {
    await disconnectPrisma();
  });

  describe('Wallet Creation Audit', () => {
    it('should create audit log entry when wallet is created', async () => {
      const setupId = `user_audit_setup_${Date.now()}_${Math.random()}`;
      const { tenant, apiKey } = await createTestSetup(setupId);

      // Create a wallet with a different user ID to avoid conflict
      const walletUserId = `user_audit_wallet_${Date.now()}_${Math.random()}`;
      const response = await request(app)
        .post('/api/v1/wallets')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', `audit_wallet_create_${Date.now()}_${Math.random()}`)
        .send({
          external_user_id: walletUserId,
          currency: 'INR',
          label: 'Audit Test Wallet',
        });

      expect(response.status).toBe(201);
      const walletId = response.body.wallet_id;

      // Check audit log
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          entityId: walletId,
          action: 'wallet.created',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const auditLog = auditLogs[0];
      expect(auditLog).toHaveProperty('action', 'wallet.created');
      expect(auditLog).toHaveProperty('entityType', 'Wallet');
      expect(auditLog).toHaveProperty('entityId', walletId);
      expect(auditLog.changes).toHaveProperty('external_user_id', walletUserId);

      await cleanupTestData(tenant.id);
    });
  });

  describe('Credit Transaction Audit', () => {
    it('should create audit log entry when wallet is credited', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Credit the wallet
      const response = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'audit_credit_1')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Audit test credit',
        });

      expect(response.status).toBe(201);
      const transactionId = response.body.transaction_id;

      // Check audit log
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          entityId: transactionId,
          action: 'transaction.credited',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const auditLog = auditLogs[0];
      expect(auditLog).toHaveProperty('action', 'transaction.credited');
      expect(auditLog).toHaveProperty('entityType', 'Transaction');
      expect(auditLog).toHaveProperty('entityId', transactionId);
      expect(auditLog.changes).toHaveProperty('walletId', wallet.id);
      expect(auditLog.changes).toHaveProperty('amount', 100);
      expect(auditLog.changes).toHaveProperty('balanceBefore', "0");
      expect(auditLog.changes).toHaveProperty('balanceAfter', "100");
      expect(auditLog).toHaveProperty('actorType', 'api_key');

      await cleanupTestData(tenant.id);
    });
  });

  describe('Debit Transaction Audit', () => {
    it('should create audit log entry when wallet is debited', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Setup: credit the wallet
      await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'audit_debit_setup')
        .send({
          wallet_id: wallet.id,
          amount: 500,
          description: 'Setup credit',
        });

      // Debit the wallet
      const response = await request(app)
        .post('/api/v1/transactions/debit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'audit_debit_1')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Audit test debit',
        });

      expect(response.status).toBe(201);
      const transactionId = response.body.transaction_id;

      // Check audit log
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          entityId: transactionId,
          action: 'transaction.debited',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const auditLog = auditLogs[0];
      expect(auditLog).toHaveProperty('action', 'transaction.debited');
      expect(auditLog).toHaveProperty('entityType', 'Transaction');
      expect(auditLog).toHaveProperty('entityId', transactionId);
      expect(auditLog.changes).toHaveProperty('walletId', wallet.id);
      expect(auditLog.changes).toHaveProperty('amount', 100);
      expect(auditLog.changes).toHaveProperty('balanceBefore', "500");
      expect(auditLog.changes).toHaveProperty('balanceAfter', "400");

      await cleanupTestData(tenant.id);
    });
  });

  describe('Reversal Transaction Audit', () => {
    it('should create audit log entry when transaction is reversed', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Setup: credit the wallet
      const creditResponse = await request(app)
        .post('/api/v1/transactions/credit')
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'audit_reversal_setup')
        .send({
          wallet_id: wallet.id,
          amount: 100,
          description: 'Setup credit',
        });

      const transactionId = creditResponse.body.transaction_id;

      // Reverse the transaction
      const reversalResponse = await request(app)
        .post(`/api/v1/transactions/${transactionId}/reverse`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'audit_reversal_1')
        .send({
          reason: 'Audit test reversal',
        });

      expect(reversalResponse.status).toBe(201);
      const reversalTxId = reversalResponse.body.transaction_id;

      // Check audit log for reversal
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          entityId: reversalTxId,
          action: 'transaction.reversed',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const auditLog = auditLogs[0];
      expect(auditLog).toHaveProperty('action', 'transaction.reversed');
      expect(auditLog).toHaveProperty('entityType', 'Transaction');
      expect(auditLog).toHaveProperty('entityId', reversalTxId);
      expect(auditLog.changes).toHaveProperty('originalTxId', transactionId);
      expect(auditLog.changes).toHaveProperty('reason', 'Audit test reversal');

      await cleanupTestData(tenant.id);
    });
  });

  describe('Wallet Freeze Audit', () => {
    it('should create audit log entry when wallet is frozen', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Freeze the wallet
      const response = await request(app)
        .post(`/api/v1/wallets/${wallet.id}/freeze`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'audit_wallet_freeze_1')
        .send({
          reason: 'Audit test freeze',
        });

      expect(response.status).toBe(200);

      // Check audit log
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          entityId: wallet.id,
          action: 'wallet.frozen',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const auditLog = auditLogs[0];
      expect(auditLog).toHaveProperty('action', 'wallet.frozen');
      expect(auditLog).toHaveProperty('entityType', 'Wallet');
      expect(auditLog).toHaveProperty('entityId', wallet.id);
      expect(auditLog.changes).toHaveProperty('reason', 'Audit test freeze');
      expect(auditLog.changes).toHaveProperty('before');
      expect((auditLog.changes as any).before).toHaveProperty('status', 'active');
      expect(auditLog.changes).toHaveProperty('after');
      expect((auditLog.changes as any).after).toHaveProperty('status', 'frozen');

      await cleanupTestData(tenant.id);
    });
  });

  describe('Wallet Unfreeze Audit', () => {
    it('should create audit log entry when wallet is unfrozen', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Freeze the wallet first
      await request(app)
        .post(`/api/v1/wallets/${wallet.id}/freeze`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'audit_wallet_freeze_setup_1')
        .send({ reason: 'Test freeze' });

      // Unfreeze the wallet
      const response = await request(app)
        .post(`/api/v1/wallets/${wallet.id}/unfreeze`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'audit_wallet_unfreeze_1')
        .send({
          reason: 'Audit test unfreeze',
        });

      expect(response.status).toBe(200);

      // Check audit log for unfreeze
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          entityId: wallet.id,
          action: 'wallet.unfrozen',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const auditLog = auditLogs[0];
      expect(auditLog).toHaveProperty('action', 'wallet.unfrozen');
      expect(auditLog).toHaveProperty('entityType', 'Wallet');
      expect(auditLog).toHaveProperty('entityId', wallet.id);
      expect(auditLog.changes).toHaveProperty('reason', 'Audit test unfreeze');
      expect(auditLog.changes).toHaveProperty('before');
      expect((auditLog.changes as any).before).toHaveProperty('status', 'frozen');
      expect(auditLog.changes).toHaveProperty('after');
      expect((auditLog.changes as any).after).toHaveProperty('status', 'active');

      await cleanupTestData(tenant.id);
    });
  });

  describe('Wallet Close Audit', () => {
    it('should create audit log entry when wallet is closed', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Close the wallet
      const response = await request(app)
        .post(`/api/v1/wallets/${wallet.id}/close`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'audit_wallet_close_1')
        .send({
          reason: 'Audit test close',
        });

      expect(response.status).toBe(200);

      // Check audit log
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          entityId: wallet.id,
          action: 'wallet.closed',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const auditLog = auditLogs[0];
      expect(auditLog).toHaveProperty('action', 'wallet.closed');
      expect(auditLog).toHaveProperty('entityType', 'Wallet');
      expect(auditLog).toHaveProperty('entityId', wallet.id);
      expect(auditLog.changes).toHaveProperty('reason', 'Audit test close');
      expect(auditLog.changes).toHaveProperty('before');
      expect((auditLog.changes as any).before).toHaveProperty('status', 'active');
      expect(auditLog.changes).toHaveProperty('after');
      expect((auditLog.changes as any).after).toHaveProperty('status', 'closed');

      await cleanupTestData(tenant.id);
    });
  });

  describe('Wallet Update Audit', () => {
    it('should create audit log entry when wallet is updated', async () => {
      const { tenant, apiKey, wallet } = await createTestSetup();

      // Update the wallet
      const response = await request(app)
        .patch(`/api/v1/wallets/${wallet.id}`)
        .set('x-api-key', apiKey.plainKey)
        .set('Idempotency-Key', 'audit_wallet_update_1')
        .send({
          label: 'Updated Label',
          metadata: { key: 'value' },
        });

      expect(response.status).toBe(200);

      // Check audit log
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          entityId: wallet.id,
          action: 'wallet.updated',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const auditLog = auditLogs[0];
      expect(auditLog).toHaveProperty('action', 'wallet.updated');
      expect(auditLog).toHaveProperty('entityType', 'Wallet');
      expect(auditLog).toHaveProperty('entityId', wallet.id);
      expect(auditLog.changes).toHaveProperty('before');
      expect(auditLog.changes).toHaveProperty('after');
      expect((auditLog.changes as any).after).toHaveProperty('label', 'Updated Label');

      await cleanupTestData(tenant.id);
    });
  });
});
