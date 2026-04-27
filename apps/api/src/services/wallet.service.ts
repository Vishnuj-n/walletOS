import { prisma } from '../lib/prisma';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { Prisma } from '@prisma/client';

/**
 * Wallet Service
 * 
 * Handles wallet operations with SELECT FOR UPDATE locking for concurrency safety.
 * All balance changes must go through transactional methods with row locking.
 */

export interface CreateWalletParams {
  tenantId: string;
  externalUserId: string;
  currency: string;
  label?: string;
  metadata?: Record<string, any>;
  isSandbox: boolean;
}

export interface UpdateWalletParams {
  label?: string;
  metadata?: Record<string, any>;
}

/**
 * Create a new wallet
 * 
 * Enforces unique constraint on (tenantId, externalUserId, isSandbox)
 */
export async function createWallet(params: CreateWalletParams) {
  return await prisma.$transaction(async (tx) => {
    // Check if wallet already exists
    const existingWallet = await tx.wallet.findFirst({
      where: {
        tenantId: params.tenantId,
        externalUserId: params.externalUserId,
        isSandbox: params.isSandbox,
      },
    });

    if (existingWallet) {
      throw new AppError(409, ErrorCode.WALLET_ALREADY_EXISTS, 'Wallet already exists for this user in this tenant and environment');
    }

    // Create wallet
    const wallet = await tx.wallet.create({
      data: {
        tenantId: params.tenantId,
        externalUserId: params.externalUserId,
        currency: params.currency,
        label: params.label,
        metadata: params.metadata,
        isSandbox: params.isSandbox,
        balance: 0,
      },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        entityType: 'Wallet',
        entityId: wallet.id,
        action: 'wallet.created',
        changes: {
          externalUserId: params.externalUserId,
          currency: params.currency,
          isSandbox: params.isSandbox,
        },
      },
    });

    return wallet;
  }, { timeout: 20000 });
}

/**
 * Get wallet by ID
 */
export async function getWalletById(walletId: string, tenantId: string, isSandbox: boolean) {
  const wallet = await prisma.wallet.findFirst({
    where: {
      id: walletId,
      tenantId,
      isSandbox,
    },
  });

  if (!wallet) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
  }

  return wallet;
}

/**
 * Get wallet by external user ID
 */
export async function getWalletByExternalUserId(
  externalUserId: string,
  tenantId: string,
  isSandbox: boolean
) {
  const wallet = await prisma.wallet.findFirst({
    where: {
      externalUserId,
      tenantId,
      isSandbox,
    },
  });

  if (!wallet) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
  }

  return wallet;
}

/**
 * Update wallet (label and metadata only)
 */
export async function updateWallet(
  walletId: string,
  tenantId: string,
  isSandbox: boolean,
  params: UpdateWalletParams
) {
  return await prisma.$transaction(async (tx) => {
    // Lock the wallet row
    await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${walletId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

    const wallet = await tx.wallet.findFirst({
      where: {
        id: walletId,
        tenantId,
        isSandbox,
      },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: walletId },
      data: {
        label: params.label,
        metadata: params.metadata,
      },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        tenantId,
        entityType: 'Wallet',
        entityId: walletId,
        action: 'wallet.updated',
        changes: {
          before: { label: wallet.label, metadata: wallet.metadata },
          after: { label: params.label, metadata: params.metadata },
        },
      },
    });

    return updatedWallet;
  }, { timeout: 20000 });
}

/**
 * Freeze a wallet
 */
export async function freezeWallet(
  walletId: string,
  tenantId: string,
  isSandbox: boolean,
  reason: string
) {
  return await prisma.$transaction(async (tx) => {
    // Lock the wallet row
    await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${walletId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

    const wallet = await tx.wallet.findFirst({
      where: {
        id: walletId,
        tenantId,
        isSandbox,
      },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    if (wallet.status === 'frozen') {
      throw new AppError(409, ErrorCode.WALLET_ALREADY_FROZEN, 'Wallet is already frozen');
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: walletId },
      data: { status: 'frozen' },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        tenantId,
        entityType: 'Wallet',
        entityId: walletId,
        action: 'wallet.frozen',
        changes: {
          reason,
          before: { status: wallet.status },
          after: { status: 'frozen' },
        },
      },
    });

    return updatedWallet;
  }, { timeout: 20000 });
}

/**
 * Unfreeze a wallet
 */
export async function unfreezeWallet(
  walletId: string,
  tenantId: string,
  isSandbox: boolean,
  reason: string
) {
  return await prisma.$transaction(async (tx) => {
    // Lock the wallet row
    await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${walletId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

    const wallet = await tx.wallet.findFirst({
      where: {
        id: walletId,
        tenantId,
        isSandbox,
      },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: walletId },
      data: { status: 'active' },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        tenantId,
        entityType: 'Wallet',
        entityId: walletId,
        action: 'wallet.unfrozen',
        changes: {
          reason,
          before: { status: wallet.status },
          after: { status: 'active' },
        },
      },
    });

    return updatedWallet;
  }, { timeout: 20000 });
}

/**
 * Close a wallet
 * Only allowed when balance is zero
 */
export async function closeWallet(
  walletId: string,
  tenantId: string,
  isSandbox: boolean,
  reason: string
) {
  return await prisma.$transaction(async (tx) => {
    // Lock the wallet row
    await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${walletId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

    const wallet = await tx.wallet.findFirst({
      where: {
        id: walletId,
        tenantId,
        isSandbox,
      },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    if (wallet.status === 'closed') {
      throw new AppError(409, ErrorCode.WALLET_ALREADY_CLOSED, 'Wallet is already closed');
    }

    // Check balance is zero
    if (wallet.balance.toNumber() !== 0) {
      throw new AppError(422, ErrorCode.WALLET_BALANCE_NOT_ZERO, 'Cannot close wallet with non-zero balance');
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: walletId },
      data: { status: 'closed' },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        tenantId,
        entityType: 'Wallet',
        entityId: walletId,
        action: 'wallet.closed',
        changes: {
          reason,
          before: { status: wallet.status },
          after: { status: 'closed' },
        },
      },
    });

    return updatedWallet;
  }, { timeout: 20000 });
}

/**
 * Lock wallet row for transaction operations
 * Uses SELECT FOR UPDATE to prevent concurrent modifications
 */
export async function lockWallet(
  tx: any,
  walletId: string,
  tenantId: string,
  isSandbox: boolean
): Promise<any> {
  // Lock the wallet row
  await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${walletId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

  const wallet = await tx.wallet.findFirst({
    where: {
      id: walletId,
      tenantId,
      isSandbox,
    },
  });

  if (!wallet) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
  }

  return wallet;
}

/**
 * Check if wallet can accept transactions
 */
export function validateWalletForTransaction(wallet: { status: string }): void {
  if (wallet.status === 'frozen') {
    throw new AppError(409, ErrorCode.WALLET_FROZEN, 'Wallet is frozen, no credits or debits accepted');
  }

  if (wallet.status === 'closed') {
    throw new AppError(409, ErrorCode.WALLET_CLOSED, 'Wallet is permanently closed');
  }
}
