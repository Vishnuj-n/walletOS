import { generateAdminUserPublicId, generateTransactionPublicId, generateWalletPublicId } from '../lib/publicId';

describe('publicId generators', () => {
  it('should generate 128-bit wallet public IDs', () => {
    expect(generateWalletPublicId()).toMatch(/^wal_[a-f0-9]{32}$/);
  });

  it('should generate 128-bit transaction public IDs', () => {
    expect(generateTransactionPublicId()).toMatch(/^txn_[a-f0-9]{32}$/);
  });

  it('should generate 128-bit admin user public IDs', () => {
    expect(generateAdminUserPublicId()).toMatch(/^usr_[a-f0-9]{32}$/);
  });
});