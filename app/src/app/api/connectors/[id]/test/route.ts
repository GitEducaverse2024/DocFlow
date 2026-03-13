import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { Connector } from '@/lib/types';
import { logger } from '@/lib/logger';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ?').get(params.id) as Connector | undefined;
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    logger.info('connectors', 'Test de conector iniciado', { connectorId: params.id, type: connector.type });

    const config = connector.config ? JSON.parse(connector.config) : {};
    const startTime = Date.now();
    let testStatus: 'ok' | 'failed' = 'ok';
    let message = 'Test successful';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      switch (connector.type) {
        case 'n8n_webhook': {
          if (!config.url) throw new Error('Webhook URL is required');
          const res = await fetch(config.url, {
            method: config.method || 'POST',
            headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
            body: JSON.stringify({ test: true, source: 'docflow' }),
            signal: controller.signal
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          message = `Webhook responded with ${res.status}`;
          break;
        }
        case 'http_api': {
          if (!config.url) throw new Error('API URL is required');
          const fetchOptions: RequestInit = {
            method: config.method || 'GET',
            headers: config.headers || {},
            signal: controller.signal
          };
          if (['POST', 'PUT', 'PATCH'].includes((config.method || '').toUpperCase()) && config.body_template) {
            fetchOptions.body = config.body_template;
            fetchOptions.headers = { 'Content-Type': 'application/json', ...(fetchOptions.headers as Record<string, string>) };
          }
          const res = await fetch(config.url, fetchOptions);
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          message = `API responded with ${res.status}`;
          break;
        }
        case 'mcp_server': {
          if (!config.url) throw new Error('MCP server URL is required');
          const res = await fetch(config.url, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          message = `MCP server responded with ${res.status}`;
          break;
        }
        case 'email': {
          if (!config.url && !config.smtp_host) throw new Error('Email webhook URL or SMTP host is required');
          message = 'Email configuration validated';
          break;
        }
        default:
          throw new Error(`Unknown connector type: ${connector.type}`);
      }

      clearTimeout(timeout);
    } catch (err) {
      testStatus = 'failed';
      message = (err as Error).name === 'AbortError'
        ? 'Test timed out after 10 seconds'
        : (err as Error).message;
    }

    const durationMs = Date.now() - startTime;
    const now = new Date().toISOString();

    db.prepare('UPDATE connectors SET test_status = ?, last_tested = ?, updated_at = ? WHERE id = ?')
      .run(testStatus, now, now, params.id);

    logger.info('connectors', 'Test de conector completado', { connectorId: params.id, status: testStatus, durationMs });

    return NextResponse.json({
      success: testStatus === 'ok',
      test_status: testStatus,
      message,
      duration_ms: durationMs
    });
  } catch (error) {
    logger.error('connectors', 'Error en test de conector', { connectorId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
