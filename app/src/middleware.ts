import { NextRequest, NextResponse } from 'next/server';

const LOCALE_COOKIE = 'docatflow_locale';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Don't redirect on these paths
  const excluded = [
    '/welcome',
    '/api/',
    '/_next/',
    '/Images/',
    '/favicon',
  ];
  if (excluded.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // If no locale cookie, redirect to welcome
  const locale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!locale) {
    return NextResponse.redirect(new URL('/welcome', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
