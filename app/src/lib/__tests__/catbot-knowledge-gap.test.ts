import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';

// Mock catbot-db before importing catbot-tools
vi.mock('@/lib/catbot-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/catbot-db')>();
  return {
    ...actual,
    default: { prepare: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn(), run: vi.fn() })) },
    saveKnowledgeGap: vi.fn(() => 'gap-123'),
    getKnowledgeGaps: vi.fn(() => []),
    resolveKnowledgeGap: vi.fn(),
    // Keep other mocks for catbot-tools imports
    getProfile: vi.fn(),
    upsertProfile: vi.fn(),
    getMemories: vi.fn(() => []),
    getSummaries: vi.fn(() => []),
    getLearnedEntries: vi.fn(() => []),
    incrementAccessCount: vi.fn(),
    saveLearnedEntry: vi.fn(),
    setValidated: vi.fn(),
    deleteLearnedEntry: vi.fn(),
    getAllProfiles: vi.fn(),
    countUserData: vi.fn(),
    deleteUserData: vi.fn(),
  };
});

// Mock dependencies of catbot-tools
vi.mock('@/lib/db', () => ({
  default: { prepare: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn(), run: vi.fn() })) },
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/services/catbot-holded-tools', () => ({
  getHoldedTools: vi.fn(() => []),
  isHoldedTool: vi.fn(() => false),
}));
vi.mock('@/lib/services/template-renderer', () => ({ renderTemplate: vi.fn() }));
vi.mock('@/lib/services/template-asset-resolver', () => ({ resolveAssetsForEmail: vi.fn() }));
vi.mock('@/lib/services/alias-routing', () => ({
  resolveAlias: vi.fn(),
  getAllAliases: vi.fn(() => []),
  updateAlias: vi.fn(),
}));
vi.mock('@/lib/services/discovery', () => ({ getInventory: vi.fn() }));
vi.mock('@/lib/services/mid', () => ({
  getAll: vi.fn(() => []),
  update: vi.fn(),
  midToMarkdown: vi.fn(() => ''),
}));
vi.mock('@/lib/services/health', () => ({ checkHealth: vi.fn() }));
vi.mock('@/lib/knowledge-tree', () => ({
  loadKnowledgeArea: vi.fn(),
  getAllKnowledgeAreas: vi.fn(() => []),
}));
vi.mock('@/lib/services/catbot-user-profile', () => ({ generateInitialDirectives: vi.fn(() => '') }));
vi.mock('@/lib/services/catbot-learned', () => ({
  saveLearnedEntryWithStaging: vi.fn(() => ({ id: 'x' })),
  promoteIfReady: vi.fn(() => false),
}));

import { saveKnowledgeGap, getKnowledgeGaps, resolveKnowledgeGap } from '@/lib/catbot-db';
import { getToolsForLLM, executeTool } from '../services/catbot-tools';

const mockedSaveKnowledgeGap = vi.mocked(saveKnowledgeGap);
const mockedGetKnowledgeGaps = vi.mocked(getKnowledgeGaps);
const mockedResolveKnowledgeGap = vi.mocked(resolveKnowledgeGap);

