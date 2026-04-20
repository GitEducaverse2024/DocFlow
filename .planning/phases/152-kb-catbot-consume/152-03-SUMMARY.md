---
phase: 152-kb-catbot-consume
plan: 03
subsystem: catbot
tags: [kb-header-injection, prompt-assembler, list-tools-kb-entry, kb-hotpath, tdd]

# Dependency graph
requires:
  - phase: 152-kb-catbot-consume
    plan: 01
    provides: "kb-index-cache module (resolveKbEntry) + createFixtureKb"
  - phase: 152-kb-catbot-consume
    plan: 02
    provides: "searchKb/getKbEntry TOOLS entries + query_knowledge Legacy framing"
provides:
  - "KB-15 delivery: buildKbHeader() reads .docflow-kb/_header.md fresh + kb_header P1 section injected before platform_overview + buildKnowledgeProtocol rewritten (search_kb→get_kb_entry→query_knowledge LEGACY→search_documentation→log_knowledge_gap)"
  - "KB-17 delivery: 5 canonical list_* tools (list_cat_paws incl. aliases, list_catbrains, list_skills, list_email_templates, canvas_list) now inject kb_entry: string | null resolved via resolveKbEntry(table, row.id)"
  - "kb-tools-integration.test.ts — 6 green integration tests using DATABASE_PATH (not DB_PATH) and save/restore global.fetch"
