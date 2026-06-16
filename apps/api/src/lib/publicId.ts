import { randomBytes } from 'crypto';

function generatePublicId(prefix: 'wal' | 'txn' | 'usr'): string {
  return `${prefix}_${randomBytes(16).toString('hex')}`;
}

function cleanAcronym(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return cleaned.slice(0, 3).padEnd(3, 'x');
}

export function generateWalletPublicId(tenantName = 'tst'): string {
  const acronym = cleanAcronym(tenantName);
  return `wal_${acronym}_${randomBytes(4).toString('hex')}`;
}

export function generateTransactionPublicId(): string {
  return generatePublicId('txn');
}

export function generateAdminUserPublicId(): string {
  return generatePublicId('usr');
}

