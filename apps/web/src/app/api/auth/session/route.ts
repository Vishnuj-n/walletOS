import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { wallet_id } = await request.json();

    if (!wallet_id) {
      return NextResponse.json(
        { error: 'wallet_id is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.WALLETOS_API_KEY;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;

    if (!apiKey || !apiUrl) {
      console.error('Missing configuration: WALLETOS_API_KEY or NEXT_PUBLIC_API_URL');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const res = await fetch(`${apiUrl}/auth/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ wallet_id }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || `Upstream returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Session generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
