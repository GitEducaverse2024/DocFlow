---
phase: 135-architect-prompt-layer-arch-prompt
plan: 02
subsystem: catbot-pipeline-prompts
tags: [arch-prompt, architect, role-taxonomy, heartbeat, tdd, phase-135]
requirements:
  - ARCH-PROMPT-01
  - ARCH-PROMPT-02
  - ARCH-PROMPT-03
  - ARCH-PROMPT-04
  - ARCH-PROMPT-05
  - ARCH-PROMPT-06
  - ARCH-PROMPT-07
  - ARCH-PROMPT-08
  - ARCH-PROMPT-09
dependency_graph:
  requires:
    - ROLE_TAXONOMY constant (canvas-flow-designer.ts, plan 135-01)
    - scanCanvasResources enriched shape (plan 134-03)
    - canvas-connector-contracts module (plan 134-01)
    - canvas-rules-index.md scope annotations (plan 134-02)
  provides:
    - ARCHITECT_PROMPT v135 with 7-section heartbeat structure
    - needs_cat_paws 5-field schema {name, mode, system_prompt, skills_sugeridas, conectores_necesarios}
    - data.role requirement (matches ROLE_TAXONOMY) for downstream QA role-aware rule application
  affects:
    - plan 135-03 qa-role-aware-and-wiring (CANVAS_QA_PROMPT will consume data.role + apply R10 conditionally; wires validateCanvasDeterministic as pre-LLM gate)
    - runtime LLM behaviour during next pipeline run after docker rebuild (architect will emit role + respect paw_id UUIDs)
tech_stack:
  added: []
  patterns:
    - "TDD RED -> GREEN (failing structural tests first, prompt rewrite second)"
    - "Prompt-as-code structural tests (regex/section split) as regression guard"
    - "Section markers ## N. for machine-parseable subdivision"
    - "Few-shot MALO->BUENO with real failure cases (holded-q1)"
key_files:
  created: []
  modified:
    - app/src/lib/services/catbot-pipeline-prompts.ts
    - app/src/lib/__tests__/catbot-pipeline-prompts.test.ts
decisions:
  - "ARCHITECT_PROMPT structure is section-based with ## N. markers to allow both LLM heartbeat compliance and machine-level test assertions per section"
  - "Fabricated agentId anti-pattern uses the literal holded-q1 failure string 'analista-financiero-ia' so the few-shot teaches the exact real-world mistake, not a hypothetical"
  - "DA01-DA04 anti-patterns kept as a short reminder block after Section 7 (not repeated inline per task) — the rules index is the authoritative source, the reminder is a safety net"
  - "Output JSON schema enumerates ALL VALID_NODE_TYPES in the type field (agent|connector|iterator|...|output) so the prompt stays self-contained and doesn't rely on the LLM remembering plan-01 constants"
  - "needs_rule_details expansion pass kept (QA2-02 feature from Phase 132) — Section 7 still documents it because intent-job-executor.ts line 430 still runs the two-pass loop"
  - "CANVAS_QA_PROMPT deliberately untouched — plan 135-03 owns the role-aware reviewer rewrite"
metrics:
  duration_min: 5
  tasks: 1
  files_touched: 2
  tests_added: 12
  completed: 2026-04-11
---

# Phase 135 Plan 02: Architect Prompt Rewrite Summary

**One-liner:** ARCHITECT_PROMPT rebuilt as a 7-section heartbeat with role taxonomy, emitter-vs-agent few-shot, fabricated-slug anti-pattern, and needs_cat_paws 5-field schema — closes 9 of 14 ARCH-PROMPT requirements via TDD with 12 new structural tests.

## What shipped

