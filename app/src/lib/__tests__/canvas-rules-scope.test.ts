import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RULES_PATH = path.resolve(__dirname, '../../../data/knowledge/canvas-rules-index.md');

interface ParsedRule {
  rule_id: string;
  scope_annotation: string | null;
}

function parseRules(md: string): ParsedRule[] {
  const out: ParsedRule[] = [];
  const re = /^- (R\d+|SE\d+|DA\d+):.*?(?:\[scope:\s*([^\]]+)\])?\s*$/;
  for (const line of md.split('\n')) {
    const m = line.match(re);
    if (!m) continue;
    out.push({ rule_id: m[1], scope_annotation: m[2] ? m[2].trim() : null });
  }
  return out;
}

describe('canvas-rules-index.md scope annotations (ARCH-DATA-07)', () => {
  const md = fs.readFileSync(RULES_PATH, 'utf8');
  const rules = parseRules(md);
  const byId = new Map(rules.map(r => [r.rule_id, r]));

  it('R10 declares [scope: transformer,synthesizer]', () => {
    expect(byId.get('R10')?.scope_annotation).toBe('transformer,synthesizer');
  });
  it('R15 declares [scope: transformer,synthesizer,renderer]', () => {
    expect(byId.get('R15')?.scope_annotation).toBe('transformer,synthesizer,renderer');
  });
  it('R02 declares [scope: extractor,transformer-when-array]', () => {
    expect(byId.get('R02')?.scope_annotation).toBe('extractor,transformer-when-array');
  });
  it('SE01 declares [scope: emitter]', () => {
    expect(byId.get('SE01')?.scope_annotation).toBe('emitter');
  });
  it('universal rules (R03, R04, R11, R20, R23, R24) have no scope annotation', () => {
    for (const id of ['R03', 'R04', 'R11', 'R20', 'R23', 'R24']) {
      expect(byId.get(id)?.scope_annotation).toBeNull();
    }
  });
  it('parses at least 20 rules (sanity)', () => {
    expect(rules.length).toBeGreaterThanOrEqual(20);
  });
});
