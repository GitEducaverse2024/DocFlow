---
phase: 132-canvas-qa-loop-architect-con-auto-review-rules-index-y-side-effect-guards
plan: 01
subsystem: canvas/pipeline-architect
tags: [canvas, rules-index, architect, qa-loop, knowledge-tree]
requirements: [QA2-01, QA2-02]
dependency_graph:
  requires: []
  provides:
    - "loadRulesIndex() -> rules index markdown string"
    - "getCanvasRule(id) -> RuleDetail (R01-R25, SE01-SE03, DA01-DA04)"
    - "app/data/knowledge/canvas-rules-index.md (32 rules, <=100 chars/line)"
  affects:
    - "Plan 132-02 (ARCHITECT_PROMPT rewrite, QA reviewer)"
    - "Plan 132-03 (QA loop wiring in IntentJobExecutor)"
tech-stack:
  added: []
  patterns:
    - "Module-level cache with test seam (_resetCache)"
    - "Multi-candidate path resolution (Docker cwd=/app vs local cwd=app)"
    - "ES2017-compatible dotall via [\\s\\S] (no /s flag)"
    - "Category classifier by ID prefix + number lookup"
key-files:
  created:
    - app/data/knowledge/canvas-rules-index.md
    - app/src/lib/services/canvas-rules.ts
    - app/src/lib/__tests__/canvas-rules.test.ts
    - .planning/phases/132-canvas-qa-loop-architect-con-auto-review-rules-index-y-side-effect-guards/deferred-items.md
  modified:
    - app/data/knowledge/catflow.json
    - app/data/knowledge/_index.json
    - .gitignore
decisions:
  - "Dual-source lookup: R01-R25 long form from .planning/knowledge/canvas-nodes-catalog.md; SE/DA from index itself (no catalog entries exist yet)"
  - "Path resolution tries multiple candidates instead of hardcoding — works in Docker (/app) and local dev (cwd=app)"
  - "Regex rewritten without /s flag ([\\s\\S]+? instead of .+?) to satisfy ES2017 tsconfig target — /s flag requires ES2018+"
  - "Fallback synthesis: if catalog parse fails for any R-rule, module falls back to the short index form so getCanvasRule still returns non-null for all 32 rules"
  - "Case-insensitive lookup via .toUpperCase() — tests accept 'r01' as valid input"
  - "Pre-existing knowledge-tree.test.ts failures (catboard.json datetime drift) logged to deferred-items.md — out of Plan 01 scope"
metrics:
  duration_seconds: 395
  tasks_completed: 3
  tests_added: 12
  tests_passing: 12
  files_created: 4
  files_modified: 3
  completed: "2026-04-11T00:00:42Z"
---

# Phase 132 Plan 01: Rules Index Infrastructure Summary

Infraestructura de rules index para el Pipeline Architect: markdown editable con 32 reglas (R01-R25 + SE01-SE03 + DA01-DA04) + módulo TypeScript que lo carga con cache y expande reglas individuales on-demand desde el catálogo.

## What Was Built

### canvas-rules-index.md (32 rules, ~1.7KB)

Editable markdown at `app/data/knowledge/canvas-rules-index.md` agrupado en 9 secciones:

- Data Contracts (R01, R10, R13, R15, R16)
- Node Responsibilities (R05, R06, R07, R08, R09, R20, R21, R23)
- Arrays & Loops (R02, R14, R25)
- Instructions Writing (R11, R12, R17)
- Planning & Testing (R03, R04)
- Templates (R18, R19)
- Resilience & References (R22, R24)
- Side Effects Guards — **new category** (SE01, SE02, SE03)
- Anti-patterns — **new category** (DA01, DA02, DA03, DA04)

Each rule line is `- RID: description` with description verified ≤100 chars.

### canvas-rules.ts (~170 lines)

Module at `app/src/lib/services/canvas-rules.ts` exporting:

```typescript
export interface RuleDetail {
  id: string;
  short: string;       // <=100 chars from index
  long: string;        // full paragraph from catalog (R01-R25) or short (SE/DA)
  category: RuleCategory;
}

export function loadRulesIndex(): string;
export function getCanvasRule(ruleId: string): RuleDetail | null;
export function _resetCache(): void;
```

Implementation details:
- Module-level cache (`cachedIndex`, `cachedRules`) populated on first call.
- `parseRules()` extracts R01-R25 long form from `.planning/knowledge/canvas-nodes-catalog.md` via regex `/- \*\*(R\d{2})\*\*\s*([\s\S]+?)(?=\n- \*\*R\d{2}|\n\n|\n##|$)/g`.
- SE01-SE03 and DA01-DA04 parsed from the index file (no long form available yet).
- Fallback branch: any R-rule missing from the catalog parse is synthesized from the index short line.
- `categorize(id)` classifies by prefix (SE/DA) or number set lookup.
- `_resetCache()` test seam for unit isolation.

### catflow.json knowledge tree updates

Added 9 new concept entries:
- SE01-SE03 (Side Effects Guards)
- DA01-DA04 (Anti-patterns)
- 2 meta-entries describing the rules index architecture and `getCanvasRule` lookup

Updated `sources` to include canvas-rules-index.md, canvas-nodes-catalog.md, and 132-RESEARCH.md. Bumped `updated_at` in both `catflow.json` and `_index.json` to 2026-04-10.

