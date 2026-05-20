import { Router } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { adminAuthMiddleware, getSupabaseAdminClient, requireAdminRole, verifySupabaseAccessToken } from '../middleware/adminAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { prisma } from '../lib/prisma';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { freezeWallet, unfreezeWallet, createWallet, updateWallet, closeWallet } from '../services/wallet.service';
import { z } from 'zod';

const router = Router();

const adminWalletCreateSchema = z.object({
  external_user_id: z.string().min(1),
  currency: z.string().length(3),
  label: z.string().min(1).max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tenant_id: z.string().min(1).optional(),
});

const transactionSearchSchema = z.object({
  transactionId: z.string().min(1).max(255).optional(),
  requestId: z.string().min(1).max(255).optional(),
  idempotencyKey: z.string().min(1).max(255).optional(),
  tenantId: z.string().min(1).max(255).optional(),
  includeCrossTenant: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => value === 'true'),
}).refine(
  ({ transactionId, requestId, idempotencyKey }) => Boolean(transactionId || requestId || idempotencyKey),
  { message: 'One of transactionId, requestId, or idempotencyKey is required' }
);

const walletSearchSchema = z.object({
  q: z.string().min(1).max(255),
  tenantId: z.string().min(1).max(255).optional(),
  includeCrossTenant: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => value === 'true'),
});

const tenantScopeSchema = z.object({
  tenantId: z.string().min(1).max(255).optional(),
});

const adminApiKeyRotationRequestSchema = z.object({
  scope: z.enum(['live', 'test']),
});

const createTenantRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contact_email: z.string().trim().email().optional(),
  bootstrap_admin_email: z.string().trim().email().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const inviteTenantUserRequestSchema = z.object({
  email: z.string().trim().email(),
  role: z.literal('tenant_admin'),
});

const activateInvitationRequestSchema = z.object({
  tenant_id: z.string().trim().min(1).max(255),
});

type AdminApiKeyRotationResponse = {
  api_key: string;
  scope: 'live' | 'test';
  tenant_id: string;
  created_at: string;
};

type CreatedTenantResponse = {
  tenant_id: string;
  name: string;
  contact_email: string | null;
  live_key: string;
  test_key: string;
  created_at: string;
  bootstrap_invite_sent?: boolean;
  bootstrap_admin_email?: string | null;
};

type InviteTenantUserResponse = {
  tenant_id: string;
  email: string;
  role: 'tenant_admin';
  invite_sent: boolean;
  invited_at: string;
};

const IDEMPOTENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

class TtlCache<V> {
  private store = new Map<string, { value: V; expiresAt: number }>();
  constructor(private ttlMs: number) {}
  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }
  set(key: string, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

const adminApiKeyRotationCache = new TtlCache<AdminApiKeyRotationResponse>(IDEMPOTENCY_WINDOW_MS);
const tenantCreationCache = new TtlCache<CreatedTenantResponse>(IDEMPOTENCY_WINDOW_MS);

function getValidatedIdempotencyKey(idempotencyKeyHeader: string | string[] | undefined): string {
  const idempotencyKey = Array.isArray(idempotencyKeyHeader) ? idempotencyKeyHeader[0] : idempotencyKeyHeader;

  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Idempotency-Key header is required');
  }

  if (idempotencyKey.length > 255) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Idempotency-Key must be at most 255 characters');
  }

  return idempotencyKey;
}

function getAdminApiKeyRotationCacheKey(tenantId: string, scope: 'live' | 'test', auditAction: string, idempotencyKey: string): string {
  return `${tenantId}:${scope}:${auditAction}:${idempotencyKey}`;
}

function getTenantCreationCacheKey(actorEmail: string, idempotencyKey: string): string {
  return `${actorEmail}:tenant.created:${idempotencyKey}`;
}

function redactApiKeyForAudit(apiKey: string): string {
  return `${apiKey.slice(0, 15)}...[redacted]`;
}

function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getAdminClaimRedirectUrl(tenantId: string): string {
  const configuredBaseUrl = process.env.ADMIN_CLAIM_REDIRECT_URL || process.env.ADMIN_APP_URL;

  if (!configuredBaseUrl) {
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'Admin claim redirect URL is not configured');
  }

  const claimUrl = new URL('/claim', configuredBaseUrl);
  claimUrl.searchParams.set('tenant_id', tenantId);
  return claimUrl.toString();
}

async function sendTenantAdminInvite(params: {
  tenantId: string;
  email: string;
  role: 'tenant_admin';
}) {
  const { tenantId, email, role } = params;
  const supabaseAdmin = getSupabaseAdminClient();
  const redirectTo = getAdminClaimRedirectUrl(tenantId);

  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      tenant_id: tenantId,
      invited_role: role,
    },
  });

  if (error) {
    throw new AppError(502, ErrorCode.INTERNAL_ERROR, 'Failed to send Supabase invite');
  }
}

async function upsertPendingAdminInvite(params: {
  tenantId: string;
  email: string;
  role: 'tenant_admin';
}, tx: Prisma.TransactionClient = prisma) {
  const normalizedEmail = normalizeAdminEmail(params.email);
  const invitedAt = new Date();

  const adminUser = await tx.adminUser.upsert({
    where: {
      tenantId_email: {
        tenantId: params.tenantId,
        email: normalizedEmail,
      },
    },
    update: {
      role: params.role,
      isActive: false,
      invitedAt,
      activatedAt: null,
      supabaseUid: null,
    },
    create: {
      tenantId: params.tenantId,
      email: normalizedEmail,
      role: params.role,
      isActive: false,
      invitedAt,
    },
  });

  return adminUser;
}

async function resolveAdminTenantScope(
  req: Express.Request,
  requestedTenantId?: string,
  options?: { allowSuperadminOverride?: boolean }
): Promise<string> {
  const sessionTenantId = req.adminUser!.tenantId;
  const isSuperadmin = req.adminUser!.role === 'superadmin';
  const tenantId = requestedTenantId ?? sessionTenantId;

  if (tenantId === sessionTenantId) {
    return tenantId;
  }

  // Check authorization before tenant lookup to avoid leaking tenant existence
  if (!isSuperadmin) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Tenant scope is limited to your assigned tenant');
  }

  if (!options?.allowSuperadminOverride) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Cross-tenant scope is not allowed for this route');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });

  if (!tenant) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Tenant not found');
  }

  return tenant.id;
}

