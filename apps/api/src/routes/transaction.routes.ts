import { Router, Request, Response } from 'express';
import {
  creditWallet,
  debitWallet,
  transferBetweenWallets,
  reverseTransaction,
  getTransactionById,
  listTransactions,
} from '../services/transaction.service';
import { apiKeyAuthMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

/**
 * POST /transactions/credit
 * Credit a wallet
 */
router.post(
  '/transactions/credit',
  apiKeyAuthMiddleware,
  idempotencyMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wallet_id, amount, description, reference_id, metadata } = req.body;
    const idempotencyKey = (req as any).idempotencyKey;

    if (wallet_id == null || amount == null || description == null) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'wallet_id, amount, and description are required');
    }

    if (amount <= 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'amount must be positive');
    }

    const transaction = await creditWallet({
      tenantId: req.tenantId!,
      walletId: wallet_id,
      amount,
      description,
      referenceId: reference_id,
      idempotencyKey,
      metadata,
      isSandbox: req.isSandbox || false,
      createdBy: `api_key:${req.tenantId}`,
    });

    res.status(201).json({
      transaction_id: transaction.id,
      wallet_id: transaction.walletId,
      type: transaction.type,
      amount: transaction.amount.toFixed(4),
      balance_before: transaction.balanceBefore.toFixed(4),
      balance_after: transaction.balanceAfter.toFixed(4),
      description: (transaction.metadata as any)?.description || description,
      reference_id: transaction.referenceId,
      idempotency_key: transaction.idempotencyKey,
      created_by: (transaction.metadata as any)?.createdBy || `api_key:${req.tenantId}`,
      is_sandbox: req.isSandbox || false,
      metadata: transaction.metadata,
      created_at: transaction.createdAt,
    });
  })
);

/**
 * POST /transactions/debit
 * Debit a wallet
 */
router.post(
  '/transactions/debit',
  apiKeyAuthMiddleware,
  idempotencyMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wallet_id, amount, description, reference_id, metadata } = req.body;
    const idempotencyKey = (req as any).idempotencyKey;

    if (wallet_id == null || amount == null || description == null) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'wallet_id, amount, and description are required');
    }

    if (amount <= 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'amount must be positive');
    }

    const transaction = await debitWallet({
      tenantId: req.tenantId!,
      walletId: wallet_id,
      amount,
      description,
      referenceId: reference_id,
      idempotencyKey,
      metadata,
      isSandbox: req.isSandbox || false,
      createdBy: `api_key:${req.tenantId}`,
    });

    res.status(201).json({
      transaction_id: transaction.id,
      wallet_id: transaction.walletId,
      type: transaction.type,
      amount: transaction.amount.toFixed(4),
      balance_before: transaction.balanceBefore.toFixed(4),
      balance_after: transaction.balanceAfter.toFixed(4),
      description: (transaction.metadata as any)?.description || description,
      reference_id: transaction.referenceId,
      idempotency_key: transaction.idempotencyKey,
      created_by: (transaction.metadata as any)?.createdBy || `api_key:${req.tenantId}`,
      is_sandbox: req.isSandbox || false,
      metadata: transaction.metadata,
      created_at: transaction.createdAt,
    });
  })
);

/**
 * POST /transactions/transfer
 * Transfer between two wallets
 */
router.post(
  '/transactions/transfer',
  apiKeyAuthMiddleware,
  idempotencyMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { from_wallet_id, to_wallet_id, amount, description, reference_id, metadata } = req.body;
    const idempotencyKey = (req as any).idempotencyKey;

    if (from_wallet_id == null || to_wallet_id == null || amount == null || description == null) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'from_wallet_id, to_wallet_id, amount, and description are required'
      );
    }

    if (amount <= 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'amount must be positive');
    }

    if (from_wallet_id === to_wallet_id) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'from_wallet_id and to_wallet_id must be different');
    }

    const result = await transferBetweenWallets({
      tenantId: req.tenantId!,
      fromWalletId: from_wallet_id,
      toWalletId: to_wallet_id,
      amount,
      description,
      referenceId: reference_id,
      idempotencyKey,
      metadata,
      isSandbox: req.isSandbox || false,
      createdBy: `api_key:${req.tenantId}`,
    });

    res.status(201).json({
      debit_transaction: {
        transaction_id: result.debitTransaction.id,
        wallet_id: result.debitTransaction.walletId,
        type: result.debitTransaction.type,
        amount: result.debitTransaction.amount.toFixed(4),
        balance_before: result.debitTransaction.balanceBefore.toFixed(4),
        balance_after: result.debitTransaction.balanceAfter.toFixed(4),
        description: (result.debitTransaction.metadata as any)?.description || description,
        reference_id: result.debitTransaction.referenceId,
        idempotency_key: result.debitTransaction.idempotencyKey,
        created_by: (result.debitTransaction.metadata as any)?.createdBy || `api_key:${req.tenantId}`,
        is_sandbox: req.isSandbox || false,
        metadata: result.debitTransaction.metadata,
        created_at: result.debitTransaction.createdAt,
      },
      credit_transaction: {
        transaction_id: result.creditTransaction.id,
        wallet_id: result.creditTransaction.walletId,
        type: result.creditTransaction.type,
        amount: result.creditTransaction.amount.toFixed(4),
        balance_before: result.creditTransaction.balanceBefore.toFixed(4),
        balance_after: result.creditTransaction.balanceAfter.toFixed(4),
        description: (result.creditTransaction.metadata as any)?.description || description,
        reference_id: result.creditTransaction.referenceId,
        idempotency_key: result.creditTransaction.idempotencyKey,
        created_by: (result.creditTransaction.metadata as any)?.createdBy || `api_key:${req.tenantId}`,
        is_sandbox: req.isSandbox || false,
        metadata: result.creditTransaction.metadata,
        created_at: result.creditTransaction.createdAt,
      },
    });
  })
);

