import { NextRequest, NextResponse } from 'next/server';
import { encrypt, decrypt } from '@/lib/crypto';
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Google sends error param if user denied consent
    if (error) {
      const errorHtml = `
        <!DOCTYPE html><html><body>
        <h2>Error de autorizacion</h2>
        <p>${error === 'access_denied' ? 'Acceso denegado. Cierra esta ventana e intentalo de nuevo.' : error}</p>
        <script>
          window.opener && window.opener.postMessage({ type: 'drive-oauth-callback', error: '${error}' }, '*');
        </script>
        </body></html>
      `;
      return new Response(errorHtml, { headers: { 'Content-Type': 'text/html' } });
    }

    if (!code || !state) {
      return NextResponse.json({ error: 'code y state son requeridos' }, { status: 400 });
    }

    // Decrypt state to retrieve client_id + client_secret
    let client_id: string;
    let client_secret: string;
    try {
      const statePayload = JSON.parse(decrypt(state));
      client_id = statePayload.client_id;
      client_secret = statePayload.client_secret;
    } catch {
      return NextResponse.json({ error: 'State invalido o corrupto' }, { status: 400 });
    }

    // Build redirect URI (must match what was used in auth-url)
    const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const redirect_uri = `${origin}/api/connectors/google-drive/oauth2/callback`;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { google } = require('googleapis');

    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      const noRefreshHtml = `
        <!DOCTYPE html><html><body>
        <h2>Error</h2>
        <p>No se obtuvo refresh_token. Revoca acceso en myaccount.google.com y reintenta.</p>
        <script>
          window.opener && window.opener.postMessage({
            type: 'drive-oauth-callback',
            error: 'No se obtuvo refresh_token'
          }, '*');
        </script>
        </body></html>
      `;
      return new Response(noRefreshHtml, { headers: { 'Content-Type': 'text/html' } });
    }

    // Get user email
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

    logger.info('connectors', 'Drive OAuth2 callback successful', {
      client_id: client_id.substring(0, 10) + '...',
      has_refresh_token: true,
      email: email ? email.substring(0, 5) + '...' : 'unknown',
    });

    // Return HTML that posts tokens back to opener window
    const successHtml = `
      <!DOCTYPE html><html><body>
      <h2>Autorizacion exitosa</h2>
      <p>Puedes cerrar esta ventana.</p>
      <script>
        window.opener && window.opener.postMessage({
          type: 'drive-oauth-callback',
          refresh_token_encrypted: ${JSON.stringify(refresh_token_encrypted)},
          client_secret_encrypted: ${JSON.stringify(client_secret_encrypted)},
          client_id: ${JSON.stringify(client_id)},
          email: ${JSON.stringify(email)}
        }, '*');
        setTimeout(function() { window.close(); }, 1500);
      </script>
      </body></html>
    `;

    return new Response(successHtml, { headers: { 'Content-Type': 'text/html' } });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const translated = translateError(err);
    logger.error('connectors', 'Drive OAuth2 callback failed', { error: translated });

    const errorHtml = `
      <!DOCTYPE html><html><body>
      <h2>Error</h2>
      <p>${translated}</p>
      <script>
        window.opener && window.opener.postMessage({
          type: 'drive-oauth-callback',
          error: ${JSON.stringify(translated)}
        }, '*');
      </script>
      </body></html>
    `;
    return new Response(errorHtml, { headers: { 'Content-Type': 'text/html' } });
  }
}
