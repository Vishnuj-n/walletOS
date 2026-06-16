import { Router } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { AdminRole, Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { adminAuthMiddleware, requireAdminRole } from '../middleware/adminAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { prisma } from '../lib/prisma';
import { generateAdminUserPublicId, generateTransactionPublicId } from '../lib/publicId';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { freezeWallet, unfreezeWallet, createWallet, updateWallet, closeWallet, getWalletById } from '../services/wallet.service';
import { sendInviteEmail } from '../services/mail.service';
import { dispatchWebhookDelivery } from '../services/webhook.service';
import { z } from 'zod';
import dns from 'dns';

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

const unifiedSearchSchema = z.object({
  q: z.string().max(255).optional(),
});

const tenantEmployeeSearchSchema = z.object({
  q: z.string().trim().max(255).optional(),
});

const tenantScopeSchema = z.object({
  tenantId: z.string().min(1).max(255).optional(),
});

const adminApiKeyRotationRequestSchema = z.object({
  scope: z.enum(['live', 'test']),
  keyScope: z.enum(['read_only', 'read_write', 'admin']).optional().default('admin'),
});

type AdminApiKeyRotationResponse = {
  api_key: string;
  scope: 'live' | 'test';
  tenant_id: string;
  created_at: string;
};

const adminApiKeyRotationResponseCache = new Map<
  string,
  { response: AdminApiKeyRotationResponse; expiresAt: number }
>();
const ADMIN_API_KEY_ROTATION_IDEMPOTENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_API_KEY_ROTATION_CACHE_TTL_MS = ADMIN_API_KEY_ROTATION_IDEMPOTENCY_WINDOW_MS;

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

function getQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const [firstValue] = value;
    return typeof firstValue === 'string' ? firstValue : undefined;
  }

  return undefined;
}

function parseDateFilter(value: string, parameterName: 'from' | 'to'): Date {
  const normalized = value.trim();
  if (!normalized) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, `${parameterName} must not be empty`);
  }

  const asEpoch = /^\d+$/.test(normalized) ? Number(normalized) : NaN;
  const parsedDate = Number.isNaN(asEpoch) ? new Date(normalized) : new Date(asEpoch);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, `Invalid ${parameterName} timestamp`);
  }

  return parsedDate;
}

function getAdminApiKeyRotationCacheKey(tenantId: string, scope: 'live' | 'test', keyScope: string, auditAction: string, idempotencyKey: string): string {
  return `${tenantId}:${scope}:${keyScope}:${auditAction}:${idempotencyKey}`;
}

function getCachedAdminApiKeyRotationResponse(cacheKey: string): AdminApiKeyRotationResponse | undefined {
  const cachedEntry = adminApiKeyRotationResponseCache.get(cacheKey);

  if (!cachedEntry) {
    return undefined;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    adminApiKeyRotationResponseCache.delete(cacheKey);
    return undefined;
  }

  return cachedEntry.response;
}

function cacheAdminApiKeyRotationResponse(cacheKey: string, response: AdminApiKeyRotationResponse): void {
  adminApiKeyRotationResponseCache.set(cacheKey, {
    response,
    expiresAt: Date.now() + ADMIN_API_KEY_ROTATION_CACHE_TTL_MS,
  });
}

function redactApiKeyForAudit(apiKey: string): string {
  return `${apiKey.slice(0, 15)}...[redacted]`;
}

async function resolveEntityIdFromFilter(filter: string): Promise<string> {
  const trimmed = filter.trim();
  if (trimmed.startsWith('wal_')) {
    const wallet = await prisma.wallet.findUnique({
      where: { publicId: trimmed },
      select: { id: true },
    });
    return wallet?.id ?? 'non-existent-wallet-id';
  }
  if (trimmed.startsWith('txn_')) {
    const txn = await prisma.transaction.findUnique({
      where: { publicId: trimmed },
      select: { id: true },
    });
    return txn?.id ?? 'non-existent-transaction-id';
  }
  if (trimmed.startsWith('req_')) {
    const txn = await prisma.transaction.findFirst({
      where: { referenceId: trimmed },
      select: { id: true },
    });
    return txn?.id ?? 'non-existent-transaction-id';
  }
  if (trimmed.startsWith('usr_')) {
    const user = await prisma.adminUser.findUnique({
      where: { publicId: trimmed },
      select: { id: true },
    });
    return user?.id ?? 'non-existent-user-id';
  }
  return trimmed;
}

async function resolveActorIdFromFilter(filter: string): Promise<string> {
  const trimmed = filter.trim();
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }
  if (trimmed.startsWith('usr_')) {
    const user = await prisma.adminUser.findUnique({
      where: { publicId: trimmed },
      select: { email: true },
    });
    return user?.email ?? 'non-existent-actor-email';
  }
  return trimmed;
}

async function resolveAdminTenantScope(
  req: Express.Request,
  requestedTenantId?: string,
  options?: { allowSuperadminOverride?: boolean; allowNoScope?: boolean }
): Promise<string | null> {
  const sessionTenantId = req.adminUser!.tenantId;
  const isSuperadmin = req.adminUser!.role === 'superadmin';

  // Superadmin with no explicit tenantId requested: allow cross-tenant (no scope)
  if (isSuperadmin && !requestedTenantId && options?.allowNoScope) {
    return null;
  }

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

async function resolveWalletAndTenantScope(
  req: any,
  walletId: string,
  isSandbox: boolean
) {
  const sessionTenantId = req.adminUser!.tenantId;
  const isSuperadmin = req.adminUser!.role === 'superadmin';

  const wallet = await prisma.wallet.findFirst({
    where: {
      OR: [
        { id: walletId },
        { publicId: walletId },
      ],
      isSandbox,
      ...(isSuperadmin ? {} : { tenantId: sessionTenantId }),
    },
  });

  if (!wallet) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
  }

  return {
    wallet,
    resolvedTenantId: wallet.tenantId,
  };
}


async function getAdminEmailsByRole(
  role: 'support' | 'finance' | 'tenant_admin' | 'superadmin'
): Promise<string[]> {
  const admins = await prisma.adminUser.findMany({
    where: { role },
    select: { email: true },
  });

  return admins.map((admin) => admin.email);
}