async function rotateAdminApiKeyForTenant(params: {
  tenantId: string;
  scope: 'live' | 'test';
  adminEmail: string;
  idempotencyKey: string;
  auditAction: 'tenant.key_rotated';
  isAuditSandbox: boolean;
}): Promise<{
  apiKey: { createdAt: Date };
  cachedResponse: AdminApiKeyRotationResponse;
  status: number;
}> {
  const { tenantId, scope, adminEmail, idempotencyKey, auditAction, isAuditSandbox } = params;
  const idempotencyWindowStart = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
  const isSandbox = scope === 'test';
  const cacheKey = getAdminApiKeyRotationCacheKey(tenantId, scope, auditAction, idempotencyKey);

  const cachedResponse = adminApiKeyRotationCache.get(cacheKey);
  if (cachedResponse) {
    return {
      apiKey: {
        createdAt: new Date(cachedResponse.created_at),
      },
      cachedResponse,
      status: 201,
    };
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${idempotencyKey}:${auditAction}`}));`;

    const cachedAudit = await tx.auditLog.findFirst({
      where: {
        tenantId,
        entityType: 'tenant',
        entityId: tenantId,
        action: auditAction,
        timestamp: {
          gte: idempotencyWindowStart,
        },
        changes: {
          path: ['idempotency_key'],
          equals: idempotencyKey,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    if (cachedAudit) {
      const cachedChanges = (cachedAudit.changes as Record<string, unknown> | null) ?? {};
      const cachedResponse = cachedChanges.response as
        | AdminApiKeyRotationResponse
        | undefined;

      if (cachedResponse) {
        // If we have the raw API key in the audit log (not redacted), reuse it.
        if (!cachedResponse.api_key.includes('[redacted]')) {
          adminApiKeyRotationCache.set(cacheKey, cachedResponse);
          return {
            apiKey: {
              createdAt: new Date(cachedResponse.created_at),
            },
            cachedResponse,
            status: (cachedChanges.response_status as number) || 201,
          };
        }

        // Audit only contains a redacted value. Recovery without a secure cache
        // that persisted the raw key is unsafe — fail explicitly instead of
        // regenerating or returning redacted secrets.
        throw new AppError(
          500,
          ErrorCode.INTERNAL_ERROR,
          'Raw API key unavailable from audit logs; rotation cannot be safely recovered'
        );
      }
    }

    const newKey = `wlt_${scope}_${randomBytes(24).toString('hex')}`;
    const newKeyHash = createHash('sha256').update(newKey).digest('hex');

    const deactivatedKeys = await tx.apiKey.updateMany({
      where: {
        tenantId,
        scope: 'admin',
        isSandbox,
      },
      data: {
        isActive: false,
      },
    });

    const apiKey = await tx.apiKey.create({
      data: {
        tenantId,
        keyHash: newKeyHash,
        prefix: newKey.substring(0, 15),
        scope: 'admin',
        isSandbox,
      },
    });

    const response: AdminApiKeyRotationResponse = {
      api_key: newKey,
      scope,
      tenant_id: tenantId,
      created_at: apiKey.createdAt.toISOString(),
    };

    adminApiKeyRotationCache.set(cacheKey, response);

    await tx.auditLog.create({
      data: {
        tenantId,
        entityType: 'tenant',
        entityId: tenantId,
        action: auditAction,
        changes: {
          scope,
          key_prefix: newKey.substring(0, 15),
          rotated_by: adminEmail,
          idempotency_key: idempotencyKey,
          had_active_key: deactivatedKeys.count > 0,
          response: {
            api_key: redactApiKeyForAudit(newKey),
            scope,
            tenant_id: tenantId,
            created_at: apiKey.createdAt.toISOString(),
          },
          response_status: 201,
        },
        actorId: adminEmail,
        actorType: 'admin',
        isSandbox: isAuditSandbox,
      },
    });

    return {
      apiKey,
      cachedResponse: response,
      status: 201,
    };
  });
}

/**
 * POST /admin/invitations/activate
 * Activate a pending invited admin using the verified Supabase session
 */
router.post(
  '/invitations/activate',
  asyncHandler(async (req, res) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Missing or invalid authorization header');
    }

    const parsedBody = activateInvitationRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'tenant_id is required');
    }

    const token = authHeader.substring(7);
    const tenantId = parsedBody.data.tenant_id;
    const user = await verifySupabaseAccessToken(token);
    const normalizedEmail = normalizeAdminEmail(user.email ?? '');

    if (!normalizedEmail) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Verified email is required');
    }

    if (!user.email_confirmed_at) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Verified email is required');
    }

    const pendingInvite = await prisma.adminUser.findUnique({
      where: {
        tenantId_email: {
          tenantId,
          email: normalizedEmail,
        },
      },
    });

    if (!pendingInvite) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Pending invite not found');
    }

    if (pendingInvite.isActive || pendingInvite.activatedAt || pendingInvite.supabaseUid) {
      throw new AppError(409, ErrorCode.INVALID_OPERATION, 'Invite has already been activated');
    }

    const activatedAt = new Date();
    const updatedAdmin = await prisma.$transaction(async (tx) => {
      const activatedAdmin = await tx.adminUser.update({
        where: {
          tenantId_email: {
            tenantId,
            email: normalizedEmail,
          },
        },
        data: {
          supabaseUid: user.id,
          isActive: true,
          activatedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'admin_user',
          entityId: activatedAdmin.id,
          action: 'admin_user.activated',
          changes: {
            email: normalizedEmail,
            role: activatedAdmin.role,
            activated_at: activatedAt.toISOString(),
            actor_supabase_uid: user.id,
          },
          actorId: normalizedEmail,
          actorType: 'admin',
          isSandbox: false,
        },
      });

      const supabaseAdmin = getSupabaseAdminClient();
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        app_metadata: {
          ...(user.app_metadata ?? {}),
          tenantId,
          role: activatedAdmin.role,
        },
      });

      if (error) {
        throw new AppError(502, ErrorCode.INTERNAL_ERROR, 'Failed to finalize Supabase admin activation');
      }

      return activatedAdmin;
    });

    res.status(200).json({
      tenant_id: tenantId,
      email: normalizedEmail,
      role: updatedAdmin.role,
      activated_at: activatedAt.toISOString(),
    });
  })
);

// Apply admin auth to all routes
router.use(adminAuthMiddleware);

/**
 * POST /admin/wallets
 * Create a new wallet
 */
router.post(
  '/wallets',
  requireAdminRole('support'),
  asyncHandler(async (req, res) => {
    const parsedPayload = adminWalletCreateSchema.safeParse(req.body);
    if (!parsedPayload.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid wallet create payload');
    }

    const { external_user_id, currency, label, metadata, tenant_id } = parsedPayload.data;
    const tenantId = tenant_id || req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const isSandbox = req.isSandbox || false;

    if (!idempotencyKey) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'idempotency-key header is required');
    }

    // If tenant_id is provided, validate admin has access to this tenant
    if (tenant_id && tenant_id !== req.adminUser!.tenantId) {
      // For now, only superadmins can create wallets in other tenants
      if (req.adminUser!.role !== 'superadmin') {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Only superadmins can create wallets in other tenants');
      }
      
      // Verify the target tenant exists
      const targetTenant = await prisma.tenant.findUnique({
        where: { id: tenant_id },
      });
      
      if (!targetTenant) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Target tenant not found');
      }
    }

    // Atomic wallet creation with idempotency handling
    let wasExisting = false;
    const result = await prisma.$transaction(async (tx) => {
      // Check if wallet already exists with same parameters (idempotency check)
      const existingWallet = await tx.wallet.findFirst({
        where: {
          tenantId: tenantId as string,
          externalUserId: external_user_id,
          currency,
          isSandbox,
        },
      });

      if (existingWallet) {
        // Wallet already exists, check if it was created by an admin
        const existingAuditLog = await tx.auditLog.findFirst({
          where: {
            tenantId: tenantId as string,
            entityId: existingWallet.id,
            action: 'wallet.created',
            actorId: adminEmail, // Only return if created by same admin
          },
        });

        if (existingAuditLog) {
          wasExisting = true;
          return existingWallet;
        }
      }

      // Create audit log reservation first
      const auditReservation = await tx.auditLog.create({
        data: {
          tenantId: tenantId as string,
          entityType: 'wallet',
          entityId: '', // Will be updated after wallet creation
          action: 'wallet.created',
          changes: {
            idempotency_key: idempotencyKey,
          } as Prisma.InputJsonValue,
        },
      });

      // Create the wallet
      const wallet = await createWallet({
        tenantId,
        externalUserId: external_user_id,
        currency,
        label,
        metadata,
        isSandbox,
      });

      // Update audit log with complete information
      const auditUpdate = await tx.auditLog.update({
        where: { id: auditReservation.id },
        data: {
          entityId: wallet.id,
          actorId: adminEmail,
          actorType: 'admin',
          changes: {
            idempotency_key: idempotencyKey,
            external_user_id,
            currency,
            label,
            metadata,
          } as Prisma.InputJsonValue,
        },
      });


      return wallet;
    });

    // Check if this was an existing wallet (idempotent response) or new creation
    const statusCode = wasExisting ? 200 : 201;

    res.status(statusCode).json({
      wallet_id: result.id,
      external_user_id: result.externalUserId,
      label: result.label,
      balance: result.balance.toFixed(4),
      currency: result.currency,
      status: result.status,
      is_sandbox: result.isSandbox,
      metadata: result.metadata,
    });
  })
);

/**
 * PATCH /admin/wallets/:walletId
 * Update wallet label or metadata
 */
