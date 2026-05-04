import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Prisma singleton for database access
const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
globalForPrisma.prisma = prisma;

export async function GET(request: Request) {
  // Get the access token from Authorization header
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized - No token provided' }, { status: 401 });
  }

  // Create client with the service role key to verify the token
  const authClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Verify the token and get user
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    console.error('Token verification failed:', userError);
    return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
  }

  // Fetch admin user details from database using Prisma
  try {
    const adminUser = await prisma.adminUser.findFirst({
      where: {
        supabaseUid: user.id,
      },
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Admin user not found. Contact administrator for access.' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        adminUser: {
          id: adminUser.id,
          email: adminUser.email,
          tenantId: adminUser.tenantId,
          role: adminUser.role,
        },
      },
    );
  } catch (error) {
    console.error('Admin user lookup failed:', error);
    return NextResponse.json(
      { error: 'Failed to lookup admin user. Contact administrator.' },
      { status: 500 }
    );
  }

}
