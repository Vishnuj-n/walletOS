import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(request: Request) {
  // Get the access token from Authorization header
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized - No token provided' }, { status: 401 });
  }

  // Create client with anon key to verify the token
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
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

  if (!supabaseServiceKey) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY is missing; refusing AdminUser lookup because the anon key may be blocked by RLS.');
    return NextResponse.json(
      { error: 'Admin service configuration missing. Contact an administrator.' },
      { status: 500 }
    );
  }

  const dbKey = supabaseServiceKey;
  const dbClient = createClient(supabaseUrl, dbKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Fetch admin user details from the AdminUser table
  const { data: adminUser, error: adminError } = await dbClient
    .from('AdminUser')
    .select('id, email, tenantId, role, supabaseUid')
    .eq('supabaseUid', user.id)
    .single();

  if (adminError || !adminUser) {
    const adminLookupError = adminError?.message || adminError?.code || 'unknown admin lookup error';
    console.error('Admin user lookup failed:', adminLookupError);
    return NextResponse.json(
      {
        error: supabaseServiceKey
          ? 'Admin user not found. Contact administrator for access.'
          : 'Admin service configuration missing. Contact an administrator.',
      },
      { status: 403 }
    );
  }

  return NextResponse.json({
    adminUser: {
      id: adminUser.id,
      email: adminUser.email,
      tenantId: adminUser.tenantId,
      role: adminUser.role,
    },
  });
}
