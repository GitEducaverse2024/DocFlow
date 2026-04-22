import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mocks (all resolved BEFORE import of route) ----

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockResolveAliasConfig = vi.fn();
vi.mock('@/lib/services/alias-routing', () => ({
  resolveAliasConfig: (...a: unknown[]) => mockResolveAliasConfig(...a),
  // shim is exported but we don't expect it to be called from this route post-migration.
  resolveAlias: vi.fn().mockResolvedValue('fallback-model'),
}));

const mockStreamLiteLLM = vi.fn();
vi.mock('@/lib/services/stream-utils', () => ({
  streamLiteLLM: (...a: unknown[]) => mockStreamLiteLLM(...a),
  sseHeaders: { 'Content-Type': 'text/event-stream' },
  createSSEStream: (handler: (s: unknown, c: unknown) => void) => {
    const send = (_event: string, _data: unknown) => { /* noop */ };
    const close = () => { /* noop */ };
    handler(send, close);
    // Return minimal ReadableStream so Response() works.
    return new ReadableStream({ start(c) { c.close(); } });
  },
}));

vi.mock('@/lib/services/catbot-tools', () => ({
  getToolsForLLM: vi.fn().mockReturnValue([]),
  executeTool: vi.fn(),
}));
vi.mock('@/lib/services/catbot-sudo-tools', () => ({
  getSudoToolsForLLM: vi.fn().mockReturnValue([]),
  executeSudoTool: vi.fn(),
  isSudoTool: vi.fn().mockReturnValue(false),
}));
vi.mock('@/lib/services/catbot-holded-tools', () => ({
  isHoldedTool: vi.fn().mockReturnValue(false),
  executeHoldedTool: vi.fn(),
}));
vi.mock('@/lib/sudo', () => ({
  validateSudoSession: vi.fn().mockReturnValue(false),
}));
vi.mock('@/lib/services/usage-tracker', () => ({
  logUsage: vi.fn(),
}));

// DB mock — catbot route reads 'catbot_config' and 'catbot_sudo' settings rows.
const mockDbGet = vi.fn().mockReturnValue(undefined);
vi.mock('@/lib/db', () => ({
  default: {
    prepare: () => ({
      get: (...a: unknown[]) => mockDbGet(...a),
      run: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    }),
  },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));

vi.mock('@/lib/services/catbot-prompt-assembler', () => ({
  build: vi.fn().mockReturnValue('system prompt'),
}));
vi.mock('@/lib/services/catbot-user-profile', () => ({
  deriveUserId: vi.fn().mockReturnValue('user-1'),
  ensureProfile: vi.fn().mockReturnValue({
    display_name: null,
    initial_directives: null,
    known_context: null,
    communication_style: null,
    preferred_format: null,
  }),
  updateProfileAfterConversation: vi.fn(),
}));
vi.mock('@/lib/services/catbot-memory', () => ({
  matchRecipe: vi.fn().mockReturnValue(null),
  autoSaveRecipe: vi.fn(),
  updateRecipeSuccess: vi.fn(),
}));
vi.mock('@/lib/services/catbot-conversation-memory', () => ({
  buildConversationWindow: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/services/catbot-complexity-parser', () => ({
  parseComplexityPrefix: vi.fn().mockReturnValue({
    classification: 'simple',
    cleanedContent: '',
    reason: null,
    estimatedDurationS: null,
  }),
}));
vi.mock('@/lib/catbot-db', () => ({
  saveComplexityDecision: vi.fn().mockReturnValue('decision-1'),
  updateComplexityOutcome: vi.fn(),
  createIntentJob: vi.fn(),
}));

// ---- Helpers ----

function makeReq(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/catbot/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function defaultCfg(overrides: Record<string, unknown> = {}) {
  return {
    model: 'anthropic/claude-opus-4-6',
    reasoning_effort: null,
    max_tokens: null,
    thinking_budget: null,
    ...overrides,
  };
}

// Capture streamLiteLLM options from the first call
function getStreamOptions(): Record<string, unknown> {
  expect(mockStreamLiteLLM).toHaveBeenCalled();
  return mockStreamLiteLLM.mock.calls[0][0] as Record<string, unknown>;
}

// ---- Tests ----

describe('POST /api/catbot/chat — resolveAliasConfig migration (PASS-04)', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAliasConfig.mockResolvedValue(defaultCfg());
    // Streaming mock: complete immediately with no tokens and no tool calls.
    mockStreamLiteLLM.mockImplementation(async (_opts: unknown, callbacks: { onDone: (u: unknown) => void }) => {
      callbacks.onDone({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
    });
    // fetch mock for non-streaming path: return minimal OpenAI-shape response.
    originalFetch = global.fetch;
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      text: async () => '',
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('PASS-04a — streaming: resolveAliasConfig values reach streamLiteLLM', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({
      reasoning_effort: 'high',
      max_tokens: 8000,
      thinking_budget: 4000,
    }));
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }], stream: true }));
    const opts = getStreamOptions();
    expect(opts.reasoning_effort).toBe('high');
    expect(opts.thinking).toEqual({ type: 'enabled', budget_tokens: 4000 });
    expect(opts.max_tokens).toBe(8000);
  });

  it('PASS-04b — streaming: reasoning_effort="off" passes through (stream-utils handles omission)', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ reasoning_effort: 'off' }));
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }], stream: true }));
    const opts = getStreamOptions();
    expect(opts.reasoning_effort).toBe('off');
  });

  it('PASS-04c — streaming: null reasoning_effort → undefined to streamLiteLLM (not null)', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ reasoning_effort: null }));
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }], stream: true }));
    const opts = getStreamOptions();
    // Either undefined key or value undefined — NOT literal null (StreamOptions type forbids null).
    expect(opts.reasoning_effort === undefined || !('reasoning_effort' in opts)).toBe(true);
    // thinking should also be undefined when thinking_budget is null.
    expect(opts.thinking === undefined || !('thinking' in opts)).toBe(true);
  });

  it('PASS-04d — non-streaming: fetch body includes reasoning_effort + thinking when present', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({
      reasoning_effort: 'high',
      max_tokens: 8000,
      thinking_budget: 4000,
    }));
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] })); // stream: false (default)
    expect(mockFetch).toHaveBeenCalled();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning_effort).toBe('high');
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 4000 });
    expect(body.max_tokens).toBe(8000);
  });

  it('PASS-04e — non-streaming: fetch body OMITS reasoning_effort when "off" (sentinel symmetry)', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ reasoning_effort: 'off' }));
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('reasoning_effort');
  });
});

