import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface TelegramConfigRow {
  id: number;
  token_encrypted: string | null;
  bot_username: string | null;
  status: string;
  authorized_usernames: string;
  authorized_chat_ids: string;
  permissions_no_sudo: string;
  messages_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * API-01: GET /api/telegram/config
 * Returns telegram config with masked token (never in clear).
 */
export async function GET() {
  try {
    const config = db.prepare('SELECT * FROM telegram_config WHERE id = 1').get() as TelegramConfigRow | undefined;

    if (!config) {
      return NextResponse.json({ configured: false });
    }

    let tokenHint: string | null = null;
    if (config.token_encrypted) {
      try {
        const raw = decrypt(config.token_encrypted);
        tokenHint = '****' + raw.slice(-4);
      } catch {
        tokenHint = '****';
      }
    }

    return NextResponse.json({
      configured: true,
      bot_username: config.bot_username,
      status: config.status,
      authorized_usernames: config.authorized_usernames,
      authorized_chat_ids: config.authorized_chat_ids,
      permissions_no_sudo: config.permissions_no_sudo,
      messages_count: config.messages_count,
      last_message_at: config.last_message_at,
      token_hint: tokenHint,
      created_at: config.created_at,
      updated_at: config.updated_at,
    });
  } catch (err) {
    logger.error('telegram-api', 'GET /api/telegram/config failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * API-02: POST /api/telegram/config
 * Save encrypted token + initial config (wizard step 1).
 * Validates token against Telegram API before saving.
 */
export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return NextResponse.json({ error: 'Token es requerido' }, { status: 400 });
    }

    // Verify token against Telegram API
    const testRes = await fetch(`https://api.telegram.org/bot${token.trim()}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!testRes.ok) {
      return NextResponse.json({ error: 'Token invalido. Verifica con @BotFather.' }, { status: 400 });
    }

    const botInfo = await testRes.json();
    if (!botInfo.ok || !botInfo.result) {
      return NextResponse.json({ error: 'Respuesta inesperada de Telegram API' }, { status: 400 });
    }

    const botUsername = botInfo.result.username;
    const tokenEncrypted = encrypt(token.trim());

    // Upsert config (single-row table, id=1)
    db.prepare(`
      INSERT OR REPLACE INTO telegram_config
        (id, token_encrypted, bot_username, status, authorized_usernames, authorized_chat_ids, permissions_no_sudo, messages_count, last_message_at, created_at, updated_at)
      VALUES
        (1, ?, ?, 'inactive', '[]', '[]', '[]', 0, NULL, COALESCE((SELECT created_at FROM telegram_config WHERE id = 1), datetime('now')), datetime('now'))
    `).run(tokenEncrypted, botUsername);

    logger.info('telegram-api', 'Token saved', { bot_username: botUsername });

    return NextResponse.json({ success: true, bot_username: botUsername });
  } catch (err) {
    logger.error('telegram-api', 'POST /api/telegram/config failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Error guardando configuracion' }, { status: 500 });
  }
}

/**
 * API-03: PATCH /api/telegram/config
 * Update permissions, authorized users, status.
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { authorized_usernames, permissions_no_sudo, status } = body;

    const config = db.prepare('SELECT * FROM telegram_config WHERE id = 1').get() as TelegramConfigRow | undefined;
    if (!config) {
      return NextResponse.json({ error: 'Telegram no esta configurado' }, { status: 404 });
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (authorized_usernames !== undefined) {
      const val = typeof authorized_usernames === 'string' ? authorized_usernames : JSON.stringify(authorized_usernames);
      updates.push('authorized_usernames = ?');
      params.push(val);
    }

    if (permissions_no_sudo !== undefined) {
      const val = typeof permissions_no_sudo === 'string' ? permissions_no_sudo : JSON.stringify(permissions_no_sudo);
      updates.push('permissions_no_sudo = ?');
      params.push(val);
    }

    if (status !== undefined && ['active', 'paused', 'inactive'].includes(status)) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
    }

    updates.push("updated_at = datetime('now')");
    const sql = `UPDATE telegram_config SET ${updates.join(', ')} WHERE id = 1`;
    db.prepare(sql).run(...params);

    logger.info('telegram-api', 'Config updated', { fields: updates.map(u => u.split(' = ')[0]) });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('telegram-api', 'PATCH /api/telegram/config failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Error actualizando configuracion' }, { status: 500 });
  }
}

/**
 * DELETE /api/telegram/config
 * Deactivate: set status to inactive and clear token.
 */
export async function DELETE() {
  try {
    const config = db.prepare('SELECT * FROM telegram_config WHERE id = 1').get() as TelegramConfigRow | undefined;
    if (!config) {
      return NextResponse.json({ error: 'Telegram no esta configurado' }, { status: 404 });
    }

    // Stop the bot service
    try {
      const { telegramBotService } = await import('@/lib/services/telegram-bot');
      telegramBotService.stop();
    } catch {
      // Service may not be running
    }

    // Reset config but keep the row
    db.prepare(`
      UPDATE telegram_config
      SET token_encrypted = NULL, bot_username = NULL, status = 'inactive',
          authorized_usernames = '[]', authorized_chat_ids = '[]', permissions_no_sudo = '[]',
          updated_at = datetime('now')
      WHERE id = 1
    `).run();

    logger.info('telegram-api', 'Telegram bot deactivated');
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('telegram-api', 'DELETE /api/telegram/config failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Error desactivando bot' }, { status: 500 });
  }
}
