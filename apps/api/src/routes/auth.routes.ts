import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { apiKeyAuthMiddleware } from '../middleware/auth';
import { userSessionAuthMiddleware } from '../middleware/userSessionAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError, ErrorCode } from '../middleware/errorHandler';

const router = Router();

router.post(
  '/session',
  apiKeyAuthMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { wallet_id } = req.body;

    if (!wallet_id) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'wallet_id is required');
    }

    if (!req.tenantId) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }

    if (req.apiKeyScope === 'read_only') {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'API key scope does not allow issuing session tokens');
    }

    const isSandbox = req.isSandbox || false;
    const wallet = await prisma.wallet.findFirst({
      where: {
        id: wallet_id,
        tenantId: req.tenantId,
        isSandbox,
      },
      select: { id: true },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    const token = `sess_${randomBytes(32).toString('hex')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.sessionToken.create({
      data: {
        tenantId: req.tenantId,
        tokenHash,
        scope: `wallet:${wallet.id}:sandbox:${isSandbox ? '1' : '0'}`,
        expiresAt,
      },
    });

    // Fetch full wallet profile to return to the client
    const walletProfile = await prisma.wallet.findUnique({
      where: { id: wallet.id },
      select: {
        id: true,
        externalUserId: true,
        label: true,
        balance: true,
        currency: true,
        status: true,
        isSandbox: true,
        metadata: true,
      },
    });

    res.status(200).json({
      token,
      expires_at: expiresAt.toISOString(),
      wallet: walletProfile,
    });
  })
);

router.get(
  '/session/profile',
  userSessionAuthMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.sessionWalletId) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Session wallet ID not found');
    }

    const walletProfile = await prisma.wallet.findUnique({
      where: { id: req.sessionWalletId },
      select: {
        id: true,
        externalUserId: true,
        label: true,
        balance: true,
        currency: true,
        status: true,
        isSandbox: true,
        metadata: true,
      },
    });

    if (!walletProfile) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    res.status(200).json({
      wallet: walletProfile,
    });
  })
);

export default router;