async function rotateAdminApiKeyForTenant(params: {
  tenantId: string;
  scope: 'live' | 'test';
  keyScope?: 'read_only' | 'read_write' | 'admin';
  adminEmail: string;
  adminRole: string;
  idempotencyKey: string;
  auditAction: 'tenant.key_rotated';
  isAuditSandbox: boolean;
}): Promise<{
  apiKey: { createdAt: Date };
  cachedResponse: AdminApiKeyRotationResponse;
  status: number;
}> {
  const { tenantId, scope, adminEmail, adminRole, idempotencyKey, auditAction, isAuditSandbox, keyScope = 'admin' } = params;
  const idempotencyWindowStart = new Date(Date.now() - ADMIN_API_KEY_ROTATION_IDEMPOTENCY_WINDOW_MS);
  const isSandbox = scope === 'test';
  const cacheKey = getAdminApiKeyRotationCacheKey(tenantId, scope, keyScope, auditAction, idempotencyKey);

  const cachedResponse = getCachedAdminApiKeyRotationResponse(cacheKey);
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
          cacheAdminApiKeyRotationResponse(cacheKey, cachedResponse);
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
        isSandbox,
        isActive: true,
        scope: keyScope,
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
        scope: keyScope,
        isSandbox,
        name: isSandbox ? 'Default Sandbox Key' : 'Default Live Key',
      },
    });

    const response: AdminApiKeyRotationResponse = {
      api_key: newKey,
      scope,
      tenant_id: tenantId,
      created_at: apiKey.createdAt.toISOString(),
    };

    cacheAdminApiKeyRotationResponse(cacheKey, response);

    await tx.auditLog.create({
      data: {
        tenantId,
        entityType: 'tenant',
        entityId: tenantId,
        action: auditAction,
        changes: {
          scope,
          key_scope: keyScope,
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
        actorRole: adminRole,
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
          actorRole: req.adminUser!.role,
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
          actorRole: req.adminUser!.role,
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
    const isSandbox = req.isSandbox || false;

    const { wallet: prevWallet, resolvedTenantId: tenantId } = await resolveWalletAndTenantScope(req, walletId, isSandbox);

    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;

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


    const wallet = await updateWallet(
      prevWallet.id,
      tenantId,
      isSandbox,
      { label, metadata }
    );

    // Create new audit log entry (append-only)
    await prisma.auditLog.create({
      data: {
        tenantId: tenantId as string,
        entityType: 'wallet',
        entityId: prevWallet.id,
        action: 'wallet.updated',
        actorId: adminEmail,
        actorType: 'admin',
        actorRole: req.adminUser!.role,
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
    const isSandbox = req.isSandbox || false;

    const { wallet: resolvedWallet, resolvedTenantId: tenantId } = await resolveWalletAndTenantScope(req, walletId, isSandbox);

    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;

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


    const wallet = await closeWallet(resolvedWallet.id, tenantId, isSandbox, reason);

    // Update audit log with admin metadata while preserving service-generated data
    const existingAudit = await prisma.auditLog.findFirst({
      where: {
        tenantId,
        entityId: resolvedWallet.id,
        action: 'wallet.closed',
      },
    });

    if (existingAudit) {
      await prisma.auditLog.updateMany({
        where: {
          tenantId,
          entityId: resolvedWallet.id,
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
    const { status, currency, search, public_id, external_user_id, label, limit = 20, after } = req.query;
    const parsedTenantScope = tenantScopeSchema.safeParse(req.query);
    if (!parsedTenantScope.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid tenant scope');
    }

    const tenantId = await resolveAdminTenantScope(req, parsedTenantScope.data.tenantId, {
      allowSuperadminOverride: true,
      allowNoScope: true,
    });
    const isSandbox = req.isSandbox || false;

    const where: Prisma.WalletWhereInput = { ...(tenantId ? { tenantId } : {}), isSandbox };

    if (status) {
      const allowedStatuses = ['active', 'frozen', 'pending_closure', 'closed'];
      if (allowedStatuses.includes(status as string)) {
        where.status = status as any;
      }
    }
    if (currency) where.currency = Array.isArray(currency) ? currency[0] : currency;

    if (public_id) {
      where.publicId = getQueryString(public_id);
    }
    if (external_user_id) {
      where.externalUserId = getQueryString(external_user_id);
    }
    if (label) {
      where.label = { contains: getQueryString(label), mode: 'insensitive' };
    }

    if (search) {
      const searchStr = getQueryString(search);
      if (searchStr) {
        if (searchStr.startsWith('wal_')) {
          where.publicId = searchStr;
        } else if (searchStr.startsWith('usr_') || searchStr.startsWith('user_')) {
          where.externalUserId = searchStr;
        } else if (searchStr.startsWith('c') && searchStr.length === 25) {
          where.id = searchStr;
        } else {
          where.OR = [
            { externalUserId: { contains: searchStr, mode: 'insensitive' } },
            { label: { contains: searchStr, mode: 'insensitive' } },
            { publicId: { contains: searchStr, mode: 'insensitive' } },
          ];
        }
      }
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
        public_id: w.publicId,
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
    const isSandbox = req.isSandbox || false;

    const { wallet } = await resolveWalletAndTenantScope(req, walletId, isSandbox);


    res.json({
      wallet_id: wallet.id,
      public_id: wallet.publicId,
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
    const isSandbox = req.isSandbox || false;


    const { wallet, resolvedTenantId: tenantId } = await resolveWalletAndTenantScope(req, wallet_id, isSandbox);

    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!wallet_id || !amount || !description || !reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required fields: wallet_id, amount, description, reason');
    }

    // Validate amount is a positive finite number using Decimal
    const decimalAmount = new Decimal(amount);
    if (!decimalAmount.isFinite() || decimalAmount.lte(0)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Amount must be a positive number');
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
          publicId: generateTransactionPublicId(),
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
          actorRole: req.adminUser!.role,
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
    const isSandbox = req.isSandbox || false;

    const { wallet, resolvedTenantId: tenantId } = await resolveWalletAndTenantScope(req, wallet_id, isSandbox);

    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!wallet_id || !amount || !description || !reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required fields: wallet_id, amount, description, reason');
    }

    // Validate amount is a positive finite number using Decimal
    const decimalAmount = new Decimal(amount);
    if (!decimalAmount.isFinite() || decimalAmount.lte(0)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Amount must be a positive number');
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
          publicId: generateTransactionPublicId(),
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
          actorRole: req.adminUser!.role,
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
          publicId: generateTransactionPublicId(),
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
          actorRole: req.adminUser!.role,
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
    const isSandbox = req.isSandbox || false;

    const { wallet, resolvedTenantId: tenantId } = await resolveWalletAndTenantScope(req, walletId, isSandbox);

    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required field: reason');
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
          wallet_id: wallet.id,
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

    const updatedWallet = await freezeWallet(wallet.id, tenantId, isSandbox, reason, idempotencyKey, adminEmail, 'admin', req.adminUser!.role);

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
    const isSandbox = req.isSandbox || false;

    const { wallet, resolvedTenantId: tenantId } = await resolveWalletAndTenantScope(req, walletId, isSandbox);

    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!reason) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required field: reason');
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
          wallet_id: wallet.id,
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

    const updatedWallet = await unfreezeWallet(wallet.id, tenantId, wallet.isSandbox, reason, idempotencyKey, adminEmail, 'admin', req.adminUser!.role);

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
    const { name, contact_email, config } = req.body;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!name) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing required field: name');
    }

    // Check for existing audit log with same idempotency key scoped to admin user
    if (idempotencyKey) {
      const existingAudit = await prisma.auditLog.findFirst({
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

      if (existingAudit) {
        const existingTenant = await prisma.tenant.findUnique({
          where: { id: existingAudit.entityId },
        });

        if (existingTenant) {
          return res.status(200).json({
            tenant_id: existingTenant.id,
            name: existingTenant.name,
            contact_email: existingTenant.contactEmail,
            created_at: existingTenant.createdAt,
            idempotent: true,
          });
        }
      }
    }

    // Generate API keys
    const liveKey = `wlt_live_${randomBytes(24).toString('hex')}`;
    const testKey = `wlt_test_${randomBytes(24).toString('hex')}`;

    // Hash keys with SHA-256
    const liveKeyHash = createHash('sha256').update(liveKey).digest('hex');
    const testKeyHash = createHash('sha256').update(testKey).digest('hex');
    const inviteTargetEmail = typeof contact_email === 'string' ? contact_email.trim() : '';
    const rawInviteToken = inviteTargetEmail ? randomBytes(32).toString('hex') : null;
    const inviteTokenHash = rawInviteToken
      ? createHash('sha256').update(rawInviteToken).digest('hex')
      : null;
    const inviteExpiresAt = rawInviteToken
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : null;

    const result = await prisma.$transaction(async (tx) => {
      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name,
          contactEmail: contact_email,
          config,
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
          name: 'Default Live Key',
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
          name: 'Default Test Key',
        },
      });

      if (inviteTargetEmail && inviteTokenHash && inviteExpiresAt) {
        await tx.adminUser.create({
          data: {
            publicId: generateAdminUserPublicId(),
            tenantId: tenant.id,
            email: inviteTargetEmail,
            role: 'tenant_admin',
            isActive: false,
            passwordHash: null,
            invitedAt: new Date(),
          },
        });

        await tx.pendingVerification.create({
          data: {
            tenantId: tenant.id,
            email: inviteTargetEmail,
            tokenHash: inviteTokenHash,
            expiresAt: inviteExpiresAt,
          },
        });
      }

      // Create audit log
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          entityType: 'tenant',
          entityId: tenant.id,
          action: 'tenant.created',
          changes: {
            name,
            contact_email,
            created_by: adminEmail,
            idempotency_key: idempotencyKey,
          },
          actorId: adminEmail,
          actorType: 'admin',
          actorRole: req.adminUser!.role,
          isSandbox: req.isSandbox || false,
        },
      });

      return tenant;
    });

    if (inviteTargetEmail && rawInviteToken) {
      await sendInviteEmail(result.id, inviteTargetEmail, rawInviteToken);
    }

    res.status(201).json({
      tenant_id: result.id,
      name: result.name,
      contact_email: result.contactEmail,
      live_key: liveKey,
      test_key: testKey,
      bootstrap_invite_created: Boolean(rawInviteToken),
      created_at: result.createdAt,
    });
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

    const tenantId = await resolveAdminTenantScope(req, parsedTenantScope.data.tenantId, {
      allowSuperadminOverride: true,
      allowNoScope: true,
    });
    const isSandbox = req.isSandbox || false;

    // Scope by tenant when one is known; superadmins with no explicit tenant see all.
    // Exclude superadmin-role actions only when doing a global cross-tenant view.
    const where: Prisma.AuditLogWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      isSandbox,
      ...(tenantId ? {} : { NOT: { actorRole: 'superadmin' } }),
    };

    const walletIdFilter = getQueryString(wallet_id);
    const actorFilter = getQueryString(actor);
    const actionFilter = getQueryString(action);
    const fromFilter = getQueryString(from);
    const toFilter = getQueryString(to);

    if (walletIdFilter) {
      where.entityId = await resolveEntityIdFromFilter(walletIdFilter);
    }
    if (actorFilter) {
      where.actorId = await resolveActorIdFromFilter(actorFilter);
    }
    if (actionFilter) {
      where.action = { contains: actionFilter, mode: 'insensitive' };
    }
    if (fromFilter || toFilter) {
      where.timestamp = {};
      if (fromFilter) where.timestamp.gte = parseDateFilter(fromFilter, 'from');
      if (toFilter) where.timestamp.lte = parseDateFilter(toFilter, 'to');
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

    // Resolve wallet public IDs for the log list
    const walletIds = Array.from(new Set(
      auditLogs.filter(log => log.entityType === 'Wallet').map(log => log.entityId)
    ));
    const wallets = await prisma.wallet.findMany({
      where: { id: { in: walletIds } },
      select: { id: true, publicId: true },
    });
    const walletPublicIdMap = new Map(wallets.map(w => [w.id, w.publicId]));

    res.json({
      data: auditLogs.map(log => ({
        id: log.id,
        tenant_id: log.tenantId,
        wallet_id: log.entityId,
        wallet_public_id: log.entityType === 'Wallet' ? walletPublicIdMap.get(log.entityId) || null : null,
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

const adminUserInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['support', 'finance', 'tenant_admin', 'superadmin']),
});

/**
 * POST /admin/invite-user
 * Invite a new admin user to the tenant
 */
const inviteUserHandler = asyncHandler(async (req, res) => {
  const parsedPayload = adminUserInviteSchema.safeParse(req.body);
  if (!parsedPayload.success) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid invitation payload');
  }

  const idempotencyKey = getValidatedIdempotencyKey(req.headers['idempotency-key']);
  const { email, role } = parsedPayload.data;
  const tenantId = req.adminUser!.tenantId;
  const isSuperadmin = req.adminUser!.role === 'superadmin';

  if (role === 'superadmin' && !isSuperadmin) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Only superadmins can invite other superadmins');
  }

  // Only superadmins may create `tenant_admin` users. Tenant admins cannot
  // elevate others to tenant_admin to prevent privilege escalation.
  if (role === 'tenant_admin' && !isSuperadmin) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Only superadmins can invite tenant admins');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Tenant not found');
  }

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const inviteLink = `${process.env.ADMIN_CLAIM_REDIRECT_URL}/claim?token=${rawToken}`;
  const redactedInviteLink = inviteLink.replace(/([?&]token=)[^&]+/, '$1[REDACTED]');

  const adminUser = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.adminUser.create({
      data: {
        publicId: generateAdminUserPublicId(),
        tenantId,
        email,
        role,
        isActive: false,
        passwordHash: null,
        invitedAt: new Date(),
      },
    });

    await tx.pendingVerification.create({
      data: {
        tenantId,
        email,
        tokenHash,
        expiresAt,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        entityType: 'admin_user',
        entityId: createdUser.id,
        action: 'admin_user.invited',
        actorId: req.adminUser!.email,
        actorType: 'admin',
        actorRole: req.adminUser!.role,
        isSandbox: req.isSandbox || false,
        changes: {
          invited_email: email,
          invited_role: role,
          invited_by: req.adminUser!.email,
          idempotency_key: idempotencyKey,
          token_hash: tokenHash,
          response_status: 201,
          response: {
            message: 'Invitation created successfully',
            invite_link: redactedInviteLink,
            admin_user: {
              id: createdUser.publicId,
              email: createdUser.email,
              role: createdUser.role,
              is_active: createdUser.isActive,
            },
          },
        },
      },
    });

    return createdUser;
  });

  await sendInviteEmail(tenantId, email, rawToken);

  res.status(201).json({
    message: 'Invitation created successfully',
    invite_link: redactedInviteLink,
    admin_user: {
      id: adminUser.publicId,
      email: adminUser.email,
      role: adminUser.role,
      is_active: adminUser.isActive,
    },
  });
});

router.post(
  '/invite-user',
  requireAdminRole('tenant_admin'),
  inviteUserHandler
);

router.post(
  '/users/invite',
  requireAdminRole('tenant_admin'),
  inviteUserHandler
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
        isActive: true,
      },
      orderBy: [{ isSandbox: 'asc' }, { createdAt: 'desc' }],
    });

    res.json({
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      keys: apiKeys.map((apiKey) => ({
        key_id: apiKey.id,
        scope: apiKey.isSandbox ? 'test' : 'live',
        keyScope: apiKey.scope,
        prefix: apiKey.prefix,
        created_at: apiKey.createdAt.toISOString(),
        last_used_at: null,
        is_active: apiKey.isActive,
        name: apiKey.name ?? (apiKey.isSandbox ? 'Default Sandbox Key' : 'Default Live Key'),
      })),
    });
  })
);

