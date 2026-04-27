import { Router } from 'express';
import { adminAuthMiddleware, requireAdminRole } from '../middleware/adminAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { prisma } from '../lib/prisma';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { freezeWallet, unfreezeWallet } from '../services/wallet.service';

const router = Router();

// Apply admin auth to all routes
router.use(adminAuthMiddleware);

/**
 * GET /admin/wallets
 * List all wallets for the tenant with filtering
 */
router.get(
  '/wallets',
  asyncHandler(async (req, res) => {
    const { status, currency, search, limit = 20, after } = req.query;
    const tenantId = req.adminUser!.tenantId;

    const where: any = { tenantId };

    if (status) where.status = status;
    if (currency) where.currency = currency;
    if (search) {
      where.OR = [
        { externalUserId: { contains: search as string, mode: 'insensitive' } },
        { label: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const cappedLimit = Number(limit) > 100 ? 100 : Number(limit);
    const wallets = await prisma.wallet.findMany({
      where,
      take: cappedLimit,
      skip: after ? 1 : 0,
      cursor: after ? { id: after as string } : undefined,
      orderBy: { id: 'desc' },
    });

    const nextCursor = wallets.length === cappedLimit ? wallets[wallets.length - 1].id : null;

    res.json({
      data: wallets.map(w => ({
        wallet_id: w.id,
        external_user_id: w.externalUserId,
        label: w.label,
        balance: w.balance.toFixed(4),
        currency: w.currency,
        status: w.status,
        is_sandbox: w.isSandbox,
        metadata: w.metadata,
      })),
      next_cursor: nextCursor,
    });
  })
);

/**
 * GET /admin/wallets/:walletId
 * Get detailed wallet information
 */
router.get(
  '/wallets/:walletId',
  asyncHandler(async (req, res) => {
    const { walletId } = req.params;
    const tenantId = req.adminUser!.tenantId;

    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, tenantId },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    res.json({
      wallet_id: wallet.id,
      external_user_id: wallet.externalUserId,
      label: wallet.label,
      balance: wallet.balance.toFixed(4),
      currency: wallet.currency,
      status: wallet.status,
      is_sandbox: wallet.isSandbox,
      metadata: wallet.metadata,
    });
  })
);

/**
 * POST /admin/transactions/credit
 * Manual credit with mandatory reason
 */
router.post(
  '/transactions/credit',
  requireAdminRole('finance'),
  asyncHandler(async (req, res) => {
    const { wallet_id, amount, description, reference_id, metadata, reason } = req.body;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;

    if (!wallet_id || !amount || !description || !reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required fields: wallet_id, amount, description, reason');
    }

    const wallet = await prisma.wallet.findFirst({
      where: { id: wallet_id, tenantId },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    if (wallet.status !== 'active') {
      throw new AppError(409, ErrorCode.WALLET_FROZEN, 'Wallet is not active');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Lock wallet row
      const lockedWallet = await tx.wallet.findUnique({
        where: { id: wallet_id },
        select: { balance: true },
      });

      if (!lockedWallet) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
      }

      const balanceBefore = lockedWallet.balance;
      const balanceAfter = balanceBefore.plus(amount);

      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          tenantId,
          walletId: wallet_id,
          type: 'credit',
          amount: amount,
          currency: wallet.currency,
          balanceBefore,
          balanceAfter,
          referenceId: reference_id,
          metadata: {
            ...metadata,
            description: `${description} (Admin: ${reason})`,
            admin_action: true,
            admin_email: adminEmail,
            admin_reason: reason,
          },
        },
      });

      // Update wallet balance
      await tx.wallet.update({
        where: { id: wallet_id },
        data: { balance: balanceAfter },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'wallet',
          entityId: wallet_id,
          action: 'admin.credit',
          changes: {
            amount: amount,
            reason: reason,
            admin: adminEmail,
          },
          actorId: adminEmail,
          actorType: 'admin',
        },
      });

      return transaction;
    });

    res.status(201).json({
      transaction_id: result.id,
      wallet_id: result.walletId,
      type: result.type,
      amount: result.amount.toFixed(4),
      balance_before: result.balanceBefore.toFixed(4),
      balance_after: result.balanceAfter.toFixed(4),
      reference_id: result.referenceId,
      is_sandbox: wallet.isSandbox,
      metadata: result.metadata,
      created_at: result.createdAt,
    });
  })
);

/**
 * POST /admin/transactions/debit
 * Manual debit with mandatory reason
 */
