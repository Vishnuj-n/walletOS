import { prisma } from '../lib/prisma';

/**
 * Audit Logging Service
 * 
 * Automatically creates audit records for every state-changing database transaction.
 * Ensures immutable history for financial integrity compliance.
 */
export interface AuditLogParams {
  tenantId: string;
  entityType: string;
  entityId: string;
  action: string;
  changes?: Record<string, any>;
  actorId?: string;
  actorType?: string;
}

/**
 * Create an audit log entry
 * 
 * This should be called within database transactions to ensure
 * atomicity with the state change being audited.
 */
export async function createAuditLog(params: AuditLogParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: params.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      changes: params.changes,
      actorId: params.actorId,
      actorType: params.actorType,
    },
  });
}

/**
 * Wrapper for state-changing operations with automatic audit logging
 * 
 * Usage:
 * ```typescript
 * await withAudit(
 *   { tenantId, entityType: 'Wallet', entityId: walletId, action: 'wallet.credited', changes: {...} },
 *   async (tx) => {
 *     // Perform state change using the transaction
 *   }
 * );
 * ```
 */
export async function withAudit<T>(
  auditParams: AuditLogParams,
  callback: (tx: any) => Promise<T>
): Promise<T> {
  return await prisma.$transaction(async (tx) => {
    // Execute the state change
    const result = await callback(tx);

    // Create audit log within the same transaction
    await tx.auditLog.create({
      data: auditParams,
    });

    return result;
  });
}
