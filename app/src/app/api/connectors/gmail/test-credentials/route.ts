import { NextResponse } from 'next/server';
import { encrypt } from '@/lib/crypto';
import { testConnection } from '@/lib/services/email-service';
import { GmailConfig, GmailAccountType, GmailAuthMode } from '@/lib/types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user, app_password, account_type, auth_mode } = body;

    if (!user || !app_password) {
      return NextResponse.json(
        { ok: false, error: 'user y app_password son requeridos' },
        { status: 400 }
      );
    }

    if (!['personal', 'workspace'].includes(account_type)) {
      return NextResponse.json(
        { ok: false, error: 'account_type debe ser personal o workspace' },
        { status: 400 }
      );
    }

    const config: GmailConfig = {
      user,
      account_type: account_type as GmailAccountType,
      auth_mode: (auth_mode || 'app_password') as GmailAuthMode,
      app_password_encrypted: encrypt(app_password.replace(/\s/g, '')),
    };

    logger.info('connectors', 'Testing Gmail credentials (pre-save)', { user });

    const result = await testConnection(config);

    return NextResponse.json({ ok: result.ok, ...(result.error ? { error: result.error } : {}) });
  } catch (error) {
    logger.error('connectors', 'Error testing Gmail credentials', { error: (error as Error).message });
    return NextResponse.json({ ok: false, error: 'Error interno del servidor' }, { status: 500 });
  }
}
