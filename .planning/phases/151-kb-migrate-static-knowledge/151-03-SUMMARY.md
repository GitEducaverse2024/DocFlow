---
phase: 151-kb-migrate-static-knowledge
plan: 03
subsystem: kb-migration
tags: [kb, knowledge-base, protocols, runtime-prompts, catflow, catbot, migration, prd-fase-3]

# Dependency graph
requires:
  - phase: 149-kb-foundation-bootstrap
    provides: "validate-kb.cjs, frontmatter.schema.json, tag-taxonomy.json"
  - phase: 150-kb-populate-desde-db
    provides: ".docflow-kb/ base structure with resources from DB"
  - phase: 151-kb-migrate-static-knowledge
    provides: "Plan 01 migrated silo A (.planning/knowledge/*.md) + silo B (tag taxonomy extension); Plan 02 migrated silo D (app/data/knowledge/*.json) + silo E (other static refs)"
provides:
  - ".docflow-kb/protocols/orquestador-catflow.md (14 PARTES skill orquestador, 912 lines)"
  - ".docflow-kb/runtime/strategist.prompt.md (pipeline strategist prompt, verbatim)"
  - ".docflow-kb/runtime/decomposer.prompt.md (pipeline decomposer prompt, verbatim)"
  - ".docflow-kb/runtime/architect.prompt.md (pipeline architect prompt, verbatim, {{RULES_INDEX}} preserved)"
  - ".docflow-kb/runtime/canvas-qa.prompt.md (reviewer role-aware v135 prompt, verbatim)"
  - ".docflow-kb/runtime/agent-autofix.prompt.md (canvas-auto-repair.ts runtime prompt, verbatim)"
  - "Redirect stub at top of skill_orquestador_catbot_enriched.md (original content preserved)"
  - "Migration log at .planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-03.md"
affects:
  - 152-kb-catbot-consume  # loadPrompt() refactor will consume these KB files
  - 154-kb-dashboard       # dashboard indexes runtime/ and protocols/
  - 155-kb-cleanup-final   # owns physical deletion of skill_orquestador root file

# Tech tracking
tech-stack:
  added: []  # No new libraries — pure documentation migration
  patterns:
    - "4-backtick markdown fence for prompts containing embedded triple-backtick code blocks (architect.prompt.md)"
    - "source_of_truth pointing to typescript export (source/path/export shape) for runtime/*.prompt.md"
    - "Redirect stub prepended (not replaced) preserves original until Phase 155"
    - "Migration log lives OUTSIDE .docflow-kb/ (phase dir) — validate-kb.cjs walks all .md inside KB"

key-files:
  created:
    - .docflow-kb/protocols/orquestador-catflow.md
    - .docflow-kb/runtime/strategist.prompt.md
    - .docflow-kb/runtime/decomposer.prompt.md
    - .docflow-kb/runtime/architect.prompt.md
    - .docflow-kb/runtime/canvas-qa.prompt.md
    - .docflow-kb/runtime/agent-autofix.prompt.md
    - .planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-03.md
  modified:
    - skill_orquestador_catbot_enriched.md  # redirect stub prepended

key-decisions:
  - "app/src/lib/services/catbot-pipeline-prompts.ts NOT modified by this plan — Phase 152 owns loadPrompt() refactor. KB copies are parallel reads until then; source_of_truth frontmatter points back to TS export for traceability"
  - "Architect prompt uses 4-backtick markdown fence (not triple) because body contains embedded ```json/```text blocks for iterator pattern and JSON output schema — 3-backtick would break Markdown rendering. Documented in change_log of the file and in migration log"
  - "Body extraction via Node regex `/export const (\\w+)_PROMPT = \\`([\\s\\S]*?)\\`;/g` with escaped-backtick unescape (`\\\\\\`` → `\\``). All 5 prompt bodies verified BYTE-IDENTICAL to originals via Node fs.readFileSync diff after write"
  - "Skill protocol frontmatter version: 2.0.0 (not 1.0.0) — preserves semver of source skill (\"Version 2.0 — Marzo 2026\" at top of original). The H1 \"# SKILL: ...\" and the \"## Version 2.0 ...\" line are dropped (their content now lives in frontmatter); DESCRIPCION and all 14 PARTES preserved byte-identical in body"
  - "Migration log at .planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-03.md (NOT inside .docflow-kb/) — validate-kb.cjs walks dotfiles and requires frontmatter on every .md inside KB. Identical rationale as Plans 01/02"

