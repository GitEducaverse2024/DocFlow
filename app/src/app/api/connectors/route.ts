import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { encrypt } from '@/lib/crypto';
import { GmailConfig } from '@/lib/types';
import { logger } from '@/lib/logger';

const VALID_TYPES = ['n8n_webhook', 'http_api', 'mcp_server', 'email', 'gmail'];

const SENSITIVE_FIELDS = ['app_password_encrypted', 'client_secret_encrypted', 'refresh_token_encrypted'];
const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

function maskGmailConfig(connector: Record<string, unknown>): Record<string, unknown> {
  if (connector.type !== 'gmail' || !connector.config) return connector;
  try {
    const config = typeof connector.config === 'string' ? JSON.parse(connector.config) : connector.config;
    for (const field of SENSITIVE_FIELDS) {
      if (config[field]) {
        config[field] = MASK;
      }
    }
    return { ...connector, config: JSON.stringify(config) };
  } catch {
    return connector;
  }
}

export async function GET() {
  try {
    const connectors = db.prepare('SELECT * FROM connectors ORDER BY updated_at DESC').all() as Record<string, unknown>[];
    const masked = connectors.map(c => maskGmailConfig(c));
    return NextResponse.json(masked);
  } catch (error) {
    logger.error('connectors', 'Error listando conectores', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type, config, emoji, description } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const count = (db.prepare('SELECT COUNT(*) as c FROM connectors').get() as { c: number }).c;
    if (count >= 20) {
      return NextResponse.json({ error: 'Maximum of 20 connectors reached' }, { status: 400 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    let finalConfig = config ? JSON.stringify(config) : null;
    let finalEmoji = emoji || '\uD83D\uDD0C';
    let gmailSubtype: string | null = null;

    if (type === 'gmail') {
      const { user, account_type, auth_mode, from_name, app_password, client_id, client_secret, refresh_token } = body;

      if (!user) {
        return NextResponse.json({ error: 'user (Gmail address) is required for gmail type' }, { status: 400 });
      }
      if (!['personal', 'workspace'].includes(account_type)) {
        return NextResponse.json({ error: 'account_type must be personal or workspace' }, { status: 400 });
      }

      const gmailConfig: GmailConfig = {
        user,
        account_type,
        auth_mode: auth_mode || 'app_password',
        ...(from_name ? { from_name } : {}),
        ...(client_id ? { client_id } : {}),
        ...(app_password ? { app_password_encrypted: encrypt(app_password.replace(/\s/g, '')) } : {}),
        ...(client_secret ? { client_secret_encrypted: encrypt(client_secret) } : {}),
        ...(refresh_token ? { refresh_token_encrypted: encrypt(refresh_token) } : {}),
      };

      finalConfig = JSON.stringify(gmailConfig);
      finalEmoji = emoji || '\uD83D\uDCE7';
      gmailSubtype = account_type === 'workspace' ? 'gmail_workspace' : 'gmail_personal';
    }

    db.prepare(`
      INSERT INTO connectors (id, name, description, emoji, type, config, gmail_subtype, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, description || null, finalEmoji, type, finalConfig, gmailSubtype, now, now);

    const connector = db.prepare('SELECT * FROM connectors WHERE id = ?').get(id) as Record<string, unknown>;
    return NextResponse.json(maskGmailConfig(connector), { status: 201 });
  } catch (error) {
    logger.error('connectors', 'Error creando conector', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
