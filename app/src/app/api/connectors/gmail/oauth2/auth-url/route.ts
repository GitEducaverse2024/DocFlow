import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { google } = require('googleapis');

    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://mail.google.com/'],
      prompt: 'consent',
    });

    logger.info('connectors', 'OAuth2 auth URL generated', {
      client_id: client_id.substring(0, 10) + '...',
    });

    return NextResponse.json({ url });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('connectors', 'Error generating OAuth2 auth URL', { error: msg });
    return NextResponse.json(
      { error: 'Error generando URL de autorizacion' },
      { status: 500 }
    );
  }
}
