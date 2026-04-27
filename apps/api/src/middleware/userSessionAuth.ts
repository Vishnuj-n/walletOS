import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { AppError, ErrorCode } from './errorHandler';

function parseSessionScope(scope: string): { walletId: string; isSandbox: boolean } | null {
  const [walletSegment, walletId, sandboxSegment, sandboxFlag] = scope.split(':');
  if (walletSegment !== 'wallet' || sandboxSegment !== 'sandbox' || !walletId) {
    return null;
  }

  return {
    walletId,
    isSandbox: sandboxFlag === '1',
  };
}

export async function userSessionAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Session token is required'));
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token.startsWith('sess_')) {
    return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid session token format'));
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');

  try {
    const session = await prisma.sessionToken.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid or expired session token'));
    }

    const parsedScope = parseSessionScope(session.scope);
    if (!parsedScope) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid session token scope'));
    }

    req.tenantId = session.tenantId;
    req.isSandbox = parsedScope.isSandbox;
    req.sessionWalletId = parsedScope.walletId;
    return next();
  } catch (_error) {
    return next(new AppError(500, ErrorCode.INTERNAL_ERROR, 'Session authentication failed'));
  }
}