patterns-established:
  - "Pattern: 4-backtick fence for verbatim prompts with embedded code blocks — future runtime/*.prompt.md files that carry embedded fenced code (JSON schemas, iterator patterns) should use ```` fences"
  - "Pattern: source_of_truth item shape for TS-sourced prompts — `{source: typescript, path: <relative>, export: <NAME>}` (permissive per validate-kb.cjs; semantic contract lives in the field regardless of strict item schema)"
  - "Pattern: verbatim-extraction verification — compare (kb-extracted body) === (tmp-file body) byte-for-byte before committing; if mismatch, first-diff-byte reporter helps locate it"
  - "Pattern: NON-MODIFICATION invariant verified via `git diff --quiet <file>` in plan verification (exit 0 = no change). This locks the contract with downstream consumers (IntentJobExecutor, canvas-auto-repair.ts) until Phase 152 explicitly refactors"

requirements-completed: [KB-12, KB-13, KB-14]

# Metrics
duration: 4min
completed: 2026-04-20
---

# Phase 151 Plan 03: KB Migrate Static Knowledge — Silos C + F Summary

**Migrated 890-line skill orquestador protocol + 5 pipeline system prompts (strategist/decomposer/architect/canvas-qa/agent-autofix) from repo-root file + hardcoded TS constants into 6 validated KB atoms, preserving body bytes and leaving catbot-pipeline-prompts.ts byte-identical for Phase 152 to refactor.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-20T08:57:20Z
- **Completed:** 2026-04-20T09:01:25Z
- **Tasks:** 2
- **Files created:** 7 (6 KB atoms + 1 migration log)
- **Files modified:** 1 (skill_orquestador_catbot_enriched.md → redirect stub prepended)

## Accomplishments

- **Silo F migrated:** 5 runtime prompt atoms extracted from `app/src/lib/services/catbot-pipeline-prompts.ts` (STRATEGIST, DECOMPOSER, ARCHITECT, CANVAS_QA, AGENT_AUTOFIX). Each body byte-identical to the TS template literal. `{{RULES_INDEX}}` placeholder preserved in architect + canvas-qa. TS file NOT modified.
- **Silo C migrated:** skill orquestador (14 PARTES, 890 lines) migrated to `.docflow-kb/protocols/orquestador-catflow.md` (912 lines total with frontmatter), version 2.0.0. Original file in repo root received redirect stub (Phase 155 owns physical deletion).
- **KB validator green:** 127 files pass `validate-kb.cjs` (120 from Plans 149/150/151-01/02 + 7 new = 127). No schema violations, no taxonomy violations.
- **NON-MODIFICATION invariant verified:** `git diff --stat app/src/lib/services/catbot-pipeline-prompts.ts` is empty — Phase 152's contract is intact.
- **Migration log outside KB:** `.planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-03.md` documents the 2→6 mapping with invariant checks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract 5 prompts VERBATIM from catbot-pipeline-prompts.ts** — `2a716ce` (feat)
2. **Task 2: Migrate skill orquestador + redirect stub + migration log** — `0ed3c46` (feat)

**Plan metadata commit:** (created after this SUMMARY.md is written)

## Files Created/Modified

**Created:**

- `.docflow-kb/runtime/strategist.prompt.md` — pipeline fase 1, JSON {goal, success_criteria, estimated_steps}
- `.docflow-kb/runtime/decomposer.prompt.md` — pipeline fase 2, parte goal en 3-8 tareas atomicas
- `.docflow-kb/runtime/architect.prompt.md` — pipeline fase 3, canvas ejecutable con `{{RULES_INDEX}}` placeholder; uses 4-backtick fence
- `.docflow-kb/runtime/canvas-qa.prompt.md` — reviewer role-aware v135 con scope por rol para R10
- `.docflow-kb/runtime/agent-autofix.prompt.md` — canvas-auto-repair.ts runtime fix prompt
- `.docflow-kb/protocols/orquestador-catflow.md` — 912 lines, 14 PARTES, skill orquestador v2.0.0
- `.planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-03.md` — 2→6 mapping

**Modified:**

- `skill_orquestador_catbot_enriched.md` — redirect stub (8 lines) prepended; 890 lines original preserved below

**Untouched (critical contract):**

- `app/src/lib/services/catbot-pipeline-prompts.ts` — `git diff --quiet` passes. Phase 152 will refactor from "hardcoded" to `loadPrompt()`.

## Decisions Made

