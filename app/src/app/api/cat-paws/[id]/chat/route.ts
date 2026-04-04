import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { logUsage } from '@/lib/services/usage-tracker';
import { streamLiteLLM, sseHeaders, createSSEStream, StreamOptions } from '@/lib/services/stream-utils';
import { litellm } from '@/lib/services/litellm';
import { resolveAlias } from '@/lib/services/alias-routing';
import { withRetry } from '@/lib/retry';
import { executeCatBrain } from '@/lib/services/execute-catbrain';
import type { CatPaw } from '@/lib/types/catpaw';
import type { CatBrainInput, CatBrainOutput } from '@/lib/types/catbrain';
import { getGmailToolsForPaw, GmailToolDispatch } from '@/lib/services/catpaw-gmail-tools';
import { executeGmailToolCall } from '@/lib/services/catpaw-gmail-executor';
import { getDriveToolsForPaw, DriveToolDispatch } from '@/lib/services/catpaw-drive-tools';
import { executeDriveToolCall } from '@/lib/services/catpaw-drive-executor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// --- Row types ---

interface CatBrainRelRow {
  catbrain_id: string;
  query_mode: 'rag' | 'connector' | 'both';
  priority: number;
  catbrain_name: string;
}

interface SkillRow {
  name: string;
  instructions: string;
}

interface ConnectorRelRow {
  connector_id: string;
  connector_name: string;
  connector_type: string;
  config: string | null;
  is_active: number;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface ChatHistoryRow {
  id: string;
  cat_paw_id: string;
  role: string;
  content: string;
  created_at: string;
}

interface EntityCache {
  employees: Record<string, string>;
  projects: Record<string, string>;
  contacts: Record<string, string>;
  leads: Record<string, string>;
}

// --- MCP helpers ---

/** Map from function name -> { serverUrl, originalToolName } for dispatching tool calls */
type ToolDispatchMap = Map<string, { serverUrl: string; connectorName: string; sessionId?: string }>;

/** Parse JSON from either SSE (text/event-stream) or plain JSON response */
async function parseMcpResponse(res: Response): Promise<Record<string, unknown>> {
  const ct = res.headers.get('content-type') || '';
  const body = await res.text();
  if (ct.includes('text/event-stream') || body.startsWith('event:')) {
    const dataLine = body.split('\n').find(l => l.startsWith('data: '));
    if (dataLine) return JSON.parse(dataLine.slice(6));
  }
  return JSON.parse(body);
}

const MCP_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/event-stream',
};

async function fetchMcpTools(
  serverUrl: string,
  connectorName: string,
): Promise<{ tools: McpTool[]; sessionId?: string; error?: string }> {
  try {
    // Initialize MCP session
    const initRes = await fetch(serverUrl, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'DoCatFlow-CatPaw', version: '1.0.0' } },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // Capture session ID for stateful MCP servers
    const sessionId = initRes.headers.get('mcp-session-id') || undefined;
    const sessionHeaders = sessionId ? { ...MCP_HEADERS, 'mcp-session-id': sessionId } : MCP_HEADERS;

    // Fetch tools list
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(10_000),
    });
    const parsed = await parseMcpResponse(res) as { result?: { tools?: McpTool[] } };
    return { tools: parsed.result?.tools || [], sessionId };
  } catch (err) {
    logger.error('cat-paws', `Error fetching MCP tools from ${connectorName}`, { error: (err as Error).message });
    return { tools: [], error: (err as Error).message };
  }
}

function mcpToolsToOpenAI(mcpTools: McpTool[]): unknown[] {
  return mcpTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.inputSchema || { type: 'object', properties: {} },
    },
  }));
}

async function executeMcpToolCall(
  serverUrl: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  sessionId?: string,
): Promise<string> {
  try {
    const callHeaders = sessionId ? { ...MCP_HEADERS, 'mcp-session-id': sessionId } : MCP_HEADERS;
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: callHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
        params: { name: toolName, arguments: toolArgs },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return JSON.stringify({ error: `MCP HTTP ${res.status}: ${errText.substring(0, 500)}` });
    }

    const rpcResponse = await parseMcpResponse(res) as { error?: { message?: string }; result?: { content?: Array<{ text?: string }> } };
    if (rpcResponse.error) {
      return JSON.stringify({ error: rpcResponse.error.message || JSON.stringify(rpcResponse.error) });
    }

    const content = rpcResponse.result?.content;
    if (Array.isArray(content) && content.length > 0 && content[0].text) {
      const text = content[0].text;
      return text.length > 10_000 ? text.slice(0, 10_000) + '... [truncado]' : text;
    }
    const str = JSON.stringify(rpcResponse.result || rpcResponse);
    return str.length > 10_000 ? str.slice(0, 10_000) + '... [truncado]' : str;
  } catch (err) {
    return JSON.stringify({ error: `MCP tool error (${toolName}): ${(err as Error).message}` });
  }
}

