import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../lib/prisma';
import { AdminUser } from '@prisma/client';
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

const getSupabaseClient = () => {
  // Only use mocked Supabase client in Jest tests unless explicitly enabled.
  // In all real runtime environments (dev/prod), always use the real service-role client.
  const shouldMockSupabase =
    process.env.NODE_ENV === 'test' && process.env.TEST_REAL_SUPABASE !== 'true';

  if (!shouldMockSupabase) {
    return supabaseAdmin;
  }

  // In tests, use the mocked client (configured by jest mocks)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient: mockedCreateClient } = require('@supabase/supabase-js');
  return mockedCreateClient();
};

/**
 * Admin Authentication Middleware
 * Verifies Supabase JWT and attaches admin user info to request
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

  const token = authHeader.substring(7);

  try {
    // Verify JWT with Supabase (real or mocked depending on environment)
    const supabaseClient = getSupabaseClient();
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);


    if (error || !user) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid or expired token'));
    }

    // Extract tenantId from JWT metadata. If missing, fall back to a DB lookup
    // by Supabase UID and infer tenantId from the admin user record.
    let tenantId = user.app_metadata?.tenantId;

    // Attempt to fetch the admin user. Prefer the composite lookup when tenantId
    // is present in the token (fast path). Otherwise fall back to a lookup by
    // supabase UID to infer the tenant.
    let adminUser: AdminUser | null = null;

    if (typeof tenantId === 'string' && tenantId.trim() !== '') {
      adminUser = await prisma.adminUser.findUnique({
        where: {
          tenantId_supabaseUid: {
            tenantId,
            supabaseUid: user.id,
          },
        },
      });
    } else {
      // Fallback: find admin user by Supabase UID and derive tenantId from DB.
      // This allows older tokens (missing app_metadata) to continue working
      // while preserving strict verification for the common case.
      // Use findFirst in case the DB doesn't have a unique constraint on supabaseUid.
      adminUser = await prisma.adminUser.findFirst({
        where: { supabaseUid: user.id },
      });

      if (adminUser) {
        // Log warning if multiple admin users share the same supabaseUid
        const count = await prisma.adminUser.count({
          where: { supabaseUid: user.id }
        });
        if (count > 1) {
          console.warn(`Multiple admin users found for supabaseUid: ${user.id}`);
        }
        tenantId = adminUser.tenantId;
      }
    }

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
    const sandboxHeader = req.headers['x-sandbox'];
    req.isSandbox = typeof sandboxHeader === 'string' ? sandboxHeader.toLowerCase() === 'true' : false;

    next();
  } catch (error) {
    // Log minimal error message without sensitive details
    if (process.env.NODE_ENV !== 'test') {
      console.error('adminAuth: authentication failed');
    }
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