- **TS file not modified:** The plan explicitly separates "extract to KB" (this plan) from "switch code to load from KB" (Phase 152). Keeping the TS file byte-identical means `IntentJobExecutor` and `canvas-auto-repair.ts` have zero behavior change, and Phase 152 can be audited as a pure refactor.
- **4-backtick fence for architect body:** The prompt contains embedded triple-backtick fences (iterator pattern + JSON output schema). A 3-backtick outer fence would close prematurely and break rendering. Documented in file change_log and in migration log.
- **source_of_truth item shape `{source, path, export}`:** validate-kb.cjs does NOT enforce item-level shape for `source_of_truth` arrays (it only checks the top-level is null-or-array). The schema's `$ref`-style item contract `{db, id}` is db-resource-oriented; for TS-exported prompts, using `{source: typescript, path: <path>, export: <NAME>}` preserves the semantic contract until AJV is added to the repo.
- **Frontmatter version 2.0.0 for skill:** Source file starts with "Version 2.0 — Marzo 2026". Starting at 1.0.0 would erase the history. 2.0.0 continuity lets a future bump (e.g., 2.1.0 in Phase 155) reflect real evolution.
- **H1 rename in protocol body:** Original line 1 is `# SKILL: Orquestador Inteligente DoCatFlow` + line 2 `## Version 2.0 — Marzo 2026`. Both are dropped (metadata now in frontmatter) and the body now opens with `# Orquestador Inteligente DoCatFlow` + blank line + DESCRIPCION block + `## PARTE 1` ... `## PARTE 14`. DESCRIPCION and all 14 PARTES preserved byte-identical.

## Deviations from Plan

None — plan executed exactly as written.

Two minor interpretive decisions (documented above under "Decisions Made"):
1. Preserved DESCRIPCION block in protocol body (plan said "Start body with # Orquestador... then immediately ## PARTE 1"; strict reading would drop DESCRIPCION, but DESCRIPCION is ~15 lines of context that summary+tags cannot replace — preserved as intermediate content between H1 and PARTE 1).
2. Used 4-backtick fence for architect body when plan's example shows a 3-backtick fence. The plan notes "Preserve: All escaped backticks" and "All embedded JSON blocks" — a 3-backtick fence cannot contain embedded 3-backtick fences without breaking Markdown. 4-backtick is the minimal safe choice. Documented in the file's `change_log`.

## Issues Encountered

None.

## User Setup Required

None — pure documentation migration, no external service changes.

## Next Phase Readiness

**Ready for Plan 151-04** (audit of all migrations). 151-04 will:
- Cross-reference Plans 01/02/03 redirect stubs
- Verify `loadPrompt()` placeholder integrity
- Run consolidated validate-kb.cjs pass
- Generate 151-VERIFICATION.md with CatBot oracle evidence

**Ready for Phase 152** (KB CatBot Consume):
- Phase 152 can now implement `loadPrompt(name: string)` in `catbot-pipeline-prompts.ts` (or a new `prompt-loader.ts`) that reads from `.docflow-kb/runtime/<name>.prompt.md`, strips frontmatter, and extracts the body from inside the text/4-backtick fence.
- Phase 152 must preserve `{{RULES_INDEX}}` substitution at call-time (IntentJobExecutor contract).
- After Phase 152 lands, Phase 151 Plan 03's KB copies stop being "parallel reads" and become the source of truth; the TS constants become thin wrappers (or get deleted).

**Ready for Phase 155** (cleanup final):
- Physical deletion of `skill_orquestador_catbot_enriched.md` from repo root (content safe in KB since this plan).

---

## Self-Check

Verifying claims before finalizing:

**Files exist:**
- FOUND: `.docflow-kb/runtime/strategist.prompt.md`
- FOUND: `.docflow-kb/runtime/decomposer.prompt.md`
- FOUND: `.docflow-kb/runtime/architect.prompt.md`
- FOUND: `.docflow-kb/runtime/canvas-qa.prompt.md`
- FOUND: `.docflow-kb/runtime/agent-autofix.prompt.md`
- FOUND: `.docflow-kb/protocols/orquestador-catflow.md`
- FOUND: `.planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-03.md`

**Commits exist:**
- FOUND: `2a716ce` (Task 1)
- FOUND: `0ed3c46` (Task 2)

**Critical invariants:**
- FOUND: `app/src/lib/services/catbot-pipeline-prompts.ts` BYTE-IDENTICAL (git diff --quiet passes)
- FOUND: `{{RULES_INDEX}}` preserved in architect.prompt.md (4 occurrences)
- FOUND: 14 PARTES preserved in orquestador-catflow.md
- FOUND: validate-kb.cjs exit 0 (127 files)
- FOUND: Migration log OUTSIDE .docflow-kb/ (0 dotfiles inside)

## Self-Check: PASSED

---
*Phase: 151-kb-migrate-static-knowledge*
*Completed: 2026-04-20*
