import { prisma } from '../lib/prisma';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { Prisma } from '@prisma/client';
import { generateWalletPublicId } from '../lib/publicId';

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
async function resolveWalletId(
  identifier: string,
  tenantId: string,
  isSandbox: boolean,
  txClient?: Prisma.TransactionClient
): Promise<string> {
  const client = txClient || prisma;
  const wallet = await client.wallet.findFirst({
    where: {
      OR: [
        { id: identifier },
        { publicId: identifier },
      ],
      tenantId,
      isSandbox,
    },
    select: { id: true },
  });

  if (!wallet) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
  }

  return wallet.id;
}

export async function createWallet(params: CreateWalletParams) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Check if wallet already exists for this external user ID
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

      // Get tenant to construct tenant-prefixed public ID
      const tenant = await tx.tenant.findUnique({
        where: { id: params.tenantId },
        select: { name: true },
      });
      const tenantName = tenant?.name || 'tst';

      // Generate a unique public ID with collision check loop
      let publicId = '';
      let isUnique = false;
      let retries = 0;
      while (!isUnique && retries < 10) {
        publicId = generateWalletPublicId(tenantName);
        const existing = await tx.wallet.findUnique({
          where: { publicId },
          select: { id: true },
        });
        if (!existing) {
          isUnique = true;
        } else {
          retries++;
        }
      }

      if (!isUnique) {
        throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'Failed to generate a unique public wallet ID');
      }

      // Create wallet
      const wallet = await tx.wallet.create({
        data: {
          publicId,
          tenantId: params.tenantId,
          externalUserId: params.externalUserId,
          currency: params.currency,
          label: params.label,
          metadata: params.metadata,
          isSandbox: params.isSandbox,
          balance: 0,
        },
      });

      return wallet;
    }, { timeout: 5000, maxWait: 5000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, ErrorCode.WALLET_ALREADY_EXISTS, 'Wallet already exists for this user in this tenant and environment');
    }
    throw error;
  }
}

export async function getWalletById(walletId: string, tenantId: string, isSandbox: boolean) {
  const wallet = await prisma.wallet.findFirst({
    where: {
      OR: [
        { id: walletId },
        { publicId: walletId },
      ],
      tenantId,
      isSandbox,
    },
  });

  if (!wallet) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
  }

  return wallet;
}

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
    const resolvedId = await resolveWalletId(walletId, tenantId, isSandbox, tx);

    // Lock the wallet row
    await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${resolvedId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

    const wallet = await tx.wallet.findUnique({
      where: {
        id: resolvedId,
      },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: resolvedId },
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
        entityId: resolvedId,
        action: 'wallet.updated',
        changes: {
          before: { label: wallet.label, metadata: wallet.metadata },
          after: { label: params.label, metadata: params.metadata },
        },
        isSandbox,
      },
    });

    return updatedWallet;
  }, { timeout: 5000, maxWait: 5000 });
}

/**
 * Freeze a wallet
 */
export async function freezeWallet(
  walletId: string,
  tenantId: string,
  isSandbox: boolean,
  reason: string,
  idempotencyKey?: string,
  actorId?: string,
  actorType?: string,
  actorRole?: string
) {
  return await prisma.$transaction(async (tx) => {
    const resolvedId = await resolveWalletId(walletId, tenantId, isSandbox, tx);

    // Lock the wallet row
    await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${resolvedId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

    const wallet = await tx.wallet.findUnique({
      where: {
        id: resolvedId,
      },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    if (wallet.status === 'frozen') {
      throw new AppError(409, ErrorCode.WALLET_ALREADY_FROZEN, 'Wallet is already frozen');
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: resolvedId },
      data: { status: 'frozen' },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        tenantId,
        entityType: 'Wallet',
        entityId: resolvedId,
        action: 'wallet.frozen',
        changes: {
          reason,
          idempotency_key: idempotencyKey,
          before: { status: wallet.status },
          after: { status: 'frozen' },
        },
        actorId,
        actorType,
        actorRole,
        isSandbox,
      },
    });

    return updatedWallet;
  }, { timeout: 5000, maxWait: 5000 });
}

/**
 * Unfreeze a wallet
 */
export async function unfreezeWallet(
  walletId: string,
  tenantId: string,
  isSandbox: boolean,
  reason: string,
  idempotencyKey?: string,
  actorId?: string,
  actorType?: string,
  actorRole?: string
) {
  return await prisma.$transaction(async (tx) => {
    const resolvedId = await resolveWalletId(walletId, tenantId, isSandbox, tx);

    // Lock the wallet row
    await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${resolvedId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

    const wallet = await tx.wallet.findUnique({
      where: {
        id: resolvedId,
      },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    // Check wallet status before updating
    if (wallet.status === 'active') {
      return wallet; // Already active, no change needed
    }

    if (wallet.status === 'closed') {
      throw new AppError(409, ErrorCode.WALLET_CLOSED, 'Cannot unfreeze a closed wallet');
    }

    const updatedWallet = await tx.wallet.update({
      where: { id: resolvedId },
      data: { status: 'active' },
    });

    // Create audit log only when status actually changes
    await tx.auditLog.create({
      data: {
        tenantId,
        entityType: 'Wallet',
        entityId: resolvedId,
        action: 'wallet.unfrozen',
        changes: {
          reason,
          idempotency_key: idempotencyKey,
          before: { status: wallet.status },
          after: { status: 'active' },
        },
        actorId,
        actorType,
        actorRole,
        isSandbox,
      },
    });

    return updatedWallet;
  }, { timeout: 5000, maxWait: 5000 });
}

/**
 * Close a wallet
 * Only allowed when balance is zero
 */
export async function closeWallet(
  walletId: string,
  tenantId: string,
  isSandbox: boolean,
  reason: string,
  txClient?: Prisma.TransactionClient
) {
  const execute = async (tx: Prisma.TransactionClient) => {
    const resolvedId = await resolveWalletId(walletId, tenantId, isSandbox, tx);

    // Lock the wallet row
    await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${resolvedId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

    const wallet = await tx.wallet.findUnique({
      where: {
        id: resolvedId,
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
      where: { id: resolvedId },
      data: { status: 'closed' },
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        tenantId,
        entityType: 'Wallet',
        entityId: resolvedId,
        action: 'wallet.closed',
        changes: {
          reason,
          before: { status: wallet.status },
          after: { status: 'closed' },
        },
        isSandbox,
      },
    });

    return updatedWallet;
  };

  if (txClient) {
    return execute(txClient);
  }
  return await prisma.$transaction(execute, { timeout: 5000, maxWait: 5000 });
}

/**
 * Lock wallet row for transaction operations
 * Uses SELECT FOR UPDATE to prevent concurrent modifications
 */
export async function lockWallet(
  tx: Prisma.TransactionClient,
  walletId: string,
  tenantId: string,
  isSandbox: boolean
) {
  const resolvedId = await resolveWalletId(walletId, tenantId, isSandbox, tx);

  // Lock the wallet row
  await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${resolvedId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

  const wallet = await tx.wallet.findUnique({
    where: {
      id: resolvedId,
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