/**
 * GET /admin/account/users
 * List current tenant employees with optional tenant-scoped search
 */
router.get(
  '/account/users',
  requireAdminRole('tenant_admin'),
  asyncHandler(async (req, res) => {
    const parsedQuery = tenantEmployeeSearchSchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid employee search query');
    }

    const tenantId = req.adminUser!.tenantId;
    const normalizedQuery = parsedQuery.data.q?.trim() || undefined;
    const normalizedQueryLower = normalizedQuery?.toLowerCase();
    const normalizedRoleQuery: AdminRole | undefined =
        normalizedQueryLower === 'support' ||
        normalizedQueryLower === 'finance' ||
        normalizedQueryLower === 'tenant_admin' ||
        normalizedQueryLower === 'superadmin'
          ? (normalizedQueryLower as AdminRole)
        : undefined;

    const employees = await prisma.adminUser.findMany({
      where: {
        tenantId,
        ...(normalizedQuery
          ? {
              OR: [
                { email: { contains: normalizedQuery, mode: 'insensitive' } },
                { publicId: { contains: normalizedQuery, mode: 'insensitive' } },
                ...(normalizedRoleQuery ? [{ role: normalizedRoleQuery }] : []),
              ],
            }
          : {}),
      },
      select: {
        publicId: true,
        email: true,
        role: true,
        isActive: true,
        invitedAt: true,
        activatedAt: true,
      },
      orderBy: [{ isActive: 'desc' }, { invitedAt: 'desc' }, { email: 'asc' }],
    });

    res.json({
      tenant_id: tenantId,
      total: employees.length,
      query: normalizedQuery ?? null,
      data: employees.map((employee) => ({
        id: employee.publicId,
        email: employee.email,
        role: employee.role,
        is_active: employee.isActive,
        invited_at: employee.invitedAt?.toISOString() ?? null,
        activated_at: employee.activatedAt?.toISOString() ?? null,
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

    const { scope, keyScope } = parsedBody.data;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;

    const result = await rotateAdminApiKeyForTenant({
      tenantId,
      scope,
      keyScope,
      adminEmail,
      adminRole: req.adminUser!.role,
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

const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  isSandbox: z.boolean(),
  keyScope: z.enum(['read_only', 'read_write', 'admin']),
});

const createApiKeyResponseCache = new Map<
  string,
  { response: any; expiresAt: number }
>();

function getCreateApiKeyCacheKey(tenantId: string, name: string, isSandbox: boolean, keyScope: string, idempotencyKey: string): string {
  return `${tenantId}:${name}:${isSandbox}:${keyScope}:${idempotencyKey}`;
}

/**
 * POST /admin/account/api-keys
 * Create a new API Key for the current tenant
 */
router.post(
  '/account/api-keys',
  requireAdminRole('tenant_admin'),
  asyncHandler(async (req, res) => {
    const parsedBody = createApiKeySchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid request body parameters');
    }

    const { name, isSandbox, keyScope } = parsedBody.data;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = getValidatedIdempotencyKey(req.headers['idempotency-key']);

    const cacheKey = getCreateApiKeyCacheKey(tenantId, name, isSandbox, keyScope, idempotencyKey);
    const cachedEntry = createApiKeyResponseCache.get(cacheKey);

    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      return res.status(201).json(cachedEntry.response);
    }

    const idempotencyWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${idempotencyKey}:tenant.key_created`}));`;

      const cachedAudit = await tx.auditLog.findFirst({
        where: {
          tenantId,
          entityType: 'tenant',
          entityId: tenantId,
          action: 'tenant.key_created',
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
        const cachedChanges = (cachedAudit.changes as Record<string, any> | null) ?? {};
        const cachedResponse = cachedChanges.response;

        if (cachedResponse) {
          if (!cachedResponse.api_key.includes('[redacted]')) {
            createApiKeyResponseCache.set(cacheKey, {
              response: cachedResponse,
              expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
            });
            return {
              response: cachedResponse,
              status: 201,
            };
          }
          throw new AppError(
            500,
            ErrorCode.INTERNAL_ERROR,
            'Raw API key unavailable from audit logs; creation cannot be safely recovered'
          );
        }
      }

      const scope = isSandbox ? 'test' : 'live';
      const plainKey = `wlt_${scope}_${randomBytes(24).toString('hex')}`;
      const keyHash = createHash('sha256').update(plainKey).digest('hex');

      const apiKey = await tx.apiKey.create({
        data: {
          tenantId,
          keyHash,
          prefix: plainKey.substring(0, 15),
          scope: keyScope,
          isSandbox,
          name,
        },
      });

      const response = {
        api_key: plainKey,
        scope,
        keyScope,
        tenant_id: tenantId,
        created_at: apiKey.createdAt.toISOString(),
        name,
      };

      createApiKeyResponseCache.set(cacheKey, {
        response,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'tenant',
          entityId: tenantId,
          action: 'tenant.key_created',
          changes: {
            name,
            is_sandbox: isSandbox,
            key_scope: keyScope,
            key_prefix: plainKey.substring(0, 15),
            created_by: adminEmail,
            idempotency_key: idempotencyKey,
            response: {
              api_key: redactApiKeyForAudit(plainKey),
              scope,
              keyScope,
              tenant_id: tenantId,
              created_at: apiKey.createdAt.toISOString(),
              name,
            },
            response_status: 201,
          },
          actorId: adminEmail,
          actorType: 'admin',
          actorRole: req.adminUser!.role,
          isSandbox: req.isSandbox || false,
        },
      });

      return {
        response,
        status: 201,
      };
    });

    res.status(result.status).json(result.response);
  })
);

/**
 * POST /admin/account/api-keys/:keyId/revoke
 * Revoke an API Key for the current tenant
 */
router.post(
  '/account/api-keys/:keyId/revoke',
  requireAdminRole('tenant_admin'),
  asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const tenantId = req.adminUser!.tenantId;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = getValidatedIdempotencyKey(req.headers['idempotency-key']);

    const idempotencyWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

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
        const cachedChanges = (cachedAudit.changes as Record<string, any> | null) ?? {};
        return {
          response: cachedChanges.response || { success: true, key_id: keyId },
          status: 200,
        };
      }

      const apiKeyRecord = await tx.apiKey.findFirst({
        where: {
          id: keyId,
          tenantId,
          isActive: true,
        },
      });

      if (!apiKeyRecord) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'API Key not found or already inactive');
      }

      await tx.apiKey.update({
        where: { id: keyId },
        data: { isActive: false },
      });

      const response = { success: true, key_id: keyId };

      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'tenant',
          entityId: tenantId,
          action: 'tenant.key_revoked',
          changes: {
            key_id: keyId,
            key_prefix: apiKeyRecord.prefix,
            revoked_by: adminEmail,
            idempotency_key: idempotencyKey,
            response,
            response_status: 200,
          },
          actorId: adminEmail,
          actorType: 'admin',
          actorRole: req.adminUser!.role,
          isSandbox: req.isSandbox || false,
        },
      });

      return {
        response,
        status: 200,
      };
    });

    res.status(result.status).json(result.response);
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
      adminRole: req.adminUser!.role,
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
          actorRole: req.adminUser!.role,
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

