import { execSync } from 'child_process';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

// ─── Types ───

export interface SudoToolDef {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
  sudo_required: boolean;
}

interface ToolResult {
  name: string;
  result: unknown;
  actions?: Array<{ type: string; url: string; label: string }>;
}

// ─── Host Agent Connection ───
// The host agent runs on the HOST machine (not in Docker)
// and provides shell/file/service access to the host OS.

const HOST_AGENT_URL = process['env']['HOST_AGENT_URL'] || 'http://host.docker.internal:3501';
const HOST_AGENT_TOKEN = process['env']['HOST_AGENT_TOKEN'] || '';

async function hostAgentCall(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!HOST_AGENT_TOKEN) {
    return { error: 'Host Agent no configurado. Ejecuta scripts/setup-host-agent.sh en el servidor host y rebuild el contenedor.' };
  }

  try {
    const res = await fetch(`${HOST_AGENT_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HOST_AGENT_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(35_000),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401) return { error: 'Token del Host Agent inválido. Verifica HOST_AGENT_TOKEN en .env.' };
      return { error: `Host Agent error (${res.status}): ${text}` };
    }

    return await res.json() as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      return { error: 'No se puede conectar al Host Agent. ¿Está ejecutándose? (systemctl --user status docatflow-host-agent)' };
    }
    if (msg.includes('TimeoutError') || msg.includes('aborted')) {
      return { error: 'Timeout conectando con el Host Agent (35s)' };
    }
    return { error: `Error conectando con Host Agent: ${msg}` };
  }
}

// Sync version for credential testing (calls host agent via child_process curl)
function hostAgentCallSync(endpoint: string, body: Record<string, unknown>): Record<string, unknown> {
  if (!HOST_AGENT_TOKEN) {
    return { error: 'Host Agent no configurado' };
  }
  try {
    const payload = JSON.stringify(body);
    const curlCmd = `curl -s --connect-timeout 3 --max-time 12 -X POST '${HOST_AGENT_URL}${endpoint}' -H 'Content-Type: application/json' -H 'Authorization: Bearer ${HOST_AGENT_TOKEN}' -d '${payload.replace(/'/g, "'\\''")}'`;
    const result = execSync(curlCmd, { timeout: 15_000, encoding: 'utf-8' });
    return JSON.parse(result);
  } catch {
    return { error: 'Host Agent unreachable (sync)' };
  }
}

// ─── Service Registry (for tool parameter enum) ───

const SERVICE_NAMES = [
  'docflow-app', 'docflow-qdrant', 'docflow-ollama',
  'antigravity-gateway', 'automation-n8n',
  'openclaw-gateway', 'openclaw-dashboard',
];

// ─── Tool Definitions ───

