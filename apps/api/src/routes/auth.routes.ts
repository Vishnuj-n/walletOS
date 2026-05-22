import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
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


router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'email and password are required');
    }

    // Find the admin user
    const adminUser = await prisma.adminUser.findUnique({
      where: { email },
    });

    if (!adminUser || !adminUser.passwordHash) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid email or password');
    }

    if (!adminUser.isActive) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Your account is inactive. Please complete setup.');
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, adminUser.passwordHash);
    if (!isMatch) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid email or password');
    }

    // Generate a secure admin session token starting with `adm_`
    const rawToken = `adm_${randomBytes(32).toString('hex')}`;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry
    const adminScope = `admin:${adminUser.id}`;

    await prisma.sessionToken.deleteMany({
      where: {
        tenantId: adminUser.tenantId,
        OR: [
          { expiresAt: { lt: new Date() } },
          { scope: adminScope },
        ],
      },
    });

    await prisma.sessionToken.create({
      data: {
        tenantId: adminUser.tenantId,
        tokenHash,
        scope: adminScope,
        expiresAt,
      },
    });

    res.status(200).json({
      token: rawToken,
      expires_at: expiresAt.toISOString(),
      adminUser: {
        id: adminUser.id,
        email: adminUser.email,
        tenantId: adminUser.tenantId,
        role: adminUser.role,
      },
    });
  })
);

router.post(
  '/claim',
  asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = req.body;

    if (!token || !password) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'token and password are required');
    }

    if (password.length < 8) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Password must be at least 8 characters');
    }

    // Hash incoming raw token using SHA-256 to search the DB
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Find verification record
    const pendingVerification = await prisma.pendingVerification.findUnique({
      where: { tokenHash },
      include: { adminUser: true },
    });

    if (!pendingVerification) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid or expired activation link');
    }

    if (pendingVerification.expiresAt < new Date()) {
      // Clean up expired verification
      await prisma.pendingVerification.delete({ where: { id: pendingVerification.id } });
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Activation link has expired');
    }

    // Hash the password using bcrypt with salt rounds 12
    const passwordHash = await bcrypt.hash(password, 12);

    // Atomically activate admin user and delete token
    await prisma.$transaction(async (tx) => {
      // 1. Update AdminUser
      await tx.adminUser.update({
        where: { email: pendingVerification.email },
        data: {
          passwordHash,
          isActive: true,
          activatedAt: new Date(),
        },
      });

      // 2. Delete used verification token
      await tx.pendingVerification.delete({
        where: { id: pendingVerification.id },
      });
    });

    res.status(200).json({
      message: 'Account successfully activated. You can now log in.',
    });
  })
);

export default router;
