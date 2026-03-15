import { describe, it, expect, vi, beforeEach } from 'vitest';

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
