import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL('/api/cat-paws', url.origin);
  // Preserve existing query params and add mode=processor filter
  const existingParams = new URLSearchParams(url.search);
  existingParams.set('mode', 'processor');
  target.search = existingParams.toString();
  return NextResponse.redirect(target.toString(), 301);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  return NextResponse.redirect(new URL('/api/cat-paws', url.origin).toString(), 308);
}
