import { NextResponse } from 'next/server';
import { getToolsForLLM, executeTool } from '@/lib/services/catbot-tools';
import { getSudoToolsForLLM, executeSudoTool, isSudoTool } from '@/lib/services/catbot-sudo-tools';
import { validateSudoSession } from '@/lib/sudo';
import { logUsage } from '@/lib/services/usage-tracker';
import { streamLiteLLM, sseHeaders, createSSEStream } from '@/lib/services/stream-utils';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

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
- **Conectores** (/connectors): Integracion con n8n, HTTP APIs, MCP servers, email
- **Configuracion** (/settings): API keys, limites de procesamiento, costes de modelos, seguridad CatBot
- **Estado del Sistema** (/system): Servicios conectados (OpenClaw, n8n, Qdrant, LiteLLM)

## Stack del servidor
- DoCatFlow: Next.js 14 App Router + SQLite + Qdrant (vectores) — Puerto 3500
- LiteLLM: Proxy multi-LLM — Puerto 4000
- Qdrant: Base de datos vectorial — Puerto 6333
- Ollama: LLM local — Puerto 11434
- n8n: Automatizacion de workflows — Puerto 5678
- OpenClaw: Gateway de agentes — Puerto 18789
- Directorios clave: ~/docflow/ (codigo), ~/docflow-data/ (datos), ~/.openclaw/ (config agentes)

## Contexto actual
- Pagina actual: ${context.page || 'desconocida'}
${context.project_name ? `- Proyecto abierto: ${context.project_name}` : ''}
- Estadisticas: ${catbrainsCount} catbrains, ${catpawsCount} CatPaws activos, ${tasksCount} tareas
${sudoSection}

## Instrucciones de tools
- Tienes acceso a tools para crear y listar recursos, navegar, y explicar funcionalidades
- Cuando crees algo, usa la tool correspondiente y luego confirma al usuario con un mensaje amigable
- Cuando el usuario pregunte sobre una funcionalidad, usa explain_feature
- Cuando sugiereas ir a una pagina, usa navigate_to para generar un boton clickeable
- NO inventes datos. Si necesitas listar algo, usa la tool list_* correspondiente

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
| Cannot read properties of null (canvas) | Canvas sin datos o template corrompido | Recargar pagina. Si persiste, crear canvas nuevo |`;
}

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { messages: userMessages, context, model: requestedModel, sudo_token, stream: useStream } = body as {
      messages: ChatMessage[];
      context?: { page?: string; project_id?: string; project_name?: string };
      model?: string;
      sudo_token?: string;
      stream?: boolean;
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

    // Check sudo status
    const sudoConfig = getSudoConfig();
    const sudoActive = sudoConfig?.enabled && validateSudoSession(sudo_token);

    const model = requestedModel || catbotConfig.model || 'gemini-main';
    const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
    const baseUrl = process['env']['NEXTAUTH_URL'] || `http://localhost:${process['env']['PORT'] || 3000}`;

    const systemPrompt = buildSystemPrompt(context || {}, !!sudoActive);

    // Build tools list — regular tools + sudo tools always (execution is gated by sudo check)
    const regularTools = getToolsForLLM(catbotConfig.allowed_actions);
    const sudoTools = getSudoToolsForLLM();
    const tools = [...regularTools, ...sudoTools];

    // Build messages array with system prompt
    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...userMessages,
    ];

    // Tool-calling loop (max 5 iterations — sudo tools may chain)
    const maxIterations = 5;

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

                if (isSudoTool(toolName)) {
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

        // Check if this is a sudo tool
        if (isSudoTool(toolName)) {
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
    return NextResponse.json({
      reply: '🐱 ¡Ups! Algo ha fallado. Intenta de nuevo en un momento.',
      tool_calls: [],
      actions: [],
      tokens: { input: 0, output: 0 },
    }, { status: 200 });
  }
}
