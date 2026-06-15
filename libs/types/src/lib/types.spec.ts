import type { AdminMeResponse } from './types';

describe('types', () => {
  it('supports admin and search transport contracts', () => {
    const admin: AdminMeResponse = {
      adminUser: {
        id: 'admin_1',
        email: 'admin@example.com',
        tenantId: 'tenant_1',
        role: 'superadmin',
      },
    };

    expect(admin.adminUser.role).toBe('superadmin');
  });
});
