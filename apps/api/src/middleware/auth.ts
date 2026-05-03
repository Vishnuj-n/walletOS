import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { AppError, ErrorCode } from './errorHandler';

export async function apiKeyAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return next(new AppError(401, ErrorCode.VALIDATION_ERROR, 'API key is required'));
  }

  // Hash the provided API key using SHA-256
  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  try {
    // Look up the API key in the database
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { tenant: true },
    });

    if (!apiKeyRecord || !apiKeyRecord.isActive) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid or inactive API key'));
    }

    // Attach tenant info to request
    req.tenantId = apiKeyRecord.tenantId;
    req.apiKeyId = apiKeyRecord.id;
    req.apiKeyScope = apiKeyRecord.scope;
    req.isSandbox = apiKeyRecord.isSandbox;

    next();
  } catch (error) {
    return next(new AppError(500, ErrorCode.INTERNAL_ERROR, 'Authentication error'));
  }
}