router.post(
  '/transactions/debit',
  requireAdminRole('finance'),
  asyncHandler(async (req, res) => {
    const { wallet_id, amount, description, reference_id, reason } = req.body;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;

    if (!wallet_id || !amount || !description || !reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required fields: wallet_id, amount, description, reason');
    }

    const wallet = await prisma.wallet.findFirst({
      where: { id: wallet_id, tenantId },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    if (wallet.status !== 'active') {
      throw new AppError(409, ErrorCode.WALLET_FROZEN, 'Wallet is not active');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Lock wallet row
      const lockedWallet = await tx.wallet.findUnique({
        where: { id: wallet_id },
        select: { balance: true },
      });

      if (!lockedWallet) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
      }

      const balanceBefore = lockedWallet.balance;
      const balanceAfter = balanceBefore.minus(amount);

      if (balanceAfter.isNegative()) {
        throw new AppError(422, ErrorCode.INSUFFICIENT_BALANCE, 'Insufficient balance');
      }

      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          tenantId,
          walletId: wallet_id,
          type: 'debit',
          amount: amount,
          currency: wallet.currency,
          balanceBefore,
          balanceAfter,
          referenceId: reference_id,
          metadata: {
            description: `${description} (Admin: ${reason})`,
            admin_action: true,
            admin_email: adminEmail,
            admin_reason: reason,
          },
        },
      });

      // Update wallet balance
      await tx.wallet.update({
        where: { id: wallet_id },
        data: { balance: balanceAfter },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'wallet',
          entityId: wallet_id,
          action: 'admin.debit',
          changes: {
            amount: amount,
            reason: reason,
            admin: adminEmail,
          },
          actorId: adminEmail,
          actorType: 'admin',
        },
      });

      return transaction;
    });

    res.status(201).json({
      transaction_id: result.id,
      wallet_id: result.walletId,
      type: result.type,
      amount: result.amount.toFixed(4),
      balance_before: result.balanceBefore.toFixed(4),
      balance_after: result.balanceAfter.toFixed(4),
      reference_id: result.referenceId,
      is_sandbox: wallet.isSandbox,
      metadata: result.metadata,
      created_at: result.createdAt,
    });
  })
);

/**
 * POST /admin/transactions/:txId/reverse
 * Manual reversal with mandatory reason
 */
router.post(
  '/transactions/:txId/reverse',
  requireAdminRole('finance'),
  asyncHandler(async (req, res) => {
    const { txId } = req.params;
    const { reason } = req.body;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required field: reason');
    }

    const originalTx = await prisma.transaction.findFirst({
      where: { id: txId, tenantId },
    });

    if (!originalTx) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Transaction not found');
    }

    if (originalTx.type === 'reversal') {
      throw new AppError(409, ErrorCode.CANNOT_REVERSE_REVERSAL, 'Cannot reverse a reversal');
    }

    const wallet = await prisma.wallet.findFirst({
      where: { id: originalTx.walletId, tenantId },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    if (wallet.status !== 'active') {
      throw new AppError(409, ErrorCode.WALLET_FROZEN, 'Wallet is not active');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Lock wallet row
      const lockedWallet = await tx.wallet.findUnique({
        where: { id: originalTx.walletId },
        select: { balance: true },
      });

      if (!lockedWallet) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
      }

      const balanceBefore = lockedWallet.balance;
      const balanceAfter = originalTx.type === 'credit' 
        ? balanceBefore.minus(originalTx.amount)
        : balanceBefore.plus(originalTx.amount);

      if (balanceAfter.isNegative()) {
        throw new AppError(422, ErrorCode.INSUFFICIENT_BALANCE, 'Insufficient balance for reversal');
      }

      // Create reversal transaction
      const reversalTx = await tx.transaction.create({
        data: {
          tenantId,
          walletId: originalTx.walletId,
          type: 'reversal',
          amount: originalTx.amount,
          currency: originalTx.currency,
          balanceBefore,
          balanceAfter,
          metadata: {
            description: `Reversal of: ${(originalTx.metadata as any)?.description || originalTx.id} (Admin: ${reason})`,
            admin_action: true,
            admin_email: adminEmail,
            admin_reason: reason,
            original_tx_id: originalTx.id,
          },
        },
      });

      // Update wallet balance
      await tx.wallet.update({
        where: { id: originalTx.walletId },
        data: { balance: balanceAfter },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'transaction',
          entityId: originalTx.id,
          action: 'admin.reverse',
          changes: {
            amount: originalTx.amount,
            reason: reason,
            admin: adminEmail,
          },
          actorId: adminEmail,
          actorType: 'admin',
        },
      });

      return reversalTx;
    });

    res.status(201).json({
      transaction_id: result.id,
      type: result.type,
      original_tx_id: originalTx.id,
      amount: result.amount.toFixed(4),
      balance_before: result.balanceBefore.toFixed(4),
      balance_after: result.balanceAfter.toFixed(4),
      created_at: result.createdAt,
    });
  })
);

/**
 * POST /admin/wallets/:walletId/freeze
 * Freeze wallet with mandatory reason
 */
