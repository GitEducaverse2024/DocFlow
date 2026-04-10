import { describe, it, expect } from 'vitest';
import { parseComplexityPrefix } from '@/lib/services/catbot-complexity-parser';

describe('parseComplexityPrefix (Phase 131)', () => {
  it('parses full prefix with REASON and EST', () => {
    const input = '[COMPLEXITY:complex] [REASON:4 ops] [EST:180s]\n\nbody';
    const out = parseComplexityPrefix(input);
    expect(out.classification).toBe('complex');
    expect(out.reason).toBe('4 ops');
    expect(out.estimatedDurationS).toBe(180);
    expect(out.cleanedContent).toBe('body');
    expect(out.hadPrefix).toBe(true);
  });

  it('is lenient with whitespace and uppercase', () => {
    const input = '  [COMPLEXITY: COMPLEX ] [REASON: foo ] [EST:60]   body';
    const out = parseComplexityPrefix(input);
    expect(out.classification).toBe('complex');
    expect(out.reason).toBe('foo');
    expect(out.estimatedDurationS).toBe(60);
    expect(out.hadPrefix).toBe(true);
  });

  it('parses simple without REASON/EST', () => {
    const input = '[COMPLEXITY:simple]\n\nrespuesta';
    const out = parseComplexityPrefix(input);
    expect(out.classification).toBe('simple');
    expect(out.reason).toBeNull();
    expect(out.estimatedDurationS).toBeNull();
    expect(out.cleanedContent).toBe('respuesta');
    expect(out.hadPrefix).toBe(true);
  });

  it('falls back to simple when no prefix present', () => {
    const input = 'hola, soy CatBot';
    const out = parseComplexityPrefix(input);
    expect(out.classification).toBe('simple');
    expect(out.reason).toBe('no_prefix_fallback');
    expect(out.hadPrefix).toBe(false);
    expect(out.cleanedContent).toBe('hola, soy CatBot');
  });

  it('parses ambiguous', () => {
    const input = '[COMPLEXITY:ambiguous] [REASON:vague]\n\nx';
    const out = parseComplexityPrefix(input);
    expect(out.classification).toBe('ambiguous');
    expect(out.reason).toBe('vague');
    expect(out.cleanedContent).toBe('x');
    expect(out.hadPrefix).toBe(true);
  });

  it('handles empty content with no_content_fallback', () => {
    const out = parseComplexityPrefix('');
    expect(out.classification).toBe('simple');
    expect(out.reason).toBe('no_content_fallback');
    expect(out.hadPrefix).toBe(false);
  });

  it('typo in prefix name falls back to simple', () => {
    const input = '[CMPLEXITY:complex] body';
    const out = parseComplexityPrefix(input);
    expect(out.classification).toBe('simple');
    expect(out.hadPrefix).toBe(false);
    expect(out.reason).toBe('no_prefix_fallback');
  });
});
