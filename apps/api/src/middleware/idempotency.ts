import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { AppError, ErrorCode } from './errorHandler';

export interface AuthenticatedRequest extends Request {
  tenantId?: string;
  apiKeyScope?: string;
  isSandbox?: boolean;
}

/**
 * Compute request fingerprint for enhanced idempotency
 */
function computeRequestFingerprint(req: AuthenticatedRequest): string {
  const fingerprintData = {
    method: req.method,
    url: req.url,
    body: req.body,
    headers: {
      'content-type': req.headers['content-type'],
      'x-api-key': req.headers['x-api-key'],
    },
  };
  
  return createHash('sha256').update(JSON.stringify(fingerprintData)).digest('hex');
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
    // Compute request fingerprint
    const requestFingerprint = computeRequestFingerprint(req);

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
      // Check if request fingerprint matches
      const storedFingerprint = (existingTransaction.metadata as any)?.requestFingerprint;
      if (storedFingerprint && storedFingerprint !== requestFingerprint) {
        throw new AppError(409, ErrorCode.IDEMPOTENCY_CONFLICT, 'Idempotency key used with different request parameters');
      }

      // Return cached response with custom header
      const cachedResponse = (existingTransaction.metadata as any)?.response;
      if (cachedResponse) {
        res.setHeader('X-Idempotency-Cache', 'Hit');
        return res.status(cachedResponse.status || 201).json(cachedResponse.body);
      }

      // Fallback to transaction-based response
      res.setHeader('X-Idempotency-Cache', 'Hit');
      res.status(201).json({
        transaction_id: existingTransaction.id,
        wallet_id: existingTransaction.walletId,
        type: existingTransaction.type,
        amount: existingTransaction.amount.toFixed(4),
        balance_before: existingTransaction.balanceBefore.toFixed(4),
        balance_after: existingTransaction.balanceAfter.toFixed(4),
        description: (existingTransaction.metadata as any)?.description || '',
        reference_id: existingTransaction.referenceId,
        idempotency_key: existingTransaction.idempotencyKey,
        metadata: existingTransaction.metadata,
        created_at: existingTransaction.createdAt,
      });
      return;
    }

    // Store idempotency key and fingerprint on request for later use
    (req as any).idempotencyKey = idempotencyKey;
    (req as any).requestFingerprint = requestFingerprint;

    // Override res.json to capture response for caching
    const originalJson = res.json;
    res.json = function(body: any) {
      // Store response in metadata for future idempotency checks
      (req as any).cachedResponse = {
        status: res.statusCode,
        body: body
      };
      return originalJson.call(this, body);
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error(`[${req.id}] Error checking idempotency:`, error);
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'Error checking idempotency');
  }
}
