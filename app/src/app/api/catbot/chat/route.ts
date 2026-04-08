import { NextResponse } from 'next/server';
import { getToolsForLLM, executeTool } from '@/lib/services/catbot-tools';
import { getSudoToolsForLLM, executeSudoTool, isSudoTool } from '@/lib/services/catbot-sudo-tools';
import { isHoldedTool, executeHoldedTool } from '@/lib/services/catbot-holded-tools';
import { validateSudoSession } from '@/lib/sudo';
import { logUsage } from '@/lib/services/usage-tracker';
import { streamLiteLLM, sseHeaders, createSSEStream } from '@/lib/services/stream-utils';
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { getTranslations } from 'next-intl/server';
import { resolveAlias } from '@/lib/services/alias-routing';
import { build as buildPrompt } from '@/lib/services/catbot-prompt-assembler';

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
    const systemPrompt = buildPrompt({
      page: context?.page,
      channel: effectiveChannel as 'web' | 'telegram' | undefined,
      hasSudo: !!sudoActive,
      catbotConfig,
    });

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