router.patch(
  '/wallets/:walletId',
  requireAdminRole('support'),
  asyncHandler(async (req, res) => {
    const { walletId } = req.params;
    const { label, metadata } = req.body;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const isSandbox = req.isSandbox || false;

    if (label === undefined && metadata === undefined) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'label or metadata must be provided');
    }

    // Check for existing audit log with same idempotency key
    if (idempotencyKey) {
      const existingAudit = await prisma.auditLog.findFirst({
        where: {
          tenantId,
          action: 'wallet.updated',
          isSandbox,
          changes: {
            path: ['idempotency_key'],
            equals: idempotencyKey,
          },
        },
      });

      if (existingAudit) {
        const existingWallet = await prisma.wallet.findUnique({
          where: { id: existingAudit.entityId },
        });

        if (existingWallet) {
          return res.status(200).json({
            wallet_id: existingWallet.id,
            external_user_id: existingWallet.externalUserId,
            label: existingWallet.label,
            balance: existingWallet.balance.toFixed(4),
            currency: existingWallet.currency,
            status: existingWallet.status,
            is_sandbox: existingWallet.isSandbox,
            metadata: existingWallet.metadata,
          });
        }
      }
    }

    // Capture pre-update state for audit log
    const prevWallet = await prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!prevWallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    const wallet = await updateWallet(
      walletId,
      tenantId,
      isSandbox,
      { label, metadata }
    );

    // Create new audit log entry (append-only)
    await prisma.auditLog.create({
      data: {
        tenantId: tenantId as string,
        entityType: 'wallet',
        entityId: walletId,
        action: 'wallet.updated',
        actorId: adminEmail,
        actorType: 'admin',
        changes: {
          before: {
            label: prevWallet.label,
            metadata: prevWallet.metadata,
          },
          after: {
            label,
            metadata,
          },
          idempotency_key: idempotencyKey,
        } as Prisma.InputJsonValue,
      },
    });

    res.json({
      wallet_id: wallet.id,
      external_user_id: wallet.externalUserId,
      label: wallet.label,
      balance: wallet.balance.toFixed(4),
      currency: wallet.currency,
      status: wallet.status,
      is_sandbox: wallet.isSandbox,
      metadata: wallet.metadata,
    });
  })
);

/**
 * DELETE /admin/wallets/:walletId
 * Close a wallet (admin version with reason)
 */
router.delete(
  '/wallets/:walletId',
  requireAdminRole('support'),
  asyncHandler(async (req, res) => {
    const { walletId } = req.params;
    const { reason } = req.body;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const isSandbox = req.isSandbox || false;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required field: reason');
    }

    // Check for existing audit log with same idempotency key
    if (idempotencyKey) {
      const existingAudit = await prisma.auditLog.findFirst({
        where: {
          tenantId,
          action: 'wallet.closed',
          isSandbox,
          changes: {
            path: ['idempotency_key'],
            equals: idempotencyKey,
          },
        },
      });

      if (existingAudit) {
        const existingWallet = await prisma.wallet.findUnique({
          where: { id: existingAudit.entityId },
        });

        if (existingWallet) {
          return res.status(200).json({
            wallet_id: existingWallet.id,
            external_user_id: existingWallet.externalUserId,
            label: existingWallet.label,
            balance: existingWallet.balance.toFixed(4),
            currency: existingWallet.currency,
            status: 'closed',
            is_sandbox: existingWallet.isSandbox,
            metadata: existingWallet.metadata,
          });
        }
      }
    }

    const wallet = await closeWallet(walletId, tenantId, isSandbox, reason);

    // Update audit log with admin metadata while preserving service-generated data
    const existingAudit = await prisma.auditLog.findFirst({
      where: {
        tenantId,
        entityId: walletId,
        action: 'wallet.closed',
      },
    });

    if (existingAudit) {
      await prisma.auditLog.updateMany({
        where: {
          tenantId,
          entityId: walletId,
          action: 'wallet.closed',
        },
        data: {
          actorId: adminEmail,
          actorType: 'admin',
          changes: {
            ...existingAudit.changes as any,
            reason,
            idempotency_key: idempotencyKey,
          },
        },
      });
    }

    res.json({
      wallet_id: wallet.id,
      external_user_id: wallet.externalUserId,
      label: wallet.label,
      balance: wallet.balance.toFixed(4),
      currency: wallet.currency,
      status: wallet.status,
      is_sandbox: wallet.isSandbox,
      metadata: wallet.metadata,
    });
  })
);

/**
 * GET /admin/wallets
 * List all wallets for the tenant with filtering
 */
