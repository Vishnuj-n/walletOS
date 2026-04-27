import { AdminRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      id: string;
      tenantId?: string;
      apiKeyScope?: string;
      isSandbox?: boolean;
      idempotencyKey?: string;
      requestFingerprint?: string;
      cachedResponse?: { status: number; body: unknown };
      // Admin auth properties
      adminUser?: {
        id: string;
        email: string;
        tenantId: string;
        role: AdminRole;
      };
    }
  }
}

export {};
