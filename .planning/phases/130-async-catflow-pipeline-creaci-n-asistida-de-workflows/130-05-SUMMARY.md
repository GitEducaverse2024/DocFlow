---
phase: 130-async-catflow-pipeline-creaci-n-asistida-de-workflows
plan: 05
subsystem: catbot
tags: [catbot, intent-jobs, async-pipeline, alerts, dashboard, knowledge-ui, oracle]
requires:
  - 130-04 (cross-channel approval + catpaw resume loop)
  - 128 (AlertService singleton)
  - 127 (catbot-knowledge-shell + tab infrastructure)
provides:
  - AlertService.checkStuckPipelines (9th check in tick() array)
  - STUCK_PIPELINE_THRESHOLD_MIN=30 constant
  - GET /api/intent-jobs (force-dynamic) — lists jobs per user_id with parsed progress_message
  - TabPipelines client component — 4th tab in Conocimiento de CatBot, auto-refresh 10s, Ver propuesta link
  - catbot-knowledge-shell.tsx wired with 4th 'pipelines' tab + Workflow icon
  - ES/EN i18n: settings.knowledge.tabs.pipelines
  - catboard.json knowledge-tree concept + endpoint + list_my_jobs tool
affects:
  - app/src/lib/services/alert-service.ts
  - app/src/lib/__tests__/alert-service.test.ts
  - app/src/app/api/intent-jobs/route.ts (NEW)
  - app/src/app/api/intent-jobs/__tests__/list.test.ts (NEW)
  - app/src/components/settings/catbot-knowledge/tab-pipelines.tsx (NEW)
  - app/src/components/settings/catbot-knowledge/catbot-knowledge-shell.tsx
  - app/messages/es.json
  - app/messages/en.json
  - app/data/knowledge/catboard.json
  - app/data/knowledge/settings.json
tech_stack:
  added: []
  patterns:
    - "TDD RED→GREEN for both tasks (test-first with failing commit then implementation commit)"
    - "AlertService check registration via simple push to the checks[] array in tick() — no indirection"
    - "auto-refresh via setInterval 10s in useEffect with cleanup to prevent leaks"
    - "progress_message parsed server-side in the API route so the client component receives a typed object, not a JSON string"
    - "dev fallback to ?user_id=web:default (documented) until project-wide session helper is wired"
    - "Link wraps Button instead of Button asChild={true} because the shadcn Button variant in this repo does not expose asChild"
key_files:
  created:
    - app/src/app/api/intent-jobs/route.ts
    - app/src/app/api/intent-jobs/__tests__/list.test.ts
    - app/src/components/settings/catbot-knowledge/tab-pipelines.tsx
  modified:
    - app/src/lib/services/alert-service.ts
    - app/src/lib/__tests__/alert-service.test.ts
    - app/src/components/settings/catbot-knowledge/catbot-knowledge-shell.tsx
    - app/messages/es.json
    - app/messages/en.json
    - app/data/knowledge/catboard.json
    - app/data/knowledge/settings.json
decisions:
  - "STUCK_PIPELINE_THRESHOLD_MIN=30 matches the other Phase 128 execution thresholds (tasks_stuck=1h, canvas_runs_orphaned=2h). 30 min is intentionally tighter because an intent_job in status='running' is either (a) actively executing a canvas_run whose stale-ness we want to know about long before the 2h canvas threshold, or (b) wedged in finalizeDesign / callLLM — either way, 30 min is plenty of slack."
  - "Registered checkStuckPipelines as the 9th and last check in tick() (after checkIntentsUnresolved) for lexical ordering; the checks array is not order-sensitive because each runs in its own try/catch."
  - "Route does NOT call getServerSession yet — the dev flow is single-user 'web:default' and the plan explicitly allowed the query-param fallback as the dev-facing auth. When session is wired project-wide (future Phase 131+), only this route + the TabPipelines fetch need updating."
  - "TabPipelines hardcodes ?user_id=web:default in the fetch URL. Documented as a dev fallback in the route JSDoc; production session-gating lives in the same place as the rest of the app's auth migration."
  - "Lucide icon Workflow chosen for the 4th tab (mirrors the 'pipeline' metaphor and is visually distinct from Network which is the Knowledge Tree icon)."
  - "Phase badge color map uses dark-mode-friendly bg/text tones consistent with the rest of the Conocimiento de CatBot shell (bg-zinc-900 cards, zinc-100/zinc-300 text)."
  - "Tab state key is 'pipelines' in the TABS tuple + ?ktab=pipelines URL param, so CatBot can deep-link the user straight to the tab via navigate_to('/settings?ktab=pipelines')."
  - "catboard.json was the right knowledge-tree file to update (not settings.json) because the plan specified it explicitly and because the feature is a dashboard surface. settings.json only got an updated_at bump for Task 1 KTREE-02 sync."
