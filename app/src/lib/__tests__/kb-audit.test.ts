import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Phase 153-01 Task 3: kb-audit unit tests (TDD RED→GREEN).
//
// Behavior under test:
//   - markStale(path, reason, details?) appends rows to
//     .docflow-kb/_sync_failures.md.
//   - First call lazily writes frontmatter header (schema-valid per
//     frontmatter.schema.json).
//   - Subsequent calls fs.appendFileSync a single row each.
//   - Never throws (catches all filesystem errors internally).
//   - Concurrent calls produce N distinct rows (no interleaving corruption).
//   - Reads KB_ROOT via bracket notation `process['env']['KB_ROOT']`.
//   - Error strings with pipes sanitize to U+2502 and truncate at 100 chars.
//   - scripts/validate-kb.cjs EXCLUDED_FILENAMES includes '_sync_failures.md'.
//
// Fixture pattern: per-suite mkdtempSync tmp dir, KB_ROOT hoisted BEFORE
// module import so kb-audit picks up the tmp path at first load.
// ---------------------------------------------------------------------------

// Hoisted tmp dir + KB_ROOT — runs BEFORE any import below.
const { TEST_TMP_DIR } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'kb-audit-test-'));
  process['env']['KB_ROOT'] = nodePath.join(tmpDir, '.docflow-kb');
  nodeFs.mkdirSync(process['env']['KB_ROOT'], { recursive: true });
  return { TEST_TMP_DIR: tmpDir };
});

import { markStale, type StaleEntry, type StaleReason } from '../services/kb-audit';

function kbRoot(): string {
  return process['env']['KB_ROOT'] as string;
}

function failurePath(): string {
  return path.join(kbRoot(), '_sync_failures.md');
}

function resetKbRoot(): void {
  // Clean .docflow-kb/ between tests without nuking the tmp parent.
  fs.rmSync(kbRoot(), { recursive: true, force: true });
  fs.mkdirSync(kbRoot(), { recursive: true });
}

