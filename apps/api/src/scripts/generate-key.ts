import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const tenantName = process.argv[2] || 'Postman Tenant';
  
  const tenant = await prisma.tenant.create({
    data: { name: tenantName, contactEmail: `admin@${tenantName.toLowerCase().replace(/\s/g, '')}.com` }
  });

  const plainKey = `wlt_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
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