/**
 * GET /admin/tenants/:tenantId/api-keys
 * Retrieve all active API keys for a tenant (superadmin only)
 */
router.get(
  '/tenants/:tenantId/api-keys',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Tenant not found');
    }

    const apiKeys = await prisma.apiKey.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      orderBy: [{ isSandbox: 'asc' }, { createdAt: 'desc' }],
    });

    res.json({
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      keys: apiKeys.map((apiKey) => ({
        key_id: apiKey.id,
        scope: apiKey.isSandbox ? 'test' : 'live',
        keyScope: apiKey.scope,
        prefix: apiKey.prefix,
        created_at: apiKey.createdAt.toISOString(),
        last_used_at: null,
        is_active: apiKey.isActive,
        name: apiKey.name ?? (apiKey.isSandbox ? 'Default Sandbox Key' : 'Default Live Key'),
      })),
    });
  })
);

/**
 * POST /admin/tenants/:tenantId/api-keys/:keyId/revoke
 * Revoke an individual API key for a tenant (superadmin only)
 */
router.post(
  '/tenants/:tenantId/api-keys/:keyId/revoke',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const { tenantId, keyId } = req.params;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = getValidatedIdempotencyKey(req.headers['idempotency-key']);

    const idempotencyWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${idempotencyKey}:tenant.key_revoked_by_superadmin`}));`;

      const cachedAudit = await tx.auditLog.findFirst({
        where: {
          tenantId,
          entityType: 'tenant',
          entityId: tenantId,
          action: 'tenant.key_revoked_by_superadmin',
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
        const cachedChanges = (cachedAudit.changes as Record<string, any> | null) ?? {};
        return {
          response: cachedChanges.response || { success: true, key_id: keyId },
          status: 200,
        };
      }

      const apiKeyRecord = await tx.apiKey.findFirst({
        where: {
          id: keyId,
          tenantId,
          isActive: true,
        },
      });

      if (!apiKeyRecord) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'API Key not found or already inactive');
      }

      await tx.apiKey.update({
        where: { id: keyId },
        data: { isActive: false },
      });

      const response = { success: true, key_id: keyId };

      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'tenant',
          entityId: tenantId,
          action: 'tenant.key_revoked_by_superadmin',
          changes: {
            key_id: keyId,
            key_prefix: apiKeyRecord.prefix,
            revoked_by: adminEmail,
            idempotency_key: idempotencyKey,
            response,
            response_status: 200,
          },
          actorId: adminEmail,
          actorType: 'admin',
          actorRole: req.adminUser!.role,
          isSandbox: req.isSandbox || false,
        },
      });

      return {
        response,
        status: 200,
      };
    });

    res.status(result.status).json(result.response);
  })
);

