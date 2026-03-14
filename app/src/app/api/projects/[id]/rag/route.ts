import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function redirect(request: NextRequest) {
  const url = new URL(request.url);
  const newPath = url.pathname.replace('/api/projects', '/api/catbrains');
  return NextResponse.redirect(new URL(newPath + url.search, url.origin), 301);
}

export async function DELETE(request: NextRequest) { return redirect(request); }

