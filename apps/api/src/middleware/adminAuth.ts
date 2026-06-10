import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { AdminUser, AdminRole } from '@prisma/client';
import { AppError, ErrorCode } from './errorHandler';

/**
 * Admin Authentication Middleware
 * Verifies custom admin session token and attaches admin user info to request
 */
export async function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Allow OPTIONS requests to bypass authentication for CORS preflight
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Missing or invalid authorization header'));
  }

  const token = authHeader.substring(7).trim();

  // Admin tokens should start with `adm_`
  if (!token.startsWith('adm_')) {
    return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid admin token format'));
  }

  try {
    // Hash the raw token using SHA-256 (same as user session tokens)
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Fetch matching session token
    const session = await prisma.sessionToken.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid or expired session token'));
    }

    // Parse the scope to extract adminUserId. Expecting scope = "admin:adminUserId"
    const [scopeType, adminUserId] = session.scope.split(':');
    if (scopeType !== 'admin' || !adminUserId) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid session token scope'));
    }

    // Fetch the admin user from the database
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: adminUserId },
    });

    if (!adminUser) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Admin user not found'));
    }

    if (session.tenantId !== adminUser.tenantId) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Session tenant mismatch'));
    }

    if (!adminUser.isActive) {
      return next(new AppError(403, ErrorCode.FORBIDDEN, 'Admin user is inactive'));
    }

    // Attach admin user info to request
    req.adminUser = {
      id: adminUser.id,
      email: adminUser.email,
      tenantId: adminUser.tenantId,
      role: adminUser.role,
    };
    req.tenantId = adminUser.tenantId;

    // Set isSandbox from X-Sandbox header (case-insensitive), default to false
    const sandboxHeader = req.headers['x-sandbox'];
    req.isSandbox = typeof sandboxHeader === 'string' ? sandboxHeader.toLowerCase() === 'true' : false;

    next();
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('adminAuth: authentication failed', error);
    }
    return next(new AppError(500, ErrorCode.INTERNAL_ERROR, 'Authentication error'));
  }
}


/**
 * Role-based access control middleware
 * Checks if admin user has required role or higher
 * Role hierarchy: support(0) < finance(1) < tenant_admin(2) < superadmin(3)
 */
export function requireAdminRole(minRoleOrRoles: AdminRole | readonly AdminRole[] | AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const roleRank: Record<AdminRole, number> = { support: 0, finance: 1, tenant_admin: 2, superadmin: 3 };

    if (!req.adminUser) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required'));
    }

    const userRole = req.adminUser.role as AdminRole;
    const userRoleRank = roleRank[userRole];

    // Explicitly reject unknown roles
    if (userRoleRank === undefined) {
      return next(new AppError(403, ErrorCode.FORBIDDEN, 'Insufficient permissions'));
    }

    const minRole: AdminRole = typeof minRoleOrRoles === 'string'
      ? minRoleOrRoles
      : (minRoleOrRoles as readonly AdminRole[]).reduce<AdminRole>((min, r) => (roleRank[r] < roleRank[min] ? r : min), minRoleOrRoles[0]);

    const requiredRank = roleRank[minRole];

    if (userRoleRank < requiredRank) {
      return next(new AppError(403, ErrorCode.FORBIDDEN, 'Insufficient permissions'));
    }

    next();
  };
}
