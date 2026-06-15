import { Router, Request, Response, NextFunction } from 'express';
import {
  createWallet,
  getWalletById,
  getWalletByExternalUserId,
  updateWallet,
  freezeWallet,
  unfreezeWallet,
  closeWallet,
} from '../services/wallet.service';
import { transferBetweenWallets } from '../services/transaction.service';
import { apiKeyAuthMiddleware } from '../middleware/auth';
import { userSessionAuthMiddleware } from '../middleware/userSessionAuth';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { prisma } from '../lib/prisma';
import { generateWalletPublicId, generateTransactionPublicId } from '../lib/publicId';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();

async function walletReadAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      await userSessionAuthMiddleware(req, res, next);
      return;
    }
    await apiKeyAuthMiddleware(req, res, next);
  } catch (error) {
    next(error);
  }
}

/**
 * Serialize wallet data for API responses
 */
function serializeWallet(wallet: any) {
  return {
    wallet_id: wallet.id,
    external_user_id: wallet.externalUserId,
    label: wallet.label,
    balance: wallet.balance.toFixed(4),
    currency: wallet.currency,
    status: wallet.status,
    is_sandbox: wallet.isSandbox,
    metadata: wallet.metadata,
  };
}

/**
 * POST /wallets
 * Create a wallet for a user
 */
router.post(
  '/wallets',
  apiKeyAuthMiddleware,
  idempotencyMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { external_user_id, currency, label, metadata } = req.body;

    if (!external_user_id || !currency) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'external_user_id and currency are required');
    }

    const wallet = await prisma.$transaction(async (tx) => {
      // Check if wallet already exists
      const existingWallet = await tx.wallet.findFirst({
        where: {
          tenantId: req.tenantId!,
          externalUserId: external_user_id,
          isSandbox: req.isSandbox || false,
        },
      });

      if (existingWallet) {
        throw new AppError(409, ErrorCode.WALLET_ALREADY_EXISTS, 'Wallet already exists for this user in this tenant and environment');
      }

      // Create wallet within transaction
      const newWallet = await tx.wallet.create({
        data: {
          publicId: generateWalletPublicId(),
          tenantId: req.tenantId!,
          externalUserId: external_user_id,
          currency,
          label,
          metadata,
          isSandbox: req.isSandbox || false,
          balance: 0,
        },
      });

      // Create audit log for API wallet creation within same transaction
      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          entityType: 'Wallet',
          entityId: newWallet.id,
          action: 'wallet.created',
          changes: {
            externalUserId: external_user_id,
            currency,
            label,
            metadata,
            isSandbox: req.isSandbox || false,
          },
          actorId: req.apiKeyId || 'api',
          actorType: 'api_key',
          isSandbox: req.isSandbox || false,
        },
      });

      return newWallet;
    });

    res.status(201).json(serializeWallet(wallet));
  })
);

/**
 * GET /wallets/:walletId
 * Fetch wallet by ID
 */
router.get(
  '/wallets/:walletId',
  walletReadAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { walletId } = req.params;
    if (req.sessionWalletId && req.sessionWalletId !== walletId) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Session token is not valid for this wallet');
    }

    const wallet = await getWalletById(walletId, req.tenantId!, req.isSandbox || false);

    res.json(serializeWallet(wallet));
  })
);

/**
 * GET /wallets/user/:externalUserId
 * Fetch wallet by external user ID
 */
router.get(
  '/wallets/user/:externalUserId',
  apiKeyAuthMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { externalUserId } = req.params;

    const wallet = await getWalletByExternalUserId(
      externalUserId,
      req.tenantId!,
      req.isSandbox || false
    );

    res.json(serializeWallet(wallet));
  })
);

/**
 * PATCH /wallets/:walletId
 * Update wallet label or metadata
 */
router.patch(
  '/wallets/:walletId',
  apiKeyAuthMiddleware,
  idempotencyMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { walletId } = req.params;
    const { label, metadata } = req.body;

    if (!label && !metadata) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'label or metadata must be provided');
    }

    const wallet = await updateWallet(
      walletId,
      req.tenantId!,
      req.isSandbox || false,
      { label, metadata }
    );

    res.json(serializeWallet(wallet));
  })
);