router.get(
  '/wallets',
  requireAdminRole('support'),
  asyncHandler(async (req, res) => {
    const { status, currency, search, limit = 20, after } = req.query;
    const parsedTenantScope = tenantScopeSchema.safeParse(req.query);
    if (!parsedTenantScope.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid tenant scope');
    }

    const tenantId = await resolveAdminTenantScope(req, parsedTenantScope.data.tenantId);
    const isSandbox = req.isSandbox || false;

    const where: Prisma.WalletWhereInput = { tenantId, isSandbox };

    if (status) {
      const allowedStatuses = ['active', 'frozen', 'pending_closure', 'closed'];
      if (allowedStatuses.includes(status as string)) {
        where.status = status as any;
      }
    }
    if (currency) where.currency = Array.isArray(currency) ? currency[0] : currency;
    if (search) {
      where.OR = [
        { externalUserId: { contains: search as string, mode: 'insensitive' } },
        { label: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const parsedLimit = Number(limit);
    const cappedLimit = (!Number.isFinite(parsedLimit) || parsedLimit <= 0) ? 10 : Math.min(Math.floor(parsedLimit), 100);
    const wallets = await prisma.wallet.findMany({
      where,
      take: cappedLimit,
      skip: after ? 1 : 0,
      cursor: after ? { id: after as string } : undefined,
      orderBy: { id: 'desc' },
    });

    const nextCursor = wallets.length === cappedLimit ? wallets[wallets.length - 1].id : null;

    res.json({
      data: wallets.map(w => ({
        wallet_id: w.id,
        external_user_id: w.externalUserId,
        label: w.label,
        balance: w.balance.toFixed(4),
        currency: w.currency,
        status: w.status,
        is_sandbox: w.isSandbox,
        metadata: w.metadata,
      })),
      next_cursor: nextCursor,
    });
  })
);

/**
 * GET /admin/wallets/:walletId
 * Get detailed wallet information
 */
router.get(
  '/wallets/:walletId',
  requireAdminRole('support'),
  asyncHandler(async (req, res) => {
    const { walletId } = req.params;
    const tenantId = req.adminUser!.tenantId;
    const isSandbox = req.isSandbox || false;

    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, tenantId, isSandbox },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    res.json({
      wallet_id: wallet.id,
      external_user_id: wallet.externalUserId,
      label: wallet.label,
      balance: wallet.balance.toFixed(4),
      currency: wallet.currency,
      status: wallet.status,
      is_sandbox: wallet.isSandbox,
      metadata: wallet.metadata,
    });
  })
);

/**
 * POST /admin/transactions/credit
 * Manual credit with mandatory reason
 */
router.post(
  '/transactions/credit',
  requireAdminRole('finance'),
  asyncHandler(async (req, res) => {
    const { wallet_id, amount, description, reference_id, metadata, reason } = req.body;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const isSandbox = req.isSandbox || false;

    if (!wallet_id || !amount || !description || !reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required fields: wallet_id, amount, description, reason');
    }

    // Validate amount is a positive finite number using Decimal
    const decimalAmount = new Decimal(amount);
    if (!decimalAmount.isFinite() || decimalAmount.lte(0)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Amount must be a positive number');
    }

    const wallet = await prisma.wallet.findFirst({
      where: { id: wallet_id, tenantId, isSandbox },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    if (wallet.status !== 'active') {
      throw new AppError(409, ErrorCode.WALLET_FROZEN, 'Wallet is not active');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Check for existing transaction with same idempotency key inside transaction
      if (idempotencyKey) {
        const existingTx = await tx.transaction.findFirst({
          where: {
            tenantId,
            idempotencyKey,
            wallet: {
              isSandbox,
            },
          },
          include: {
            wallet: true,
          },
        });

        if (existingTx) {
          // Validate that the existing transaction matches the request parameters
          if (existingTx.walletId !== wallet_id ||
              !existingTx.amount.equals(decimalAmount) ||
              existingTx.type !== 'credit' ||
              (existingTx.metadata as any)?.description !== `${description} (Admin: ${reason})`) {
            throw new AppError(409, ErrorCode.IDEMPOTENCY_CONFLICT, 'Idempotency key already used with different parameters');
          }
          return existingTx;
        }
      }
      // Lock wallet row with SELECT FOR UPDATE
      await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${wallet_id} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

      // Extract locked balance from the locked row instead of separate query
      const lockedWalletResult = await tx.$queryRaw<{ balance: Decimal }[]>`SELECT "balance" FROM "Wallet" WHERE id = ${wallet_id} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox}`;
      const lockedWallet = lockedWalletResult[0];

      if (!lockedWallet) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
      }

      // Re-check wallet status inside transaction after lock
      const walletStatus = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "Wallet" WHERE id = ${wallet_id} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox}`;
      if (walletStatus[0]?.status !== 'active') {
        throw new AppError(409, ErrorCode.WALLET_FROZEN, 'Wallet is not active');
      }

      const balanceBefore = lockedWallet.balance;
      const balanceAfter = balanceBefore.plus(decimalAmount);

      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          tenantId,
          walletId: wallet_id,
          type: 'credit',
          amount: decimalAmount,
          currency: wallet.currency,
          balanceBefore,
          balanceAfter,
          referenceId: reference_id,
          idempotencyKey,
          metadata: {
            ...metadata,
            description: `${description} (Admin: ${reason})`,
            admin_action: true,
            admin_email: adminEmail,
            admin_reason: reason,
          },
        },
      });

      // Update wallet balance
      await tx.wallet.update({
        where: { id: wallet_id },
        data: { balance: balanceAfter },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'wallet',
          entityId: wallet_id,
          action: 'admin.credit',
          changes: {
            amount: decimalAmount.toFixed(4),
            reason: reason,
            admin: adminEmail,
            idempotency_key: idempotencyKey,
          },
          actorId: adminEmail,
          actorType: 'admin',
          isSandbox,
        },
      });

      return transaction;
    });

    res.status(201).json({
      transaction_id: result.id,
      wallet_id: result.walletId,
      type: result.type,
      amount: result.amount.toFixed(4),
      balance_before: result.balanceBefore.toFixed(4),
      balance_after: result.balanceAfter.toFixed(4),
      reference_id: result.referenceId,
      is_sandbox: wallet.isSandbox,
      metadata: result.metadata,
      description: (result.metadata as any)?.description,
      created_at: result.createdAt,
    });
  })
);

/**
 * POST /admin/transactions/debit
 * Manual debit with mandatory reason
 */
router.post(
  '/transactions/debit',
  requireAdminRole('finance'),
  asyncHandler(async (req, res) => {
    const { wallet_id, amount, description, reference_id, reason } = req.body;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const isSandbox = req.isSandbox || false;

    if (!wallet_id || !amount || !description || !reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required fields: wallet_id, amount, description, reason');
    }

    // Validate amount is a positive finite number using Decimal
    const decimalAmount = new Decimal(amount);
    if (!decimalAmount.isFinite() || decimalAmount.lte(0)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Amount must be a positive number');
    }

    const wallet = await prisma.wallet.findFirst({
      where: { id: wallet_id, tenantId, isSandbox },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    if (wallet.status !== 'active') {
      throw new AppError(409, ErrorCode.WALLET_FROZEN, 'Wallet is not active');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Check for existing transaction with same idempotency key inside transaction
      if (idempotencyKey) {
        const existingTx = await tx.transaction.findFirst({
          where: {
            tenantId,
            idempotencyKey,
            wallet: {
              isSandbox,
            },
          },
          include: {
            wallet: true,
          },
        });

        if (existingTx) {
          // Validate that the existing transaction matches the request parameters
          if (existingTx.walletId !== wallet_id ||
              !existingTx.amount.equals(decimalAmount) ||
              existingTx.type !== 'debit' ||
              (existingTx.metadata as any)?.description !== `${description} (Admin: ${reason})`) {
            throw new AppError(409, ErrorCode.IDEMPOTENCY_CONFLICT, 'Idempotency key already used with different parameters');
          }
          return existingTx;
        }
      }
      // Lock wallet row with SELECT FOR UPDATE
      await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${wallet_id} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

      // Extract locked balance from the locked row instead of separate query
      const lockedWalletResult = await tx.$queryRaw<{ balance: Decimal }[]>`SELECT "balance" FROM "Wallet" WHERE id = ${wallet_id} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox}`;
      const lockedWallet = lockedWalletResult[0];

      if (!lockedWallet) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
      }

      // Re-check wallet status inside transaction after lock
      const walletStatus = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "Wallet" WHERE id = ${wallet_id} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox}`;
      if (walletStatus[0]?.status !== 'active') {
        throw new AppError(409, ErrorCode.WALLET_FROZEN, 'Wallet is not active');
      }

      const balanceBefore = lockedWallet.balance;
      const balanceAfter = balanceBefore.minus(decimalAmount);

      if (balanceAfter.isNegative()) {
        throw new AppError(422, ErrorCode.INSUFFICIENT_BALANCE, 'Insufficient balance');
      }

      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          tenantId,
          walletId: wallet_id,
          type: 'debit',
          amount: decimalAmount,
          currency: wallet.currency,
          balanceBefore,
          balanceAfter,
          referenceId: reference_id,
          idempotencyKey,
          metadata: {
            description: `${description} (Admin: ${reason})`,
            admin_action: true,
            admin_email: adminEmail,
            admin_reason: reason,
          },
        },
      });

      // Update wallet balance
      await tx.wallet.update({
        where: { id: wallet_id },
        data: { balance: balanceAfter },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'wallet',
          entityId: wallet_id,
          action: 'admin.debit',
          changes: {
            amount: decimalAmount.toFixed(4),
            reason: reason,
            admin: adminEmail,
            idempotency_key: idempotencyKey,
          },
          actorId: adminEmail,
          actorType: 'admin',
          isSandbox,
        },
      });

      return transaction;
    });

    res.status(201).json({
      transaction_id: result.id,
      wallet_id: result.walletId,
      type: result.type,
      amount: result.amount.toFixed(4),
      balance_before: result.balanceBefore.toFixed(4),
      balance_after: result.balanceAfter.toFixed(4),
      reference_id: result.referenceId,
      is_sandbox: wallet.isSandbox,
      metadata: result.metadata,
      description: (result.metadata as any)?.description,
      created_at: result.createdAt,
    });
  })
);

/**
 * POST /admin/transactions/:txId/reverse
 * Manual reversal with mandatory reason
 */
