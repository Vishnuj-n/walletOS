import type { AdminMeResponse, TransactionSearchQuery } from './types';

describe('types', () => {
  it('supports admin and search transport contracts', () => {
    const search: TransactionSearchQuery = {
      transactionId: 'tx_123',
      requestId: 'req_123',
      idempotencyKey: 'idem_123',
    };

    const admin: AdminMeResponse = {
      adminUser: {
        id: 'admin_1',
        email: 'admin@example.com',
        tenantId: 'tenant_1',
        role: 'superadmin',
      },
    };

    expect(search.transactionId).toBe('tx_123');
    expect(admin.adminUser.role).toBe('superadmin');
  });
});
