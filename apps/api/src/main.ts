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

import { createHash } from 'crypto';

app.use(cors(async (req, cb) => {
  const origin = req.header('Origin');
  const corsOptions: cors.CorsOptions = {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Sandbox', 'Idempotency-Key', 'X-Tenant-Id', 'X-API-Key', 'x-tenant-id', 'x-api-key'],
  };

  if (!origin) {
    corsOptions.origin = true;
    cb(null, corsOptions);
    return;
  }

  if (corsOrigins.some(o => (typeof o === 'string' ? o === origin : o.test(origin)))) {
    corsOptions.origin = origin;
    cb(null, corsOptions);
    return;
  }

  try {
    let tenantId: string | null = null;

    // 1. Check custom X-Tenant-Id header
    const tenantHeader = req.headers['x-tenant-id'];
    if (typeof tenantHeader === 'string' && tenantHeader.trim()) {
      tenantId = tenantHeader.trim();
    }

    // 2. Check X-API-Key header
    if (!tenantId) {
      const apiKey = req.headers['x-api-key'];
      if (typeof apiKey === 'string' && apiKey.trim()) {
        const keyHash = createHash('sha256').update(apiKey.trim()).digest('hex');
        const apiKeyRecord = await prisma.apiKey.findUnique({
          where: { keyHash },
          select: { tenantId: true },
        });
        if (apiKeyRecord) {
          tenantId = apiKeyRecord.tenantId;
        }
      }
    }

    // 3. Check Authorization header
    if (!tenantId) {
      const authHeader = req.headers['authorization'];
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        if (token.startsWith('sess_') || token.startsWith('adm_')) {
          const tokenHash = createHash('sha256').update(token).digest('hex');
          const session = await prisma.sessionToken.findFirst({
            where: {
              tokenHash,
              expiresAt: { gt: new Date() },
            },
            select: { tenantId: true },
          });
          if (session) {
            tenantId = session.tenantId;
          }
        }
      }
    }

    // 4. Check subdomain
    if (!tenantId) {
      const host = req.headers.host || req.hostname;
      if (host) {
        const parts = host.split('.');
        if (parts.length > 2) {
          const subdomain = parts[0].toLowerCase();
          if (!['api', 'admin', 'web', 'www', 'localhost', 'dev', 'staging', 'mail'].includes(subdomain)) {
            tenantId = subdomain;
          }
        }
      }
    }

    const whereClause: { tenantId?: string; allowedOrigins: { has: string } } = {
      allowedOrigins: {
        has: origin,
      },
    };

    if (tenantId) {
      whereClause.tenantId = tenantId;
    }

    const matchingConfig = await prisma.tenantConfig.findFirst({
      where: whereClause,
    });

    corsOptions.origin = matchingConfig ? origin : false;
    cb(null, corsOptions);
  } catch (err) {
    console.error('CORS dynamic origin check error:', err);
    corsOptions.origin = false;
    cb(null, corsOptions);
  }
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
