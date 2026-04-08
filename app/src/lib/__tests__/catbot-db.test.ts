import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// We test against the actual catbot-db module but with a temp DB path
// Set CATBOT_DB_PATH to a temp file before importing
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catbot-db-test-'));
const tmpDbPath = path.join(tmpDir, 'catbot-test.db');
process['env']['CATBOT_DB_PATH'] = tmpDbPath;

// Dynamic import after setting env
let catbotDb: InstanceType<typeof Database>;
let saveConversation: typeof import('../catbot-db').saveConversation;
let getConversation: typeof import('../catbot-db').getConversation;
let getConversations: typeof import('../catbot-db').getConversations;
let deleteConversation: typeof import('../catbot-db').deleteConversation;
let upsertProfile: typeof import('../catbot-db').upsertProfile;
let getProfile: typeof import('../catbot-db').getProfile;
let saveMemory: typeof import('../catbot-db').saveMemory;
let getMemories: typeof import('../catbot-db').getMemories;
let saveSummary: typeof import('../catbot-db').saveSummary;
let getSummaries: typeof import('../catbot-db').getSummaries;
let saveLearnedEntry: typeof import('../catbot-db').saveLearnedEntry;
let getLearnedEntries: typeof import('../catbot-db').getLearnedEntries;
let getAllProfiles: typeof import('../catbot-db').getAllProfiles;
let countUserData: typeof import('../catbot-db').countUserData;
let deleteUserData: typeof import('../catbot-db').deleteUserData;

beforeAll(async () => {
  const mod = await import('../catbot-db');
  catbotDb = mod.default;
  saveConversation = mod.saveConversation;
  getConversation = mod.getConversation;
  getConversations = mod.getConversations;
  deleteConversation = mod.deleteConversation;
  upsertProfile = mod.upsertProfile;
  getProfile = mod.getProfile;
  saveMemory = mod.saveMemory;
  getMemories = mod.getMemories;
  saveSummary = mod.saveSummary;
  getSummaries = mod.getSummaries;
  saveLearnedEntry = mod.saveLearnedEntry;
  getLearnedEntries = mod.getLearnedEntries;
  getAllProfiles = mod.getAllProfiles;
  countUserData = mod.countUserData;
  deleteUserData = mod.deleteUserData;
});

