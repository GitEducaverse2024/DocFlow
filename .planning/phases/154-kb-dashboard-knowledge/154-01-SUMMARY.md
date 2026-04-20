---
phase: 154-kb-dashboard-knowledge
plan: 01
subsystem: ui
tags: [knowledge-base, next14, typescript, vitest, i18n, next-intl, recharts, sidebar, filters]

# Dependency graph
requires:
  - phase: 152-kb-catbot-consume
    provides: kb-index-cache.ts (getKbIndex, getKbEntry, searchKb, parseKbFile) + KbIndexEntry type
  - phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates
    provides: _index.json header shape (counts, top_tags, last_changes)
provides:
  - Extended KbIndex TypeScript interface with header field (KbIndexHeader) — Conflict 1 from RESEARCH resolved at the type level
  - Pure applyKbFilters + collectDistinctTypes/Subtypes/Tags helpers (kb-filters.ts)
  - Pure aggregateChangesByDay helper (kb-timeline.ts) for recharts LineChart consumption
  - Pure formatRelativeTime helper (relative-time.ts) with ISO + SQL tolerance
  - /knowledge navigation entry in sidebar with BookOpen icon
  - 'knowledge' ROUTE_KEY in breadcrumb.tsx
  - i18n keys nav.knowledge + layout.breadcrumb.knowledge in es + en messages
  - 22 vitest unit tests covering 3 pure libs
affects:
  - 154-02-PLAN.md (core UI — imports applyKbFilters, aggregateChangesByDay, formatRelativeTime, KbIndex, KbIndexHeader)
  - 154-03-PLAN.md (E2E specs verify the pure helpers via UI behaviour + API route)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure TS utilities under app/src/lib/ with co-located .test.ts — unit-testable in vitest env=node without jsdom"
    - "Dynamic collectDistinct* helpers over hardcoded enums — absorbs Phase 151 type-enum drift automatically (RESEARCH Conflict 3)"
    - "Type extension over runtime fix-up — extended KbIndex interface, NO runtime changes to kb-index-cache.ts"

key-files:
  created:
    - app/src/lib/kb-filters.ts
    - app/src/lib/kb-filters.test.ts
    - app/src/lib/kb-timeline.ts
    - app/src/lib/kb-timeline.test.ts
    - app/src/lib/relative-time.ts
    - app/src/lib/relative-time.test.ts
    - .planning/phases/154-kb-dashboard-knowledge/deferred-items.md
  modified:
    - app/src/lib/services/kb-index-cache.ts (lines 66-85 — added KbIndexHeader + extended KbIndex)
    - app/src/components/layout/sidebar.tsx (line 7 import BookOpen; line 57 navItems new entry)
    - app/src/components/layout/breadcrumb.tsx (line 11 ROUTE_KEYS + 'knowledge')
    - app/messages/es.json (nav.knowledge + layout.breadcrumb.knowledge)
    - app/messages/en.json (nav.knowledge + layout.breadcrumb.knowledge)

key-decisions:
  - "KbIndex type extension landed in kb-index-cache.ts itself (NOT a parallel kb-types.ts) — single source of truth for the KB contract, consistent with Phase 152 ownership"
  - "Array.from(new Set(...)) over [...new Set(...)] spread — app/tsconfig.json has no explicit target (defaults to ES3 for downlevel check); spread over Set/Map.entries() fails Next 14 build's TS target gate. Rule-3 blocker fix applied inline"
  - "Nav label 'Knowledge' (capitalized English) for BOTH es and en — consistent with existing brand-like nav labels (CatBoard, CatBrains, CatPaw, CatPower) that are rendered in English across both locales"
  - "collectDistinct* helpers derive options dynamically from entries[] — absorbs Phase 151 type-enum drift (RESEARCH Conflict 3: runtime has 9 types, not 10 as docs suggested)"
  - "aggregateChangesByDay types match REAL runtime shape `{id, updated}` — NOT `{version, date, author, reason}` suggested by older prompts (RESEARCH Conflict 2)"

patterns-established:
  - "Pure-TS lib + co-located .test.ts: Plan 02 client components import logic by name (no React test env needed, vitest env=node is sufficient for the whole layer)"
  - "TS type extension is permissible when runtime already emits the data — no runtime churn, no fixture updates (verified: kb-index-cache.test.ts 20/20 still green)"

requirements-completed:
  - KB-23
  - KB-26
  - KB-27

# Metrics
duration: 5min
completed: 2026-04-20
---

# Phase 154 Plan 01: Foundation Summary

**KbIndex type extended with header field (fixes Conflict 1), 3 pure TS libs (kb-filters, kb-timeline, relative-time) with 22 vitest tests, plus sidebar /knowledge nav entry, breadcrumb ROUTE_KEY, and i18n keys (es + en).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-20T15:21:14Z
- **Completed:** 2026-04-20T15:26:30Z
- **Tasks:** 3
- **Files modified:** 12 (7 created, 5 modified)
- **Tests added:** 22 (exceeds the 13-test bar by 9)
- **Tests regression:** 20/20 Phase 152 kb-index-cache still green

