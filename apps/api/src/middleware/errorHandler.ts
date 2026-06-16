import { Request, Response, NextFunction } from 'express';

/**
 * Financial Error Codes
 * Standardized codes for API responses
 */
export enum ErrorCode {
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  WALLET_FROZEN = 'WALLET_FROZEN',
  WALLET_CLOSED = 'WALLET_CLOSED',
  WALLET_ALREADY_EXISTS = 'WALLET_ALREADY_EXISTS',
  WALLET_ALREADY_FROZEN = 'WALLET_ALREADY_FROZEN',
  WALLET_BALANCE_NOT_ZERO = 'WALLET_BALANCE_NOT_ZERO',
  WALLET_ALREADY_CLOSED = 'WALLET_ALREADY_CLOSED',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  CANNOT_REVERSE_REVERSAL = 'CANNOT_REVERSE_REVERSAL',
  ALREADY_REVERSED = 'ALREADY_REVERSED',
  CURRENCY_MISMATCH = 'CURRENCY_MISMATCH',
  INVALID_OPERATION = 'INVALID_OPERATION',
  TENANT_ISOLATION = 'TENANT_ISOLATION',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONFLICT = 'CONFLICT',
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: ErrorCode,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.id || 'unknown';

  if (err instanceof AppError) {
    // Only log errors to the console if we are NOT running tests
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[${requestId}] ${err.statusCode} [${err.code}]: ${err.message}`);
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
      },
    });
    return;
  }

  // Only log errors to the console if we are NOT running tests
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[${requestId}] Unexpected error:`, err);
  }
  res.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
      requestId,
    },
  });
}
