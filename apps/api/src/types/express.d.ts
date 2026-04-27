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
    }
  }
}

export {};
