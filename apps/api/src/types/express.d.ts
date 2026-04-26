declare global {
  namespace Express {
    interface Request {
      id: string;
      tenantId?: string;
      apiKeyScope?: string;
      isSandbox?: boolean;
      idempotencyKey?: string;
    }
  }
}

export {};
