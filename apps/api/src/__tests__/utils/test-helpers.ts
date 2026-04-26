/**
 * Test Helpers
 * 
 * Utility functions for setting up test data and making API requests.
 */

import { PrismaClient, KeyScope } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

export interface TestTenant {
  id: string;
  name: string;
}

export interface TestApiKey {
  id: string;
  keyHash: string;
  prefix: string;
  plainKey: string;
  tenantId: string;
  scope: KeyScope;
  isSandbox: boolean;
}

export interface TestWallet {
  id: string;
  tenantId: string;
  externalUserId: string;
  currency: string;
  label: string | null;
  balance: number;
  status: string;
  isSandbox: boolean;
}

/**
 * Create a test tenant
 */
export async function createTestTenant(name = 'Test Tenant'): Promise<TestTenant> {
  const randomSuffix = Math.random().toString(36).substring(7);
  const tenant = await prisma.tenant.create({
    data: {
      name,
      contactEmail: `test-${Date.now()}-${randomSuffix}@example.com`,
    },
  });

  return {
    id: tenant.id,
    name: tenant.name,
  };
}

/**
 * Create a test API key
 */
export async function createTestApiKey(
  tenantId: string,
  scope: KeyScope = 'read_write',
  isSandbox = true
): Promise<TestApiKey> {
  const plainKey = `wlt_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const keyHash = createHash('sha256').update(plainKey).digest('hex');
  const prefix = plainKey.substring(0, 12);

  const apiKey = await prisma.apiKey.create({
    data: {
      tenantId,
      keyHash,
      prefix,
      scope,
      isSandbox,
      isActive: true,
    },
  });

  return {
    id: apiKey.id,
    keyHash: apiKey.keyHash,
    prefix: apiKey.prefix,
    plainKey,
    tenantId: apiKey.tenantId,
    scope: apiKey.scope,
    isSandbox: apiKey.isSandbox,
  };
}

/**
 * Create a test wallet
 */
export async function createTestWallet(
  tenantId: string,
  externalUserId: string,
  currency = 'INR',
  label?: string,
  isSandbox = true
): Promise<TestWallet> {
  const wallet = await prisma.wallet.create({
    data: {
      tenantId,
      externalUserId,
      currency,
      label,
      balance: 0,
      status: 'active',
      isSandbox,
    },
  });

  return {
    id: wallet.id,
    tenantId: wallet.tenantId,
    externalUserId: wallet.externalUserId,
    currency: wallet.currency,
    label: wallet.label,
    balance: wallet.balance.toNumber(),
    status: wallet.status,
    isSandbox: wallet.isSandbox,
  };
}

/**
 * Create a complete test setup (tenant, API key, and wallet)
 */
export async function createTestSetup(
  walletExternalUserId = `user_${Date.now()}`
) {
  const tenant = await createTestTenant();
  const apiKey = await createTestApiKey(tenant.id);
  const wallet = await createTestWallet(tenant.id, walletExternalUserId);

  return {
    tenant,
    apiKey,
    wallet,
  };
}

/**
 * Clean up test data
 */
export async function cleanupTestData(tenantId: string) {
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.transaction.deleteMany({ where: { tenantId } });
  await prisma.wallet.deleteMany({ where: { tenantId } });
  await prisma.apiKey.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
}
