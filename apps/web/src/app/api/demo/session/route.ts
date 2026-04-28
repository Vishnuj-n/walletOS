import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const DEMO_API_KEY = process.env.WALLETOS_DEMO_API_KEY;
// Hardcoded demo wallet ID to prevent unauthorized session token generation
const DEMO_WALLET_ID = process.env.WALLETOS_DEMO_WALLET_ID;

export async function GET(request: NextRequest) {
  if (!DEMO_WALLET_ID) {
    return NextResponse.json(
      { error: 'Server env is missing WALLETOS_DEMO_WALLET_ID' },
      { status: 500 }
    );
  }

  if (!API_BASE_URL || !DEMO_API_KEY) {
    return NextResponse.json(
      { error: 'Server env is missing NEXT_PUBLIC_API_URL or WALLETOS_DEMO_API_KEY' },
      { status: 500 }
    );
  }

  // Validate walletId query param matches the hardcoded demo wallet
  const { searchParams } = new URL(request.url);
  const walletId = searchParams.get('walletId');
  if (walletId !== null && walletId !== DEMO_WALLET_ID) {
    return NextResponse.json(
      { error: 'Invalid wallet ID for demo session' },
      { status: 400 }
    );
  }

  const response = await fetch(`${API_BASE_URL}/auth/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': DEMO_API_KEY,
    },
    body: JSON.stringify({ wallet_id: DEMO_WALLET_ID }),
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
