import { NextResponse } from 'next/server';

const REQUEST_TIMEOUT_MS = 10_000;

export async function POST(request: Request) {
  try {
    const { wallet_id } = await request.json();

    if (typeof wallet_id !== 'string' || wallet_id.trim().length === 0) {
      return NextResponse.json(
        { error: 'wallet_id must be a non-empty string' },
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
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ wallet_id }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const upstreamError = errorData.error;
      const errorMessage =
        typeof upstreamError === 'string'
          ? upstreamError
          : typeof upstreamError === 'object' &&
              upstreamError !== null &&
              typeof upstreamError.message === 'string'
            ? upstreamError.message
            : `Upstream returned ${res.status}`;

      return NextResponse.json(
        { error: errorMessage },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request to upstream timed out' },
        { status: 504 }
      );
    }
    if (error instanceof Error) {
      console.error('Session generation error:', error);
    } else {
      console.error('Session generation error:', String(error));
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
