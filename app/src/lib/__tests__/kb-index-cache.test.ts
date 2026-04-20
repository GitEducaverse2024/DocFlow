import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Phase 152-01 Task 2: kb-index-cache unit tests.
//
// Behavior under test:
//   - getKbIndex(): cached read of .docflow-kb/_index.json, TTL 60s.
//     Returns null on missing file.
//   - invalidateKbIndex(): forces next call to re-read.
//   - resolveKbEntry(dbTable, dbId): builds byTableId map from frontmatter of
//     resource .md files (source_of_truth not in _index.json entries — CONFLICT #1).
//   - parseKbFile(relPath): returns {frontmatter, body} or null.
//   - searchKb(params): filters/ranks against _index.json entries.
//   - getKbEntry(id): returns {id, path, frontmatter, body, related_resolved} or null.
//
// Fixture created in a per-test-suite tmp directory via createFixtureKb;
// KB_ROOT env var hoisted BEFORE module import so the cache module picks up
// the tmp path at first load.
// ---------------------------------------------------------------------------

// Hoisted tmp dir + KB_ROOT — runs BEFORE any import below.
const { TEST_TMP_DIR } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'kb-cache-test-'));
  process['env']['KB_ROOT'] = nodePath.join(tmpDir, '.docflow-kb');
  return { TEST_TMP_DIR: tmpDir };
});

import { createFixtureKb } from './kb-test-utils';
import {
  getKbIndex,
  invalidateKbIndex,
  resolveKbEntry,
  searchKb,
  getKbEntry,
  parseKbFile,
} from '../services/kb-index-cache';

