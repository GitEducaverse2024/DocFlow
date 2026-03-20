import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/services/email-service';
import { GmailConfig, EmailPayload } from '@/lib/types';

// --- Types ---

export interface ConnectorResult {
  connector_id: string;
  connector_name: string;
  connector_type: string;
  success: boolean;
  data: unknown;
  error?: string;
  duration_ms: number;
}

interface ConnectorRow {
  id: string;
  catbrain_id: string;
  name: string;
  type: 'n8n_webhook' | 'http_api' | 'mcp_server' | 'email' | 'gmail';
  config: string | null;
  description: string | null;
  is_active: number;
}

// --- Anti-spam rate limiting ---

const gmailLastSend = new Map<string, number>(); // connectorId -> timestamp
const GMAIL_SEND_DELAY_MS = 1000; // 1 second anti-spam delay

// --- Output parsing: 3 strategies ---

export function parseOutputToEmailPayload(output: string, config: GmailConfig): EmailPayload {
  const looksLikeHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);

  // Strategy 1: Try JSON with email fields
  try {
    const parsed = JSON.parse(output);
    if (parsed.to && parsed.subject) {
      // Resolve body: explicit html_body/html wins, then detect HTML in body/text_body
      const rawHtml = parsed.html_body || parsed.html || null;
      const rawText = parsed.text_body || parsed.body || null;
      const htmlBody = rawHtml || (rawText && looksLikeHtml(rawText) ? rawText : null);
      const textBody = htmlBody ? null : rawText;

      return {
        to: parsed.to,
        subject: parsed.subject,
        html_body: htmlBody,
        text_body: textBody,
        reply_to: parsed.reply_to,
      };
    }
    // Strategy 2: JSON but no email fields — fallback to config.user
    const dateStr = new Date().toLocaleDateString('es-ES');
    const content = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
    return {
      to: config.user,
      subject: `DoCatFlow — Resultado del ${dateStr}`,
      ...(looksLikeHtml(content) ? { html_body: content } : { text_body: content }),
    };
  } catch {
    // Strategy 3: Plain text — fallback (detect HTML too)
    const dateStr = new Date().toLocaleDateString('es-ES');
    return {
      to: config.user,
      subject: `DoCatFlow — Resultado del ${dateStr}`,
      ...(looksLikeHtml(output) ? { html_body: output } : { text_body: output }),
    };
  }
}

// --- Gmail connector executor ---

async function executeGmailConnector(
  connector: ConnectorRow,
  query: string
): Promise<unknown> {
  const config: GmailConfig = connector.config ? JSON.parse(connector.config) : {};

  // Anti-spam delay (EMAIL-15)
  const lastSend = gmailLastSend.get(connector.id) || 0;
  const elapsed = Date.now() - lastSend;
  if (elapsed < GMAIL_SEND_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, GMAIL_SEND_DELAY_MS - elapsed));
  }

  const payload = parseOutputToEmailPayload(query, config);
  const result = await sendEmail(config, payload);

  gmailLastSend.set(connector.id, Date.now());

  if (!result.ok) {
    throw new Error(result.error || 'Error enviando email');
  }

  return {
    sent: true,
    messageId: result.messageId,
    to: payload.to,
    subject: payload.subject,
  };
}

// --- Internal: Execute a single connector ---

