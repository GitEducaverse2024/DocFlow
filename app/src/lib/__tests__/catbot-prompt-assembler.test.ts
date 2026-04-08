import { describe, it, expect } from 'vitest';
import { build, PromptContext } from '../services/catbot-prompt-assembler';

describe('PromptAssembler', () => {
  const baseCtx: PromptContext = {
    hasSudo: false,
    catbotConfig: {},
  };

  describe('build()', () => {
    it('returns non-empty string with CatBot identity', () => {
      const result = build(baseCtx);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
    });

    it('includes identity section with CatBot and DoCatFlow', () => {
      const result = build(baseCtx);
      expect(result).toContain('CatBot');
      expect(result).toContain('DoCatFlow');
    });

    it('includes page-specific knowledge for /catflow', () => {
      const result = build({ ...baseCtx, page: '/catflow' });
      expect(result).toContain('CatFlow');
      expect(result).toContain('pipeline');
    });

    it('includes page-specific knowledge for /settings', () => {
      const result = build({ ...baseCtx, page: '/settings' });
      expect(result).toContain('Centro de Modelos');
    });

    it('does NOT include other areas when page is set', () => {
      const resultCatflow = build({ ...baseCtx, page: '/catflow' });
      // CatBrains-exclusive concepts should NOT appear in catflow page prompt
      // "RAG" is a catbrains concept not in catflow
      expect(resultCatflow).not.toContain('Retrieval-Augmented Generation');
    });

    it('budget truncation removes P3 sections first', () => {
      // With page context adding P1 knowledge, libre budget may force truncation
      // of P3 sections while keeping P0 (identity)
      const libreCtx: PromptContext = { ...baseCtx, page: '/catflow', catbotConfig: { model: 'gemma3:4b' } };
      const eliteCtx: PromptContext = { ...baseCtx, page: '/catflow', catbotConfig: { model: 'claude-opus-4-20250514' } };

      const libreResult = build(libreCtx);
      const eliteResult = build(eliteCtx);

      // P0 (identity) always present in both
      expect(libreResult).toContain('CatBot');
      expect(eliteResult).toContain('CatBot');

      // Elite budget (64K) should include troubleshooting (P3)
      expect(eliteResult).toContain('troubleshooting');

      // Elite should be >= libre in length (more budget = more sections)
      expect(eliteResult.length).toBeGreaterThanOrEqual(libreResult.length);
    });

    it('P0 sections are never truncated even over budget', () => {
      // Even with a very small model name that maps to libre, P0 should be present
      const result = build({ ...baseCtx, catbotConfig: { model: 'qwen2:0.5b' } });
      expect(result).toContain('CatBot');
      expect(result).toContain('DoCatFlow');
      // Tool instructions are P0
      expect(result).toContain('tools');
    });

    it('different model tiers get different budgets', () => {
      const libreResult = build({ ...baseCtx, catbotConfig: { model: 'gemma3:4b' } });
      const proResult = build({ ...baseCtx, catbotConfig: { model: 'claude-sonnet-4-20250514' } });
      const eliteResult = build({ ...baseCtx, catbotConfig: { model: 'claude-opus-4-20250514' } });

      // Elite >= Pro >= Libre in length (more budget = more sections included)
      expect(eliteResult.length).toBeGreaterThanOrEqual(proResult.length);
      expect(proResult.length).toBeGreaterThanOrEqual(libreResult.length);
    });

    it('instructions_primary injected as P0 section', () => {
      const result = build({
        ...baseCtx,
        catbotConfig: { instructions_primary: 'Responde siempre en ingles' },
      });
      expect(result).toContain('Responde siempre en ingles');
    });

    it('instructions_secondary injected as P2 section', () => {
      const result = build({
        ...baseCtx,
        catbotConfig: { instructions_secondary: 'Contexto: somos una empresa de marketing' },
      });
      expect(result).toContain('Contexto: somos una empresa de marketing');
    });

    it('personality_custom injected in prompt', () => {
      const result = build({
        ...baseCtx,
        catbotConfig: { personality_custom: 'usa analogias de cocina' },
      });
      expect(result).toContain('usa analogias de cocina');
    });

    it('instructions_primary is P0 (not truncated by budget)', () => {
      const primaryText = 'INSTRUCCION_PRIMARIA_PRESENTE_' + 'X'.repeat(200);
      const result = build({
        ...baseCtx,
        catbotConfig: {
          model: 'gemma3:4b', // libre tier (smallest budget)
          instructions_primary: primaryText,
        },
      });
      // P0 sections are never truncated by budget
      expect(result).toContain(primaryText);
    });

    it('instructions_primary truncated at 2500 chars', () => {
      const longText = 'A'.repeat(3000);
      const result = build({
        ...baseCtx,
        catbotConfig: { instructions_primary: longText },
      });
      // Should contain the first 2500 chars
      expect(result).toContain('A'.repeat(2500));
      // Should have truncation indicator
      expect(result).toContain('...');
      // Should NOT contain the full 3000 chars
      expect(result).not.toContain('A'.repeat(2501));
    });
  });
});
