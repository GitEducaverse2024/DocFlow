import { jsonrepair } from 'jsonrepair';

/**
 * Phase 137-07 (gap closure): architect self-healing helpers.
 *
 * Extracted to a dedicated file so the unit suite can exercise them without
 * importing the full IntentJobExecutor (DB + ollama + qdrant transitive chain).
 */

const DEFAULT_ARCHITECT_MAX_TOKENS = 16000;
const MIN_ARCHITECT_MAX_TOKENS = 1000;
const MAX_ARCHITECT_MAX_TOKENS = 128000;

const DEFAULT_MAX_QA_ITERATIONS = 4;
const MIN_MAX_QA_ITERATIONS = 1;
const MAX_MAX_QA_ITERATIONS = 10;

/**
 * Resolve the max_tokens budget for an architect LLM call.
 *
 * Precedence (first wins):
 *   1. job.config_overrides.architect_max_tokens (per-job override set by
 *      CatBot retry_intent_job when the previous job failed on truncation).
 *   2. process.env.ARCHITECT_MAX_TOKENS (deploy-wide default, bracket
 *      notation per CLAUDE.md to bypass Next.js webpack inlining).
 *   3. DEFAULT_ARCHITECT_MAX_TOKENS = 16000 — 4x the old hard-coded 4000 that
 *      caused the 137-06 RUN 1 truncation.
 *
 * Overrides are clamped to [1000, 128000] to prevent pathological values from
 * either burning budget or starving the LLM.
 */
export function resolveArchitectMaxTokens(
  configOverridesJson: string | null | undefined,
): number {
  const envValue = process['env']['ARCHITECT_MAX_TOKENS'];
  const envNum = envValue ? Number.parseInt(envValue, 10) : NaN;
  const envFallback = Number.isFinite(envNum) && envNum > 0 ? envNum : DEFAULT_ARCHITECT_MAX_TOKENS;

  if (!configOverridesJson) return envFallback;
  let overrides: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(configOverridesJson);
    if (!parsed || typeof parsed !== 'object') return envFallback;
    overrides = parsed as Record<string, unknown>;
  } catch {
    return envFallback;
  }
  const raw = overrides['architect_max_tokens'];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return envFallback;
  const clamped = Math.max(
    MIN_ARCHITECT_MAX_TOKENS,
    Math.min(MAX_ARCHITECT_MAX_TOKENS, Math.round(raw)),
  );
  return clamped;
}

/**
 * Phase 137-08 (gap closure 2): resolve the max number of architect+QA
 * iterations for a single job.
 *
 * Precedence (first wins):
 *   1. job.config_overrides.max_qa_iterations (per-job override set by
 *      CatBot retry_intent_job when a previous job failed with
 *      failure_class='qa_rejected').
 *   2. process.env.MAX_QA_ITERATIONS (deploy-wide default, bracket notation
 *      per CLAUDE.md).
 *   3. DEFAULT_MAX_QA_ITERATIONS = 4 — doubles the old hard-coded 2 that
 *      blocked the 137-06 RUN 1 retry despite clear architect-QA convergence.
 *
 * Overrides are clamped to [1, 10] and rounded to the nearest integer.
 */
export function resolveMaxQaIterations(
  configOverridesJson: string | null | undefined,
): number {
  const envValue = process['env']['MAX_QA_ITERATIONS'];
  const envNum = envValue ? Number.parseInt(envValue, 10) : NaN;
  const envFallback = Number.isFinite(envNum) && envNum > 0 ? envNum : DEFAULT_MAX_QA_ITERATIONS;

  let candidate = envFallback;
  if (configOverridesJson) {
    try {
      const parsed: unknown = JSON.parse(configOverridesJson);
      if (parsed && typeof parsed === 'object') {
        const raw = (parsed as Record<string, unknown>)['max_qa_iterations'];
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          candidate = raw;
        }
      }
    } catch {
      /* fall through to envFallback */
    }
  }

  const rounded = Math.round(candidate);
  return Math.max(
    MIN_MAX_QA_ITERATIONS,
    Math.min(MAX_MAX_QA_ITERATIONS, rounded),
  );
}

export interface ArchitectParseResult {
  parsed: unknown;
  repair_applied: boolean;
}

/**
 * Parse the architect LLM output with graceful degradation.
 *
 * Strategy:
 *   1. Strip markdown fences (LLMs sometimes wrap JSON in ```json ... ```).
 *   2. Try JSON.parse on the stripped text.
 *   3. If that throws, run jsonrepair() on the stripped text and try again.
 *      jsonrepair fixes the most common LLM truncation patterns:
 *        - unterminated strings (137-06 RUN 1)
 *        - missing closing braces/brackets
 *        - trailing commas
 *        - single-quoted strings
 *   4. If repair also fails, rethrow the ORIGINAL parse error so upstream
 *      classification (classifyArchitectFailure) sees the authentic
 *      "Unterminated string" / "Unexpected end of JSON" signal.
 */
export function parseArchitectJson(raw: string): ArchitectParseResult {
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  try {
    return { parsed: JSON.parse(stripped), repair_applied: false };
  } catch (originalErr) {
    try {
      const repaired = jsonrepair(stripped);
      return { parsed: JSON.parse(repaired), repair_applied: true };
    } catch {
      throw originalErr;
    }
  }
}
