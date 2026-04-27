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

const app = express();

// Middleware
app.use(express.json());
app.use(requestIdMiddleware);

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// API Routes
app.use('/api/v1', walletRoutes);
app.use('/api/v1', transactionRoutes);

// Health check
app.get('/api', (req, res) => {
  res.send({ message: 'Welcome to WalletOS API' });
});

// Error handler (must be last)
app.use(errorHandlerMiddleware);

const port = process.env.PORT || 3333;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);
});
server.on('error', console.error);
