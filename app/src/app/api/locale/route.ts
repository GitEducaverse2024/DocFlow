import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SUPPORTED_LOCALES, LOCALE_COOKIE, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { locale } = await req.json();
    if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
      return NextResponse.json({ error: 'Locale no soportado' }, { status: 400 });
    }
    const response = NextResponse.json({ ok: true, locale });
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const locale = cookieStore.get(LOCALE_COOKIE)?.value || 'es';
  return NextResponse.json({ locale });
}
