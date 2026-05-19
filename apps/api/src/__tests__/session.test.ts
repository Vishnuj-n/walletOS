import request from 'supertest';
import { createTestApp } from './utils/app';
import { createTestSetup, cleanupTestData, disconnectPrisma } from './utils/test-helpers';

describe('Session Token Tests', () => {
  const app = createTestApp();

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('issues a wallet-scoped session token from API key', async () => {
    const { tenant, apiKey, wallet } = await createTestSetup();

    const response = await request(app)
      .post('/api/v1/auth/session')
      .set('x-api-key', apiKey.plainKey)
      .send({ wallet_id: wallet.id });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body.token).toContain('sess_');
    expect(response.body).toHaveProperty('wallet');
    expect(response.body.wallet).toHaveProperty('id', wallet.id);
    expect(response.body).toHaveProperty('expires_at');

    await cleanupTestData(tenant.id);
  });

  it('allows wallet reads with session token and blocks other wallets', async () => {
    const { tenant, apiKey, wallet } = await createTestSetup();

    const otherWallet = await request(app)
      .post('/api/v1/wallets')
      .set('x-api-key', apiKey.plainKey)
      .set('Idempotency-Key', 'session_other_wallet_1')
      .send({
        external_user_id: 'user_other_wallet',
        currency: 'INR',
        label: 'Secondary Wallet',
      });
    expect(otherWallet.status).toBe(201);

    const sessionResponse = await request(app)
      .post('/api/v1/auth/session')
      .set('x-api-key', apiKey.plainKey)
      .send({ wallet_id: wallet.id });

    const sessionToken = sessionResponse.body.token;
    expect(sessionResponse.status).toBe(200);

    const allowedWallet = await request(app)
      .get(`/api/v1/wallets/${wallet.id}`)
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(allowedWallet.status).toBe(200);

    const blockedWallet = await request(app)
      .get(`/api/v1/wallets/${otherWallet.body.wallet_id}`)
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(blockedWallet.status).toBe(403);

    const blockedTransactions = await request(app)
      .get('/api/v1/transactions')
      .query({ wallet_id: otherWallet.body.wallet_id })
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(blockedTransactions.status).toBe(403);

    await cleanupTestData(tenant.id);
  });
});
