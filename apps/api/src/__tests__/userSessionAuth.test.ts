import { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { userSessionAuthMiddleware } from '../middleware/userSessionAuth';
import { createTestSetup, cleanupTestData, disconnectPrisma } from './utils/test-helpers';

describe('userSessionAuthMiddleware', () => {
  const seededTenants: string[] = [];

  afterEach(async () => {
    for (const tenantId of seededTenants) {
      await cleanupTestData(tenantId);
    }
    seededTenants.length = 0;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('rejects requests without authorization header', async () => {
    const req = {} as Request;
    const res = {} as Response;
    const next = jest.fn();

    await userSessionAuthMiddleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
      })
    );
  });

  it('rejects requests with invalid authorization format', async () => {
    const req = {
      headers: { authorization: 'InvalidFormat' },
    } as Request;
    const res = {} as Response;
    const next = jest.fn();

    await userSessionAuthMiddleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
      })
    );
  });

  it('rejects requests with non-session tokens', async () => {
    const req = {
      headers: { authorization: 'Bearer not_a_session_token' },
    } as Request;
    const res = {} as Response;
    const next = jest.fn();

    await userSessionAuthMiddleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
      })
    );
  });

  it('rejects requests with expired session tokens', async () => {
    const { tenant, wallet } = await createTestSetup();
    seededTenants.push(tenant.id);

    const token = `sess_${randomBytes(32).toString('hex')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiredAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

    await prisma.sessionToken.create({
      data: {
        tenantId: tenant.id,
        tokenHash,
        scope: `wallet:${wallet.id}:sandbox:1`,
        expiresAt: expiredAt,
      },
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as Request;
    const res = {} as Response;
    const next = jest.fn();

    await userSessionAuthMiddleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
      })
    );
  });

  it('rejects requests with invalid session token scope', async () => {
    const { tenant } = await createTestSetup();
    seededTenants.push(tenant.id);

    const token = `sess_${randomBytes(32).toString('hex')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.sessionToken.create({
      data: {
        tenantId: tenant.id,
        tokenHash,
        scope: 'invalid_scope_format',
        expiresAt,
      },
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as Request;
    const res = {} as Response;
    const next = jest.fn();

    await userSessionAuthMiddleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
      })
    );
  });

  it('validates valid session tokens and sets request properties', async () => {
    const { tenant, wallet } = await createTestSetup();
    seededTenants.push(tenant.id);

    const token = `sess_${randomBytes(32).toString('hex')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.sessionToken.create({
      data: {
        tenantId: tenant.id,
        tokenHash,
        scope: `wallet:${wallet.id}:sandbox:1`,
        expiresAt,
      },
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as Request;
    const res = {} as Response;
    const next = jest.fn();

    await userSessionAuthMiddleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toEqual([]);
    expect(req.tenantId).toBe(tenant.id);
    expect(req.sessionWalletId).toBe(wallet.id);
    expect(req.isSandbox).toBe(true);
  });

  it('correctly parses sandbox flag from scope', async () => {
    const { tenant, wallet } = await createTestSetup();
    seededTenants.push(tenant.id);

    const token = `sess_${randomBytes(32).toString('hex')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.sessionToken.create({
      data: {
        tenantId: tenant.id,
        tokenHash,
        scope: `wallet:${wallet.id}:sandbox:0`,
        expiresAt,
      },
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as Request;
    const res = {} as Response;
    const next = jest.fn();

    await userSessionAuthMiddleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toEqual([]);
    expect(req.isSandbox).toBe(false);
  });

  it('rejects cross-tenant session token access', async () => {
    const tenant1 = await createTestSetup();
    seededTenants.push(tenant1.tenant.id);
    const tenant2 = await createTestSetup();
    seededTenants.push(tenant2.tenant.id);

    const token = `sess_${randomBytes(32).toString('hex')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Create session token for tenant1's wallet
    await prisma.sessionToken.create({
      data: {
        tenantId: tenant1.tenant.id,
        tokenHash,
        scope: `wallet:${tenant1.wallet.id}:sandbox:1`,
        expiresAt,
      },
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as Request;
    const res = {} as Response;
    const next = jest.fn();

    await userSessionAuthMiddleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
      })
    );
    expect(req.tenantId).toBeUndefined();
    expect(req.sessionWalletId).toBeUndefined();
    expect(req.isSandbox).toBeUndefined();
  });
});
