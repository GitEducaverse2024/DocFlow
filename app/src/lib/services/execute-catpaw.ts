import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { logUsage } from '@/lib/services/usage-tracker';
import { litellm } from '@/lib/services/litellm';
import { resolveAlias } from '@/lib/services/alias-routing';
import { withRetry } from '@/lib/retry';
import { executeCatBrain } from './execute-catbrain';
import { getDriveToolsForPaw, DriveToolDispatch } from './catpaw-drive-tools';
import { executeDriveToolCall } from './catpaw-drive-executor';
import { getGmailToolsForPaw, GmailToolDispatch } from './catpaw-gmail-tools';
import { executeGmailToolCall } from './catpaw-gmail-executor';
import { getEmailTemplateToolsForPaw, EmailTemplateToolDispatch } from './catpaw-email-template-tools';
import { executeEmailTemplateToolCall } from './catpaw-email-template-executor';
import type { CatBrainInput, CatBrainOutput } from '@/lib/types/catbrain';
import type { CatPaw, CatPawInput, CatPawOutput } from '@/lib/types/catpaw';

// --- Row types for relation queries ---

interface CatBrainRelRow {
  catbrain_id: string;
  query_mode: 'rag' | 'connector' | 'both';
  priority: number;
  catbrain_name: string;
}

interface ConnectorRelRow {
  connector_id: string;
  connector_name: string;
  connector_type: string;
  config: string | null;
  usage_hint: string | null;
}

interface SkillRow {
  name: string;
  instructions: string;
}

/**
 * Orchestrates CatPaw execution: loads CatPaw with relations, queries linked CatBrains,
 * invokes active connectors, builds prompt, calls LiteLLM, logs usage, returns CatPawOutput.
 */
