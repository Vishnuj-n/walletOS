import { generateAdminUserPublicId, generateTransactionPublicId, generateWalletPublicId } from '../lib/publicId';

describe('publicId generators', () => {
  it('should generate shortened tenant-prefixed wallet public IDs', () => {
    expect(generateWalletPublicId()).toMatch(/^wal_[a-z0-9]{3}_[a-f0-9]{8}$/);
    expect(generateWalletPublicId('Zomato')).toMatch(/^wal_zom_[a-f0-9]{8}$/);
    expect(generateWalletPublicId('A')).toMatch(/^wal_axx_[a-f0-9]{8}$/);
  });

  it('should generate 128-bit transaction public IDs', () => {
    expect(generateTransactionPublicId()).toMatch(/^txn_[a-f0-9]{32}$/);
  });

  it('should generate 128-bit admin user public IDs', () => {
    expect(generateAdminUserPublicId()).toMatch(/^usr_[a-f0-9]{32}$/);
  });
});