/**
 * Tests for Telegram callback_query handling (Phase 130 Plan 04 Task 1/2).
 * Verifies processCallbackQuery parses `pipeline:<jobId>:<action>` and routes to
 * the correct API endpoint, calls answerCallbackQuery first, and handles errors.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock heavy deps so telegram-bot.ts imports cleanly
vi.mock('@/lib/db', () => ({
  default: { prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) })) },
}));
vi.mock('@/lib/crypto', () => ({ decrypt: vi.fn((s: string) => s) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/services/catbot-conversation-memory', () => ({
  buildConversationWindow: vi.fn(async (h: unknown) => h),
}));

import { telegramBotService } from '@/lib/services/telegram-bot';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bot = telegramBotService as any;

interface FetchCall {
  url: string;
  init?: RequestInit;
}

describe('TelegramBotService callback_query support', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let answerSpy: ReturnType<typeof vi.spyOn>;
  let sendSpy: ReturnType<typeof vi.spyOn>;
  const fetchCalls: FetchCall[] = [];

  beforeEach(() => {
    fetchCalls.length = 0;
    bot.token = 'test-token';
    fetchSpy = vi
      .spyOn(global, 'fetch')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(async (url: any, init?: any) => {
        fetchCalls.push({ url: String(url), init });
        return new Response('{}', { status: 200 });
      });
    answerSpy = vi.spyOn(bot, 'answerCallbackQuery').mockResolvedValue(undefined);
    sendSpy = vi.spyOn(bot, 'sendMessage').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeCq = (data: string | undefined) => ({
    id: 'cq-1',
    from: { id: 1, first_name: 'Test' },
    chat_instance: 'ci',
    message: {
      message_id: 1,
      chat: { id: 42, type: 'private' },
      date: Date.now(),
    },
    data,
  });

  it('routes pipeline:<job>:approve to /api/intent-jobs/<job>/approve', async () => {
    await bot.processCallbackQuery(makeCq('pipeline:job-abc:approve'));
    const approveCalls = fetchCalls.filter(c => c.url.includes('/api/intent-jobs/job-abc/approve'));
    expect(approveCalls.length).toBeGreaterThan(0);
    expect(approveCalls[0].url).not.toContain('approve-catpaws');
  });

  it('routes pipeline:<job>:reject to /api/intent-jobs/<job>/reject', async () => {
    await bot.processCallbackQuery(makeCq('pipeline:job-abc:reject'));
    expect(fetchCalls.some(c => c.url.includes('/api/intent-jobs/job-abc/reject'))).toBe(true);
  });

  it('routes pipeline:<job>:create_catpaws to /api/intent-jobs/<job>/approve-catpaws', async () => {
    await bot.processCallbackQuery(makeCq('pipeline:job-abc:create_catpaws'));
    expect(fetchCalls.some(c => c.url.includes('/api/intent-jobs/job-abc/approve-catpaws'))).toBe(true);
  });

  it('ignores non-pipeline callback data', async () => {
    await bot.processCallbackQuery(makeCq('other:foo:bar'));
    expect(fetchCalls.filter(c => c.url.includes('/api/intent-jobs/')).length).toBe(0);
  });

  it('does not crash on undefined data', async () => {
    await expect(bot.processCallbackQuery(makeCq(undefined))).resolves.not.toThrow();
    expect(fetchCalls.filter(c => c.url.includes('/api/intent-jobs/')).length).toBe(0);
  });

  it('calls answerCallbackQuery before fetch', async () => {
    await bot.processCallbackQuery(makeCq('pipeline:job-z:approve'));
    expect(answerSpy).toHaveBeenCalled();
    // answer must precede fetch (check invocation order)
    const answerOrder = answerSpy.mock.invocationCallOrder[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchOrder = (fetchSpy as any).mock.invocationCallOrder[0];
    expect(answerOrder).toBeLessThan(fetchOrder);
  });

  it('sends an error message to the chat when fetch fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    await bot.processCallbackQuery(makeCq('pipeline:job-err:approve'));
    // sendSpy should have been called at least once with the chat_id 42
    const errorCalls = sendSpy.mock.calls.filter(call =>
      typeof call[1] === 'string' && /error/i.test(call[1] as string),
    );
    expect(errorCalls.length).toBeGreaterThan(0);
  });
});
