import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import * as path from 'path';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import walletRoutes from './routes/wallet.routes';
import transactionRoutes from './routes/transaction.routes';
import adminRoutes from './routes/admin.routes';
import authRoutes from './routes/auth.routes';
import { verifyGlobalSmtpHealth } from './services/mail.service';
import { startWebhookRetryWorker } from './services/webhook.service';
import { prisma } from './lib/prisma';


const app = express();

// Middleware — CORS with preview-deployment regex support
const corsOrigins: (string | RegExp)[] = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => {
      o = o.trim();
      return o.startsWith('/') && o.endsWith('/') ? new RegExp(o.slice(1, -1)) : o;
    })
  : [
      'http://localhost:3000',
      'http://localhost:3001',
      /^https:\/\/walletos-admin-.*\.vercel\.app$/,
      /^https:\/\/walletos-web-.*\.netlify\.app$/,
    ];

app.use(cors({
  origin: async (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    if (corsOrigins.some(o => (typeof o === 'string' ? o === origin : o.test(origin)))) {
      cb(null, true);
      return;
    }
    try {
      const matchingConfig = await prisma.tenantConfig.findFirst({
        where: {
          allowedOrigins: {
            has: origin,
          },
        },
      });
      cb(null, !!matchingConfig);
    } catch (err) {
      console.error('CORS dynamic origin check error:', err);
      cb(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Sandbox', 'Idempotency-Key'],
}));
app.use(express.json());
app.use(requestIdMiddleware);

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// API Routes
app.use('/api/v1', walletRoutes);
app.use('/api/v1', transactionRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);

// Health check — root path for cloud host LB probes
app.get('/', (req, res) => {
  res.send({ status: 'healthy', service: 'WalletOS Engine' });
});

// Error handler (must be last)
app.use(errorHandlerMiddleware);

const port = process.env.PORT || 3333;

// Only start the server if not in test environment (supertest handles its own server)
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
    void verifyGlobalSmtpHealth();
    startWebhookRetryWorker();
  });
  server.on('error', console.error);
}

export { app };
