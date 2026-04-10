/**
 * Phase 131: Complexity prefix parser.
 *
 * CatBot is instructed (via buildComplexityProtocol) to prepend every reply with:
 *   [COMPLEXITY:simple|complex|ambiguous] [REASON:...] [EST:Ns]
 *
 * This helper extracts that prefix, returns a classification + cleaned content,
 * and falls back safely to 'simple' when the prefix is missing or malformed
 * (so routing never breaks on unexpected LLM output).
 */

export interface ComplexityPrefix {
  classification: 'simple' | 'complex' | 'ambiguous';
  reason: string | null;
  estimatedDurationS: number | null;
  cleanedContent: string;
  hadPrefix: boolean;
}

const COMPLEXITY_REGEX =
  /^\s*\[COMPLEXITY:\s*(simple|complex|ambiguous)\s*\]\s*(?:\[REASON:\s*([^\]]+?)\s*\])?\s*(?:\[EST:\s*(\d+)\s*s?\s*\])?\s*/i;

export function parseComplexityPrefix(content: string): ComplexityPrefix {
  if (!content) {
    return {
      classification: 'simple',
      reason: 'no_content_fallback',
      estimatedDurationS: null,
      cleanedContent: content || '',
      hadPrefix: false,
    };
  }

  const match = content.match(COMPLEXITY_REGEX);
  if (!match) {
    return {
      classification: 'simple',
      reason: 'no_prefix_fallback',
      estimatedDurationS: null,
      cleanedContent: content,
      hadPrefix: false,
    };
  }

  const cls = match[1].toLowerCase() as 'simple' | 'complex' | 'ambiguous';
  const reason = (match[2] ?? '').trim() || null;
  const est = match[3] ? parseInt(match[3], 10) : null;
  const cleaned = content.slice(match[0].length).trimStart();

  return {
    classification: cls,
    reason,
    estimatedDurationS: est,
    cleanedContent: cleaned,
    hadPrefix: true,
  };
}
