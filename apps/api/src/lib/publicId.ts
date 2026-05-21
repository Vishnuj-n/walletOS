import { randomBytes } from 'crypto';

function generatePublicId(prefix: 'wal' | 'txn' | 'usr'): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export function generateWalletPublicId(): string {
  return generatePublicId('wal');
}

export function generateTransactionPublicId(): string {
  return generatePublicId('txn');
}

export function generateAdminUserPublicId(): string {
  return generatePublicId('usr');
}
