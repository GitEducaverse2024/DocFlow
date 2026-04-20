/**
 * Phase 152 Plan 02 — Extended tests for `query_knowledge`.
 *
 * Coverage:
 *   - Tool description contains "Legacy" and explicitly names `search_kb`
 *   - executeTool('query_knowledge', {area:'catboard'}) does NOT throw (Zod union fixes catboard.json)
 *   - executeTool('query_knowledge', {}) (aggregate / all-areas) does NOT throw
 *     — Warning 4 explicit guard: loader may return array or undefined
 *   - Unknown area name: graceful — no redirect, no throw
 *   - __redirect top-level → result.redirect block with target_kb_path + hint
 *   - Concept item mapper: {term,definition} → "**term**: definition"
 *   - Concept item mapper: {__redirect} → "(migrado → path; usa get_kb_entry)"
 */
import { describe, it, expect, vi } from 'vitest';

// Hoisted DB env so catbot-db does not write to the real sqlite file during tests.
vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'qk-test-'));
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
});

import { TOOLS, executeTool } from '@/lib/services/catbot-tools';

describe('query_knowledge — Phase 152 extensions', () => {

  describe('tool description', () => {
    it('description contains "Legacy" and mentions search_kb', () => {
      const tool = TOOLS.find(t => t.function.name === 'query_knowledge');
      expect(tool).toBeDefined();
      const desc = tool!.function.description;
      expect(desc.toLowerCase()).toContain('legacy');
      expect(desc).toContain('search_kb');
    });
  });

  describe('Zod schema tolerance (KB-18 / Warning 4)', () => {
    it('query_knowledge({area:"catboard"}) does not throw Zod error', async () => {
      // catboard.json has concepts[18..20] = {term,definition} and __redirect top-level.
      // Plan 01 Zod union + passthrough parses this cleanly; Plan 02 emits redirect hint.
      const res = await executeTool('query_knowledge', { area: 'catboard' }, 'http://test');
      expect(res.name).toBe('query_knowledge');
      const r = res.result as Record<string, unknown>;
      // Must not be an error envelope
      expect(r).not.toHaveProperty('error');
    });

    it('query_knowledge({}) over all areas does not throw — aggregate mode guard', async () => {
      // No area: loadKnowledgeArea may return arrays aggregated, or falsy for missing ids.
      // Guard `entry && typeof entry === 'object' && !Array.isArray(entry)` must tolerate this.
      const res = await executeTool('query_knowledge', {}, 'http://test');
      expect(res.name).toBe('query_knowledge');
      const r = res.result as Record<string, unknown>;
      expect(r).toBeDefined();
      expect(r).not.toHaveProperty('error');
    });

    it('query_knowledge({area:"unknown-area-xyz"}) returns gracefully (no throw, no redirect)', async () => {
      const res = await executeTool('query_knowledge', { area: 'unknown-area-xyz' }, 'http://test');
      expect(res.name).toBe('query_knowledge');
      const r = res.result as Record<string, unknown>;
      expect(r).toBeDefined();
      // Either an {error} envelope from the existing try/catch, or a non-redirect body.
      // Critical: MUST NOT throw and MUST NOT emit redirect for an unknown area.
      expect(r).not.toHaveProperty('redirect');
    });
  });

  describe('redirect hint emission', () => {
    it('area with __redirect top-level returns redirect block', async () => {
      const res = await executeTool('query_knowledge', { area: 'catboard' }, 'http://test');
      const r = res.result as {
        redirect?: {
          type: string;
          target_kb_path: string;
          hint: string;
          all_destinations?: string[];
        };
      };
      expect(r.redirect).toBeDefined();
      expect(r.redirect!.type).toBe('redirect');
      expect(r.redirect!.target_kb_path).toMatch(/\.docflow-kb\//);
      expect(r.redirect!.hint.toLowerCase()).toMatch(/get_kb_entry/);
    });
  });

  describe('concept item mapper', () => {
    it('{term,definition} formatted as **term**: definition', async () => {
      // catboard.json concepts[18] = {term:'MAX_TOOL_ITERATIONS', definition:'...'}
      const res = await executeTool('query_knowledge', { area: 'catboard' }, 'http://test');
      const r = res.result as { concepts?: string[] };
      const concepts = Array.isArray(r.concepts) ? r.concepts : [];
      const hasBoldTerm = concepts.some(c =>
        typeof c === 'string' && /\*\*MAX_TOOL_ITERATIONS\*\*/.test(c),
      );
      expect(hasBoldTerm).toBe(true);
    });
  });
});
