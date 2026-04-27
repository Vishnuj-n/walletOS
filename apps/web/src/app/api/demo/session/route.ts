import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const DEMO_API_KEY = process.env.WALLETOS_DEMO_API_KEY;

export async function GET(request: NextRequest) {
  const walletId = request.nextUrl.searchParams.get('walletId');
  if (!walletId) {
    return NextResponse.json({ error: 'walletId is required' }, { status: 400 });
  }

  if (!API_BASE_URL || !DEMO_API_KEY) {
    return NextResponse.json(
      { error: 'Server env is missing NEXT_PUBLIC_API_URL or WALLETOS_DEMO_API_KEY' },
      { status: 500 }
    );
  }

  const response = await fetch(`${API_BASE_URL}/auth/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': DEMO_API_KEY,
    },
    body: JSON.stringify({ wallet_id: walletId }),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json(
      { error: payload?.error?.message || 'Failed to create session token' },
      { status: response.status }
    );
  }

  return NextResponse.json(payload);
}
