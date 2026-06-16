import { prisma } from '../lib/prisma';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { lockWallet, validateWalletForTransaction } from './wallet.service';
import { generateTransactionPublicId } from '../lib/publicId';
import { publishWebhookEvent } from './webhook.service';
import { Decimal } from '@prisma/client/runtime/library';


/**
 * Transaction Service
 * 
 * Handles credit, debit, transfer, and reversal operations with SELECT FOR UPDATE locking.
 * All operations use pessimistic locking to prevent lost updates under high concurrency.
 */

export interface CreditParams {
  tenantId: string;
  walletId: string;
  amount: number | Decimal;
  description: string;
  referenceId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  isSandbox: boolean;
  createdBy?: string;
}

export interface DebitParams {
  tenantId: string;
  walletId: string;
  amount: number | Decimal;
  description: string;
  referenceId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  isSandbox: boolean;
  createdBy?: string;
}

export interface TransferParams {
  tenantId: string;
  fromWalletId: string;
  toWalletId: string;
  amount: number | Decimal;
  description: string;
  referenceId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  isSandbox: boolean;
  createdBy?: string;
}

export interface ReverseParams {
  tenantId: string;
  transactionId: string;
  reason: string;
  idempotencyKey?: string;
  isSandbox: boolean;
  createdBy?: string;
}

/**
 * Credit a wallet
 * Uses SELECT FOR UPDATE to lock the wallet row before balance change
 */
export async function creditWallet(params: CreditParams) {
  const transaction = await prisma.$transaction(async (tx) => {
    // Lock the wallet row
    const wallet = await lockWallet(tx, params.walletId, params.tenantId, params.isSandbox);

    // Validate wallet status
    validateWalletForTransaction(wallet);

    // Calculate new balance
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore.add(params.amount);

    // Create transaction
    const txRecord = await tx.transaction.create({
      data: {
        publicId: generateTransactionPublicId(),
        tenantId: params.tenantId,
        walletId: params.walletId,
        type: 'credit',
        amount: params.amount,
        currency: wallet.currency,
        balanceBefore,
        balanceAfter,
        referenceId: params.referenceId,
        idempotencyKey: params.idempotencyKey,
        metadata: {
          ...params.metadata,
          description: params.description,
          createdBy: params.createdBy,
        },
      },
    });

    // Update wallet balance
    await tx.wallet.update({
      where: { id: params.walletId },
      data: { balance: balanceAfter },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        entityType: 'Transaction',
        entityId: txRecord.id,
        action: 'transaction.credited',
        changes: {
          walletId: params.walletId,
          amount: params.amount,
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
          referenceId: params.referenceId,
        },
        actorId: params.createdBy,
        actorType: 'api_key',
      },
    });

    return txRecord;
  }, { timeout: 20000, maxWait: 20000 });

  // Publish webhook event asynchronously after commit
  publishWebhookEvent(
    params.tenantId,
    'wallet.credited',
    {
      wallet_id: params.walletId,
      transaction_id: transaction.id,
      amount: transaction.amount.toString(),
      balance_before: transaction.balanceBefore.toString(),
      balance_after: transaction.balanceAfter.toString(),
      type: transaction.type,
      reference_id: transaction.referenceId,
      idempotency_key: transaction.idempotencyKey,
      metadata: transaction.metadata as Record<string, unknown>,
      created_at: transaction.createdAt.toISOString(),
    }
  ).catch((err) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Failed to publish wallet.credited webhook:', err);
    }
  });

  return transaction;
}

/**
 * Debit a wallet
 * Uses SELECT FOR UPDATE to lock the wallet row before balance check and change
 */
