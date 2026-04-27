import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare module 'express' {
  interface Request {
    id: string;
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.id = req.headers['x-request-id'] as string || randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
