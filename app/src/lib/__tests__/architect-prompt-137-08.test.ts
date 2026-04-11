import { describe, it, expect } from 'vitest';
import { ARCHITECT_PROMPT } from '@/lib/services/catbot-pipeline-prompts';

// ---------------------------------------------------------------------------
// Phase 137-08 Task 3 RED: architect prompt R01/R10/R15 reinforcement.
//
// The 137-06 RUN 1 retry failed with "QA loop exhausted" because the QA
// reviewer repeatedly flagged R01 (extractor nodes missing explicit JSON
// schemas in their OUTPUT instructions) and R15 (renderer receiving raw
// unfiltered data). With the iteration budget bumped (Task 2) the loop will
// survive longer, but we also want the architect to hit those invariants on
// the first try. This test enforces the directives are present in the
// system prompt so a future refactor cannot silently drop them.
// ---------------------------------------------------------------------------

describe('ARCHITECT_PROMPT — Phase 137-08 R01/R10/R15 reinforcement', () => {
  it('contains an explicit R01 directive for extractor OUTPUT schemas', () => {
    expect(ARCHITECT_PROMPT).toMatch(/R01/);
    // Must demand explicit JSON schema in the OUTPUT section of extractor
    // instructions, in Spanish per project convention.
    expect(ARCHITECT_PROMPT).toMatch(
      /extractor.*DEBE\s+declarar\s+explicitamente\s+el\s+esquema\s+JSON/is,
    );
  });

  it('contains a concrete R01-compliant extractor OUTPUT example', () => {
    // A fenced block showing an OUTPUT with an explicit JSON schema so the
    // LLM has a copyable template.
    expect(ARCHITECT_PROMPT).toMatch(/### extractor/);
    expect(ARCHITECT_PROMPT).toMatch(/OUTPUT.*\{[^}]*\bitems\[\]|schema/is);
  });

  it('contains an R15 directive for renderer filtering', () => {
    expect(ARCHITECT_PROMPT).toMatch(/R15/);
    expect(ARCHITECT_PROMPT).toMatch(
      /renderer\s+DEBE\s+recibir\s+SOLO\s+los\s+campos\s+minimos/is,
    );
  });

  it('contains an R10 reminder for synthesizer OUTPUT preservation', () => {
    expect(ARCHITECT_PROMPT).toMatch(/R10/);
    expect(ARCHITECT_PROMPT).toMatch(
      /synthesizer.*DEBEN\s+preservar\s+los\s+campos\s+de\s+entrada/is,
    );
  });
});
