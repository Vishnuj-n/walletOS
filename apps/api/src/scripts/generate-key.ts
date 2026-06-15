import { PrismaClient, KeyScope } from '@prisma/client';
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
  const args = process.argv.slice(2);
  const tenantNameArg = args.find(a => !a.startsWith('--'));
  const tenantName = sanitizeTenantName(tenantNameArg || 'Postman Tenant');
  
  // Parse scope: --scope=read_only | read_write | admin (default)
  let scope: KeyScope = 'admin';
  const scopeArg = args.find(a => a.startsWith('--scope='));
  if (scopeArg) {
    const val = scopeArg.split('=')[1];
    if (['read_only', 'read_write', 'admin'].includes(val)) {
      scope = val as KeyScope;
    } else {
      console.warn(`⚠️ Invalid scope "${val}", defaulting to "admin"`);
    }
  }

  // Parse environment: --live flag makes it a live key, otherwise sandbox
  const isSandbox = !args.includes('--live');

  const emailDomain = tenantName.toLowerCase().replace(/\s+/g, '-');
  
  // Find or create tenant
  let tenant = await prisma.tenant.findFirst({ where: { name: tenantName } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: tenantName, contactEmail: `admin@${emailDomain}.com` }
    });
    console.log(`\n🚀 Created Tenant: ${tenant.name}`);
  } else {
    console.log(`\n🏢 Using existing Tenant: ${tenant.name}`);
  }

  const prefixStr = isSandbox ? 'wlt_test' : 'wlt_live';
  const plainKey = `${prefixStr}_${Date.now()}_${randomBytes(24).toString('base64url')}`;
  const keyHash = createHash('sha256').update(plainKey).digest('hex');

  const apiKey = await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      keyHash,
      prefix: plainKey.substring(0, 12),
      scope,
      isSandbox,
      isActive: true,
      name: `${scope.replace('_', ' ')} ${isSandbox ? 'Sandbox' : 'Live'} Key`,
    }
  });

  const maskedKey = `${plainKey.substring(0, 12)}...${plainKey.substring(plainKey.length - 4)}`;
  console.log(`🔑 API KEY (masked): ${maskedKey}`);
  console.log(`📄 Scope:   ${scope}`);
  console.log(`🌐 Mode:    ${isSandbox ? 'Sandbox' : 'Live'}`);
  console.log(`📛 Name:    ${apiKey.name}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