router.post(
  '/wallets/:walletId/freeze',
  requireAdminRole('support'),
  asyncHandler(async (req, res) => {
    const { walletId } = req.params;
    const { reason } = req.body;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required field: reason');
    }

    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, tenantId },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    if (wallet.status === 'frozen') {
      throw new AppError(409, ErrorCode.WALLET_ALREADY_FROZEN, 'Wallet is already frozen');
    }

    if (wallet.status === 'closed') {
      throw new AppError(409, ErrorCode.WALLET_ALREADY_CLOSED, 'Cannot freeze a closed wallet');
    }

    const updatedWallet = await freezeWallet(walletId, tenantId, wallet.isSandbox, reason);

    res.json({
      wallet_id: updatedWallet.id,
      external_user_id: updatedWallet.externalUserId,
      label: updatedWallet.label,
      balance: updatedWallet.balance.toFixed(4),
      currency: updatedWallet.currency,
      status: updatedWallet.status,
      is_sandbox: updatedWallet.isSandbox,
      metadata: updatedWallet.metadata,
    });
  })
);

/**
 * POST /admin/wallets/:walletId/unfreeze
 * Unfreeze wallet with mandatory reason
 */
router.post(
  '/wallets/:walletId/unfreeze',
  requireAdminRole('support'),
  asyncHandler(async (req, res) => {
    const { walletId } = req.params;
    const { reason } = req.body;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required field: reason');
    }

    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, tenantId },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    if (wallet.status !== 'frozen') {
      throw new AppError(409, ErrorCode.INVALID_OPERATION, 'Wallet is not frozen');
    }

    const updatedWallet = await unfreezeWallet(walletId, tenantId, wallet.isSandbox, reason);

    res.json({
      wallet_id: updatedWallet.id,
      external_user_id: updatedWallet.externalUserId,
      label: updatedWallet.label,
      balance: updatedWallet.balance.toFixed(4),
      currency: updatedWallet.currency,
      status: updatedWallet.status,
      is_sandbox: updatedWallet.isSandbox,
      metadata: updatedWallet.metadata,
    });
  })
);

/**
 * POST /admin/tenants
 * Create new tenant with API keys (superadmin only)
 */
router.post(
  '/tenants',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const { name, contact_email, config } = req.body;
    const adminEmail = req.adminUser!.email;

    if (!name) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required field: name');
    }

    const { randomBytes } = await import('crypto');
    const { default: bcrypt } = await import('bcrypt');

    // Generate API keys
    const liveKey = `wlt_live_${randomBytes(24).toString('hex')}`;
    const testKey = `wlt_test_${randomBytes(24).toString('hex')}`;

    // Hash keys with bcrypt
    const liveKeyHash = await bcrypt.hash(liveKey, 10);
    const testKeyHash = await bcrypt.hash(testKey, 10);

    const result = await prisma.$transaction(async (tx) => {
      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name,
          contactEmail: contact_email,
          config,
        },
      });

      // Create live API key
      await tx.apiKey.create({
        data: {
          tenantId: tenant.id,
          keyHash: liveKeyHash,
          prefix: liveKey.substring(0, 15),
          scope: 'admin',
          isSandbox: false,
        },
      });

      // Create test API key
      await tx.apiKey.create({
        data: {
          tenantId: tenant.id,
          keyHash: testKeyHash,
          prefix: testKey.substring(0, 15),
          scope: 'admin',
          isSandbox: true,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          entityType: 'tenant',
          entityId: tenant.id,
          action: 'tenant.created',
          changes: {
            name,
            contact_email,
            created_by: adminEmail,
          },
          actorId: adminEmail,
          actorType: 'admin',
        },
      });

      return tenant;
    });

    res.status(201).json({
      tenant_id: result.id,
      name: result.name,
      contact_email: result.contactEmail,
      live_key: liveKey,
      test_key: testKey,
      created_at: result.createdAt,
    });
  })
);

/**
 * GET /admin/audit
 * Query audit logs
 */
router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const { wallet_id, actor, action, from, to, limit = 20, after } = req.query;
    const tenantId = req.adminUser!.tenantId;

    const where: any = { tenantId };

    if (wallet_id) where.entityId = wallet_id;
    if (actor) where.actorId = actor;
    if (action) where.action = action;
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from as string);
      if (to) where.timestamp.lte = new Date(to as string);
    }

    const cappedLimit = Number(limit) > 100 ? 100 : Number(limit);

    // Parse cursor to extract timestamp and id for stable pagination
    if (after) {
      const cursorLog = await prisma.auditLog.findUnique({
        where: { id: after as string },
        select: { timestamp: true, id: true },
      });

      if (cursorLog) {
        where.OR = [
          { timestamp: { lt: cursorLog.timestamp } },
          {
            AND: [
              { timestamp: cursorLog.timestamp },
              { id: { lt: cursorLog.id } },
            ],
          },
        ];
      }
    }

    const auditLogs = await prisma.auditLog.findMany({
      where,
      take: cappedLimit,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    });

    const nextCursor = auditLogs.length === cappedLimit ? auditLogs[auditLogs.length - 1].id : null;

    res.json({
      data: auditLogs.map(log => ({
        id: log.id,
        tenant_id: log.tenantId,
        wallet_id: log.entityId,
        action: log.action,
        actor: log.actorType ? `${log.actorType}:${log.actorId}` : log.actorId,
        changes: log.changes,
        timestamp: log.timestamp,
      })),
      next_cursor: nextCursor,
    });
  })
);

export default router;
