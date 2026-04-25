import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  tenantId?: string;
  apiKeyScope?: string;
  isSandbox?: boolean;
}

export async function apiKeyAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({
      error: {
        message: 'API key is required',
        requestId: req.id,
      },
    });
    return;
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
      res.status(401).json({
        error: {
          message: 'Invalid or inactive API key',
          requestId: req.id,
        },
      });
      return;
    }

    // Attach tenant info to request
    req.tenantId = apiKeyRecord.tenantId;
    req.apiKeyScope = apiKeyRecord.scope;
    req.isSandbox = apiKeyRecord.isSandbox;

    next();
  } catch (error) {
    console.error(`[${req.id}] Error authenticating API key:`, error);
    res.status(500).json({
      error: {
        message: 'Authentication error',
        requestId: req.id,
      },
    });
  }
}
