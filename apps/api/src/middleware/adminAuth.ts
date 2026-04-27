import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../lib/prisma';
import { AppError, ErrorCode } from './errorHandler';

// Initialize Supabase admin client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Admin Authentication Middleware
 * Verifies Supabase JWT and attaches admin user info to request
 */
export async function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Missing or invalid authorization header'));
  }

  const token = authHeader.substring(7);

  try {
    // Verify JWT with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid or expired token'));
    }

    // Extract tenantId from JWT metadata - explicitly reject if missing or invalid
    const tenantId = user.app_metadata?.tenantId;
    if (typeof tenantId !== 'string' || tenantId.trim() === '') {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Missing or invalid tenantId in JWT'));
    }

    // Look up admin user in database
    const adminUser = await prisma.adminUser.findUnique({
      where: {
        tenantId_supabaseUid: {
          tenantId,
          supabaseUid: user.id,
        },
      },
    });

    if (!adminUser) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Admin user not found'));
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
    req.isSandbox = req.headers['x-sandbox']?.toLowerCase() === 'true';

    next();
  } catch (error) {
    // Log sanitized error message without sensitive details
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Log only non-sensitive fields
    processLogger?.error?.('adminAuth authentication error', {
      name: error instanceof Error ? error.name : 'Error',
      message: errorMessage.replace(/token|key|password|secret/gi, '[REDACTED]'),
    }) || console.error('adminAuth authentication error:', {
      name: error instanceof Error ? error.name : 'Error',
      message: errorMessage.replace(/token|key|password|secret/gi, '[REDACTED]'),
    });
    return next(new AppError(500, ErrorCode.INTERNAL_ERROR, 'Authentication error'));
  }
}

/**
 * Role-based access control middleware
 * Checks if admin user has required role or higher
 * Role hierarchy: support(0) < finance(1) < superadmin(2)
 */
export function requireAdminRole(minRole: 'support' | 'finance' | 'superadmin') {
  const roleRank = { support: 0, finance: 1, superadmin: 2 };

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.adminUser) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required'));
    }

    const userRoleRank = roleRank[req.adminUser.role];
    const requiredRank = roleRank[minRole];

    // Explicitly reject unknown roles
    if (userRoleRank === undefined) {
      return next(new AppError(403, ErrorCode.FORBIDDEN, 'Insufficient permissions'));
    }

    if (userRoleRank < requiredRank) {
      return next(new AppError(403, ErrorCode.FORBIDDEN, 'Insufficient permissions'));
    }

    next();
  };
}