export async function debitWallet(params: DebitParams) {
  const transaction = await prisma.$transaction(async (tx) => {
    // Lock the wallet row
    const wallet = await lockWallet(tx, params.walletId, params.tenantId, params.isSandbox);

    // Validate wallet status
    validateWalletForTransaction(wallet);

    // Check sufficient balance
    const balanceBefore = wallet.balance;
    if (balanceBefore.lt(params.amount)) {
      throw new AppError(422, ErrorCode.INSUFFICIENT_BALANCE, 'Wallet balance is too low for this debit');
    }

    // Calculate new balance
    const balanceAfter = balanceBefore.sub(params.amount);

    // Create transaction
    const txRecord = await tx.transaction.create({
      data: {
        publicId: generateTransactionPublicId(),
        tenantId: params.tenantId,
        walletId: params.walletId,
        type: 'debit',
        amount: params.amount,
        currency: wallet.currency,
        balanceBefore,
        balanceAfter,
        referenceId: params.referenceId,
        idempotencyKey: params.idempotencyKey,
        metadata: {
          ...params.metadata,
          description: params.description,
          createdBy: params.createdBy,
        },
      },
    });

    // Update wallet balance
    await tx.wallet.update({
      where: { id: params.walletId },
      data: { balance: balanceAfter },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        entityType: 'Transaction',
        entityId: txRecord.id,
        action: 'transaction.debited',
        changes: {
          walletId: params.walletId,
          amount: params.amount,
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
          referenceId: params.referenceId,
        },
        actorId: params.createdBy,
        actorType: 'api_key',
      },
    });

    return txRecord;
  }, { timeout: 20000, maxWait: 20000 });

  // Publish webhook event asynchronously after commit
  publishWebhookEvent(
    params.tenantId,
    'wallet.debited',
    {
      wallet_id: params.walletId,
      transaction_id: transaction.id,
      amount: transaction.amount.toString(),
      balance_before: transaction.balanceBefore.toString(),
      balance_after: transaction.balanceAfter.toString(),
      type: transaction.type,
      reference_id: transaction.referenceId,
      idempotency_key: transaction.idempotencyKey,
      metadata: transaction.metadata as Record<string, unknown>,
      created_at: transaction.createdAt.toISOString(),
    }
  ).catch((err) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Failed to publish wallet.debited webhook:', err);
    }
  });

  return transaction;
}

/**
 * Transfer between wallets
 * Sorts wallet IDs lexicographically before locking to prevent deadlocks
 */
export async function transferBetweenWallets(params: TransferParams) {
  // Prevent self-transfers
  if (params.fromWalletId === params.toWalletId) {
    throw new AppError(422, ErrorCode.INVALID_OPERATION, 'Cannot transfer to the same wallet');
  }

  const result = await prisma.$transaction(async (tx) => {
    // Sort wallet IDs lexicographically to prevent deadlocks
    const sortedWalletIds = [params.fromWalletId, params.toWalletId].sort();
    const [firstWalletId, secondWalletId] = sortedWalletIds;

    // Lock both wallets in sorted order using lockWallet helper
    const wallet1 = await lockWallet(tx, firstWalletId, params.tenantId, params.isSandbox);
    const wallet2 = await lockWallet(tx, secondWalletId, params.tenantId, params.isSandbox);

    // Identify which is from and which is to wallet
    const fromWallet = wallet1.id === params.fromWalletId ? wallet1 : wallet2;
    const toWallet = wallet1.id === params.toWalletId ? wallet1 : wallet2;

    // Check currency match
    if (fromWallet.currency !== toWallet.currency) {
      throw new AppError(422, ErrorCode.CURRENCY_MISMATCH, 'Cannot transfer between wallets with different currencies');
    }

    // Validate wallet status
    validateWalletForTransaction(fromWallet);
    validateWalletForTransaction(toWallet);

    // Check sufficient balance in source wallet
    if (fromWallet.balance.lt(params.amount)) {
      throw new AppError(422, ErrorCode.INSUFFICIENT_BALANCE, 'Source wallet balance is too low for this transfer');
    }

    // Calculate new balances
    const fromBalanceBefore = fromWallet.balance;
    const fromBalanceAfter = fromBalanceBefore.sub(params.amount);
    const toBalanceBefore = toWallet.balance;
    const toBalanceAfter = toBalanceBefore.add(params.amount);

    // Create debit transaction
    const debitTransaction = await tx.transaction.create({
      data: {
        publicId: generateTransactionPublicId(),
        tenantId: params.tenantId,
        walletId: params.fromWalletId,
        type: 'debit',
        amount: params.amount,
        currency: fromWallet.currency,
        balanceBefore: fromBalanceBefore,
        balanceAfter: fromBalanceAfter,
        referenceId: params.referenceId,
        idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}_debit` : undefined,
        metadata: {
          ...params.metadata,
          description: params.description,
          transferType: 'source',
          createdBy: params.createdBy,
          rawIdempotencyKey: params.idempotencyKey, // Store raw key for idempotency middleware
        },
      },
    });

    // Create credit transaction
    const creditTransaction = await tx.transaction.create({
      data: {
        publicId: generateTransactionPublicId(),
        tenantId: params.tenantId,
        walletId: params.toWalletId,
        type: 'credit',
        amount: params.amount,
        currency: toWallet.currency,
        balanceBefore: toBalanceBefore,
        balanceAfter: toBalanceAfter,
        referenceId: params.referenceId,
        idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}_credit` : undefined,
        metadata: {
          ...params.metadata,
          description: params.description,
          transferType: 'destination',
          createdBy: params.createdBy,
          rawIdempotencyKey: params.idempotencyKey, // Store raw key for idempotency middleware
        },
      },
    });

    // Update wallet balances
    await tx.wallet.update({
      where: { id: params.fromWalletId },
      data: { balance: fromBalanceAfter },
    });

    await tx.wallet.update({
      where: { id: params.toWalletId },
      data: { balance: toBalanceAfter },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        entityType: 'Transaction',
        entityId: debitTransaction.id,
        action: 'transaction.transferred',
        changes: {
          fromWalletId: params.fromWalletId,
          toWalletId: params.toWalletId,
          amount: params.amount,
          referenceId: params.referenceId,
        },
        actorId: params.createdBy,
        actorType: 'api_key',
      },
    });

    return {
      debitTransaction,
      creditTransaction,
    };
  }, { timeout: 20000, maxWait: 20000 });

  // Publish source wallet debit event
  publishWebhookEvent(
    params.tenantId,
    'wallet.debited',
    {
      wallet_id: params.fromWalletId,
      transaction_id: result.debitTransaction.id,
      amount: result.debitTransaction.amount.toString(),
      balance_before: result.debitTransaction.balanceBefore.toString(),
      balance_after: result.debitTransaction.balanceAfter.toString(),
      type: result.debitTransaction.type,
      reference_id: result.debitTransaction.referenceId,
      idempotency_key: result.debitTransaction.idempotencyKey,
      metadata: result.debitTransaction.metadata as Record<string, unknown>,
      created_at: result.debitTransaction.createdAt.toISOString(),
    }
  ).catch((err) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Failed to publish transfer source webhook:', err);
    }
  });

  // Publish target wallet credit event
  publishWebhookEvent(
    params.tenantId,
    'wallet.credited',
    {
      wallet_id: params.toWalletId,
      transaction_id: result.creditTransaction.id,
      amount: result.creditTransaction.amount.toString(),
      balance_before: result.creditTransaction.balanceBefore.toString(),
      balance_after: result.creditTransaction.balanceAfter.toString(),
      type: result.creditTransaction.type,
      reference_id: result.creditTransaction.referenceId,
      idempotency_key: result.creditTransaction.idempotencyKey,
      metadata: result.creditTransaction.metadata as Record<string, unknown>,
      created_at: result.creditTransaction.createdAt.toISOString(),
    }
  ).catch((err) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Failed to publish transfer target webhook:', err);
    }
  });

  return result;
}

