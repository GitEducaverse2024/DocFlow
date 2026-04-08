import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock catbot-db before importing catbot-memory
vi.mock('@/lib/catbot-db', () => ({
  getMemories: vi.fn(),
  getRecipesForUser: vi.fn(),
  saveMemory: vi.fn(),
  findSimilarRecipe: vi.fn(),
  updateRecipeSuccess: vi.fn(),
}));

import {
  matchRecipe,
  autoSaveRecipe,
  updateRecipeSuccess,
  normalizeQuery,
  extractTriggerPatterns,
} from '../services/catbot-memory';
import {
  getRecipesForUser,
  saveMemory,
  findSimilarRecipe,
  updateRecipeSuccess as dbUpdateRecipeSuccess,
} from '@/lib/catbot-db';
import type { ToolResult } from '../services/catbot-user-profile';

const mockedGetRecipesForUser = vi.mocked(getRecipesForUser);
const mockedSaveMemory = vi.mocked(saveMemory);
const mockedFindSimilarRecipe = vi.mocked(findSimilarRecipe);

describe('MemoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // normalizeQuery
  // ---------------------------------------------------------------------------

  describe('normalizeQuery', () => {
    it('lowercases and splits words', () => {
      const result = normalizeQuery('Enviar Email al Cliente');
      expect(result).toContain('enviar');
      expect(result).toContain('email');
      expect(result).toContain('cliente');
    });

    it('removes punctuation', () => {
      const result = normalizeQuery('hola, mundo!');
      expect(result).toContain('hola');
      expect(result).toContain('mundo');
    });

    it('filters short words (<3 chars)', () => {
      const result = normalizeQuery('ir al bar');
      expect(result).not.toContain('ir');
      expect(result).not.toContain('al');
      expect(result).toContain('bar');
    });

    it('filters Spanish stopwords', () => {
      const result = normalizeQuery('enviar email para el cliente');
      expect(result).not.toContain('para');
      expect(result).toContain('enviar');
      expect(result).toContain('email');
      expect(result).toContain('cliente');
    });
  });

  // ---------------------------------------------------------------------------
  // matchRecipe
  // ---------------------------------------------------------------------------

  describe('matchRecipe', () => {
    it('returns recipe when 2+ keywords match trigger_patterns', () => {
      mockedGetRecipesForUser.mockReturnValue([
        {
          id: 'recipe1',
          user_id: 'user1',
          trigger_patterns: JSON.stringify(['enviar', 'email', 'cliente']),
          steps: JSON.stringify([{ tool: 'send_email', description: 'Envia email' }]),
          preferences: '{}',
          source_conversation_id: null,
          success_count: 3,
          last_used: null,
          created_at: '2026-01-01',
        },
      ]);

      const result = matchRecipe('user1', 'enviar email al cliente');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('recipe1');
    });

    it('returns null when no recipe triggers match', () => {
      mockedGetRecipesForUser.mockReturnValue([
        {
          id: 'recipe1',
          user_id: 'user1',
          trigger_patterns: JSON.stringify(['enviar', 'email', 'cliente']),
          steps: JSON.stringify([]),
          preferences: '{}',
          source_conversation_id: null,
          success_count: 1,
          last_used: null,
          created_at: '2026-01-01',
        },
      ]);

      const result = matchRecipe('user1', 'hola mundo');
      expect(result).toBeNull();
    });

    it('returns highest-scoring recipe when multiple match, prioritized by success_count', () => {
      mockedGetRecipesForUser.mockReturnValue([
        {
          id: 'recipe_low',
          user_id: 'user1',
          trigger_patterns: JSON.stringify(['enviar', 'email']),
          steps: JSON.stringify([]),
          preferences: '{}',
          source_conversation_id: null,
          success_count: 1,
          last_used: null,
          created_at: '2026-01-01',
        },
        {
          id: 'recipe_high',
          user_id: 'user1',
          trigger_patterns: JSON.stringify(['enviar', 'email', 'newsletter']),
          steps: JSON.stringify([]),
          preferences: '{}',
          source_conversation_id: null,
          success_count: 10,
          last_used: null,
          created_at: '2026-01-01',
        },
      ]);

      const result = matchRecipe('user1', 'enviar email newsletter');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('recipe_high');
    });

    it('requires minimum 2 keyword matches', () => {
      mockedGetRecipesForUser.mockReturnValue([
        {
          id: 'recipe1',
          user_id: 'user1',
          trigger_patterns: JSON.stringify(['enviar', 'email', 'cliente']),
          steps: JSON.stringify([]),
          preferences: '{}',
          source_conversation_id: null,
          success_count: 5,
          last_used: null,
          created_at: '2026-01-01',
        },
      ]);

      // Only 1 keyword matches ("enviar")
      const result = matchRecipe('user1', 'enviar documento');
      expect(result).toBeNull();
    });

    it('matches when trigger has only 1 keyword and query contains it', () => {
      mockedGetRecipesForUser.mockReturnValue([
        {
          id: 'recipe_single',
          user_id: 'user1',
          trigger_patterns: JSON.stringify(['diagnostico']),
          steps: JSON.stringify([]),
          preferences: '{}',
          source_conversation_id: null,
          success_count: 2,
          last_used: null,
          created_at: '2026-01-01',
        },
      ]);

      const result = matchRecipe('user1', 'hacer diagnostico del sistema');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('recipe_single');
    });
  });

  // ---------------------------------------------------------------------------
  // autoSaveRecipe
  // ---------------------------------------------------------------------------

  describe('autoSaveRecipe', () => {
    const successTools: ToolResult[] = [
      { name: 'list_catbrains', args: {}, result: { ok: true } },
      { name: 'send_email', args: { to: 'test@test.com' }, result: { ok: true } },
    ];

    it('saves a recipe when toolResults has 2+ entries without errors', () => {
      mockedFindSimilarRecipe.mockReturnValue(undefined);
      mockedSaveMemory.mockReturnValue('new-recipe-id');

      const result = autoSaveRecipe('user1', 'enviar email con catbrains', successTools);
      expect(result).toBe('new-recipe-id');
      expect(mockedSaveMemory).toHaveBeenCalledOnce();
    });

    it('returns null when toolResults has fewer than 2 entries', () => {
      const result = autoSaveRecipe('user1', 'listar', [
        { name: 'list_catbrains', args: {}, result: { ok: true } },
      ]);
      expect(result).toBeNull();
      expect(mockedSaveMemory).not.toHaveBeenCalled();
    });

    it('returns null when any toolResult contains "error"', () => {
      const toolsWithError: ToolResult[] = [
        { name: 'list_catbrains', args: {}, result: { error: 'something failed' } },
        { name: 'send_email', args: { to: 'test@test.com' }, result: { ok: true } },
      ];

      const result = autoSaveRecipe('user1', 'enviar email', toolsWithError);
      expect(result).toBeNull();
    });

    it('returns null when any toolResult contains "SUDO_REQUIRED"', () => {
      const toolsWithSudo: ToolResult[] = [
        { name: 'bash_execute', args: {}, result: 'SUDO_REQUIRED' },
        { name: 'send_email', args: { to: 'test@test.com' }, result: { ok: true } },
      ];

      const result = autoSaveRecipe('user1', 'ejecutar bash', toolsWithSudo);
      expect(result).toBeNull();
    });

    it('deduplicates: updates success_count instead of creating new when similar exists', () => {
      mockedFindSimilarRecipe.mockReturnValue({
        id: 'existing-recipe',
        user_id: 'user1',
        trigger_patterns: JSON.stringify(['enviar', 'email']),
        steps: JSON.stringify([]),
        preferences: '{}',
        source_conversation_id: null,
        success_count: 3,
        last_used: null,
        created_at: '2026-01-01',
      });

      const result = autoSaveRecipe('user1', 'enviar email al cliente', successTools);
      expect(result).toBe('existing-recipe');
      expect(dbUpdateRecipeSuccess).toHaveBeenCalledWith('existing-recipe');
      expect(mockedSaveMemory).not.toHaveBeenCalled();
    });

    it('extracts trigger_patterns from query words + tool names', () => {
      mockedFindSimilarRecipe.mockReturnValue(undefined);
      mockedSaveMemory.mockReturnValue('new-id');

      autoSaveRecipe('user1', 'enviar email con catbrains datos', successTools);

      const call = mockedSaveMemory.mock.calls[0][0];
      const patterns = call.triggerPatterns;
      // Should include query words + tool names
      expect(patterns).toContain('enviar');
      expect(patterns).toContain('email');
      expect(patterns).toContain('list_catbrains');
      expect(patterns).toContain('send_email');
    });
  });

  // ---------------------------------------------------------------------------
  // extractTriggerPatterns
  // ---------------------------------------------------------------------------

  describe('extractTriggerPatterns', () => {
    it('combines normalized query words (max 5) and unique tool names', () => {
      const tools: ToolResult[] = [
        { name: 'list_catbrains', args: {}, result: {} },
        { name: 'send_email', args: {}, result: {} },
        { name: 'list_catbrains', args: {}, result: {} }, // duplicate
      ];
      const patterns = extractTriggerPatterns('enviar email con datos del cliente importante', tools);
      // Max 5 query words
      expect(patterns.filter(p => !p.includes('_')).length).toBeLessThanOrEqual(5);
      // Unique tool names
      expect(patterns.filter(p => p === 'list_catbrains').length).toBe(1);
      expect(patterns).toContain('send_email');
    });
  });

  // ---------------------------------------------------------------------------
  // updateRecipeSuccess (re-export)
  // ---------------------------------------------------------------------------

  describe('updateRecipeSuccess', () => {
    it('delegates to catbot-db updateRecipeSuccess', () => {
      updateRecipeSuccess('recipe-id');
      expect(dbUpdateRecipeSuccess).toHaveBeenCalledWith('recipe-id');
    });
  });
});