export const SUDO_TOOLS: SudoToolDef[] = [
  {
    name: 'bash_execute',
    description: 'Ejecuta un comando bash en el servidor host. Úsalo para: ver logs, comprobar estado de servicios, listar archivos, ejecutar scripts, ver uso de disco/memoria, etc. SIEMPRE explica qué vas a ejecutar ANTES y analiza el resultado DESPUÉS.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Comando bash a ejecutar' },
      },
      required: ['command'],
    },
    sudo_required: true,
  },
  {
    name: 'service_manage',
    description: 'Gestiona servicios del stack DoCatFlow en el servidor host. Puede arrancar, parar, reiniciar servicios y ver sus logs. Servicios disponibles: docflow-app, docflow-qdrant, docflow-ollama, antigravity-gateway (LiteLLM), automation-n8n (Docker) y openclaw-gateway, openclaw-dashboard (systemd).',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Nombre del servicio', enum: SERVICE_NAMES },
        action: { type: 'string', description: 'Acción a realizar', enum: ['status', 'start', 'stop', 'restart', 'logs'] },
        log_lines: { type: 'number', description: 'Número de líneas de log a mostrar (default: 50)' },
      },
      required: ['service', 'action'],
    },
    sudo_required: true,
  },
  {
    name: 'file_operation',
    description: 'Lee, escribe, lista o busca archivos en el servidor host. Directorios permitidos: ~/docflow/, ~/.openclaw/, ~/open-antigravity-workspace/, ~/docflow-data/, /tmp/. Útil para: ver configuraciones (.env, openclaw.json), editar archivos, revisar logs, inspeccionar datos de proyectos.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Operación a realizar', enum: ['read', 'write', 'list', 'search'] },
        path: { type: 'string', description: 'Ruta del archivo o directorio' },
        content: { type: 'string', description: 'Contenido a escribir (solo para action=write)' },
        pattern: { type: 'string', description: 'Patrón de búsqueda (solo para action=search)' },
      },
      required: ['action', 'path'],
    },
    sudo_required: true,
  },
  {
    name: 'credential_manage',
    description: 'Gestiona las API keys y credenciales configuradas en DoCatFlow. Puede listar providers y su estado, obtener el valor de una key, actualizar una key, o testar la conexión con un provider.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Operación a realizar', enum: ['list', 'get', 'update', 'test'] },
        provider: { type: 'string', description: 'Nombre del provider (openai, anthropic, google, litellm, ollama)' },
        api_key: { type: 'string', description: 'Nueva API key (solo para action=update)' },
        endpoint: { type: 'string', description: 'Nuevo endpoint (solo para action=update)' },
      },
      required: ['action'],
    },
    sudo_required: true,
  },
  {
    name: 'mcp_bridge',
    description: 'Interactúa con servidores MCP externos configurados en OpenClaw o DoCatFlow. Puede listar servidores configurados, descubrir tools disponibles en un servidor, o invocar una tool específica.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Operación a realizar', enum: ['list_servers', 'discover_tools', 'invoke_tool'] },
        server_name: { type: 'string', description: 'Nombre del servidor MCP (para discover_tools e invoke_tool)' },
        tool_name: { type: 'string', description: 'Nombre de la tool a invocar (solo para invoke_tool)' },
        tool_args: { type: 'object', description: 'Argumentos para la tool (solo para invoke_tool)' },
      },
      required: ['action'],
    },
    sudo_required: true,
  },
];

// ─── Tool Execution ───

export async function executeSudoTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  logger.info('catbot', 'Sudo tool ejecutado', { tool: name, args: Object.keys(args) });

  switch (name) {
    case 'bash_execute': return executeBash(args);
    case 'service_manage': return manageService(args);
    case 'file_operation': return fileOperation(args);
    case 'credential_manage': return credentialManage(args);
    case 'mcp_bridge': return mcpBridge(args);
    default: return { name, result: { error: `Tool desconocida: ${name}` } };
  }
}

// ─── 1. Bash Execute → Host Agent ───

async function executeBash(args: Record<string, unknown>): Promise<ToolResult> {
  const command = String(args.command || '').trim();
  if (!command) return { name: 'bash_execute', result: { error: 'Comando vacío' } };

  const result = await hostAgentCall('/execute', { command });
  return { name: 'bash_execute', result };
}

// ─── 2. Service Manage → Host Agent ───

async function manageService(args: Record<string, unknown>): Promise<ToolResult> {
  const result = await hostAgentCall('/service', {
    service: args.service,
    action: args.action,
    log_lines: args.log_lines,
  });
  return { name: 'service_manage', result };
}

// ─── 3. File Operations → Host Agent ───

async function fileOperation(args: Record<string, unknown>): Promise<ToolResult> {
  const result = await hostAgentCall('/files', {
    action: args.action,
    path: args.path,
    content: args.content,
    pattern: args.pattern,
  });
  return { name: 'file_operation', result };
}

// ─── 4. Credential Management → Local DB ───