affects: [152-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hot-path KB injection: prompt-assembler reads _header.md fresh per request (no cache) for <2KB file; normalizes leading H1 to H2 so section delimiter scanners (## ) survive"
    - "kb_entry field on list_* results: row-to-KB mapping via resolveKbEntry(dbTable, row.id), always present (null when no KB file), no opt-in flag"
    - "Test env hoist convention: DATABASE_PATH (matches db.ts:6), CATBOT_DB_PATH (matches catbot-db), and KB_ROOT (matches kb-index-cache)"
    - "global.fetch save/restore in beforeEach/afterEach: prevents stale vi.fn() from leaking across describe blocks in the same suite or to subsequent suites"

key-files:
  created:
    - "app/src/lib/__tests__/kb-tools-integration.test.ts"
  modified:
    - "app/src/lib/services/catbot-prompt-assembler.ts"
    - "app/src/lib/services/catbot-tools.ts"
    - "app/src/lib/__tests__/catbot-prompt-assembler.test.ts"

key-decisions:
  - "Normalize leading H1 (`# KB Header …`) in _header.md to H2 before injecting as a section. Reason: the existing recipe-cap test (and any future section-boundary scanner) uses `\\n## ` as section delimiter. Keeping H1 would have broken the recipe 500+20 char cap regex by making the recipe section absorb kb_header content into the next match. Normalization is a pure string replace of the leading `# ` → `## ` so the header stays first-class."
  - "Reasoning protocol updated to reference search_kb BEFORE query_knowledge (`consulta search_kb primero; si devuelve 0 resultados, consulta query_knowledge …`) so the global assertion `searchKb appears BEFORE queryKnowledge` holds across the entire assembled prompt, not just within the knowledge protocol section. The original KPROTO-05 legacy assertion `consulta query_knowledge` before `Nivel COMPLEJO` is preserved byte-wise."
  - "Extended KPROTO-01 test to cover 5 canonical tools (search_kb, get_kb_entry, query_knowledge, search_documentation, log_knowledge_gap) instead of the pre-Phase-152 4-tool set. `save_learned_entry` is no longer in the new protocol (per CONTEXT §D3 new protocol text)."
  - "list_skills test seeds the `instructions` NOT NULL column because the real migrated schema (shared via `@/lib/db` hoist to DATABASE_PATH) requires it. CREATE IF NOT EXISTS in beforeEach is a no-op on the initialized DB — the module-level migration already created the full schema on the tmp file."
  - "catbrains test uses explicit column INSERT (id, name, status, created_at, updated_at) for the same reason: real schema has 23 columns but the test only cares about 5."
  - "list_connectors not touched (tool does not exist in catbot-tools.ts — confirmed pre-Plan-02). Per KB-17 contract in REQUIREMENTS.md, only the 5 canonical list_* tools are in scope. If a future phase exposes connector listing, it will inherit the same pattern."
  - "kb_entry field is ALWAYS present (string or null), not opt-in. Reason: consistent shape discoverable by the LLM, and the lookup is 1 Map get over a byTableId cache amortized across all items in the same TTL window."

patterns-established:
  - "Hot-path KB read pattern: prompt-assembler buildXxxHeader() function reads a small KB file fresh per request via process['env']['KB_ROOT'] || fallback, trim, and graceful '' on any error. Section push wraps `if (content.length > 0)` so empty reads don't ship a useless section."
  - "list_* kb_entry injection: three-line diff in each case — type the rows array, .map through resolveKbEntry(table, row.id), return withKb. The canvas_list variant adapts after await res.json() and guards Array.isArray() for non-list responses."
  - "Section delimiter safety: when injecting raw markdown from an external file into a prompt structured as H2 blocks, normalize leading H1 with a simple `/^# /` regex replace. Prevents downstream `\\n## `-based extractors from overshooting."

requirements-completed: [KB-15, KB-17]

# Metrics
duration: 7min
completed: 2026-04-20
---

# Phase 152 Plan 03: KB Hot-Path Integration Summary

**Assembler injects `.docflow-kb/_header.md` fresh as P1 section before `platform_overview`; `buildKnowledgeProtocol()` rewritten to teach CatBot the canonical `search_kb → get_kb_entry → query_knowledge LEGACY → search_documentation → log_knowledge_gap` order; the 5 canonical list_* tools now return `kb_entry: string | null` resolved via Plan 01's kb-index-cache. 11 new green tests (6 integration + 5 assembler), zero Plan-01/02 regressions, Next.js build clean.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-20T11:23:00Z
- **Completed:** 2026-04-20T11:30:45Z
- **Tasks:** 2 (both auto + tdd, RED→GREEN each)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- **KB-15 delivered:** `buildKbHeader()` added to `catbot-prompt-assembler.ts` (~L300). Reads `.docflow-kb/_header.md` fresh per request via `process['env']['KB_ROOT']` with fallback to `path.join(process.cwd(), '..', '.docflow-kb')`. Trims and normalizes leading `# ` → `## ` so the section integrates with the H2-structured prompt and downstream section-boundary scanners.
- **kb_header section pushed as P1 BEFORE platform_overview:** The new section push lives at L1024 while `platform_overview` push is at L1030 (verified via `grep -n "id: 'kb_header'\|id: 'platform_overview'"`). Wrapped in `try/catch` with `if (kbHeader.length > 0)` guard so missing/unreadable `_header.md` never breaks assembly and never pushes an empty section.
- **buildKnowledgeProtocol() rewritten:** New canonical ordering: (1) `search_kb({type?, subtype?, tags?, audience?, status?, search?, limit?})` PRIMARY, (2) `get_kb_entry({id})`, (3) `query_knowledge({area?, query?})` LEGACY FALLBACK, (4) `search_documentation({query})` LEGACY FALLBACK, (5) `log_knowledge_gap`. Explicitly enumerates the 5 canonical list_* tools and their new `kb_entry` field. Explicit LEGACY label on `query_knowledge` + `search_documentation`.
- **Reasoning protocol updated:** Line `Antes de clasificar como COMPLEJO, consulta search_kb primero; si devuelve 0 resultados, consulta query_knowledge ...` now references `search_kb` as primary; preserves legacy `consulta query_knowledge` substring so KPROTO-05 legacy test (which asserts byte-wise `consulta query_knowledge` before `Nivel COMPLEJO`) still passes.
- **KB-17 delivered:** 5 canonical list_* cases in `catbot-tools.ts` now inject `kb_entry`:
  - `list_catbrains` (L1623) — `resolveKbEntry('catbrains', row.id)`
  - `list_cat_paws` (L1658, shared with fall-through `list_workers` / `list_agents`) — `resolveKbEntry('cat_paws', row.id)`
  - `list_skills` (L2164) — `resolveKbEntry('skills', row.id)`, preserves `{count, skills}` shape
  - `canvas_list` (L2322) — fetches `/api/canvas` then maps array items through `resolveKbEntry('canvases', c.id)`; non-array payloads preserved as-is
  - `list_email_templates` (L3037) — `resolveKbEntry('email_templates', row.id)`
- **`list_connectors` NOT modified** (tool does not exist — verified via grep). KB-17 contract in REQUIREMENTS.md enumerates exactly 5 tools; `list_connectors` is deferred per Plan 01/02 scope correction.
- **Integration tests green:** 6/6 tests in `kb-tools-integration.test.ts`:
  1. `list_cat_paws` returns `kb_entry: 'resources/catpaws/aaa11111-test-catpaw.md'` for matched row + `null` for orphan.
  2. `list_catbrains` returns `kb_entry: 'resources/catbrains/ccc33333-test-catbrain.md'` for matched + `null` for orphan.
  3. `list_skills` returns `{count, skills[]}` with `kb_entry: 'resources/skills/test-skill-writer.md'` on matched + `null` on orphan.
  4. `list_email_templates` returns `kb_entry: 'resources/email-templates/tpl-test-welcome.md'` for matched + `null` for orphan.
  5. `canvas_list` mocks `global.fetch`, returns `kb_entry: 'resources/canvases/ddd44444-test-canvas.md'` for matched + `null` for orphan.
  6. Cache efficiency: 2 consecutive `list_cat_paws` calls produce 0 additional `_index.json` reads after the first (kb-index-cache TTL 60s honored).
- **DATABASE_PATH env var (Blocker 2 fix):** `vi.hoisted()` sets both `CATBOT_DB_PATH` AND `DATABASE_PATH` because `app/src/lib/db.ts:6` reads `process['env']['DATABASE_PATH']`. Setting `DB_PATH` would be a silent no-op and pollute the real host `data/docflow.db`. Verified via grep: `DATABASE_PATH` present 3× (hoist + 2 doc refs), `DB_PATH` present 0×.
- **global.fetch save/restore (Warning 5 fix):** `beforeEach` captures `originalFetch = global.fetch`; `afterEach` does `global.fetch = originalFetch` so the `vi.fn()` mock used in the `canvas_list` test does not leak into other describe blocks or subsequent suites. Verified via grep: `global.fetch = originalFetch` present 2× (set in beforeEach via assignment, restore in afterEach).
- **`_header.md` content sample (1-line excerpt):** `# KB Header (auto-generated)` (line 1 of the real 1060-byte file at `.docflow-kb/_header.md`). After `buildKbHeader()` normalization, the injected section begins with `## KB Header (auto-generated)` so downstream H2 scanners work correctly.
- **Assembler test suite: 80/80 green** — 5 new tests added (kb_header injection content, kb_header ordering before platform_overview, graceful missing _header.md, search_kb before query_knowledge, query_knowledge labeled LEGACY, get_kb_entry + log_knowledge_gap present). Plus 1 updated KPROTO-01 test to cover the new canonical 5-tool set.
- **Regression-safe:** `cd app && npm run test:unit -- catbot-prompt-assembler kb-index-cache kb-tools knowledge-tree knowledge-sync kb-tools-integration` → 189/190 passing. The 1 pre-existing `knowledge-tree.test.ts _index.json areas[].updated_at drift` failure is documented in `deferred-items.md` from Plan 01 (out of scope; addressed in Phase 155 cleanup). `cd app && npm run build` → "✓ Compiled successfully".

## Task Commits

Each task committed atomically RED → GREEN:

1. **Task 1 RED: add failing tests for kb_header injection + knowledge protocol rewrite** — `0ffbdac` (test)
2. **Task 1 GREEN: buildKbHeader() + kb_header section + knowledge protocol rewrite (KB-15)** — `a5d1b17` (feat)
3. **Task 2 RED: add failing integration tests for list_* kb_entry (KB-17)** — `e85c145` (test)
4. **Task 2 GREEN: inject kb_entry in 5 canonical list_* tools (KB-17)** — `c9d7001` (feat)

_Plan metadata commit pending (created by `/gsd:execute-plan` after SUMMARY write)._

## Files Created/Modified

- `app/src/lib/__tests__/kb-tools-integration.test.ts` (NEW, 185 lines) — 6 integration tests. `vi.hoisted()` sets `CATBOT_DB_PATH` + `DATABASE_PATH` (NOT `DB_PATH`). `beforeEach` sets up tmp KB fixture via `createFixtureKb`, wipes 5 DB tables, and saves `originalFetch`. `afterEach` cleans tmp dir, invalidates KB cache, restores `global.fetch = originalFetch`. Tests split: 1 per canonical list_* tool (5) + 1 cache efficiency.
- `app/src/lib/services/catbot-prompt-assembler.ts` (MODIFIED) — Imports `fs` + `path` from `node:*`. Adds `buildKbHeader()` (~L300) after `buildPlatformOverview()`. Adds `sections.push({id:'kb_header', priority:1})` at L1024, before the `platform_overview` push at L1030. Rewrites `buildKnowledgeProtocol()` (~L648) to teach the canonical order. Updates reasoning protocol line `Antes de clasificar como COMPLEJO ...` to mention `search_kb` before `query_knowledge` while keeping the legacy substring.
- `app/src/lib/services/catbot-tools.ts` (MODIFIED) — Imports `resolveKbEntry` from `./kb-index-cache` (L10). Modifies 5 case blocks: `list_catbrains` (L1623), `list_cat_paws` + aliases (L1658), `list_skills` (L2164), `canvas_list` (L2322), `list_email_templates` (L3037). Each case maps rows through `resolveKbEntry(<table>, row.id)` and returns result items with `kb_entry: string | null`.
- `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` (MODIFIED) — Imports `fs`, `os`, `path` from `node:*` and `createFixtureKb`. Adds `describe('PromptAssembler — Phase 152 KB integration')` block with 6 tests (3 kb_header, 3 protocol rewrite). Updates KPROTO-01 test to assert the 5 canonical tools of the new protocol.

## Decisions Made

See `key-decisions` in the frontmatter above (7 decisions). All made autonomously; no checkpoints reached.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] KPROTO-01 legacy test asserted `save_learned_entry` (not in new protocol)**

- **Found during:** Task 1 first GREEN run — KPROTO-01 failed because `save_learned_entry` is no longer mentioned in the new `buildKnowledgeProtocol()` output per the plan's explicit protocol rewrite.
- **Issue:** The pre-existing test `KPROTO-01: build() contains all 4 knowledge tool names` asserted `save_learned_entry`. The new Phase 152 protocol explicitly deprecates this tool in favor of `search_kb + get_kb_entry + query_knowledge (LEGACY) + search_documentation (LEGACY) + log_knowledge_gap`.
- **Fix:** Updated the test to cover the new canonical 5-tool set (search_kb, get_kb_entry, query_knowledge, search_documentation, log_knowledge_gap).
- **Files modified:** `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` (KPROTO-01 block).
- **Committed in:** `a5d1b17` (bundled with Task 1 GREEN — the test update is a direct consequence of the protocol rewrite).

**2. [Rule 3 - Blocking] recipe section cap test overshooting because of H1 → H2 normalization**

- **Found during:** Task 1 first GREEN run — `recipe section is capped at 500 characters` test reported 597 chars instead of ≤520.
- **Issue:** The real `.docflow-kb/_header.md` starts with `# KB Header (auto-generated)` (H1), but the recipe test extracts the recipe section from `## RECETA MEMORIZADA` to the next `\n## `. With kb_header inserted between matched_recipe and the next H2 section, the raw H1 didn't act as a delimiter, so the recipe extraction absorbed more content.
- **Fix:** `buildKbHeader()` now normalizes the leading `# ` → `## ` via a simple regex replace so the kb_header section integrates cleanly with the rest of the H2-structured prompt and section-boundary scanners work as before.
- **Files modified:** `app/src/lib/services/catbot-prompt-assembler.ts` (`buildKbHeader()` body).
- **Committed in:** `a5d1b17` (bundled with Task 1 GREEN — the normalization is part of the same logical change).

**3. [Rule 3 - Blocking] Integration tests failed because CREATE IF NOT EXISTS is a no-op on initialized DB**

- **Found during:** Task 2 first GREEN run — `list_catbrains` failed with `table catbrains has 23 columns but 5 values were supplied`; `list_skills` failed with `NOT NULL constraint failed: skills.instructions`.
- **Issue:** The test sets up `DATABASE_PATH` to a tmp file and imports `@/lib/db` which initializes the full migrated schema at module-eval time. The `CREATE TABLE IF NOT EXISTS` in `beforeEach` is therefore a no-op, and the tests' simplified-positional INSERT assumed the bare-bones schema.
- **Fix:** Converted INSERTs to use explicit column names: `INSERT INTO catbrains (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)` (picks only the columns I seed); `INSERT INTO skills (id, name, description, category, tags, source, is_featured, instructions) VALUES (?, ?, ?, ?, ?, ?, 0, ?)` (satisfies the NOT NULL `instructions` constraint).
- **Files modified:** `app/src/lib/__tests__/kb-tools-integration.test.ts` (list_catbrains + list_skills test bodies).
- **Committed in:** `c9d7001` (bundled with Task 2 GREEN — this is a test fidelity fix, not a production code change).

**Total deviations:** 3 (1 Rule 1 — protocol rewrite implies test update; 2 Rule 3 — blocking test issues from schema/layout realities). No scope change.

## Issues Encountered

- **Pre-existing `knowledge-tree.test.ts` 1 failure:** `_index.json areas[].updated_at drift` — already in `deferred-items.md` from Plan 01. Phase 151-02 redirect stubs bumped JSON file `updated_at` but didn't regenerate `app/data/knowledge/_index.json`. Out of scope for Phase 152; best addressed in Phase 155 cleanup.
- **Migration noise in Next.js build logs:** `table catbrains has 23 columns but 18 values were supplied` log-errors appear during build (next's data collection phase). Pre-existing on host DB, unrelated to this plan. Build itself exits with `✓ Compiled successfully`.

## Oracle Verification (confirmation)

Both positive (matched row → `kb_entry` path) and negative (orphan row → `kb_entry: null`) branches covered for each of the 5 canonical list_* tools — a total of 10 behavioral assertions across the 5 integration tests + 1 cache-efficiency test = 11 test cases, all green. This proves the contract that KB-17 promised.

For CatBot oracle validation (the broader protocol dictated by `CLAUDE.md`), Plan 04 owns the end-to-end CatBot chat smoke test ("¿Qué CatPaws hay?" → should invoke `list_cat_paws` → response includes `kb_entry` fields + CatBot surfaces `search_kb` / `get_kb_entry` as next actions). This plan (03) delivers the plumbing; Plan 04 will run the live oracle.

## Verification summary

| Check | Result |
|---|---|
| `grep -n "id: 'kb_header'\|id: 'platform_overview'"` | kb_header at L1024, platform_overview at L1030 (kb_header FIRST — correct) |
| `grep -A 30 "buildKnowledgeProtocol" … | grep -cE "search_kb\|LEGACY\|get_kb_entry"` | 7 (≥3 required) |
| `grep -c "resolveKbEntry" catbot-tools.ts` | 6 (1 import + 5 inline uses — correct) |
| `grep -c "DATABASE_PATH" kb-tools-integration.test.ts` | 3 (≥1 required) |
| `grep -c "process\[.env.\]\[.DB_PATH.\]" kb-tools-integration.test.ts` | 0 (required: 0 — correct, no DB_PATH misuse) |
| `grep -c "global.fetch = originalFetch" kb-tools-integration.test.ts` | 2 (≥1 required — set + restore) |
| `npm run test:unit -- catbot-prompt-assembler kb-tools-integration` | 86/86 green |
| `npm run test:unit -- kb-tools kb-index-cache knowledge-sync` | all Plan 01/02 tests green |
| `npm run build` | ✓ Compiled successfully |

## Self-Check

Verified the claims of this SUMMARY before writing state updates:

- `app/src/lib/__tests__/kb-tools-integration.test.ts` exists: FOUND
- Commit `0ffbdac`: FOUND in git log
- Commit `a5d1b17`: FOUND in git log
- Commit `e85c145`: FOUND in git log
- Commit `c9d7001`: FOUND in git log
- `grep -c "buildKbHeader" catbot-prompt-assembler.ts` → 4 (JSDoc + signature + call site + import-consistency = fine)
- `grep -c "resolveKbEntry" catbot-tools.ts` → 6 (expected 6: 1 import + 5 inline uses)
- `grep -cE "case 'list_cat_paws'|case 'list_catbrains'|case 'list_skills'|case 'list_email_templates'|case 'canvas_list'"` → 5 (expected 5)
- `npm run test:unit -- kb-tools-integration` → 6/6 green
- `npm run test:unit -- catbot-prompt-assembler` → 80/80 green
- `npm run build` → "✓ Compiled successfully"

## Self-Check: PASSED

---
*Phase: 152-kb-catbot-consume*
*Completed: 2026-04-20*
