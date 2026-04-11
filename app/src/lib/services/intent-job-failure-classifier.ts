/**
 * Phase 137-07 (gap closure): architect self-healing failure classifier.
 *
 * Buckets any architect-pipeline error into a coarse category so CatBot +
 * the user can decide the right retry strategy:
 *
 *   - truncated_json: LLM hit max_tokens, JSON cut off mid-string.
 *                     Remedy: bump architect_max_tokens + retry.
 *   - parse_error:    LLM produced malformed JSON for reasons other than
 *                     truncation (bad escaping, stray text, etc.).
 *                     Remedy: retry with stricter prompt or jsonrepair.
 *   - qa_rejected:    QA review loop exhausted MAX_QA_ITERATIONS without
 *                     accepting any iteration. Remedy: design-level fix.
 *   - llm_error:      LiteLLM upstream failure (timeout, 5xx, ECONN*).
 *                     Remedy: retry as-is.
 *   - other:          Everything else. Needs human triage.
 *
 * Input is intentionally loose — callers may only have the error string, or
 * may have the raw model output + finishReason. We use whatever is available.
 */

export type ArchitectFailureClass =
  | 'truncated_json'
  | 'parse_error'
  | 'qa_rejected'
  | 'llm_error'
  | 'other';

export interface ClassifyArchitectFailureInput {
  error: string;
  rawOutput?: string | null;
  finishReason?: string | null;
}

/**
 * Heuristic test: does the raw output look like it was cut off mid-JSON?
 * We check for balanced braces + brackets and a trailing char that is not
 * an object/array terminator. Cheap + deterministic; catches the canonical
 * "model ran out of tokens in the middle of a string" failure.
 */
function looksTruncated(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return false;
  const last = trimmed[trimmed.length - 1];
  if (last === '}' || last === ']') {
    // Terminator present — still might be unbalanced but unlikely truncated.
    return false;
  }
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let escape = false;
  for (const ch of trimmed) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;
  }
  return braceDepth > 0 || bracketDepth > 0 || inString;
}

export function classifyArchitectFailure(
  input: ClassifyArchitectFailureInput,
): ArchitectFailureClass {
  const err = (input.error ?? '').toString();
  const errLower = err.toLowerCase();

  // QA exhaustion comes first — it is emitted by runArchitectQALoop and uses
  // very specific phrasing that we own in this codebase.
  if (errLower.includes('qa loop exhausted') || errLower.includes('qa exhaustion')) {
    return 'qa_rejected';
  }

  // Network / LLM infrastructure failures.
  if (
    errLower.includes('timeout') ||
    errLower.includes('econnreset') ||
    errLower.includes('econnrefused') ||
    errLower.includes('econn') ||
    errLower.includes('fetch failed') ||
    /litellm\s+5\d{2}/.test(errLower) ||
    errLower.includes('abort')
  ) {
    return 'llm_error';
  }

  // JSON truncation — the canonical failure this gap closure was built for.
  if (
    errLower.includes('unterminated string') ||
    errLower.includes('unexpected end of json') ||
    errLower.includes('unexpected end of input')
  ) {
    return 'truncated_json';
  }
  if ((input.finishReason ?? '').toString().toLowerCase() === 'length') {
    return 'truncated_json';
  }
  if (input.rawOutput && looksTruncated(input.rawOutput)) {
    return 'truncated_json';
  }

  // Any other JSON parse failure.
  if (
    errLower.includes('syntaxerror') ||
    errLower.includes('json') ||
    errLower.includes('unexpected token')
  ) {
    return 'parse_error';
  }

  return 'other';
}