router.post(
  '/transactions/:txId/reverse',
  requireAdminRole('finance'),
  asyncHandler(async (req, res) => {
    const { txId } = req.params;
    const { reason } = req.body;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const isSandbox = req.isSandbox || false;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required field: reason');
    }

    const originalTx = await prisma.transaction.findFirst({
      where: { id: txId, tenantId },
    });

    if (!originalTx) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Transaction not found');
    }

    // Load wallet and validate sandbox status immediately to prevent info leakage
    const wallet = await prisma.wallet.findFirst({
      where: { id: originalTx.walletId, tenantId },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    // Validate sandbox environment matches before proceeding
    if (wallet.isSandbox !== isSandbox) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Wallet environment mismatch');
    }

    if (originalTx.type === 'reversal') {
      throw new AppError(409, ErrorCode.CANNOT_REVERSE_REVERSAL, 'Cannot reverse a reversal');
    }

    if (wallet.status !== 'active') {
      throw new AppError(409, ErrorCode.WALLET_FROZEN, 'Wallet is not active');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Check for existing transaction with same idempotency key inside transaction
      if (idempotencyKey) {
        const existingTx = await tx.transaction.findFirst({
          where: {
            tenantId,
            idempotencyKey,
            wallet: {
              isSandbox,
            },
          },
          include: {
            wallet: true,
          },
        });

        if (existingTx) {
          // Validate that the existing reversal matches the request parameters
          const existingOriginalTxId = (existingTx.metadata as any)?.original_tx_id;
          if (existingOriginalTxId !== originalTx.id ||
              existingTx.walletId !== originalTx.walletId ||
              !existingTx.amount.equals(originalTx.amount)) {
            throw new AppError(409, ErrorCode.IDEMPOTENCY_CONFLICT, 'Idempotency key already used with different parameters');
          }
          // Return a special marker to indicate idempotent response
          return { existingTx, idempotent: true };
        }
      }
      
      // Lock wallet row with SELECT FOR UPDATE
      await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${originalTx.walletId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox} FOR UPDATE`;

      // Extract locked balance from the locked row instead of separate query
      const lockedWalletResult = await tx.$queryRaw<{ balance: Decimal }[]>`SELECT "balance" FROM "Wallet" WHERE id = ${originalTx.walletId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox}`;
      const lockedWallet = lockedWalletResult[0];

      if (!lockedWallet) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
      }

      // Re-check wallet status inside transaction after lock
      const walletStatus = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "Wallet" WHERE id = ${originalTx.walletId} AND "tenantId" = ${tenantId} AND "isSandbox" = ${isSandbox}`;
      if (walletStatus[0]?.status !== 'active') {
        throw new AppError(409, ErrorCode.WALLET_FROZEN, 'Wallet is not active');
      }

      const balanceBefore = lockedWallet.balance;
      const balanceAfter = originalTx.type === 'credit'
        ? balanceBefore.minus(originalTx.amount)
        : balanceBefore.plus(originalTx.amount);

      if (balanceAfter.isNegative()) {
        throw new AppError(422, ErrorCode.INSUFFICIENT_BALANCE, 'Insufficient balance for reversal');
      }

      // Create reversal transaction
      const reversalTx = await tx.transaction.create({
        data: {
          tenantId,
          walletId: originalTx.walletId,
          type: 'reversal',
          amount: originalTx.amount,
          currency: originalTx.currency,
          balanceBefore,
          balanceAfter,
          idempotencyKey,
          metadata: {
            description: `Reversal of: ${(originalTx.metadata as any)?.description || originalTx.id} (Admin: ${reason})`,
            admin_action: true,
            admin_email: adminEmail,
            admin_reason: reason,
            original_tx_id: originalTx.id,
          },
        },
      });

      // Update wallet balance
      await tx.wallet.update({
        where: { id: originalTx.walletId },
        data: { balance: balanceAfter },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'transaction',
          entityId: originalTx.id,
          action: 'admin.reverse',
          changes: {
            amount: originalTx.amount.toFixed(4),
            reason: reason,
            admin: adminEmail,
          },
          actorId: adminEmail,
          actorType: 'admin',
          isSandbox,
        },
      });

      return { reversalTx, idempotent: false };
    });

    // Handle response based on whether it was idempotent or new
    if ('existingTx' in result && result.existingTx) {
      return res.status(200).json({
        transaction_id: result.existingTx.id,
        wallet_id: result.existingTx.walletId,
        type: result.existingTx.type,
        original_tx_id: originalTx.id,
        amount: result.existingTx.amount.toFixed(4),
        balance_before: result.existingTx.balanceBefore.toFixed(4),
        balance_after: result.existingTx.balanceAfter.toFixed(4),
        created_at: result.existingTx.createdAt,
      });
    }

    res.status(201).json({
      transaction_id: result.reversalTx.id,
      wallet_id: result.reversalTx.walletId,
      type: result.reversalTx.type,
      original_tx_id: originalTx.id,
      amount: result.reversalTx.amount.toFixed(4),
      balance_before: result.reversalTx.balanceBefore.toFixed(4),
      balance_after: result.reversalTx.balanceAfter.toFixed(4),
      created_at: result.reversalTx.createdAt,
    });
  })
);

/**
 * POST /admin/wallets/:walletId/freeze
 * Freeze wallet with mandatory reason
 */
router.post(
  '/wallets/:walletId/freeze',
  requireAdminRole('support'),
  asyncHandler(async (req, res) => {
    const { walletId } = req.params;
    const { reason } = req.body;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const isSandbox = req.isSandbox || false;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required field: reason');
    }

    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, tenantId, isSandbox },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    if (wallet.status === 'frozen') {
      throw new AppError(409, ErrorCode.WALLET_ALREADY_FROZEN, 'Wallet is already frozen');
    }

    if (wallet.status === 'closed') {
      throw new AppError(409, ErrorCode.WALLET_ALREADY_CLOSED, 'Cannot freeze a closed wallet');
    }

    // Check for existing audit log with same idempotency key and isSandbox
    if (idempotencyKey) {
      const existingAudit = await prisma.auditLog.findFirst({
        where: {
          tenantId,
          action: 'wallet.frozen',
          isSandbox,
          changes: {
            path: ['idempotency_key'],
            equals: idempotencyKey,
          },
        },
      });

      if (existingAudit) {
        return res.status(200).json({
          wallet_id: walletId,
          external_user_id: wallet.externalUserId,
          label: wallet.label,
          balance: wallet.balance.toFixed(4),
          currency: wallet.currency,
          status: 'frozen',
          is_sandbox: wallet.isSandbox,
          metadata: wallet.metadata,
        });
      }
    }

    const updatedWallet = await freezeWallet(walletId, tenantId, isSandbox, reason, idempotencyKey, adminEmail, 'admin');

    res.json({
      wallet_id: updatedWallet.id,
      external_user_id: updatedWallet.externalUserId,
      label: updatedWallet.label,
      balance: updatedWallet.balance.toFixed(4),
      currency: updatedWallet.currency,
      status: updatedWallet.status,
      is_sandbox: updatedWallet.isSandbox,
      metadata: updatedWallet.metadata,
    });
  })
);

/**
 * POST /admin/wallets/:walletId/unfreeze
 * Unfreeze wallet with mandatory reason
 */
router.post(
  '/wallets/:walletId/unfreeze',
  requireAdminRole('support'),
  asyncHandler(async (req, res) => {
    const { walletId } = req.params;
    const { reason } = req.body;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const isSandbox = req.isSandbox || false;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required field: reason');
    }

    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, tenantId, isSandbox },
    });

    if (!wallet) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    }

    if (wallet.status !== 'frozen') {
      throw new AppError(409, ErrorCode.INVALID_OPERATION, 'Wallet is not frozen');
    }

    // Check for existing audit log with same idempotency key and isSandbox
    if (idempotencyKey) {
      const existingAudit = await prisma.auditLog.findFirst({
        where: {
          tenantId,
          action: 'wallet.unfrozen',
          isSandbox,
          changes: {
            path: ['idempotency_key'],
            equals: idempotencyKey,
          },
        },
      });

      if (existingAudit) {
        return res.status(200).json({
          wallet_id: walletId,
          external_user_id: wallet.externalUserId,
          label: wallet.label,
          balance: wallet.balance.toFixed(4),
          currency: wallet.currency,
          status: 'active',
          is_sandbox: wallet.isSandbox,
          metadata: wallet.metadata,
        });
      }
    }

    const updatedWallet = await unfreezeWallet(walletId, tenantId, wallet.isSandbox, reason, idempotencyKey, adminEmail, 'admin');

    res.json({
      wallet_id: updatedWallet.id,
      external_user_id: updatedWallet.externalUserId,
      label: updatedWallet.label,
      balance: updatedWallet.balance.toFixed(4),
      currency: updatedWallet.currency,
      status: updatedWallet.status,
      is_sandbox: updatedWallet.isSandbox,
      metadata: updatedWallet.metadata,
    });
  })
);

/**
 * POST /admin/tenants
 * Create new tenant with API keys (superadmin only)
 */
