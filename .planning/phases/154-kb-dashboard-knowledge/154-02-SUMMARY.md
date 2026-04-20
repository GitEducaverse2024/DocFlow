---
phase: 154-kb-dashboard-knowledge
plan: 02
subsystem: ui
tags: [knowledge-base, next14, typescript, react-markdown, recharts, server-components, client-components, dashboard]

# Dependency graph
requires:
  - phase: 154-kb-dashboard-knowledge
    plan: 01
    provides: Extended KbIndex type + KbIndexHeader, 3 pure libs (kb-filters, kb-timeline, relative-time), sidebar /knowledge nav + i18n
  - phase: 152-kb-catbot-consume
    provides: kb-index-cache.ts (getKbIndex, getKbEntry, GetKbEntryResult shape)
provides:
  - /knowledge page.tsx (server component with CountsBar + Timeline + Table composition)
  - /knowledge/[id] page.tsx (server component with manual breadcrumb + detail)
  - GET /api/knowledge/[id] (200 with GetKbEntryResult shape | 404 NOT_FOUND)
  - 5 client components under app/src/components/knowledge/
affects:
  - 154-03-PLAN.md (Playwright E2E targets these routes; docker rebuild gate)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server component + direct service import (not fetch): /knowledge/*/page.tsx calls getKbIndex() / getKbEntry() from the Node-only kb-index-cache module — zero round-trips, TTL cache stays warm"
    - "Client components receive plain JSON props; interactivity state (filters, metadata toggle) owned via useState inside the client tree"
    - "Native <select> + <table> over shadcn Radix Select / shadcn Table — avoids Pitfall 5 (Radix empty-value edge case) and keeps 0 new deps for 128 rows"
    - "Dynamic enum derivation: collectDistinctTypes(entries) + collectDistinctSubtypes(entries, type) absorb Phase 151 type-enum drift at runtime (Conflict 3)"
    - "export const dynamic = 'force-dynamic' on all 3 route-level files prevents static prerender of the KB (Pitfall 4)"

key-files:
  created:
    - app/src/app/knowledge/page.tsx
    - app/src/app/knowledge/[id]/page.tsx
    - app/src/app/api/knowledge/[id]/route.ts
    - app/src/components/knowledge/KnowledgeCountsBar.tsx
    - app/src/components/knowledge/KnowledgeTimeline.tsx
    - app/src/components/knowledge/KnowledgeFilters.tsx
    - app/src/components/knowledge/KnowledgeTable.tsx
    - app/src/components/knowledge/KnowledgeDetail.tsx
  modified:
    - .planning/phases/154-kb-dashboard-knowledge/deferred-items.md (appended Plan 02 Task 2 observation)

key-decisions:
  - "PageHeader signature accepts {title, description, icon?, action?} — icon prop is supported; added <BookOpen className='w-8 h-8' /> to /knowledge header"
  - "KnowledgeCountsBar is server-safe (no state, no handlers) — kept under components/knowledge/ for path consistency but does NOT need 'use client'"
  - "KnowledgeTable owns filter state via useState — default {status:'active', tags:[], search:''} per CONTEXT D3; filter state NOT persisted to URL (D3 scope decision)"
  - "KnowledgeFilters render native <select> (not shadcn Radix Select) — sidesteps Pitfall 5 and matches KnowledgeTable's direct callback passthrough"
  - "KnowledgeDetail deprecated banner: flex layout with AlertTriangle + amber-500 palette; status derived from frontmatter (not from _index.json entry row) because detail page already has full frontmatter"
  - "Manual breadcrumb in /knowledge/[id]/page.tsx (Dashboard > Knowledge > <title>) — bypasses Breadcrumb auto-render which would show raw slug (Pitfall 6 mitigation)"
  - "API route is byte-for-byte the catbrains/[id]/route.ts pattern — 22 LOC; no auth, no retry wrapper (read-only filesystem via kb-index-cache cache)"

requirements-completed:
  - KB-23
  - KB-24
  - KB-25
  - KB-26

# Metrics
duration: 5min
completed: 2026-04-20
---

# Phase 154 Plan 02: /knowledge Dashboard UI Summary

**Shipped the full /knowledge dashboard UI — 3 Next.js route-level files (1 server list, 1 server detail, 1 GET handler) + 5 client components (CountsBar, Timeline, Filters, Table, Detail) — composed over Plan 01's pure libs. `npm run build` exit 0; all 22 Plan 01 unit tests and all 152 KB-suite tests still green.**

## Performance

- **Duration:** ~5 min (331s wall clock)
- **Started:** 2026-04-20T15:30:47Z
- **Completed:** 2026-04-20T15:36:18Z
- **Tasks:** 2
- **Files created:** 8
- **Files modified:** 1 (deferred-items.md)
- **Total LOC added:** 715 (per `wc -l`)

## Accomplishments

- **UI fully live:** `/knowledge` renders 8-card counts bar + recharts LineChart timeline + filterable 128-entry table with badges/tags/relative-time; `/knowledge/[id]` renders manual breadcrumb + deprecated banner (conditional) + markdown body (react-markdown + remarkGfm + prose prose-invert prose-sm) + related_resolved table + collapsible metadata
- **API surface ready:** `GET /api/knowledge/[id]` 200 with `{id, path, frontmatter, body, related_resolved}` shape matching `GetKbEntryResult`, 404 `{error:'NOT_FOUND', id}` on miss — byte-for-byte the canonical catbrains/[id]/route.ts pattern
- **Server/client split respected:** page.tsx + [id]/page.tsx are server components importing kb-index-cache directly (Node-only FS reads); client components (Table, Filters, Timeline, Detail) marked `'use client'` receive plain JSON and own useState interactivity
- **Dynamic enum drift absorbed:** KnowledgeFilters derives `type` options via `collectDistinctTypes(entries)` — Phase 151 runtime has 9 types (audit, concept, taxonomy, guide, incident, protocol, resource, rule, runtime), NOT the 10 hypothetical types from older prompts; dynamic derivation means 0 code change if Phase 155 adds or removes types
- **Dark theme consistency:** Timeline palette (#27272a/#18181b/#71717a grid, #8B6D8B accent line) matches `app/src/app/page.tsx:239-270` BarChart; table badges use existing type/status color map; CountsBar cards use bg-zinc-900 border-zinc-800 (shadcn Card default theme)
- **Regression clean:** `npm run build` exits 0 with "Compiled successfully"; all 22 Plan 01 pure-lib tests green; all 152 KB-suite tests green (kb-index-cache, kb-tools, kb-tools-integration, kb-hooks-tools, kb-hooks-api-routes, kb-audit, catbot-tools-query-knowledge, knowledge-sync, kb-sync-cli, kb-sync-db-source)

## Task Commits

Each task committed atomically:

1. **Task 1: Build 5 client components + 2 server pages + 1 API route** — `57d23a1` (feat) — 8 files created, 715 LOC; `npm run build` exit 0 on first try, no TS errors, no new ESLint warnings in the knowledge files.
2. **Task 2: Smoke-test build output + regression suite** — `083d117` (chore) — Plan 01 libs 22/22 green, KB suite 152/152 green, build exit 0. Full repo suite surfaced 10 pre-existing failures in 3 unrelated service tests (alias-routing, catbot-holded-tools, task-scheduler); verified pre-existing via `git stash` comparison and logged to `deferred-items.md` per scope-boundary rule.

**Plan metadata commit:** (final — captures SUMMARY + STATE + ROADMAP + REQUIREMENTS updates)

## Files Created/Modified

### Created

- `app/src/app/knowledge/page.tsx` (53 LOC) — server component entry; reads `getKbIndex()`; composes `<PageHeader icon={<BookOpen/>}>` + `<KnowledgeCountsBar>` + `<KnowledgeTimeline>` + `<KnowledgeTable>`; empty-state branch when `_index.json` missing; `export const dynamic = 'force-dynamic'`.
- `app/src/app/knowledge/[id]/page.tsx` (51 LOC) — server component detail; reads `getKbEntry(id)`; resolves title from frontmatter (handles `title: string`, `title.{es,en}`, fallback to id); manual breadcrumb (Dashboard > Knowledge > title) with `<ChevronRight>` separators; `notFound()` on miss; `export const dynamic = 'force-dynamic'`.
- `app/src/app/api/knowledge/[id]/route.ts` (22 LOC) — canonical catbrains pattern; delegates to `getKbEntry(id)`; returns `NextResponse.json(entry)` on hit or `{error:'NOT_FOUND', id}` status 404 on miss; `export const dynamic = 'force-dynamic'`.
- `app/src/components/knowledge/KnowledgeCountsBar.tsx` (40 LOC) — server-safe; renders 8 shadcn `<Card bg-zinc-900 border-zinc-800>` from `header.counts` via `Object.entries(LABELS)`; Spanish labels `catpaws_active` → `CatPaws activos` etc.
- `app/src/components/knowledge/KnowledgeTimeline.tsx` (68 LOC) — `'use client'`; recharts `ResponsiveContainer` + `LineChart` + `CartesianGrid` + `XAxis` (tickFormatter slices to MM-DD) + `YAxis allowDecimals={false}` + `RechartsTooltip` (dark theme bg #18181b border #3f3f46) + `Line stroke="#8B6D8B"`; empty-placeholder when `aggregateChangesByDay` returns `[]`.
- `app/src/components/knowledge/KnowledgeFilters.tsx` (153 LOC) — `'use client'`; 4 native `<select>` (Tipo, Subtipo, Estado, Audiencia) + 1 shadcn `<Input>` (Búsqueda) + `<Button variant="outline">` Reset + chip tag toggles; `types` derived via `useMemo(() => collectDistinctTypes(entries))`; `subtypes` via `collectDistinctSubtypes(entries, state.type)` (dependent); `topTags` via `collectDistinctTags(entries, 25)`; reset sets `{tags:[], search:''}`.
- `app/src/components/knowledge/KnowledgeTable.tsx` (137 LOC) — `'use client'`; `useState<KbFilterState>({status:'active', tags:[], search:''})`; renders `<KnowledgeFilters>` + count header + native `<table>` with 6 columns (Título link → `/knowledge/[id]`, Tipo badge, Subtipo badge, Estado badge, Tags chips ≤3 + "+N", Actualizado via `formatRelativeTime`); TYPE_COLORS and STATUS_COLORS palette maps; empty-state row when `filtered.length === 0`.
- `app/src/components/knowledge/KnowledgeDetail.tsx` (191 LOC) — `'use client'`; conditional deprecated banner (AlertTriangle + amber-500 palette) when `fm.status === 'deprecated'`, includes `deprecated_reason` and `superseded_by` link; header with type/subtype/status badges + tags + summary; `<div className="prose prose-invert prose-sm max-w-none">` wrapping `<ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.body}</ReactMarkdown>` (canonical repo pattern); related_resolved `<table>` with links; collapsible metadata (ChevronRight/Down toggle, version/createdAt/updatedAt via `formatRelativeTime`, change_log list).

### Modified

- `.planning/phases/154-kb-dashboard-knowledge/deferred-items.md` — appended Plan 02 Task 2 observation (3 unrelated service-layer tests failing pre-commit; verified pre-existing via `git stash`).

## Decisions Made

- **PageHeader icon prop is supported** — verified `app/src/components/layout/page-header.tsx` signature `{title, description, icon?, action?}`. Used `<BookOpen className="w-8 h-8"/>` in both branches (empty-state and populated).
- **KnowledgeCountsBar stays server-safe** — no `'use client'` directive; pure render from props. Kept under `components/knowledge/` for path consistency but does NOT incur client-bundle cost.
- **Default filter state `{status:'active', tags:[], search:''}`** in KnowledgeTable — per CONTEXT D3 ("default active, usuario puede cambiar a deprecated manualmente"). Consistent with `searchKb()` server-side default (`kb-index-cache.ts:311`).
- **Native `<select>` over shadcn Radix Select** — avoids Pitfall 5 (Radix rejects `value=""` for "clear"). Native accepts `value=""` as "no filter" cleanly; `e.target.value || undefined` maps back to `KbFilterState` shape. Accessibility tradeoff is acceptable for a read-only internal dashboard.
- **Native `<table>` over `npx shadcn add table`** — 128 rows need no virtualization; shadcn table is not installed in the repo; keeping 0 new deps aligns with RESEARCH §Standard Stack recommendation.
- **Manual breadcrumb in detail page** — bypasses `<Breadcrumb/>` component which would render raw kebab-case slug `72ef0fe5-redactor-informe-inbound`. Manual nav shows real frontmatter.title truncated to max-w-[380px] (Pitfall 6).
- **Type title resolution in [id]/page.tsx** — handles string, `{es,en}` object, and fallback to id in precedence order. Same pattern as `KnowledgeDetail.pickSummary`.

## Deviations from Plan

None — plan executed exactly as written. All 8 files written in the order and shape prescribed by the PLAN.md `<action>` block; `npm run build` exit 0 on first try with no auto-fix needed.

### Out-of-scope deferred

**1. [Scope Boundary] Pre-existing 3-file test failure (alias-routing, catbot-holded-tools, task-scheduler)**
- **Found during:** Task 2 full `npm run test:unit`
- **Symptom:** 10 test failures across 3 service test files
- **Verification:** Reproduced with `git stash` at parent commit — same 10 failures before Plan 02 touched the tree, confirming pre-existing.
- **Decision:** NOT fixed — Plan 02 never touched any of these files (scope is `app/src/app/knowledge/`, `app/src/app/api/knowledge/`, `app/src/components/knowledge/`). Logged to `.planning/phases/154-kb-dashboard-knowledge/deferred-items.md`.

## Issues Encountered

- **None.** Build compiled successfully on first run. No TypeScript errors, no ESLint warnings in the new knowledge files. No auto-fix iterations required.

## Pitfalls Hit

- **Pitfall 5 (Radix Select empty-value):** Sidestepped by using native `<select>` throughout `KnowledgeFilters.tsx`. Accepts `value=""` cleanly; mapped to `KbFilterState` via `e.target.value || undefined`.
- **Pitfall 6 (Breadcrumb auto-generated shows slug):** Sidestepped by writing manual breadcrumb in `/knowledge/[id]/page.tsx` — shows real frontmatter.title with truncation.
- **Pitfall 4 (Next.js static prerender):** `export const dynamic = 'force-dynamic';` added at the TOP of all 3 route-level files (page.tsx, [id]/page.tsx, route.ts).

Pitfalls 1, 2, 3 were already handled at the type/helper level in Plan 01 (KbIndexHeader interface + aggregateChangesByDay over `{id, updated}` shape + dynamic `collectDistinctTypes` helpers).

## Build Output (last 20 lines)

```
├ ƒ /knowledge                                                12.2 kB         247 kB
├ ƒ /knowledge/[id]                                           3.91 kB         153 kB
├ ƒ /notifications                                            7.49 kB         182 kB
...
+ First Load JS shared by all                                 87.6 kB
  ├ chunks/2117-c1f8a6d2e8170b03.js                           31.9 kB
  ├ chunks/fd9d1056-42a116997ca5d238.js                       53.6 kB
  └ other shared chunks (total)                               2.03 kB

ƒ Middleware                                                  26.8 kB

ƒ  (Dynamic)  server-rendered on demand
```

Both `/knowledge` and `/knowledge/[id]` show the ƒ marker (Dynamic — server-rendered on demand), confirming `export const dynamic = 'force-dynamic'` took effect.

## Readiness Statement for Plan 03

UI is live at compile-time; no runtime gate on the dev server. Plan 03 can now:

- Run `docker compose build --no-cache app && docker compose up -d` to boot the dockerized stack with the new routes.
- Target Playwright E2E against `http://localhost:3500/knowledge` (list), `http://localhost:3500/knowledge/<id>` (detail), and `GET http://localhost:3500/api/knowledge/<id>` (API).
- Use the 9 concrete E2E test matrix from RESEARCH §Phase Requirements → Test Map (KB-23..KB-27 × behaviors).
- `/knowledge` sidebar link (wired by Plan 01) navigates without 404.

**No blockers for Plan 03.** The CatBot oracle prompt from CONTEXT §D11 (step 10: "¿Cuántos CatPaws activos hay en el Knowledge Base?") can run against the dockerized /knowledge dashboard to prove UI + CatBot pointing at the same KB.

---
*Phase: 154-kb-dashboard-knowledge*
*Completed: 2026-04-20*

## Self-Check: PASSED

All 8 created files + 1 modified file verified on disk via `test -f`. Both task commits (`57d23a1` feat, `083d117` chore) verified via `git log --oneline --all | grep`. Build exit 0 confirmed on both Task 1 (end of build) and Task 2 (second invocation). All 22 Plan 01 unit tests and all 152 KB-suite regression tests passing.