metrics:
  duration_minutes: 5
  completed_date: "2026-04-10"
  tasks_total: 3
  tasks_completed: 2
  tests_added: 8
  tests_passing: 55
requirements_covered:
  - PIPE-07 (sustained — post_execution_decision already green in 130-01 + is exercised by oracle step 7-8; this plan closes the visibility side)
  - PIPE-08 (fully — progress_message visible in dashboard tab Pipelines with auto-refresh and in Telegram via 130-04 + AlertService detects stuck pipelines)
---

# Phase 130 Plan 05: AlertService Stuck-Pipeline Detection + Dashboard Tab Pipelines + Oracle Checkpoint Summary

Closes Phase 130 with the final two pieces of visibility plumbing: AlertService now detects pipelines wedged in status='running' for more than 30 minutes (9th health check), and Settings → Conocimiento de CatBot now exposes a 4th tab **Pipelines** that auto-refreshes every 10 seconds so users can see their async CatFlow pipelines progress in real time without having to ask CatBot. Task 3 is the phase-level CatBot-as-oracle checkpoint (per CLAUDE.md protocol).

## What was built

### 1. `alert-service.ts` — new checkStuckPipelines check

Three surgical changes:

- **`STUCK_PIPELINE_THRESHOLD_MIN = 30`** constant added next to the other execution thresholds.
- **`checkStuckPipelines()` static method** querying `catbot.db`:
  ```sql
  SELECT COUNT(*) AS cnt FROM intent_jobs
   WHERE status = 'running'
     AND updated_at < datetime('now', '-30 minutes')
  ```
  If `cnt > 0`, inserts an alert with `category='execution'`, `alert_key='pipelines_stuck'`, `severity='warning'`, and JSON details `{count, threshold_min: 30}`. Dedup is handled by the existing `insertAlert` helper (same pattern as the 8 other checks).
- **Registered in `tick()` checks array** as the 9th entry, after `checkIntentsUnresolved`. Each check still runs in its own try/catch so one failing does not block the others.

### 2. `alert-service.test.ts` — 4 new tests

- `flags running jobs whose updated_at is older than 30 min` — asserts the SQL target + the insert args `('execution', 'pipelines_stuck', ..., 'warning', ...)`
- `does NOT alert when there are no stuck pipelines (count = 0)` — dedup-independent no-insert path
- `dedup: existing unacknowledged alert prevents second insert` — mocks dedup check to return an existing row, asserts no second INSERT
- `is registered in the tick() checks array (9th check)` — spies on checkStuckPipelines and asserts it gets called when `tick()` runs

All 4 tests run against mocked prepare/get/run (same infrastructure as the existing 17 tests in the file). Total AlertService suite: **21 passing**.

### 3. `GET /api/intent-jobs` (`route.ts` — new, 66 lines)

`export const dynamic = 'force-dynamic'` + a minimal GET handler:

1. Resolve user_id: session placeholder (commented, scheduled for Phase 131) → `?user_id=` query param fallback.
2. `return 401 { error: 'Unauthenticated' }` if neither yielded a user_id.
3. `listJobsByUser(userId, { limit: 50 })` — already exists from Plan 01 with the `created_at DESC` ordering.
4. Map each row: parse `progress_message` from JSON (try/catch → `{}` fallback), surface `pipeline_phase`, `status`, `canvas_id`, `channel`, `error`, timestamps.
5. Wrap in outer try/catch → `500 { error: 'Internal error' }` on unexpected failures; logger.error via the already-registered `'intent-job-executor'` LogSource.

The route intentionally does NOT call getServerSession yet — the dev flow is single-user `web:default` and the plan allowed the query-param fallback. When session is wired project-wide, only this route + the TabPipelines fetch URL need updating.

### 4. `list.test.ts` — 5 new integration tests

Same vi.hoisted + vi.mock pattern as `approve.test.ts`. Tests:

1. **401 when unauthenticated** — no session, no query param → returns 401 + `listJobsByUser` never called
2. **returns jobs filtered by user_id query param** — mock returns 2 rows, asserts `listJobsByUser` invoked with `('web:u1', { limit: 50 })` and response has 2 jobs
3. **parses progress_message as object** — asserts `body.jobs[0].progress_message.goal === 'Goal A'` (object shape, not string)
4. **strict user_id scoping** — passes `web:other`, asserts only that user_id was forwarded and listJobsByUser called exactly once
5. **invalid JSON graceful fallback** — `progress_message: 'not-json-at-all'` in the row → route returns `progress_message: {}` instead of crashing

All 5 pass.

### 5. `tab-pipelines.tsx` (new, 168 lines) — 4th Conocimiento de CatBot tab

Client component (`'use client'`) with:

- **State:** `jobs[]`, `loading`, `error`, `lastRefresh`
- **Effect:** fetch `/api/intent-jobs?user_id=web:default` on mount, then `setInterval(load, 10_000)` with cleanup on unmount
- **Loading:** spinning Loader2 + "Cargando pipelines..."
- **Error:** red text + `Reintentar` Button that calls `load()`
- **Empty:** "No hay pipelines activos ni recientes. Cuando CatBot enqueue un async CatFlow aparecera aqui en tiempo real."
- **List:** Card per job with:
  - Title: `progress_message.goal` ?? `tool_name` ?? `Pipeline {id.slice(0,8)}`
  - Metadata row: `channel · formatRelative(created_at) · id.slice(0,8)`
  - **Phase Badge** with color-coded className from `PHASE_COLORS` (11 phases covering every `pipeline_phase` union member + fallback)
  - `progress_message.message` as muted paragraph
  - `error` in red if present
  - **"Ver propuesta" link-wrapped Button** only when `pipeline_phase === 'awaiting_approval'` AND `canvas_id` present → navigates to `/catflow/{canvas_id}`
- **Header row:** pipeline count + "Actualizado hace X min" relative timestamp

`formatRelative(iso)` helper handles 'hace segundos / hace N min / hace N h / hace N d' — consistent with other parts of the app.

### 6. `catbot-knowledge-shell.tsx` — 4th tab registration

- Import: `import { TabPipelines } from './tab-pipelines'`
- Import: added `Workflow` to the existing lucide-react import line
- `TABS` tuple extended with `{ key: 'pipelines', icon: Workflow }`
- `activeTab === 'pipelines' && <TabPipelines />` render branch added

The existing `isValidTab` type guard and `?ktab=` URL param plumbing automatically picks up the new key — no routing logic changes needed. CatBot can now deep-link via `navigate_to('/settings?ktab=pipelines')`.

### 7. i18n — `es.json` + `en.json`

Added `settings.knowledge.tabs.pipelines` = `"Pipelines"` (same in both locales since the term is already loan-word in Spanish CatBot context). Without this key, next-intl would throw MISSING_MESSAGE at tab label render time.

### 8. `catboard.json` — knowledge tree sync (per CLAUDE.md Checklist)

- **endpoints:** added `"GET /api/intent-jobs (lista pipelines async del usuario actual, powers tab-pipelines)"`
- **tools:** added `"list_my_jobs"` (CatBot can already demonstrate the feature via this tool)
- **concepts:** added `"Tab Pipelines: cuarta pestaña en Settings → Conocimiento de CatBot que lista intent_jobs activos + recientes con phase badge, progress_message, y boton 'Ver propuesta' cuando awaiting_approval. Auto-refresh cada 10s. Fuente: GET /api/intent-jobs."`
- **concepts (existing):** bumped the AlertService concept from "7 condiciones" to "9 condiciones (incluye checkIntentsUnresolved y checkStuckPipelines)"
- `updated_at` bumped to `2026-04-10T20:10:00Z`

### 9. `settings.json` — updated_at bump only (Task 1)

`updated_at` → `2026-04-10T20:05:00Z`. `knowledge-tools-sync.test.ts` still green (all 7 pipeline tools plus approve_catpaw_creation still present in `tools[]`).

## Verification

```
$ npx vitest run \
    src/lib/__tests__/alert-service.test.ts \
    src/lib/__tests__/intent-jobs.test.ts \
    src/lib/__tests__/knowledge-tools-sync.test.ts \
    src/app/api/intent-jobs/__tests__/list.test.ts
Test Files  4 passed (4)
     Tests  55 passed (55)
```

```
$ npm run build
✓ Compiled successfully
✓ Generating static pages (32/32)
```

Grep sanity:

- `grep -c "checkStuckPipelines" app/src/lib/services/alert-service.ts` → **3** (constant reference + static method + tick() registration)
- `grep -c "STUCK_PIPELINE_THRESHOLD_MIN" app/src/lib/services/alert-service.ts` → **3**
- `grep -c "force-dynamic" app/src/app/api/intent-jobs/route.ts` → **1**
- `grep -c "TabPipelines" app/src/components/settings/catbot-knowledge/catbot-knowledge-shell.tsx` → **2** (import + render)
- `grep -c "pipelines" app/messages/es.json | head -1` → tab key present

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] shadcn Button in this repo does not expose `asChild` prop**

- **Found during:** Task 2 `npm run build`
- **Issue:** Project's `components/ui/button.tsx` is a plain variants-based Button, not the Radix Slot-wrapped variant. The plan's snippet used `<Button asChild size="sm" variant="outline"><Link href=...>...</Link></Button>` which fails TypeScript with `Property 'asChild' does not exist on type ... ButtonProps`.
- **Fix:** Inverted the wrapping — `<Link><Button size="sm" variant="outline">...</Button></Link>` with `className="inline-block"` on the Link. Same visual/semantic result, clicks still navigate, accessibility unchanged (Link is already a proper anchor).
- **Files modified:** `app/src/components/settings/catbot-knowledge/tab-pipelines.tsx`
- **Commit:** dd92ae0

