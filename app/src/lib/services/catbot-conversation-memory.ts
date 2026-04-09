// ---------------------------------------------------------------------------
// CatBot Conversation Memory — Windowing + LLM Compaction
// ---------------------------------------------------------------------------
// Provides intelligent conversation windowing for CatBot web chat:
// - 10 most recent messages sent in full
// - Up to 30 older messages compacted via LLM into a summary
// - Messages beyond 40 total are discarded
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = 'ollama/gemma3:12b';
const TEMPERATURE = 0.3;
const MAX_TOKENS = 512;
const MAX_INPUT_CHARS = 4000;

const COMPACTION_PROMPT = `Resume los siguientes mensajes de conversacion preservando: temas discutidos, decisiones tomadas, herramientas ejecutadas, contexto relevante. Maximo 300 palabras. Solo texto.`;

const FALLBACK_MESSAGE = '[No se pudo resumir la conversacion previa]';

// ---------------------------------------------------------------------------
// Cache — single-entry module-level cache
// ---------------------------------------------------------------------------

let compactionCache: { key: string; result: string } | null = null;

function cacheKey(messages: ChatMessage[]): string {
  return JSON.stringify(messages).length + ':' + messages.map(m => m.content.slice(0, 50)).join('|');
}

// ---------------------------------------------------------------------------
// compactMessages
// ---------------------------------------------------------------------------

export async function compactMessages(messages: ChatMessage[]): Promise<string> {
  const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';

  try {
    // Convert messages to text
    let text = messages
      .map(m => `${m.role}: ${m.content || ''}`)
      .join('\n');

    // Truncate input to cap
    if (text.length > MAX_INPUT_CHARS) {
      text = text.slice(0, MAX_INPUT_CHARS) + '...';
    }

    const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-antigravity-gateway',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: COMPACTION_PROMPT },
          { role: 'user', content: text },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }),
    });

    if (!res.ok) {
      return FALLBACK_MESSAGE;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      return FALLBACK_MESSAGE;
    }

    return content;
  } catch {
    return FALLBACK_MESSAGE;
  }
}

// ---------------------------------------------------------------------------
// buildConversationWindow
// ---------------------------------------------------------------------------

export async function buildConversationWindow(
  messages: ChatMessage[],
  opts?: { recentCount?: number; compactCount?: number },
): Promise<ChatMessage[]> {
  const recentCount = opts?.recentCount ?? 10;
  const compactCount = opts?.compactCount ?? 30;

  // If within recent window, return as-is
  if (messages.length <= recentCount) {
    return messages;
  }

  // Split: recent + older (capped at compactCount)
  const recentMsgs = messages.slice(-recentCount);
  const olderStart = Math.max(0, messages.length - recentCount - compactCount);
  const olderEnd = messages.length - recentCount;
  const olderMsgs = messages.slice(olderStart, olderEnd);

  if (olderMsgs.length === 0) {
    return recentMsgs;
  }

  // Check cache
  const key = cacheKey(olderMsgs);
  let compacted: string;

  if (compactionCache && compactionCache.key === key) {
    compacted = compactionCache.result;
  } else {
    compacted = await compactMessages(olderMsgs);
    compactionCache = { key, result: compacted };
  }

  // Build windowed result
  const contextMessage: ChatMessage = {
    role: 'system',
    content: `[Resumen de conversacion previa (${olderMsgs.length} mensajes)]: ${compacted}`,
  };

  return [contextMessage, ...recentMsgs];
}
