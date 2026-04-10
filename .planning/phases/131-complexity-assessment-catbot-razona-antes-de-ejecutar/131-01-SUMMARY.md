---
phase: 131-complexity-assessment-catbot-razona-antes-de-ejecutar
plan: 01
subsystem: catbot-complexity-gate
tags: [catbot, prompt-assembler, schema, audit, p0, complexity]
requires:
  - catbot-db (existing better-sqlite3 instance)
  - catbot-prompt-assembler.build() pipeline (existing)
provides:
  - complexity_decisions table (audit log of every classification)
  - ComplexityDecisionRow type + 4 CRUD functions
  - buildComplexityProtocol() prompt section (P0)
affects:
  - PromptAssembler.build() now includes complexity_protocol P0 section right after tool_instructions
  - catbot.db schema gains 1 new table + 2 indexes
tech-stack:
  added: []
  patterns:
    - schema appended inside the existing catbotDb.exec template literal (mirrors knowledge_gaps / intent_jobs)
    - dynamic UPDATE field list pattern reused (mirrors updateIntentStatus)
    - vi.hoisted CATBOT_DB_PATH bootstrap reused from catbot-prompt-assembler.test.ts
key-files:
  created:
    - app/src/lib/__tests__/complexity-decisions.test.ts
    - .planning/phases/131-complexity-assessment-catbot-razona-antes-de-ejecutar/131-01-SUMMARY.md
  modified:
    - app/src/lib/catbot-db.ts (schema + 4 CRUD + ComplexityDecisionRow)
    - app/src/lib/services/catbot-prompt-assembler.ts (buildComplexityProtocol + P0 registration)
    - app/src/lib/__tests__/catbot-prompt-assembler.test.ts (7 new tests)
decisions:
  - "Char budget enforced via test (length <= 1200) — final size 1101 chars after one trim pass"
  - "buildComplexityProtocol registered IMMEDIATELY after tool_instructions in build() so it runs before all P1 sections (intent_protocol, complex_task_protocol)"
  - "saveComplexityDecision stores null when messageSnippet is undefined (not empty string), so absent snippets remain queryable"
  - "RESEARCH.md Pattern 1 followed verbatim for CRUD; Pattern 2 trimmed by ~150 chars to fit budget (verbose phrasing tightened, no criteria removed)"
metrics:
  duration_minutes: ~12
  tasks_completed: 3
  files_created: 1
  files_modified: 3
  commits: 3
  tests_added: 15
  tests_total_passing: 82
  protocol_char_count: 1101
  char_budget: 1200
completed: 2026-04-10
---

# Phase 131 Plan 01: Complexity Audit Schema + P0 Prompt Section Summary

complexity_decisions audit table with typed CRUD plus a P0 prompt section that tells CatBot exactly how to classify requests using DocFlow casuisticas, all gated by a 1200-char hard budget.

## What was built

### 1. complexity_decisions table (catbot.db)

New table inside the single `catbotDb.exec(...)` template literal in `app/src/lib/catbot-db.ts`, with two indexes:
- `idx_complexity_user (user_id, created_at DESC)` — for `listComplexityDecisionsByUser`
- `idx_complexity_classification (classification, created_at DESC)` — for the upcoming AlertService check

Columns: `id`, `user_id`, `channel` (default `'web'`), `message_snippet`, `classification`, `reason`, `estimated_duration_s`, `async_path_taken` (default 0), `outcome`, `created_at`.

### 2. CRUD in catbot-db.ts

- `ComplexityDecisionRow` interface (exported)
- `saveComplexityDecision(...)` — uses `generateId()`, truncates `messageSnippet` to 200 chars, `asyncPathTaken` boolean → 0|1
- `updateComplexityOutcome(id, outcome, asyncPathTaken?)` — dynamic UPDATE field list so the async flip is optional
- `listComplexityDecisionsByUser(userId, limit=20)` — DESC order, user-scoped (cross-user isolation verified by test)
- `countComplexTimeoutsLast24h()` — aggregate of `classification='complex' AND async_path_taken=0 AND outcome='timeout' AND created_at > -1 day` (will power Phase 131-04 AlertService check)

### 3. buildComplexityProtocol() — P0 prompt section

New exported function in `app/src/lib/services/catbot-prompt-assembler.ts`. Final size: **1101 chars** (target ≤1200). Contains:

- Header `## Protocolo de Evaluacion de Complejidad (P0)`
- Mandatory prefix format: `[COMPLEXITY:simple|complex|ambiguous] [REASON:breve] [EST:Ns]`
- COMPLEJA criteria (>3 ops, agregacion temporal, >2 servicios, entrega formateada, comparacion cross-source)
- 3 ejemplos COMPLEJAS incluyendo holded Q1 2026/2025, PDFs de Drive, CatPaw+skill+n8n
- SIMPLE criteria + ejemplos (`list_*`, `get_*`, lista mis CatBrains, ejecuta catflow X, crea CatPaw Y)
- AMBIGUA fallback (procesar como simple, marcar ambiguous)
- REGLA DURA: `Si complex: NO ejecutes tools` → propone CatFlow asincrono → `queue_intent_job({description})` si acepta

Registered in `build()` immediately after `tool_instructions` so it's the very first behavioral protocol the LLM reads (before all P1 protocols).

### 4. Tests (15 new, 82 total passing)

**Wave 0 (RED, committed first):**

- `app/src/lib/__tests__/complexity-decisions.test.ts` — 8 new tests covering: insert + non-empty id, all-fields persistence + 200-char snippet truncation, defaults (channel='web', async=0, outcome=null), updateComplexityOutcome with optional async flip, DESC ordering + limit, cross-user isolation, count of complex+async=0+timeout in last 24h, and negative cases (other classifications, async=1, non-timeout outcomes ignored).
- `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` — 7 new tests in `describe('buildComplexityProtocol (Phase 131)', ...)`: non-empty string, char budget ≤1200, COMPLEX casuísticas (holded/Q1/Drive), SIMPLE casuísticas (list_/CatBrains), prefix format markers, hard rule (NO ejecutes tools + queue_intent_job), and P0 ordering (complexity_protocol appears before intent_protocol in `build()` output).

All 15 RED tests confirmed failing before implementation. After implementation: 82/82 passing across the three suites (`complexity-decisions`, `catbot-prompt-assembler`, `catbot-intents`).

## Char budget trimming notes

First draft (verbatim from RESEARCH.md Pattern 2): **1253 chars** — over budget by 53.

Trimming pass (no criteria removed, only verbose phrasing tightened):
- "ANTES de usar tools, clasifica la peticion. Antepon en tu respuesta:" → "ANTES de usar tools, clasifica. Antepon a tu respuesta:"
- ">3 operaciones secuenciales" → ">3 ops secuenciales"
- "Ejemplos COMPLEJAS:" → "Ej COMPLEJAS:"
- Removed "(entra holded, resumen Q1 2026...)" duplicated word "entra"; one example list compressed
- "Si COMPLEX: NO ejecutes tools. Responde: Esta tarea es compleja..." → "Si complex: NO ejecutes tools. Responde: Tarea compleja..."
- Final example REASON shortened from "4 ops + agregacion temporal + entrega formateada" to "4 ops + agregacion + formato"

Result: **1101 chars**, 99 chars of headroom for future tweaks.

## Deviations from Plan

### Auto-fixed Issues

None. Plan executed exactly as written.

### Out-of-scope discoveries

None. No pre-existing warnings or unrelated failures touched.

## Verification

- `npx vitest run src/lib/__tests__/complexity-decisions.test.ts src/lib/__tests__/catbot-prompt-assembler.test.ts src/lib/__tests__/catbot-intents.test.ts` → **82 passed (82)**
- `npm run build` → **Build succeeded** (no ESLint unused-imports errors, no TypeScript errors)

## Commits

- `a11b93e` — `test(131-01): add failing tests for complexity_decisions CRUD + buildComplexityProtocol`
- `5bb9afc` — `feat(131-01): implement complexity_decisions schema + CRUD`
- `10b070d` — `feat(131-01): add buildComplexityProtocol P0 section with project casuisticas`

## Self-Check: PASSED

- FOUND: app/src/lib/__tests__/complexity-decisions.test.ts
- FOUND: app/src/lib/catbot-db.ts (modified — saveComplexityDecision exported)
- FOUND: app/src/lib/services/catbot-prompt-assembler.ts (modified — buildComplexityProtocol exported, P0 registered)
- FOUND commit: a11b93e
- FOUND commit: 5bb9afc
- FOUND commit: 10b070d
- VERIFIED: 82/82 tests passing
- VERIFIED: npm run build success
- VERIFIED: buildComplexityProtocol().length = 1101 (≤1200)