### Interpretation choices (not strictly deviations)

- **Dev-mode user_id hardcoded in TabPipelines:** Plan mentioned fetching `/api/intent-jobs` without explicit user_id. Because the server route requires it (fallback path) and the project does not yet have a session helper, I hardcoded `?user_id=web:default` in the fetch URL with a JSDoc comment pointing to the future Phase 131 auth migration. When session lands, grep for `web:default` → 2 call sites to update.
- **i18n keys added to both es.json and en.json:** The plan did not mention i18n. Because `catbot-knowledge-shell` renders tab labels via `t(\`tabs.${tab.key}\`)`, a missing 'pipelines' key would render as the raw key string (or throw, depending on next-intl config). Added both locales for safety.
- **Lucide `Workflow` icon chosen:** Plan said "4to tab Pipelines" without specifying an icon. I picked `Workflow` from lucide-react because it visually differentiates from `Network` (Knowledge Tree) and `BookOpen` (Learned). Purely cosmetic.
- **Phase color map dark-mode friendly:** The rest of the shell uses `bg-zinc-900` dark cards with zinc text. The badge color classes in `PHASE_COLORS` match that palette rather than the plan's light pastels.

## Commits

| Hash    | Task | Message                                                                                          |
| ------- | ---- | ------------------------------------------------------------------------------------------------ |
| 0b2072e | 1    | `test(130-05): add failing checkStuckPipelines tests (RED)`                                      |
| 0c2c3d0 | 1    | `feat(130-05): AlertService.checkStuckPipelines + tick registration`                             |
| b7c3f36 | 2    | `test(130-05): add failing GET /api/intent-jobs list tests (RED)`                                |
| dd92ae0 | 2    | `feat(130-05): GET /api/intent-jobs + TabPipelines 4th tab (PIPE-08)`                            |

## Requirements Coverage

- **PIPE-07 (sustained):** Already fully green since Plan 01 (`post_execution_decision` tool with 3 branches). This plan closes the visibility side so users can see the pipeline reach `completed` in the dashboard before being prompted for the lifecycle decision.
- **PIPE-08 (fully):** `progress_message` is now visible in **three** surfaces — (1) the dashboard Pipelines tab with auto-refresh 10s, (2) the Telegram inline keyboard via Plan 04 `sendMessageWithInlineKeyboard`, and (3) the `list_my_jobs` tool. **AlertService detects stuck pipelines** via the new `checkStuckPipelines` check. This requirement is now end-to-end.

## Oracle Verification (CatBot Protocol)

Tasks 1 and 2 are code-complete. Task 3 is the **phase-level `checkpoint:human-verify`** — the 12-step CatBot-as-oracle sequence that exercises the full Phase 130 flow across web, Telegram, architect-retry resume loop, and dashboard tab. See the Checkpoint State section below.

## Checkpoint State (Task 3 — human-verify)

Automated work complete. Task 3 requires a running Docker container + a real Telegram bot + real LiteLLM connectivity to exercise the 12-step oracle sequence. Paste evidence (CatBot responses + screenshots + docker logs) below this line after running the smoke test:

```
[EVIDENCE PENDING — manual oracle run in Task 3]
```

## Self-Check: PASSED

- `app/src/lib/services/alert-service.ts` — FOUND (STUCK_PIPELINE_THRESHOLD_MIN + checkStuckPipelines + tick registration)
- `app/src/lib/__tests__/alert-service.test.ts` — FOUND (4 new tests in describe checkStuckPipelines)
- `app/src/app/api/intent-jobs/route.ts` — FOUND (force-dynamic GET)
- `app/src/app/api/intent-jobs/__tests__/list.test.ts` — FOUND (5 tests)
- `app/src/components/settings/catbot-knowledge/tab-pipelines.tsx` — FOUND (168 lines)
- `app/src/components/settings/catbot-knowledge/catbot-knowledge-shell.tsx` — FOUND (TabPipelines wired as 4th tab)
- `app/messages/es.json` — FOUND (knowledge.tabs.pipelines added)
- `app/messages/en.json` — FOUND (knowledge.tabs.pipelines added)
- `app/data/knowledge/catboard.json` — FOUND (endpoint + concept + list_my_jobs tool + updated_at bump)
- `app/data/knowledge/settings.json` — FOUND (updated_at bump)
- Commit 0b2072e — FOUND (Task 1 RED)
- Commit 0c2c3d0 — FOUND (Task 1 GREEN)
- Commit b7c3f36 — FOUND (Task 2 RED)
- Commit dd92ae0 — FOUND (Task 2 GREEN)
