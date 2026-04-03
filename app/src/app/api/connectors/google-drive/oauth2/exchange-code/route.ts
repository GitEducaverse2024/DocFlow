import { NextResponse } from 'next/server';
import { encrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Translate OAuth2 exchange errors to user-friendly Spanish messages.
 */
function translateError(err: Error): string {
  const msg = err.message || '';

  if (msg.includes('invalid_grant')) {
    return 'Codigo de autorizacion invalido o expirado. Genera uno nuevo.';
  }
  if (msg.includes('invalid_client')) {
    return 'Client ID o Client Secret incorrectos. Verifica tus credenciales de Google Cloud.';
  }
  if (msg.includes('redirect_uri_mismatch')) {
    return 'Error de configuracion: redirect_uri no coincide. Verifica la configuracion OAuth2 en Google Cloud Console.';
  }
  if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
    return 'No se pudo conectar con Google. Verifica tu conexion a internet.';
  }

  return msg;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, client_id, client_secret } = body;

    if (!code || !client_id || !client_secret) {
      return NextResponse.json(
        { error: 'code, client_id y client_secret son requeridos' },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { google } = require('googleapis');

    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      'http://localhost'
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.json(
        {
          error:
            'No se obtuvo refresh_token. Revoca acceso en myaccount.google.com/permissions y reintenta.',
        },
        { status: 400 }
      );
    }

    // Get user email for display
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    let email = '';
    try {
      const userInfo = await oauth2.userinfo.get();
      email = userInfo.data.email || '';
    } catch {
      // Non-critical — email is for display only
    }

    const refresh_token_encrypted = encrypt(tokens.refresh_token);
    const client_secret_encrypted = encrypt(client_secret);

    logger.info('connectors', 'Drive OAuth2 code exchanged successfully', {
      client_id: client_id.substring(0, 10) + '...',
      has_refresh_token: true,
      email: email ? email.substring(0, 5) + '...' : 'unknown',
    });

    return NextResponse.json({
      refresh_token_encrypted,
      client_secret_encrypted,
      client_id,
      email,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const translated = translateError(err);
    logger.error('connectors', 'Drive OAuth2 code exchange failed', { error: translated });
    return NextResponse.json(
      { error: translated },
      { status: 500 }
    );
  }
}
