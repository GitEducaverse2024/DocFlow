import { describe, it, expect, beforeEach } from 'vitest';
import { loadRulesIndex, getCanvasRule, _resetCache } from '@/lib/services/canvas-rules';

describe('canvas-rules', () => {
  beforeEach(() => {
    _resetCache();
  });

  describe('loadRulesIndex (QA2-01)', () => {
    it('loads index markdown without throwing', () => {
      const idx = loadRulesIndex();
      expect(typeof idx).toBe('string');
      expect(idx.length).toBeGreaterThan(0);
    });

    it('index contains at least 25 rules', () => {
      const idx = loadRulesIndex();
      const lines = idx.split('\n').filter((l) => /^- (R\d{2}|SE\d{2}|DA\d{2}):/.test(l));
      expect(lines.length).toBeGreaterThanOrEqual(25);
    });

    it('every rule description line is <=100 chars', () => {
      const idx = loadRulesIndex();
      const lines = idx.split('\n').filter((l) => /^- (R\d{2}|SE\d{2}|DA\d{2}):/.test(l));
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(100);
      }
    });

    it('index contains expected groups', () => {
      const idx = loadRulesIndex();
      expect(idx).toContain('## Data Contracts');
      expect(idx).toContain('## Side Effects Guards');
      expect(idx).toContain('## Anti-patterns');
    });

    it('caches after first call', () => {
      const a = loadRulesIndex();
      const b = loadRulesIndex();
      expect(a).toBe(b);
    });
  });

  describe('getCanvasRule (QA2-02)', () => {
    it('returns detail for R01', () => {
      const r = getCanvasRule('R01');
      expect(r).not.toBeNull();
      expect(r!.id).toBe('R01');
      expect(r!.short.length).toBeLessThanOrEqual(100);
      expect(typeof r!.long).toBe('string');
      expect(r!.long.length).toBeGreaterThan(0);
      expect(r!.category).toBe('data_contracts');
    });

    it('returns detail for R10 and R13 (same category)', () => {
      const r10 = getCanvasRule('R10');
      const r13 = getCanvasRule('R13');
      expect(r10).not.toBeNull();
      expect(r13).not.toBeNull();
      expect(r10!.category).toBe('data_contracts');
      expect(r13!.category).toBe('data_contracts');
    });

    it('returns detail for R25', () => {
      const r = getCanvasRule('R25');
      expect(r).not.toBeNull();
      expect(r!.id).toBe('R25');
      expect(r!.category).toBe('arrays_loops');
    });

    it('returns detail for SE01-SE03 (side_effects category)', () => {
      for (const id of ['SE01', 'SE02', 'SE03']) {
        const r = getCanvasRule(id);
        expect(r, `rule ${id}`).not.toBeNull();
        expect(r!.category).toBe('side_effects');
      }
    });

    it('returns detail for DA01-DA04 (anti_patterns category)', () => {
      for (const id of ['DA01', 'DA02', 'DA03', 'DA04']) {
        const r = getCanvasRule(id);
        expect(r, `rule ${id}`).not.toBeNull();
        expect(r!.category).toBe('anti_patterns');
      }
    });

    it('returns null for unknown rule id', () => {
      expect(getCanvasRule('R99')).toBeNull();
    });

    it('is case-insensitive for rule id', () => {
      const r = getCanvasRule('r01');
      expect(r).not.toBeNull();
      expect(r!.id).toBe('R01');
    });
  });
});
