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
// Per-test capture of SSE events emitted by the route via `send(event, payload)`.
// Tests that don't care about SSE events can ignore this array; tests that do
// (e.g. Phase 160 sudo-gate tests) read it to assert tool_call_result shapes.
const sseEvents: Array<{ event: string; payload: unknown }> = [];
vi.mock('@/lib/services/stream-utils', () => ({
  streamLiteLLM: (...a: unknown[]) => mockStreamLiteLLM(...a),
  sseHeaders: { 'Content-Type': 'text/event-stream' },
  createSSEStream: (handler: (s: unknown, c: unknown) => void) => {
    const send = (event: string, payload: unknown) => {
      sseEvents.push({ event, payload });
    };
    const close = () => { /* noop */ };
    // handler may be async (the route wraps its body in an async IIFE) — but we
    // return the ReadableStream synchronously. Tests that need to wait for the
    // handler to complete use `await new Promise(r => setTimeout(r, 0))` after
    // POST() resolves, or rely on the internal awaits inside the handler.
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

// ---------------------------------------------------------------------------
// Phase 160 Wave 0 — TOOL-03 sudo gate for `set_catbot_llm`
// ---------------------------------------------------------------------------

describe('TOOL-03: set_catbot_llm sudo gate (Phase 160)', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sseEvents.length = 0;
    mockResolveAliasConfig.mockResolvedValue(defaultCfg());
    // Streaming mock emits a single `set_catbot_llm` tool call on iteration 0,
    // then `onDone` so the route proceeds to dispatch the tool call (which
    // Plan 160-04 will gate with a SUDO_REQUIRED branch when !sudoActive).
    mockStreamLiteLLM.mockImplementation(
      async (
        _opts: unknown,
        callbacks: {
          onToolCall?: (tc: { id: string; type: string; function: { name: string; arguments: string } }) => void;
          onDone: (u: unknown) => void;
        },
      ) => {
        callbacks.onToolCall?.({
          id: 'call_set_catbot_llm_1',
          type: 'function',
          function: {
            name: 'set_catbot_llm',
            arguments: JSON.stringify({
              model: 'anthropic/claude-opus-4-6',
              reasoning_effort: 'high',
            }),
          },
        });
        callbacks.onDone({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
      },
    );

    // Non-streaming path: LLM returns a tool_call on iteration 0, then on the
    // next iteration returns a plain assistant message to exit the loop.
    originalFetch = global.fetch;
    let fetchCall = 0;
    mockFetch = vi.fn().mockImplementation(async () => {
      fetchCall++;
      if (fetchCall === 1) {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_set_catbot_llm_1',
                      type: 'function',
                      function: {
                        name: 'set_catbot_llm',
                        arguments: JSON.stringify({
                          model: 'anthropic/claude-opus-4-6',
                          reasoning_effort: 'high',
                        }),
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          text: async () => '',
        };
      }
      // Iteration 2: plain assistant message to exit the loop.
      return {
        ok: true,
        json: async () => ({
          choices: [
            { message: { role: 'assistant', content: 'done', tool_calls: [] }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        text: async () => '',
      };
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('set_catbot_llm without sudo emits SUDO_REQUIRED (streaming path)', async () => {
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'cambia a opus' }], stream: true }));
    // Allow the async IIFE in createSSEStream to drain.
    await new Promise((r) => setTimeout(r, 10));

    const toolResultEvent = sseEvents.find(
      (e) =>
        e.event === 'tool_call_result' &&
        (e.payload as { name?: string })?.name === 'set_catbot_llm',
    );
    expect(toolResultEvent).toBeDefined();
    const result = (toolResultEvent!.payload as { result: { error?: string; message?: string } }).result;
    expect(result.error).toBe('SUDO_REQUIRED');
    expect(result.message?.toLowerCase()).toContain('sudo');
  });

  it('set_catbot_llm without sudo emits SUDO_REQUIRED (non-streaming path)', async () => {
    const { POST } = await import('../route');
    const response = await POST(makeReq({ messages: [{ role: 'user', content: 'cambia a opus' }] }));
    const body = await response.json() as {
      tool_calls: Array<{ name: string; result: { error?: string } }>;
      sudo_required: boolean;
    };
    const entry = body.tool_calls.find((tc) => tc.name === 'set_catbot_llm');
    expect(entry).toBeDefined();
    expect(entry!.result.error).toBe('SUDO_REQUIRED');
    expect(body.sudo_required).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 161 Plan 03 — VER-03: reasoning_usage silent logger
// ---------------------------------------------------------------------------
// Both the streaming and non-streaming paths must emit exactly one
// `logger.info('catbot-chat', 'reasoning_usage', {...})` call per LiteLLM
// round-trip that returns `completion_tokens_details.reasoning_tokens > 0`,
// and must be silent otherwise (non-reasoning responses produce zero noise).
// This is the evidence mechanism Plan 161-06 (oracle UAT) reads from disk.
// ---------------------------------------------------------------------------

describe('VER-03: reasoning_usage silent logger (Phase 161)', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockLogger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  // Helper: extract `reasoning_usage` calls from logger.info mock history.
  function getReasoningUsageCalls() {
    return mockLogger.info.mock.calls.filter(
      (c: unknown[]) => c[0] === 'catbot-chat' && c[1] === 'reasoning_usage',
    );
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    sseEvents.length = 0;
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({
      model: 'anthropic/claude-opus-4-6',
    }));
    // Acquire the mocked logger reference fresh each test (vi.clearAllMocks
    // resets the `.mock.calls` but the `vi.fn()` identity is stable).
    const loggerMod = await import('@/lib/logger');
    mockLogger = loggerMod.logger as unknown as typeof mockLogger;

    originalFetch = global.fetch;
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 50, total_tokens: 60 },
      }),
      text: async () => '',
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('streaming: logs reasoning_usage when reasoning_tokens > 0', async () => {
    mockStreamLiteLLM.mockImplementation(async (_opts: unknown, cb: { onDone: (u: unknown) => void }) => {
      cb.onDone({
        prompt_tokens: 10,
        completion_tokens: 50,
        total_tokens: 60,
        completion_tokens_details: { reasoning_tokens: 30 },
      });
    });
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }], stream: true }));
    await new Promise((r) => setTimeout(r, 10));

    const calls = getReasoningUsageCalls();
    expect(calls.length).toBe(1);
    const payload = calls[0][2] as Record<string, unknown>;
    expect(payload).toEqual(expect.objectContaining({
      reasoning_tokens: 30,
      alias: 'catbot',
      model: expect.any(String),
    }));
  });

  it('streaming: does NOT log reasoning_usage when reasoning_tokens absent', async () => {
    mockStreamLiteLLM.mockImplementation(async (_opts: unknown, cb: { onDone: (u: unknown) => void }) => {
      cb.onDone({
        prompt_tokens: 10,
        completion_tokens: 50,
        total_tokens: 60,
      });
    });
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }], stream: true }));
    await new Promise((r) => setTimeout(r, 10));

    expect(getReasoningUsageCalls().length).toBe(0);
  });

  it('streaming: does NOT log reasoning_usage when reasoning_tokens === 0', async () => {
    mockStreamLiteLLM.mockImplementation(async (_opts: unknown, cb: { onDone: (u: unknown) => void }) => {
      cb.onDone({
        prompt_tokens: 10,
        completion_tokens: 50,
        total_tokens: 60,
        completion_tokens_details: { reasoning_tokens: 0 },
      });
    });
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }], stream: true }));
    await new Promise((r) => setTimeout(r, 10));

    expect(getReasoningUsageCalls().length).toBe(0);
  });

  it('non-streaming: logs reasoning_usage when reasoning_tokens > 0', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi', role: 'assistant' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 20,
          total_tokens: 25,
          completion_tokens_details: { reasoning_tokens: 15 },
        },
      }),
      text: async () => '',
    });
    global.fetch = mockFetch as unknown as typeof fetch;
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }));

    const calls = getReasoningUsageCalls();
    expect(calls.length).toBe(1);
    const payload = calls[0][2] as Record<string, unknown>;
    expect(payload).toEqual(expect.objectContaining({
      reasoning_tokens: 15,
      alias: 'catbot',
      model: expect.any(String),
    }));
  });

  it('non-streaming: does NOT log reasoning_usage when reasoning_tokens absent', async () => {
    // The default beforeEach mockFetch already returns usage without
    // completion_tokens_details — just POST and assert silence.
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }));

    expect(getReasoningUsageCalls().length).toBe(0);
  });
});
