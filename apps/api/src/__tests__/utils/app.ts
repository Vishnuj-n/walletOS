/**
 * Test App Factory
 * 
 * Creates an Express app instance for testing with supertest.
 */

import express from 'express';
import { requestIdMiddleware } from '../../middleware/requestId';
import { errorHandlerMiddleware } from '../../middleware/errorHandler';
import walletRoutes from '../../routes/wallet.routes';
import transactionRoutes from '../../routes/transaction.routes';

export function createTestApp() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(requestIdMiddleware);

  // API Routes
  app.use('/api/v1', walletRoutes);
  app.use('/api/v1', transactionRoutes);

  // Health check
  app.get('/api', (req, res) => {
    res.send({ message: 'Welcome to WalletOS API' });
  });

  // Error handler (must be last)
  app.use(errorHandlerMiddleware);

  return app;
}
