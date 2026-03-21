import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/api/cat-paws';
  return NextResponse.rewrite(url);
}

export async function POST(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/api/cat-paws';
  return NextResponse.rewrite(url);
}
