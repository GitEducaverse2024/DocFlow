---
phase: 152-kb-catbot-consume
plan: 01
subsystem: infra
tags: [knowledge-base, zod, js-yaml, catbot, read-path, kb-cache]

# Dependency graph
requires:
  - phase: 149-kb-foundation-bootstrap
    provides: ".docflow-kb/ structure + _schema/ + kb-sync.cjs CLI"
  - phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates
    provides: ".docflow-kb/resources/ populated from 6 DB tables + _index.json + _header.md"
  - phase: 151-kb-migrate-static-knowledge
    provides: ".docflow-kb/rules+concepts+protocols+guides populated; __redirect keys injected in app/data/knowledge/*.json"
provides:
  - "KB-18 delivery: Zod schema union (string | {term,definition} | {__redirect}) + KnowledgeEntrySchema.passthrough()"
  - "kb-index-cache.ts module — 60s TTL cache + byTableId resolver + searchKb + getKbEntry + parseKbFile"
  - "createFixtureKb(tmpDir) test helper (7-entry fixture) shared by Plans 02/03"
  - "KB-15/16/17 registration in REQUIREMENTS.md (full delivery in Plans 02/03/04)"
  - "ROADMAP.md Phase 152 section: Goal + 5 Success Criteria + 4 Plans enumerated (TBD removed)"
