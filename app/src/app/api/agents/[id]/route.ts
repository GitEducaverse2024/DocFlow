import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = request.nextUrl.clone();
  url.pathname = `/api/cat-paws/${id}`;
  return NextResponse.rewrite(url);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = request.nextUrl.clone();
  url.pathname = `/api/cat-paws/${id}`;
  return NextResponse.rewrite(url);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = request.nextUrl.clone();
  url.pathname = `/api/cat-paws/${id}`;
  return NextResponse.rewrite(url);
}
