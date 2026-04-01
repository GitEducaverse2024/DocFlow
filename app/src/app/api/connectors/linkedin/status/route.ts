/**
 * GET /api/connectors/linkedin/status
 * Check LinkedIn MCP session status via MCP JSON-RPC.
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface ConnectorRow {
  id: string;
  config: string | null;
}

export async function GET() {
  try {
    const connector = db.prepare(
      "SELECT id, config FROM connectors WHERE id = 'seed-linkedin-mcp' AND is_active = 1"
    ).get() as ConnectorRow | undefined;

    if (!connector) {
      return NextResponse.json({ error: 'LinkedIn connector not found' }, { status: 404 });
    }

    const config = connector.config ? JSON.parse(connector.config) : {};
    const mcpUrl = config.url || 'http://192.168.1.49:8765/mcp';

    // MCP initialize handshake
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };

    const initRes = await fetch(mcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'DoCatFlow-LinkedIn-Status', version: '1.0.0' },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    const sid = initRes.headers.get('mcp-session-id');
    if (sid) headers['mcp-session-id'] = sid;

    // Parse SSE or JSON
    const initBody = await initRes.text();
    let initData;
    if (initBody.includes('data: ')) {
      const dataLine = initBody.split('\n').find(l => l.startsWith('data: '));
      initData = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(initBody);
    } else {
      initData = JSON.parse(initBody);
    }

    // Get tools list to find session tools
    const toolsRes = await fetch(mcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(10000),
    });

    const toolsBody = await toolsRes.text();
    let toolsData;
    if (toolsBody.includes('data: ')) {
      const dataLine = toolsBody.split('\n').find(l => l.startsWith('data: '));
      toolsData = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(toolsBody);
    } else {
      toolsData = JSON.parse(toolsBody);
    }

    const tools = toolsData.result?.tools || [];
    const hasSessionTools = tools.some((t: { name: string }) => t.name === 'close_browser');

    // Check if there's a check_session or session_status tool
    const hasCheckSession = tools.some((t: { name: string }) =>
      t.name === 'check_session' || t.name === 'session_status'
    );

    return NextResponse.json({
      connected: true,
      mcp_url: mcpUrl,
      tools_count: tools.length,
      tool_names: tools.map((t: { name: string }) => t.name),
      has_session_tools: hasSessionTools,
      has_check_session: hasCheckSession,
      server_info: initData.result?.serverInfo || null,
    });
  } catch (err) {
    logger.error('linkedin', 'Failed to check LinkedIn MCP status', {
      error: (err as Error).message,
    });
    return NextResponse.json({
      connected: false,
      error: (err as Error).message,
    }, { status: 503 });
  }
}
