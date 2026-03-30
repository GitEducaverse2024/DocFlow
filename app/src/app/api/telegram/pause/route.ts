import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * API-05: POST /api/telegram/pause
 * Pause polling without clearing config.
 */
export async function POST() {
  try {
    const config = db.prepare('SELECT status FROM telegram_config WHERE id = 1').get() as { status: string } | undefined;

    if (!config) {
      return NextResponse.json({ error: 'Telegram no esta configurado' }, { status: 404 });
    }

    if (config.status !== 'active') {
      return NextResponse.json({ error: 'El bot no esta activo' }, { status: 400 });
    }

    // Update DB status
    db.prepare("UPDATE telegram_config SET status = 'paused', updated_at = datetime('now') WHERE id = 1").run();

    // Pause the service
    try {
      const { telegramBotService } = await import('@/lib/services/telegram-bot');
      telegramBotService.pause();
    } catch (err) {
      logger.error('telegram', 'Failed to pause service', { error: (err as Error).message });
    }

    logger.info('telegram', 'Telegram bot paused');
    return NextResponse.json({ success: true, status: 'paused' });
  } catch (err) {
    logger.error('telegram', 'POST /api/telegram/pause failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Error pausando bot' }, { status: 500 });
  }
}
