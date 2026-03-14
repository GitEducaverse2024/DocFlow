// Service detection from URL patterns
const SERVICE_PATTERNS: Array<{ pattern: RegExp; service: string }> = [
  { pattern: /qdrant|:6333/, service: 'Qdrant (base vectorial)' },
  { pattern: /litellm|:4000/, service: 'LiteLLM Gateway' },
  { pattern: /ollama|:11434/, service: 'Ollama (embeddings)' },
  { pattern: /n8n|:5678/, service: 'n8n' },
  { pattern: /openclaw|:18789/, service: 'OpenClaw' },
  { pattern: /\/api\/tasks|\/api\/catbrains|\/api\/agents|\/api\/canvas/, service: 'DoCatFlow API' },
];

export interface CatBotError {
  message: string;
  endpoint: string;
  statusCode: number;
  page: string;
  timestamp: number;
  source: 'fetch' | 'js';
  service?: string;
}

export function detectService(url: string): string | undefined {
  for (const { pattern, service } of SERVICE_PATTERNS) {
    if (pattern.test(url)) return service;
  }
  return undefined;
}

export function formatErrorForCatBot(error: CatBotError): string {
  const parts = [
    `\u{1F534} Error detectado en ${error.page}`,
    `Endpoint: ${error.endpoint}`,
    `Status: ${error.statusCode}`,
  ];
  if (error.service) {
    parts.push(`Servicio: ${error.service}`);
  }
  parts.push(`Mensaje: ${error.message}`);
  parts.push('Puedes diagnosticar que esta fallando?');
  return parts.join('\n');
}

const ERROR_HISTORY_KEY = 'catbot_error_history';
const MAX_HISTORY = 10;

export function pushErrorToHistory(error: CatBotError): void {
  // Save to localStorage
  try {
    const stored = localStorage.getItem(ERROR_HISTORY_KEY);
    const history: CatBotError[] = stored ? JSON.parse(stored) : [];
    history.push(error);
    if (history.length > MAX_HISTORY) history.shift();
    localStorage.setItem(ERROR_HISTORY_KEY, JSON.stringify(history));
  } catch { /* ignore */ }

  // Also persist to backend (fire-and-forget, use XMLHttpRequest to avoid fetch interceptor loop)
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/catbot/error-history', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(error));
  } catch { /* ignore */ }
}

export function getErrorHistory(): CatBotError[] {
  try {
    const stored = localStorage.getItem(ERROR_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}
