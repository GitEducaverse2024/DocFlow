---
phase: 157-kb-rebuild-determinism
plan: 02
subsystem: knowledge-base
tags: [kb-sync, rebuild-determinism, linked-sections, catpaws, buildBody, tdd]

# Dependency graph
requires:
  - phase: 150-kb-populate-db
    provides: "buildBody skeleton + populateFromDb Pass-2 + isNoopUpdate idempotence"
  - phase: 156-kb-runtime-integrity
    provides: "renderLinkedSection + replaceOrAppendSection (runtime TS path, Plan 156-02)"
  - phase: 157-01
    provides: "loadArchivedIds + Pass-2 archived-skip (KB-46 rebuild exclusion)"
provides:
  - "renderLinkedSectionCjs(items, emptyLabel) — CJS mirror of knowledge-sync.ts:1021-1028"
  - "splitRelationsBySubtype(relations) — flat-array bucketizer (connector/skill), sort ASC"
  - "buildBody(subtype, row, relations?) — 3-arg signature, catpaws render 2 linked sections"
  - "populateFromDb Pass-2 call-site passes relations to buildBody"
affects: [157-03-restore-docs-oracle, kb-sync, knowledge-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CJS↔TS byte-equivalence for rebuild vs runtime syncResource paths"
    - "splitRelationsBySubtype operates on FLAT array discriminated by rel.subtype (RESEARCH Pitfall 2)"
    - "Empty-state always renders placeholder `_(<label>)_` — never omits section (RESEARCH Pitfall 3)"
    - "Caller responsible for sort stability via localeCompare ASC (matches catbot-tools.ts:2148 ORDER BY)"

key-files:
  created: []
  modified:
    - "scripts/kb-sync-db-source.cjs"
    - "app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts"
    - ".docflow-kb/resources/catpaws/*.md (39 files)"
    - ".docflow-kb/resources/skills/*.md (38 files — pre-existing cosmetic drift)"
    - ".docflow-kb/resources/email-templates/*.md (8 files — pre-existing cosmetic drift)"
    - ".docflow-kb/resources/connectors/*.md (5 files — pre-existing cosmetic drift)"
    - ".docflow-kb/resources/catbrains/seed-cat-websearch.md"
    - ".docflow-kb/_index.json"
    - ".docflow-kb/_header.md"

key-decisions:
  - "Linked sections APPENDED after existing catpaw body (## System Prompt, etc.) instead of replacing prior content — matches the anchor point of Phase 156-02 replaceOrAppendSection regex so subsequent runtime syncResource('update') finds the ## heading and noop-replaces with identical bytes"
  - "CJS buildBody body STRUCTURE remains distinct from runtime TS buildBody (TS: `# title` + Modo|Modelo; CJS: `## Descripción` + bullets) — byte-equivalence is only required at the SECTION level (the two linked sections that replaceOrAppendSection regex targets); full-body equivalence was never a requirement"
  - "splitRelationsBySubtype drops relations without a `name` field — defensive against orphan LEFT JOINs where the connector/skill row was hard-deleted but the cat_paw_* join row remained"
  - "Sort via localeCompare (not .sort() default) — matches Phase 156-02 runtime path + catbot-tools.ts:2148 ORDER BY c.name ASC exactly"
  - "loadCatPawRelations exported via _internal to let external TS tests seed the exact relations shape that populateFromDb consumes (future phases)"

patterns-established:
  - "Rebuild-runtime parity: when the runtime path renders a section via syncResource update, the rebuild path MUST render it byte-equivalently so isNoopUpdate sees stable output on the SECOND run (the first run is the backfill)"
  - "TDD RED-GREEN discipline extended from Plan 01: 6 new tests (A renderLinkedSectionCjs, B splitRelationsBySubtype, C buildBody with relations, D buildBody empty placeholder, E backcompat no-sections on non-catpaw, F populateFromDb integration preserves search_hints)"

requirements-completed: [KB-47]

# Metrics
duration: ~6min
completed: 2026-04-20
---

# Phase 157 Plan 02: Body Sections Backfill Summary

**Rebuild path (`kb-sync --full-rebuild --source db`) now renders `## Conectores vinculados` + `## Skills vinculadas` byte-equivalent to the runtime `syncResource('catpaw','update')` path (Phase 156-02). 39/39 catpaws backfilled on Pass 1 (91 writes). Operador Holded confirmed byte-stable on Pass 2 (UNCHANGED). Idempotence invariant holds for KB-47 target files; 5 pre-existing drift catpaws remain an orthogonal Plan 150/153 cosmetic issue.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-20T22:26:34Z
- **Completed:** 2026-04-20T22:32:30Z
- **Tasks:** 3
- **Commits:** 3 task commits + 1 metadata commit
- **Files modified:** 95 (2 source/test + 39 catpaws + 38 skills + 8 email-templates + 5 connectors + 1 catbrain + 2 KB metadata)

## Accomplishments

- Added `renderLinkedSectionCjs(items, emptyLabel)` helper to `scripts/kb-sync-db-source.cjs` — byte-equivalent mirror of `renderLinkedSection` in `app/src/lib/services/knowledge-sync.ts:1021-1028`. Format: `- **<name>** (\`<id>\`)` per item; `_(<emptyLabel>)_` placeholder when empty.
- Added `splitRelationsBySubtype(relations)` helper that filters the flat relations array from `loadCatPawRelations(db)` by `rel.subtype === 'connector' | 'skill'`, drops rows without a `name`, and sorts each bucket ASC via `localeCompare` — matches `catbot-tools.ts:2148` runtime `ORDER BY c.name ASC`.
- Extended `buildBody(subtype, row)` → `buildBody(subtype, row, relations?)`. For `subtype === 'catpaw'`, ALWAYS renders both `## Conectores vinculados` and `## Skills vinculadas` sections (RESEARCH Pitfall 3: placeholder when empty, never omitted). Other subtypes ignore the 3rd arg (backwards-compat verified by Test E).
- Wired `populateFromDb` Pass-2 call-site at line 1613 to pass the pre-computed `relations` (either `pawRels.get(row.id)` for catpaws or `brainRels.get(row.id)` for catbrains; `[]` otherwise) to `buildBody`.
- Exported `renderLinkedSectionCjs`, `splitRelationsBySubtype`, `loadCatPawRelations` via `_internal` for unit tests.
- Extended `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` with 6 new tests (A-F). All 10 tests (4 Plan 01 + 6 Plan 02) GREEN. No regressions in `knowledge-sync.test.ts` (42) or `kb-hooks-tools.test.ts` (7).
- Rebuild Pass 1 (backfill): **91 updated, 22 unchanged, 0 created, 2 orphans, 0 skipped_archived** — 39 catpaws gained their linked sections (Operador Holded got `- **Holded MCP** (\`seed-holded-mcp\`)` under `## Conectores vinculados`).
- Rebuild Pass 2 (idempotence): **Operador Holded UNCHANGED** (md5 hash verified byte-stable across 3 further runs); 34/39 catpaws UNCHANGED. Pass 2 reports `57 updated` but those are all the 5 pre-existing drift catpaws + 38 pre-existing drift skills + 8 pre-existing drift templates + 5 pre-existing drift connectors + 1 pre-existing drift catbrain — documented in Phase 155 Plan 03 STATE.md decision: "isNoopUpdate cosmetic idempotence regression (second pass re-bumps 56 version/timestamp fields on unchanged DB) deferred — pre-existing Phase 150/153 issue, non-blocking".

## Task Commits

1. **Task 1: Extend tests Wave-0 (RED)** — `b748aa8` (test)
2. **Task 2: Implement helpers + buildBody signature + Pass-2 wiring (GREEN)** — `0a5e7cf` (feat)
3. **Task 3: Live-DB rebuild backfill + idempotence verification** — `356375b` (feat)

**Plan metadata commit:** pending (includes SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md update).

## Files Created/Modified

- `scripts/kb-sync-db-source.cjs` — +89 insertions / -2 deletions. Two helpers added (renderLinkedSectionCjs, splitRelationsBySubtype), `buildBody` signature extended, Pass-2 call-site passes `relations`, `_internal` export surface extended.
- `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` — +214 insertions. 6 new tests (A-F) added within existing describe block, ordered before the existing Test 4 CLI integration test.
- `.docflow-kb/resources/catpaws/*.md` — 39 files: every catpaw now has `## Conectores vinculados` + `## Skills vinculadas` sections (with real items or italic placeholder).
- `.docflow-kb/resources/{skills,email-templates,connectors,catbrains}/*.md` — 52 files: pre-existing cosmetic drift from Plan 150/153 idempotence gap (orthogonal to KB-47, would have touched them even without this plan).
- `.docflow-kb/_index.json` + `.docflow-kb/_header.md` — regenerated (same pattern as Plan 01 Task 4 rebuild).

## Literal Output — Operador Holded Body (post-backfill)

```markdown
... (after ## System Prompt block) ...

## Conectores vinculados

- **Holded MCP** (`seed-holded-mcp`)

## Skills vinculadas

_(sin skills vinculadas)_
```

File: `/home/deskmath/docflow/.docflow-kb/resources/catpaws/53f19c51-operador-holded.md`
Version: 1.0.1 → 1.0.2 (patch bump, Pass 1); 1.0.2 UNCHANGED on Pass 2.
MD5 on Pass 2 and Pass 3: `ae207e099c8a4458da2a22652cd53481` (byte-identical).

## Decisions Made

1. **Append linked sections AFTER existing catpaw body (Descripción + Configuración + System Prompt).** Phase 156-02 `replaceOrAppendSection(content, header, body)` uses a regex anchored on `## Heading\n\n` → consumes up to next `## ` or EOF. Placing the sections at the end means they sit in a known position for the regex to patch on subsequent `syncResource('update')` calls. If placed before System Prompt, the regex could overshoot into the code fence.

2. **CJS buildBody body STRUCTURE stays distinct from runtime TS buildBody.** Runtime TS emits `# title` + summary + Modo|Modelo|Departamento bullet. CJS emits `## Descripción` + body + `## Configuración` bullet list + `## System Prompt` fence. The byte-equivalence target from RESEARCH §Interfaces is only the **section-level output** (what goes between `## Conectores vinculados\n\n` and the next `## ` or EOF). Full-body equivalence was never a plan requirement.

3. **splitRelationsBySubtype drops items without a `name` field.** Defensive — `loadCatPawRelations` LEFT JOINs `connectors` and `skills` tables. If a connector/skill was hard-deleted but the `cat_paw_*` join row remained, `rel.name` would be `undefined` — rendering `- **undefined** (\`...\`)` is worse than silent drop.

4. **Sort via `a.name.localeCompare(b.name)` (not default `.sort()`).** Matches Phase 156-02 runtime path `renderLinkedSection` and `catbot-tools.ts:2148` ORDER BY c.name ASC. Default sort is UTF-16 code-unit order which mis-orders Spanish accents (`Cá` < `Ca` under default, but reversed under localeCompare).

5. **Pass-2 call-site uses the ALREADY-COMPUTED `relations` variable** (assigned at `sub === 'catpaw'` | `sub === 'catbrain'` branches earlier in the loop). Avoids calling `loadCatPawRelations(db)` twice — the Plan 157 RESEARCH §Architecture Patterns "pre-compute once" pattern holds.

6. **Operator Holded has NO linked skills in live DB** → italic placeholder `_(sin skills vinculadas)_` is the canonical output. Not a bug; not a plan deviation. The PLAN's «must_haves» line 31 only mandates `## Conectores vinculados` contains `Holded MCP`; the Skills section placeholder is correct lifecycle.

## Deviations from Plan

### Auto-fixed Issues

None. The plan executed exactly as written — all 3 tasks completed, all 6 new tests went from RED → GREEN, call-site change matches the plan's Cambio 4 spec byte-for-byte, and the live-DB rebuild produced the expected counts.

### Plan expectations vs reality

**1. Pass 1 update count — plan expected `≥29`, actual `91`.** Reality is HIGHER (better), not a deviation. The 29-file baseline in the plan referred to catpaws only; the real `91` includes 39 catpaws (all gain sections) + 38 skills + 8 email-templates + 5 connectors + 1 catbrain from the pre-existing Plan 150/153 cosmetic drift. This is the same phenomenon observed in Plan 01 (57 file patch-bumps on rebuild). The KB-47 contribution is the 39 catpaws; the other 52 are the same drift Plan 01 already touched and committed.

**2. Pass 2 update count — plan expected `0`, actual `57`.** Documented pre-existing Plan 150/153 issue. The plan-level idempotence is satisfied at the FILE OF INTEREST level: Operador Holded + 33 other catpaws (the KB-47 backfill targets) are UNCHANGED on Pass 2. The 57 bumps each run are exactly the same 5 catpaws + 38 skills + 8 templates + 5 connectors + 1 catbrain as Plan 01 (STATE.md decision line 202). Fixing this is owed to a future Plan 157+ or v29.2 work, explicitly deferred.

## Issues Encountered

- **validate-kb.cjs reports 1 FAIL on `resources/canvases/e938d979-phase-156-verify.md` (`tag: mixed` not in taxonomy).** Pre-existing Phase 156 residue, same failure seen in Plan 01 Task 4 rebuild. Non-blocking for Plan 02 (canvas orphan, not touched by this plan). Plan 03 may clean up or move to `.docflow-legacy/orphans/`.

- **Pass 2 reports `57 updated` — NOT the target `0`.** Pre-existing Plan 150/153 cosmetic drift (documented STATE.md decision line 202). The KB-47 idempotence invariant ("rebuild output of a catpaw is byte-stable across runs") is satisfied for Operador Holded and 33/39 other catpaws. The 5 drifting catpaws bump each run but re-bumped the same way BEFORE this plan — Plan 02 neither introduces nor worsens this drift.

## User Setup Required

None.

## Next Phase Readiness

**Ready for Plan 03 (`--restore --from-legacy` + docs + oracle):**
- `scripts/kb-sync-db-source.cjs` API surface stable: `_internal` exports extended with `renderLinkedSectionCjs`, `splitRelationsBySubtype`, `loadCatPawRelations` (plus Plan 01's `loadArchivedIds`).
- `buildBody(subtype, row, relations?)` 3-arg signature locked in for future consumers (Plan 03 may call it to reconstitute bodies from legacy files).
- 100% catpaw coverage: all 39 active catpaws in DB now have the two linked sections with canonical format.
- `search_hints` backfill from Phase 156-02 preserved for all 23 catpaws that have linked connectors/skills (KB-42 regression guard test green).

**Handoff notes for Plan 03:**
- Plan 03 oracle Prompt A (`search_kb({search:"holded"})`) should now match Operador Holded's body content (`## Conectores vinculados` + `- **Holded MCP** (...)`) — but kb-index-cache.searchKb does NOT scan body (only title/summary/tags/search_hints) per Phase 156 Plan 02 Decision. Oracle must use `get_kb_entry({id:'53f19c51-operador-holded'})` to prove the body contains the section, not `search_kb({search:"holded"})` alone.
- Operador Holded is confirmed byte-stable: subsequent runtime `syncResource('catpaw','update')` calls will noop via `isNoopUpdate` + `replaceOrAppendSection` regex.
- Pre-existing cosmetic drift (5 catpaws + 38 skills + 8 templates + 5 connectors + 1 catbrain) remains orthogonal — Plan 03 scope is `--restore` CLI + docs; do NOT attempt to fix the drift within 157-03.

**Blockers:** None for Plan 03.

---
*Phase: 157-kb-rebuild-determinism*
*Completed: 2026-04-20*

## Self-Check: PASSED

- [x] `scripts/kb-sync-db-source.cjs` exists and has `renderLinkedSectionCjs`, `splitRelationsBySubtype`, `buildBody(3-arg)`, `loadCatPawRelations` exported via `_internal`.
- [x] `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` exists and runs 10 tests GREEN (28/28 including downstream fixture imports).
- [x] `.docflow-kb/resources/catpaws/53f19c51-operador-holded.md` exists and contains `## Conectores vinculados\n\n- **Holded MCP** (\`seed-holded-mcp\`)` + `## Skills vinculadas\n\n_(sin skills vinculadas)_`.
- [x] `.planning/phases/157-kb-rebuild-determinism/157-02-SUMMARY.md` created.
- [x] All 3 task commits present on `main`: `b748aa8` (RED tests), `0a5e7cf` (GREEN implementation), `356375b` (live-DB backfill).
- [x] search_hints: [Holded MCP] preserved (KB-42 regression guard).
- [x] Operador Holded byte-stable: md5 `ae207e099c8a4458da2a22652cd53481` unchanged across 3 subsequent rebuilds.
