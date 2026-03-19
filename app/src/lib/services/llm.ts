import db from '@/lib/db';

interface ApiKeyRow {
  provider: string;
  api_key: string | null;
  endpoint: string | null;
  test_status: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  model: string;
  provider: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

function getProviderKey(provider: string): ApiKeyRow | null {
  return db.prepare('SELECT * FROM api_keys WHERE provider = ?').get(provider) as ApiKeyRow | null;
}

async function callOpenAI(row: ApiKeyRow, opts: ChatOptions): Promise<string> {
  const res = await fetch(`${row.endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${row.api_key}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 4000,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(row: ApiKeyRow, opts: ChatOptions): Promise<string> {
  // Separate system message from user messages
  const systemMsg = opts.messages.find(m => m.role === 'system');
  const userMsgs = opts.messages.filter(m => m.role !== 'system');

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: userMsgs,
    max_tokens: opts.max_tokens ?? 4000,
    temperature: opts.temperature ?? 0.7,
  };
  if (systemMsg) {
    body.system = systemMsg.content;
  }

  const res = await fetch(`${row.endpoint}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': row.api_key!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callGoogle(row: ApiKeyRow, opts: ChatOptions): Promise<string> {
  const contents = opts.messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemInstruction = opts.messages.find(m => m.role === 'system');

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.max_tokens ?? 4000,
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
  }

  const res = await fetch(
    `${row.endpoint}/models/${opts.model}:generateContent?key=${row.api_key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callLiteLLM(row: ApiKeyRow, opts: ChatOptions): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (row.api_key) headers['Authorization'] = `Bearer ${row.api_key}`;

  const res = await fetch(`${row.endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 4000,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LiteLLM error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callOllama(row: ApiKeyRow, opts: ChatOptions): Promise<string> {
  const res = await fetch(`${row.endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: false,
      options: {
        temperature: opts.temperature ?? 0.7,
        num_predict: opts.max_tokens ?? 4000,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.message?.content || '';
}

export async function chatCompletion(opts: ChatOptions): Promise<string> {
  const row = getProviderKey(opts.provider);
  if (!row) {
    throw new Error(`Provider "${opts.provider}" not found in api_keys`);
  }
  if (!row.endpoint) {
    throw new Error(`No endpoint configured for provider "${opts.provider}"`);
  }
  if (opts.provider !== 'ollama' && !row.api_key) {
    throw new Error(`No API key configured for provider "${opts.provider}"`);
  }

  switch (opts.provider) {
    case 'openai':
      return callOpenAI(row, opts);
    case 'anthropic':
      return callAnthropic(row, opts);
    case 'google':
      return callGoogle(row, opts);
    case 'litellm':
      return callLiteLLM(row, opts);
    case 'ollama':
      return callOllama(row, opts);
    default:
      throw new Error(`Unsupported provider: ${opts.provider}`);
  }
}

export const llm = { chatCompletion };