// --- Chat history helpers ---

function loadChatHistory(catPawId: string, limit = 10): ChatHistoryRow[] {
  return db.prepare(
    'SELECT * FROM cat_paw_chat_history WHERE cat_paw_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(catPawId, limit) as ChatHistoryRow[];
}

function saveChatMessage(catPawId: string, role: string, content: string): void {
  db.prepare(
    'INSERT INTO cat_paw_chat_history (id, cat_paw_id, role, content) VALUES (?, ?, ?, ?)'
  ).run(randomUUID(), catPawId, role, content);

  // Trim to keep max 10 messages per CatPaw
  db.prepare(`
    DELETE FROM cat_paw_chat_history WHERE cat_paw_id = ? AND id NOT IN (
      SELECT id FROM cat_paw_chat_history WHERE cat_paw_id = ? ORDER BY created_at DESC LIMIT 10
    )
  `).run(catPawId, catPawId);
}

// --- Entity cache helpers ---

function buildEntityCachePrompt(entityCache: EntityCache): string {
  const lines: string[] = [];
  const labels: Array<[string, Record<string, string>]> = [
    ['Empleados', entityCache.employees],
    ['Proyectos', entityCache.projects],
    ['Contactos', entityCache.contacts],
    ['Leads', entityCache.leads],
  ];
  for (const [label, map] of labels) {
    const entries = Object.entries(map);
    if (entries.length > 0) {
      lines.push(`${label}: ${entries.map(([name, id]) => `${name} -> ${id}`).join(', ')}`);
    }
  }
  if (lines.length === 0) return '';
  return `\nENTIDADES YA RESUELTAS (usa estos IDs directamente sin volver a buscar):\n${lines.join('\n')}\n`;
}

function extractEntitiesFromText(text: string, cache: EntityCache): EntityCache {
  // Match patterns like "Nombre Apellido [ID: 64char hex]" in LLM output
  const pattern = /([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)\s*\[ID:\s*([a-f0-9]{24})\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1];
    const id = match[2];
    // Heuristic: categorize by context if possible, default to contacts
    // The LLM protocol instructs it to show "Name [ID: xxx]" — we'll store in contacts as generic
    // The cache key is the name, so duplicates just update
    if (!cache.employees[name] && !cache.projects[name] && !cache.leads[name]) {
      cache.contacts[name] = id;
    }
  }
  return cache;
}

const EMPTY_ENTITY_CACHE: EntityCache = { employees: {}, projects: {}, contacts: {}, leads: {} };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { message, stream: useStream } = body;
    const entityCache: EntityCache = {
      ...EMPTY_ENTITY_CACHE,
      ...(body.entityCache || {}),
    };

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const paw = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(id) as CatPaw | undefined;

    if (!paw) {
      return NextResponse.json({ error: 'CatPaw no encontrado' }, { status: 404 });
    }

    // All modes support chat — processor mode uses system prompt + skills without CatBrain context

    logger.info('cat-paws', 'Chat request', { pawId: id, name: paw.name, streaming: !!useStream });

    // Load relations
    const linkedCatBrains = db.prepare(
      'SELECT cpc.*, c.name as catbrain_name FROM cat_paw_catbrains cpc LEFT JOIN catbrains c ON c.id = cpc.catbrain_id WHERE cpc.paw_id = ? ORDER BY cpc.priority DESC'
    ).all(id) as CatBrainRelRow[];

    const linkedSkills = db.prepare(
      'SELECT s.name, s.instructions FROM cat_paw_skills cps JOIN skills s ON s.id = cps.skill_id WHERE cps.paw_id = ?'
    ).all(id) as SkillRow[];

    const linkedConnectors = db.prepare(
      'SELECT cpc.*, c.name as connector_name, c.type as connector_type, c.config FROM cat_paw_connectors cpc LEFT JOIN connectors c ON c.id = cpc.connector_id WHERE cpc.paw_id = ? AND cpc.is_active = 1'
    ).all(id) as ConnectorRelRow[];

    // Query CatBrains for context
    let catbrainContext = '';
    const allSources: string[] = [];

    if (linkedCatBrains.length > 0) {
      for (const cb of linkedCatBrains) {
        try {
          const cbInput: CatBrainInput = { query: message, mode: cb.query_mode };
          const cbOutput: CatBrainOutput = await withRetry(
            () => executeCatBrain(cb.catbrain_id, cbInput),
            { maxAttempts: 2 }
          );
          if (cbOutput.answer) {
            catbrainContext += (catbrainContext ? '\n\n' : '') +
              `[CatBrain: ${cbOutput.catbrain_name}]\n${cbOutput.answer}`;
          }
          if (cbOutput.sources) {
            allSources.push(...cbOutput.sources);
          }
        } catch (err) {
          logger.error('cat-paws', `Error querying CatBrain ${cb.catbrain_id}`, {
            pawId: id,
            error: (err as Error).message,
          });
        }
      }
    }

    // Load connector tools
    const toolDispatch: ToolDispatchMap = new Map();
    const gmailToolDispatch = new Map<string, GmailToolDispatch>();
    const driveToolDispatch = new Map<string, DriveToolDispatch>();
    const openAITools: unknown[] = [];

    const mcpConnectors = linkedConnectors.filter((c) => c.connector_type === 'mcp_server');
    if (mcpConnectors.length > 0) {
      for (const conn of mcpConnectors) {
        const config = conn.config ? JSON.parse(conn.config) : {};
        if (!config.url) continue;

        const { tools: mcpTools, sessionId: mcpSessionId } = await fetchMcpTools(config.url, conn.connector_name);
        if (mcpTools.length > 0) {
          openAITools.push(...mcpToolsToOpenAI(mcpTools));
          for (const t of mcpTools) {
            toolDispatch.set(t.name, { serverUrl: config.url, connectorName: conn.connector_name, sessionId: mcpSessionId });
          }
          logger.info('cat-paws', `Loaded ${mcpTools.length} MCP tools from ${conn.connector_name}`, { pawId: id });
        }
      }
    }

    // Load Gmail connector tools
    const gmailConnectors = linkedConnectors.filter((c) => c.connector_type === 'gmail');
    if (gmailConnectors.length > 0) {
      const gmailInfos = gmailConnectors.map(c => ({
        connectorId: c.connector_id,
        connectorName: c.connector_name,
      }));
      const { tools: gmailTools, dispatch: gmailDispatchMap } = getGmailToolsForPaw(id, gmailInfos);
      openAITools.push(...gmailTools);
      gmailDispatchMap.forEach((info, name) => {
        gmailToolDispatch.set(name, info);
      });
      logger.info('cat-paws', `Loaded ${gmailTools.length} Gmail tools for ${gmailConnectors.length} connector(s)`, { pawId: id });
    }

    // Load Google Drive connector tools
    const driveConnectors = linkedConnectors.filter((c) => c.connector_type === 'google_drive');
    if (driveConnectors.length > 0) {
      const driveInfos = driveConnectors.map(c => ({
        connectorId: c.connector_id,
        connectorName: c.connector_name,
      }));
      const { tools: driveTools, dispatch: driveDispatchMap } = getDriveToolsForPaw(id, driveInfos);
      openAITools.push(...driveTools);
      driveDispatchMap.forEach((info, name) => {
        driveToolDispatch.set(name, info);
      });
      logger.info('cat-paws', `Loaded ${driveTools.length} Drive tools for ${driveConnectors.length} connector(s)`, { pawId: id });
    }

    // Build system prompt
    const systemParts: string[] = [];

    if (paw.system_prompt) {
      systemParts.push(paw.system_prompt);
    } else {
      systemParts.push(`Eres ${paw.name}, un asistente experto.`);
    }

    if (paw.tone) {
      systemParts.push(`\nTono: ${paw.tone}`);
    }

    if (linkedSkills.length > 0) {
      const skillsText = linkedSkills.map(s => `### ${s.name}\n${s.instructions}`).join('\n\n');
      systemParts.push(`\n--- SKILLS ---\n${skillsText}\n--- FIN SKILLS ---`);
    }

    if (catbrainContext) {
      systemParts.push(`\n--- CONOCIMIENTO CATBRAINS ---\n${catbrainContext}\n--- FIN CONOCIMIENTO CATBRAINS ---`);
    }

    // Inject entity cache into system prompt
    const entityCachePrompt = buildEntityCachePrompt(entityCache);
    if (entityCachePrompt) {
      systemParts.push(entityCachePrompt);
    }

    // Add Holded operational context when MCP tools are loaded
    if (openAITools.length > 0) {
      const connectorNames = mcpConnectors.map(c => c.connector_name).join(', ');
      systemParts.push(`
--- GUIA OPERATIVA MCP (${connectorNames}) ---
Tienes ${openAITools.length} herramientas disponibles via MCP. Reglas:

AUTENTICACION: La API Key ya esta configurada en el servidor MCP. NUNCA pidas al usuario una API Key, token, o credencial. Las herramientas funcionan directamente.

PROTOCOLO OBLIGATORIO PARA TODAS LAS ENTIDADES HOLDED:
Antes de cualquier operacion sobre una entidad (empleado, contacto, proyecto, lead, embudo, tarea), SIEMPRE seguir este flujo en orden:

1. RESOLVER: Llamar al tool de listado o busqueda correspondiente
   - Empleado: holded_list_employees o holded_search_employee
   - Contacto: holded_search_contact o holded_list_contacts
   - Proyecto: holded_search_project o holded_list_projects
   - Lead: holded_list_leads
   - Embudo: holded_list_funnels

2. IDENTIFICAR: Encontrar la entidad correcta en los resultados
   - Si hay ambiguedad (varios resultados), preguntar al usuario
   - Si no hay resultados, informar y pedir el nombre exacto

3. RETENER el ID en el contexto de la conversacion:
   - Mostrar siempre: "Nombre Completo [ID: 65bb7d1d44a21e0b8c06d582]"
   - En los turnos siguientes de la MISMA conversacion, usar el ID directamente sin volver a buscar

4. EJECUTAR la operacion solicitada con el ID resuelto

Este protocolo aplica sin excepcion a:
- Empleados -> ID usado en timetracking, registros horarios
- Contactos -> ID usado en leads, facturas, proyectos
- Proyectos -> ID usado en tareas, registros de tiempo
- Leads -> ID usado en notas, tareas, cambios de etapa
- Embudos -> ID usado al crear leads

NUNCA preguntar al usuario por un ID.
SIEMPRE resolver el nombre a ID antes de operar.

DOS TIPOS DE REGISTRO DE TIEMPO (NO son intercambiables):
- PROYECTO (coste interno): holded_create_time_entry / holded_list_time_entries -> Imputa horas a un proyecto especifico. Usa duration en SEGUNDOS (1h=3600), costHour (requerido, puede ser 0), y userId (holdedUserId del empleado, NO el id). Endpoint: /projects/v1/projects/{id}/times
- JORNADA LABORAL (control horario legal): holded_create_timesheet / holded_clock_in / holded_clock_out -> Registra la jornada del empleado. startTmp y endTmp son timestamps Unix en segundos como STRING. Endpoint: /team/v1/employees/{id}/times

EMPLEADO "YO": Usa holded_get_my_employee_id para obtener el ID del usuario. Si dice "ficha mi entrada", primero obten su ID.

FECHAS: Holded usa timestamps Unix en segundos (no milisegundos). Convierte fechas del usuario al formato correcto. Para startTmp/endTmp del team API, pasar como STRING.

FACTURAS: Para crear una factura necesitas contactId + items[{name, units, price, tax}]. Campos de fecha: date (emision), datedue (vencimiento).

LEADS CRM: Para crear un lead necesitas funnelId (obligatorio). Usa holded_list_funnels para ver los embudos disponibles. stageId es opcional (va a la primera etapa si no se indica).

NOTAS DE LEADS: Para crear una nota en un lead, los campos son title (obligatorio) y desc (opcional). NO usar el campo "text" — no existe en la API de Holded.

BUSQUEDA DE CONTACTOS: holded_search_contact obtiene TODOS los contactos y filtra por nombre en el cliente (la API de Holded no tiene filtro por nombre). La busqueda es case-insensitive.

ELIMINACION SEGURA: Todas las operaciones DELETE requieren confirmacion por email. Al llamar un tool de eliminacion, el sistema devuelve status "pending_confirmation" y envia un email al administrador con enlace de confirmar/cancelar. El recurso NO se elimina hasta que el usuario confirma via email. Informa al usuario que debe revisar su email para confirmar la eliminacion.

Si una herramienta falla, indica el error al usuario y sugiere verificar el servicio en la pagina /system de DoCatFlow.
--- FIN GUIA OPERATIVA MCP ---`);
    }

    // Gmail tools system prompt
    if (gmailConnectors.length > 0) {
      const connectorNames = gmailConnectors.map(c => c.connector_name).join(', ');
      systemParts.push(`
--- GMAIL: ACCESO A CORREO ELECTRONICO ---
Tienes acceso a las siguientes cuentas de Gmail: ${connectorNames}.

Puedes:
- Listar los ultimos correos recibidos
- Buscar correos por remitente, asunto, contenido (soporta operadores Gmail: from:, subject:, after:, before:, has:attachment, is:unread)
- Leer el contenido completo de un correo por su ID
- Redactar borradores de correo
- Enviar correos

REGLAS IMPORTANTES:
1. Para ENVIAR un correo, SIEMPRE pide confirmacion explicita al usuario antes de ejecutar la herramienta send_email. Muestra primero el borrador (destinatario, asunto, cuerpo) y pregunta "¿Confirmas el envio?". Solo ejecuta send_email cuando el usuario diga "si", "confirmar", "enviar" o equivalente.
2. NUNCA envies un correo sin confirmacion explicita del usuario.
3. Cuando listes correos, muestra la informacion de forma clara: asunto, remitente, fecha.
4. Para leer un correo, usa el ID obtenido de list_emails o search_emails.
--- FIN GMAIL ---`);
    }

    // Drive tools system prompt
    if (driveConnectors.length > 0) {
      const connectorNames = driveConnectors.map(c => c.connector_name).join(', ');
      systemParts.push(`
--- GOOGLE DRIVE: ACCESO A ARCHIVOS ---
Tienes acceso a los siguientes conectores de Google Drive: ${connectorNames}.

Puedes:
- Listar archivos y carpetas en Drive
- Buscar archivos por nombre o contenido
- Leer el contenido de documentos (Google Docs, Sheets, texto, etc.)
- Obtener metadatos de archivos (propietario, fecha, tamano, enlace)

REGLAS:
1. Cuando listes archivos, muestra nombre, tipo y fecha de modificacion.
2. Para leer un archivo, usa el file_id obtenido de list_files o search_files.
3. Los archivos binarios (imagenes, videos, ZIPs) no pueden leerse como texto — indica al usuario que use el enlace de Drive.
4. Google Docs se exportan automaticamente a texto plano, Sheets a CSV.
--- FIN GOOGLE DRIVE ---`);
    }

    const systemMessage = systemParts.join('\n');
    const rawModel = paw.model || await resolveAlias('agent-task');
    const model = await litellm.resolveModel(rawModel);

    // Build messages array with chat history
    const messages: StreamOptions['messages'] = [
      { role: 'system', content: systemMessage },
    ];

    // Load and inject chat history (last 10 messages, oldest first)
    const historyRows = loadChatHistory(id, 10).reverse();
    for (const row of historyRows) {
      messages.push({ role: row.role as 'user' | 'assistant', content: row.content });
    }

    // Current user message
    messages.push({ role: 'user', content: message });

    // Streaming path
    if (useStream) {
      const chatStartTime = Date.now();
      const MAX_TOOL_ROUNDS = 10;

      const sseStream = createSSEStream((send, close) => {
        (async () => {
          let finalAssistantContent = '';

          try {
            send('start', { timestamp: Date.now() });

            let round = 0;
            let pendingToolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];
            let streamContent = '';

            const runStream = (): Promise<void> => {
              return new Promise((resolve, reject) => {
                pendingToolCalls = [];
                streamContent = '';

                streamLiteLLM(
                  {
                    model,
                    messages,
                    max_tokens: paw.max_tokens,
                    tools: openAITools.length > 0 ? openAITools : undefined,
                  },
                  {
                    onToken: (token) => {
                      streamContent += token;
                      send('token', { token });
                    },
                    onToolCall: (toolCall) => {
                      pendingToolCalls.push(toolCall);
                    },
                    onDone: (usage) => {
                      resolve();
                      // Usage will be logged after the full loop completes
                      if (pendingToolCalls.length === 0 && usage) {
                        logUsage({
                          event_type: 'chat',
                          agent_id: id,
                          model,
                          input_tokens: usage.prompt_tokens || 0,
                          output_tokens: usage.completion_tokens || 0,
                          total_tokens: usage.total_tokens || 0,
                          duration_ms: Date.now() - chatStartTime,
                          status: 'success',
                          metadata: { paw_name: paw.name, mode: paw.mode, tool_rounds: round },
                        });
                      }
                    },
                    onError: (error) => {
                      reject(error);
                    },
                  }
                ).catch(reject);
              });
            };

            // Tool-call loop
            while (round < MAX_TOOL_ROUNDS) {
              await runStream();

              if (pendingToolCalls.length === 0) {
                finalAssistantContent = streamContent;
                break;
              }

              round++;
              send('tool_calls', {
                tools: pendingToolCalls.map((tc) => ({ name: tc.function.name, id: tc.id })),
              });

              // Add assistant message with tool_calls to conversation
              messages.push({
                role: 'assistant',
                content: streamContent || '',
                tool_calls: pendingToolCalls,
              });

              // Execute each tool call and add results
              for (const tc of pendingToolCalls) {
                const mcpDispatch = toolDispatch.get(tc.function.name);
                const gmailDispatch = gmailToolDispatch.get(tc.function.name);
                const driveDispatch = driveToolDispatch.get(tc.function.name);
                let result: string;

                if (mcpDispatch) {
                  let args: Record<string, unknown> = {};
                  try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }
                  logger.info('cat-paws', `Executing MCP tool: ${tc.function.name}`, {
                    pawId: id, connector: mcpDispatch.connectorName, round,
                  });
                  try {
                    result = await executeMcpToolCall(mcpDispatch.serverUrl, tc.function.name, args, mcpDispatch.sessionId);
                  } catch (err) {
                    result = JSON.stringify({ error: `Tool execution failed: ${(err as Error).message}` });
                  }
                } else if (gmailDispatch) {
                  let args: Record<string, unknown> = {};
                  try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }
                  logger.info('cat-paws', `Executing Gmail tool: ${tc.function.name}`, {
                    pawId: id, connector: gmailDispatch.connectorName, operation: gmailDispatch.operation, round,
                  });
                  try {
                    result = await executeGmailToolCall(id, gmailDispatch, args);
                  } catch (err) {
                    result = JSON.stringify({ error: `Gmail tool error: ${(err as Error).message}` });
                  }
                } else if (driveDispatch) {
                  let args: Record<string, unknown> = {};
                  try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }
                  logger.info('cat-paws', `Executing Drive tool: ${tc.function.name}`, {
                    pawId: id, connector: driveDispatch.connectorName, operation: driveDispatch.operation, round,
                  });
                  try {
                    result = await executeDriveToolCall(id, driveDispatch, args);
                  } catch (err) {
                    result = JSON.stringify({ error: `Drive tool error: ${(err as Error).message}` });
                  }
                } else {
                  result = JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });
                }

                messages.push({
                  role: 'tool',
                  content: result,
                  tool_call_id: tc.id,
                });
              }
            }

            // Save chat history
            try {
              saveChatMessage(id, 'user', message);
              if (finalAssistantContent) {
                saveChatMessage(id, 'assistant', finalAssistantContent);
              }
            } catch (err) {
              logger.error('cat-paws', 'Error saving chat history', { pawId: id, error: (err as Error).message });
            }

            // Extract entities from assistant response and update cache
            const updatedCache = extractEntitiesFromText(finalAssistantContent, { ...entityCache });

            if (allSources.length > 0) {
              send('sources', { sources: allSources });
            }

            send('done', {
              sources: allSources.length > 0 ? allSources : undefined,
              tool_rounds: round,
              entityCache: updatedCache,
            });
            close();
          } catch (error) {
            logger.error('cat-paws', 'Error en streaming chat', { pawId: id, error: (error as Error).message });
            send('error', { message: `Error en el chat: ${(error as Error).message}. Intenta de nuevo o simplifica tu consulta.` });
            close();
          }
        })();
      });

      return new Response(sseStream, { headers: sseHeaders });
    }

    // Non-streaming path
    const { executeCatPaw } = await import('@/lib/services/execute-catpaw');
    const output = await executeCatPaw(id, { query: message });

    // Save history for non-streaming too
    try {
      saveChatMessage(id, 'user', message);
      if (output.answer) {
        saveChatMessage(id, 'assistant', output.answer);
      }
    } catch (err) {
      logger.error('cat-paws', 'Error saving chat history', { pawId: id, error: (err as Error).message });
    }

    return NextResponse.json({
      reply: output.answer,
      sources: output.sources,
      tokens: output.tokens_used,
      duration_ms: output.duration_ms,
      entityCache,
    });
  } catch (error) {
    logger.error('cat-paws', 'Error en chat', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
