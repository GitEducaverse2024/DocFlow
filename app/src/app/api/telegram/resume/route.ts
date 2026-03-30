import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * API-06: POST /api/telegram/resume
 * Resume polling.
 */
export async function POST() {
  try {
    const config = db.prepare('SELECT status, token_encrypted FROM telegram_config WHERE id = 1').get() as { status: string; token_encrypted: string | null } | undefined;

    if (!config) {
      return NextResponse.json({ error: 'Telegram no esta configurado' }, { status: 404 });
    }

    if (!config.token_encrypted) {
      return NextResponse.json({ error: 'No hay token configurado' }, { status: 400 });
    }

    // Update DB status
    db.prepare("UPDATE telegram_config SET status = 'active', updated_at = datetime('now') WHERE id = 1").run();

    // Resume the service
    try {
      const { telegramBotService } = await import('@/lib/services/telegram-bot');
      telegramBotService.resume();
    } catch (err) {
      logger.error('telegram', 'Failed to resume service', { error: (err as Error).message });
    }

    logger.info('telegram', 'Telegram bot resumed');
    return NextResponse.json({ success: true, status: 'active' });
  } catch (err) {
    logger.error('telegram', 'POST /api/telegram/resume failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Error reanudando bot' }, { status: 500 });
  }
}