async function executeConnector(
  connector: ConnectorRow,
  query: string,
  signal: AbortSignal
): Promise<unknown> {
  const config = connector.config ? JSON.parse(connector.config) : {};

  switch (connector.type) {
    case 'n8n_webhook': {
      const res = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
        body: JSON.stringify({
          query,
          source: 'catbrain',
          catbrain_id: connector.catbrain_id,
        }),
        signal,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText.substring(0, 500)}`);
      }
      return await res.json();
    }

    case 'http_api': {
      const method = (config.method || 'GET').toUpperCase();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(config.headers || {}),
      };

      const fetchOptions: RequestInit = {
        method,
        headers,
        signal,
      };

      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        let body = config.body_template || '{}';
        body = body.replace(/\{\{query\}\}/g, query);
        fetchOptions.body = body;
      }

      const url = config.url.replace(/\{\{query\}\}/g, encodeURIComponent(query));
      const res = await fetch(url, fetchOptions);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText.substring(0, 500)}`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await res.json();
      }
      return await res.text();
    }

    case 'mcp_server': {
      // CatBrain-to-CatBrain via MCP JSON-RPC
      const res = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'search_knowledge',
            arguments: { query },
          },
        }),
        signal,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`MCP HTTP ${res.status}: ${errText.substring(0, 500)}`);
      }
      const rpcResponse = await res.json();
      // Extract content from JSON-RPC response
      if (rpcResponse.error) {
        throw new Error(`MCP RPC error: ${rpcResponse.error.message || JSON.stringify(rpcResponse.error)}`);
      }
      return rpcResponse.result?.content || rpcResponse.result || rpcResponse;
    }

    case 'email': {
      // Email connectors are fire-and-forget notifications, skip during automatic execution
      return { skipped: true, reason: 'Email connectors are not executed during automatic runs' };
    }

    case 'gmail': {
      return await executeGmailConnector(connector, query);
    }

    default:
      throw new Error(`Unknown connector type: ${connector.type}`);
  }
}

// --- Main: Execute all active connectors for a CatBrain ---

export async function executeCatBrainConnectors(
  catbrainId: string,
  query: string,
  mode: 'connector' | 'both'
): Promise<ConnectorResult[]> {
  // Fetch active connectors for this CatBrain
  const connectors = db.prepare(
    'SELECT * FROM catbrain_connectors WHERE catbrain_id = ? AND is_active = 1'
  ).all(catbrainId) as ConnectorRow[];

  if (connectors.length === 0) {
    return [];
  }

  logger.info('connectors', 'Executing catbrain connectors', {
    catbrainId,
    count: connectors.length,
    mode,
  });

  const TIMEOUT_MS = 15000;

  // Execute all connectors in parallel with individual timeouts
  const settled = await Promise.allSettled(
    connectors.map(async (connector): Promise<ConnectorResult> => {
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const data = await executeConnector(connector, query, controller.signal);
        clearTimeout(timer);
        return {
          connector_id: connector.id,
          connector_name: connector.name,
          connector_type: connector.type,
          success: true,
          data,
          duration_ms: Date.now() - start,
        };
      } catch (err) {
        clearTimeout(timer);
        const errorMsg = (err as Error).name === 'AbortError'
          ? `Timeout after ${TIMEOUT_MS}ms`
          : (err as Error).message;

        logger.error('connectors', `Connector "${connector.name}" failed`, {
          connectorId: connector.id,
          type: connector.type,
          error: errorMsg,
        });

        return {
          connector_id: connector.id,
          connector_name: connector.name,
          connector_type: connector.type,
          success: false,
          data: null,
          error: errorMsg,
          duration_ms: Date.now() - start,
        };
      }
    })
  );

  // Extract results (allSettled always fulfills since we catch internally)
  const results = settled.map(s =>
    s.status === 'fulfilled' ? s.value : {
      connector_id: 'unknown',
      connector_name: 'unknown',
      connector_type: 'unknown',
      success: false,
      data: null,
      error: (s.reason as Error)?.message || 'Unknown error',
      duration_ms: 0,
    }
  );

  const successCount = results.filter(r => r.success).length;
  logger.info('connectors', 'CatBrain connectors execution complete', {
    catbrainId,
    total: results.length,
    succeeded: successCount,
    failed: results.length - successCount,
  });

  return results;
}

// --- Helper: Format connector results for LLM context ---

export function formatConnectorResults(results: ConnectorResult[]): string {
  const successful = results.filter(r => r.success && r.connector_type !== 'email');
  if (successful.length === 0) return '';

  const lines = successful.map(r => {
    const dataStr = typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2);
    // Truncate very long responses
    const truncated = dataStr.length > 3000 ? dataStr.substring(0, 3000) + '...[truncado]' : dataStr;
    return `[${r.connector_name}] (${r.connector_type}): ${truncated}`;
  });

  return `--- Datos de Conectores ---\n${lines.join('\n')}\n---`;
}
