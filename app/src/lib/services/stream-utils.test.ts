import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger before importing stream-utils
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { createSSEStream, sseHeaders } from './stream-utils';

/**
 * Create a mock fetch that captures the request and responds with a minimal SSE stream
 * that emits [DONE] immediately. Returns { fetchMock, getCapturedBody } for assertions.
 */
function makeFetchMockCapture() {
  let capturedInit: RequestInit | undefined;
  const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    capturedInit = init;
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });
  return {
    fetchMock,
    getCapturedBody: () => JSON.parse((capturedInit?.body as string) ?? '{}'),
  };
}

describe('sseHeaders', () => {
  it('includes required SSE headers', () => {
    expect(sseHeaders['Content-Type']).toBe('text/event-stream');
    expect(sseHeaders['Cache-Control']).toBe('no-cache, no-transform');
    expect(sseHeaders['Connection']).toBe('keep-alive');
    expect(sseHeaders['X-Accel-Buffering']).toBe('no');
  });
});

describe('createSSEStream', () => {
  it('returns a ReadableStream', () => {
    const stream = createSSEStream(() => {});
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it('sends SSE-formatted events', async () => {
    const stream = createSSEStream((send, close) => {
      send('token', { token: 'hello' });
      send('done', { finished: true });
      close();
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let output = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }

    expect(output).toContain('event: token\n');
    expect(output).toContain('data: {"token":"hello"}');
    expect(output).toContain('event: done\n');
    expect(output).toContain('data: {"finished":true}');
  });

  it('ignores sends after close (closed guard)', async () => {
    const stream = createSSEStream((send, close) => {
      send('token', { token: 'first' });
      close();
      // These should be silently ignored
      send('token', { token: 'after-close' });
      send('error', { msg: 'should not appear' });
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let output = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }

    expect(output).toContain('first');
    expect(output).not.toContain('after-close');
    expect(output).not.toContain('should not appear');
  });

  it('double close does not throw', async () => {
    const stream = createSSEStream((_send, close) => {
      close();
      close(); // should not throw
    });

    const reader = stream.getReader();
    const { done } = await reader.read();
    expect(done).toBe(true);
  });

  it('handles cancel (client disconnect) gracefully', async () => {
    const stream = createSSEStream((send) => {
      // Simulate async work — send with delay
      setTimeout(() => {
        send('token', { token: 'delayed' });
      }, 100);
    });

    const reader = stream.getReader();
    // Cancel immediately (simulate client disconnect)
    await reader.cancel();
    // Should not throw
    expect(true).toBe(true);
  });

  it('serializes complex objects in data field', async () => {
    const complexData = {
      sources: ['doc1.pdf', 'doc2.md'],
      scores: [0.95, 0.87],
      nested: { key: 'value' },
    };

    const stream = createSSEStream((send, close) => {
      send('result', complexData);
      close();
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let output = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }

    expect(output).toContain(JSON.stringify(complexData));
  });
});

describe('streamLiteLLM', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses SSE stream and calls onToken for content deltas', async () => {
    // Dynamic import to get the module after mocks are set
    const { streamLiteLLM } = await import('./stream-utils');

    const ssePayload = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(readable, { status: 200 })
    );

    const tokens: string[] = [];
    const onToken = vi.fn((t: string) => tokens.push(t));
    const onDone = vi.fn();
    const onError = vi.fn();

    await streamLiteLLM(
      { model: 'test-model', messages: [{ role: 'user', content: 'hi' }] },
      { onToken, onDone, onError }
    );

    expect(onToken).toHaveBeenCalledTimes(2);
    expect(tokens).toEqual(['Hello', ' world']);
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ total_tokens: 15 })
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError when fetch fails', async () => {
    const { streamLiteLLM } = await import('./stream-utils');

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('Network error')
    );

    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await streamLiteLLM(
      { model: 'test-model', messages: [{ role: 'user', content: 'hi' }] },
      { onToken, onDone, onError }
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Network error' })
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls onError when response is not ok', async () => {
    const { streamLiteLLM } = await import('./stream-utils');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 })
    );

    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await streamLiteLLM(
      { model: 'test-model', messages: [{ role: 'user', content: 'hi' }] },
      { onToken, onDone, onError }
    );

    expect(onError).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('accumulates and emits tool calls on finish_reason=tool_calls', async () => {
    const { streamLiteLLM } = await import('./stream-utils');

    const ssePayload = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"London\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(readable, { status: 200 })
    );

    const toolCalls: unknown[] = [];
    const onToken = vi.fn();
    const onToolCall = vi.fn((tc) => toolCalls.push(tc));
    const onDone = vi.fn();
    const onError = vi.fn();

    await streamLiteLLM(
      { model: 'test-model', messages: [{ role: 'user', content: 'weather' }] },
      { onToken, onToolCall, onDone, onError }
    );

    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(toolCalls[0]).toEqual({
      id: 'call_1',
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: '{"city":"London"}',
      },
    });
  });

  it('skips malformed JSON lines without crashing', async () => {
    const { streamLiteLLM } = await import('./stream-utils');

    const ssePayload = [
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      'data: {broken json\n\n',
      'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(readable, { status: 200 })
    );

    const tokens: string[] = [];
    const onToken = vi.fn((t: string) => tokens.push(t));
    const onDone = vi.fn();
    const onError = vi.fn();

    await streamLiteLLM(
      { model: 'test-model', messages: [{ role: 'user', content: 'hi' }] },
      { onToken, onDone, onError }
    );

    expect(tokens).toEqual(['ok', '!']);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('streamLiteLLM body passthrough (Phase 159)', () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let getCapturedBody: () => Record<string, unknown>;

  beforeEach(() => {
    const { fetchMock, getCapturedBody: gb } = makeFetchMockCapture();
    mockFetch = fetchMock;
    getCapturedBody = gb;
    global.fetch = mockFetch as unknown as typeof fetch;
    // Isolate env so LITELLM_URL / LITELLM_API_KEY are deterministic.
    process.env['LITELLM_URL'] = 'http://mock-litellm:4000';
    process.env['LITELLM_API_KEY'] = 'sk-test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const callbacks = {
    onToken: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };

  it('PASS-01a — reasoning_effort:"medium" appears in request body JSON', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      {
        model: 'claude-opus',
        messages: [{ role: 'user', content: 'hi' }],
        reasoning_effort: 'medium',
      },
      callbacks
    );
    const body = getCapturedBody();
    expect(body.reasoning_effort).toBe('medium');
  });

  it('PASS-01b — reasoning_effort:"off" is OMITTED from request body (sentinel)', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      {
        model: 'claude-opus',
        messages: [{ role: 'user', content: 'hi' }],
        reasoning_effort: 'off',
      },
      callbacks
    );
    const body = getCapturedBody();
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('PASS-01c — reasoning_effort undefined omits the field (back-compat)', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      { model: 'claude-opus', messages: [{ role: 'user', content: 'hi' }] },
      callbacks
    );
    const body = getCapturedBody();
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('PASS-01d — reasoning_effort values "low" and "high" appear in body', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      {
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        reasoning_effort: 'low',
      },
      callbacks
    );
    expect(getCapturedBody().reasoning_effort).toBe('low');

    // Reset capture for the second assertion
    const { fetchMock, getCapturedBody: gb2 } = makeFetchMockCapture();
    global.fetch = fetchMock as unknown as typeof fetch;
    await streamLiteLLM(
      {
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        reasoning_effort: 'high',
      },
      callbacks
    );
    expect(gb2().reasoning_effort).toBe('high');
  });

  it('PASS-02a — thinking:{type:"enabled", budget_tokens:10000} appears verbatim in body', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      {
        model: 'claude-opus',
        messages: [{ role: 'user', content: 'hi' }],
        thinking: { type: 'enabled', budget_tokens: 10000 },
      },
      callbacks
    );
    const body = getCapturedBody();
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 10000 });
  });

  it('PASS-02b — thinking undefined omits the field', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      { model: 'claude-opus', messages: [{ role: 'user', content: 'hi' }] },
      callbacks
    );
    expect(getCapturedBody()).not.toHaveProperty('thinking');
  });

  it('PASS-regression — back-compat: body without reasoning fields matches legacy shape', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      { model: 'claude-opus', messages: [{ role: 'user', content: 'hi' }] },
      callbacks
    );
    const body = getCapturedBody();
    expect(body.model).toBe('claude-opus');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('thinking');
    // max_tokens and tools only present when explicitly set (unchanged behavior).
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('tools');
  });

  it('PASS-combined — reasoning_effort + thinking + max_tokens + tools all coexist', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      {
        model: 'claude-opus',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 2048,
        tools: [{ type: 'function', function: { name: 'x' } }],
        reasoning_effort: 'high',
        thinking: { type: 'enabled', budget_tokens: 5000 },
      },
      callbacks
    );
    const body = getCapturedBody();
    expect(body.reasoning_effort).toBe('high');
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 5000 });
    expect(body.max_tokens).toBe(2048);
    expect(Array.isArray(body.tools)).toBe(true);
  });
});
