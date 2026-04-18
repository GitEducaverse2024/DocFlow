# Phase 150 — Deferred Items

Pre-existing failures found during execution of plan 150-01 that are **out of scope** for this phase per the GSD deviation rules (scope boundary: only auto-fix issues directly caused by the current task's changes).

## Pre-existing unit test failures (unrelated to Phase 150)

Verified by running `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts` on the pre-150-01 git state (stashed) — same 7 failures reproduce. `knowledge-tools-sync.test.ts` shares the same root cause.

### 1. `src/lib/__tests__/knowledge-tree.test.ts` — 7 failing tests

- `schema > each knowledge JSON passes zod KnowledgeEntry schema validation`
- `loader functions > loadKnowledgeArea(id) returns correct data for each area`
- `loader functions > getAllKnowledgeAreas() returns array of 7 entries`
- `updated_at > _index.json areas[].updated_at matches individual JSON updated_at`
- `sources population (PROMPT-05) > every knowledge area has at least one source`
- `sources population (PROMPT-05) > sources have valid file extensions`
- `sources population (PROMPT-05) > all sources[] paths resolve to existing files`

**Root cause (likely):** `app/data/knowledge/*.json` files drifted from the zod `KnowledgeEntry` schema. Completely independent from `.docflow-kb/`.

### 2. `src/lib/__tests__/knowledge-tools-sync.test.ts` — 1 failing test

- `Knowledge Tree <-> CatBot Tools Bidirectional Sync > every knowledge JSON tool exists in TOOLS[]`

**Root cause (likely):** Same `app/data/knowledge/*.json` drift; checks every `tools[]` entry has a matching TOOLS registration.

## Scope decision

These tests concern the *legacy* knowledge tree under `app/data/knowledge/` — the system that `.docflow-kb/` will eventually replace per PRD Fase 3/7. They are NOT related to Phase 149's knowledge-sync service, Phase 150's KB population, or any file this plan touches. Fixing them would mean reconciling `app/data/knowledge/*.json` files against the current zod schema — a legacy-maintenance task that belongs in a separate phase.

Plan 01 impact: none. The three new tests in `knowledge-sync.test.ts` and the 1 + 17 tests in `kb-sync-db-source.test.ts` all pass. The 13 Phase 149 CLI tests (`kb-sync-cli.test.ts`) still pass.
