import { getAdminSession, getAdminToken, setAdminSession } from '../src/lib/adminSession';

describe('adminSession', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('stores and clears the admin token alongside the admin user', () => {
    setAdminSession(
      {
        id: 'usr_dev_admin_seed',
        email: 'admin@example.com',
        tenantId: 'tnt_development_test',
        role: 'tenant_admin',
      },
      'adm_test_token'
    );

    expect(getAdminSession()).toEqual({
      id: 'usr_dev_admin_seed',
      email: 'admin@example.com',
      tenantId: 'tnt_development_test',
      role: 'tenant_admin',
    });
    expect(getAdminToken()).toBe('adm_test_token');

    setAdminSession(null);

    expect(getAdminSession()).toBeNull();
    expect(getAdminToken()).toBeNull();
  });
});
