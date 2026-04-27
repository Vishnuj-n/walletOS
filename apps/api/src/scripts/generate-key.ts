import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

function sanitizeTenantName(input: string): string {
  if (!input || typeof input !== 'string') {
    console.error('Error: tenantName must be a non-empty string');
    process.exit(1);
  }

  if (input.length > 100) {
    console.error('Error: tenantName must be 100 characters or less');
    process.exit(1);
  }

  // Allow only letters, digits, spaces, hyphens, and underscores
  const sanitized = input.replace(/[^a-zA-Z0-9\s\-_]/g, '');

  if (sanitized.trim().length === 0) {
    console.error('Error: tenantName must contain at least one valid character (letters, digits, spaces, hyphens, or underscores)');
    process.exit(1);
  }

  return sanitized;
}

async function main() {
  const tenantName = sanitizeTenantName(process.argv[2] || 'Postman Tenant');
  
  const emailDomain = tenantName.toLowerCase().replace(/\s+/g, '-');
  const tenant = await prisma.tenant.create({
    data: { name: tenantName, contactEmail: `admin@${emailDomain}.com` }
  });

  const plainKey = `wlt_test_${Date.now()}_${randomBytes(24).toString('base64url')}`;
  const keyHash = createHash('sha256').update(plainKey).digest('hex');

  await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      keyHash,
      prefix: plainKey.substring(0, 12),
      scope: 'read_write',
      isSandbox: true,
      isActive: true,
    }
  });

  console.log(`\n🚀 Created Tenant: ${tenant.name}`);
  console.log(`🔑 API KEY: ${plainKey}\n`);
}

main().catch(console.error).finally(() => prisma.$disconnect());