function credentialManage(args: Record<string, unknown>): ToolResult {
  const action = String(args.action || '');
  const provider = String(args.provider || '');

  switch (action) {
    case 'list': {
      const rows = db.prepare('SELECT provider, endpoint, is_active, last_tested, test_status, api_key FROM api_keys ORDER BY provider').all() as Array<{
        provider: string; endpoint: string; is_active: number; last_tested: string | null; test_status: string | null; api_key: string | null;
      }>;

      const providers = rows.map(r => ({
        provider: r.provider,
        endpoint: r.endpoint,
        is_active: !!r.is_active,
        has_key: !!r.api_key && r.api_key.length > 0,
        last_tested: r.last_tested,
        test_status: r.test_status,
      }));

      return { name: 'credential_manage', result: { action: 'list', providers } };
    }

    case 'get': {
      if (!provider) return { name: 'credential_manage', result: { error: 'Provider no especificado' } };
      const row = db.prepare('SELECT api_key, endpoint, is_active FROM api_keys WHERE provider = ?').get(provider) as {
        api_key: string | null; endpoint: string; is_active: number;
      } | undefined;

      if (!row) return { name: 'credential_manage', result: { error: `Provider no encontrado: ${provider}` } };

      return {
        name: 'credential_manage',
        result: {
          action: 'get',
          provider,
          api_key: row.api_key || '(no configurada)',
          endpoint: row.endpoint,
          is_active: !!row.is_active,
        },
      };
    }

    case 'update': {
      if (!provider) return { name: 'credential_manage', result: { error: 'Provider no especificado' } };
      const apiKey = args.api_key as string | undefined;
      const endpoint = args.endpoint as string | undefined;

      if (!apiKey && !endpoint) {
        return { name: 'credential_manage', result: { error: 'Especifica al menos api_key o endpoint para actualizar' } };
      }

      const existing = db.prepare('SELECT id FROM api_keys WHERE provider = ?').get(provider) as { id: string } | undefined;
      if (!existing) return { name: 'credential_manage', result: { error: `Provider no encontrado: ${provider}` } };

      const updates: string[] = [];
      const values: unknown[] = [];

      if (apiKey) { updates.push('api_key = ?'); values.push(apiKey); }
      if (endpoint) { updates.push('endpoint = ?'); values.push(endpoint); }
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(provider);

      db.prepare(`UPDATE api_keys SET ${updates.join(', ')} WHERE provider = ?`).run(...values);

      return { name: 'credential_manage', result: { action: 'update', provider, updated: true } };
    }

    case 'test': {
      if (!provider) return { name: 'credential_manage', result: { error: 'Provider no especificado' } };

      const row = db.prepare('SELECT api_key, endpoint FROM api_keys WHERE provider = ?').get(provider) as {
        api_key: string | null; endpoint: string;
      } | undefined;

      if (!row) return { name: 'credential_manage', result: { error: `Provider no encontrado: ${provider}` } };
      if (!row.api_key && provider !== 'ollama') {
        return { name: 'credential_manage', result: { action: 'test', provider, status: 'failed', message: 'No hay API key configurada' } };
      }

      // Build curl command for connectivity test
      let testUrl: string;
      const hdrs: string[] = [];

      switch (provider) {
        case 'openai':
          testUrl = `${row.endpoint}/v1/models`;
          hdrs.push(`-H 'Authorization: Bearer ${row.api_key}'`);
          break;
        case 'anthropic':
          testUrl = `${row.endpoint}/v1/messages`;
          hdrs.push(`-H 'x-api-key: ${row.api_key}'`);
          hdrs.push(`-H 'anthropic-version: 2023-06-01'`);
          break;
        case 'litellm':
          testUrl = `${row.endpoint}/health`;
          if (row.api_key) hdrs.push(`-H 'Authorization: Bearer ${row.api_key}'`);
          break;
        case 'ollama':
          testUrl = `${row.endpoint}/api/tags`;
          break;
        case 'google':
          testUrl = `${row.endpoint}/v1beta/models?key=${row.api_key}`;
          break;
        default:
          testUrl = row.endpoint;
      }

      // Use host agent to curl (it can reach host network services)
      const curlCommand = `curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 ${hdrs.join(' ')} '${testUrl}' 2>&1`;
      const curlResult = hostAgentCallSync('/execute', { command: curlCommand });

      const output = String(curlResult.output || '').trim();
      const code = parseInt(output, 10);
      const ok = !isNaN(code) && code >= 200 && code < 500;

      db.prepare('UPDATE api_keys SET last_tested = ?, test_status = ? WHERE provider = ?').run(
        new Date().toISOString(),
        ok ? 'success' : 'failed',
        provider
      );

      return {
        name: 'credential_manage',
        result: { action: 'test', provider, status: ok ? 'reachable' : 'unreachable', http_code: code || 0, endpoint: row.endpoint },
      };
    }

    default:
      return { name: 'credential_manage', result: { error: `Acción no válida: ${action}` } };
  }
}