## Test Results

**New tests:** 12 (all passing)

| Suite | Tests | Description |
|---|---|---|
| `loadRulesIndex (QA2-01)` | 5 | loads markdown, >=25 rules, <=100 chars/line, contains expected groups, caches |
| `getCanvasRule (QA2-02)` | 7 | R01/R10/R13/R25 detail + category, SE01-SE03 side_effects, DA01-DA04 anti_patterns, null on unknown, case-insensitive |

**Build:** `cd app && npm run build` passes (after regex rewrite for ES2017 compatibility).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Regex /s flag incompatible with ES2017 tsconfig target**
- **Found during:** Task 2 build verification
- **Issue:** Initial implementation used `/- \*\*(R\d{2})\*\*\s*(.+?)(?=...)/gs` with dotall flag, which failed `next build` with `Type error: This regular expression flag is only available when targeting 'es2018' or later`.
- **Fix:** Replaced `.+?` with `[\s\S]+?` and removed `s` flag — functionally equivalent on ES2017.
- **Files modified:** app/src/lib/services/canvas-rules.ts
- **Commit:** f2f27c3

**2. [Rule 3 - Blocking] R01 index line exceeded 100 chars**
- **Found during:** Task 2 index file length validation
- **Issue:** Verbatim line from 132-RESEARCH.md ("Define contrato JSON (input/output fields) entre TODOS los pares de nodos ANTES de instructions") measured 102 chars including `- R01: ` prefix.
- **Fix:** Tightened wording to "Define contrato JSON (input/output) entre TODOS pares de nodos ANTES de instructions" (98 chars total).
- **Files modified:** app/data/knowledge/canvas-rules-index.md
- **Commit:** f2f27c3

**3. [Rule 3 - Blocking] .gitignore excluded .md files under app/data/knowledge/**
- **Found during:** Task 2 staging
- **Issue:** `app/data/` was ignored with `!app/data/knowledge/` intended to re-include, but git's directory-exclude rule blocks file re-includes when the parent directory is matched. New `.md` files were silently ignored (previously only tracked `.json` was coincidentally not blocked because the rule matches directories first).
- **Fix:** Changed pattern from `app/data/` to `app/data/*` so the re-include `!app/data/knowledge/` properly takes effect, and updated comment to note both JSON and Markdown are versionable.
- **Files modified:** .gitignore
- **Commit:** f2f27c3

**4. [Rule 3 - Blocking] _index.json updated_at drift**
- **Found during:** Task 3 verification
- **Issue:** Bumping catflow.json updated_at to 2026-04-10 broke `knowledge-tree.test.ts` assertion requiring `_index.json` areas[].updated_at to match individual JSON.
- **Fix:** Also bumped catflow entry in `_index.json` to 2026-04-10.
- **Files modified:** app/data/knowledge/_index.json
- **Commit:** db77015

### Deferred Issues (Out of Scope)

See `.planning/phases/132-canvas-qa-loop-architect-con-auto-review-rules-index-y-side-effect-guards/deferred-items.md`:

**knowledge-tree.test.ts — 2 pre-existing failures** unrelated to Plan 01:
- catboard.json `updated_at` uses full ISO datetime (`2026-04-10T20:10:00Z`) instead of date-only (`2026-04-10`), failing the regex check.
- Verified via `git stash` on clean HEAD before Plan 132-01 that the 2 failures already existed.

These should be fixed in a dedicated cleanup task, not bundled into Plan 01.

## Path Resolution Notes for Downstream Plans

The `canvas-rules.ts` module uses multi-candidate path resolution to support both environments:

| Environment | cwd | Index path | Catalog path |
|---|---|---|---|
| Local dev / vitest | `~/docflow/app` | `data/knowledge/canvas-rules-index.md` | `../.planning/knowledge/canvas-nodes-catalog.md` |
| Docker container | `/app` | `data/knowledge/canvas-rules-index.md` | `.planning/knowledge/canvas-nodes-catalog.md` (copied into image via docker-entrypoint.sh) |

**Important for Plan 02/03:** If you spawn a new execution context with a different cwd (e.g., a worker thread), pass the absolute path or verify `process.cwd()` matches one of the supported roots. The module prints no warning if the catalog is not found — it falls back to the index short form.

## Commits

- `af9540c` test(132-01): add failing tests for canvas-rules index + lookup
- `f2f27c3` feat(132-01): implement canvas-rules index loader + on-demand lookup
- `db77015` feat(132-01): extend catflow knowledge tree with SE/DA rules + index refs

## Self-Check: PASSED

**Files verified present:**
- FOUND: app/data/knowledge/canvas-rules-index.md
- FOUND: app/src/lib/services/canvas-rules.ts
- FOUND: app/src/lib/__tests__/canvas-rules.test.ts
- FOUND: app/data/knowledge/catflow.json (modified)
- FOUND: app/data/knowledge/_index.json (modified)
- FOUND: .gitignore (modified)
- FOUND: .planning/phases/132-canvas-qa-loop-architect-con-auto-review-rules-index-y-side-effect-guards/deferred-items.md

**Commits verified present:**
- FOUND: af9540c
- FOUND: f2f27c3
- FOUND: db77015

**Tests:** 12/12 passing (`cd app && npx vitest run src/lib/__tests__/canvas-rules.test.ts`)
**Build:** `cd app && npm run build` passes