router.post(
  '/tenants',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const parsedBody = createTenantRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid tenant create payload');
    }

    const { name, contact_email, bootstrap_admin_email, config } = parsedBody.data;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = getValidatedIdempotencyKey(req.headers['idempotency-key']);
    const cacheKey = getTenantCreationCacheKey(adminEmail, idempotencyKey);

    // Generate API keys
    const liveKey = `wlt_live_${randomBytes(24).toString('hex')}`;
    const testKey = `wlt_test_${randomBytes(24).toString('hex')}`;

    // Hash keys with SHA-256
    const liveKeyHash = createHash('sha256').update(liveKey).digest('hex');
    const testKeyHash = createHash('sha256').update(testKey).digest('hex');

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${adminEmail}:${idempotencyKey}:tenant.created`}));`;

      const cachedResponse = tenantCreationCache.get(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }

      const replayAudit = await tx.auditLog.findFirst({
        where: {
          action: 'tenant.created',
          actorId: adminEmail,
          changes: {
            path: ['idempotency_key'],
            equals: idempotencyKey,
          },
        },
        orderBy: { timestamp: 'desc' },
      });

      if (replayAudit) {
        const replayChanges = (replayAudit.changes as Record<string, unknown> | null) ?? {};
        const replayResponse = replayChanges.response as CreatedTenantResponse | undefined;

        if (replayResponse) {
          if (
            !replayResponse.live_key.includes('[redacted]') &&
            !replayResponse.test_key.includes('[redacted]')
          ) {
            tenantCreationCache.set(cacheKey, replayResponse);
            return replayResponse;
          }

          throw new AppError(
            500,
            ErrorCode.INTERNAL_ERROR,
            'Raw API keys unavailable from audit logs; tenant creation cannot be safely recovered'
          );
        }
      }

      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name,
          contactEmail: contact_email,
          config: config as Prisma.InputJsonValue | undefined,
        },
      });

      // Create live API key
      await tx.apiKey.create({
        data: {
          tenantId: tenant.id,
          keyHash: liveKeyHash,
          prefix: liveKey.substring(0, 15),
          scope: 'admin',
          isSandbox: false,
        },
      });

      // Create test API key
      await tx.apiKey.create({
        data: {
          tenantId: tenant.id,
          keyHash: testKeyHash,
          prefix: testKey.substring(0, 15),
          scope: 'admin',
          isSandbox: true,
        },
      });

      let finalResponse: CreatedTenantResponse = {
        tenant_id: tenant.id,
        name: tenant.name,
        contact_email: tenant.contactEmail,
        live_key: liveKey,
        test_key: testKey,
        created_at: tenant.createdAt.toISOString(),
        bootstrap_invite_sent: false,
        bootstrap_admin_email: bootstrap_admin_email ?? null,
      };

      if (bootstrap_admin_email) {
        const invitedAdmin = await upsertPendingAdminInvite({
          tenantId: tenant.id,
          email: bootstrap_admin_email,
          role: 'tenant_admin',
        }, tx);

        await sendTenantAdminInvite({
          tenantId: tenant.id,
          email: invitedAdmin.email,
          role: 'tenant_admin',
        });

        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            entityType: 'admin_user',
            entityId: invitedAdmin.id,
            action: 'admin_user.invited',
            changes: {
              email: invitedAdmin.email,
              role: invitedAdmin.role,
              invited_at: invitedAdmin.invitedAt?.toISOString() ?? new Date().toISOString(),
              invited_by: adminEmail,
            },
            actorId: adminEmail,
            actorType: 'admin',
            isSandbox: false,
          },
        });

        finalResponse.bootstrap_invite_sent = true;
        finalResponse.bootstrap_admin_email = invitedAdmin.email;
      }

      tenantCreationCache.set(cacheKey, finalResponse);

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          entityType: 'tenant',
          entityId: tenant.id,
          action: 'tenant.created',
          changes: {
            name,
            contact_email,
            bootstrap_admin_email: bootstrap_admin_email ?? null,
            created_by: adminEmail,
            idempotency_key: idempotencyKey,
            live_key_prefix: liveKey.substring(0, 15),
            test_key_prefix: testKey.substring(0, 15),
            response: {
              ...finalResponse,
              live_key: redactApiKeyForAudit(liveKey),
              test_key: redactApiKeyForAudit(testKey),
            },
            response_status: 201,
          },
          actorId: adminEmail,
          actorType: 'admin',
          isSandbox: req.isSandbox || false,
        },
      });

      return finalResponse;
    });

    res.status(201).json(result);
  })
);

/**
 * GET /admin/audit
 * Query audit logs
 */
router.get(
  '/audit',
  requireAdminRole('support'),
  asyncHandler(async (req, res) => {
    const { wallet_id, actor, action, from, to, limit = 20, after } = req.query;
    const parsedTenantScope = tenantScopeSchema.safeParse(req.query);
    if (!parsedTenantScope.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid tenant scope');
    }

    const tenantId = await resolveAdminTenantScope(req, parsedTenantScope.data.tenantId);
    const isSandbox = req.isSandbox || false;

    const where: Prisma.AuditLogWhereInput = { tenantId, isSandbox };

    if (wallet_id) where.entityId = Array.isArray(wallet_id) ? wallet_id[0] : wallet_id;
    if (actor) where.actorId = Array.isArray(actor) ? actor[0] : actor;
    if (action) where.action = Array.isArray(action) ? action[0] : action;
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from as string);
      if (to) where.timestamp.lte = new Date(to as string);
    }

    const parsedLimit = Number(limit);
    const cappedLimit = (!Number.isFinite(parsedLimit) || parsedLimit <= 0) ? 10 : Math.min(Math.floor(parsedLimit), 100);

    // Parse cursor to extract timestamp and id for stable pagination
    if (after) {
      const cursorLog = await prisma.auditLog.findUnique({
        where: { id: after as string },
        select: { timestamp: true, id: true },
      });

      if (cursorLog) {
        where.OR = [
          { timestamp: { lt: cursorLog.timestamp } },
          {
            AND: [
              { timestamp: cursorLog.timestamp },
              { id: { lt: cursorLog.id } },
            ],
          },
        ];
      }
    }

    const auditLogs = await prisma.auditLog.findMany({
      where,
      take: cappedLimit,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    });

    const nextCursor = auditLogs.length === cappedLimit ? auditLogs[auditLogs.length - 1].id : null;

    res.json({
      data: auditLogs.map(log => ({
        id: log.id,
        tenant_id: log.tenantId,
        wallet_id: log.entityId,
        action: log.action,
        actor: log.actorType ? `${log.actorType}:${log.actorId}` : log.actorId,
        changes: log.changes,
        timestamp: log.timestamp,
      })),
      next_cursor: nextCursor,
    });
  })
);

/**
 * GET /admin/me
 * Get current admin user information
 */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({
      adminUser: {
        id: req.adminUser!.id,
        email: req.adminUser!.email,
        tenantId: req.adminUser!.tenantId,
        role: req.adminUser!.role,
      },
    });
  })
);

/**
 * GET /admin/account/api-keys
 * Get current tenant API key metadata for the active admin session
 */
router.get(
  '/account/api-keys',
  requireAdminRole('tenant_admin'),
  asyncHandler(async (req, res) => {
    const tenantId = req.adminUser!.tenantId;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!tenant) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Tenant not found');
    }

    const apiKeys = await prisma.apiKey.findMany({
      where: {
        tenantId,
        scope: 'admin',
        isActive: true,
      },
      orderBy: [{ isSandbox: 'asc' }, { createdAt: 'desc' }],
    });

    const latestKeyByEnvironment = new Map<boolean, (typeof apiKeys)[number]>();
    for (const apiKey of apiKeys) {
      if (!latestKeyByEnvironment.has(apiKey.isSandbox)) {
        latestKeyByEnvironment.set(apiKey.isSandbox, apiKey);
      }
    }

    res.json({
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      keys: [false, true]
        .map((isSandbox) => latestKeyByEnvironment.get(isSandbox))
        .filter((apiKey): apiKey is NonNullable<typeof apiKey> => Boolean(apiKey))
          .map((apiKey) => ({
          key_id: apiKey.id,
          scope: apiKey.isSandbox ? 'test' : 'live',
          prefix: apiKey.prefix,
          created_at: apiKey.createdAt.toISOString(),
          last_used_at: null,
          is_active: apiKey.isActive,
        })),
    });
  })
);

/**
 * POST /admin/account/api-keys/rotate
 * Rotate API keys for the current tenant
 */
router.post(
  '/account/api-keys/rotate',
  requireAdminRole('tenant_admin'),
  asyncHandler(async (req, res) => {
    const parsedBody = adminApiKeyRotationRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'scope must be "live" or "test"');
    }

    const { scope } = parsedBody.data;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;

    const result = await rotateAdminApiKeyForTenant({
      tenantId,
      scope,
      adminEmail,
      idempotencyKey: getValidatedIdempotencyKey(req.headers['idempotency-key']),
      auditAction: 'tenant.key_rotated',
      isAuditSandbox: req.isSandbox || false,
    });

    res.status(result.status).json({
      api_key: result.cachedResponse.api_key,
      scope,
      tenant_id: tenantId,
      created_at: result.cachedResponse.created_at,
    });
  })
);

/**
 * GET /admin/tenants
 * List all available tenants (superadmin only)
 */
router.get(
  '/tenants',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        contactEmail: true,
        createdAt: true,
        _count: {
          select: {
            wallets: true,
            adminUsers: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      data: tenants.map(t => ({
        tenant_id: t.id,
        name: t.name,
        contact_email: t.contactEmail,
        created_at: t.createdAt,
        wallet_count: t._count.wallets,
        admin_count: t._count.adminUsers,
      })),
    });
  })
);