describe('Knowledge Gaps Infrastructure (KPROTO-02, KPROTO-03)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockedSaveKnowledgeGap.mockReturnValue('gap-123');
    mockedGetKnowledgeGaps.mockReturnValue([]);
  });

  // ---------------------------------------------------------------------------
  // CRUD: saveKnowledgeGap
  // ---------------------------------------------------------------------------

  describe('saveKnowledgeGap', () => {
    it('returns a string id when saving minimal gap', () => {
      const id = saveKnowledgeGap({ query: 'how to use feature X' });
      expect(typeof id).toBe('string');
      expect(id).toBe('gap-123');
    });

    it('saves all fields when provided', () => {
      saveKnowledgeGap({ query: 'q', knowledgePath: 'catbrains', context: 'user asked about RAG' });
      expect(mockedSaveKnowledgeGap).toHaveBeenCalledWith({
        query: 'q',
        knowledgePath: 'catbrains',
        context: 'user asked about RAG',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // CRUD: getKnowledgeGaps
  // ---------------------------------------------------------------------------

  describe('getKnowledgeGaps', () => {
    it('returns all gaps ordered by reported_at DESC', () => {
      const mockGaps = [
        { id: 'g2', knowledge_path: null, query: 'q2', context: null, reported_at: '2026-04-09', resolved: 0, resolved_at: null },
        { id: 'g1', knowledge_path: null, query: 'q1', context: null, reported_at: '2026-04-08', resolved: 0, resolved_at: null },
      ];
      mockedGetKnowledgeGaps.mockReturnValue(mockGaps as never);

      const gaps = getKnowledgeGaps();
      expect(gaps).toHaveLength(2);
      expect(gaps[0].id).toBe('g2');
    });

    it('filters unresolved only when resolved=false', () => {
      getKnowledgeGaps({ resolved: false });
      expect(mockedGetKnowledgeGaps).toHaveBeenCalledWith({ resolved: false });
    });

    it('filters by knowledgePath', () => {
      getKnowledgeGaps({ knowledgePath: 'catbrains' });
      expect(mockedGetKnowledgeGaps).toHaveBeenCalledWith({ knowledgePath: 'catbrains' });
    });
  });

  // ---------------------------------------------------------------------------
  // CRUD: resolveKnowledgeGap
  // ---------------------------------------------------------------------------

  describe('resolveKnowledgeGap', () => {
    it('calls resolveKnowledgeGap with id', () => {
      resolveKnowledgeGap('gap-123');
      expect(mockedResolveKnowledgeGap).toHaveBeenCalledWith('gap-123');
    });
  });

  // ---------------------------------------------------------------------------
  // Tool registration: log_knowledge_gap in TOOLS[]
  // ---------------------------------------------------------------------------

  describe('log_knowledge_gap tool registration', () => {
    it('log_knowledge_gap tool exists in TOOLS[] (via catbot-tools.ts source)', () => {
      const source = fs.readFileSync(
        path.join(process.cwd(), 'src', 'lib', 'services', 'catbot-tools.ts'),
        'utf-8',
      );
      expect(source).toContain("name: 'log_knowledge_gap'");
    });

    it('log_knowledge_gap is always_allowed (appears in getToolsForLLM with no allowedActions)', () => {
      const tools = getToolsForLLM();
      const toolNames = tools.map((t: { function: { name: string } }) => t.function.name);
      expect(toolNames).toContain('log_knowledge_gap');
    });
  });

  // ---------------------------------------------------------------------------
  // executeTool: log_knowledge_gap case
  // ---------------------------------------------------------------------------

  describe('executeTool log_knowledge_gap', () => {
    it('calls saveKnowledgeGap and returns logged result', async () => {
      const result = await executeTool(
        'log_knowledge_gap',
        { query: 'how to configure X', knowledge_path: 'settings', context: 'user asked' },
        'http://localhost:3500',
      );

      expect(mockedSaveKnowledgeGap).toHaveBeenCalledWith({
        query: 'how to configure X',
        knowledgePath: 'settings',
        context: 'user asked',
      });

      const res = result.result as Record<string, unknown>;
      expect(res.logged).toBe(true);
      expect(res.gap_id).toBe('gap-123');
    });
  });

  // ---------------------------------------------------------------------------
  // Knowledge tree sync: settings.json includes log_knowledge_gap
  // ---------------------------------------------------------------------------

  describe('knowledge-tools-sync for log_knowledge_gap', () => {
    it('settings.json tools[] includes log_knowledge_gap', () => {
      const settingsPath = path.join(process.cwd(), 'data', 'knowledge', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(settings.tools).toContain('log_knowledge_gap');
    });
  });
});
