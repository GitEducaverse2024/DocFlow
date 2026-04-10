/**
 * Phase 132 Plan 02 — Structural tests for pipeline prompt constants.
 *
 * Covers:
 *   QA2-02 — ARCHITECT_PROMPT documents needs_rule_details expansion pass
 *   QA2-03 — ARCHITECT_PROMPT rewritten with {{RULES_INDEX}} + data contracts + DA01-DA04
 *   QA2-04 — CANVAS_QA_PROMPT defines strict JSON schema
 *   (Plan 03 dep) AGENT_AUTOFIX_PROMPT defines fixed / repair_failed shape
 */

import { describe, it, expect } from 'vitest';
import {
  STRATEGIST_PROMPT,
  DECOMPOSER_PROMPT,
  ARCHITECT_PROMPT,
  CANVAS_QA_PROMPT,
  AGENT_AUTOFIX_PROMPT,
} from '@/lib/services/catbot-pipeline-prompts';

describe('STRATEGIST_PROMPT / DECOMPOSER_PROMPT (unchanged)', () => {
  it('STRATEGIST_PROMPT remains a non-empty export', () => {
    expect(typeof STRATEGIST_PROMPT).toBe('string');
    expect(STRATEGIST_PROMPT.length).toBeGreaterThan(50);
  });

  it('DECOMPOSER_PROMPT remains a non-empty export', () => {
    expect(typeof DECOMPOSER_PROMPT).toBe('string');
    expect(DECOMPOSER_PROMPT.length).toBeGreaterThan(50);
  });
});

describe('ARCHITECT_PROMPT (QA2-03)', () => {
  it('contains {{RULES_INDEX}} placeholder', () => {
    expect(ARCHITECT_PROMPT.includes('{{RULES_INDEX}}')).toBe(true);
  });

  it('requires INPUT/OUTPUT data contracts', () => {
    expect(/INPUT\s*:/.test(ARCHITECT_PROMPT)).toBe(true);
    expect(/OUTPUT\s*:/.test(ARCHITECT_PROMPT)).toBe(true);
  });

  it('references anti-patterns DA01-DA04', () => {
    expect(ARCHITECT_PROMPT.includes('DA01')).toBe(true);
    expect(ARCHITECT_PROMPT.includes('DA02')).toBe(true);
    expect(ARCHITECT_PROMPT.includes('DA03')).toBe(true);
    expect(ARCHITECT_PROMPT.includes('DA04')).toBe(true);
  });

  it('mentions QA review pre-emptively', () => {
    expect(/QA/i.test(ARCHITECT_PROMPT)).toBe(true);
    expect(/review/i.test(ARCHITECT_PROMPT)).toBe(true);
  });

  it('keeps needs_cat_paws escape hatch', () => {
    expect(ARCHITECT_PROMPT.includes('needs_cat_paws')).toBe(true);
  });

  it('response format is JSON with flow_data nodes + edges', () => {
    expect(ARCHITECT_PROMPT.includes('flow_data')).toBe(true);
    expect(ARCHITECT_PROMPT.includes('nodes')).toBe(true);
    expect(ARCHITECT_PROMPT.includes('edges')).toBe(true);
  });

  it('documents needs_rule_details expansion pass (QA2-02)', () => {
    expect(ARCHITECT_PROMPT.includes('needs_rule_details')).toBe(true);
    expect(/expand|expansi|detalle/i.test(ARCHITECT_PROMPT)).toBe(true);
  });
});

describe('CANVAS_QA_PROMPT (QA2-04)', () => {
  it('exists as non-empty export', () => {
    expect(typeof CANVAS_QA_PROMPT).toBe('string');
    expect(CANVAS_QA_PROMPT.length).toBeGreaterThan(100);
  });

  it('contains {{RULES_INDEX}} placeholder', () => {
    expect(CANVAS_QA_PROMPT.includes('{{RULES_INDEX}}')).toBe(true);
  });

  it('declares JSON schema with quality_score, issues, data_contract_analysis, recommendation', () => {
    expect(CANVAS_QA_PROMPT.includes('quality_score')).toBe(true);
    expect(CANVAS_QA_PROMPT.includes('issues')).toBe(true);
    expect(CANVAS_QA_PROMPT.includes('data_contract_analysis')).toBe(true);
    expect(CANVAS_QA_PROMPT.includes('recommendation')).toBe(true);
  });

  it('enumerates severities blocker|major|minor', () => {
    expect(CANVAS_QA_PROMPT.includes('blocker')).toBe(true);
    expect(CANVAS_QA_PROMPT.includes('major')).toBe(true);
    expect(CANVAS_QA_PROMPT.includes('minor')).toBe(true);
  });

  it('enumerates recommendations accept|revise|reject', () => {
    expect(CANVAS_QA_PROMPT.includes('accept')).toBe(true);
    expect(CANVAS_QA_PROMPT.includes('revise')).toBe(true);
    expect(CANVAS_QA_PROMPT.includes('reject')).toBe(true);
  });
});

describe('AGENT_AUTOFIX_PROMPT (Plan 03 dependency)', () => {
  it('exists as non-empty export', () => {
    expect(typeof AGENT_AUTOFIX_PROMPT).toBe('string');
    expect(AGENT_AUTOFIX_PROMPT.length).toBeGreaterThan(100);
  });

  it('declares fixed/repair_failed status field', () => {
    expect(AGENT_AUTOFIX_PROMPT.includes('"status"')).toBe(true);
    expect(AGENT_AUTOFIX_PROMPT.includes('fixed')).toBe(true);
    expect(AGENT_AUTOFIX_PROMPT.includes('repair_failed')).toBe(true);
  });
});