/**
 * POST /admin/tenants/:tenantId/rotate-key
 * Regenerate API keys for a tenant (superadmin only)
 */
router.post(
  '/tenants/:tenantId/rotate-key',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { scope } = req.body;
    const adminEmail = req.adminUser!.email;

    if (!scope || !['live', 'test'].includes(scope)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'scope must be "live" or "test"');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Tenant not found');
    }

    const result = await rotateAdminApiKeyForTenant({
      tenantId,
      scope,
      adminEmail,
      idempotencyKey: getValidatedIdempotencyKey(req.headers['idempotency-key']),
      auditAction: 'tenant.key_rotated',
      isAuditSandbox: req.isSandbox || false,
    });

    res.status(result.status).json({
      api_key: result.cachedResponse.api_key,
      scope,
      tenant_id: tenantId,
      created_at: result.cachedResponse.created_at,
    });
  })
);

/**
 * POST /admin/tenants/:tenantId/invite-user
 * Invite a tenant admin for the target tenant
 */
router.post(
  '/tenants/:tenantId/invite-user',
  requireAdminRole('tenant_admin'),
  asyncHandler(async (req, res) => {
    const parsedBody = inviteTenantUserRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid invite payload');
    }

    const { tenantId } = req.params;
    const requester = req.adminUser!;
    const isSameTenantAdmin = requester.role === 'tenant_admin' && requester.tenantId === tenantId;

    if (requester.role !== 'superadmin' && !isSameTenantAdmin) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Tenant scope is limited to your assigned tenant');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Tenant not found');
    }

    const invitedAdmin = await upsertPendingAdminInvite({
      tenantId,
      email: parsedBody.data.email,
      role: parsedBody.data.role,
    });

    await sendTenantAdminInvite({
      tenantId,
      email: invitedAdmin.email,
      role: parsedBody.data.role,
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        entityType: 'admin_user',
        entityId: invitedAdmin.id,
        action: 'admin_user.invited',
        changes: {
          email: invitedAdmin.email,
          role: invitedAdmin.role,
          invited_at: invitedAdmin.invitedAt?.toISOString() ?? new Date().toISOString(),
          invited_by: requester.email,
        },
        actorId: requester.email,
        actorType: 'admin',
        isSandbox: false,
      },
    });

    const response: InviteTenantUserResponse = {
      tenant_id: tenantId,
      email: invitedAdmin.email,
      role: parsedBody.data.role,
      invite_sent: true,
      invited_at: invitedAdmin.invitedAt?.toISOString() ?? new Date().toISOString(),
    };

    res.status(201).json(response);
  })
);

/**
 * GET /admin/tenants/:tenantId/usage
 * Get API usage stats for a tenant (superadmin only)
 */
router.get(
  '/tenants/:tenantId/usage',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const hours = parseInt(req.query.hours as string);

    if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Hours must be a finite integer between 1 and 168');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Tenant not found');
    }

    // Get hourly request counts from audit logs
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - hours);

    // Use raw query for hourly bucketing with date_trunc
    const usage = await prisma.$queryRaw`
      SELECT date_trunc('hour', timestamp) as hour, COUNT(*) as count
      FROM "AuditLog"
      WHERE "tenantId" = ${tenantId}
        AND timestamp >= ${startTime}
        AND action LIKE 'api.%'
      GROUP BY date_trunc('hour', timestamp)
      ORDER BY hour DESC
    ` as Array<{ hour: Date; count: bigint }>;

    // Group by hour
    const hourlyUsage = new Map<string, number>();
    for (let i = 0; i < hours; i++) {
      const hour = new Date();
      hour.setHours(hour.getHours() - i);
      const hourKey = hour.toISOString().substring(0, 13) + ':00:00.000Z';
      hourlyUsage.set(hourKey, 0);
    }

    usage.forEach(item => {
      const hourKey = item.hour.toISOString().substring(0, 13) + ':00:00.000Z';
      hourlyUsage.set(hourKey, (hourlyUsage.get(hourKey) || 0) + Number(item.count));
    });

    res.json({
      tenant_id: tenantId,
      hours,
      usage: Array.from(hourlyUsage.entries()).map(([hour, count]) => ({
        hour,
        requests: count,
      })).reverse(),
    });
  })
);

/**
 * POST /admin/tenants/:tenantId/revoke-key
 * Revoke API keys for a tenant (superadmin only)
 */