// ─── 5. MCP Bridge — Hybrid (local for DoCatFlow, host agent for config reads) ───

async function mcpBridge(args: Record<string, unknown>): Promise<ToolResult> {
  const action = String(args.action || '');

  switch (action) {
    case 'list_servers': {
      const servers: Array<{ name: string; source: string; url?: string; type?: string }> = [];

      // Read OpenClaw config from host via host agent
      try {
        const configResult = await hostAgentCall('/files', { action: 'read', path: '~/.openclaw/config.json' });
        if (configResult.content && typeof configResult.content === 'string') {
          const config = JSON.parse(configResult.content);
          const mcpServers = config.shttp_servers || config.mcp_servers || {};
          for (const [name, serverConfig] of Object.entries(mcpServers)) {
            const sc = serverConfig as { url?: string; type?: string };
            servers.push({ name, source: 'openclaw', url: sc.url, type: sc.type || 'shttp' });
          }
        }
      } catch { /* ignore */ }

      // DoCatFlow internal MCP endpoints (catbrains with RAG — local DB)
      try {
        const catbrains = db.prepare("SELECT id, name FROM catbrains WHERE rag_enabled = 1").all() as Array<{ id: string; name: string }>;
        for (const cb of catbrains) {
          servers.push({
            name: `docatflow-${cb.name.toLowerCase().replace(/\s+/g, '-')}`,
            source: 'docatflow',
            url: `/api/mcp/${cb.id}`,
            type: 'internal',
          });
        }
      } catch { /* ignore */ }

      return { name: 'mcp_bridge', result: { action: 'list_servers', servers, count: servers.length } };
    }

    case 'discover_tools': {
      const serverName = String(args.server_name || '');
      if (!serverName) return { name: 'mcp_bridge', result: { error: 'Nombre del servidor no especificado' } };

      const serverUrl = await findServerUrl(serverName);
      if (!serverUrl) return { name: 'mcp_bridge', result: { error: `Servidor MCP no encontrado: ${serverName}` } };

      try {
        const mcpHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
        // Initialize
        await fetch(serverUrl, {
          method: 'POST',
          headers: mcpHeaders,
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'DoCatFlow-CatBot', version: '1.0.0' } } }),
          signal: AbortSignal.timeout(10_000),
        });

        // tools/list
        const toolsRes = await fetch(serverUrl, {
          method: 'POST',
          headers: mcpHeaders,
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
          signal: AbortSignal.timeout(10_000),
        });
        const toolsBody = await toolsRes.text();
        let parsed;
        if (toolsBody.startsWith('event:') || (toolsRes.headers.get('content-type') || '').includes('text/event-stream')) {
          const dataLine = toolsBody.split('\n').find((l: string) => l.startsWith('data: '));
          parsed = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(toolsBody);
        } else {
          parsed = JSON.parse(toolsBody);
        }
        const tools = parsed.result?.tools || [];

        return {
          name: 'mcp_bridge',
          result: { action: 'discover_tools', server: serverName, url: serverUrl, tools, count: tools.length },
        };
      } catch (err) {
        return { name: 'mcp_bridge', result: { error: `Error conectando con ${serverName}: ${err instanceof Error ? err.message : 'Unknown'}` } };
      }
    }

    case 'invoke_tool': {
      const serverName = String(args.server_name || '');
      const toolName = String(args.tool_name || '');
      const toolArgs = (args.tool_args || {}) as Record<string, unknown>;

      if (!serverName || !toolName) {
        return { name: 'mcp_bridge', result: { error: 'server_name y tool_name son requeridos' } };
      }

      const serverUrl = await findServerUrl(serverName);
      if (!serverUrl) return { name: 'mcp_bridge', result: { error: `Servidor MCP no encontrado: ${serverName}` } };

      try {
        const response = await fetch(serverUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: toolName, arguments: toolArgs } }),
          signal: AbortSignal.timeout(30_000),
        });
        const respBody = await response.text();
        let parsed;
        if (respBody.startsWith('event:') || (response.headers.get('content-type') || '').includes('text/event-stream')) {
          const dataLine = respBody.split('\n').find((l: string) => l.startsWith('data: '));
          parsed = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(respBody);
        } else {
          parsed = JSON.parse(respBody);
        }

        if (parsed.error) {
          return { name: 'mcp_bridge', result: { error: `Error MCP: ${parsed.error.message || JSON.stringify(parsed.error)}` } };
        }

        const resultContent = parsed.result?.content || parsed.result;
        const str = JSON.stringify(resultContent);
        const trimmed = str.length > 10_000
          ? str.slice(0, 10_000) + '... [truncado]'
          : resultContent;

        return {
          name: 'mcp_bridge',
          result: { action: 'invoke_tool', server: serverName, tool: toolName, result: trimmed },
        };
      } catch (err) {
        return { name: 'mcp_bridge', result: { error: `Error invocando tool ${toolName}: ${err instanceof Error ? err.message : 'Unknown'}` } };
      }
    }

    default:
      return { name: 'mcp_bridge', result: { error: `Acción no válida: ${action}` } };
  }
}