describe('kb-index-cache', () => {
  beforeAll(() => {
    createFixtureKb(TEST_TMP_DIR);
  });

  afterAll(() => {
    fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    invalidateKbIndex();
  });

  describe('getKbIndex', () => {
    it('returns parsed KbIndex when _index.json exists', () => {
      const idx = getKbIndex();
      expect(idx).not.toBeNull();
      expect(idx!.entry_count).toBe(7);
      expect(idx!.entries).toHaveLength(7);
    });

    it('caches within TTL (1 readFileSync per 60s window)', () => {
      const spy = vi.spyOn(fs, 'readFileSync');
      const before = spy.mock.calls.filter(c => String(c[0]).endsWith('_index.json')).length;
      getKbIndex();
      getKbIndex();
      getKbIndex();
      const after = spy.mock.calls.filter(c => String(c[0]).endsWith('_index.json')).length;
      expect(after - before).toBe(1);
      spy.mockRestore();
    });

    it('invalidateKbIndex forces re-read on next call', () => {
      getKbIndex(); // warm
      const spy = vi.spyOn(fs, 'readFileSync');
      const before = spy.mock.calls.filter(c => String(c[0]).endsWith('_index.json')).length;
      invalidateKbIndex();
      getKbIndex();
      const after = spy.mock.calls.filter(c => String(c[0]).endsWith('_index.json')).length;
      expect(after - before).toBe(1);
      spy.mockRestore();
    });

    it('returns null when _index.json is missing', () => {
      const missingTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-missing-'));
      const originalRoot = process['env']['KB_ROOT'];
      process['env']['KB_ROOT'] = path.join(missingTmp, '.docflow-kb');
      invalidateKbIndex();
      try {
        const idx = getKbIndex();
        expect(idx).toBeNull();
      } finally {
        process['env']['KB_ROOT'] = originalRoot;
        invalidateKbIndex();
        fs.rmSync(missingTmp, { recursive: true, force: true });
      }
    });
  });

  describe('resolveKbEntry', () => {
    it('returns path for existing (table, id)', () => {
      const p = resolveKbEntry('cat_paws', 'aaa11111-1111-1111-1111-111111111111');
      expect(p).toBe('resources/catpaws/aaa11111-test-catpaw.md');
    });

    it('returns path for each fixture resource table', () => {
      expect(resolveKbEntry('connectors', 'bbb22222-2222-2222-2222-222222222222'))
        .toBe('resources/connectors/bbb22222-test-connector.md');
      expect(resolveKbEntry('skills', 'writer-skill'))
        .toBe('resources/skills/test-skill-writer.md');
      expect(resolveKbEntry('catbrains', 'ccc33333-3333-3333-3333-333333333333'))
        .toBe('resources/catbrains/ccc33333-test-catbrain.md');
      expect(resolveKbEntry('email_templates', 'tpl-welcome'))
        .toBe('resources/email-templates/tpl-test-welcome.md');
      expect(resolveKbEntry('canvases', 'ddd44444-4444-4444-4444-444444444444'))
        .toBe('resources/canvases/ddd44444-test-canvas.md');
    });

    it('returns null for unknown (table, id)', () => {
      expect(resolveKbEntry('cat_paws', 'bogus-id')).toBeNull();
      expect(resolveKbEntry('nonexistent_table', 'aaa11111-1111-1111-1111-111111111111')).toBeNull();
    });
  });

  describe('parseKbFile', () => {
    it('returns frontmatter and body for a valid resource file', () => {
      const parsed = parseKbFile('resources/catpaws/aaa11111-test-catpaw.md');
      expect(parsed).not.toBeNull();
      expect(parsed!.frontmatter.id).toBe('aaa11111-test-catpaw');
      expect(parsed!.frontmatter.type).toBe('resource');
      expect(Array.isArray(parsed!.frontmatter.source_of_truth)).toBe(true);
      const sot = parsed!.frontmatter.source_of_truth as Array<{ table: string; id: string }>;
      expect(sot[0].table).toBe('cat_paws');
      expect(parsed!.body).toContain('## Descripción');
    });

    it('returns null on missing file', () => {
      expect(parseKbFile('resources/catpaws/does-not-exist.md')).toBeNull();
    });
  });

  describe('searchKb', () => {
    it('filters by type=resource (returns all 6 resources)', () => {
      const r = searchKb({ type: 'resource' });
      expect(r.total).toBe(6);
      expect(r.results).toHaveLength(6);
      for (const e of r.results) expect(e.type).toBe('resource');
    });

    it('filters by subtype=catpaw (exactly 1 in fixture)', () => {
      const r = searchKb({ subtype: 'catpaw' });
      expect(r.total).toBe(1);
      expect(r.results[0].subtype).toBe('catpaw');
    });

    it('AND-matches tags (catpaw+business → 1, catpaw+nonexistent → 0)', () => {
      expect(searchKb({ tags: ['catpaw', 'business'] }).total).toBe(1);
      expect(searchKb({ tags: ['catpaw', 'nonexistent'] }).total).toBe(0);
    });

    it('ranks by field weights (title > summary > tag)', () => {
      const r = searchKb({ search: 'gmail' });
      expect(r.total).toBeGreaterThanOrEqual(1);
      // Gmail Test has "gmail" in title (×3) + tags (×1) + summary (×2)
      expect(r.results[0].id).toBe('bbb22222-test-connector');
    });

    it('defaults limit to 10 and caps at 50', () => {
      const r = searchKb({ limit: 999 });
      expect(r.results.length).toBeLessThanOrEqual(50);
      // fixture has only 7 entries, so either way the cap won't hit; verify
      // the function doesn't blow up with an absurd limit.
      expect(r.total).toBe(7); // all active
    });

    it('defaults to status=active when not specified', () => {
      const r = searchKb({});
      // All fixture entries are active, so total = 7.
      expect(r.total).toBe(7);
      for (const e of r.results) expect(e.status).toBe('active');
    });

    it('truncates summary to 200 chars', () => {
      const r = searchKb({ type: 'resource', limit: 50 });
      for (const e of r.results) {
        expect(e.summary.length).toBeLessThanOrEqual(200);
      }
    });

    it('sorts by updated DESC when no search param', () => {
      const r = searchKb({ type: 'resource', limit: 50 });
      const updates = r.results.map(e => e.updated);
      const sorted = [...updates].sort((a, b) => b.localeCompare(a));
      expect(updates).toEqual(sorted);
    });
  });

  describe('getKbEntry', () => {
    it('returns entry with frontmatter, body, and related_resolved', async () => {
      const e = await getKbEntry('aaa11111-test-catpaw');
      expect(e).not.toBeNull();
      expect(e!.id).toBe('aaa11111-test-catpaw');
      expect(e!.path).toBe('resources/catpaws/aaa11111-test-catpaw.md');
      expect(e!.frontmatter.id).toBe('aaa11111-test-catpaw');
      expect(e!.body).toContain('## Descripción');
      expect(e!.related_resolved).toHaveLength(1);
      expect(e!.related_resolved[0].id).toBe('bbb22222-test-connector');
      expect(e!.related_resolved[0].title).toBe('Gmail Test');
      expect(e!.related_resolved[0].path).toBe('resources/connectors/bbb22222-test-connector.md');
    });

    it('returns null for missing id', async () => {
      const e = await getKbEntry('does-not-exist');
      expect(e).toBeNull();
    });

    it('returns empty related_resolved when frontmatter.related absent', async () => {
      const e = await getKbEntry('bbb22222-test-connector');
      expect(e).not.toBeNull();
      expect(e!.related_resolved).toEqual([]);
    });
  });
});
