import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface TelegramConfigRow {
  id: number;
  token_encrypted: string | null;
}

/**
 * API-04: POST /api/telegram/test
 * Verify token against Telegram API, return bot info.
 */
export async function POST() {
  try {
    const config = db.prepare('SELECT token_encrypted FROM telegram_config WHERE id = 1').get() as TelegramConfigRow | undefined;

    if (!config || !config.token_encrypted) {
      return NextResponse.json({ error: 'No hay token configurado' }, { status: 404 });
    }

    let token: string;
    try {
      token = decrypt(config.token_encrypted);
    } catch {
      return NextResponse.json({ error: 'Error descifrando token' }, { status: 500 });
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error('telegram', 'Token test failed', { status: res.status, body });
      return NextResponse.json({ success: false, error: 'Token invalido o expirado' }, { status: 400 });
    }

    const data = await res.json();
    if (!data.ok || !data.result) {
      return NextResponse.json({ success: false, error: 'Respuesta inesperada de Telegram' }, { status: 400 });
    }

    const { id, username, first_name } = data.result;

    return NextResponse.json({
      success: true,
      bot: { id, username, first_name },
    });
  } catch (err) {
    logger.error('telegram', 'POST /api/telegram/test failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Error verificando token' }, { status: 500 });
  }
}
