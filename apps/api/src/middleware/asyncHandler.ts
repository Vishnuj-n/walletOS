import { Request, Response, NextFunction } from 'express';

/**
 * Async Handler Wrapper
 * 
 * Wraps async route handlers to automatically catch errors and forward them
 * to Express error middleware via next(err). This ensures AppError exceptions
 * are properly converted into HTTP responses.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Req, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
