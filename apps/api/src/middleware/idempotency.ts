import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError, ErrorCode } from './errorHandler';

export interface AuthenticatedRequest extends Request {
  tenantId?: string;
  apiKeyScope?: string;
  isSandbox?: boolean;
}

/**
 * Idempotency Middleware
 * 
 * Checks for existing (tenantId, idempotencyKey) combination before execution.
 * Returns cached response if found within 30-day retention period.
 * 
 * This early check reduces database lock contention by rejecting duplicates
 * before entering heavy transaction logic.
 */
export async function idempotencyMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  const tenantId = req.tenantId;

  // Skip idempotency check for GET requests and if no tenant/auth
  if (req.method === 'GET' || !tenantId) {
    next();
    return;
  }

  // Idempotency key is required for write operations
  if (!idempotencyKey) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Idempotency-Key header is required for write operations');
  }

  // Validate idempotency key format (max 255 characters)
  if (idempotencyKey.length > 255) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Idempotency-Key must be at most 255 characters');
  }

  try {
    // Check for existing transaction with this idempotency key
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        tenantId,
        idempotencyKey,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        },
      },
      include: {
        wallet: true,
      },
    });

    // Ensure sandbox isolation
    if (existingTransaction && existingTransaction.wallet.isSandbox !== req.isSandbox) {
      throw new AppError(403, ErrorCode.TENANT_ISOLATION, 'Idempotency key belongs to different environment');
    }

    if (existingTransaction) {
      // Return cached response with custom header
      res.setHeader('X-Idempotency-Cache', 'Hit');
      res.status(201).json({
        transaction_id: existingTransaction.id,
        wallet_id: existingTransaction.walletId,
        type: existingTransaction.type,
        amount: existingTransaction.amount.toFixed(4),
        balance_before: existingTransaction.balanceBefore.toFixed(4),
        balance_after: existingTransaction.balanceAfter.toFixed(4),
        description: existingTransaction.metadata?.description || '',
        reference_id: existingTransaction.referenceId,
        idempotency_key: existingTransaction.idempotencyKey,
        metadata: existingTransaction.metadata,
        created_at: existingTransaction.createdAt,
      });
      return;
    }

    // Store idempotency key on request for later use
    (req as any).idempotencyKey = idempotencyKey;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error(`[${req.id}] Error checking idempotency:`, error);
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'Error checking idempotency');
  }
}