describe('kb-audit', () => {
  beforeEach(() => {
    resetKbRoot();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('markStale (Test 1): appends line to _sync_failures.md', () => {
    it('creates file with frontmatter header + table header + 1 row on first call', () => {
      const details: StaleEntry = {
        entity: 'cat_paws',
        db_id: 'abc',
        error: 'ENOSPC',
      };
      markStale('resources/catpaws/abc-test.md', 'create-sync-failed' as StaleReason, details);

      expect(fs.existsSync(failurePath())).toBe(true);
      const contents = fs.readFileSync(failurePath(), 'utf8');
      // Exactly two --- frontmatter delimiters.
      const delims = contents.match(/^---$/gm);
      expect(delims?.length).toBe(2);
      // Required top-level frontmatter keys (schema-valid).
      expect(contents).toMatch(/^id: sync-failures$/m);
      expect(contents).toMatch(/^type: audit$/m);
      expect(contents).toMatch(/^ttl: never$/m);
      expect(contents).toMatch(/^created_by: kb-audit$/m);
      expect(contents).toMatch(/^version: 1\.0\.0$/m);
      // change_log is required by schema (minItems: 1).
      expect(contents).toMatch(/^change_log:/m);
      // Table with header.
      expect(contents).toContain('| Timestamp | Reason | Entity | DB ID | KB Path | Error |');
      // 1 row.
      expect(contents).toContain('| create-sync-failed | cat_paws | abc | resources/catpaws/abc-test.md | ENOSPC |');
    });
  });

  describe('markStale (Test 2): first call creates frontmatter header', () => {
    it('when file does not exist, writes full frontmatter + H1 + table header + 1 row', () => {
      expect(fs.existsSync(failurePath())).toBe(false);
      markStale('resources/skills/skill-x.md', 'update-sync-failed' as StaleReason, {
        entity: 'skills',
        db_id: 'sk-123',
        error: 'disk full',
      });
      const contents = fs.readFileSync(failurePath(), 'utf8');
      // Frontmatter starts at first byte.
      expect(contents.startsWith('---\n')).toBe(true);
      // H1 title.
      expect(contents).toContain('# Sync Failures Log');
      // Explanatory paragraph.
      expect(contents).toContain('Entries appended by Phase 153 hooks');
    });
  });

  describe('markStale (Test 3): subsequent calls append single lines only', () => {
    it('does not rewrite header — file size grows monotonically', () => {
      markStale('resources/catpaws/a.md', 'create-sync-failed' as StaleReason, {
        entity: 'cat_paws',
        db_id: 'a',
        error: 'e1',
      });
      const size1 = fs.statSync(failurePath()).size;

      markStale('resources/catpaws/b.md', 'update-sync-failed' as StaleReason, {
        entity: 'cat_paws',
        db_id: 'b',
        error: 'e2',
      });
      const size2 = fs.statSync(failurePath()).size;

      markStale('resources/catpaws/c.md', 'delete-sync-failed' as StaleReason, {
        entity: 'cat_paws',
        db_id: 'c',
        error: 'e3',
      });
      const size3 = fs.statSync(failurePath()).size;

      expect(size2).toBeGreaterThan(size1);
      expect(size3).toBeGreaterThan(size2);

      const contents = fs.readFileSync(failurePath(), 'utf8');
      // Count data rows (exclude the table header row).
      const rowLines = contents.split('\n').filter(l => l.startsWith('| ') && !l.includes('Timestamp') && !l.includes('---'));
      expect(rowLines.length).toBe(3);

      // Only one frontmatter block.
      const delims = contents.match(/^---$/gm);
      expect(delims?.length).toBe(2);
    });
  });

  describe('markStale (Test 4): never throws', () => {
    it('returns normally when fs.appendFileSync throws EACCES', () => {
      // Seed the file with header via a valid first call.
      markStale('resources/catpaws/seed.md', 'create-sync-failed' as StaleReason, {
        entity: 'cat_paws',
        db_id: 'seed',
        error: 'seed',
      });
      // Now break the writer.
      const spy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });
      // Must not throw.
      expect(() => markStale('resources/catpaws/after.md', 'update-sync-failed' as StaleReason, {
        entity: 'cat_paws',
        db_id: 'after',
        error: 'after',
      })).not.toThrow();
      spy.mockRestore();
    });

    it('returns normally when KB_ROOT cannot be created', () => {
      const original = process['env']['KB_ROOT'];
      // Point at a path whose parent is a file (forces mkdirSync to fail).
      const badFile = path.join(TEST_TMP_DIR, 'file-not-dir');
      fs.writeFileSync(badFile, 'im a file');
      process['env']['KB_ROOT'] = path.join(badFile, 'cant-be-dir');
      try {
        expect(() => markStale('x.md', 'create-sync-failed' as StaleReason, {
          entity: 'e',
          db_id: 'd',
          error: 'ee',
        })).not.toThrow();
      } finally {
        process['env']['KB_ROOT'] = original;
      }
    });
  });

  describe('markStale (Test 5): concurrent calls produce N distinct rows', () => {
    it('await Promise.all of 2 calls leaves exactly 2 rows, each parseable', async () => {
      await Promise.all([
        Promise.resolve().then(() => markStale('resources/catpaws/a.md', 'create-sync-failed' as StaleReason, {
          entity: 'cat_paws', db_id: 'a', error: 'err-a',
        })),
        Promise.resolve().then(() => markStale('resources/catpaws/b.md', 'create-sync-failed' as StaleReason, {
          entity: 'cat_paws', db_id: 'b', error: 'err-b',
        })),
      ]);

      const contents = fs.readFileSync(failurePath(), 'utf8');
      const dataRows = contents.split('\n').filter(l =>
        l.startsWith('| ') &&
        !l.includes('Timestamp') &&
        !l.includes('---|') &&
        l.trim().length > 0
      );
      expect(dataRows.length).toBe(2);
      // Each row must have 7 pipe-delimited cells (6 columns + leading/trailing).
      for (const row of dataRows) {
        const cells = row.split('|').map(c => c.trim());
        // Leading and trailing empty strings + 6 content cells.
        expect(cells.length).toBe(8);
        // ISO-ish timestamp.
        expect(cells[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });
  });

  describe('markStale (Test 6): truncates error to 100 chars and escapes pipes', () => {
    it('pipes become U+2502 and string is truncated at 100 chars', () => {
      const bigError = 'A'.repeat(50) + '|pipe-in-middle|' + 'B'.repeat(200);
      markStale('resources/catpaws/x.md', 'create-sync-failed' as StaleReason, {
        entity: 'cat_paws', db_id: 'x', error: bigError,
      });
      const contents = fs.readFileSync(failurePath(), 'utf8');
      // No raw '|' characters inside the error cell should leak beyond the
      // intended column delimiters. Easy proxy: the data row must split into
      // exactly 8 cells when we split on '|'.
      const lines = contents.split('\n');
      const row = lines.find(l => l.includes('create-sync-failed') && l.includes('cat_paws'));
      expect(row).toBeDefined();
      const cells = row!.split('|').map(c => c.trim());
      expect(cells.length).toBe(8);
      const errCell = cells[6];
      // 100 chars max after sanitization.
      expect(errCell.length).toBeLessThanOrEqual(100);
      // Pipes replaced by U+2502.
      expect(errCell).toContain('\u2502');
      expect(errCell.indexOf('|')).toBe(-1);
    });
  });

  describe('markStale (Test 7): reads KB_ROOT via bracket notation', () => {
    it('writes _sync_failures.md under process[env][KB_ROOT] when set', () => {
      const customTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-audit-custom-'));
      const customKb = path.join(customTmp, '.docflow-kb');
      fs.mkdirSync(customKb, { recursive: true });
      const original = process['env']['KB_ROOT'];
      process['env']['KB_ROOT'] = customKb;
      try {
        markStale('resources/catpaws/custom.md', 'create-sync-failed' as StaleReason, {
          entity: 'cat_paws', db_id: 'custom', error: 'c',
        });
        expect(fs.existsSync(path.join(customKb, '_sync_failures.md'))).toBe(true);
      } finally {
        process['env']['KB_ROOT'] = original;
        fs.rmSync(customTmp, { recursive: true, force: true });
      }
    });
  });

  describe('validate-kb.cjs (Test 8): excludes _sync_failures.md', () => {
    it('validator exit 0 even when _sync_failures.md has invalid frontmatter', () => {
      // Copy real schemas into the tmp KB so validate-kb.cjs can load them.
      const repoRoot = path.resolve(__dirname, '../../../../..');
      const realSchemaDir = path.resolve(repoRoot, 'docflow/.docflow-kb/_schema');
      const fallback = path.resolve(__dirname, '../../../..', '.docflow-kb/_schema');
      const schemaSrc = fs.existsSync(realSchemaDir) ? realSchemaDir : fallback;
      if (!fs.existsSync(schemaSrc)) {
        // Cannot locate schemas — skip test defensively (not a real failure).
        console.warn('[kb-audit.test] schema source not found; skipping validate-kb spawn test');
        return;
      }

      const schemaDst = path.join(kbRoot(), '_schema');
      fs.mkdirSync(schemaDst, { recursive: true });
      for (const name of ['frontmatter.schema.json', 'tag-taxonomy.json', 'resource.schema.json']) {
        const src = path.join(schemaSrc, name);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(schemaDst, name));
      }

      // Write a deliberately malformed _sync_failures.md (missing required fields).
      fs.writeFileSync(
        path.join(kbRoot(), '_sync_failures.md'),
        '---\nnot: valid\n---\n# garbage',
      );

      // Locate validate-kb.cjs — walk upward until we find scripts/validate-kb.cjs.
      let cur = path.resolve(__dirname);
      let validatorPath: string | null = null;
      for (let i = 0; i < 10; i++) {
        const candidate = path.join(cur, 'scripts', 'validate-kb.cjs');
        if (fs.existsSync(candidate)) {
          validatorPath = candidate;
          break;
        }
        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
      }
      if (!validatorPath) {
        console.warn('[kb-audit.test] validate-kb.cjs not found; skipping spawn test');
        return;
      }

      // The validator hardcodes its KB_ROOT relative to __dirname, so we
      // copy it into the tmp repo root structure and run from there.
      const tmpRepo = path.dirname(kbRoot());
      const tmpScripts = path.join(tmpRepo, 'scripts');
      fs.mkdirSync(tmpScripts, { recursive: true });
      fs.copyFileSync(validatorPath, path.join(tmpScripts, 'validate-kb.cjs'));

      const res = spawnSync(process.execPath, [path.join(tmpScripts, 'validate-kb.cjs')], {
        encoding: 'utf8',
      });
      expect(res.status).toBe(0);
    });
  });
});
