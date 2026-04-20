---
phase: 152-kb-catbot-consume
plan: 02
subsystem: catbot
tags: [catbot-tools, kb-read-path, tool-registration, zod-union, redirect-hint]

# Dependency graph
requires:
  - phase: 152-kb-catbot-consume
    plan: 01
    provides: "kb-index-cache module (searchKb/getKbEntry) + Zod union schema + createFixtureKb"
provides:
  - "KB-16 delivery: search_kb + get_kb_entry registered in TOOLS[], always-allowed, with executeTool handlers"
  - "query_knowledge redirect hint on __redirect top-level + mapConceptItem formatter (Phase 152 KB-18 formats)"
  - "Null/array-guarded __redirect detection (Warning 4 explicit coverage)"
affects: [152-03, 152-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tool dispatch pattern: TOOLS[] entry + executeTool case + getToolsForLLM allowlist (3 coordinated edits per tool)"
    - "Legacy-to-KB redirect adapter: __redirect key detection with defensive null/array guard emits structured hint for downstream tool users"
    - "mapConceptItem union-shape formatter: string / {term,definition} / {__redirect} → single stringified form with Phase 152 KB-18 formats"
    - "RED-first TDD at the tool registration layer: contract tests assert TOOLS[].function.name + parameters.required + allowlist membership before adding TOOLS entries"

key-files:
  created:
    - "app/src/lib/__tests__/kb-tools.test.ts"
    - "app/src/lib/__tests__/catbot-tools-query-knowledge.test.ts"
  modified:
    - "app/src/lib/services/catbot-tools.ts"
    - ".planning/phases/152-kb-catbot-consume/deferred-items.md"

key-decisions:
  - "Insertion point for new TOOLS entries: immediately after the updated query_knowledge definition (L237 search_kb, L281 get_kb_entry) — keeps the knowledge-discovery cluster together instead of interleaving with the canvas tools around L536."
  - "Rename stringifyConceptItem → mapConceptItem (global in-file rename) instead of adding a parallel helper. Phase 152 KB-18 formats are the canonical ones (bold term, explicit 'usa get_kb_entry' hint) and there is no need to retain the Plan 01 transitional format."
  - "mapConceptItem integrated INTO scoreKnowledgeMatch/formatKnowledgeResult/formatKnowledgeAsText via simple rename (not a separate dispatcher). scoreKnowledgeMatch's .includes(q) still works because the stringified form contains both term and definition words — search matches survive the rename."
  - "Redirect hint emission lives inline in the `if (area)` branch of query_knowledge (right after formatKnowledgeResult) — NOT inside formatKnowledgeResult itself. Rationale: formatKnowledgeResult is a pure data-shaping helper with no side effects; the hint emission reads a top-level KB key (`__redirect`) that is outside formatKnowledgeResult's contract. Keeping it in the case handler preserves the helper's composability for the aggregate (no-area) branch."
  - "Warning 4 null/array guard applied at TWO locations: (a) inside mapConceptItem via `typeof === 'object' && !Array.isArray(c)` before probing properties, and (b) inside the redirect-detection branch via `entry && typeof entry === 'object' && !Array.isArray(entry)` before accessing __redirect. Both guards are tested: mapConceptItem via unit contract; redirect via catbot-tools-query-knowledge.test.ts `query_knowledge({})` aggregate-mode no-throw + `unknown-area` no-throw tests."
  - "Description-only change for query_knowledge is in Task 1's commit (35f5069), but the case handler update is in Task 2's commit (574a17f). The description change alone does not break existing behavior; the case handler update is what surfaces the redirect hint. Split by task boundary intentionally."
  - "kb-tools.test.ts uses KB_ROOT fixture (not CATBOT_DB_PATH) because search_kb/get_kb_entry are filesystem-only; no DB seeding needed. Info 7 cleanup from the plan is satisfied verbatim — no DB env hoist in kb-tools.test.ts."

patterns-established:
  - "Tool registration RED-first pattern (Phase 152): write contract tests that assert `TOOLS.find(t=>t.function.name==='X')` + `parameters.required` + `getToolsForLLM([]).map(t=>t.function.name).includes('X')` BEFORE writing TOOLS entries. Forces the 3-edit coordination (TOOLS/case/allowlist) to surface as test failures if any of the three is missed."
  - "Legacy-consumer redirect adapter pattern: when Zod passthrough preserves a migration key (__redirect / __redirect_destinations), the consumer (query_knowledge case) reads it defensively (null/array-guarded), emits a structured hint block keyed by type='redirect', and continues to return the normal result envelope. Downstream tool users see both the legacy content AND the migration pointer."

requirements-completed: [KB-16]

# Metrics
duration: 6min
completed: 2026-04-20
---

# Phase 152 Plan 02: Tool Registration Summary

**Registered `search_kb` + `get_kb_entry` in catbot-tools (TOOLS[] + executeTool + getToolsForLLM allowlist) consuming Plan 01's kb-index-cache module; fixed `query_knowledge` with Legacy description, mapConceptItem formatter, and null/array-guarded __redirect hint emission. 24 new green tests (18 kb-tools + 6 query_knowledge), zero Plan-01 regressions, build clean.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-20T11:12:22Z
- **Completed:** 2026-04-20T11:18:25Z
- **Tasks:** 2 (both auto + tdd, RED→GREEN each)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- **KB-16 delivered:** `search_kb` and `get_kb_entry` tools live in `catbot-tools.ts` (L237 / L281) with JSON Schema `parameters` matching CONTEXT §D2.1 / §D2.2 exactly. Both are always-allowed for any non-sudo user via the `getToolsForLLM` allowlist branch extended at L1453. Both dispatch through `executeTool` cases at L1862 and L1881 that delegate to `searchKb(params)` and `getKbEntry(id)` respectively from the Plan 01 kb-index-cache module.
- **search_kb description explicit:** Mentions Knowledge Base estructurado, the primary-for-resources intent (catpaws, connectors, skills, catbrains, email-templates, canvases), rules/protocols/incidents, and the fallback order (cae a `query_knowledge` cuando 0 results). Ranking formula (title×3, summary×2, tags/hints×1) is documented in the description so LLMs understand how to interpret scored results.
- **get_kb_entry schema correct:** `parameters.required: ['id']` with documentation that points to search_kb as the discovery entry point; enforces id as non-empty string at the executeTool layer (L1884) returning `{error: 'id es obligatorio (string no vacío)'}` on invalid input and `{error: 'NOT_FOUND', id}` on unknown id.
- **query_knowledge Legacy framing:** Description at L224 updated to explicitly say "Legacy. Consulta el knowledge tree antiguo ... Úsala SOLO si search_kb devolvió 0 resultados ... PRIMERO llama search_kb({type, subtype, tags, search}) ..." — LLM now has unambiguous discovery order.
- **query_knowledge redirect hint emission:** When `loadKnowledgeArea(area)` returns an entry with `__redirect` top-level (Phase 151 migration marker, preserved via Plan 01's Zod `.passthrough()`), the `if (area)` branch now emits `result.redirect = {type: 'redirect', target_kb_path, hint, all_destinations}` alongside the standard formatted result. The hint tells the LLM to call `get_kb_entry(id)` with the id derived from the path.
- **Warning 4 null/array guard:** The redirect detection is gated by `entry && typeof entry === 'object' && !Array.isArray(entry)` BEFORE accessing `entry.__redirect`. Explicitly tested via `query_knowledge({})` aggregate-mode (loader may return array) + `query_knowledge({area: 'unknown-area-xyz'})` unknown-area (loader throws) tests. Both must not emit redirect and must not throw.
- **mapConceptItem formatter (rename + Phase 152 KB-18 formats):** Replaced the Plan-01 `stringifyConceptItem` with `mapConceptItem` (L1331) with Phase 152 canonical outputs:
  - string → as-is
  - `{term, definition}` → `**term**: definition` (bold term)
  - `{__redirect: path}` → `(migrado → path; usa get_kb_entry)` (explicit hint to the LLM to pivot)
  - unknown object → `JSON.stringify(c)`; else `String(c)`
  - All 3 call sites (scoreKnowledgeMatch L1356-58, formatKnowledgeResult L1371, formatKnowledgeAsText L1400-08) updated via in-file rename.
- **24 new green tests:** 18 in `kb-tools.test.ts` (TOOLS registration contract, getToolsForLLM allowlist, search_kb filters/ranking/limits/summary-truncate, get_kb_entry found/NOT_FOUND/missing-id/empty-string-id/related_resolved); 6 in `catbot-tools-query-knowledge.test.ts` (tool description Legacy+search_kb, catboard.json no-throw, `query_knowledge({})` aggregate no-throw, unknown-area no-throw + no-redirect, __redirect hint emission, **term** mapper).
- **Info 7 cleanup landed:** `kb-tools.test.ts` is pure filesystem (KB_ROOT only). Node does not hoist any catbot DB path env var — verified programmatically via `grep CATBOT_DB_PATH` returning empty. `catbot-tools-query-knowledge.test.ts` does hoist the catbot DB path because it touches `fetchLearnedEntries` → `getLearnedEntries` → `catbot-db` via `loadKnowledgeArea → formatKnowledgeResult`, which is write-capable; that hoist is correct and expected.
- **No Plan-01 regression:** knowledge-sync 38/38, kb-sync-cli 13/13, kb-sync-db-source 18/18, kb-index-cache 20/20, catbot-tools full 27/27. knowledge-tree 27/28 (same pre-existing `_index.json updated_at` drift from Phase 151 documented in deferred-items.md). `npm run build` succeeds cleanly.

## Task Commits

Each task was committed atomically RED → GREEN:

1. **Task 1 RED: add failing tests for search_kb + get_kb_entry tools** — `347c7d0` (test)
2. **Task 1 GREEN: register search_kb + get_kb_entry tools in catbot-tools** — `35f5069` (feat)
3. **Task 2 RED: add failing tests for query_knowledge extensions** — `edb145f` (test)
4. **Task 2 GREEN: query_knowledge redirect hint + mapConceptItem + null/array guard** — `574a17f` (feat)

_Plan metadata commit pending (created by `/gsd:execute-plan` after SUMMARY write)._

## Files Created/Modified

- `app/src/lib/__tests__/kb-tools.test.ts` (NEW, 216 lines) — 18 tests. Uses `createFixtureKb(tmpDir)` from Plan 01's `kb-test-utils.ts` and sets `process['env']['KB_ROOT']` per-test with `invalidateKbIndex()` in beforeEach/afterEach. Tests split into 6 describe blocks: TOOLS registration contract (4), search_kb filters (5), search_kb ranking (1), search_kb limits (3), get_kb_entry (5).
- `app/src/lib/__tests__/catbot-tools-query-knowledge.test.ts` (NEW, 104 lines) — 6 tests. Uses `vi.hoisted()` to set `CATBOT_DB_PATH` to a mkdtemp path so `catbot-db` doesn't write to the real sqlite. Tests split into 4 describe blocks: tool description (1), Zod schema tolerance (3: catboard no-throw, `query_knowledge({})` aggregate no-throw, unknown-area no-throw), redirect hint emission (1), concept item mapper (1).
- `app/src/lib/services/catbot-tools.ts` (MODIFIED) — Imports `searchKb, getKbEntry` from `./kb-index-cache` (L10). Updated `query_knowledge` description at L224 to Legacy framing. Added `search_kb` TOOLS entry at L237 and `get_kb_entry` at L281. Renamed `stringifyConceptItem` → `mapConceptItem` with Phase 152 canonical output shapes at L1331; updated all 3 call sites (L1356-58, L1371, L1400-08). Extended `getToolsForLLM` allowlist at L1453 to include `search_kb` and `get_kb_entry`. Added inline redirect hint block in `query_knowledge` case at ~L1787-1820 with null/array guard. Added `search_kb` case at L1862 and `get_kb_entry` case at L1881.
- `.planning/phases/152-kb-catbot-consume/deferred-items.md` (MODIFIED) — Added "From Plan 152-02" section documenting the intentional RED in `knowledge-tools-sync.test.ts` for `search_kb`/`get_kb_entry` missing from knowledge JSONs (Plan 04 owner) alongside the pre-existing `delete_catflow` phantom.

## Decisions Made

See `key-decisions` in the frontmatter above (7 decisions). All made autonomously; no checkpoints reached.

## Deviations from Plan

### Plan-adjustments (no scope change)

**1. [Rule 3 - Blocking] Rephrased a test-file comment to avoid false-positive verify regex**

- **Found during:** Task 1 verify command `grep CATBOT_DB_PATH app/src/lib/__tests__/kb-tools.test.ts | grep -v '//'`.
- **Issue:** The plan's kb-tools.test.ts template included a JSDoc comment `// NOTE: No CATBOT_DB_PATH hoist ...`. The plan's verify regex `f.includes('CATBOT_DB_PATH')` doesn't know to skip comments, so it false-positive-failed.
- **Fix:** Rephrased the comment body to "Does NOT hoist the catbot DB path env" — semantically identical, does not trip the regex. No behavioral change.
- **Files modified:** `app/src/lib/__tests__/kb-tools.test.ts` line 11.
- **Committed in:** `35f5069` (bundled with the Task 1 GREEN change — the comment rephrasing was trivial and part of the same logical change).

**Total deviations:** 1 (Rule 3 — a comment rephrasing to satisfy an exact-match verify regex). No scope change.

## Issues Encountered

- **Pre-existing `knowledge-tools-sync.test.ts` 2 failures:** Intentional and expected per plan-level wording (plan done criteria explicitly states `knowledge-tools-sync.test.ts is STILL red here — that fix is Plan 04`). Both failures — `search_kb`/`get_kb_entry` missing from knowledge JSONs AND `delete_catflow` phantom — are logged in `deferred-items.md`. Plan 04 will register the two new tools in a knowledge JSON (most likely `settings.json` or a new `kb.json`) and sweep `delete_catflow` at the same time.
- **`knowledge-tree.test.ts` 1/28 pre-existing failure:** `_index.json area.updated_at drift` from Phase 151-02. Already documented in deferred-items.md from Plan 01. Not re-triggered by Plan 02. Best addressed in Phase 155 cleanup.

## Self-Check

Verified the claims of this SUMMARY before writing state updates:

- `app/src/lib/__tests__/kb-tools.test.ts` exists: FOUND
- `app/src/lib/__tests__/catbot-tools-query-knowledge.test.ts` exists: FOUND
- Commit `347c7d0`: FOUND in git log
- Commit `35f5069`: FOUND in git log
- Commit `edb145f`: FOUND in git log
- Commit `574a17f`: FOUND in git log
- `grep -cE "name: 'search_kb'|name: 'get_kb_entry'" app/src/lib/services/catbot-tools.ts` → 2 (expected 2)
- `grep -cE "case 'search_kb'|case 'get_kb_entry'" app/src/lib/services/catbot-tools.ts` → 2 (expected 2)
- `grep -c "name === 'search_kb' || name === 'get_kb_entry'" app/src/lib/services/catbot-tools.ts` → 1 (expected 1)
- `grep -c mapConceptItem app/src/lib/services/catbot-tools.ts` → 8 (helper definition + 3 doc references + 3 loop call sites + 1 arr.map call site)
- `grep -c "!Array.isArray" app/src/lib/services/catbot-tools.ts` → 3 (mapConceptItem + redirect guard + array-of-destinations filter; ≥2 expected)
- `npm run test:unit -- kb-tools catbot-tools-query-knowledge` → 24/24 passing
- `npm run build` → compiled successfully

## Self-Check: PASSED

---
*Phase: 152-kb-catbot-consume*
*Completed: 2026-04-20*
