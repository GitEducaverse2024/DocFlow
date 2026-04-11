import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Phase 137-07 Task 2 RED: architect self-healing wrapper helpers.
//
// The failing architect call at 137-06 RUN 1 (job cbf6c55e) hit max_tokens
// (4096) and emitted "Unterminated string in JSON at position 4722". These
// helpers underpin the fix:
//
//   1. resolveArchitectMaxTokens(configOverridesJson) — precedence:
//      overrides.architect_max_tokens > ARCHITECT_MAX_TOKENS env > 16000
//
//   2. parseArchitectJson(raw) — tries JSON.parse; on failure falls back to
//      jsonrepair, parses the repaired text, and flags repair_applied.
//      If repair also fails, re-throws the ORIGINAL parse error so upstream
//      classification sees the authentic "Unterminated string" signal.
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

type HelpersModule = typeof import('@/lib/services/intent-job-architect-helpers');

let resolveArchitectMaxTokens: HelpersModule['resolveArchitectMaxTokens'];
let parseArchitectJson: HelpersModule['parseArchitectJson'];

beforeEach(async () => {
  delete process['env']['ARCHITECT_MAX_TOKENS'];
  const mod = await import('@/lib/services/intent-job-architect-helpers');
  resolveArchitectMaxTokens = mod.resolveArchitectMaxTokens;
  parseArchitectJson = mod.parseArchitectJson;
});

describe('resolveArchitectMaxTokens', () => {
  it('returns 16000 when no override and no env var', () => {
    expect(resolveArchitectMaxTokens(null)).toBe(16000);
    expect(resolveArchitectMaxTokens(undefined)).toBe(16000);
    expect(resolveArchitectMaxTokens('')).toBe(16000);
  });

  it('uses ARCHITECT_MAX_TOKENS env when no override', () => {
    process['env']['ARCHITECT_MAX_TOKENS'] = '12000';
    expect(resolveArchitectMaxTokens(null)).toBe(12000);
  });

  it('prefers job-level config_overrides.architect_max_tokens over env', () => {
    process['env']['ARCHITECT_MAX_TOKENS'] = '12000';
    const overrides = JSON.stringify({ architect_max_tokens: 32000 });
    expect(resolveArchitectMaxTokens(overrides)).toBe(32000);
  });

  it('gracefully ignores malformed JSON overrides and falls back to default', () => {
    expect(resolveArchitectMaxTokens('not-json{')).toBe(16000);
  });

  it('ignores non-numeric architect_max_tokens override', () => {
    process['env']['ARCHITECT_MAX_TOKENS'] = '12000';
    const overrides = JSON.stringify({ architect_max_tokens: 'huge' });
    expect(resolveArchitectMaxTokens(overrides)).toBe(12000);
  });

  it('clamps overrides to a sane upper bound (128000)', () => {
    const overrides = JSON.stringify({ architect_max_tokens: 999999 });
    expect(resolveArchitectMaxTokens(overrides)).toBe(128000);
  });

  it('clamps overrides to minimum of 1000', () => {
    const overrides = JSON.stringify({ architect_max_tokens: 10 });
    expect(resolveArchitectMaxTokens(overrides)).toBe(1000);
  });
});

describe('parseArchitectJson', () => {
  it('parses valid JSON without invoking repair', () => {
    const raw = JSON.stringify({ flow_data: { nodes: [], edges: [] } });
    const out = parseArchitectJson(raw);
    expect(out.repair_applied).toBe(false);
    expect((out.parsed as { flow_data: unknown }).flow_data).toEqual({
      nodes: [],
      edges: [],
    });
  });

  it('strips markdown fences before parsing', () => {
    const raw = '```json\n{"a":1}\n```';
    const out = parseArchitectJson(raw);
    expect(out.repair_applied).toBe(false);
    expect((out.parsed as { a: number }).a).toBe(1);
  });

  it('repairs truncated JSON (unterminated string at end of nodes array)', () => {
    // Simulates the canonical "Unterminated string in JSON" failure from
    // job cbf6c55e: the model cuts off mid-string in a node instructions.
    const raw =
      '{"flow_data":{"nodes":[{"id":"a","data":{"instructions":"do the thing';
    const out = parseArchitectJson(raw);
    expect(out.repair_applied).toBe(true);
    // Repaired output should at least produce a parseable object with the
    // expected top-level key present, even if the truncated string becomes
    // an empty or synthesized value.
    const parsed = out.parsed as { flow_data?: { nodes?: unknown[] } };
    expect(parsed.flow_data).toBeDefined();
    expect(Array.isArray(parsed.flow_data?.nodes)).toBe(true);
  });

  it('throws the ORIGINAL parse error when repair also fails', () => {
    // Empty string: JSON.parse throws + jsonrepair throws
    // "Unexpected end of json string at position 0". Guarantees the
    // rethrow branch of parseArchitectJson is exercised.
    const raw = '';
    expect(() => parseArchitectJson(raw)).toThrow();
  });
});