## Accomplishments

- **Conflict 1 resolved at type level:** `KbIndex` now exposes `header.counts` + `header.top_tags` + `header.last_changes` — Plan 02 can compile `index.header.counts.catpaws_active` without casts
- **Pure filter layer ready:** `applyKbFilters` + `collectDistinct{Types,Subtypes,Tags}` implement the full D3 filter contract as a unit-testable TypeScript module
- **Timeline aggregation ready:** `aggregateChangesByDay` accepts the real `{id, updated}` runtime shape (not the hypothetical `{version,date,author,reason}` from older prompts), tolerates both ISO + SQL date formats, and sorts ascending for recharts consumption
- **Spanish relative-time formatter:** `formatRelativeTime` handles 'hoy'/'ayer'/'hace N días'/'hace N meses' with graceful fall-through on unparseable input
- **Nav + breadcrumb + i18n wired:** Sidebar has 6th entry with BookOpen icon pointing at /knowledge; breadcrumb ROUTE_KEYS includes 'knowledge'; both es.json and en.json carry the two i18n keys
- **Regression clean:** `cd app && npm run build` exit 0; Phase 152 kb-index-cache.test.ts 20/20 green; 22 new tests green

## Task Commits

Each task committed atomically:

1. **Task 1: Register KB-23..KB-27 + update ROADMAP.md Phase 154 entry** — verification-only (no new work; planner's pre-commit `a3d1b22` already populated the files). Verified `grep -c "^- \[ \] \*\*KB-2[34567]\*\*" .planning/REQUIREMENTS.md` = 5 and `grep -q "^\*\*Requirements\*\*: KB-23, KB-24, KB-25, KB-26, KB-27$" .planning/ROADMAP.md` pass.
2. **Task 2: Extend KbIndex type + create 3 pure TS libs with vitest tests** — `86b7946` (feat) — 7 files created/modified, 22 tests green, Phase 152 regression green.
3. **Task 3: Add sidebar nav entry + breadcrumb + i18n keys (es + en)** — `4909cdc` (feat) — sidebar.tsx + breadcrumb.tsx + es.json + en.json + Rule-3 inline fix in kb-filters.ts / kb-timeline.ts (Array.from instead of spread); build exit 0.

**Plan metadata commit:** (final — captures SUMMARY + STATE + ROADMAP + REQUIREMENTS updates)

## Files Created/Modified

### Created

- `app/src/lib/kb-filters.ts` — `applyKbFilters(entries, state)` + `collectDistinct{Types,Subtypes,Tags}(entries[, type|max])`; pure TS, imports only `KbIndexEntry` type.
- `app/src/lib/kb-filters.test.ts` — 13 tests across 2 describe blocks (applyKbFilters × 7, collectDistinct × 5 wait — actually 13 test cases total across the file: 7 applyKbFilters + 5 collectDistinct + 1 bonus audience).
- `app/src/lib/kb-timeline.ts` — `aggregateChangesByDay(changes)` with ISO + SQL tolerance, null-safe.
- `app/src/lib/kb-timeline.test.ts` — 4 tests: aggregate / empty / SQL format / malformed-date skip.
- `app/src/lib/relative-time.ts` — `formatRelativeTime(updated)` Spanish helper.
- `app/src/lib/relative-time.test.ts` — 6 tests: hoy / ayer / days / months / SQL tolerance / unparseable fall-through.
- `.planning/phases/154-kb-dashboard-knowledge/deferred-items.md` — logs pre-existing Phase 153 catbrains migration drift observed during build (out of scope for this plan).

### Modified

- `app/src/lib/services/kb-index-cache.ts` — added `export interface KbIndexHeader {...}` and extended `KbIndex` with `generated_at?`, `generated_by?`, `header: KbIndexHeader`. Lines 66-94. No runtime changes; purely type-level fix for Conflict 1.
- `app/src/components/layout/sidebar.tsx` — imported `BookOpen` from lucide-react (line 7), added 6th navItems entry `{ href: '/knowledge', labelKey: 'knowledge' as const, icon: BookOpen }` after /catpower (line 57).
- `app/src/components/layout/breadcrumb.tsx` — added `'knowledge'` to `ROUTE_KEYS` (line 11).
- `app/messages/es.json` — added `"knowledge": "Knowledge"` under `nav` and under `layout.breadcrumb`.
- `app/messages/en.json` — added `"knowledge": "Knowledge"` under `nav` and under `layout.breadcrumb`.

## Decisions Made

- **Extension point for KbIndex = kb-index-cache.ts itself** (not a separate kb-types.ts). Phase 152 owns the file; keeping the type next to its runtime producer avoids a second source of truth. Verified zero callers construct `KbIndex`-typed literals (only functional API is used), so the extension is safe.
- **Array.from over spread:** The tsconfig has no explicit `target`, so Next 14's `next build` TS check rejects `[...new Set(...)]` and `[...map.entries()]`. Using `Array.from(...)` is equivalent, supported at any target, and keeps behaviour identical — 22 tests still green after refactor.
- **Nav label 'Knowledge' in both locales:** Consistent with existing brand-like labels CatBoard/CatBrains/CatPaw/CatPower that stay English in both es and en. Avoids translating a KB brand identity that is otherwise English across the project.
- **Empty `status` filter ≠ 'active' default:** `applyKbFilters` delegates the "default active" decision to the caller (Plan 02 will pass `status: 'active'` when the user hasn't overridden). The pure helper stays semantics-pure.
- **Aggregation output sorted ascending:** recharts expects ascending X axis; sorting inside `aggregateChangesByDay` keeps consumers trivial.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Spread over Set / Map.entries() rejected by Next 14 TS target check**
- **Found during:** Task 3 (step 3.5 — `npm run build`)
- **Issue:** `kb-filters.ts` + `kb-timeline.ts` used `[...new Set(...)]` and `[...map.entries()]`. `app/tsconfig.json` declares no explicit `target`, so Next 14's internal TypeScript defaults to ES3 for downlevel iteration checks and fails with: `Type 'Set<string>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher`. Unit tests had passed (vitest runs Node 20 where Set is iterable), but `next build` blocked deployment.
- **Fix:** Replaced all 4 spread occurrences with `Array.from(...)`: `collectDistinctTypes`, `collectDistinctSubtypes`, `collectDistinctTags` (3 sites in kb-filters.ts) + `aggregateChangesByDay` (1 site in kb-timeline.ts). Semantically identical output; no new runtime behaviour.
- **Files modified:** app/src/lib/kb-filters.ts, app/src/lib/kb-timeline.ts
- **Verification:** 22 vitest tests still green after refactor; `npm run build` exit 0 ("Compiled successfully"). Also preserved all test expectations.
- **Committed in:** `4909cdc` (Task 3 commit — combined with i18n/sidebar changes per Task 3 scope)

### Out-of-scope deferred

**2. [Scope Boundary] Pre-existing Phase 153 catbrains migration column-count drift**
- **Found during:** Task 3 `npm run build` static-generation phase
- **Symptom:** `[logger-fallback] Migration error: table catbrains has 23 columns but 18 values were supplied` repeated ~50 times
- **Decision:** NOT fixed here — Plan 01 never touched catbrains code. Build still exits 0. Logged to `.planning/phases/154-kb-dashboard-knowledge/deferred-items.md` for a future phase/hotfix. Obeys the scope-boundary rule: only auto-fix issues caused by this task.

---

**Total deviations:** 1 auto-fixed (Rule 3 blocker — TS downlevel iteration), 1 out-of-scope deferred
**Impact on plan:** No scope creep. Rule-3 fix was required to land the plan; the deferred item documents a pre-existing issue for visibility. All success criteria met.

## Issues Encountered

- **Initial kb-filters.test.ts search test over-matched (before fix):** In the first test-fixture draft, the `search: 'HOLDED'` test expected only entry `a` but the default `makeEntry` summary was `'CatPaw generalista Holded MCP'` so ALL five entries inherited it and matched. Fixed by explicitly overriding `summary` per-entry in the `base` fixture. Caught in the first GREEN run (RED → GREEN iteration). Not a plan deviation — just tightened test determinism.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Plan 02 can now:

```typescript
// All of these resolve with no TS errors:
import type { KbIndex, KbIndexEntry, KbIndexHeader } from '@/lib/services/kb-index-cache';
import { applyKbFilters, collectDistinctTypes, collectDistinctSubtypes, collectDistinctTags } from '@/lib/kb-filters';
import type { KbFilterState } from '@/lib/kb-filters';
import { aggregateChangesByDay } from '@/lib/kb-timeline';
import type { TimelineDay } from '@/lib/kb-timeline';
import { formatRelativeTime } from '@/lib/relative-time';
```

- Sidebar already shows the `/knowledge` link (will 404 until Plan 02 creates the page route) — visually verifiable in the dev server.
- Breadcrumb under `/knowledge` and `/knowledge/[id]` routes will render "Knowledge" correctly in both locales.
- No blockers for Plan 02; suggested entry point is `app/src/app/knowledge/page.tsx` as a server component consuming `getKbIndex()` and passing `index.entries` / `index.header` to the client components to be built.

---
*Phase: 154-kb-dashboard-knowledge*
*Completed: 2026-04-20*

## Self-Check: PASSED

All 13 files claimed created/modified exist on disk. Both task commits (`86b7946`, `4909cdc`) are reachable via `git log --oneline --all`. `KbIndexHeader` interface is present in `app/src/lib/services/kb-index-cache.ts` and the `KbIndex` interface references it via `header: KbIndexHeader`.