/**
 * Reverse a transaction
 * Creates opposite-type transaction with mandatory balance check
 */
export async function reverseTransaction(params: ReverseParams) {
  const reversalTransaction = await prisma.$transaction(async (tx) => {
    // Fetch the original transaction
    const originalTransaction = await tx.transaction.findFirst({
      where: {
        id: params.transactionId,
        tenantId: params.tenantId,
      },
      include: {
        wallet: true,
      },
    });

    if (!originalTransaction) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Original transaction not found');
    }

    // Cannot reverse a reversal
    if (originalTransaction.type === 'reversal') {
      throw new AppError(409, ErrorCode.CANNOT_REVERSE_REVERSAL, 'Cannot reverse a reversal transaction');
    }

    // Lock the wallet row with proper tenant and sandbox validation
    const lockedWallet = await lockWallet(tx, originalTransaction.walletId, params.tenantId, params.isSandbox);

    // Check for existing reversal (after lock to prevent race)
    const existingReversal = await tx.transaction.findFirst({
      where: {
        tenantId: params.tenantId,
        type: 'reversal',
        metadata: {
          path: ['originalTxId'],
          equals: originalTransaction.id
        }
      }
    });

    if (existingReversal) {
      if (existingReversal.idempotencyKey === params.idempotencyKey) {
        return existingReversal;
      }
      throw new AppError(409, ErrorCode.ALREADY_REVERSED, 'Transaction already reversed');
    }

    // Validate wallet status using fresh locked wallet
    validateWalletForTransaction(lockedWallet);

    // Determine reversal type and amount
    const reversalType = originalTransaction.type === 'credit' ? 'debit' : 'credit';
    const balanceBefore = lockedWallet.balance;

    // For debit reversals (adding money back), no balance check needed
    // For credit reversals (taking money away), check sufficient balance using locked wallet
    if (reversalType === 'debit') {
      if (balanceBefore.lt(originalTransaction.amount)) {
        throw new AppError(422, ErrorCode.INSUFFICIENT_BALANCE, 'Cannot reverse: wallet balance too low');
      }
    }

    // Calculate new balance
    const balanceAfter = reversalType === 'debit'
      ? balanceBefore.sub(originalTransaction.amount)
      : balanceBefore.add(originalTransaction.amount);

    // Create reversal transaction
    const reversalTx = await tx.transaction.create({
      data: {
        publicId: generateTransactionPublicId(),
        tenantId: params.tenantId,
        walletId: lockedWallet.id,
        type: 'reversal',
        amount: originalTransaction.amount,
        currency: lockedWallet.currency,
        balanceBefore,
        balanceAfter,
        referenceId: originalTransaction.referenceId,
        idempotencyKey: params.idempotencyKey,
        metadata: {
          originalTxId: originalTransaction.id,
          reason: params.reason,
          originalDescription: (originalTransaction.metadata as any)?.description,
        },
      },
    });

    // Update wallet balance
    await tx.wallet.update({
      where: { id: lockedWallet.id },
      data: { balance: balanceAfter },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        entityType: 'Transaction',
        entityId: reversalTx.id,
        action: 'transaction.reversed',
        changes: {
          originalTxId: originalTransaction.id,
          walletId: lockedWallet.id,
          amount: originalTransaction.amount.toString(),
          reason: params.reason,
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
        },
        actorId: params.createdBy,
        actorType: 'api_key',
      },
    });

    return reversalTx;
  }, { timeout: 20000, maxWait: 20000 });

  // Publish webhook event asynchronously after commit
  publishWebhookEvent(
    params.tenantId,
    'wallet.reversed',
    {
      wallet_id: reversalTransaction.walletId,
      transaction_id: reversalTransaction.id,
      amount: reversalTransaction.amount.toString(),
      balance_before: reversalTransaction.balanceBefore.toString(),
      balance_after: reversalTransaction.balanceAfter.toString(),
      type: reversalTransaction.type,
      reference_id: reversalTransaction.referenceId,
      idempotency_key: reversalTransaction.idempotencyKey,
      metadata: reversalTransaction.metadata as Record<string, unknown>,
      created_at: reversalTransaction.createdAt.toISOString(),
    }
  ).catch((err) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Failed to publish wallet.reversed webhook:', err);
    }
  });

  return reversalTransaction;
}