/**
 * POST /admin/tenants/:tenantId/emergency-revoke
 * Revoke all active API keys for a tenant (superadmin only)
 */
router.post(
  '/tenants/:tenantId/emergency-revoke',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const adminEmail = req.adminUser!.email;
    const idempotencyKey = getValidatedIdempotencyKey(req.headers['idempotency-key']);

    const idempotencyWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Tenant not found');
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${idempotencyKey}:tenant.emergency_revoked`}));`;

      const cachedAudit = await tx.auditLog.findFirst({
        where: {
          tenantId,
          entityType: 'tenant',
          entityId: tenantId,
          action: 'tenant.emergency_revoked',
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
        const cachedChanges = (cachedAudit.changes as Record<string, any> | null) ?? {};
        const cachedResponse = cachedChanges.response as
          | { tenant_id: string; keys_deactivated: number }
          | undefined;

        if (cachedResponse) {
          return {
            deactivatedKeys: { count: cachedResponse.keys_deactivated },
            cachedResponse,
            status: (cachedChanges.response_status as number) || 200,
          };
        }
      }

      const deactivatedKeys = await tx.apiKey.updateMany({
        where: {
          tenantId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      const response = {
        tenant_id: tenantId,
        keys_deactivated: deactivatedKeys.count,
      };

      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'tenant',
          entityId: tenantId,
          action: 'tenant.emergency_revoked',
          changes: {
            keys_deactivated: deactivatedKeys.count,
            revoked_by: adminEmail,
            idempotency_key: idempotencyKey,
            response,
            response_status: 200,
          },
          actorId: adminEmail,
          actorType: 'admin',
          actorRole: req.adminUser!.role,
          isSandbox: req.isSandbox || false,
        },
      });

      return {
        deactivatedKeys,
        cachedResponse: response,
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
    const { adminEmail, actionType, from, to, limit = 50, after } = req.query;

    const where: Prisma.AuditLogWhereInput = {
      actorType: 'admin',
      actorRole: 'superadmin', // Fast, indexed flat-column query — no join needed
      isSandbox: req.isSandbox || false,
    };

    const requestedAdminEmail = getQueryString(adminEmail);
    const actionTypeFilter = getQueryString(actionType);
    const fromFilter = getQueryString(from);
    const toFilter = getQueryString(to);

    if (requestedAdminEmail) {
      where.actorId = await resolveActorIdFromFilter(requestedAdminEmail);
    }

    if (actionTypeFilter) {
      where.action = { contains: actionTypeFilter, mode: 'insensitive' };
    }

    if (fromFilter || toFilter) {
      where.timestamp = {};
      if (fromFilter) where.timestamp.gte = parseDateFilter(fromFilter, 'from');
      if (toFilter) where.timestamp.lte = parseDateFilter(toFilter, 'to');
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
        actor_role: log.actorRole,
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
 * GET /admin/search
 * Unified cross-entity search (superadmin only)
 */
router.get(
  '/search',
  requireAdminRole('superadmin'),
  asyncHandler(async (req, res) => {
    const parsedQuery = unifiedSearchSchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid search query');
    }

    const query = (parsedQuery.data.q ?? '').trim();
    if (!query) {
      return res.json({ wallets: [], transactions: [], requests: [], users: [] });
    }

    const prefixMatch = query.match(/^(wal_|txn_|req_|usr_)/i);
    const prefix = prefixMatch?.[1]?.toLowerCase();

    let wallets: Array<{
      publicId: string;
      externalUserId: string;
      status: string;
      balance: Decimal;
      currency: string;
      label: string | null;
      tenant: { name: string } | null;
    }> = [];
    let transactions: Array<{
      publicId: string;
      type: string;
      amount: Decimal;
      currency: string;
      idempotencyKey: string | null;
      referenceId: string | null;
      createdAt: Date;
      wallet: { publicId: string; tenant: { name: string } | null } | null;
    }> = [];
    let requests: Array<{
      publicId: string;
      referenceId: string | null;
      createdAt: Date;
      wallet: { publicId: string; tenant: { name: string } | null } | null;
    }> = [];
    let users: Array<{
      publicId: string;
      email: string;
      role: string;
      tenant: { name: string } | null;
    }> = [];

    if (prefix === 'wal_') {
      wallets = await prisma.wallet.findMany({
        where: {
          isSandbox: req.isSandbox,
          publicId: { contains: query, mode: 'insensitive' },
        },
        select: {
          publicId: true,
          externalUserId: true,
          status: true,
          balance: true,
          currency: true,
          label: true,
          tenant: { select: { name: true } },
        },
        take: 5,
      });
    } else if (prefix === 'txn_') {
      transactions = await prisma.transaction.findMany({
        where: {
          wallet: { isSandbox: req.isSandbox },
          publicId: { contains: query, mode: 'insensitive' },
        },
        select: {
          publicId: true,
          type: true,
          amount: true,
          currency: true,
          idempotencyKey: true,
          referenceId: true,
          createdAt: true,
          wallet: {
            select: {
              publicId: true,
              tenant: { select: { name: true } },
            },
          },
        },
        take: 5,
      });
    } else if (prefix === 'req_') {
      requests = await prisma.transaction.findMany({
        where: {
          wallet: { isSandbox: req.isSandbox },
          referenceId: { contains: query, mode: 'insensitive' },
        },
        select: {
          publicId: true,
          referenceId: true,
          createdAt: true,
          wallet: {
            select: {
              publicId: true,
              tenant: { select: { name: true } },
            },
          },
        },
        take: 5,
      });
    } else if (prefix === 'usr_') {
      users = await prisma.adminUser.findMany({
        where: {
          isActive: true,
          publicId: { contains: query, mode: 'insensitive' },
        },
        select: {
          publicId: true,
          email: true,
          role: true,
          tenant: { select: { name: true } },
        },
        take: 5,
      });
    } else {
      [wallets, transactions, requests, users] = await Promise.all([
        prisma.wallet.findMany({
          where: {
            isSandbox: req.isSandbox,
            OR: [
              { externalUserId: { contains: query, mode: 'insensitive' } },
              { label: { contains: query, mode: 'insensitive' } },
            ],
          },
          select: {
            publicId: true,
            externalUserId: true,
            status: true,
            balance: true,
            currency: true,
            label: true,
            tenant: { select: { name: true } },
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.transaction.findMany({
          where: {
            wallet: { isSandbox: req.isSandbox },
            OR: [
              { referenceId: { contains: query, mode: 'insensitive' } },
              { idempotencyKey: { contains: query, mode: 'insensitive' } },
              { wallet: { externalUserId: { contains: query, mode: 'insensitive' } } },
            ],
          },
          select: {
            publicId: true,
            type: true,
            amount: true,
            currency: true,
            idempotencyKey: true,
            referenceId: true,
            createdAt: true,
            wallet: {
              select: {
                publicId: true,
                tenant: { select: { name: true } },
              },
            },
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.transaction.findMany({
          where: {
            wallet: { isSandbox: req.isSandbox },
            referenceId: { contains: query, mode: 'insensitive' },
          },
          select: {
            publicId: true,
            referenceId: true,
            createdAt: true,
            wallet: {
              select: {
                publicId: true,
                tenant: { select: { name: true } },
              },
            },
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.adminUser.findMany({
          where: {
            email: { contains: query, mode: 'insensitive' },
            isActive: true,
          },
          select: {
            publicId: true,
            email: true,
            role: true,
            tenant: { select: { name: true } },
          },
          take: 5,
          orderBy: { invitedAt: 'desc' },
        }),
      ]);
    }

    return res.json({
      wallets: wallets.map((wallet) => ({
        id: wallet.publicId,
        external_user_id: wallet.externalUserId,
        status: wallet.status,
        balance: wallet.balance.toFixed(4),
        currency: wallet.currency,
        label: wallet.label,
        tenant_name: wallet.tenant?.name ?? 'Unknown',
      })),
      transactions: transactions.map((transaction) => ({
        id: transaction.publicId,
        type: transaction.type,
        amount: transaction.amount.toFixed(4),
        currency: transaction.currency,
        idempotency_key: transaction.idempotencyKey,
        request_id: transaction.referenceId,
        wallet_id: transaction.wallet?.publicId ?? 'Unknown',
        tenant_name: transaction.wallet?.tenant?.name ?? 'Unknown',
        created_at: transaction.createdAt.toISOString(),
      })),
      requests: requests
        .filter((transaction) => transaction.referenceId)
        .map((transaction) => ({
          id: transaction.referenceId as string,
          transaction_id: transaction.publicId,
          wallet_id: transaction.wallet?.publicId ?? 'Unknown',
          tenant_name: transaction.wallet?.tenant?.name ?? 'Unknown',
          created_at: transaction.createdAt.toISOString(),
        })),
      users: users.map((user) => ({
        id: user.publicId,
        email: user.email,
        role: user.role,
        tenant_name: user.tenant?.name ?? 'Unknown',
      })),
    });
  })
);

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

    const { q, tenantId: requestedTenantId } = parsedQuery.data;
    const tenantBoundary = requestedTenantId ?? undefined;

    const wallets = await prisma.wallet.findMany({
      where: {
        ...(tenantBoundary ? { tenantId: tenantBoundary } : {}),
        isSandbox: req.isSandbox,
        OR: [
          { publicId: { contains: q, mode: 'insensitive' } },
          { externalUserId: { contains: q, mode: 'insensitive' } },
          { label: { contains: q, mode: 'insensitive' } },
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
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      query: q,
      results: wallets.map(w => ({
        wallet_id: w.publicId,
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

    const tenantBoundary = isSuperadmin
      ? requestedTenantId ?? undefined
      : req.adminUser!.tenantId;

    const where: Prisma.TransactionWhereInput = { 
      wallet: {
        isSandbox: req.isSandbox,
      },
    };

    if (tenantBoundary) {
      where.tenantId = tenantBoundary;
    }

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

// Helper to check if IP is private/internal
function isInternalIp(ip: string): boolean {
  if (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('127.') ||
    ip.startsWith('169.254.')
  ) {
    return true;
  }
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const secondPart = parseInt(parts[1], 10);
      if (secondPart >= 16 && secondPart <= 31) {
        return true;
      }
    }
  }
  if (ip === '::1' || ip.toLowerCase().startsWith('fe80:')) {
    return true;
  }
  return false;
}

const webhookCreateSchema = z.object({
  url: z.string().url('url must be a valid URL').refine((val) => {
    try {
      return new URL(val).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'url must use HTTPS protocol'),
  events: z.array(z.string().min(1)).min(1, 'At least one event type is required'),
});

/**
 * POST /webhooks
 * Create a new webhook endpoint for the admin's tenant
 */
router.post(
  '/webhooks',
  requireAdminRole(['tenant_admin', 'superadmin'] as const),
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Idempotency-Key header is required');
    }

    const parsed = webhookCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, parsed.error.issues[0].message);
    }
    const { url, events } = parsed.data;

    // Validate URL destination (SSRF protection)
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('169.254.') ||
      hostname === '169.254.169.254'
    ) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Internal or private destinations are not allowed');
    }

    try {
      const ips = await dns.promises.lookup(hostname, { all: true });
      const hasInternal = ips.some((ipObj) => isInternalIp(ipObj.address));
      if (hasInternal) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Internal or private destinations are not allowed');
      }
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid hostname or resolution failed');
    }

    // Atomic lookup/create with advisory lock to prevent races under concurrent retries
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${req.adminUser!.tenantId}:${idempotencyKey}:webhook.created`}));`;

      const existing = await tx.webhook.findFirst({
        where: {
          tenantId: req.adminUser!.tenantId,
          idempotencyKey,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });

      if (existing) {
        return {
          webhook: existing,
          isNew: false,
        };
      }

      const secret = randomBytes(32).toString('hex');
      const created = await tx.webhook.create({
        data: {
          tenantId: req.adminUser!.tenantId,
          url,
          events,
          secret,
          idempotencyKey,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: req.adminUser!.tenantId,
          entityType: 'Webhook',
          entityId: created.id,
          action: 'webhook.created',
          changes: { url, events, idempotency_key: idempotencyKey },
          actorId: req.adminUser!.email,
          actorType: 'admin',
          actorRole: req.adminUser!.role,
          isSandbox: false,
        },
      });

      return {
        webhook: created,
        isNew: true,
      };
    });

    const statusCode = result.isNew ? 201 : 200;
    res.status(statusCode).json({
      id: result.webhook.id,
      url: result.webhook.url,
      events: result.webhook.events,
      secret: result.webhook.secret,
      status: result.webhook.status,
      is_active: result.webhook.isActive,
      created_at: result.webhook.createdAt.toISOString(),
    });
  })
);

/**
 * GET /webhooks
 * List all webhooks for the admin's tenant
 */
router.get(
  '/webhooks',
  asyncHandler(async (req, res) => {
    const webhooks = await prisma.webhook.findMany({
      where: { tenantId: req.adminUser!.tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { deliveries: true } },
      },
    });

    res.json(
      webhooks.map((w) => ({
        id: w.id,
        url: w.url,
        events: w.events,
        status: w.status,
        is_active: w.isActive,
        failure_count: w.failureCount,
        last_attempt: w.lastAttempt?.toISOString() ?? null,
        delivery_count: w._count.deliveries,
        created_at: w.createdAt.toISOString(),
      }))
    );
  })
);

/**
 * DELETE /webhooks/:webhookId
 * Deactivate (soft-delete) a webhook
 */
router.delete(
  '/webhooks/:webhookId',
  requireAdminRole(['tenant_admin', 'superadmin'] as const),
  asyncHandler(async (req, res) => {
    const { webhookId } = req.params;

    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
    });
    if (!webhook || webhook.tenantId !== req.adminUser!.tenantId) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Webhook not found');
    }

    await prisma.webhook.update({
      where: { id: webhookId },
      data: { isActive: false, status: 'disabled' },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.adminUser!.tenantId,
        entityType: 'Webhook',
        entityId: webhookId,
        action: 'webhook.deleted',
        changes: { webhookId },
        actorId: req.adminUser!.email,
        actorType: 'admin',
        actorRole: req.adminUser!.role,
        isSandbox: false,
      },
    });

    res.json({ id: webhookId, is_active: false, status: 'disabled' });
  })
);

/**
 * POST /webhooks/:webhookId/test
 * Send a test ping payload to the webhook endpoint
 */
router.post(
  '/webhooks/:webhookId/test',
  requireAdminRole(['tenant_admin', 'superadmin'] as const),
  asyncHandler(async (req, res) => {
    const { webhookId } = req.params;
    const idempotencyKey = req.get('Idempotency-Key') || req.body.idempotencyKey;

    const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook || webhook.tenantId !== req.adminUser!.tenantId) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Webhook not found');
    }

    if (idempotencyKey) {
      const existingDelivery = await prisma.webhookDelivery.findFirst({
        where: {
          webhook: {
            tenantId: req.adminUser!.tenantId,
          },
          webhookId: webhook.id,
          idempotencyKey,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });

      if (existingDelivery) {
        return res.json({ delivery_id: existingDelivery.id, message: 'Test webhook dispatched' });
      }
    }

    const testPayload = {
      event: 'webhook.test',
      tenant_id: req.adminUser!.tenantId,
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook delivery from WalletOS' },
    };

    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType: 'webhook.test',
        payload: testPayload as any,
        attemptNum: 1,
        idempotencyKey: idempotencyKey || randomUUID(),
      },
    });

    // Fire-and-forget
    dispatchWebhookDelivery(delivery.id).catch(() => void 0);

    res.json({ delivery_id: delivery.id, message: 'Test webhook dispatched' });
  })
);

// ─── Tenant Config ─────────────────────────────────────────────────────────────

const tenantConfigUpdateSchema = z.object({
  defaultCurrency: z.string().length(3).optional(),
  autoCreateWallet: z.boolean().optional(),
});

/**
 * GET /tenant-config
 * Retrieve the tenant configuration (creates default if none exists)
 */
router.get(
  '/tenant-config',
  asyncHandler(async (req, res) => {
    const config = await prisma.tenantConfig.upsert({
      where: { tenantId: req.adminUser!.tenantId },
      create: { tenantId: req.adminUser!.tenantId },
      update: {},
    });

    res.json({
      id: config.id,
      tenant_id: config.tenantId,
      default_currency: config.defaultCurrency,
      auto_create_wallet: config.autoCreateWallet,
      updated_at: config.updatedAt.toISOString(),
    });
  })
);

/**
 * PUT /tenant-config
 * Update tenant configuration settings
 */
router.put(
  '/tenant-config',
  requireAdminRole(['tenant_admin', 'superadmin'] as const),
  asyncHandler(async (req, res) => {
    const parsed = tenantConfigUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, parsed.error.issues[0].message);
    }

    const updateData: { defaultCurrency?: string; autoCreateWallet?: boolean } = {};
    if (parsed.data.defaultCurrency !== undefined) updateData.defaultCurrency = parsed.data.defaultCurrency;
    if (parsed.data.autoCreateWallet !== undefined) updateData.autoCreateWallet = parsed.data.autoCreateWallet;

    const config = await prisma.tenantConfig.upsert({
      where: { tenantId: req.adminUser!.tenantId },
      create: { tenantId: req.adminUser!.tenantId, ...updateData },
      update: updateData,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.adminUser!.tenantId,
        entityType: 'TenantConfig',
        entityId: config.id,
        action: 'tenant_config.updated',
        changes: updateData,
        actorId: req.adminUser!.email,
        actorType: 'admin',
        actorRole: req.adminUser!.role,
        isSandbox: false,
      },
    });

    res.json({
      id: config.id,
      tenant_id: config.tenantId,
      default_currency: config.defaultCurrency,
      auto_create_wallet: config.autoCreateWallet,
      updated_at: config.updatedAt.toISOString(),
    });
  })
);