describe('POST /api/catbot/chat — max_tokens resolution (PASS-03)', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAliasConfig.mockResolvedValue(defaultCfg());
    mockStreamLiteLLM.mockImplementation(async (_o: unknown, cb: { onDone: (u: unknown) => void }) =>
      cb.onDone({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 })
    );
    originalFetch = global.fetch;
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      text: async () => '',
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('PASS-03a — max_tokens from alias config propagates to both paths', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ max_tokens: 8000 }));
    const { POST } = await import('../route');
    // Streaming
    await POST(makeReq({ messages: [{ role: 'user', content: 'x' }], stream: true }));
    expect(getStreamOptions().max_tokens).toBe(8000);
    vi.clearAllMocks();
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ max_tokens: 8000 }));
    // Non-streaming
    await POST(makeReq({ messages: [{ role: 'user', content: 'x' }] }));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).max_tokens).toBe(8000);
  });

  it('PASS-03b — max_tokens falls back to 2048 when alias config is null', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ max_tokens: null }));
    const { POST } = await import('../route');
    // Streaming
    await POST(makeReq({ messages: [{ role: 'user', content: 'x' }], stream: true }));
    expect(getStreamOptions().max_tokens).toBe(2048);
    vi.clearAllMocks();
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ max_tokens: null }));
    // Non-streaming
    await POST(makeReq({ messages: [{ role: 'user', content: 'x' }] }));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).max_tokens).toBe(2048);
  });
});

describe('POST /api/catbot/chat — back-compat (model override)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ model: 'claude-opus' }));
    mockStreamLiteLLM.mockImplementation(async (_o: unknown, cb: { onDone: (u: unknown) => void }) =>
      cb.onDone({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 })
    );
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      text: async () => '',
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('BC-a — request body.model override wins over cfg.model', async () => {
    const { POST } = await import('../route');
    await POST(makeReq({
      messages: [{ role: 'user', content: 'x' }],
      stream: true,
      model: 'gpt-4o',
    }));
    expect(getStreamOptions().model).toBe('gpt-4o');
  });
});
