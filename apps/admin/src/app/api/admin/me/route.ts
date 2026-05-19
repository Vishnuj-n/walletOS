import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { AdminRole } from '@walletOS/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

const adminMeResponseSchema = z.object({
  adminUser: z.object({
    id: z.string().min(1),
    email: z.string().email(),
    tenantId: z.string().min(1),
    role: z.custom<AdminRole>((val): val is AdminRole => {
      return val === 'support' || val === 'finance' || val === 'tenant_admin' || val === 'superadmin';
    }),
  }),
});

export async function GET(request: Request) {
  // Forward the Authorization header to the backend API
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');

  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized - No token provided' }, { status: 401 });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/admin/me`, {
      headers: {
        Authorization: authHeader,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    const parsed = adminMeResponseSchema.safeParse(data);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid admin profile payload' }, { status: 502 });
    }

    return NextResponse.json(parsed.data);
  } catch (error) {
    console.error('Failed to proxy to backend API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch admin user. Backend API unavailable.' },
      { status: 503 }
    );
  }
}