// ─── Reporting & Exports ──────────────────────────────────────────────────────

/**
 * GET /audit-logs/export
 * Export audit logs as CSV for the requesting tenant
 */
router.get(
  '/audit-logs/export',
  requireAdminRole(['finance', 'tenant_admin', 'superadmin'] as const),
  asyncHandler(async (req, res) => {
    const { from, to, entity_type } = req.query as Record<string, string>;

    const where: Prisma.AuditLogWhereInput = {
      tenantId: req.adminUser!.tenantId,
    };
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = parseDateFilter(from, 'from');
      if (to) where.timestamp.lte = parseDateFilter(to, 'to');
    }
    if (entity_type) where.entityType = entity_type;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: 10000,
    });

    const csvHeader = 'id,timestamp,entity_type,entity_id,action,actor_id,actor_type,actor_role,is_sandbox\n';
    const csvRows = logs
      .map((l) =>
        [
          l.id,
          l.timestamp.toISOString(),
          l.entityType,
          l.entityId,
          l.action,
          l.actorId ?? '',
          l.actorType ?? '',
          l.actorRole ?? '',
          l.isSandbox ? 'true' : 'false',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');

    const csv = csvHeader + csvRows;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
    res.send(csv);
  })
);

/**
 * GET /reporting/transactions
 * Returns aggregated transaction metrics (volume, count, net) grouped by day
 */
