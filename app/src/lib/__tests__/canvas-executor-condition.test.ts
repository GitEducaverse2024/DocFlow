/**
 * Phase 137 Plan 02 (LEARN-06): multilingual condition parser.
 *
 * The legacy canvas-executor parsed condition-node LLM answers with
 *   `result.output.trim().toLowerCase().startsWith('yes')`
 * which silently mis-routed every Spanish response ("Sí", "No", "afirmativo",
 * "negativo", ...) to the 'no' branch. This test suite pins the multilingual
 * parser that LEARN-06 introduces — it is a sanctioned deviation to the
 * "do not touch canvas-executor.ts" rule (milestone v27.0 requirement).
 *
 * Tests import ONLY `normalizeConditionAnswer` (named export) to avoid pulling
 * in the full executor surface (DB, ollama, qdrant, drive…) which is unrelated
 * to the parser under test.
 */
import { describe, it, expect } from 'vitest';
import { normalizeConditionAnswer, YES_VALUES, NO_VALUES } from '@/lib/services/canvas-executor';

describe('LEARN-06 normalizeConditionAnswer — multilingual condition parser', () => {
  // ---- YES matches ----------------------------------------------------------

  it('Test 1: "yes" → yes', () => {
    expect(normalizeConditionAnswer('yes')).toBe('yes');
  });

  it('Test 2: "sí" (con tilde) → yes', () => {
    expect(normalizeConditionAnswer('sí')).toBe('yes');
  });

  it('Test 3: "Si" (mayúscula, sin tilde) → yes', () => {
    expect(normalizeConditionAnswer('Si')).toBe('yes');
  });

  it('Test 4: "afirmativo" → yes', () => {
    expect(normalizeConditionAnswer('afirmativo')).toBe('yes');
  });

  it('Test 5: "correcto" → yes', () => {
    expect(normalizeConditionAnswer('correcto')).toBe('yes');
  });

  it('Test 6: "true" → yes', () => {
    expect(normalizeConditionAnswer('true')).toBe('yes');
  });

  it('Test 7: "1" → yes', () => {
    expect(normalizeConditionAnswer('1')).toBe('yes');
  });

  // ---- NO matches -----------------------------------------------------------

  it('Test 8: "no" → no', () => {
    expect(normalizeConditionAnswer('no')).toBe('no');
  });

  it('Test 9: "NO." (mayúsculas + puntuación) → no', () => {
    expect(normalizeConditionAnswer('NO.')).toBe('no');
  });

  it('Test 10: "negativo" → no', () => {
    expect(normalizeConditionAnswer('negativo')).toBe('no');
  });

  it('Test 11: "incorrecto" → no', () => {
    expect(normalizeConditionAnswer('incorrecto')).toBe('no');
  });

  // ---- Edge cases -----------------------------------------------------------

  it('Test 12: "maybe" (out-of-set) → no (conservative default)', () => {
    expect(normalizeConditionAnswer('maybe')).toBe('no');
  });

  it('Test 13: "sí, con reservas" → yes (first-token match)', () => {
    expect(normalizeConditionAnswer('sí, con reservas')).toBe('yes');
  });

  it('sanity: YES_VALUES/NO_VALUES exports are disjoint sets', () => {
    for (const v of YES_VALUES) expect(NO_VALUES.has(v)).toBe(false);
    for (const v of NO_VALUES) expect(YES_VALUES.has(v)).toBe(false);
  });
});
