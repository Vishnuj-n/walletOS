import { Router, Request, Response } from 'express';
import {
  createWallet,
  getWalletById,
  getWalletByExternalUserId,
  updateWallet,
  freezeWallet,
  unfreezeWallet,
  closeWallet,
} from '../services/wallet.service';
import { apiKeyAuthMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { AppError, ErrorCode } from '../middleware/errorHandler';

const router = Router();

/**
 * POST /wallets
 * Create a wallet for a user
 */
router.post(
  '/wallets',
  apiKeyAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const { external_user_id, currency, label, metadata } = req.body;

    if (!external_user_id || !currency) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'external_user_id and currency are required');
    }

    const wallet = await createWallet({
      tenantId: req.tenantId!,
      externalUserId: external_user_id,
      currency,
      label,
      metadata,
      isSandbox: req.isSandbox || false,
    });

    res.status(201).json({
      wallet_id: wallet.id,
      external_user_id: wallet.externalUserId,
      label: wallet.label,
      balance: wallet.balance.toFixed(4),
      currency: wallet.currency,
      status: wallet.status,
      is_sandbox: wallet.isSandbox,
      metadata: wallet.metadata,
    });
  }
);

/**
 * GET /wallets/:walletId
 * Fetch wallet by ID
 */
router.get(
  '/wallets/:walletId',
  apiKeyAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const { walletId } = req.params;

    const wallet = await getWalletById(walletId, req.tenantId!, req.isSandbox || false);

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
  }
);

/**
 * GET /wallets/user/:externalUserId
 * Fetch wallet by external user ID
 */
router.get(
  '/wallets/user/:externalUserId',
  apiKeyAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const { externalUserId } = req.params;

    const wallet = await getWalletByExternalUserId(
      externalUserId,
      req.tenantId!,
      req.isSandbox || false
    );

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
  }
);

/**
 * PATCH /wallets/:walletId
 * Update wallet label or metadata
 */
router.patch(
  '/wallets/:walletId',
  apiKeyAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
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
  }
);

/**
 * POST /wallets/:walletId/freeze
 * Freeze a wallet
 */
router.post(
  '/wallets/:walletId/freeze',
  apiKeyAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
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
  }
);

/**
 * POST /wallets/:walletId/unfreeze
 * Unfreeze a wallet
 */
router.post(
  '/wallets/:walletId/unfreeze',
  apiKeyAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
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
  }
);

/**
 * POST /wallets/:walletId/close
 * Close a wallet (only when balance is zero)
 */
router.post(
  '/wallets/:walletId/close',
  apiKeyAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
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
  }
);

export default router;