affects: [152-02, 152-03, 152-04, 154-kb-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "KB read-path module pattern: module-level cache with TTL + per-root keyed invalidation"
    - "byTableId lazy cold-start build: reads 66 frontmatter YAMLs once per 60s to compensate for _index.json schema omission"
    - "Union Zod schema with .passthrough() to accept 3 shapes while preserving unknown keys"
    - "createFixtureKb shared test helper for KB-read-path unit tests"

key-files:
  created:
    - "app/src/lib/services/kb-index-cache.ts"
    - "app/src/lib/__tests__/kb-test-utils.ts"
    - "app/src/lib/__tests__/kb-index-cache.test.ts"
    - ".planning/phases/152-kb-catbot-consume/deferred-items.md"
  modified:
    - ".planning/REQUIREMENTS.md"
    - ".planning/ROADMAP.md"
    - "app/src/lib/knowledge-tree.ts"
    - "app/src/lib/__tests__/knowledge-tree.test.ts"
    - "app/src/lib/services/catbot-tools.ts"
    - "app/src/lib/services/catbot-prompt-assembler.ts"

key-decisions:
  - "ConceptItemSchema as discriminated union of 3 shapes (string | {term,definition} | {__redirect}) covers all pre-existing shapes found in app/data/knowledge/ without weakening validation"
  - "KnowledgeEntrySchema.passthrough() preserves __redirect + __redirect_destinations top-level keys so Plan 02's query_knowledge consumer can emit redirect hints (the legacy Zod .strip() default would have discarded them)"
  - "byTableId map built lazily per TTL (not at import time) because _index.json.entries[] does NOT expose source_of_truth — that field is only in each resource .md frontmatter (CONFLICT #1 from 152-RESEARCH)"
  - "js-yaml imported via require() + inline type shim (no @types/js-yaml package dep added) — keeps package.json untouched"
  - "KB_ROOT resolved from process['env']['KB_ROOT'] (bracket notation per MEMORY.md) with fallback path.join(process.cwd(), '..', '.docflow-kb'); in dev (cwd=app/) resolves to ~/docflow/.docflow-kb/, in Docker prod (cwd=/app) resolves to /.docflow-kb/"
  - "getKbEntry is sync (not async) — reads run on synchronous fs.readFileSync and the warm-cache branch takes no I/O. Simpler signature for Plan 02 tool dispatcher and matches the plan's strict exports regex."
  - "Stringifier helpers (stringifyConceptItem / renderConceptItem) added to catbot-tools.ts and catbot-prompt-assembler.ts to adapt existing consumers to the union — redirect items render as '(migrated → <path>)' so legacy tools don't break mid-sentence"
  - "KB-17 contract enshrines exactly 5 canonical list_* tools. list_connectors is explicitly deferred because it does not exist in catbot-tools.ts — only list_email_connectors (L310) exists. Plan 03 may extend list_email_connectors for consistency but that's not required by KB-17."

patterns-established:
  - "Read-path cache with TTL and root-keyed invalidation: kb-index-cache.ts pattern for Phase 154 dashboard reuse"
  - "Frontmatter-derived resolver map: lazy cold-start + TTL eviction for _index.json schema gaps"
  - "Test fixture helper in app/src/lib/__tests__/kb-test-utils.ts: shared by Plans 02/03 unit and integration tests"
  - "Legacy-consumer adapter helper: stringifyConceptItem pattern for union schemas that need to stay backwards-compatible with string-only formatters"

requirements-completed: [KB-18]

# Metrics
duration: 13min
completed: 2026-04-20
---

# Phase 152 Plan 01: Foundation Summary

**KB read-path foundation — kb-index-cache module with 60s TTL + byTableId source-of-truth resolver, Zod union schema accepting 3 concept shapes, 20 green unit tests, and REQUIREMENTS/ROADMAP registration of KB-15..KB-18 for Plans 02/03/04 to build on.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-20T10:54:30Z
- **Completed:** 2026-04-20T11:07:21Z
- **Tasks:** 2 (1 auto + 1 TDD auto with RED→GREEN×2 pattern)
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments

- **KB-18 delivered:** `knowledge-tree.ts` Zod schema extended with `ConceptItemSchema` union of 3 shapes (string | {term,definition} | {__redirect}). `KnowledgeEntrySchema.parse(catboard.json)` no longer throws on pre-existing `concepts[18..20]` objects — root cause identified in 152-RESEARCH CONFLICT #2 is fixed.
- **kb-index-cache module complete:** 6 function exports (getKbIndex, invalidateKbIndex, resolveKbEntry, searchKb, getKbEntry, parseKbFile) + 5 TypeScript interface/type exports. Total 319 lines. Builds successfully. TS-clean. Runs under Node 20 (Docker) and Node 22 (host).
- **KB-15/16/17/18 registered:** REQUIREMENTS.md §"Knowledge Base CatBot Consume (Phase 152)" section added with 4 bullets; Traceability table extended with 4 rows; Coverage updated 26/26 → 30/30. ROADMAP Phase 152 block replaced with substantive Goal + Requirements + 5 Success Criteria + 4 enumerated plans.
- **KB-17 scope correction landed:** Enumerates exactly 5 canonical list_* tools (`list_cat_paws`, `list_catbrains`, `list_skills`, `list_email_templates`, `canvas_list`). A hypothetical `list_connectors` is explicitly marked deferred — the tool does not exist in the current `catbot-tools.ts` (only `list_email_connectors` at L310).
- **Test coverage for wave-1 foundation:** 20 kb-index-cache tests (cache TTL, invalidation, resolver hit/miss, YAML parse, searchKb filters+ranking+sort+limit, getKbEntry with related_resolved); 13 new knowledge-tree tests (ConceptItemSchema 3 accept + 2 reject, KnowledgeEntrySchema mixed-concept parse, __redirect passthrough, real catboard.json parse).
- **Shared test fixture delivered:** `kb-test-utils.ts exports createFixtureKb(tmpDir)` — 7-entry KB (6 resources + 1 rule) with valid frontmatter including `source_of_truth` so resolveKbEntry can map DB (table, id) → KB path. Reusable by Plans 02/03.
- **No Docker rebuild broken:** `cd app && npm run build` compiles successfully; downstream consumers (catbot-tools.ts scoreKnowledgeMatch/formatKnowledgeResult/formatKnowledgeAsText and catbot-prompt-assembler.ts formatKnowledgeForPrompt) adapted to the union schema via local stringifier helpers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Register KB-15..KB-18 and finalize ROADMAP Phase 152 section** — `1a266ca` (docs)
2. **Task 2 RED: add failing tests for knowledge-tree Zod union + kb-index-cache** — `74ed872` (test)
3. **Task 2 GREEN part 1: extend knowledge-tree Zod schema with ConceptItemSchema union + passthrough** — `09cd701` (feat)
4. **Task 2 GREEN part 2: add kb-index-cache module and adapt legacy consumers to union schema** — `1afe64d` (feat)

_Plan metadata commit pending (created by /gsd:execute-plan after SUMMARY write)._

## Files Created/Modified

- `app/src/lib/services/kb-index-cache.ts` — KB read-path cache module. Exports `getKbIndex/invalidateKbIndex/resolveKbEntry/searchKb/getKbEntry/parseKbFile` + 5 types. 60s TTL cache keyed by KB_ROOT + lazy byTableId build from resource frontmatter. Uses `process['env']['KB_ROOT']` bracket notation with fallback `path.join(process.cwd(), '..', '.docflow-kb')`. ~319 lines.
- `app/src/lib/__tests__/kb-index-cache.test.ts` — 20 tests across 7 describe blocks. Uses `vi.hoisted()` to set `process['env']['KB_ROOT']` to a mkdtempSync tmp dir BEFORE importing the module; `createFixtureKb` writes the 7-entry fixture in `beforeAll`; `invalidateKbIndex` runs in `beforeEach`.
- `app/src/lib/__tests__/kb-test-utils.ts` — `createFixtureKb(tmpDir)` helper. Writes `_header.md`, `_index.json` (7 entries), and 6 resource `.md` files + 1 rule `.md` with valid YAML frontmatter. Each resource file includes `source_of_truth: [{db: sqlite, table: ..., id: ..., fields_from_db: [name]}]` so resolveKbEntry finds it.
- `app/src/lib/knowledge-tree.ts` — Added `ConceptItemSchema = z.union([z.string(), z.object({term,definition}).passthrough(), z.object({__redirect}).passthrough()])`. Changed `concepts/howto/dont: z.array(z.string())` → `z.array(ConceptItemSchema)`. Added `.passthrough()` to `KnowledgeEntrySchema` so top-level `__redirect`/`__redirect_destinations` keys survive parse. Exported `ConceptItem` type.
- `app/src/lib/__tests__/knowledge-tree.test.ts` — Added 2 describe blocks (`ConceptItemSchema`, `KnowledgeEntrySchema with mixed concepts`) with 9 new tests.
- `app/src/lib/services/catbot-tools.ts` — Added `stringifyConceptItem` helper; updated `scoreKnowledgeMatch`, `formatKnowledgeResult`, and `formatKnowledgeAsText` to use it. Redirect items render as `(migrated → <path>)`, {term,definition} as `term: definition`.
- `app/src/lib/services/catbot-prompt-assembler.ts` — Added `renderConceptItem` helper; updated `formatKnowledgeForPrompt` 3 map calls to use it.
- `.planning/REQUIREMENTS.md` — New section "Knowledge Base CatBot Consume (Phase 152)" with KB-15/16/17/18 bullets; 4 new traceability rows; Coverage 26/26 → 30/30; footer date 2026-04-20.
- `.planning/ROADMAP.md` — Phase 152 section replaced with Goal paragraph (enumerates 5 canonical tools, calls out list_connectors deferred), Requirements list, 5 numbered Success Criteria, 4 enumerated plan files (TBD removed).
- `.planning/phases/152-kb-catbot-consume/deferred-items.md` — New file logging 4 pre-existing out-of-scope failures (knowledge-tree `_index.json` updated_at drift, knowledge-tools-sync phantom `delete_catflow`, task-scheduler ×4, alias-routing ×3, catbot-holded-tools ×2, list_connectors missing tool) verified pre-existing against commit 8f6301f.

## Decisions Made

See `key-decisions` in the frontmatter above. Eight key decisions; all made autonomously within the plan's guidance. No checkpoints reached.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted legacy consumers of KnowledgeEntry.concepts/howto/dont to the union schema**

- **Found during:** Task 2 build check (`cd app && npm run build`).
- **Issue:** Changing `concepts/howto/dont: z.array(z.string())` → `z.array(ConceptItemSchema)` flipped the TS type of those arrays from `string[]` to `ConceptItem[]`. Four call sites in `catbot-tools.ts` (scoreKnowledgeMatch, formatKnowledgeResult, formatKnowledgeAsText — 3 loop bodies) and three in `catbot-prompt-assembler.ts` (formatKnowledgeForPrompt — 3 `.map(c => \`- ${c}\`)` calls) were calling `.toLowerCase()` or using template interpolation on the union, producing TS2339 errors and failing the Next.js build.
- **Fix:** Introduced local `stringifyConceptItem` (catbot-tools.ts) and `renderConceptItem` (catbot-prompt-assembler.ts) helpers that cover the 3 union shapes. Plain strings pass through; `{term,definition}` renders as `term: definition`; `{__redirect}` renders as `(migrated → <path>)` — a transitional hint that Plan 152-02 will upgrade to an explicit `{type: 'redirect', target_kb_path}` tool result.
- **Files modified:** `app/src/lib/services/catbot-tools.ts` (lines 1260-1310 approx), `app/src/lib/services/catbot-prompt-assembler.ts` (lines 167-196 approx).
- **Verification:** `cd app && npm run build` → "✓ Compiled successfully". `npm run test:unit -- catbot-tools` → 21/21 passing (no regression in catbot-tools suite).
- **Committed in:** `1afe64d` (feat 152-01 kb-index-cache module and adapt legacy consumers).

**Total deviations:** 1 auto-fixed (1 Rule 3 blocking — directly caused by this plan's Zod schema change).
**Impact on plan:** Necessary for build correctness. No scope creep — the helpers are local and cover only the 3 union shapes defined by the new schema.

## Issues Encountered

- **TypeScript compile errors from js-yaml untyped import:** Initial `import yaml from 'js-yaml'` failed because neither `js-yaml` nor `@types/js-yaml` ship types to TS in this project. Resolved by replacing the import with `const yaml: { load: (src: string) => unknown } = require('js-yaml')` + an eslint-disable comment — avoids adding a new package.json dep. No functional impact; `yaml.load` used exactly once in parseFrontmatter and parseKbFile.
- **Plan verify regex expected sync getKbEntry:** Initial implementation had `export async function getKbEntry`, but the plan's strict export regex matches `export function|const|interface|type`. Made getKbEntry sync since nothing in the module awaited anything — simpler signature and matches the plan. Updated 3 test cases in kb-index-cache.test.ts to drop `await`.
- **1 pre-existing test failure surfaced:** `knowledge-tree.test.ts > _index.json areas[].updated_at matches individual JSON updated_at`. Pre-existing from Phase 151-02 commit `7c5d2e1` (redirect stubs bumped JSON file `updated_at` but didn't regenerate `app/data/knowledge/_index.json`). Out of scope for Plan 152-01 — logged in `.planning/phases/152-kb-catbot-consume/deferred-items.md` per deviation-rule SCOPE BOUNDARY.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Ready for Plans 152-02, 152-03, 152-04 (parallel-safe after this foundation):**

- `kb-index-cache.ts` is live and tested; Plans 02 (tools: `search_kb` + `get_kb_entry`) and 03 (list_* `kb_entry` field) can import `resolveKbEntry`, `searchKb`, `getKbEntry`, `parseKbFile` directly.
- `createFixtureKb(tmpDir)` is in `app/src/lib/__tests__/kb-test-utils.ts` — Plans 02/03 should import it for their fixture KBs (Plan 02 will likely extend it with a deprecated entry to exercise the status filter).
- ConceptItemSchema union + passthrough means Plan 02's `query_knowledge` can safely detect `__redirect` at entry top level (survives parse) AND handle redirect items inside concepts/howto/dont arrays without throwing.
- KB-15/16/17 are registered in REQUIREMENTS.md with their PLAN 02/03/04 delivery owners documented; the Phase 152 block in ROADMAP.md has the full 5-criterion success contract.

**Blockers / carried forward to later plans:**

- `knowledge-tools-sync.test.ts` phantom `delete_catflow` is a pre-existing tripwire (verified with `git checkout 8f6301f`). It will fire again in Plan 152-04 when we add `search_kb` and `get_kb_entry` to a knowledge JSON (tripwire pitfall #3 from RESEARCH). Plan 152-04 should sweep `delete_catflow` at the same time.
- `app/data/knowledge/_index.json` updated_at drift remains; best addressed in Phase 155 when that whole legacy tree is removed. Documented in deferred-items.md.

## Self-Check

Verified the claims of this SUMMARY before writing state updates:

- `app/src/lib/services/kb-index-cache.ts` exists: FOUND
- `app/src/lib/__tests__/kb-test-utils.ts` exists: FOUND
- `app/src/lib/__tests__/kb-index-cache.test.ts` exists: FOUND
- `.planning/phases/152-kb-catbot-consume/deferred-items.md` exists: FOUND
- Commit `1a266ca`: FOUND in git log
- Commit `74ed872`: FOUND in git log
- Commit `09cd701`: FOUND in git log
- Commit `1afe64d`: FOUND in git log

## Self-Check: PASSED

---
*Phase: 152-kb-catbot-consume*
*Completed: 2026-04-20*
