import { NextResponse } from 'next/server';
import { encrypt } from '@/lib/crypto';
import { testConnection, sendEmail } from '@/lib/services/email-service';
import { GmailConfig, GmailAccountType, GmailAuthMode } from '@/lib/types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user, app_password, account_type, auth_mode, from_name } = body;

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
      ...(from_name ? { from_name } : {}),
    };

    logger.info('connectors', 'Testing Gmail connection before sending test email', { user });

    // First verify connection
    const testResult = await testConnection(config);
    if (!testResult.ok) {
      return NextResponse.json({ ok: false, error: testResult.error });
    }

    // Send test email to self
    const dateStr = new Date().toLocaleString('es-ES');
    const result = await sendEmail(config, {
      to: user,
      subject: 'DoCatFlow — Conector Gmail funcionando',
      html_body: `<h2>Tu conector Gmail esta configurado correctamente</h2><p>Este email fue enviado desde DoCatFlow como prueba de conexion.</p><p><small>Fecha: ${dateStr}</small></p>`,
    });

    return NextResponse.json({
      ok: result.ok,
      ...(result.messageId ? { messageId: result.messageId } : {}),
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (error) {
    logger.error('connectors', 'Error sending test email', { error: (error as Error).message });
    return NextResponse.json({ ok: false, error: 'Error interno del servidor' }, { status: 500 });
  }
}