/**
 * POST /transactions/:txId/reverse
 * Reverse a transaction
 */
router.post(
  '/transactions/:txId/reverse',
  apiKeyAuthMiddleware,
  idempotencyMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { txId } = req.params;
    const { reason } = req.body;
    const idempotencyKey = (req as any).idempotencyKey;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'reason is required');
    }

    const transaction = await reverseTransaction({
      tenantId: req.tenantId!,
      transactionId: txId,
      reason,
      idempotencyKey,
      isSandbox: req.isSandbox || false,
      createdBy: `api_key:${req.tenantId}`,
    });

    const originalDescription = (transaction.metadata as any)?.originalDescription;
    const description = originalDescription ? `Reversal of: ${originalDescription}` : '';

    res.status(201).json({
      transaction_id: transaction.id,
      wallet_id: transaction.walletId,
      type: transaction.type,
      original_tx_id: (transaction.metadata as any)?.originalTxId,
      amount: transaction.amount.toFixed(4),
      balance_before: transaction.balanceBefore.toFixed(4),
      balance_after: transaction.balanceAfter.toFixed(4),
      description,
      reference_id: transaction.referenceId,
      idempotency_key: transaction.idempotencyKey,
      created_by: `api_key:${req.tenantId}`,
      is_sandbox: req.isSandbox || false,
      metadata: transaction.metadata,
      created_at: transaction.createdAt,
    });
  })
);

/**
 * GET /transactions/:txId
 * Fetch a single transaction
 */
router.get(
  '/transactions/:txId',
  apiKeyAuthMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { txId } = req.params;

    const transaction = await getTransactionById(txId, req.tenantId!);

    res.json({
      transaction_id: transaction.id,
      wallet_id: transaction.walletId,
      type: transaction.type,
      amount: transaction.amount.toFixed(4),
      balance_before: transaction.balanceBefore.toFixed(4),
      balance_after: transaction.balanceAfter.toFixed(4),
      description: (transaction.metadata as any)?.description,
      reference_id: transaction.referenceId,
      idempotency_key: transaction.idempotencyKey,
      metadata: transaction.metadata,
      created_at: transaction.createdAt,
    });
  })
);

/**
 * GET /transactions
 * List transactions for a wallet with pagination
 */
router.get(
  '/transactions',
  apiKeyAuthMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      wallet_id,
      type,
      from,
      to,
      min_amount,
      max_amount,
      reference_id,
      limit,
      after,
    } = req.query;

    // Parse and validate query parameters
    const parsedLimit = limit ? parseInt(limit as string, 10) : undefined;
    const parsedMinAmount = min_amount ? parseFloat(min_amount as string) : undefined;
    const parsedMaxAmount = max_amount ? parseFloat(max_amount as string) : undefined;
    const parsedFrom = from ? new Date(from as string) : undefined;
    const parsedTo = to ? new Date(to as string) : undefined;

    // Validate parsed numbers
    if (parsedLimit !== undefined && (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'limit must be a number between 1 and 1000');
    }
    if (parsedMinAmount !== undefined && !Number.isFinite(parsedMinAmount)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'min_amount must be a valid number');
    }
    if (parsedMaxAmount !== undefined && !Number.isFinite(parsedMaxAmount)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'max_amount must be a valid number');
    }
    if (parsedMinAmount !== undefined && parsedMaxAmount !== undefined && parsedMinAmount > parsedMaxAmount) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'min_amount cannot be greater than max_amount');
    }
    if (parsedFrom !== undefined && isNaN(parsedFrom.getTime())) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'from must be a valid date');
    }
    if (parsedTo !== undefined && isNaN(parsedTo.getTime())) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'to must be a valid date');
    }

    const result = await listTransactions({
      tenantId: req.tenantId!,
      walletId: wallet_id as string,
      type: type as string,
      from: parsedFrom,
      to: parsedTo,
      minAmount: parsedMinAmount,
      maxAmount: parsedMaxAmount,
      referenceId: reference_id as string,
      limit: parsedLimit,
      after: after as string,
    });

    res.json({
      data: result.data.map((tx) => ({
        transaction_id: tx.id,
        wallet_id: tx.walletId,
        type: tx.type,
        amount: tx.amount.toFixed(4),
        balance_before: tx.balanceBefore.toFixed(4),
        balance_after: tx.balanceAfter.toFixed(4),
        description: (tx.metadata as any)?.description,
        reference_id: tx.referenceId,
        idempotency_key: tx.idempotencyKey,
        metadata: tx.metadata,
        created_at: tx.createdAt,
      })),
      next_cursor: result.nextCursor,
      total: result.total,
    });
  })
);

export default router;
