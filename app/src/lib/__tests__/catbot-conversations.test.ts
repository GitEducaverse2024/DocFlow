import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Isolated temp DB for conversation tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catbot-conv-test-'));
const tmpDbPath = path.join(tmpDir, 'catbot-conv-test.db');
process['env']['CATBOT_DB_PATH'] = tmpDbPath;

let catbotDb: InstanceType<typeof Database>;
let saveConversation: typeof import('../catbot-db').saveConversation;
let getConversation: typeof import('../catbot-db').getConversation;
let getConversations: typeof import('../catbot-db').getConversations;
let deleteConversation: typeof import('../catbot-db').deleteConversation;

beforeAll(async () => {
  const mod = await import('../catbot-db');
  catbotDb = mod.default;
  saveConversation = mod.saveConversation;
  getConversation = mod.getConversation;
  getConversations = mod.getConversations;
  deleteConversation = mod.deleteConversation;
});

afterAll(() => {
  catbotDb.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Conversation CRUD (catbot-db)', () => {
  it('POST saves conversation and returns id', () => {
    const messages = [
      { role: 'user', content: 'Hello', timestamp: Date.now() },
      { role: 'assistant', content: 'Hi there!', timestamp: Date.now() },
    ];

    const id = saveConversation({
      userId: 'web:default',
      channel: 'web',
      messages: messages as Record<string, unknown>[],
      model: 'gemini-main',
      page: '/dashboard',
    });

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('GET with id returns single conversation', () => {
    const messages = [
      { role: 'user', content: 'Test single get', timestamp: Date.now() },
    ];

    const id = saveConversation({
      userId: 'web:default',
      channel: 'web',
      messages: messages as Record<string, unknown>[],
    });

    const conv = getConversation(id);
    expect(conv).toBeDefined();
    expect(conv!.id).toBe(id);
    expect(conv!.user_id).toBe('web:default');

    const parsed = JSON.parse(conv!.messages);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].content).toBe('Test single get');
  });

  it('GET lists conversations ordered by most recent', () => {
    const convs = getConversations('web:default', 50);
    expect(Array.isArray(convs)).toBe(true);
    expect(convs.length).toBeGreaterThanOrEqual(2);
    // Most recent first
    expect(convs[0].started_at >= convs[1].started_at).toBe(true);
  });

  it('DELETE removes conversation', () => {
    const id = saveConversation({
      userId: 'web:default',
      channel: 'web',
      messages: [{ role: 'user', content: 'To delete' }] as Record<string, unknown>[],
    });

    expect(getConversation(id)).toBeDefined();

    deleteConversation(id);

    expect(getConversation(id)).toBeUndefined();
  });

  it('POST migrate imports multiple messages as single conversation', () => {
    const migratedMessages = [
      { role: 'user', content: 'Old message 1', timestamp: 1000 },
      { role: 'assistant', content: 'Old reply 1', timestamp: 1001 },
      { role: 'user', content: 'Old message 2', timestamp: 2000 },
      { role: 'assistant', content: 'Old reply 2', timestamp: 2001 },
    ];

    const id = saveConversation({
      userId: 'web:default',
      channel: 'web',
      messages: migratedMessages as Record<string, unknown>[],
    });

    expect(id).toBeDefined();

    const conv = getConversation(id);
    expect(conv).toBeDefined();

    const parsed = JSON.parse(conv!.messages);
    expect(parsed).toHaveLength(4);
    expect(parsed[0].content).toBe('Old message 1');
    expect(parsed[3].content).toBe('Old reply 2');
  });

  it('saves conversation with default userId when not provided', () => {
    const id = saveConversation({
      messages: [{ role: 'user', content: 'No user' }] as Record<string, unknown>[],
    });

    const conv = getConversation(id);
    expect(conv).toBeDefined();
    expect(conv!.user_id).toBe('web:default');
  });
});
