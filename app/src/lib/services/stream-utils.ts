import { logger } from '@/lib/logger';

export interface StreamOptions {
  model: string;
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
  }>;
  max_tokens?: number;
  tools?: unknown[];
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onToolCall?: (toolCall: {
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }) => void;
  onDone: (usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }) => void;
  onError: (error: Error) => void;
}

/**
 * Stream a chat completion from LiteLLM, parsing SSE chunks.
 * Does NOT use withRetry — streaming LLM calls are not retryable.
 */
export async function streamLiteLLM(
  options: StreamOptions,
  callbacks: StreamCallbacks
): Promise<void> {
  const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
  const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';

  logger.info('system', 'Starting LiteLLM stream', { model: options.model });

  try {
    const response = await fetch(`${litellmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${litellmKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
        ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LiteLLM stream error (${response.status}): ${errText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

    // Index-based tool call accumulator
    const toolCallAccumulator: Map<
      number,
      { id: string; type: string; function: { name: string; arguments: string } }
    > = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep last (possibly incomplete) line for next iteration
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          // Capture usage from final chunk
          if (parsed.usage) {
            usage = parsed.usage;
          }

          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // Handle text content
          if (delta.content) {
            callbacks.onToken(delta.content);
          }

          // Handle tool calls (index-based accumulation)
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (tc.id) {
                // New tool call
                toolCallAccumulator.set(idx, {
                  id: tc.id,
                  type: tc.type || 'function',
                  function: {
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                  },
                });
              } else {
                // Append arguments to existing tool call
                const existing = toolCallAccumulator.get(idx);
                if (existing && tc.function?.arguments) {
                  existing.function.arguments += tc.function.arguments;
                }
              }
            }
          }

          // On finish_reason === 'tool_calls', emit accumulated tool calls
          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason === 'tool_calls' && callbacks.onToolCall) {
            toolCallAccumulator.forEach((toolCall) => {
              callbacks.onToolCall!(toolCall);
            });
            toolCallAccumulator.clear();
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    callbacks.onDone(usage);
  } catch (error) {
    logger.error('system', 'LiteLLM stream error', { error: (error as Error).message });
    callbacks.onError(error as Error);
  }
}

/**
 * Standard SSE response headers.
 */
export const sseHeaders: Record<string, string> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/**
 * Create a ReadableStream that emits SSE events.
 * The handler receives send/close helpers and runs async work in a background IIFE.
 */
export function createSSEStream(
  handler: (
    send: (event: string, data: unknown) => void,
    close: () => void
  ) => void
): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      handler(send, close);
    },
    cancel() {
      // Client disconnected — nothing to clean up
    },
  });
}
