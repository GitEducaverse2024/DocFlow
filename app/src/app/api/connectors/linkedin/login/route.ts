/**
 * POST /api/connectors/linkedin/login
 * Proxy to the LinkedIn login-helper service running on the host.
 * The helper opens a visible browser on the server's display for manual login.
 *
 * POST body: { action: 'login' | 'status' | 'logout' }
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const LOGIN_HELPER_URL = process['env']['LINKEDIN_LOGIN_HELPER_URL'] || 'http://192.168.1.49:8767';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = (body as { action?: string }).action || 'login';

    let helperPath: string;
    let method: string;

    switch (action) {
      case 'status':
        helperPath = '/status';
        method = 'GET';
        break;
      case 'login':
        helperPath = '/login';
        method = 'POST';
        break;
      case 'logout':
        helperPath = '/logout';
        method = 'POST';
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const helperRes = await fetch(`${LOGIN_HELPER_URL}${helperPath}`, {
      method,
      signal: AbortSignal.timeout(30000),
    });

    const data = await helperRes.json();

    logger.info('linkedin', `LinkedIn ${action} result`, data);

    return NextResponse.json(data, { status: helperRes.status });
  } catch (err) {
    logger.error('linkedin', 'LinkedIn login helper unreachable', {
      error: (err as Error).message,
    });
    return NextResponse.json({
      error: `No se pudo conectar con el servicio de login de LinkedIn: ${(err as Error).message}`,
    }, { status: 503 });
  }
}
