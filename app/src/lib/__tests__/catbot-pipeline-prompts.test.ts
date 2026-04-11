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
import { ROLE_TAXONOMY } from '@/lib/services/canvas-flow-designer';

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

  it('CANVAS_QA_PROMPT declares data_contract_score field (ARCH-DATA-06)', () => {
    expect(CANVAS_QA_PROMPT).toContain('data_contract_score');
  });

  it('CANVAS_QA_PROMPT documents the deterministic threshold rule (ARCH-DATA-06)', () => {
    // The prompt should reference the code-side rule so the LLM's recommendation
    // stays consistent with decideQaOutcome even though it is not authoritative.
    expect(CANVAS_QA_PROMPT).toMatch(/data_contract_score\s*>=\s*80/);
  });
});

describe('ARCHITECT_PROMPT v135 (ARCH-PROMPT-01..09)', () => {
  it('contains 7 numbered section markers (## 1. through ## 7.)', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      expect(ARCHITECT_PROMPT).toMatch(new RegExp(`^## ${n}\\.`, 'm'));
    }
  });

  it('Section 1 enumerates all input fields (goal, tasks, resources.*)', () => {
    // Isolate Section 1 (between ## 1. and ## 2.)
    const section1 = ARCHITECT_PROMPT.split(/^## 2\./m)[0].split(/^## 1\./m)[1] ?? '';
    expect(section1).toContain('goal');
    expect(section1).toContain('tasks');
    expect(section1).toContain('resources.catPaws');
    expect(section1).toContain('resources.connectors');
    expect(section1).toContain('resources.skills');
    expect(section1).toContain('resources.canvas_similar');
    expect(section1).toContain('resources.templates');
  });

  it('Section 2 lists all 7 ROLE_TAXONOMY roles literally', () => {
    const section2 = ARCHITECT_PROMPT.split(/^## 3\./m)[0].split(/^## 2\./m)[1] ?? '';
    for (const role of ROLE_TAXONOMY) {
      expect(section2).toContain(role);
    }
  });

  it('Section 3 mentions the 6-step heartbeat checklist keywords', () => {
    const section3 = ARCHITECT_PROMPT.split(/^## 4\./m)[0].split(/^## 3\./m)[1] ?? '';
    expect(section3).toMatch(/clasifica rol/i);
    expect(section3).toContain('emitter');
    expect(section3).toMatch(/contract/i);
    expect(section3).toContain('iterator');
    expect(section3).toContain('CatPaw');
    expect(section3).toContain('tools');
    expect(section3).toMatch(/cadena de datos/i);
    expect(section3).toContain('needs_cat_paws');
  });

  it('Section 4 contains INPUT/PROCESO/OUTPUT templates for transformer/renderer/emitter', () => {
    const section4 = ARCHITECT_PROMPT.split(/^## 5\./m)[0].split(/^## 4\./m)[1] ?? '';
    expect(section4).toContain('INPUT:');
    expect(section4).toContain('PROCESO:');
    expect(section4).toContain('OUTPUT:');
    expect(section4).toContain('transformer');
    expect(section4).toContain('renderer');
    expect(section4).toContain('emitter');
  });

  it('Section 5 contains at least two MALO and two BUENO markers including emitter-as-agent', () => {
    const section5 = ARCHITECT_PROMPT.split(/^## 6\./m)[0].split(/^## 5\./m)[1] ?? '';
    const maloCount = (section5.match(/MALO/g) ?? []).length;
    const buenoCount = (section5.match(/BUENO/g) ?? []).length;
    expect(maloCount).toBeGreaterThanOrEqual(2);
    expect(buenoCount).toBeGreaterThanOrEqual(2);
    expect(section5).toContain('emitter');
  });

  it('Section 5 covers the fabricated agentId anti-pattern (analista-financiero-ia)', () => {
    const section5 = ARCHITECT_PROMPT.split(/^## 6\./m)[0].split(/^## 5\./m)[1] ?? '';
    expect(section5).toContain('analista-financiero-ia');
  });

  it('Section 6 contains an iterator JSON fragment with nodes and edges', () => {
    const section6 = ARCHITECT_PROMPT.split(/^## 7\./m)[0].split(/^## 6\./m)[1] ?? '';
    expect(section6).toContain('iterator');
    expect(section6).toContain('nodes');
    expect(section6).toContain('edges');
  });

  it('Section 7 keeps the literal {{RULES_INDEX}} placeholder', () => {
    const section7 = ARCHITECT_PROMPT.split(/^## 7\./m)[1] ?? '';
    expect(section7).toContain('{{RULES_INDEX}}');
  });

  it('JSON output schema requires data.role and lists all 7 roles as allowed values', () => {
    expect(ARCHITECT_PROMPT).toContain('"role"');
    // Role options should appear in the schema (as a pipe-separated enum or similar)
    for (const role of ROLE_TAXONOMY) {
      expect(ARCHITECT_PROMPT).toContain(role);
    }
  });

  it('JSON output schema declares needs_cat_paws with all 5 fields', () => {
    expect(ARCHITECT_PROMPT).toContain('needs_cat_paws');
    expect(ARCHITECT_PROMPT).toContain('name');
    expect(ARCHITECT_PROMPT).toContain('mode');
    expect(ARCHITECT_PROMPT).toContain('system_prompt');
    expect(ARCHITECT_PROMPT).toContain('skills_sugeridas');
    expect(ARCHITECT_PROMPT).toContain('conectores_necesarios');
  });

  it('explicitly forbids inventing paw_id / agentId slugs', () => {
    expect(ARCHITECT_PROMPT).toMatch(/no inventes|NO inventes|prohibido inventar/i);
    expect(ARCHITECT_PROMPT).toContain('paw_id');
  });

  it('keeps exactly one {{RULES_INDEX}} placeholder', () => {
    const matches = ARCHITECT_PROMPT.match(/\{\{RULES_INDEX\}\}/g) ?? [];
    expect(matches.length).toBe(1);
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