1. **ARCHITECT_PROMPT (lines ~26-170 of catbot-pipeline-prompts.ts)** — full replacement of the Phase 132 version. New structure:
   - **Section 1 — Input inventory:** enumerates `goal`, `tasks`, `resources.catPaws`, `resources.connectors`, `resources.skills`, `resources.canvas_similar`, `resources.templates`, `qa_report`/`previous_design`. Explicit "NUNCA inventes paw_id" clause.
   - **Section 2 — Role taxonomy:** 7 roles (extractor/transformer/synthesizer/renderer/emitter/guard/reporter) with one-line semantics each. Notes that the QA reviewer applies R10 only to transformer/synthesizer.
   - **Section 3 — Heartbeat checklist (6 steps):** clasifica rol → contract lookup si emitter → iterator si array>1 → buscar paw_id real si agent → validar cadena de datos (R13) → fallback needs_cat_paws con placeholder vacío.
   - **Section 4 — Copy-paste templates:** INPUT/PROCESO/OUTPUT blocks for transformer, renderer, emitter with explicit R10/contract/side-effect rules.
   - **Section 5 — Few-shot MALO→BUENO:** two concrete cases. Caso 1: emitter-as-agent (Gmail sender wrongly typed as `agent`). Caso 2: fabricated `analista-financiero-ia` slug (the exact holded-q1 soft gap), with two BUENO branches (opción A: real paw_id; opción B: needs_cat_paws).
   - **Section 6 — Iterator pattern:** copy-paste JSON fragment with iterator+body nodes + forward/back edges.
   - **Section 7 — Rules index:** `{{RULES_INDEX}}` placeholder + needs_rule_details expansion pass documentation (preserved from QA2-02).
   - **Output schema:** JSON now requires `data.role` per node with enum listing all 7 roles; `needs_cat_paws[]` with 5 fields `{name, mode, system_prompt, skills_sugeridas, conectores_necesarios}` replacing the old 3-field shape; `needs_rule_details[]` preserved.

2. **12 new unit tests** in `catbot-pipeline-prompts.test.ts` (new describe block `ARCHITECT_PROMPT v135 (ARCH-PROMPT-01..09)`):
   - 7 section markers present (`## 1.` … `## 7.`)
   - Section 1 enumerates input fields (parsed via `split(/^## 2\./m)`)
   - Section 2 contains all 7 ROLE_TAXONOMY entries (imported from canvas-flow-designer)
   - Section 3 covers the 6 heartbeat keywords
   - Section 4 has INPUT/PROCESO/OUTPUT + transformer/renderer/emitter
   - Section 5 has ≥2 MALO and ≥2 BUENO + emitter near MALO
   - Section 5 contains the literal `analista-financiero-ia` anti-pattern
   - Section 6 has iterator + nodes + edges
   - Section 7 keeps `{{RULES_INDEX}}`
   - JSON schema requires `data.role` and lists all 7 roles
   - needs_cat_paws 5-field schema present
   - Explicit prohibition on inventing paw_id slugs
   - Exactly one `{{RULES_INDEX}}` inside ARCHITECT_PROMPT string

## Task-by-task

### Task 1 — Rewrite ARCHITECT_PROMPT + structural tests (TDD)

**RED (commit `8856edb`):**
- Added `import { ROLE_TAXONOMY }` to test file.
- Added the 12-test `ARCHITECT_PROMPT v135 (ARCH-PROMPT-01..09)` describe block before the `AGENT_AUTOFIX_PROMPT` block.
- Ran vitest: **12 failed, 19 passed** (31 total) — exactly the new tests failing. RED confirmed.

**GREEN (commit `2e4ed37`):**
- Replaced the Phase 132 ARCHITECT_PROMPT body (lines 26-73) with the 7-section heartbeat structure.
- Preserved STRATEGIST_PROMPT, DECOMPOSER_PROMPT, CANVAS_QA_PROMPT, AGENT_AUTOFIX_PROMPT unchanged.
- Kept `{{RULES_INDEX}}` literal placeholder (Section 7) — intent-job-executor.ts line 430 still runs `.replace('{{RULES_INDEX}}', rulesIndex)`.
- Ran vitest: **31/31 green** including the 19 existing Phase 132 ARCHITECT_PROMPT tests (QA2-02 `needs_rule_details`, QA2-03 DA01-DA04, etc.) which all still hold because the new prompt is a superset.

No REFACTOR needed — the rewrite was already structured.

## Verification evidence

```
 Test Files  1 passed (1)
      Tests  31 passed (31)
```

