import { prisma } from '../lib/prisma';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { lockWallet, validateWalletForTransaction } from './wallet.service';

/**
 * Transaction Service
 * 
 * Handles credit, debit, transfer, and reversal operations with SELECT FOR UPDATE locking.
 * All operations use pessimistic locking to prevent lost updates under high concurrency.
 */

export interface CreditParams {
  tenantId: string;
  walletId: string;
  amount: number;
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
  amount: number;
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
  amount: number;
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
  return await prisma.$transaction(async (tx) => {
    // Lock the wallet row
    const wallet = await lockWallet(tx, params.walletId, params.tenantId, params.isSandbox);

    // Validate wallet status
    validateWalletForTransaction(wallet);

    // Calculate new balance
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore.add(params.amount);

    // Create transaction
    const transaction = await tx.transaction.create({
      data: {
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
        entityId: transaction.id,
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

    return transaction;
  });
}

/**
 * Debit a wallet
 * Uses SELECT FOR UPDATE to lock the wallet row before balance check and change
 */
export async function debitWallet(params: DebitParams) {
  return await prisma.$transaction(async (tx) => {
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
    const transaction = await tx.transaction.create({
      data: {
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
        entityId: transaction.id,
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

    return transaction;
  });
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

  return await prisma.$transaction(async (tx) => {
    // Sort wallet IDs lexicographically to prevent deadlocks
    const sortedWalletIds = [params.fromWalletId, params.toWalletId].sort();
    const [firstWalletId, secondWalletId] = sortedWalletIds;

    // Lock both wallets in sorted order
    await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${firstWalletId} AND "tenantId" = ${params.tenantId} AND "isSandbox" = ${params.isSandbox} FOR UPDATE`;
    await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${secondWalletId} AND "tenantId" = ${params.tenantId} AND "isSandbox" = ${params.isSandbox} FOR UPDATE`;

    // Fetch both wallets
    const fromWallet = await tx.wallet.findFirst({
      where: {
        id: params.fromWalletId,
        tenantId: params.tenantId,
        isSandbox: params.isSandbox,
      },
    });

    const toWallet = await tx.wallet.findFirst({
      where: {
        id: params.toWalletId,
        tenantId: params.tenantId,
        isSandbox: params.isSandbox,
      },
    });

    if (!fromWallet || !toWallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'One or both wallets not found');
    }

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
        },
      },
    });

    // Create credit transaction
    const creditTransaction = await tx.transaction.create({
      data: {
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
  });
}

/**
 * Reverse a transaction
 * Creates opposite-type transaction with mandatory balance check
 */
export async function reverseTransaction(params: ReverseParams) {
  return await prisma.$transaction(async (tx) => {
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

    // Check for existing reversal
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

    const wallet = originalTransaction.wallet;

    // Lock the wallet row
    await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;

    // Validate wallet status
    validateWalletForTransaction(wallet);

    // Determine reversal type and amount
    const reversalType = originalTransaction.type === 'credit' ? 'debit' : 'credit';
    const balanceBefore = wallet.balance;

    // For debit reversals (adding money back), no balance check needed
    // For credit reversals (taking money away), check sufficient balance
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
    const reversalTransaction = await tx.transaction.create({
      data: {
        tenantId: params.tenantId,
        walletId: wallet.id,
        type: 'reversal',
        amount: originalTransaction.amount,
        currency: wallet.currency,
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
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        entityType: 'Transaction',
        entityId: reversalTransaction.id,
        action: 'transaction.reversed',
        changes: {
          originalTxId: originalTransaction.id,
          walletId: wallet.id,
          amount: originalTransaction.amount.toString(),
          reason: params.reason,
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
        },
        actorId: params.createdBy,
        actorType: 'api_key',
      },
    });

    return reversalTransaction;
  });
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
  const limit = Math.min(params.limit || 20, 1000);
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
  if (params.after) {
    where.createdAt = { 
      ...where.createdAt,
      lt: new Date(params.after) // Convert cursor timestamp to Date for comparison
    };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // Fetch one extra to determine if there are more results
    include: {
      wallet: true,
    },
  });

  const hasMore = transactions.length > limit;
  const data = hasMore ? transactions.slice(0, -1) : transactions;
  const nextCursor = hasMore ? data[data.length - 1].createdAt.toISOString() : null;

  // Get total count efficiently (excluding the extra record we fetched)
  const total = await prisma.transaction.count({ where });

  return {
    data,
    nextCursor,
    total,
    hasMore,
  };
}
