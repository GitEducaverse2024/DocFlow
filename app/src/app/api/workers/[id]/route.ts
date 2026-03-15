import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const target = new URL(`/api/cat-paws/${id}`, url.origin);
  target.search = url.search;
  return NextResponse.redirect(target.toString(), 301);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  return NextResponse.redirect(new URL(`/api/cat-paws/${id}`, url.origin).toString(), 308);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  return NextResponse.redirect(new URL(`/api/cat-paws/${id}`, url.origin).toString(), 308);
}