Related-suite regression check (run after GREEN):
```
 Test Files  2 passed (2)
      Tests  107 passed (107)
```
(`intent-job-executor.test.ts` + `canvas-flow-designer.test.ts` — both unaffected by the prompt rewrite, as expected.)

- `grep -c "^## [1-7]\." app/src/lib/services/catbot-pipeline-prompts.ts` → **7** (exactly one marker per section)
- `grep -n "RULES_INDEX" app/src/lib/services/catbot-pipeline-prompts.ts` → 3 matches: line 6 (comment), line 127 (inside ARCHITECT_PROMPT Section 7), line 179 (inside CANVAS_QA_PROMPT). Inside ARCHITECT_PROMPT string itself: exactly 1, asserted by the `keeps exactly one {{RULES_INDEX}} placeholder` test.
- `git diff HEAD~2 CANVAS_QA_PROMPT` → zero hits. CANVAS_QA_PROMPT untouched as required by plan 03 boundary.

## Must-haves checklist

- [x] ARCHITECT_PROMPT contains 7 numbered sections (disponibilidad / taxonomía / heartbeat / plantillas / few-shot / iterator / rules index)
- [x] Section 1 enumerates goal, tasks, resources.{catPaws, connectors, skills, canvas_similar, templates}
- [x] Section 2 lists the 7 ROLE_TAXONOMY roles
- [x] Section 3 describes the 6-step heartbeat checklist
- [x] Section 4 contains INPUT/PROCESO/OUTPUT templates for transformer, renderer, emitter
- [x] Section 5 contains ≥2 MALO→BUENO pairs including emitter-as-agent
- [x] Section 5 covers the fabricated `analista-financiero-ia` slug anti-pattern
- [x] Section 6 contains iterator flow_data template literal
- [x] Section 7 keeps `{{RULES_INDEX}}` placeholder
- [x] JSON schema requires `data.role` in each node
- [x] JSON schema declares `needs_cat_paws[{name, mode, system_prompt, skills_sugeridas, conectores_necesarios}]`
- [x] Prohibits inventing paw_id slugs explicitly
- [x] All 31 tests (19 existing + 12 new) green

## Deviations from Plan

None substantive — plan executed as written.

Two micro-adjustments (kept inside plan intent):
1. Added a short "Anti-patterns a recordar (DA01-DA04)" block between Section 7 and the output schema. The plan did not require it, but removing DA01-DA04 entirely would have broken the existing Phase 132 test `references anti-patterns DA01-DA04` which is still green and asserts the prompt continues to name the anti-patterns. Kept as a compact reminder block (4 lines) to preserve backward compatibility without cluttering the 7 sections.
2. Output schema `type` field lists all VALID_NODE_TYPES instead of only the canonical 6 shown in the plan draft — this makes the prompt self-contained and prevents the LLM from pruning valid node types (catbrain, multiagent, scheduler, checkpoint, storage, merge, output) that Phase 132 already supported.

## Authentication gates

None.

## Commits

| Task | Phase  | Hash      | Message                                                                                   |
| ---- | ------ | --------- | ------------------------------------------------------------------------------------------ |
| 1    | RED    | `8856edb` | test(135-02): add failing tests for ARCHITECT_PROMPT v135 7-section structure               |
| 1    | GREEN  | `2e4ed37` | feat(135-02): rewrite ARCHITECT_PROMPT into 7-section heartbeat structure                   |

## Self-Check: PASSED

- FOUND: `app/src/lib/services/catbot-pipeline-prompts.ts` (modified; 7-section ARCHITECT_PROMPT present; CANVAS_QA_PROMPT byte-identical)
- FOUND: `app/src/lib/__tests__/catbot-pipeline-prompts.test.ts` (modified; new describe block + ROLE_TAXONOMY import)
- FOUND commit: `8856edb` (RED)
- FOUND commit: `2e4ed37` (GREEN)
- 31/31 tests passing in catbot-pipeline-prompts.test.ts
- 107/107 tests passing across intent-job-executor + canvas-flow-designer (zero regression)