// ─── Helper: Find MCP server URL ───

async function findServerUrl(serverName: string): Promise<string | null> {
  // Internal DoCatFlow MCP
  if (serverName.startsWith('docatflow-')) {
    const catbrainName = serverName.replace('docatflow-', '').replace(/-/g, ' ');
    const catbrain = db.prepare("SELECT id FROM catbrains WHERE LOWER(name) LIKE ?").get(`%${catbrainName}%`) as { id: string } | undefined;
    if (catbrain) {
      const port = process['env']['PORT'] || '3000';
      return `http://localhost:${port}/api/mcp/${catbrain.id}`;
    }
  }

  // Known MCP servers from env vars
  const knownServers: Record<string, string | undefined> = {
    'holded-mcp': process['env']['HOLDED_MCP_URL'],
    'seed-holded-mcp': process['env']['HOLDED_MCP_URL'],
    'linkedin-mcp': process['env']['LINKEDIN_MCP_URL'],
    'seed-linkedin-mcp': process['env']['LINKEDIN_MCP_URL'],
  };
  if (knownServers[serverName]) return knownServers[serverName]!;

  // External servers — read from host config via host agent
  try {
    const configResult = await hostAgentCall('/files', { action: 'read', path: '~/.openclaw/config.json' });
    if (configResult.content && typeof configResult.content === 'string') {
      const config = JSON.parse(configResult.content);
      const servers = config.shttp_servers || config.mcp_servers || {};
      if (servers[serverName]?.url) return servers[serverName].url;
    }
  } catch { /* ignore */ }

  return null;
}

// ─── Exports ───

export function getSudoToolsForLLM(): Array<{ type: string; function: { name: string; description: string; parameters: unknown } }> {
  return SUDO_TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function isSudoTool(name: string): boolean {
  return SUDO_TOOLS.some(t => t.name === name);
}
