import { NextResponse } from 'next/server';
import { encrypt } from '@/lib/crypto';
import { testConnection } from '@/lib/services/email-service';
import { GmailConfig, GmailAccountType, GmailAuthMode } from '@/lib/types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user, app_password, account_type, auth_mode,
            client_id, client_secret, refresh_token_encrypted } = body;

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'user (Gmail address) es requerido' },
        { status: 400 }
      );
    }

    if (!['personal', 'workspace'].includes(account_type)) {
      return NextResponse.json(
        { ok: false, error: 'account_type debe ser personal o workspace' },
        { status: 400 }
      );
    }

    const mode: GmailAuthMode = (auth_mode || 'app_password') as GmailAuthMode;

    let config: GmailConfig;

    if (mode === 'oauth2') {
      // OAuth2: need client_id + client_secret + refresh_token_encrypted
      if (!client_id || !refresh_token_encrypted) {
        return NextResponse.json(
          { ok: false, error: 'OAuth2 requiere client_id y refresh_token_encrypted' },
          { status: 400 }
        );
      }
      config = {
        user,
        account_type: account_type as GmailAccountType,
        auth_mode: 'oauth2',
        client_id,
        // client_secret may be plaintext (from wizard input) or pre-encrypted
        ...(client_secret ? { client_secret_encrypted: encrypt(client_secret) } : {}),
        refresh_token_encrypted,
      };
    } else {
      // App Password
      if (!app_password) {
        return NextResponse.json(
          { ok: false, error: 'app_password es requerido para modo App Password' },
          { status: 400 }
        );
      }
      config = {
        user,
        account_type: account_type as GmailAccountType,
        auth_mode: 'app_password',
        app_password_encrypted: encrypt(app_password.replace(/\s/g, '')),
      };
    }

    logger.info('connectors', 'Testing Gmail credentials (pre-save)', { user, auth_mode: mode });

    const result = await testConnection(config);

    return NextResponse.json({ ok: result.ok, ...(result.error ? { error: result.error } : {}) });
  } catch (error) {
    logger.error('connectors', 'Error testing Gmail credentials', { error: (error as Error).message });
    return NextResponse.json({ ok: false, error: 'Error interno del servidor' }, { status: 500 });
  }
}
