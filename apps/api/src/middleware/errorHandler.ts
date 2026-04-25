import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
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
  next: NextFunction
): void {
  const requestId = req.id || 'unknown';

  if (err instanceof AppError) {
    console.error(`[${requestId}] ${err.statusCode}: ${err.message}`);
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        requestId,
      },
    });
    return;
  }

  console.error(`[${requestId}] Unexpected error:`, err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      requestId,
    },
  });
}
