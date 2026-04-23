import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseIteratorItems } from '../services/canvas-iterator-parser';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('parseIteratorItems — well-formed inputs', () => {
  it('returns [] for empty input', () => {
    expect(parseIteratorItems('', '')).toEqual([]);
    expect(parseIteratorItems('   ', '')).toEqual([]);
  });

  it('parses a well-formed JSON array of strings', () => {
    expect(parseIteratorItems('["a","b","c"]', '')).toEqual(['a', 'b', 'c']);
  });

  it('parses a well-formed JSON array of objects (stringifies)', () => {
    const result = parseIteratorItems('[{"id":1},{"id":2}]', '');
    expect(result).toHaveLength(2);
    expect(JSON.parse(result[0])).toEqual({ id: 1 });
    expect(JSON.parse(result[1])).toEqual({ id: 2 });
  });

  it('strips markdown code fences around valid JSON array', () => {
    expect(parseIteratorItems('```json\n["x","y"]\n```', '')).toEqual(['x', 'y']);
    expect(parseIteratorItems('```\n["a"]\n```', '')).toEqual(['a']);
  });

  it('returns [] for the string "[]" (empty array)', () => {
    expect(parseIteratorItems('[]', '')).toEqual([]);
  });
});

describe('parseIteratorItems — non-JSON fallbacks', () => {
  it('splits on custom separator when not a JSON array', () => {
    expect(parseIteratorItems('a|b|c', '|')).toEqual(['a', 'b', 'c']);
    expect(parseIteratorItems('a,b,,c', ',')).toEqual(['a', 'b', 'c']);
  });

  it('splits on newlines when no separator and multiline non-JSON', () => {
    expect(parseIteratorItems('foo\nbar\n', '')).toEqual(['foo', 'bar']);
  });

  it('wraps single non-JSON non-newline input as single-item array', () => {
    expect(parseIteratorItems('single', '')).toEqual(['single']);
  });
});

describe('parseIteratorItems — malformed JSON recovery (v30.2 P1 regression)', () => {
  it('recovers items from the real run 609828fa lector output (regex-salvage fallback)', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'iterator-run-609828fa-lector-output.json');
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    // Primary regression assertion: this input made canvas-executor return []
    // before v30.2 (cascade: 8 downstream nodes skipped, 0 leads processed).
    const result = parseIteratorItems(raw, '');
    expect(result.length).toBeGreaterThan(0);
    // Each recovered item must be valid JSON with a messageId field.
    for (const item of result) {
      const parsed = JSON.parse(item);
      expect(parsed).toHaveProperty('messageId');
    }
  });

  it('uses jsonrepair when array has trailing comma', () => {
    const input = '[{"id":1},{"id":2},]';
    const result = parseIteratorItems(input, '');
    expect(result.length).toBe(2);
  });

  it('uses jsonrepair when array is missing closing bracket', () => {
    const input = '[{"id":1},{"id":2}';
    const result = parseIteratorItems(input, '');
    expect(result.length).toBe(2);
  });

  it('regex-salvages individual objects when the array wrapper is corrupt', () => {
    // Simulate a malformed array where a middle element breaks parsing but
    // sibling objects are individually well-formed. Neither JSON.parse nor
    // jsonrepair should succeed cleanly, forcing the regex-salvage path.
    const input = '[{"id":1},BROKEN{{,{"id":3}]';
    const result = parseIteratorItems(input, '');
    // At least the two well-formed {id:...} blocks should survive.
    expect(result.length).toBeGreaterThanOrEqual(2);
    const ids = result.map(r => JSON.parse(r).id);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
  });

});
