/**
 * Phase 152 Plan 02 — Unit tests for `search_kb` + `get_kb_entry` tools.
 *
 * Contracts covered:
 *   - TOOLS[] registration (parameters schema shape)
 *   - getToolsForLLM([]) always-allowed branch
 *   - executeTool('search_kb', ...) filter/rank/limit/summary-truncate semantics
 *   - executeTool('get_kb_entry', ...) found / NOT_FOUND / missing-id / related_resolved
 *
 * Filesystem-only (no DB). Uses `createFixtureKb(tmpDir)` from Plan 01's shared helper.
 * Does NOT hoist the catbot DB path env — search_kb/get_kb_entry are KB_ROOT-only.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { TOOLS, getToolsForLLM, executeTool } from '@/lib/services/catbot-tools';
import { invalidateKbIndex } from '@/lib/services/kb-index-cache';
import { createFixtureKb } from './kb-test-utils';

describe('search_kb + get_kb_entry tools', () => {
  let tmpRoot: string;
  let kbRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-tools-'));
    ({ kbRoot } = createFixtureKb(tmpRoot));
    process['env']['KB_ROOT'] = kbRoot;
    invalidateKbIndex();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process['env']['KB_ROOT'];
    invalidateKbIndex();
  });

  // --------------------------------------------------------------------
  // TOOLS registration contract
  // --------------------------------------------------------------------
  describe('TOOLS registration contract', () => {
    it('search_kb registered in TOOLS[]', () => {
      const tool = TOOLS.find(t => t.function.name === 'search_kb');
      expect(tool).toBeDefined();
      const props = tool!.function.parameters.properties as Record<string, unknown>;
      expect(props).toHaveProperty('type');
      expect(props).toHaveProperty('subtype');
      expect(props).toHaveProperty('tags');
      expect(props).toHaveProperty('audience');
      expect(props).toHaveProperty('status');
      expect(props).toHaveProperty('search');
      expect(props).toHaveProperty('limit');
    });

    it('search_kb description mentions KB estructurado and primary-for-resources intent', () => {
      const tool = TOOLS.find(t => t.function.name === 'search_kb');
      expect(tool).toBeDefined();
      const desc = tool!.function.description;
      expect(desc.toLowerCase()).toContain('knowledge base');
      // Explicit discovery order hint
      expect(desc.toLowerCase()).toMatch(/primero|primary/);
      // Covers recursos + rules/protocols/incidents
      expect(desc.toLowerCase()).toMatch(/catpaw|connector|skill|catbrain/);
    });

    it('get_kb_entry registered in TOOLS[] with id required', () => {
      const tool = TOOLS.find(t => t.function.name === 'get_kb_entry');
      expect(tool).toBeDefined();
      const params = tool!.function.parameters as { required?: string[] };
      expect(params.required).toContain('id');
    });

    it('search_kb + get_kb_entry always-allowed via getToolsForLLM([])', () => {
      const allowed = getToolsForLLM([]).map(t => t.function.name);
      expect(allowed).toContain('search_kb');
      expect(allowed).toContain('get_kb_entry');
    });
  });

  // --------------------------------------------------------------------
  // search_kb filters
  // --------------------------------------------------------------------
  describe('search_kb filters', () => {
    it('filters by type=resource', async () => {
      const res = await executeTool('search_kb', { type: 'resource' }, 'http://test');
      const r = res.result as { total: number; results: Array<{ type: string }> };
      expect(r.total).toBeGreaterThanOrEqual(6);
      expect(r.results.every(x => x.type === 'resource')).toBe(true);
    });

    it('filters by subtype=catpaw', async () => {
      const res = await executeTool('search_kb', { subtype: 'catpaw' }, 'http://test');
      const r = res.result as { results: Array<{ subtype: string | null }> };
      expect(r.results.length).toBeGreaterThanOrEqual(1);
      expect(r.results.every(x => x.subtype === 'catpaw')).toBe(true);
    });

    it('AND-matches tags', async () => {
      const hit = await executeTool('search_kb', { tags: ['catpaw', 'business'] }, 'http://test');
      const hitR = hit.result as { results: unknown[] };
      expect(hitR.results.length).toBe(1);

      const miss = await executeTool('search_kb', { tags: ['catpaw', 'nonexistent-tag'] }, 'http://test');
      const missR = miss.result as { results: unknown[] };
      expect(missR.results.length).toBe(0);
    });

    it('defaults to status=active', async () => {
      const res = await executeTool('search_kb', {}, 'http://test');
      const r = res.result as { results: Array<{ status: string }> };
      expect(r.results.every(x => x.status === 'active')).toBe(true);
    });

    it('filters by audience', async () => {
      const res = await executeTool('search_kb', { audience: 'architect' }, 'http://test');
      const r = res.result as { results: Array<{ audience: string[] }> };
      expect(r.results.every(x => x.audience.includes('architect'))).toBe(true);
      expect(r.results.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------
  // search_kb ranking
  // --------------------------------------------------------------------
  describe('search_kb ranking', () => {
    it('ranks title match higher than summary match', async () => {
      const res = await executeTool('search_kb', { search: 'gmail' }, 'http://test');
      const r = res.result as { total: number; results: Array<{ title: string }> };
      expect(r.total).toBeGreaterThan(0);
      // "Gmail Test" has 'gmail' in title → scored 3+ and should be first.
      expect(r.results[0].title.toLowerCase()).toContain('gmail');
    });
  });

  // --------------------------------------------------------------------
  // search_kb limits
  // --------------------------------------------------------------------
  describe('search_kb limits', () => {
    it('caps limit at 50', async () => {
      const res = await executeTool('search_kb', { limit: 999 }, 'http://test');
      const r = res.result as { results: unknown[] };
      expect(r.results.length).toBeLessThanOrEqual(50);
    });

    it('respects limit=2', async () => {
      const res = await executeTool('search_kb', { limit: 2 }, 'http://test');
      const r = res.result as { results: unknown[] };
      expect(r.results.length).toBeLessThanOrEqual(2);
    });

    it('truncates summary to 200 chars', async () => {
      const res = await executeTool('search_kb', {}, 'http://test');
      const r = res.result as { results: Array<{ summary: string }> };
      for (const item of r.results) {
        // +1 tolerance for trailing ellipsis inserted by truncate()
        expect(item.summary.length).toBeLessThanOrEqual(201);
      }
    });
  });

  // --------------------------------------------------------------------
  // get_kb_entry
  // --------------------------------------------------------------------
  describe('get_kb_entry', () => {
    it('returns entry for existing id', async () => {
      const res = await executeTool('get_kb_entry', { id: 'aaa11111-test-catpaw' }, 'http://test');
      const r = res.result as {
        id: string;
        path: string;
        frontmatter: Record<string, unknown>;
        body: string;
        related_resolved: unknown[];
      };
      expect(r.id).toBe('aaa11111-test-catpaw');
      expect(r.path).toBe('resources/catpaws/aaa11111-test-catpaw.md');
      expect(r.frontmatter).toBeDefined();
      expect(r.frontmatter.id).toBe('aaa11111-test-catpaw');
      expect(typeof r.body).toBe('string');
      expect(r.body.length).toBeGreaterThan(0);
      expect(Array.isArray(r.related_resolved)).toBe(true);
    });

    it('returns NOT_FOUND for unknown id', async () => {
      const res = await executeTool('get_kb_entry', { id: 'does-not-exist' }, 'http://test');
      const r = res.result as { error: string; id: string };
      expect(r.error).toBe('NOT_FOUND');
      expect(r.id).toBe('does-not-exist');
    });

    it('requires id param', async () => {
      const res = await executeTool('get_kb_entry', {}, 'http://test');
      const r = res.result as { error: string };
      expect(r.error).toMatch(/id es obligatorio/i);
    });

    it('empty string id returns the same obligatory error', async () => {
      const res = await executeTool('get_kb_entry', { id: '  ' }, 'http://test');
      const r = res.result as { error: string };
      expect(r.error).toMatch(/id es obligatorio/i);
    });

    it('related_resolved populated when frontmatter.related is set', async () => {
      // Fixture catpaw has related: [{type:resource, id:bbb22222-test-connector}]
      const res = await executeTool('get_kb_entry', { id: 'aaa11111-test-catpaw' }, 'http://test');
      const r = res.result as {
        related_resolved: Array<{ type: string; id: string; title: string | null; path: string | null }>;
      };
      expect(r.related_resolved.length).toBe(1);
      const rel = r.related_resolved[0];
      expect(rel.id).toBe('bbb22222-test-connector');
      expect(rel.title).toBe('Gmail Test');
      expect(rel.path).toBe('resources/connectors/bbb22222-test-connector.md');
    });
  });
});