afterAll(() => {
  try {
    catbotDb?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
  delete process['env']['CATBOT_DB_PATH'];
});

describe('catbot-db', () => {
  describe('creates tables', () => {
    it('should create all 5 tables on import', () => {
      const tables = catbotDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('user_profiles');
      expect(tableNames).toContain('user_memory');
      expect(tableNames).toContain('conversation_log');
      expect(tableNames).toContain('summaries');
      expect(tableNames).toContain('knowledge_learned');
    });

    it('should have correct columns for user_profiles', () => {
      const cols = catbotDb.prepare('PRAGMA table_info(user_profiles)').all() as { name: string }[];
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('display_name');
      expect(colNames).toContain('channel');
      expect(colNames).toContain('personality_notes');
      expect(colNames).toContain('communication_style');
      expect(colNames).toContain('preferred_format');
      expect(colNames).toContain('known_context');
      expect(colNames).toContain('initial_directives');
      expect(colNames).toContain('interaction_count');
      expect(colNames).toContain('last_seen');
      expect(colNames).toContain('created_at');
      expect(colNames).toContain('updated_at');
    });

    it('should have correct columns for conversation_log', () => {
      const cols = catbotDb.prepare('PRAGMA table_info(conversation_log)').all() as { name: string }[];
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('user_id');
      expect(colNames).toContain('channel');
      expect(colNames).toContain('messages');
      expect(colNames).toContain('tools_used');
      expect(colNames).toContain('token_count');
      expect(colNames).toContain('model');
      expect(colNames).toContain('page');
      expect(colNames).toContain('started_at');
      expect(colNames).toContain('ended_at');
    });

    it('should have correct columns for knowledge_learned', () => {
      const cols = catbotDb.prepare('PRAGMA table_info(knowledge_learned)').all() as { name: string }[];
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('knowledge_path');
      expect(colNames).toContain('category');
      expect(colNames).toContain('content');
      expect(colNames).toContain('learned_from');
      expect(colNames).toContain('confidence');
      expect(colNames).toContain('validated');
      expect(colNames).toContain('access_count');
      expect(colNames).toContain('created_at');
      expect(colNames).toContain('updated_at');
    });
  });

  describe('CRUD conversation_log', () => {
    let convId: string;

    it('saveConversation should insert and return id', () => {
      convId = saveConversation({
        messages: [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi!' }],
        toolsUsed: ['search_documentation'],
        tokenCount: 150,
        model: 'gpt-4o',
        page: '/catbrains',
      });
      expect(convId).toBeDefined();
      expect(typeof convId).toBe('string');
    });

    it('getConversation should retrieve by id', () => {
      const conv = getConversation(convId);
      expect(conv).toBeDefined();
      expect(conv!.id).toBe(convId);
      expect(conv!.user_id).toBe('web:default');
      expect(conv!.channel).toBe('web');
      expect(conv!.token_count).toBe(150);
      expect(conv!.model).toBe('gpt-4o');
      expect(conv!.page).toBe('/catbrains');

      const messages = JSON.parse(conv!.messages);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
    });

    it('getConversations should list conversations', () => {
      const convs = getConversations();
      expect(convs.length).toBeGreaterThanOrEqual(1);
      expect(convs[0].id).toBe(convId);
    });

    it('getConversations should filter by userId', () => {
      saveConversation({
        userId: 'telegram:12345',
        channel: 'telegram',
        messages: [{ role: 'user', content: 'Telegram msg' }],
      });

      const webConvs = getConversations('web:default');
      const teleConvs = getConversations('telegram:12345');
      expect(webConvs.length).toBeGreaterThanOrEqual(1);
      expect(teleConvs.length).toBeGreaterThanOrEqual(1);
      expect(teleConvs.every((c) => c.user_id === 'telegram:12345')).toBe(true);
    });

    it('deleteConversation should remove the record', () => {
      deleteConversation(convId);
      const conv = getConversation(convId);
      expect(conv).toBeUndefined();
    });
  });

  describe('CRUD user_profiles', () => {
    it('upsertProfile should create a new profile', () => {
      upsertProfile({
        id: 'web:default',
        displayName: 'Admin',
        channel: 'web',
        personalityNotes: 'Prefers concise responses',
      });

      const profile = getProfile('web:default');
      expect(profile).toBeDefined();
      expect(profile!.id).toBe('web:default');
      expect(profile!.display_name).toBe('Admin');
      expect(profile!.personality_notes).toBe('Prefers concise responses');
    });

    it('upsertProfile should update existing profile', () => {
      upsertProfile({
        id: 'web:default',
        displayName: 'Super Admin',
        communicationStyle: 'formal',
      });

      const profile = getProfile('web:default');
      expect(profile!.display_name).toBe('Super Admin');
      expect(profile!.communication_style).toBe('formal');
    });

    it('getProfile should return undefined for non-existent id', () => {
      const profile = getProfile('nonexistent');
      expect(profile).toBeUndefined();
    });
  });

  describe('CRUD user_memory', () => {
    it('saveMemory should insert and return id', () => {
      const memId = saveMemory({
        userId: 'web:default',
        triggerPatterns: ['deploy', 'build'],
        steps: [{ action: 'run build' }, { action: 'run deploy' }],
        preferences: { format: 'concise' },
        sourceConversationId: 'conv-123',
      });
      expect(memId).toBeDefined();
      expect(typeof memId).toBe('string');
    });

    it('getMemories should filter by user_id', () => {
      const mems = getMemories('web:default');
      expect(mems.length).toBeGreaterThanOrEqual(1);

      const mem = mems[0];
      const triggers = JSON.parse(mem.trigger_patterns);
      expect(triggers).toContain('deploy');
      expect(triggers).toContain('build');

      const steps = JSON.parse(mem.steps);
      expect(steps).toHaveLength(2);
    });

    it('getMemories should return empty for unknown user', () => {
      const mems = getMemories('unknown-user');
      expect(mems).toHaveLength(0);
    });
  });

  describe('CRUD summaries', () => {
    it('saveSummary should insert and return id', () => {
      const sumId = saveSummary({
        periodType: 'daily',
        periodStart: '2026-04-07',
        periodEnd: '2026-04-07',
        summary: 'User worked on model center UI.',
        topics: ['models', 'UI'],
        conversationCount: 5,
      });
      expect(sumId).toBeDefined();
      expect(typeof sumId).toBe('string');
    });

    it('getSummaries should filter by periodType', () => {
      saveSummary({
        periodType: 'weekly',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-07',
        summary: 'Weekly summary.',
        conversationCount: 20,
      });

      const dailySums = getSummaries(undefined, 'daily');
      const weeklySums = getSummaries(undefined, 'weekly');
      expect(dailySums.length).toBeGreaterThanOrEqual(1);
      expect(weeklySums.length).toBeGreaterThanOrEqual(1);
      expect(dailySums.every((s) => s.period_type === 'daily')).toBe(true);
      expect(weeklySums.every((s) => s.period_type === 'weekly')).toBe(true);
    });

    it('getSummaries should filter by userId', () => {
      saveSummary({
        userId: 'telegram:99',
        periodType: 'daily',
        periodStart: '2026-04-07',
        periodEnd: '2026-04-07',
        summary: 'Telegram user summary.',
      });

      const telegramSums = getSummaries('telegram:99');
      expect(telegramSums.length).toBeGreaterThanOrEqual(1);
      expect(telegramSums.every((s) => s.user_id === 'telegram:99')).toBe(true);
    });
  });

  describe('CRUD knowledge_learned', () => {
    it('saveLearnedEntry should insert and return id', () => {
      const learnedId = saveLearnedEntry({
        knowledgePath: 'catbrains',
        category: 'best_practice',
        content: 'Always process before indexing RAG.',
        learnedFrom: 'usage',
      });
      expect(learnedId).toBeDefined();
      expect(typeof learnedId).toBe('string');
    });

    it('getLearnedEntries should filter by knowledgePath', () => {
      saveLearnedEntry({
        knowledgePath: 'settings',
        category: 'pitfall',
        content: 'Check health before routing.',
      });

      const catbrainsEntries = getLearnedEntries({ knowledgePath: 'catbrains' });
      const settingsEntries = getLearnedEntries({ knowledgePath: 'settings' });
      expect(catbrainsEntries.length).toBeGreaterThanOrEqual(1);
      expect(settingsEntries.length).toBeGreaterThanOrEqual(1);
      expect(catbrainsEntries.every((e) => e.knowledge_path === 'catbrains')).toBe(true);
    });

    it('getLearnedEntries should filter by validated status', () => {
      // All entries so far are unvalidated (default 0)
      const unvalidated = getLearnedEntries({ validated: false });
      expect(unvalidated.length).toBeGreaterThanOrEqual(2);

      const validated = getLearnedEntries({ validated: true });
      expect(validated).toHaveLength(0);
    });

    it('getLearnedEntries with no filters should return all', () => {
      const all = getLearnedEntries();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Admin operations', () => {
    it('getAllProfiles returns all profiles', () => {
      const profiles = getAllProfiles();
      expect(profiles.length).toBeGreaterThanOrEqual(1);
      expect(profiles[0].id).toBe('web:default');
    });

    it('countUserData returns correct counts', () => {
      const counts = countUserData('web:default');
      expect(counts.profile).toBe(true);
      expect(counts.conversations).toBeGreaterThanOrEqual(0);
      expect(counts.recipes).toBeGreaterThanOrEqual(1);
      expect(counts.summaries).toBeGreaterThanOrEqual(0);
      expect(typeof counts.learned).toBe('number');
    });

    it('countUserData returns false profile for non-existent user', () => {
      const counts = countUserData('nonexistent-user');
      expect(counts.profile).toBe(false);
      expect(counts.conversations).toBe(0);
    });

    it('deleteUserData removes specified data types atomically', () => {
      // Create a test user with data
      upsertProfile({ id: 'delete-test-user', displayName: 'To Delete', channel: 'web' });
      saveConversation({ userId: 'delete-test-user', messages: [{ role: 'user', content: 'test' }] });
      saveMemory({ userId: 'delete-test-user', triggerPatterns: ['test'], steps: [{ action: 'test' }] });
      saveSummary({ userId: 'delete-test-user', periodType: 'daily', periodStart: '2026-04-08', periodEnd: '2026-04-08', summary: 'test' });

      // Verify data exists
      const before = countUserData('delete-test-user');
      expect(before.profile).toBe(true);
      expect(before.conversations).toBeGreaterThanOrEqual(1);
      expect(before.recipes).toBeGreaterThanOrEqual(1);
      expect(before.summaries).toBeGreaterThanOrEqual(1);

      // Delete all data types
      deleteUserData('delete-test-user', ['profile', 'conversations', 'recipes', 'summaries']);

      // Verify all deleted
      const after = countUserData('delete-test-user');
      expect(after.profile).toBe(false);
      expect(after.conversations).toBe(0);
      expect(after.recipes).toBe(0);
      expect(after.summaries).toBe(0);
    });

    it('deleteUserData only removes specified types', () => {
      // Create another test user
      upsertProfile({ id: 'partial-delete-user', displayName: 'Partial', channel: 'web' });
      saveConversation({ userId: 'partial-delete-user', messages: [{ role: 'user', content: 'keep' }] });

      // Only delete profile
      deleteUserData('partial-delete-user', ['profile']);

      const after = countUserData('partial-delete-user');
      expect(after.profile).toBe(false);
      expect(after.conversations).toBeGreaterThanOrEqual(1); // conversations kept
    });
  });
});
