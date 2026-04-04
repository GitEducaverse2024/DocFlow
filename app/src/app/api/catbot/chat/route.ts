import { NextResponse } from 'next/server';
import { getToolsForLLM, executeTool } from '@/lib/services/catbot-tools';
import { getSudoToolsForLLM, executeSudoTool, isSudoTool } from '@/lib/services/catbot-sudo-tools';
import { isHoldedTool, executeHoldedTool, getHoldedTools } from '@/lib/services/catbot-holded-tools';
import { validateSudoSession } from '@/lib/sudo';
import { logUsage } from '@/lib/services/usage-tracker';
import { streamLiteLLM, sseHeaders, createSSEStream } from '@/lib/services/stream-utils';
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { getTranslations } from 'next-intl/server';
import { resolveAlias } from '@/lib/services/alias-routing';
import { getAllAliases } from '@/lib/services/alias-routing';
// midToMarkdown available for future system prompt enrichment

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface SudoConfig {
  enabled: boolean;
  hash: string;
  duration_minutes: number;
  protected_actions: string[];
}

function getSudoConfig(): SudoConfig | null {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'catbot_sudo'").get() as { value: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.value) as SudoConfig;
  } catch {
    return null;
  }
}

function buildSystemPrompt(context: { page?: string; project_id?: string; project_name?: string }, hasSudo: boolean): string {
  // Get stats
  let catbrainsCount = 0;
  let catpawsCount = 0;
  let tasksCount = 0;
  try {
    catbrainsCount = (db.prepare('SELECT COUNT(*) as c FROM catbrains').get() as { c: number }).c;
    catpawsCount = (db.prepare('SELECT COUNT(*) as c FROM cat_paws WHERE is_active = 1').get() as { c: number }).c;
    tasksCount = (db.prepare('SELECT COUNT(*) as c FROM tasks').get() as { c: number }).c;
  } catch { /* ignore */ }

  let listeningCount = 0;
  try {
    listeningCount = (db.prepare('SELECT COUNT(*) as c FROM tasks WHERE listen_mode = 1').get() as { c: number }).c;
  } catch { /* ignore */ }

  const serverHost = process['env']['SERVER_HOSTNAME'] || 'localhost';

  const sudoStatusLine = hasSudo
    ? '🔐 **Modo Sudo ACTIVO** — Puedes ejecutar las tools de superpoderes directamente.'
    : '🔒 **Modo Sudo INACTIVO** — Puedes intentar usar las tools de superpoderes. Si el usuario no ha verificado la clave sudo, el sistema te devolverá un error SUDO_REQUIRED. Cuando eso ocurra, dile al usuario que necesita introducir su clave sudo en el chat para autorizar la acción. Si no tiene clave configurada, indícale que vaya a Configuración → CatBot → Seguridad.';

  const sudoSection = `

## 🔐 Superpoderes del servidor
Tienes acceso a 5 herramientas avanzadas que operan directamente en el servidor (${serverHost}):

1. **bash_execute**: Ejecuta comandos bash en el servidor. Timeout 30s. SIEMPRE explica qué vas a ejecutar ANTES y analiza el resultado DESPUÉS.
2. **service_manage**: Gestiona servicios del stack:
   - Docker: docflow-app (:3500), docflow-qdrant (:6333), docflow-ollama (:11434), antigravity-gateway/LiteLLM (:4000), automation-n8n (:5678)
   - Systemd (usuario): openclaw-gateway (:18789), openclaw-dashboard (Mission Control)
3. **file_operation**: Lee, escribe, lista y busca archivos. Dirs permitidos: ~/docflow/, ~/.openclaw/, ~/open-antigravity-workspace/, ~/docflow-data/, /tmp/
4. **credential_manage**: Gestiona API keys. Listar, obtener, actualizar y testar providers.
5. **mcp_bridge**: Interactúa con servidores MCP configurados en OpenClaw o DoCatFlow.

### Estado sudo:
${sudoStatusLine}

### Reglas de superpoderes:
- Antes de ejecutar un comando: explica qué harás y por qué
- Después de ejecutar: analiza el resultado y explica qué pasó
- Usa formato de código con \`\`\`terminal para mostrar outputs
- Si un servicio tiene errores en los logs, avisa al usuario con análisis
- Para credenciales: muestra solo lo necesario, advierte sobre la sensibilidad
- Archivos de configuración importantes:
  - ~/docflow/.env — Variables de entorno de DoCatFlow
  - ~/docflow/docker-compose.yml — Configuración Docker
  - ~/.openclaw/config.json — Configuración OpenClaw
  - ~/docflow-data/ — Datos persistentes (proyectos, fuentes, logs)
  - /app/data/logs/ — Logs JSONL de la aplicación`;

  // Holded MCP tools section
  const holdedTools = getHoldedTools();
  const holdedSection = holdedTools.length > 0
    ? `\n\n## Herramientas Holded ERP (${holdedTools.length} disponibles)\n` +
      'Puedes invocar estas herramientas directamente sin modo sudo:\n' +
      holdedTools.map(t => `- **${t.function.name}**: ${t.function.description}`).join('\n') +
      '\n\n### Reglas operativas Holded\n' +
      '- **AUTENTICACION**: La API Key ya esta en el servidor MCP. NUNCA pidas al usuario una API Key o credencial.\n' +
      '- **BUSCAR ANTES DE CREAR**: holded_search_contact antes de create_contact, holded_list_funnels antes de create_lead.\n' +
      '- **DOS REGISTROS DE TIEMPO** (NO intercambiables):\n' +
      '  - Proyecto (coste): holded_create_time_entry → /projects/v1/projects/{id}/times\n' +
      '  - Jornada laboral (legal): holded_create_timesheet / holded_clock_in/out → /team/v1/employees/{id}/timetracking\n' +
      '- **EMPLEADO "YO"**: Usa holded_get_my_employee_id para resolver "mi ID" antes de fichar.\n' +
      '- **FECHAS**: Timestamps Unix en SEGUNDOS (no milisegundos).\n' +
      '- **FACTURAS**: contactId + items[{name, units, price, tax}]. Campos: date (emision), datedue (vencimiento).\n' +
      '- **LEADS CRM**: funnelId obligatorio — usa holded_list_funnels primero.\n' +
      '- Si falla, sugiere al usuario verificar en /system.\n'
    : '';

  // Build model intelligence section (graceful degradation — omit if MID fails)
  let modelIntelligenceSection = '';
  try {
    const aliases = getAllAliases({ active_only: true });
    const routingLines = aliases.map(a => `- ${a.alias}: ${a.model_key}`).join('\n');

    modelIntelligenceSection = `

## Inteligencia de Modelos

Tienes acceso a 3 tools de orquestacion de modelos:
- **get_model_landscape**: Ver inventario completo de modelos con tiers y capacidades
- **recommend_model_for_task**: Recomendar modelo optimo para una tarea
- **update_alias_routing**: Cambiar modelo de un alias (SIEMPRE confirmar con usuario antes)

### Routing actual
${routingLines}

### Guia de tiers
- **Elite** (Claude Opus, Gemini 2.5 Pro): Solo para tareas complejas que requieren razonamiento profundo, analisis extenso o creatividad avanzada. NUNCA para preguntas simples o tareas rutinarias.
- **Pro** (Claude Sonnet, GPT-4o, Gemini Flash): Balance calidad-coste. Usar para la mayoria de tareas: chat, procesamiento, generacion.
- **Libre** (Ollama locales: Gemma, Llama, Qwen): Sin coste API. Ideal para tareas simples, clasificacion, formateo, borradores.

### Protocolo de proporcionalidad (CATBOT-07)
Antes de recomendar un modelo, evalua la complejidad de la tarea:
- Pregunta simple / listado / formato -> Libre o Pro. NUNCA Elite.
- Analisis / razonamiento medio -> Pro.
- Razonamiento complejo / creatividad avanzada / analisis extenso -> Elite justificado.
Si el usuario pide un modelo Elite para algo trivial, sugiere una alternativa Pro/Libre con justificacion.

### Protocolo de diagnostico (CATBOT-06)
Cuando el usuario reporte un resultado pobre o inesperado:
1. Pregunta que tarea se ejecuto y que resultado obtuvo
2. Usa get_model_landscape para ver que modelo esta asignado al alias relevante
3. Compara con MID: es el modelo adecuado para esa tarea?
4. Si el modelo es suboptimo (ej: Libre para tarea compleja), sugiere alternativa con recommend_model_for_task
5. Ofrece cambiar el routing con update_alias_routing si el usuario acepta

### Sugerencias en Canvas (CATBOT-05)
Cuando revises o crees un canvas:
- Para nodos AGENT de procesamiento/clasificacion: sugiere Pro o Libre
- Para nodos AGENT de razonamiento/analisis: sugiere Pro o Elite
- Para nodos OUTPUT/formato: sugiere Libre (formateo no necesita modelo caro)
- Incluye justificacion breve por nodo`;
  } catch {
    // Graceful degradation: if MID/alias data fails, omit section
  }

  return `Eres CatBot, el asistente IA de DoCatFlow. Eres un gato con gafas VR y traje violeta.

## Tu personalidad
- Amigable, eficiente, con toques sutiles de humor felino (no exagerado)
- Hablas en espanol siempre
- Eres directo y practico — no das rodeos
- Cuando no puedes hacer algo, explicas por que y ofreces alternativas
- Usas emojis con moderacion (🐱 para ti, 🎉 para celebrar, ⚠️ para avisos)

## Lo que sabes de DoCatFlow
DoCatFlow es una plataforma de Document Intelligence autohospedada en el servidor ${serverHost}. Secciones:
- **Dashboard** (/): Panel de operaciones con metricas, tokens, actividad
- **CatBrains** (/catbrains): Crear CatBrains, subir fuentes, procesar con IA, indexar RAG, chatear
- **Agentes** (/agents): CatPaws unificados — agentes IA con 3 modos operativos (chat, procesador, hibrido). Se vinculan a CatBrains, conectores y skills.
- **Docs Workers** (/workers): Migrados a CatPaws. La pagina muestra un banner de migracion.
- **Skills** (/skills): Habilidades reutilizables que se inyectan en el procesamiento
- **Tareas** (/tasks): Pipelines multi-agente donde varios agentes trabajan en secuencia
- **CatFlow** (/catflow): Pipelines visuales multi-agente con nodos de tipo agente, scheduler, storage y multiagent. Soporta modo escucha para recibir senales de otros CatFlows, y trigger chains para activar CatFlows al completar. Usa las tools list_catflows, execute_catflow, toggle_catflow_listen y fork_catflow para gestionar CatFlows.
- **Canvas** (/canvas): Editor visual de flujos con nodos arrastrables (AGENT, CONNECTOR, MERGE, CONDITION, OUTPUT, CHECKPOINT, PROJECT). Puedes gestionar canvas completos con las tools canvas_*.
- **Conectores** (/connectors): Integracion con n8n, HTTP APIs, MCP servers, email
- **Email via Gmail** (/connectors): Puedes enviar emails usando conectores Gmail configurados. Usa list_email_connectors para ver disponibles y send_email para enviar.
- **Configuracion** (/settings): API keys, limites de procesamiento, costes de modelos, seguridad CatBot
- **Estado del Sistema** (/system): Servicios conectados (OpenClaw, n8n, Qdrant, LiteLLM${process['env']['LINKEDIN_MCP_URL'] ? ', LinkedIn MCP' : ''})

## Stack del servidor
- DoCatFlow: Next.js 14 App Router + SQLite + Qdrant (vectores) — Puerto 3500
- LiteLLM: Proxy multi-LLM — Puerto 4000
- Qdrant: Base de datos vectorial — Puerto 6333
- Ollama: LLM local — Puerto 11434
- n8n: Automatizacion de workflows — Puerto 5678
- OpenClaw: Gateway de agentes — Puerto 18789
- Directorios clave: ~/docflow/ (codigo), ~/docflow-data/ (datos), ~/.openclaw/ (config agentes)${process['env']['LINKEDIN_MCP_URL'] ? '\n- LinkedIn MCP: Conector para consulta de perfiles, empresas y empleos de LinkedIn — Puerto 8765, rate limiting activo (30/hora max)' : ''}

## Contexto actual
- Pagina actual: ${context.page || 'desconocida'}
${context.project_name ? `- Proyecto abierto: ${context.project_name}` : ''}
- Estadisticas: ${catbrainsCount} catbrains, ${catpawsCount} CatPaws activos, ${tasksCount} tareas, ${listeningCount} en escucha
${sudoSection}${holdedSection}${modelIntelligenceSection}

## Instrucciones de tools
- Tienes acceso a tools para crear y listar recursos, navegar, y explicar funcionalidades
- Cuando crees algo, usa la tool correspondiente y luego confirma al usuario con un mensaje amigable
- Cuando el usuario pregunte sobre una funcionalidad, usa explain_feature
- Cuando sugiereas ir a una pagina, usa navigate_to para generar un boton clickeable
- NO inventes datos. Si necesitas listar algo, usa la tool list_* correspondiente
- Para CatFlows: usa list_catflows para listar, execute_catflow para ejecutar, toggle_catflow_listen para activar/desactivar escucha, fork_catflow para duplicar
- SIEMPRE confirma con el usuario antes de ejecutar execute_catflow

## Canvas (CatFlow Visual)
Puedes gestionar el editor visual de flujos completo:
- canvas_list: ver todos los canvas disponibles
- canvas_get: obtener un canvas por nombre o ID (usalo SIEMPRE antes de modificar)
- canvas_create: crear un canvas nuevo
- canvas_add_node: anadir nodo (AGENT, CONNECTOR, MERGE, CONDITION, OUTPUT, CHECKPOINT)
- canvas_add_edge: conectar dos nodos
- canvas_remove_node: eliminar un nodo y sus conexiones
- canvas_update_node: cambiar instrucciones, agente o conector de un nodo
- canvas_execute: ejecutar el canvas

PROTOCOLO OBLIGATORIO para modificar un canvas:
1. Siempre llama canvas_get PRIMERO para ver el estado actual
2. Al anadir nodos, calcula posiciones para que no se solapen (X: +250 del ultimo nodo)
3. Siempre anade edges despues de los nodos
4. Confirma al usuario que nodos y conexiones has creado

## Base de conocimiento del proyecto
Tienes acceso a la tool \`search_documentation\` para consultar la documentacion interna de DoCatFlow.
Usa esta tool cuando:
- Te pregunten sobre el estado de una feature, un bug conocido, o una decision tecnica
- No estes seguro de si algo esta implementado o no
- Necesites contexto sobre sesiones anteriores de desarrollo
- Te pregunten "que se hizo en la sesion X" o "cuando se implemento Y"
Archivos disponibles: README.md, progressSesion2-14.md, .planning/PROJECT.md, STATE.md, ROADMAP.md

Tambien tienes \`read_error_history\` para ver los ultimos errores capturados por el interceptor.

## Diagnostico de errores comunes
Cuando recibas un mensaje que empieza con "🔴 Error detectado", sigue este protocolo:
1. Primero busca el patron del error en esta tabla de troubleshooting
2. Si coincide, da la solucion directamente
3. Si no coincide, usa \`search_documentation\` para buscar contexto
4. Si tampoco encuentra, da un diagnostico generico basado en el servicio y status code

### Tabla de troubleshooting
| Error | Causa | Solucion |
|-------|-------|---------|
| invalid model ID | Modelo configurado no existe en LiteLLM routing.yaml | Ir a Configuracion → verificar modelos activos. Editar el agente y seleccionar un modelo valido |
| Qdrant connection refused | Contenedor Qdrant no esta corriendo | Verificar en /system. Ejecutar \`docker compose up -d docflow-qdrant\` |
| Ollama connection refused | Contenedor Ollama no esta corriendo | Verificar en /system. Ejecutar \`docker compose up -d docflow-ollama\` |
| LiteLLM timeout / 502 | LiteLLM sobrecargado o API key invalida | Reintentar. Si persiste, verificar API key del provider en Configuracion |
| collection does not exist | Proyecto no procesado o coleccion borrada | Ir al proyecto → pestana RAG → re-procesar |
| spawn pdftotext ENOENT | poppler no instalado en contenedor | Problema de build. Verificar que Dockerfile incluye poppler-utils |
| ECONNREFUSED host.docker.internal:3501 | Host Agent no esta corriendo | \`systemctl --user restart docatflow-host-agent.service\` |
| OpenClaw RPC probe: failed | Gateway OpenClaw no esta corriendo | \`systemctl --user restart openclaw-gateway.service\` |
| Cannot read properties of null (canvas) | Canvas sin datos o template corrompido | Recargar pagina. Si persiste, crear canvas nuevo |

## Envio de Email
Cuando el usuario pida enviar un email:
1. Usa list_email_connectors para verificar que hay conectores disponibles
2. Confirma con el usuario los datos (destinatario, asunto, contenido) ANTES de enviar
3. Solo ejecuta send_email despues de que el usuario confirme
4. Reporta el resultado (exito o error) con detalle

## Skill de Orquestacion CatFlow (ACTIVA SIEMPRE)
Cuando el usuario pida CUALQUIERA de estas cosas, PRIMERO ejecuta
get_skill(name: "Orquestador CatFlow") y aplica las instrucciones que devuelva:
- Crear o modificar un canvas o flujo
- Anadir nodos al canvas
- Crear un CatPaw para usarlo en un flujo
- Conectar servicios externos (Gmail, Holded, Drive, SearXNG, LinkedIn)
- Disenar un pipeline o automatizacion

OBLIGATORIO: Llama a get_skill ANTES de ejecutar cualquier canvas_* tool.
La skill contiene el protocolo completo: canvas_get antes de modificar,
verificar agentId/connectorId antes de crear nodos, preguntar antes de crear
mas de 2 elementos nuevos.

## Skill de Arquitecto de Agentes (ACTIVA SIEMPRE)
Cuando el usuario pida CUALQUIERA de estas cosas, PRIMERO ejecuta
get_skill(name: "Arquitecto de Agentes") y aplica las instrucciones que devuelva:
- Crear un agente, CatPaw o asistente para un rol o tarea
- Recomendar que agente usar para algo
- Mejorar o potenciar un agente existente
- Asignar skills a un agente
- Configurar un agente para una funcion especifica

OBLIGATORIO: Antes de crear un CatPaw nuevo, SIEMPRE ejecuta list_cat_paws para
buscar agentes existentes que cubran el 80%+ de lo pedido. Tambien ejecuta
list_skills para recomendar skills relevantes. NUNCA crees un agente sin antes
mostrar alternativas existentes y sin vincular las skills apropiadas.

## Diagnostico de Ejecuciones de Canvas
Cuando un canvas termina con un resultado inesperado o el usuario pregunta
que paso en una ejecucion, usa canvas_list_runs y canvas_get_run para
diagnosticar que devolvio cada nodo. NO pidas sudo para consultar runs.

## Conocimiento avanzado de ejecucion de Canvas

### Nodos AGENT con CatPaws (EXEC-05)
Un nodo tipo "agent" con agentId que apunta a un CatPaw (cat_paws table) se ejecuta
automaticamente via executeCatPaw() con tool-calling multi-round. El CatPaw puede
usar herramientas de Drive (upload, create_folder, list, search) y MCP (Holded, LinkedIn)
si tiene conectores vinculados en cat_paw_connectors.
IMPORTANTE: El tipo de nodo del canvas para ejecutar un CatPaw es "agent" (con agentId
apuntando al CatPaw). No confundir CatPaw (nombre de los agentes) con el tipo de nodo
del canvas — el tipo siempre es "agent", y el executor detecta automaticamente que
el agentId es un CatPaw y activa el tool-calling.

### Propagacion de datos entre nodos
Cada nodo recibe SOLO el output del nodo anterior. Si un nodo intermedio descarta
datos, los nodos posteriores no los recuperan. Al disenar un flujo:
- El Analista debe incluir TODOS los datos de leads en su output
- El Gestor Drive debe propagar el array de leads completo junto con url_drive
- El Redactor necesita AMBOS (URL real + datos de leads) para construir el email
- Nunca depender de que un nodo "sepa" datos que no estan en su input

### Emails con formato HTML
El parser de email soporta JSON con campos to/subject/html_body (Strategy 1).
El LLM a veces envuelve JSON en markdown fences — el parser los limpia automaticamente.
Para tablas en email: estilos inline, colores #1a73e8 header, #f8f9fa filas alternas.
NUNCA poner filas placeholder — cada lead debe tener su propia fila con datos reales.

### URLs de Google Drive
Las URLs de Drive NUNCA deben ser generadas por el LLM. Deben obtenerse del campo
"link" de la respuesta de drive_upload_file. Si un CatPaw genera URLs inventadas,
revisar que tiene el conector Drive vinculado y que su system prompt dice
"usa la URL del campo link de la herramienta".

### Conectores disponibles
| Conector | ID | Tipo | Uso |
|----------|-----|------|-----|
| Holded MCP | seed-holded-mcp | mcp_server | CRM/ERP: contactos, leads, facturas, proyectos |
| LinkedIn Intelligence | seed-linkedin-mcp | mcp_server | Perfiles, empresas, empleos |
| SearXNG Web Search | (buscar ID) | http_api | Busqueda web sin tracking |
| Gemini Web Search | seed-gemini-search | http_api | Busqueda con grounding Google |
| Google Drive | (buscar ID) | google_drive | Archivos, carpetas, subida, descarga |
| Gmail Antonio Educa360 | (buscar ID) | gmail | Email workspace |`;
}

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { messages: userMessages, context, model: requestedModel, sudo_token, stream: useStream, channel, sudo_active: sudoActiveParam } = body as {
      messages: ChatMessage[];
      context?: { page?: string; project_id?: string; project_name?: string; channel?: string };
      model?: string;
      sudo_token?: string;
      stream?: boolean;
      channel?: 'web' | 'telegram';
      sudo_active?: boolean;
    };

    if (!userMessages || !Array.isArray(userMessages) || userMessages.length === 0) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
    }

    logger.info('catbot', 'Mensaje recibido', { messagesCount: userMessages.length, page: context?.page });

    // Get CatBot config from settings
    let catbotConfig: { model?: string; personality?: string; allowed_actions?: string[] } = {};
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'catbot_config'").get() as { value: string } | undefined;
      if (row) catbotConfig = JSON.parse(row.value);
    } catch { /* use defaults */ }

    // Check sudo status — INT-02: Telegram passes sudo_active directly (already verified password)
    const sudoConfig = getSudoConfig();
    const sudoActive = (channel === 'telegram' && sudoActiveParam === true)
      || (sudoConfig?.enabled && validateSudoSession(sudo_token));

    const model = requestedModel || catbotConfig.model || await resolveAlias('catbot');
    const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
    const baseUrl = process['env']['NEXTAUTH_URL'] || `http://localhost:${process['env']['PORT'] || 3000}`;

    const effectiveChannel = channel || context?.channel;
    let systemPrompt = buildSystemPrompt(context || {}, !!sudoActive);

    // INT-03: When channel='telegram', add instruction for concise Telegram-adapted responses
    if (effectiveChannel === 'telegram') {
      systemPrompt += `

## Canal: Telegram
Estas respondiendo via Telegram. Adapta tus respuestas:
- Se conciso: parrafos cortos, sin listas largas
- No uses instrucciones de navegacion de UI (el usuario no tiene navegador)
- Usa emoji para organizar la informacion visualmente
- Si necesitas mostrar codigo, usa bloques de codigo cortos
- No menciones botones, paneles ni elementos de la interfaz web
- Maximo 2-3 parrafos por respuesta`;
    }

    // Build tools list — regular tools + sudo tools always (execution is gated by sudo check)
    const regularTools = getToolsForLLM(catbotConfig.allowed_actions);
    const sudoTools = getSudoToolsForLLM();
    const tools = [...regularTools, ...sudoTools];

    // Build messages array with system prompt
    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...userMessages,
    ];

    // Tool-calling loop (max 8 iterations — canvas operations may chain: get + N×add_node + N×add_edge)
    const maxIterations = 8;

    // ─── STREAMING PATH ───
    if (useStream) {
      const sseStream = createSSEStream((send, close) => {
        (async () => {
          try {
            send('start', { timestamp: Date.now() });
            let totalInputTokens = 0;
            let totalOutputTokens = 0;
            const allToolResults: Array<{ name: string; args: Record<string, unknown>; result: unknown; sudo?: boolean }> = [];
            const allActions: Array<{ type: string; url: string; label: string }> = [];
            let sudoRequired = false;

            for (let iteration = 0; iteration < maxIterations; iteration++) {
              let iterationContent = '';
              const pendingToolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];

              await streamLiteLLM(
                { model, messages: llmMessages, max_tokens: 2048, tools: tools.length > 0 ? tools : undefined },
                {
                  onToken: (token) => {
                    iterationContent += token;
                    send('token', { token });
                  },
                  onToolCall: (tc) => {
                    pendingToolCalls.push(tc);
                  },
                  onDone: (usage) => {
                    totalInputTokens += usage?.prompt_tokens || 0;
                    totalOutputTokens += usage?.completion_tokens || 0;
                  },
                  onError: (error) => { throw error; },
                }
              );

              // If no tool calls, this is the final text response
              if (pendingToolCalls.length === 0) {
                break;
              }

              // Push assistant message with tool_calls to conversation
              llmMessages.push({
                role: 'assistant',
                content: iterationContent,
                tool_calls: pendingToolCalls.map(tc => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: { name: tc.function.name, arguments: tc.function.arguments },
                })),
              });

              // Execute each tool call
              for (const tc of pendingToolCalls) {
                const toolName = tc.function.name;
                let toolArgs: Record<string, unknown> = {};
                try {
                  toolArgs = JSON.parse(tc.function.arguments || '{}');
                } catch { /* empty args */ }

                send('tool_call_start', { name: toolName, id: tc.id });

                if (isHoldedTool(toolName)) {
                  const toolResult = await executeHoldedTool(toolName, toolArgs);
                  allToolResults.push({ name: toolName, args: toolArgs, result: toolResult.result });
                  if (toolResult.actions) allActions.push(...toolResult.actions);
                  send('tool_call_result', { id: tc.id, name: toolName, result: toolResult.result });
                  llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResult.result) });
                } else if (isSudoTool(toolName)) {
                  if (!sudoActive) {
                    const isProtected = !sudoConfig?.enabled || (sudoConfig.protected_actions || []).includes(toolName);
                    if (isProtected) {
                      sudoRequired = true;
                      const sudoResult = {
                        error: 'SUDO_REQUIRED',
                        message: `Esta accion (${toolName}) requiere autenticacion sudo. El usuario debe introducir su clave de seguridad.`,
                      };
                      allToolResults.push({ name: toolName, args: toolArgs, result: sudoResult, sudo: true });
                      send('tool_call_result', { id: tc.id, name: toolName, result: sudoResult });
                      llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(sudoResult) });
                      continue;
                    }
                  }

                  const toolResult = await executeSudoTool(toolName, toolArgs);
                  allToolResults.push({ name: toolName, args: toolArgs, result: toolResult.result, sudo: true });
                  if (toolResult.actions) allActions.push(...toolResult.actions);
                  send('tool_call_result', { id: tc.id, name: toolName, result: toolResult.result });
                  llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResult.result) });
                } else if (toolName === 'update_alias_routing' && !sudoActive) {
                  sudoRequired = true;
                  const sudoResult = {
                    error: 'SUDO_REQUIRED',
                    message: 'Cambiar routing de modelos requiere autenticacion sudo. El usuario debe introducir su clave de seguridad.',
                  };
                  allToolResults.push({ name: toolName, args: toolArgs, result: sudoResult, sudo: true });
                  send('tool_call_result', { id: tc.id, name: toolName, result: sudoResult });
                  llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(sudoResult) });
                } else {
                  const toolResult = await executeTool(toolName, toolArgs, baseUrl);
                  allToolResults.push({ name: toolName, args: toolArgs, result: toolResult.result });
                  if (toolResult.actions) allActions.push(...toolResult.actions);
                  send('tool_call_result', { id: tc.id, name: toolName, result: toolResult.result });
                  llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResult.result) });
                }
              }
            }

            // Log usage
            const durationMs = Date.now() - startTime;
            try {
              logUsage({
                event_type: 'chat',
                model,
                provider: model.includes('gemini') ? 'google' : model.includes('claude') ? 'anthropic' : model.includes('gpt') ? 'openai' : 'other',
                input_tokens: totalInputTokens,
                output_tokens: totalOutputTokens,
                duration_ms: durationMs,
                status: 'success',
                metadata: { source: 'catbot', page: context?.page, sudo: sudoActive },
              });
            } catch { /* non-blocking */ }

            logger.info('catbot', 'Respuesta streaming generada', { toolCalls: allToolResults.length, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, durationMs });

            send('done', {
              usage: { input: totalInputTokens, output: totalOutputTokens },
              tool_calls: allToolResults,
              actions: allActions,
              sudo_required: sudoRequired,
              sudo_active: !!sudoActive,
            });
            close();
          } catch (error) {
            logger.error('catbot', 'Error en CatBot streaming', { error: (error as Error).message });
            send('error', { message: (error as Error).message });
            close();
          }
        })();
      });

      return new Response(sseStream, { headers: sseHeaders });
    }

    // ─── NON-STREAMING PATH (unchanged) ───
    const allToolResults: Array<{ name: string; args: Record<string, unknown>; result: unknown; sudo?: boolean }> = [];
    const allActions: Array<{ type: string; url: string; label: string }> = [];
    let finalReply = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let sudoRequired = false;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const llmResponse = await fetch(`${litellmUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${litellmKey}`,
        },
        body: JSON.stringify({
          model,
          messages: llmMessages,
          tools: tools.length > 0 ? tools : undefined,
          max_tokens: 2048,
        }),
      });

      if (!llmResponse.ok) {
        const errorText = await llmResponse.text();
        logger.error('catbot', 'Error comunicandose con LiteLLM', { error: errorText });
        return NextResponse.json({ error: 'Error comunicandose con el LLM', details: errorText }, { status: 502 });
      }

      const llmData = await llmResponse.json();
      const choice = llmData.choices?.[0];
      const usage = llmData.usage || {};
      totalInputTokens += usage.prompt_tokens || 0;
      totalOutputTokens += usage.completion_tokens || 0;

      if (!choice) {
        return NextResponse.json({ error: 'No response from LLM' }, { status: 502 });
      }

      const assistantMessage = choice.message;

      // If no tool calls, we have the final response
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        finalReply = assistantMessage.content || '';
        break;
      }

      // Process tool calls
      llmMessages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch { /* empty args */ }

        // Check if this is a holded tool (before sudo check)
        if (isHoldedTool(toolName)) {
          const toolResult = await executeHoldedTool(toolName, toolArgs);
          allToolResults.push({ name: toolName, args: toolArgs, result: toolResult.result });
          if (toolResult.actions) allActions.push(...toolResult.actions);

          llmMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult.result),
          });
        } else if (isSudoTool(toolName)) {
          // Check if sudo is active
          if (!sudoActive) {
            // Check if this specific action requires sudo
            const isProtected = !sudoConfig?.enabled || (sudoConfig.protected_actions || []).includes(toolName);

            if (isProtected) {
              sudoRequired = true;
              // Return a result telling the LLM that sudo is needed
              const sudoResult = {
                error: 'SUDO_REQUIRED',
                message: `Esta accion (${toolName}) requiere autenticacion sudo. El usuario debe introducir su clave de seguridad.`,
              };
              allToolResults.push({ name: toolName, args: toolArgs, result: sudoResult, sudo: true });
              llmMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(sudoResult),
              });
              continue;
            }
          }

          // Execute sudo tool
          const toolResult = await executeSudoTool(toolName, toolArgs);
          allToolResults.push({ name: toolName, args: toolArgs, result: toolResult.result, sudo: true });
          if (toolResult.actions) allActions.push(...toolResult.actions);

          llmMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult.result),
          });
        } else if (toolName === 'update_alias_routing' && !sudoActive) {
          sudoRequired = true;
          const sudoResult = {
            error: 'SUDO_REQUIRED',
            message: 'Cambiar routing de modelos requiere autenticacion sudo. El usuario debe introducir su clave de seguridad.',
          };
          allToolResults.push({ name: toolName, args: toolArgs, result: sudoResult, sudo: true });
          llmMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(sudoResult),
          });
          continue;
        } else {
          // Regular tool
          const toolResult = await executeTool(toolName, toolArgs, baseUrl);
          allToolResults.push({ name: toolName, args: toolArgs, result: toolResult.result });
          if (toolResult.actions) allActions.push(...toolResult.actions);

          llmMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult.result),
          });
        }
      }
    }

    // Log usage
    const durationMs = Date.now() - startTime;
    try {
      logUsage({
        event_type: 'chat',
        model,
        provider: model.includes('gemini') ? 'google' : model.includes('claude') ? 'anthropic' : model.includes('gpt') ? 'openai' : 'other',
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        duration_ms: durationMs,
        status: 'success',
        metadata: { source: 'catbot', page: context?.page, sudo: sudoActive },
      });
    } catch { /* non-blocking */ }

    logger.info('catbot', 'Respuesta generada', { toolCalls: allToolResults.length, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, durationMs: Date.now() - startTime });

    return NextResponse.json({
      reply: finalReply,
      tool_calls: allToolResults,
      actions: allActions,
      tokens: { input: totalInputTokens, output: totalOutputTokens },
      sudo_required: sudoRequired,
      sudo_active: !!sudoActive,
    });
  } catch (error) {
    logger.error('catbot', 'Error en CatBot', { error: (error as Error).message });
    let serverErrorMsg = '🐱 Error';
    try {
      const tCatbot = await getTranslations('catbot.ui');
      serverErrorMsg = tCatbot('serverError');
    } catch { /* fallback */ }
    return NextResponse.json({
      reply: serverErrorMsg,
      tool_calls: [],
      actions: [],
      tokens: { input: 0, output: 0 },
    }, { status: 200 });
  }
}
