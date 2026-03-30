import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { Connector, GmailConfig, GoogleDriveConfig } from '@/lib/types';
import { testConnection } from '@/lib/services/email-service';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { testConnection as testDriveConnection } from '@/lib/services/google-drive-service';
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
    let filesCount: number | undefined;

    // Resolve relative URLs (e.g. /api/websearch/gemini) to absolute using the request origin
    const requestUrl = new URL(request.url);
    const baseOrigin = requestUrl.origin;
    const resolveUrl = (url: string) => url.startsWith('/') ? `${baseOrigin}${url}` : url;

    try {
      const controller = new AbortController();
      const timeoutMs = connector.type === 'http_api' ? 20000 : 10000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      switch (connector.type) {
        case 'n8n_webhook': {
          if (!config.url) throw new Error('Webhook URL is required');
          const res = await fetch(resolveUrl(config.url), {
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
          const resolvedApiUrl = resolveUrl(config.url);

          // For internal API endpoints, do a lightweight reachability check
          // instead of a full request that may call slow external APIs
          if ((config.url as string).startsWith('/api/')) {
            // Verify the endpoint exists with a minimal OPTIONS/HEAD or a tiny POST
            const checkRes = await fetch(resolvedApiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: '' }), // empty query triggers fast validation error
              signal: controller.signal,
            });
            // Any response (even 400 for invalid input) means the endpoint is reachable
            if (checkRes.status >= 500) {
              const errText = await checkRes.text().catch(() => '');
              throw new Error(`HTTP ${checkRes.status}: ${errText.slice(0, 200)}`);
            }
            message = `Internal API endpoint reachable (${checkRes.status})`;
          } else {
            const fetchOptions: RequestInit = {
              method: config.method || 'GET',
              headers: config.headers || {},
              signal: controller.signal
            };
            if (['POST', 'PUT', 'PATCH'].includes((config.method || '').toUpperCase()) && config.body_template) {
              // Replace template placeholders with test values
              const testBody = (config.body_template as string)
                .replace(/\{\{output\}\}/g, 'test')
                .replace(/\{\{query\}\}/g, 'test');
              fetchOptions.body = testBody;
              fetchOptions.headers = { 'Content-Type': 'application/json', ...(fetchOptions.headers as Record<string, string>) };
            }
            const res = await fetch(resolvedApiUrl, fetchOptions);
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            message = `API responded with ${res.status}`;
          }
          break;
        }
        case 'mcp_server': {
          if (!config.url) throw new Error('MCP server URL is required');
          const mcpHeaders: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
          // Send MCP initialize handshake
          const initRes = await fetch(config.url, {
            method: 'POST',
            headers: mcpHeaders,
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1, method: 'initialize',
              params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'DoCatFlow-Test', version: '1.0.0' } },
            }),
            signal: controller.signal,
          });
          if (!initRes.ok) throw new Error(`MCP initialize HTTP ${initRes.status}`);
          // Capture session ID for stateful MCP servers
          const sessionId = initRes.headers.get('mcp-session-id');
          const toolsHeaders = { ...mcpHeaders, ...(sessionId ? { 'mcp-session-id': sessionId } : {}) };
          // Fetch tools list to verify full functionality
          const toolsRes = await fetch(config.url, {
            method: 'POST',
            headers: toolsHeaders,
            body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
            signal: controller.signal,
          });
          if (!toolsRes.ok) throw new Error(`MCP tools/list HTTP ${toolsRes.status}`);
          const toolsBody = await toolsRes.text();
          // Parse SSE or JSON response
          const dataLine = toolsBody.split('\n').find(l => l.startsWith('data: '));
          const toolsData = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(toolsBody);
          if (toolsData.error) throw new Error(toolsData.error.message || 'MCP RPC error');
          const toolCount = toolsData.result?.tools?.length || 0;
          message = `MCP server OK — ${toolCount} tools disponibles`;
          break;
        }
        case 'email': {
          if (!config.url && !config.smtp_host) throw new Error('Email webhook URL or SMTP host is required');
          message = 'Email configuration validated';
          break;
        }
        case 'gmail': {
          const gmailConfig = config as GmailConfig;
          const result = await testConnection(gmailConfig);
          if (!result.ok) {
            throw new Error(result.error || 'Error de conexion Gmail');
          }
          message = 'Conexion Gmail verificada correctamente';
          break;
        }
        case 'google_drive': {
          const driveConfig = config as GoogleDriveConfig;
          const driveClient = createDriveClient(driveConfig);
          const driveResult = await testDriveConnection(driveClient, driveConfig.root_folder_id);
          if (!driveResult.ok) {
            throw new Error(driveResult.error || 'Error de conexion Google Drive');
          }
          filesCount = driveResult.files_count;
          message = `Conexion Drive verificada: ${driveResult.files_count} archivos encontrados`;
          break;
        }
        default:
          throw new Error(`Unknown connector type: ${connector.type}`);
      }

      clearTimeout(timeout);
    } catch (err) {
      testStatus = 'failed';
      message = (err as Error).name === 'AbortError'
        ? `Test timed out after ${connector.type === 'http_api' ? 20 : 10} seconds`
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
      duration_ms: durationMs,
      ...(filesCount !== undefined ? { files_count: filesCount } : {}),
    });
  } catch (error) {
    logger.error('connectors', 'Error en test de conector', { connectorId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
