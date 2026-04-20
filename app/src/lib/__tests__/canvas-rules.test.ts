import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRulesIndex, getCanvasRule, _resetCache } from '@/lib/services/canvas-rules';

describe('canvas-rules (KB-backed, Phase 155)', () => {
  const ORIGINAL_KB_ROOT = process['env']['KB_ROOT'];

  beforeEach(() => {
    // Tests run with cwd=app/, so the default KB_ROOT resolves to
    // ../.docflow-kb which is the real KB populated in Plan 151 + Task 1.
    delete process['env']['KB_ROOT'];
    _resetCache();
  });

  afterEach(() => {
    if (ORIGINAL_KB_ROOT === undefined) {
      delete process['env']['KB_ROOT'];
    } else {
      process['env']['KB_ROOT'] = ORIGINAL_KB_ROOT;
    }
    _resetCache();
  });

  describe('loadRulesIndex', () => {
    it('returns a string starting with the canonical header', () => {
      const idx = loadRulesIndex();
      expect(typeof idx).toBe('string');
      expect(idx.startsWith('# Canvas Design Rules Index')).toBe(true);
    });

    it('contains every one of the 9 section headers', () => {
      const idx = loadRulesIndex();
      expect(idx).toContain('## Data Contracts');
      expect(idx).toContain('## Node Responsibilities');
      expect(idx).toContain('## Arrays & Loops');
      expect(idx).toContain('## Instructions Writing');
      expect(idx).toContain('## Planning & Testing');
      expect(idx).toContain('## Templates');
      expect(idx).toContain('## Resilience & References');
      expect(idx).toContain('## Side Effects Guards');
      expect(idx).toContain('## Anti-patterns');
    });

    it('contains all 32 rule bullets (R01..R25 + SE01..SE03 + DA01..DA04)', () => {
      const idx = loadRulesIndex();
      const ruleLines = idx
        .split('\n')
        .filter((l) => /^- (R\d{2}|SE\d{2}|DA\d{2}):/.test(l));
      expect(ruleLines.length).toBe(32);
      // Spot-check boundaries
      expect(idx).toMatch(/^- R01: /m);
      expect(idx).toMatch(/^- R25: /m);
      expect(idx).toMatch(/^- SE01: /m);
      expect(idx).toMatch(/^- DA04: /m);
    });

    it('every rule description line is <=130 chars', () => {
      const idx = loadRulesIndex();
      const lines = idx.split('\n').filter((l) => /^- (R\d{2}|SE\d{2}|DA\d{2}):/.test(l));
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(130);
      }
    });

    it('caches after first call (same reference on second call)', () => {
      const a = loadRulesIndex();
      const b = loadRulesIndex();
      expect(a).toBe(b);
    });
  });

  describe('getCanvasRule', () => {
    it('returns detail for R01 (data_contracts)', () => {
      const r = getCanvasRule('R01');
      expect(r).not.toBeNull();
      expect(r!.id).toBe('R01');
      expect(r!.short.length).toBeLessThanOrEqual(100);
      expect(typeof r!.long).toBe('string');
      expect(r!.long.length).toBeGreaterThan(0);
      expect(r!.category).toBe('data_contracts');
    });

    it('returns detail for R10 with long body mentioning "MISMO array JSON"', () => {
      const r = getCanvasRule('R10');
      expect(r).not.toBeNull();
      expect(r!.id).toBe('R10');
      expect(r!.category).toBe('data_contracts');
      // R10 body in .docflow-kb/rules/R10-preserve-fields.md includes the
      // anti-teléfono-escacharrado verbatim quote.
      expect(r!.long.length).toBeGreaterThan(150);
      expect(r!.long).toContain('MISMO array JSON');
    });

    it('returns detail for R25 (arrays_loops)', () => {
      const r = getCanvasRule('R25');
      expect(r).not.toBeNull();
      expect(r!.id).toBe('R25');
      expect(r!.category).toBe('arrays_loops');
    });

    it('is case-insensitive for rule id (r25 → R25)', () => {
      const r = getCanvasRule('r25');
      expect(r).not.toBeNull();
      expect(r!.id).toBe('R25');
    });

    it('returns SE01 with side_effects category and guard semantics in long body', () => {
      const r = getCanvasRule('SE01');
      expect(r).not.toBeNull();
      expect(r!.id).toBe('SE01');
      expect(r!.category).toBe('side_effects');
      // SE01 body (in Spanish) mentions "nodo guard de tipo `condition`" —
      // check both keywords appear, which is enough to prove KB body was read.
      const long = r!.long.toLowerCase();
      expect(long).toContain('guard');
      expect(long).toContain('condition');
    });

    it('returns SE02/SE03 with side_effects category', () => {
      for (const id of ['SE02', 'SE03']) {
        const r = getCanvasRule(id);
        expect(r, `rule ${id}`).not.toBeNull();
        expect(r!.category).toBe('side_effects');
      }
    });

    it('returns DA04 with anti_patterns category', () => {
      const r = getCanvasRule('DA04');
      expect(r).not.toBeNull();
      expect(r!.id).toBe('DA04');
      expect(r!.category).toBe('anti_patterns');
    });

    it('returns DA01/DA02/DA03 with anti_patterns category', () => {
      for (const id of ['DA01', 'DA02', 'DA03']) {
        const r = getCanvasRule(id);
        expect(r, `rule ${id}`).not.toBeNull();
        expect(r!.category).toBe('anti_patterns');
      }
    });

    it('returns null for unknown rule id R99', () => {
      expect(getCanvasRule('R99')).toBeNull();
    });
  });

  describe('_resetCache + process.env.KB_ROOT override', () => {
    it('_resetCache + KB_ROOT tmp dir causes re-read from fs', () => {
      // Baseline: read from real KB
      const real = loadRulesIndex();
      expect(real).toContain('R01:');

      // Point KB_ROOT at a tmpdir with a single stub rule, reset cache
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-test-'));
      try {
        fs.mkdirSync(path.join(tmpRoot, 'rules'), { recursive: true });
        fs.writeFileSync(
          path.join(tmpRoot, 'rules', 'R01-stub.md'),
          `---\nid: rule-r01-stub\ntype: rule\nsubtype: design\nlang: es\ntitle: "R01 — Stub"\nsummary: "Stub rule short description"\ntags: [canvas, R01, safety]\naudience: [catbot]\nstatus: active\ncreated_at: 2026-04-20T00:00:00Z\ncreated_by: test\nversion: 1.0.0\nupdated_at: 2026-04-20T00:00:00Z\nupdated_by: test\nsource_of_truth: null\nchange_log:\n  - { version: 1.0.0, date: 2026-04-20, author: test, change: "Stub for test" }\nttl: never\n---\n\n# R01 — Stub\n\nThis is a stubbed rule body for testing KB_ROOT override.\n`,
          'utf8',
        );

        process['env']['KB_ROOT'] = tmpRoot;
        _resetCache();

        const stubbed = loadRulesIndex();
        expect(stubbed).toContain('R01: Stub rule short description');
        // Original KB content should NOT leak
        expect(stubbed).not.toContain('anti-teléfono-escacharrado');
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });
});
