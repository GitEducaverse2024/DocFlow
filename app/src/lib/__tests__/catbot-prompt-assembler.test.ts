import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Use a temp catbot.db so the assembler (which now imports listIntentsByUser)
// never touches production data during tests. vi.hoisted runs BEFORE any
// module imports so the env var is set before catbot-db.ts initializes.
vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'prompt-assembler-test-'));
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
});

import { build, buildIntentProtocol, buildOpenIntentsContext, buildComplexTaskProtocol, buildComplexityProtocol, PromptContext } from '../services/catbot-prompt-assembler';
import { createFixtureKb } from './kb-test-utils';
import { createIntent, updateIntentStatus, catbotDb } from '@/lib/catbot-db';
import {
  getUserPatterns,
  writeUserPattern,
  getSystemSkillInstructions,
  getComplexityOutcomeStats,
} from '@/lib/services/catbot-user-profile';

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

    // -----------------------------------------------------------------------
    // Phase 160 Wave 0 — TOOL-04 modelos_protocol P1 injection
    // -----------------------------------------------------------------------

    describe('modelos_protocol section (Phase 160)', () => {
      it('modelos_protocol injected when Operador de Modelos skill has instructions', async () => {
        vi.resetModules();
        vi.doMock('@/lib/services/catbot-user-profile', async (importOriginal) => {
          const actual = await importOriginal<typeof import('@/lib/services/catbot-user-profile')>();
          return {
            ...actual,
            getSystemSkillInstructions: (name: string) =>
              name === 'Operador de Modelos'
                ? 'PROTOCOLO OPERADOR DE MODELOS stub instructions'
                : actual.getSystemSkillInstructions(name),
          };
        });
        const mod = await import('../services/catbot-prompt-assembler');
        const output = mod.build({ hasSudo: false, catbotConfig: {} });
        expect(output).toContain('## Protocolo obligatorio: Operador de Modelos');
        expect(output).toContain('PROTOCOLO OPERADOR DE MODELOS stub instructions');
      });

      it('modelos_protocol absent when skill returns null (graceful)', async () => {
        vi.resetModules();
        vi.doMock('@/lib/services/catbot-user-profile', async (importOriginal) => {
          const actual = await importOriginal<typeof import('@/lib/services/catbot-user-profile')>();
          return {
            ...actual,
            getSystemSkillInstructions: (name: string) =>
              name === 'Operador de Modelos' ? null : actual.getSystemSkillInstructions(name),
          };
        });
        const mod = await import('../services/catbot-prompt-assembler');
        const output = mod.build({ hasSudo: false, catbotConfig: {} });
        expect(output).not.toContain('## Protocolo obligatorio: Operador de Modelos');
      });
    });
  });

  describe('profile section', () => {
    it('build() with userProfile injects section with directives text', () => {
      const result = build({
        ...baseCtx,
        userProfile: {
          display_name: 'Ana',
          initial_directives: 'El usuario se llama Ana.',
          known_context: '{}',
          communication_style: null,
          preferred_format: null,
        },
      });
      expect(result).toContain('Directivas del usuario');
      expect(result).toContain('El usuario se llama Ana');
    });

    it('buildUserProfileSection with known_context JSON includes contexto', () => {
      const result = build({
        ...baseCtx,
        userProfile: {
          display_name: null,
          initial_directives: null,
          known_context: '{"uses_canvas_frequently":true,"preferred_email_connector":"gmail"}',
          communication_style: null,
          preferred_format: null,
        },
      });
      expect(result).toContain('Contexto conocido del usuario');
      expect(result).toContain('uses_canvas_frequently');
    });

    it('buildUserProfileSection caps directives at 500 chars', () => {
      const longDirectives = 'D'.repeat(600);
      const result = build({
        ...baseCtx,
        userProfile: {
          display_name: null,
          initial_directives: longDirectives,
          known_context: '{}',
          communication_style: null,
          preferred_format: null,
        },
      });
      // Should NOT contain all 600 chars
      expect(result).not.toContain('D'.repeat(501));
      // Should contain 500 chars
      expect(result).toContain('D'.repeat(500));
    });

    it('buildUserProfileSection caps known_context at 500 chars', () => {
      const longValue = 'V'.repeat(600);
      const result = build({
        ...baseCtx,
        userProfile: {
          display_name: null,
          initial_directives: null,
          known_context: JSON.stringify({ long_key: longValue }),
          communication_style: null,
          preferred_format: null,
        },
      });
      // Should NOT contain all 600 chars of value
      expect(result).not.toContain('V'.repeat(501));
    });

    it('buildUserProfileSection without userProfile returns empty (no section)', () => {
      const withProfile = build({
        ...baseCtx,
        userProfile: {
          display_name: 'Test',
          initial_directives: 'Unique marker XYZABC',
          known_context: '{}',
          communication_style: null,
          preferred_format: null,
        },
      });
      const withoutProfile = build(baseCtx);
      expect(withProfile).toContain('Unique marker XYZABC');
      expect(withoutProfile).not.toContain('Directivas del usuario');
    });

    it('includes communication_style when present', () => {
      const result = build({
        ...baseCtx,
        userProfile: {
          display_name: null,
          initial_directives: null,
          known_context: '{}',
          communication_style: 'technical',
          preferred_format: null,
        },
      });
      expect(result).toContain('Estilo de comunicacion preferido: technical');
    });
  });

  describe('recipe injection', () => {
    it('build() with matchedRecipe generates RECETA MEMORIZADA section', () => {
      const result = build({
        ...baseCtx,
        matchedRecipe: {
          trigger: ['enviar', 'email'],
          steps: [
            { tool: 'list_email_connectors', description: 'Lista conectores de email' },
            { tool: 'send_email', description: 'Envia email al destinatario' },
          ],
          preferences: {},
          recipeId: 'recipe-123',
        },
      });
      expect(result).toContain('RECETA MEMORIZADA');
      expect(result).toContain('list_email_connectors');
      expect(result).toContain('send_email');
    });

    it('build() without matchedRecipe does NOT generate recipe section', () => {
      const result = build(baseCtx);
      expect(result).not.toContain('RECETA MEMORIZADA');
    });

    it('recipe section includes recipeId for tracking', () => {
      const result = build({
        ...baseCtx,
        matchedRecipe: {
          trigger: ['test'],
          steps: [
            { tool: 'tool_a', description: 'Step A' },
            { tool: 'tool_b', description: 'Step B' },
          ],
          preferences: {},
          recipeId: 'recipe-xyz-456',
        },
      });
      expect(result).toContain('recipe-xyz-456');
    });

    it('recipe section includes numbered steps', () => {
      const result = build({
        ...baseCtx,
        matchedRecipe: {
          trigger: ['crear', 'agente'],
          steps: [
            { tool: 'list_cat_paws', description: 'Busca agentes existentes' },
            { tool: 'create_cat_paw', description: 'Crea nuevo agente' },
          ],
          preferences: {},
          recipeId: 'recipe-steps-test',
        },
      });
      expect(result).toContain('1. list_cat_paws');
      expect(result).toContain('2. create_cat_paw');
    });

    it('recipe section is capped at 500 characters', () => {
      const longSteps = Array.from({ length: 20 }, (_, i) => ({
        tool: `very_long_tool_name_${i}`,
        description: 'A'.repeat(50),
      }));
      const result = build({
        ...baseCtx,
        matchedRecipe: {
          trigger: ['test'],
          steps: longSteps,
          preferences: {},
          recipeId: 'recipe-long',
        },
      });
      // The recipe section content should exist
      expect(result).toContain('RECETA MEMORIZADA');
      // Extract recipe section to verify cap
      const recipeStart = result.indexOf('## RECETA MEMORIZADA');
      const nextSection = result.indexOf('\n## ', recipeStart + 1);
      const recipeSection = nextSection > -1
        ? result.slice(recipeStart, nextSection)
        : result.slice(recipeStart);
      expect(recipeSection.length).toBeLessThanOrEqual(520); // 500 + small margin for trailing newline
    });
  });

  describe('Knowledge Protocol (KPROTO)', () => {
    it('KPROTO-01: build() contains "Protocolo de Conocimiento"', () => {
      const result = build(baseCtx);
      expect(result).toContain('Protocolo de Conocimiento');
    });

    it('KPROTO-01: build() contains the canonical knowledge tool names (Phase 155: search_kb + get_kb_entry primary; search_documentation legacy fallback; log_knowledge_gap)', () => {
      const result = build(baseCtx);
      expect(result).toContain('search_kb');
      expect(result).toContain('get_kb_entry');
      expect(result).toContain('search_documentation');
      expect(result).toContain('log_knowledge_gap');
    });

    it('KPROTO-04: build() contains instruction to call log_knowledge_gap on 0 results', () => {
      const result = build(baseCtx);
      expect(result).toContain('log_knowledge_gap');
      expect(result).toContain('0 resultados');
    });

    it('KPROTO-05: reasoning protocol references search_kb before COMPLEJO', () => {
      const result = build(baseCtx);
      // search_kb should appear before the COMPLEJO classification gate
      const skIndex = result.indexOf('consulta search_kb');
      const complejoIndex = result.indexOf('Nivel COMPLEJO');
      expect(skIndex).toBeGreaterThan(-1);
      expect(complejoIndex).toBeGreaterThan(-1);
      expect(skIndex).toBeLessThan(complejoIndex);
    });
  });

  describe('reasoning protocol', () => {
    it('build() always injects reasoning_protocol section', () => {
      const result = build(baseCtx);
      expect(result).toContain('Protocolo de Razonamiento Adaptativo');
    });

    it('contains "Nivel SIMPLE" with detectores listar/consultar', () => {
      const result = build(baseCtx);
      expect(result).toContain('Nivel SIMPLE');
      expect(result).toContain('listar');
      expect(result).toContain('consultar');
    });

    it('contains "Nivel MEDIO" with detectores crear/modificar', () => {
      const result = build(baseCtx);
      expect(result).toContain('Nivel MEDIO');
      expect(result).toContain('crear');
      expect(result).toContain('modificar');
    });

    it('contains "Nivel COMPLEJO" with detectores disenar/arquitectura', () => {
      const result = build(baseCtx);
      expect(result).toContain('Nivel COMPLEJO');
      expect(result).toContain('pipeline');
      expect(result).toContain('arquitectura');
    });

    it('contains "Capa 0" with instruccion de skip por recipe', () => {
      const result = build(baseCtx);
      expect(result).toContain('Capa 0');
      expect(result).toContain('recipe');
    });

    it('does NOT contain instrucciones de anunciar clasificacion al usuario', () => {
      const result = build(baseCtx);
      expect(result).toContain('Nunca anuncies tu clasificacion');
    });
  });

  // -------------------------------------------------------------------------
  // Intent protocol (P1) + Open intents (P2) — Phase 129-02
  // -------------------------------------------------------------------------

  describe('buildIntentProtocol', () => {
    beforeAll(() => {
      // Ensure intents table exists (module init ran on first import above)
      catbotDb.exec('DELETE FROM intents');
    });

    it('is included as P1 section in full build()', () => {
      const result = build(baseCtx);
      expect(result).toContain('## Protocolo de Intents');
    });

    it('is under 800 characters (Libre token budget)', () => {
      expect(buildIntentProtocol().length).toBeLessThan(800);
    });

    it('mentions all 5 intent tools', () => {
      const text = buildIntentProtocol();
      expect(text).toContain('create_intent');
      expect(text).toContain('update_intent_status');
      expect(text).toContain('list_my_intents');
      expect(text).toContain('retry_intent');
      expect(text).toContain('abandon_intent');
    });

    it('contains knowledge-gap escalation rule (INTENT-05)', () => {
      expect(buildIntentProtocol()).toMatch(/log_knowledge_gap[\s\S]*update_intent_status/);
    });

    it('contains INTENT-05 escalation rule (log_knowledge_gap ANTES de update_intent_status)', () => {
      const text = buildIntentProtocol();
      // Must mention last_error as trigger and require log_knowledge_gap BEFORE update_intent_status
      expect(text).toMatch(/last_error/i);
      expect(text).toMatch(/log_knowledge_gap[\s\S]*antes[\s\S]*update_intent_status/i);
    });

    it('contains negative examples for simple queries', () => {
      expect(buildIntentProtocol()).toMatch(/NO crees intent.*(list_\*|get_\*|navegacion)/);
    });
  });

  describe('buildOpenIntentsContext', () => {
    beforeEach(() => {
      catbotDb.exec('DELETE FROM intents');
    });

    it('returns empty string when no intents for the user', () => {
      expect(buildOpenIntentsContext('test:user-empty')).toBe('');
    });

    it('returns section with intents when pending exist', () => {
      createIntent({ userId: 'test:user-a', originalRequest: 'plan something big' });
      const out = buildOpenIntentsContext('test:user-a');
      expect(out).toContain('## Intents abiertos');
      expect(out).toContain('plan something big');
    });

    it('includes in_progress intents', () => {
      const id = createIntent({ userId: 'test:user-b', originalRequest: 'running task' });
      updateIntentStatus(id, { status: 'in_progress' });
      const out = buildOpenIntentsContext('test:user-b');
      expect(out).toContain('running task');
      expect(out).toContain('in_progress');
    });

    it('does not leak across users', () => {
      createIntent({ userId: 'user-A', originalRequest: 'secret intent A' });
      const out = buildOpenIntentsContext('user-B');
      expect(out).toBe('');
    });

    it('is injected into build() when context.userId has open intents', () => {
      createIntent({ userId: 'test:ctx-user', originalRequest: 'pending via build' });
      const result = build({ ...baseCtx, userId: 'test:ctx-user' });
      expect(result).toContain('## Intents abiertos');
      expect(result).toContain('pending via build');
    });
  });

  describe('buildComplexityProtocol (Phase 131)', () => {
    it('returns a non-empty string', () => {
      const out = buildComplexityProtocol();
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(100);
    });

    it('respects the 1200 char hard budget', () => {
      expect(buildComplexityProtocol().length).toBeLessThanOrEqual(1200);
    });

    it('contains COMPLEX casuísticas markers (holded, Q1, Drive)', () => {
      const out = buildComplexityProtocol();
      expect(out).toMatch(/holded/i);
      expect(out).toMatch(/Q1/);
      expect(out).toMatch(/Drive/);
    });

    it('contains SIMPLE casuísticas markers (list_, CatBrains)', () => {
      const out = buildComplexityProtocol();
      expect(out).toMatch(/list_/);
      expect(out).toMatch(/CatBrains/);
    });

    it('declares the prefix format ([COMPLEXITY:, [REASON:, [EST:)', () => {
      const out = buildComplexityProtocol();
      expect(out).toMatch(/\[COMPLEXITY:/);
      expect(out).toMatch(/\[REASON:/);
      expect(out).toMatch(/\[EST:/);
    });

    it('declares the hard rule (NO ejecutes tools + queue_intent_job)', () => {
      const out = buildComplexityProtocol();
      expect(out).toMatch(/NO ejecutes tools/i);
      expect(out).toMatch(/queue_intent_job/);
    });

    it('is registered as P0 section in build() output (appears before intent_protocol)', () => {
      const result = build(baseCtx);
      expect(result).toMatch(/Protocolo de Evaluacion de Complejidad/i);
      const complexityIdx = result.indexOf('Protocolo de Evaluacion de Complejidad');
      const intentIdx = result.indexOf('## Protocolo de Intents');
      expect(complexityIdx).toBeGreaterThan(-1);
      expect(intentIdx).toBeGreaterThan(-1);
      expect(complexityIdx).toBeLessThan(intentIdx);
    });
  });

  describe('buildComplexTaskProtocol (Phase 130)', () => {
    it('returns a string under 800 chars', () => {
      const out = buildComplexTaskProtocol();
      expect(typeof out).toBe('string');
      expect(out.length).toBeLessThan(800);
      expect(out.length).toBeGreaterThan(100);
    });

    it('mentions all key protocol concepts', () => {
      const out = buildComplexTaskProtocol();
      expect(out).toMatch(/Protocolo de Tareas Complejas/);
      expect(out).toMatch(/queue_intent_job/);
      expect(out).toMatch(/ASYNC/);
      expect(out).toMatch(/60s/);
      expect(out).toMatch(/awaiting_approval/);
      expect(out).toMatch(/post_execution_decision/);
    });

    it('is registered as P1 section in build() output', () => {
      const result = build(baseCtx);
      expect(result).toContain('Protocolo de Tareas Complejas');
      expect(result).toContain('queue_intent_job');
    });
  });

  // -------------------------------------------------------------------------
  // Phase 137-03 LEARN-02 + LEARN-04: user_interaction_patterns injection
  // and Protocolo de creacion de CatPaw system skill injection
  // -------------------------------------------------------------------------

  describe('LEARN-04: user_interaction_patterns injection', () => {
    beforeEach(() => {
      catbotDb.exec('DELETE FROM user_interaction_patterns');
    });

    it('getUserPatterns returns rows inserted via writeUserPattern ordered by confidence DESC', () => {
      writeUserPattern({ user_id: 'u-learn4', pattern_type: 'delivery_preference', pattern_key: 'recipients', pattern_value: 'antonio+fen', confidence: 3 });
      writeUserPattern({ user_id: 'u-learn4', pattern_type: 'request_style', pattern_key: 'tone', pattern_value: 'direct', confidence: 1 });
      writeUserPattern({ user_id: 'u-learn4', pattern_type: 'frequent_task', pattern_key: 'report', pattern_value: 'Q1 holded', confidence: 5 });

      const rows = getUserPatterns('u-learn4', 10);
      expect(rows.length).toBe(3);
      expect(rows[0].confidence).toBe(5);
      expect(rows[0].pattern_value).toBe('Q1 holded');
      expect(rows[1].confidence).toBe(3);
      expect(rows[2].confidence).toBe(1);
    });

    it('getUserPatterns is scoped by user_id (no cross-user leak)', () => {
      writeUserPattern({ user_id: 'u-A', pattern_type: 'other', pattern_key: 'k', pattern_value: 'secret-A', confidence: 1 });
      writeUserPattern({ user_id: 'u-B', pattern_type: 'other', pattern_key: 'k', pattern_value: 'secret-B', confidence: 1 });

      const rowsA = getUserPatterns('u-A', 10);
      expect(rowsA.length).toBe(1);
      expect(rowsA[0].pattern_value).toBe('secret-A');

      const rowsB = getUserPatterns('u-B', 10);
      expect(rowsB.length).toBe(1);
      expect(rowsB[0].pattern_value).toBe('secret-B');
    });

    it('getUserPatterns respects limit (default 10)', () => {
      for (let i = 0; i < 15; i++) {
        writeUserPattern({
          user_id: 'u-many',
          pattern_type: 'other',
          pattern_key: `k${i}`,
          pattern_value: `v${i}`,
          confidence: i + 1,
        });
      }
      const rows = getUserPatterns('u-many', 10);
      expect(rows.length).toBe(10);
      // Highest confidence first (15)
      expect(rows[0].pattern_value).toBe('v14');
    });

    it('build() with userId that has patterns injects "Preferencias observadas del usuario" section', () => {
      writeUserPattern({ user_id: 'u-prompt', pattern_type: 'delivery_preference', pattern_key: 'recipients', pattern_value: 'antonio+fen', confidence: 3 });
      writeUserPattern({ user_id: 'u-prompt', pattern_type: 'request_style', pattern_key: 'tone', pattern_value: 'directo', confidence: 2 });
      writeUserPattern({ user_id: 'u-prompt', pattern_type: 'frequent_task', pattern_key: 'report', pattern_value: 'Q1 holded', confidence: 5 });

      const result = build({ ...baseCtx, userId: 'u-prompt' });
      expect(result).toContain('Preferencias observadas del usuario');
      expect(result).toContain('antonio+fen');
      expect(result).toContain('directo');
      expect(result).toContain('Q1 holded');
    });

    it('build() with userId that has no patterns does NOT inject patterns section', () => {
      const result = build({ ...baseCtx, userId: 'u-empty-patterns' });
      expect(result).not.toContain('Preferencias observadas del usuario');
    });

    it('build() injects at most 10 patterns (top by confidence)', () => {
      for (let i = 0; i < 15; i++) {
        writeUserPattern({
          user_id: 'u-cap',
          pattern_type: 'other',
          pattern_key: `k${i}`,
          pattern_value: `MARKER_${i}`,
          confidence: i + 1,
        });
      }
      const result = build({ ...baseCtx, userId: 'u-cap' });
      // Top 10 by confidence should be markers 5..14
      expect(result).toContain('MARKER_14');
      expect(result).toContain('MARKER_5');
      // Lowest confidence (0..4) should NOT appear
      expect(result).not.toContain('MARKER_0');
      expect(result).not.toContain('MARKER_4');
    });
  });

  describe('LEARN-02: Protocolo de creacion de CatPaw system skill injection', () => {
    it('getSystemSkillInstructions returns the seeded protocol text', () => {
      const text = getSystemSkillInstructions('Protocolo de creacion de CatPaw');
      expect(text).toBeTruthy();
      expect(text).toContain('PASO 1');
      expect(text).toContain('PASO 5');
      expect(text).toContain('create_cat_paw');
    });

    it('getSystemSkillInstructions returns null for unknown system skills', () => {
      const text = getSystemSkillInstructions('Skill que no existe xyzzy');
      expect(text).toBeNull();
    });

    it('build() always inject the protocol in the system prompt (unconditional)', () => {
      const result = build(baseCtx);
      expect(result).toContain('Protocolo obligatorio: creacion de CatPaw');
      expect(result).toContain('PASO 1');
      expect(result).toContain('PASO 5');
    });
  });

  describe('LEARN-08 oracle: getComplexityOutcomeStats', () => {
    beforeEach(() => {
      catbotDb.exec('DELETE FROM complexity_decisions');
    });

    it('returns zeroed histogram when no decisions exist', () => {
      const stats = getComplexityOutcomeStats(30);
      expect(stats.window_days).toBe(30);
      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.timeout).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.success_rate).toBe(0);
    });

    it('aggregates outcomes inside the window', () => {
      const rows: Array<[string, string | null]> = [
        ['d1', 'completed'],
        ['d2', 'completed'],
        ['d3', 'failed'],
        ['d4', 'timeout'],
        ['d5', null], // pending
      ];
      const stmt = catbotDb.prepare(
        `INSERT INTO complexity_decisions (id, user_id, classification, outcome, created_at)
         VALUES (?, 'u1', 'complex', ?, datetime('now'))`,
      );
      for (const [id, outcome] of rows) stmt.run(id, outcome);

      const stats = getComplexityOutcomeStats(30);
      expect(stats.total).toBe(5);
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.timeout).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.success_rate).toBeCloseTo(2 / 5, 5);
    });

    it('clamps window_days: <1 normalizes to 1, >365 clamps to 365', () => {
      const tooSmall = getComplexityOutcomeStats(0);
      expect(tooSmall.window_days).toBe(1);

      const negative = getComplexityOutcomeStats(-50);
      expect(negative.window_days).toBe(1);

      const tooLarge = getComplexityOutcomeStats(9999);
      expect(tooLarge.window_days).toBe(365);
    });
  });

  // Phase 155: legacy `app/data/knowledge/{catboard,catpaw}.json` were
  // deleted. Documentation of tools + CatPaw creation protocol lives in the
  // KB now (`.docflow-kb/`) and is retrievable via `search_kb` + `get_kb_entry`.

  describe('Phase 141 — Reporting & Tool-Use-First', () => {
    const baseCtx: PromptContext = {
      hasSudo: false,
      catbotConfig: {},
    };

    it('includes Protocolo de Reporting section in system prompt', () => {
      const prompt = build(baseCtx);
      expect(prompt).toContain('Protocolo de Reporting');
    });

    it('includes check mark reference for successful steps', () => {
      const prompt = build(baseCtx);
      expect(prompt).toMatch(/✓/);
    });

    it('includes Tool-Use-First rule in system prompt', () => {
      const prompt = build(baseCtx);
      expect(prompt).toContain('Tool-Use-First');
    });

    it('includes announcement pattern "Voy a consultar"', () => {
      const prompt = build(baseCtx);
      expect(prompt).toContain('Voy a consultar');
    });

    it('includes list_cat_paws as tool reference', () => {
      const prompt = build(baseCtx);
      expect(prompt).toContain('list_cat_paws');
    });
  });

  // -------------------------------------------------------------------------
  // Phase 152 — KB integration (KB-15)
  // -------------------------------------------------------------------------

  describe('PromptAssembler — Phase 152 KB integration', () => {
    let tmpRoot: string;
    const kbCtx: PromptContext = { hasSudo: false, catbotConfig: {} };

    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'assembler-kb-'));
      const { kbRoot } = createFixtureKb(tmpRoot);
      process['env']['KB_ROOT'] = kbRoot;
    });

    afterEach(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      delete process['env']['KB_ROOT'];
    });

    describe('buildKbHeader injection (KB-15)', () => {
      it('build() includes kb_header content when fixture exists', () => {
        const result = build(kbCtx);
        expect(result).toMatch(/KB Header/i);
        expect(result).toMatch(/Entradas totales/i);
      });

      it('kb_header appears BEFORE platform_overview in assembled prompt', () => {
        const result = build(kbCtx);
        const kbHeaderIdx = result.search(/KB Header/i);
        const platformIdx = result.search(/Plataforma — Areas de conocimiento/);
        expect(kbHeaderIdx).toBeGreaterThan(-1);
        // platform_overview might not appear if legacy index missing; only check ordering when both exist.
        if (platformIdx !== -1) {
          expect(kbHeaderIdx).toBeLessThan(platformIdx);
        }
      });

      it('build() works gracefully when _header.md missing', () => {
        fs.rmSync(path.join(process['env']['KB_ROOT']!, '_header.md'), { force: true });
        expect(() => build(kbCtx)).not.toThrow();
      });
    });

    describe('buildKnowledgeProtocol rewrite (KB-15 + Phase 155 cleanup)', () => {
      it('mentions search_kb before search_documentation (primary before legacy fallback)', () => {
        const result = build(kbCtx);
        const searchKbIdx = result.indexOf('search_kb');
        const searchDocsIdx = result.indexOf('search_documentation');
        expect(searchKbIdx).toBeGreaterThan(-1);
        expect(searchDocsIdx).toBeGreaterThan(-1);
        expect(searchKbIdx).toBeLessThan(searchDocsIdx);
      });

      it('labels search_documentation as LEGACY fallback in the protocol', () => {
        const result = build(kbCtx);
        const protocolSection = result.match(/Protocolo de Conocimiento[\s\S]{0,2500}/);
        expect(protocolSection).toBeTruthy();
        expect(protocolSection![0]).toMatch(/LEGACY/i);
        expect(protocolSection![0]).toMatch(/search_documentation/);
      });

      it('does not reference removed legacy tools (query_knowledge, explain_feature)', () => {
        const result = build(kbCtx);
        expect(result).not.toContain('query_knowledge');
        expect(result).not.toContain('explain_feature');
      });

      it('mentions get_kb_entry and log_knowledge_gap in protocol', () => {
        const result = build(kbCtx);
        expect(result).toContain('get_kb_entry');
        expect(result).toContain('log_knowledge_gap');
      });
    });
  });
});
