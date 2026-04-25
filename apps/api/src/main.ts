/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import express from 'express';
import * as path from 'path';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandlerMiddleware } from './middleware/errorHandler';

const app = express();

// Middleware
app.use(express.json());
app.use(requestIdMiddleware);

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Health check
app.get('/api', (req, res) => {
  res.send({ message: 'Welcome to api!' });
});

// Error handler (must be last)
app.use(errorHandlerMiddleware);

const port = process.env.PORT || 3333;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);
});
server.on('error', console.error);
