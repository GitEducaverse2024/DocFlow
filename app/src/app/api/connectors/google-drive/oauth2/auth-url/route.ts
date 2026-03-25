import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const client_id = searchParams.get('client_id');
    const client_secret = searchParams.get('client_secret');

    if (!client_id || !client_secret) {
      return NextResponse.json(
        { error: 'client_id y client_secret son requeridos' },
        { status: 400 }
      );
    }

    // Build redirect URI from request origin
    const origin = request.headers.get('origin')
      || request.headers.get('referer')?.replace(/\/[^/]*$/, '')
      || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const redirect_uri = `${origin}/api/connectors/google-drive/oauth2/callback`;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { google } = require('googleapis');

    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uri
    );

    // Encode credentials in state param (encrypted) for callback retrieval
    const statePayload = JSON.stringify({ client_id, client_secret });
    const encryptedState = encrypt(statePayload);

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive'],
      prompt: 'consent',
      state: encryptedState,
    });

    logger.info('connectors', 'Drive OAuth2 auth URL generated', {
      client_id: client_id.substring(0, 10) + '...',
      redirect_uri,
    });

    return NextResponse.json({ url, redirect_uri });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('connectors', 'Error generating Drive OAuth2 auth URL', { error: msg });
    return NextResponse.json(
      { error: 'Error generando URL de autorizacion' },
      { status: 500 }
    );
  }
}