/**
 * Get transaction by ID
 */
export async function getTransactionById(transactionId: string, tenantId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      tenantId,
    },
    include: {
      wallet: true,
    },
  });

  if (!transaction) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Transaction not found');
  }

  return transaction;
}

/**
 * List transactions for a wallet with pagination
 */
export async function listTransactions(params: {
  tenantId: string;
  walletId?: string;
  type?: string;
  from?: Date;
  to?: Date;
  minAmount?: number;
  maxAmount?: number;
  referenceId?: string;
  limit?: number;
  after?: string;
}) {
  const finalLimit = Math.max(1, Math.min(params.limit ?? 20, 1000));
  const where: any = {
    tenantId: params.tenantId,
  };

  if (params.walletId) {
    where.walletId = params.walletId;
  }

  if (params.type) {
    where.type = params.type;
  }

  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = params.from;
    if (params.to) where.createdAt.lte = params.to;
  }

  // Use Decimal comparisons for amount filtering
  if (params.minAmount !== undefined || params.maxAmount !== undefined) {
    where.amount = {};
    if (params.minAmount !== undefined) where.amount.gte = params.minAmount;
    if (params.maxAmount !== undefined) where.amount.lte = params.maxAmount;
  }

  if (params.referenceId) {
    where.referenceId = params.referenceId;
  }

  // Handle cursor-based pagination
  const baseWhere = { ...where };
  if (params.after) {
    where.id = {
      lt: params.after // Use ID cursor directly
    };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: finalLimit + 1, // Fetch one extra to determine if there are more results
    include: {
      wallet: true,
    },
  });

  const hasMore = transactions.length > finalLimit;
  const data = hasMore ? transactions.slice(0, -1) : transactions;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  // Get total count efficiently (excluding the extra record we fetched)
  const total = await prisma.transaction.count({ where: baseWhere });

  return {
    data,
    nextCursor,
    total,
    hasMore,
  };
}