router.get(
  '/reporting/transactions',
  requireAdminRole(['finance', 'tenant_admin', 'superadmin'] as const),
  asyncHandler(async (req, res) => {
    const { from, to, is_sandbox } = req.query as Record<string, string>;

    const fromDate = from ? parseDateFilter(from, 'from') : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? parseDateFilter(to, 'to') : new Date();
    const sandboxFilter = is_sandbox === 'true';

    // DB-side grouped aggregation to avoid OOM
    const result: Array<{
      day: Date;
      type: 'credit' | 'debit' | 'reversal';
      amount_sum: Prisma.Decimal | null;
      cnt: bigint;
    }> = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('day', t."createdAt") AS day,
        t.type,
        SUM(t.amount) AS amount_sum,
        COUNT(*)::bigint AS cnt
      FROM "Transaction" t
      INNER JOIN "Wallet" w ON t."walletId" = w.id
      WHERE t."tenantId" = ${req.adminUser!.tenantId}
        AND t."createdAt" >= ${fromDate}
        AND t."createdAt" <= ${toDate}
        AND w."isSandbox" = ${sandboxFilter}
      GROUP BY DATE_TRUNC('day', t."createdAt"), t.type
      ORDER BY day ASC;
    `;

    // Aggregate results for the daily output format
    const byDay: Record<string, { date: string; credits: string; debits: string; reversals: string; net: string; count: number }> = {};
    let totalCredits = new Decimal(0);
    let totalDebits = new Decimal(0);
    let totalReversals = new Decimal(0);
    let totalCount = 0;

    for (const row of result) {
      const day = row.day.toISOString().split('T')[0];
      if (!byDay[day]) {
        byDay[day] = { date: day, credits: '0', debits: '0', reversals: '0', net: '0', count: 0 };
      }
      const sum = new Decimal(row.amount_sum ? row.amount_sum.toString() : '0');
      const count = Number(row.cnt);
      byDay[day].count += count;
      totalCount += count;

      if (row.type === 'credit') {
        const prev = new Decimal(byDay[day].credits);
        byDay[day].credits = prev.add(sum).toFixed(4);
        totalCredits = totalCredits.add(sum);
      } else if (row.type === 'debit') {
        const prev = new Decimal(byDay[day].debits);
        byDay[day].debits = prev.add(sum).toFixed(4);
        totalDebits = totalDebits.add(sum);
      } else if (row.type === 'reversal') {
        const prev = new Decimal(byDay[day].reversals);
        byDay[day].reversals = prev.add(sum).toFixed(4);
        totalReversals = totalReversals.add(sum);
      }

      const net = new Decimal(byDay[day].credits).sub(new Decimal(byDay[day].debits));
      byDay[day].net = net.toFixed(4);
    }

    res.json({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      is_sandbox: sandboxFilter,
      summary: {
        total_credits: totalCredits.toFixed(4),
        total_debits: totalDebits.toFixed(4),
        total_reversals: totalReversals.toFixed(4),
        net_change: totalCredits.sub(totalDebits).toFixed(4),
        transaction_count: totalCount,
      },
      daily: Object.values(byDay),
    });
  })
);

export default router;