router.post(
  '/tenants/:tenantId/revoke-key',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { scope } = req.body;
    const adminEmail = req.adminUser!.email;
    const idempotencyKeyHeader = req.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(idempotencyKeyHeader) ? idempotencyKeyHeader[0] : idempotencyKeyHeader;
    const idempotencyWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (!scope || !['live', 'test'].includes(scope)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'scope must be "live" or "test"');
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Idempotency-Key header is required');
    }

    if (idempotencyKey.length > 255) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Idempotency-Key must be at most 255 characters');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Tenant not found');
    }

    const isSandbox = scope === 'test';

    const existingAudit = await prisma.auditLog.findFirst({
      where: {
        tenantId,
        entityType: 'tenant',
        entityId: tenantId,
        action: 'tenant.key_revoked',
        timestamp: {
          gte: idempotencyWindowStart,
        },
        changes: {
          path: ['idempotency_key'],
          equals: idempotencyKey,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    if (existingAudit) {
      const changes = (existingAudit.changes as Record<string, unknown> | null) ?? {};
      const cachedResponse = changes.response as
        | { tenant_id: string; scope: string; keys_deactivated: number }
        | undefined;

      if (cachedResponse) {
        return res.status((changes.response_status as number) || 200).json(cachedResponse);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${idempotencyKey}:tenant.key_revoked`}));`;

      const cachedAudit = await tx.auditLog.findFirst({
        where: {
          tenantId,
          entityType: 'tenant',
          entityId: tenantId,
          action: 'tenant.key_revoked',
          timestamp: {
            gte: idempotencyWindowStart,
          },
          changes: {
            path: ['idempotency_key'],
            equals: idempotencyKey,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      if (cachedAudit) {
        const cachedChanges = (cachedAudit.changes as Record<string, unknown> | null) ?? {};
        const cachedResponse = cachedChanges.response as
          | { tenant_id: string; scope: string; keys_deactivated: number }
          | undefined;

        if (cachedResponse) {
          return {
            deactivatedKeys: { count: cachedResponse.keys_deactivated },
            cachedResponse,
            status: (cachedChanges.response_status as number) || 200,
          };
        }
      }

      // Deactivate all keys for this scope
      const deactivatedKeys = await tx.apiKey.updateMany({
        where: {
          tenantId,
          scope: 'admin',
          isSandbox,
        },
        data: {
          isActive: false,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'tenant',
          entityId: tenantId,
          action: 'tenant.key_revoked',
          changes: {
            scope,
            keys_deactivated: deactivatedKeys.count,
            revoked_by: adminEmail,
            idempotency_key: idempotencyKey,
            response: {
              tenant_id: tenantId,
              scope,
              keys_deactivated: deactivatedKeys.count,
            },
            response_status: 200,
          },
          actorId: adminEmail,
          actorType: 'admin',
          isSandbox: req.isSandbox || false,
        },
      });

      return {
        deactivatedKeys,
        cachedResponse: {
          tenant_id: tenantId,
          scope,
          keys_deactivated: deactivatedKeys.count,
        },
        status: 200,
      };
    });

    res.status(result.status).json(result.cachedResponse);
  })
);

// ==================== AUDIT LOG ENHANCEMENTS (SUPERADMIN ONLY) ====================

/**
 * GET /admin/audit/admin-activity
 * Filter admin actions across all tenants (superadmin only)
 */
router.get(
  '/audit/admin-activity',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const { adminEmail, actionType, limit = 50, after } = req.query;

    const where: Prisma.AuditLogWhereInput = {
      actorType: 'admin',
    };

    if (adminEmail) {
      where.actorId = Array.isArray(adminEmail) ? adminEmail[0] : adminEmail;
    }

    if (actionType) {
      where.action = Array.isArray(actionType) ? actionType[0] : actionType;
    }

    const parsedLimit = Number(limit);
    const cappedLimit = (!Number.isFinite(parsedLimit) || parsedLimit <= 0) ? 10 : Math.min(Math.floor(parsedLimit), 100);

    // Parse cursor for pagination
    if (after) {
      const cursorLog = await prisma.auditLog.findUnique({
        where: { id: after as string },
        select: { timestamp: true, id: true },
      });

      if (cursorLog) {
        where.OR = [
          { timestamp: { lt: cursorLog.timestamp } },
          {
            AND: [
              { timestamp: cursorLog.timestamp },
              { id: { lt: cursorLog.id } },
            ],
          },
        ];
      }
    }

    const auditLogs = await prisma.auditLog.findMany({
      where,
      take: cappedLimit,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const nextCursor = auditLogs.length === cappedLimit ? auditLogs[auditLogs.length - 1].id : null;

    res.json({
      data: auditLogs.map(log => ({
        id: log.id,
        tenant: {
          tenant_id: log.tenantId,
          name: log.tenant?.name || 'Unknown',
        },
        entity_type: log.entityType,
        entity_id: log.entityId,
        action: log.action,
        actor: log.actorId,
        changes: log.changes,
        timestamp: log.timestamp,
        is_sandbox: log.isSandbox,
      })),
      next_cursor: nextCursor,
    });
  })
);

/**
 * GET /admin/system/errors
 * Recent system errors (superadmin only)
 */
router.get(
  '/system/errors',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const { limit = 50 } = req.query;

    const parsedLimit = Number(limit);
    const cappedLimit = (!Number.isFinite(parsedLimit) || parsedLimit <= 0) ? 10 : Math.min(Math.floor(parsedLimit), 100);

    // Since we don't have a dedicated error logs table, we'll simulate with recent audit logs
    // In a real implementation, this would query a proper error logging system
    const errors = await prisma.auditLog.findMany({
      where: {
        action: {
          in: ['error.http.500', 'error.http.400', 'error.validation', 'error.auth'],
        },
      },
      take: cappedLimit,
      orderBy: { timestamp: 'desc' },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.json({
      data: errors.map(error => ({
        id: error.id,
        timestamp: error.timestamp,
        tenant: {
          tenant_id: error.tenantId,
          name: error.tenant?.name || 'Unknown',
        },
        error_type: error.action,
        message: (error.changes as any)?.message || 'Unknown error',
        endpoint: (error.changes as any)?.endpoint || 'Unknown',
        request_id: (error.changes as any)?.request_id,
        actor: error.actorId,
        is_sandbox: error.isSandbox,
      })),
      total_count: errors.length,
    });
  })
);

// ==================== GLOBAL SEARCH ENDPOINTS (SUPERADMIN ONLY) ====================

/**
 * GET /admin/search/wallets
 * Cross-tenant wallet search (superadmin only)
 */
router.get(
  '/search/wallets',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const parsedQuery = walletSearchSchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Search query "q" is required');
    }

    const { q, tenantId: requestedTenantId, includeCrossTenant } = parsedQuery.data;
    const isSuperadmin = req.adminUser!.role === 'superadmin';
    
    // Validate: if includeCrossTenant is requested, requestedTenantId must be provided
    if (includeCrossTenant && !requestedTenantId) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'tenantId is required when includeCrossTenant is true');
    }
    
    const tenantBoundary = (isSuperadmin && includeCrossTenant && requestedTenantId)
      ? requestedTenantId
      : req.adminUser!.tenantId;

    const wallets = await prisma.wallet.findMany({
      where: {
        tenantId: tenantBoundary,
        isSandbox: req.isSandbox,
        OR: [
          { id: { contains: q, mode: 'insensitive' } },
          { externalUserId: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      take: 50,
      orderBy: { id: 'desc' },
    });

    res.json({
      query: q,
      results: wallets.map(w => ({
        wallet_id: w.id,
        external_user_id: w.externalUserId,
        label: w.label,
        balance: w.balance.toFixed(4),
        currency: w.currency,
        status: w.status,
        is_sandbox: w.isSandbox,
        tenant: {
          tenant_id: w.tenant.id,
          name: w.tenant.name,
        },
        created_at: w.createdAt,
      })),
    });
  })
);

/**
 * GET /admin/search/transactions
 * Transaction tracer (superadmin only)
 */
router.get(
  '/search/transactions',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const parsedQuery = transactionSearchSchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'One of transactionId, requestId, or idempotencyKey is required');
    }
    const { transactionId, requestId, idempotencyKey, tenantId: requestedTenantId, includeCrossTenant } = parsedQuery.data;
    const isSuperadmin = req.adminUser!.role === 'superadmin';
    
    // Validate: if includeCrossTenant is requested, requestedTenantId must be provided
    if (includeCrossTenant && !requestedTenantId) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'tenantId is required when includeCrossTenant is true');
    }
    
    const tenantBoundary = (isSuperadmin && includeCrossTenant && requestedTenantId)
      ? requestedTenantId
      : req.adminUser!.tenantId;

    const where: Prisma.TransactionWhereInput = { 
      tenantId: tenantBoundary,
      wallet: {
        isSandbox: req.isSandbox,
      },
    };

    if (transactionId) {
      where.id = Array.isArray(transactionId) ? transactionId[0] : transactionId;
    }
    if (requestId) {
      where.referenceId = Array.isArray(requestId) ? requestId[0] : requestId;
    }
    if (idempotencyKey) {
      where.idempotencyKey = Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey;
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        wallet: {
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    // Fetch all audit logs in a single query to eliminate N+1 pattern
    const transactionIds = transactions.map(tx => tx.id);
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        isSandbox: req.isSandbox,
        entityType: 'transaction',
        entityId: { in: transactionIds },
      },
      orderBy: { timestamp: 'desc' },
    });

    // Group audit logs by transaction ID
    const auditLogsByTxId = new Map<string, typeof auditLogs>();
    for (const log of auditLogs) {
      if (!auditLogsByTxId.has(log.entityId)) {
        auditLogsByTxId.set(log.entityId, []);
      }
      auditLogsByTxId.get(log.entityId)!.push(log);
    }

    const results = transactions.map(tx => {
      const auditTrail = (auditLogsByTxId.get(tx.id) || []).slice(0, 10);

      return {
        transaction_id: tx.id,
        type: tx.type,
        amount: tx.amount.toFixed(4),
        currency: tx.currency,
        balance_before: tx.balanceBefore.toFixed(4),
        balance_after: tx.balanceAfter.toFixed(4),
        reference_id: tx.referenceId,
        idempotency_key: tx.idempotencyKey,
        metadata: tx.metadata,
        created_at: tx.createdAt,
        wallet: {
          wallet_id: tx.wallet.id,
          external_user_id: tx.wallet.externalUserId,
          tenant: {
            tenant_id: tx.wallet.tenant.id,
            name: tx.wallet.tenant.name,
          },
        },
        audit_trail: auditTrail.map(log => ({
          id: log.id,
          action: log.action,
          actor: log.actorType ? `${log.actorType}:${log.actorId}` : log.actorId,
          changes: log.changes,
          timestamp: log.timestamp,
        })),
      };
    });

    res.json({
      query: { transactionId, requestId, idempotencyKey },
      results,
    });
  })
);

/**
 * GET /admin/system/balance
 * Total system value across all tenants (superadmin only)
 */
router.get(
  '/system/balance',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const balances = await prisma.wallet.groupBy({
      by: ['currency', 'isSandbox'],
      _sum: {
        balance: true,
      },
      where: {
        status: 'active',
      },
    });

    let liveTotal = new Decimal(0);
    let sandboxTotal = new Decimal(0);
    const currencyBreakdown: Record<string, { live: string; sandbox: string }> = {};

    balances.forEach((balance) => {
      const currency = balance.currency;
      const amount = balance._sum.balance || new Decimal(0);
      
      if (!currencyBreakdown[currency]) {
        currencyBreakdown[currency] = { live: '0', sandbox: '0' };
      }

      if (balance.isSandbox) {
        sandboxTotal = sandboxTotal.add(amount);
        currencyBreakdown[currency].sandbox = amount.toFixed(4);
      } else {
        liveTotal = liveTotal.add(amount);
        currencyBreakdown[currency].live = amount.toFixed(4);
      }
    });

    res.json({
      total_live: liveTotal.toFixed(4),
      total_sandbox: sandboxTotal.toFixed(4),
      currency_breakdown: currencyBreakdown,
      calculated_at: new Date().toISOString(),
    });
  })
);

export default router;