export async function executeCatPaw(
  pawId: string,
  input: CatPawInput,
  options?: { extraSkillIds?: string[]; extraConnectorIds?: string[]; extraCatBrainIds?: string[] }
): Promise<CatPawOutput> {
  const startTime = Date.now();

  // 1. Load CatPaw with relations
  const paw = db.prepare(
    'SELECT * FROM cat_paws WHERE id = ? AND is_active = 1'
  ).get(pawId) as CatPaw | undefined;

  if (!paw) {
    throw new Error('CatPaw no encontrado o inactivo');
  }

  const linkedCatBrains = db.prepare(
    'SELECT cpc.*, c.name as catbrain_name FROM cat_paw_catbrains cpc LEFT JOIN catbrains c ON c.id = cpc.catbrain_id WHERE cpc.paw_id = ? ORDER BY cpc.priority DESC'
  ).all(pawId) as CatBrainRelRow[];

  // Merge canvas-level extra CatBrains
  if (options?.extraCatBrainIds?.length) {
    const baseCbIds = new Set(linkedCatBrains.map(cb => cb.catbrain_id));
    for (const cbId of options.extraCatBrainIds) {
      if (baseCbIds.has(cbId)) continue;
      const cb = db.prepare('SELECT id, name FROM catbrains WHERE id = ?').get(cbId) as { id: string; name: string } | undefined;
      if (cb) {
        linkedCatBrains.push({ catbrain_id: cb.id, query_mode: 'rag', priority: 0, catbrain_name: cb.name } as CatBrainRelRow);
      }
    }
  }

  const linkedConnectors = db.prepare(
    'SELECT cpc.*, c.name as connector_name, c.type as connector_type, c.config FROM cat_paw_connectors cpc LEFT JOIN connectors c ON c.id = cpc.connector_id WHERE cpc.paw_id = ? AND cpc.is_active = 1'
  ).all(pawId) as ConnectorRelRow[];

  // Merge canvas-level extra connectors (not in CatPaw base config)
  if (options?.extraConnectorIds?.length) {
    const baseConnIds = new Set(linkedConnectors.map(c => c.connector_id));
    for (const cid of options.extraConnectorIds) {
      if (baseConnIds.has(cid)) continue;
      const conn = db.prepare('SELECT id, name, type, config FROM connectors WHERE id = ? AND is_active = 1').get(cid) as { id: string; name: string; type: string; config: string | null } | undefined;
      if (conn) {
        linkedConnectors.push({
          paw_id: pawId, connector_id: conn.id, is_active: 1, usage_hint: null,
          connector_name: conn.name, connector_type: conn.type, config: conn.config,
        } as ConnectorRelRow);
      }
    }
  }

  const linkedSkills = db.prepare(
    'SELECT s.name, s.instructions FROM cat_paw_skills cps JOIN skills s ON s.id = cps.skill_id WHERE cps.paw_id = ?'
  ).all(pawId) as SkillRow[];

  // Merge canvas-level extra skills (not in CatPaw base config)
  if (options?.extraSkillIds?.length) {
    const baseSkillNames = new Set(linkedSkills.map(s => s.name));
    const placeholders = options.extraSkillIds.map(() => '?').join(',');
    const extraSkills = db.prepare(
      `SELECT name, instructions FROM skills WHERE id IN (${placeholders})`
    ).all(...options.extraSkillIds) as SkillRow[];
    for (const s of extraSkills) {
      if (!baseSkillNames.has(s.name)) linkedSkills.push(s);
    }
  }

  logger.info('cat-paws', 'Executing CatPaw', {
    pawId,
    name: paw.name,
    mode: paw.mode,
    catbrains: linkedCatBrains.length,
    connectors: linkedConnectors.length,
    skills: linkedSkills.length,
  });

  // 2. Query linked CatBrains via executeCatBrain
  let catbrainContext = input.catbrain_results || '';
  const allSources: string[] = [];
  const allConnectorData: { connector_name: string; success: boolean; data: unknown }[] = [];

  if (!input.catbrain_results && linkedCatBrains.length > 0) {
    for (const cb of linkedCatBrains) {
      try {
        const cbInput: CatBrainInput = {
          query: input.query,
          context: input.context,
          mode: cb.query_mode,
        };
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
        if (cbOutput.connector_data) {
          allConnectorData.push(...cbOutput.connector_data);
        }
      } catch (err) {
        logger.error('cat-paws', `Error executing CatBrain ${cb.catbrain_id}`, {
          pawId,
          catbrainName: cb.catbrain_name,
          error: (err as Error).message,
        });
      }
    }
  }

  // 3. Invoke active connectors (type-aware)
  const connectorResults: { connector_name: string; success: boolean; data: unknown }[] = [];
  for (const conn of linkedConnectors) {
    const connName = conn.connector_name || conn.connector_id;
    try {
      const connConfig = conn.config ? JSON.parse(conn.config) : {};

      // Skip connector types handled via tool-calling loop below (Drive, Gmail, Email Template)
      if (['google_drive', 'gmail', 'email_template'].includes(conn.connector_type)) {
        continue;
      }

      // MCP Server connector: use JSON-RPC protocol with session support
      if (conn.connector_type === 'mcp_server' && connConfig.url) {
        const mcpHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        };

        // Initialize handshake to get session ID
        const initRes = await fetch(connConfig.url, {
          method: 'POST',
          headers: mcpHeaders,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'docflow-catpaw', version: '1.0' },
            },
          }),
        });
        const sessionId = initRes.headers.get('mcp-session-id');
        if (sessionId) {
          mcpHeaders['Mcp-Session-Id'] = sessionId;
        }

        // Determine tool name from usage_hint or default
        const toolName = conn.usage_hint?.match(/\b(\w+_\w+)\b/)?.[1] || connConfig.tool_name || 'search';
        const toolArgs: Record<string, unknown> = {};

        // Build args based on tool name heuristics
        if (toolName.includes('search')) {
          toolArgs.keywords = input.query;
          toolArgs.query = input.query;
        } else {
          toolArgs.query = input.query;
        }

        const controller = new AbortController();
        const timeoutMs = (connConfig.timeout || 30) * 1000;
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const mcpRes = await fetch(connConfig.url, {
          method: 'POST',
          headers: mcpHeaders,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now() + 1,
            method: 'tools/call',
            params: { name: toolName, arguments: toolArgs },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const mcpBody = await mcpRes.text();
        let rpcResponse;
        if (mcpBody.startsWith('event:') || (mcpRes.headers.get('content-type') || '').includes('text/event-stream')) {
          const dataLine = mcpBody.split('\n').find((l: string) => l.startsWith('data: '));
          rpcResponse = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(mcpBody);
        } else {
          rpcResponse = JSON.parse(mcpBody);
        }

        if (rpcResponse.error) {
          connectorResults.push({ connector_name: connName, success: false, data: rpcResponse.error });
        } else {
          const content = rpcResponse.result?.content;
          let mcpData: unknown;
          if (Array.isArray(content) && content.length > 0 && content[0].text) {
            try { mcpData = JSON.parse(content[0].text); } catch { mcpData = content[0].text; }
          } else {
            mcpData = rpcResponse.result;
          }
          connectorResults.push({ connector_name: connName, success: true, data: mcpData });
        }
        continue;
      }

      // HTTP API / n8n webhook: generic HTTP call
      const payload = {
        paw_id: pawId,
        paw_name: paw.name,
        query: input.query,
        context: input.context,
      };

      const controller = new AbortController();
      const timeoutMs = (connConfig.timeout || 30) * 1000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(connConfig.url, {
        method: connConfig.method || 'POST',
        headers: { 'Content-Type': 'application/json', ...(connConfig.headers || {}) },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = text.substring(0, 5000);
      }

      connectorResults.push({
        connector_name: connName,
        success: res.ok,
        data,
      });
    } catch (err) {
      logger.error('cat-paws', `Error invoking connector ${conn.connector_id}`, {
        pawId,
        connectorName: connName,
        error: (err as Error).message,
      });
      connectorResults.push({
        connector_name: connName,
        success: false,
        data: { error: (err as Error).message },
      });
    }
  }

  // Merge connector data from CatBrains and direct connectors
  const mergedConnectorData = [...allConnectorData, ...connectorResults];

  // 4. Build messages array
  const systemParts: string[] = [];

  // System prompt
  if (paw.system_prompt) {
    systemParts.push(paw.system_prompt);
  } else {
    systemParts.push(`Eres ${paw.name}, un asistente experto.`);
  }

  // Tone
  if (paw.tone) {
    systemParts.push(`\nTono: ${paw.tone}`);
  }

  // Skills
  if (linkedSkills.length > 0) {
    const skillsText = linkedSkills.map(s => `### ${s.name}\n${s.instructions}`).join('\n\n');
    systemParts.push(`\n--- SKILLS ---\n${skillsText}\n--- FIN SKILLS ---`);
  }

  // CatBrain knowledge
  if (catbrainContext) {
    systemParts.push(`\n--- CONOCIMIENTO CATBRAINS ---\n${catbrainContext}\n--- FIN CONOCIMIENTO CATBRAINS ---`);
  }

  // Connector data
  if (mergedConnectorData.length > 0) {
    const formattedConnectorResults = mergedConnectorData
      .map(c => `[${c.connector_name}] ${c.success ? 'OK' : 'ERROR'}: ${typeof c.data === 'string' ? c.data : JSON.stringify(c.data)}`)
      .join('\n\n');
    systemParts.push(`\n--- DATOS DE CONECTORES ---\n${formattedConnectorResults}\n--- FIN DATOS CONECTORES ---`);
  }

  // Processor mode instructions
  if (paw.mode === 'processor' && paw.processing_instructions) {
    systemParts.push(`\n--- INSTRUCCIONES DE PROCESAMIENTO ---\n${paw.processing_instructions}\nFormato de salida: ${paw.output_format}\n--- FIN INSTRUCCIONES ---`);
  }

  // Build user message
  const userParts: string[] = [];
  if (input.document_content) {
    userParts.push(`--- DOCUMENTO ---\n${input.document_content}\n--- FIN DOCUMENTO ---`);
  }
  if (input.context) {
    userParts.push(`Contexto previo:\n${input.context}`);
  }
  userParts.push(input.query);

  const userMessage = userParts.join('\n\n---\n\n');

  // 5. Build tool definitions from linked connectors
  const driveToolDispatch = new Map<string, DriveToolDispatch>();
  const gmailToolDispatch = new Map<string, GmailToolDispatch>();
  const emailTemplateToolDispatch = new Map<string, EmailTemplateToolDispatch>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openAITools: any[] = [];

  // Gmail tools
  const gmailConnectors = linkedConnectors.filter(c => c.connector_type === 'gmail');
  if (gmailConnectors.length > 0) {
    const gmailInfos = gmailConnectors.map(c => ({
      connectorId: c.connector_id,
      connectorName: c.connector_name,
    }));
    const { tools: gmailTools, dispatch: gmailDispatchMap } = getGmailToolsForPaw(pawId, gmailInfos);
    openAITools.push(...gmailTools);
    gmailDispatchMap.forEach((info, name) => gmailToolDispatch.set(name, info));

    const connNames = gmailConnectors.map(c => c.connector_name).join(', ');
    systemParts.push(`\n--- GMAIL (${connNames}) ---\nTienes herramientas para operar con Gmail: buscar emails (gmail_search_emails), leer emails (gmail_read_email), enviar (gmail_send_email con CC y HTML), responder en hilo (gmail_reply_to_message), marcar como leido (gmail_mark_as_read). Usa las herramientas gmail_* disponibles. NUNCA inventes datos — usa siempre los valores devueltos por las herramientas.\n--- FIN GMAIL ---`);
    logger.info('cat-paws', `Loaded ${gmailTools.length} Gmail tools for executeCatPaw`, { pawId });
  }

  // Drive tools
  const driveConnectors = linkedConnectors.filter(c => c.connector_type === 'google_drive');
  if (driveConnectors.length > 0) {
    const driveInfos = driveConnectors.map(c => ({
      connectorId: c.connector_id,
      connectorName: c.connector_name,
    }));
    const { tools: driveTools, dispatch: driveDispatchMap } = getDriveToolsForPaw(pawId, driveInfos);
    openAITools.push(...driveTools);
    driveDispatchMap.forEach((info, name) => driveToolDispatch.set(name, info));

    // Add Drive usage instructions to system prompt
    const connNames = driveConnectors.map(c => c.connector_name).join(', ');
    systemParts.push(`\n--- GOOGLE DRIVE (${connNames}) ---\nTienes herramientas para interactuar con Google Drive: listar, buscar, leer, subir archivos y crear carpetas. Usa las herramientas drive_* disponibles para ejecutar operaciones reales. NUNCA inventes URLs o IDs — usa siempre los valores devueltos por las herramientas.\n--- FIN GOOGLE DRIVE ---`);
  }

  // MCP tools (Holded, etc.)
  type McpToolDispatch = { serverUrl: string; connectorName: string; sessionId?: string };
  const mcpToolDispatch = new Map<string, McpToolDispatch>();
  const mcpConnectors = linkedConnectors.filter(c => c.connector_type === 'mcp_server');
  if (mcpConnectors.length > 0) {
    for (const conn of mcpConnectors) {
      const connConfig = conn.config ? JSON.parse(conn.config) : {};
      if (!connConfig.url) continue;
      try {
        const mcpHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        };
        const initRes = await fetch(connConfig.url, {
          method: 'POST',
          headers: mcpHeaders,
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'DoCatFlow-CatPaw', version: '1.0.0' } },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        const sessionId = initRes.headers.get('mcp-session-id') || undefined;
        const sessionHeaders = sessionId ? { ...mcpHeaders, 'mcp-session-id': sessionId } : mcpHeaders;

        const toolsRes = await fetch(connConfig.url, {
          method: 'POST',
          headers: sessionHeaders,
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
          signal: AbortSignal.timeout(10_000),
        });
        const toolsBody = await toolsRes.text();
        let toolsParsed;
        if (toolsBody.includes('data: ')) {
          const dataLine = toolsBody.split('\n').find((l: string) => l.startsWith('data: '));
          toolsParsed = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(toolsBody);
        } else {
          toolsParsed = JSON.parse(toolsBody);
        }
        const mcpTools = toolsParsed.result?.tools || [];
        for (const t of mcpTools) {
          openAITools.push({
            type: 'function',
            function: {
              name: t.name,
              description: t.description || '',
              parameters: t.inputSchema || { type: 'object', properties: {} },
            },
          });
          mcpToolDispatch.set(t.name, { serverUrl: connConfig.url, connectorName: conn.connector_name, sessionId });
        }
        logger.info('cat-paws', `Loaded ${mcpTools.length} MCP tools from ${conn.connector_name}`, { pawId });
      } catch (err) {
        logger.error('cat-paws', `Error loading MCP tools from ${conn.connector_name}`, {
          pawId, error: (err as Error).message,
        });
      }
    }
  }

  // Email Template tools
  const emailTemplateConnectors = linkedConnectors.filter(c => c.connector_type === 'email_template');
  if (emailTemplateConnectors.length > 0) {
    const etInfos = emailTemplateConnectors.map(c => ({
      connectorId: c.connector_id,
      connectorName: c.connector_name,
    }));
    const { tools: etTools, dispatch: etDispatchMap } = getEmailTemplateToolsForPaw(pawId, etInfos);
    openAITools.push(...etTools);
    etDispatchMap.forEach((info, name) => emailTemplateToolDispatch.set(name, info));

    systemParts.push(`\n--- EMAIL TEMPLATES ---\nTienes herramientas para trabajar con plantillas de email corporativas: list_email_templates, get_email_template, render_email_template. Usa get_email_template para ver las instrucciones (variables) que debes rellenar. Las claves de variable deben coincidir EXACTAMENTE con el campo "text" de cada bloque instruction. Luego usa render_email_template para generar el HTML final.\n--- FIN EMAIL TEMPLATES ---`);
    logger.info('cat-paws', `Loaded ${etTools.length} email template tools for executeCatPaw`, { pawId });
  }

  const systemMessage = systemParts.join('\n');

  // 6. Call LiteLLM with tool-calling loop
  const rawModel = paw.model || await resolveAlias('agent-task');
  const model = await litellm.resolveModel(rawModel);

  const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
  const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';

  const MAX_TOOL_ROUNDS = 12;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: 'system', content: systemMessage },
    { role: 'user', content: userMessage },
  ];

  let answer = '';
  let lastRenderedHtml = ''; // Buffer: last HTML from render_email_template
  const totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const chatRes = await withRetry(async () => {
      const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${litellmKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: paw.temperature,
          max_tokens: paw.max_tokens,
          ...(openAITools.length > 0 ? { tools: openAITools } : {}),
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error de LiteLLM (${res.status}): ${errText}`);
      }
      return res;
    });

    const chatData = await chatRes.json();
    const choice = chatData.choices?.[0];
    const msgContent = choice?.message?.content || '';
    const toolCalls = choice?.message?.tool_calls;
    const usage = chatData.usage || {};

    totalUsage.prompt_tokens += usage.prompt_tokens || 0;
    totalUsage.completion_tokens += usage.completion_tokens || 0;
    totalUsage.total_tokens += usage.total_tokens || 0;

    // No tool calls — final answer
    if (!toolCalls || toolCalls.length === 0) {
      answer = msgContent || 'No se pudo generar una respuesta.';
      break;
    }

    // Process tool calls
    logger.info('cat-paws', `Tool-calling round ${round + 1}`, {
      pawId, tools: toolCalls.map((tc: { function: { name: string } }) => tc.function.name),
    });

    messages.push({
      role: 'assistant',
      content: msgContent || '',
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }
      let result: string;

      const driveDispatch = driveToolDispatch.get(tc.function.name);
      const gmailDispatch = gmailToolDispatch.get(tc.function.name);
      const mcpDispatch = mcpToolDispatch.get(tc.function.name);

      if (gmailDispatch) {
        try {
          result = await executeGmailToolCall(pawId, gmailDispatch, args);
          logger.info('cat-paws', `Gmail tool ${tc.function.name} completed`, { pawId });
        } catch (err) {
          result = JSON.stringify({ error: `Gmail tool error: ${(err as Error).message}` });
        }
      } else if (driveDispatch) {
        try {
          result = await executeDriveToolCall(pawId, driveDispatch, args);
          logger.info('cat-paws', `Drive tool ${tc.function.name} completed`, { pawId });
        } catch (err) {
          result = JSON.stringify({ error: `Drive tool error: ${(err as Error).message}` });
        }
      } else if (mcpDispatch) {
        try {
          const callHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
          };
          if (mcpDispatch.sessionId) callHeaders['mcp-session-id'] = mcpDispatch.sessionId;

          const mcpRes = await fetch(mcpDispatch.serverUrl, {
            method: 'POST',
            headers: callHeaders,
            body: JSON.stringify({
              jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
              params: { name: tc.function.name, arguments: args },
            }),
            signal: AbortSignal.timeout(30_000),
          });
          const mcpBody = await mcpRes.text();
          let rpcResponse;
          if (mcpBody.includes('data: ')) {
            const dataLine = mcpBody.split('\n').find((l: string) => l.startsWith('data: '));
            rpcResponse = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(mcpBody);
          } else {
            rpcResponse = JSON.parse(mcpBody);
          }
          if (rpcResponse.error) {
            result = JSON.stringify({ error: rpcResponse.error.message || JSON.stringify(rpcResponse.error) });
          } else {
            const content = rpcResponse.result?.content;
            if (Array.isArray(content) && content.length > 0 && content[0].text) {
              result = content[0].text.length > 10_000 ? content[0].text.slice(0, 10_000) + '...' : content[0].text;
            } else {
              result = JSON.stringify(rpcResponse.result || rpcResponse);
            }
          }
          logger.info('cat-paws', `MCP tool ${tc.function.name} completed`, { pawId });
        } catch (err) {
          result = JSON.stringify({ error: `MCP tool error: ${(err as Error).message}` });
        }
      } else if (emailTemplateToolDispatch.has(tc.function.name)) {
        const etDispatch = emailTemplateToolDispatch.get(tc.function.name)!;
        try {
          result = await executeEmailTemplateToolCall(pawId, etDispatch, args);
          // Buffer rendered HTML for fallback recovery
          if (etDispatch.operation === 'render_template') {
            try {
              const parsed = JSON.parse(result);
              if (parsed.html) lastRenderedHtml = parsed.html;
            } catch { /* not JSON, ignore */ }
          }
          logger.info('cat-paws', `Email template tool ${tc.function.name} completed`, { pawId });
        } catch (err) {
          result = JSON.stringify({ error: `Email template tool error: ${(err as Error).message}` });
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

  // Fallback: if the LLM failed to produce output but render_email_template succeeded,
  // reconstruct the answer with the buffered HTML so the pipeline doesn't break.
  // Try to extract 'to' and 'asunto' from the system/user messages if the instructions
  // contain a JSON template with those fields.
  if (lastRenderedHtml && (answer === 'No se pudo generar una respuesta.' || answer.length < 50)) {
    logger.info('cat-paws', 'Fallback: reconstructing answer from buffered render_email_template HTML', { pawId });
    const fallbackJson: Record<string, unknown> = { html_body: lastRenderedHtml };
    // Scan instructions for "to":[...] and "asunto":"..." patterns
    const allText = systemMessage + ' ' + userMessage;
    const toMatch = allText.match(/"to"\s*:\s*\[([^\]]+)\]/);
    if (toMatch) {
      try { fallbackJson.to = JSON.parse('[' + toMatch[1] + ']'); } catch { /* ignore */ }
    }
    const asuntoMatch = allText.match(/"asunto"\s*:\s*"([^"]+)"/);
    if (asuntoMatch) fallbackJson.asunto = asuntoMatch[1];
    answer = JSON.stringify(fallbackJson);
  }

  const durationMs = Date.now() - startTime;

  // 7. Log usage
  logUsage({
    event_type: 'chat',
    agent_id: pawId,
    model,
    input_tokens: totalUsage.prompt_tokens,
    output_tokens: totalUsage.completion_tokens,
    total_tokens: totalUsage.total_tokens,
    duration_ms: durationMs,
    status: 'success',
    metadata: { paw_name: paw.name, mode: paw.mode },
  });

  // 8. Update times_used
  try {
    db.prepare('UPDATE cat_paws SET times_used = times_used + 1 WHERE id = ?').run(pawId);
  } catch (err) {
    logger.error('cat-paws', 'Error updating times_used', { pawId, error: (err as Error).message });
  }

  // 9. Return CatPawOutput
  return {
    answer,
    sources: allSources.length > 0 ? allSources : undefined,
    connector_data: mergedConnectorData.length > 0 ? mergedConnectorData : undefined,
    paw_id: pawId,
    paw_name: paw.name,
    mode: paw.mode,
    tokens_used: totalUsage.total_tokens,
    input_tokens: totalUsage.prompt_tokens,
    output_tokens: totalUsage.completion_tokens,
    model_used: model,
    duration_ms: durationMs,
  };
}
