/**
 * WalletOS API - Core Ledger & Concurrency
 * 
 * Multi-tenant financial ledger with pessimistic locking and idempotency.
 */

import express from 'express';
import * as path from 'path';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import walletRoutes from './routes/wallet.routes';
import transactionRoutes from './routes/transaction.routes';
import adminRoutes from './routes/admin.routes';
import authRoutes from './routes/auth.routes';

const app = express();

// Middleware
app.use(express.json());
app.use(requestIdMiddleware);

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// API Routes
app.use('/api/v1', walletRoutes);
app.use('/api/v1', transactionRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);

// Health check
app.get('/api', (req, res) => {
  res.send({ message: 'Welcome to WalletOS API' });
});

// Error handler (must be last)
app.use(errorHandlerMiddleware);

const port = process.env.PORT || 3333;

// Only start the server if not in test environment (supertest handles its own server)
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}/api`);
  });
  server.on('error', console.error);
}

export { app };