/**
 * POST /wallets/:walletId/freeze
 * Freeze a wallet
 */
router.post(
  '/wallets/:walletId/freeze',
  apiKeyAuthMiddleware,
  idempotencyMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { walletId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'reason is required');
    }

    const wallet = await freezeWallet(
      walletId,
      req.tenantId!,
      req.isSandbox || false,
      reason
    );

    res.json(serializeWallet(wallet));
  })
);

/**
 * POST /wallets/:walletId/unfreeze
 * Unfreeze a wallet
 */
router.post(
  '/wallets/:walletId/unfreeze',
  apiKeyAuthMiddleware,
  idempotencyMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { walletId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'reason is required');
    }

    const wallet = await unfreezeWallet(
      walletId,
      req.tenantId!,
      req.isSandbox || false,
      reason
    );

    res.json(serializeWallet(wallet));
  })
);

/**
 * POST /wallets/:walletId/close
 * Close a wallet (only when balance is zero)
 */
router.post(
  '/wallets/:walletId/close',
  apiKeyAuthMiddleware,
  idempotencyMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { walletId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'reason is required');
    }

    const wallet = await closeWallet(
      walletId,
      req.tenantId!,
      req.isSandbox || false,
      reason
    );

    res.json(serializeWallet(wallet));
  })
);

/**
 * POST /wallets/:walletId/transfer
 * Transfer funds to another wallet (same tenant, same currency)
 */
router.post(
  '/wallets/:walletId/transfer',
  apiKeyAuthMiddleware,
  idempotencyMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { walletId } = req.params;
    const { to_wallet_id, amount, description, reference_id, metadata } = req.body;

    if (!to_wallet_id) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'to_wallet_id is required');
    }
    if (amount === undefined || amount === null) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'amount is required');
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'amount must be a positive number');
    }
    if (!description) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'description is required');
    }

    const result = await transferBetweenWallets({
      tenantId: req.tenantId!,
      fromWalletId: walletId,
      toWalletId: to_wallet_id,
      amount: new Decimal(String(amount)),
      description,
      referenceId: reference_id,
      idempotencyKey: req.idempotencyKey,
      metadata,
      isSandbox: req.isSandbox || false,
      createdBy: req.apiKeyId,
    });

    res.status(200).json({
      debit_transaction_id: result.debitTransaction.publicId,
      credit_transaction_id: result.creditTransaction.publicId,
      from_wallet_id: walletId,
      to_wallet_id,
      amount: result.debitTransaction.amount.toFixed(4),
      currency: result.debitTransaction.currency,
    });
  })
);

/**
 * DELETE /wallets/:walletId
 * Close a wallet (balance must be zero). Permanently marks it as closed.
 */
router.delete(
  '/wallets/:walletId',
  apiKeyAuthMiddleware,
  idempotencyMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { walletId } = req.params;
    const { reason } = req.body;

    const wallet = await prisma.$transaction(async (tx) => {
      const closedWallet = await closeWallet(
        walletId,
        req.tenantId!,
        req.isSandbox || false,
        reason || 'Closed via API DELETE request',
        tx
      );

      // Create a dummy / closing transaction entry to satisfy idempotency cached response mapping
      if (req.idempotencyKey) {
        await tx.transaction.create({
          data: {
            publicId: generateTransactionPublicId(),
            tenantId: req.tenantId!,
            walletId: closedWallet.id,
            type: 'debit',
            amount: 0,
            currency: closedWallet.currency,
            balanceBefore: 0,
            balanceAfter: 0,
            idempotencyKey: req.idempotencyKey,
            metadata: {
              description: 'Wallet closed idempotency record',
              requestFingerprint: req.requestFingerprint,
            },
          },
        });
      }

      return closedWallet;
    });

    res.json({
      wallet_id: walletId,
      status: wallet.status,
      message: 'Wallet closed successfully',
    });
  })
);

export default router;

