import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Types matching route.ts ChatMessage
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

function makeExactMessages(count: number): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (let i = 0; i < count; i++) {
    msgs.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `Msg ${i + 1}` });
  }
  return msgs;
}

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock env
vi.stubEnv('LITELLM_URL', 'http://localhost:4000');

describe('catbot-conversation-memory', () => {
  let buildConversationWindow: (messages: ChatMessage[], opts?: { recentCount?: number; compactCount?: number }) => Promise<ChatMessage[]>;
  let compactMessages: (messages: ChatMessage[]) => Promise<string>;

  beforeEach(async () => {
    vi.resetModules();
    mockFetch.mockReset();
    const mod = await import('../services/catbot-conversation-memory');
    buildConversationWindow = mod.buildConversationWindow;
    compactMessages = mod.compactMessages;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Test: mensajes <= 10 se retornan sin cambio ---
  it('returns messages unchanged when <= 10', async () => {
    const msgs = makeExactMessages(8);
    const result = await buildConversationWindow(msgs);
    expect(result).toEqual(msgs);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns exactly 10 messages unchanged', async () => {
    const msgs = makeExactMessages(10);
    const result = await buildConversationWindow(msgs);
    expect(result).toEqual(msgs);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // --- Test: 15 mensajes -> 5 compactados + 10 recientes ---
  it('compacts 5 older messages and returns 10 recent for 15 messages', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Resumen de 5 mensajes anteriores' } }],
      }),
    });

    const msgs = makeExactMessages(15);
    const result = await buildConversationWindow(msgs);

    // Should be: 1 system (compacted) + 10 recent = 11
    expect(result).toHaveLength(11);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('[Resumen de conversacion previa');
    expect(result[0].content).toContain('5 mensajes');
    expect(result[0].content).toContain('Resumen de 5 mensajes anteriores');

    // Last 10 of original
    const recent10 = msgs.slice(-10);
    expect(result.slice(1)).toEqual(recent10);
  });

  // --- Test: 40 mensajes -> 30 compactados + 10 recientes ---
  it('compacts 30 older messages for 40 total messages', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Resumen de 30 mensajes' } }],
      }),
    });

    const msgs = makeExactMessages(40);
    const result = await buildConversationWindow(msgs);

    expect(result).toHaveLength(11); // 1 system + 10 recent
    expect(result[0].content).toContain('30 mensajes');
  });

  // --- Test: 50 mensajes -> solo los 40 mas recientes (30+10), >40 descartados ---
  it('discards messages beyond compactCount+recentCount (50 messages)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Resumen compactado' } }],
      }),
    });

    const msgs = makeExactMessages(50);
    const result = await buildConversationWindow(msgs);

    // Should still be 11 (1 system + 10 recent)
    expect(result).toHaveLength(11);
    expect(result[0].content).toContain('30 mensajes');

    // Recent 10 should be the last 10 of original
    expect(result.slice(1)).toEqual(msgs.slice(-10));
  });

  // --- Test: tool and assistant roles handled correctly ---
  it('handles tool and assistant messages in compaction', async () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'Haz algo' },
      { role: 'assistant', content: 'Ejecutando tool', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'list_projects', arguments: '{}' } }] },
      { role: 'tool', content: '{"projects": []}', tool_call_id: 'tc1' },
      { role: 'assistant', content: 'No hay proyectos' },
      ...makeExactMessages(10),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Usuario pidio listar proyectos, no habia ninguno' } }],
      }),
    });

    const result = await buildConversationWindow(msgs);
    expect(result).toHaveLength(11);
    expect(result[0].role).toBe('system');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // --- Test: compactMessages fallback on LLM error ---
  it('returns fallback message when LLM fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const msgs: ChatMessage[] = [
      { role: 'user', content: 'Pregunta vieja 1' },
      { role: 'assistant', content: 'Respuesta vieja 1' },
    ];

    const result = await compactMessages(msgs);
    expect(result).toBe('[No se pudo resumir la conversacion previa]');
  });

  it('returns only 10 recent when compaction fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('LLM down'));

    const msgs = makeExactMessages(15);
    const result = await buildConversationWindow(msgs);

    // Fallback: system with error + 10 recent = 11
    expect(result).toHaveLength(11);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('No se pudo resumir');
    expect(result.slice(1)).toEqual(msgs.slice(-10));
  });

  // --- Test: compactMessages produces summary string ---
  it('compactMessages produces a summary string from LLM', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'El usuario discutio sobre proyectos y modelos' } }],
      }),
    });

    const msgs: ChatMessage[] = [
      { role: 'user', content: 'Dame info de proyectos' },
      { role: 'assistant', content: 'Aqui tienes los proyectos...' },
    ];

    const result = await compactMessages(msgs);
    expect(result).toBe('El usuario discutio sobre proyectos y modelos');
  });

  // --- Test: sudo messages preserved in window ---
  it('preserves sudo messages in the conversation window', async () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: 'Hola!' },
      { role: 'user', content: 'mi_password_sudo' },
      { role: 'assistant', content: 'Sudo activado' },
      ...makeExactMessages(10),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Usuario saludo y activo sudo' } }],
      }),
    });

    const result = await buildConversationWindow(msgs);
    expect(result).toHaveLength(11);
    // Sudo messages are in the older group, should be in compacted summary
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // --- Test: result has system context + recent messages ---
  it('windowed result has system message with context + recent messages', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Contexto previo resumido aqui' } }],
      }),
    });

    const msgs = makeExactMessages(20);
    const result = await buildConversationWindow(msgs);

    // First element is system with compacted context
    expect(result[0]).toEqual({
      role: 'system',
      content: expect.stringContaining('[Resumen de conversacion previa'),
    });
    expect(result[0].content).toContain('Contexto previo resumido aqui');

    // Rest are the 10 most recent messages
    expect(result.slice(1)).toEqual(msgs.slice(-10));
  });

  // --- Test: cache avoids duplicate LLM calls ---
  it('uses cache to avoid re-compacting same older messages', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Cached summary' } }],
      }),
    });

    const msgs = makeExactMessages(15);

    // First call - should hit LLM
    await buildConversationWindow(msgs);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call with same messages - should use cache
    await buildConversationWindow(msgs);
    expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, not 2
  });

  // --- Test: LLM returns non-ok response ---
  it('handles non-ok LLM response gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await compactMessages([
      { role: 'user', content: 'test' },
    ]);
    expect(result).toBe('[No se pudo resumir la conversacion previa]');
  });
});
