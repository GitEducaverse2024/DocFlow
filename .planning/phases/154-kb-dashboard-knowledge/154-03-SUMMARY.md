---
phase: 154-kb-dashboard-knowledge
plan: 03
subsystem: testing
tags: [playwright, e2e, pom, knowledge-base, oracle, docker, kb-23, kb-24, kb-25, kb-26, kb-27]

# Dependency graph
requires:
  - phase: 154-kb-dashboard-knowledge
    plan: 01
    provides: Extended KbIndex type + 3 pure libs + sidebar nav + i18n keys
  - phase: 154-kb-dashboard-knowledge
    plan: 02
    provides: /knowledge dashboard UI + /api/knowledge/[id] route handler + 5 client components
provides:
  - Playwright E2E coverage for /knowledge dashboard (8 UI specs covering KB-23/KB-24/KB-26/KB-27)
  - Playwright E2E coverage for GET /api/knowledge/[id] (3 API specs covering KB-25)
  - Page Object Model app/e2e/pages/knowledge.pom.ts
  - 154-VERIFICATION.md with curl oracles + CatBot cross-check + Docker rebuild evidence
  - Phase 154 Dashboard section in .docflow-kb/_manual.md (acceso, funcionalidad, reqs, regeneración)
  - ROADMAP + REQUIREMENTS reflect Phase 154 Complete
affects:
  - Phase 155 (cleanup — inherits green E2E baseline for /knowledge so legacy knowledge removal does not silently break the dashboard)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Playwright POM scoped to <main> locator to avoid sidebar false positives on shared labels like 'Estado'"
    - "Native <select> disambiguation via filter({ has: page.locator('option[value=X]') }) because wrapping <label> text concatenation produces identical accessible names for sibling selects"
    - "Locale cookie plant in beforeEach (context.addCookies) + API Cookie header — bypasses middleware /welcome redirect without modifying global-setup.ts"
    - "KB id fallback chain in API spec: scrape /knowledge HTML first, skip *.js chunk matches, then probe known-stable fallback id so the spec is robust against HTML-format drift"

key-files:
  created:
    - app/e2e/pages/knowledge.pom.ts
    - app/e2e/specs/knowledge.spec.ts
    - app/e2e/api/knowledge.api.spec.ts
    - .planning/phases/154-kb-dashboard-knowledge/154-VERIFICATION.md
  modified:
    - .docflow-kb/_manual.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Playwright selectors use option[value=X] filter on native <select> instead of getByRole('combobox', {name}) because the wrapping <label> with text 'Tipo' also matches 'Subtipo' as substring, triggering strict-mode violations"
  - "Docker rebuild used `docker compose build --no-cache docflow` (service name is `docflow`, not `app` as the plan draft suggested) — prevented an otherwise invisible no-op"
  - "CatBot oracle cross-check accepts kb_entry:null for DB CatPaws whose .docflow-kb/resources/catpaws/ file doesn't exist (Operador Holded case) — same deferred state as Phase 152-04 and 153-04; not a Phase 154 regression. For CatPaws with KB files (e.g. 72ef0fe5-redactor-informe-inbound), 1:1 path↔URL mapping verified."
  - "Auto-approved `checkpoint:human-verify` per objective: auto-advance active, ran oracle myself (Docker build + curl + Playwright), treated user response as 'approved'"
  - "Did NOT modify global-setup.ts despite locale cookie being a pre-existing infra gap — scope-boundary: only Phase 154 specs fix the behaviour for themselves; systemic fix belongs to a separate test-infra phase"

patterns-established:
  - "Phase-154 E2E pattern: UI spec uses KnowledgePage POM + beforeEach cookie plant; API spec uses APIRequestContext + Cookie header + fallback discovery"
  - "POM design: expose select/inputs as Locators disambiguated by option values (not label text) when labels share substrings"

requirements-completed:
  - KB-23
  - KB-24
  - KB-25
  - KB-26
  - KB-27

# Metrics
duration: 20min
completed: 2026-04-20
---

# Phase 154 Plan 03: E2E + Oracle + Close Summary

**Shipped Playwright E2E coverage (11 tests in 3 files) proving /knowledge dashboard + /api/knowledge/[id] route work end-to-end against the Docker stack, auto-approved the human-verify checkpoint with live oracle evidence (Docker rebuild + curl 200/404 + CatBot cross-check), and closed Phase 154 with _manual.md section + ROADMAP + REQUIREMENTS updates.**

## Performance

- **Duration:** ~20 min (1199s wall clock)
- **Started:** 2026-04-20T15:40:25Z
- **Completed:** 2026-04-20T16:00:24Z
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify auto-approved)
- **Files created:** 4 (3 Playwright + VERIFICATION)
- **Files modified:** 3 (_manual, ROADMAP, REQUIREMENTS)

## Accomplishments

- **Playwright coverage live:** 11/11 tests green against dockerized Next.js (3.6s). UI specs cover list rendering + 4 filters (type/status/tags/default-active) + sidebar nav + counts bar + timeline + detail markdown. API specs cover 200 shape + 404 + frontmatter keys.
- **POM primitive for /knowledge:** `app/e2e/pages/knowledge.pom.ts` exposes Locators disambiguated by option values (not label text — Playwright's strict mode rejected `getByLabel('Tipo')` because the wrapping label text concatenation also contained "Subtipo"). POM pattern follows `sidebar.pom.ts` (single class, constructor-initialized readonly Locators, async action helpers).
- **Oracle auto-approved:** Docker rebuild (`docker compose build --no-cache docflow`) completed in 43.7s. Container ready in 268ms. All 6 HTTP oracle probes returned expected codes (200/200/200/200/404/200). CatBot `/api/catbot/chat` invoked `list_cat_paws` successfully; kb_entry paths map 1:1 to `/knowledge/<id>` URLs for entries with committed KB files.
- **_manual.md documented:** New "Phase 154 — Dashboard UI /knowledge (2026-04-20)" section at end of `.docflow-kb/_manual.md` with URL access, functionality list, scope exclusions, 5 requirements covered, regeneration instructions, and locale-cookie middleware note. `validate-kb.cjs` still exits 0 (128 files validated).
- **ROADMAP + REQUIREMENTS cleaned:** Phase 154 checklist item marked `[x]`, progress row `3/3 | Complete | 2026-04-20`, all 3 plan entries `[x]`. REQUIREMENTS KB-23..KB-27 already `[x]` (Plan 01/02 pre-marked them); only the "Last updated" line was bumped to reflect Phase 154 close.

## Task Commits

Each task committed atomically:

1. **Task 1: Playwright POM + UI spec + API spec** — `653df7c` (test) — 3 files created (225 insertions); 11 tests discovered by `npx playwright test --list --grep knowledge`.
2. **Task 2 (checkpoint:human-verify auto-approved): Oracle fix iteration on selectors + cookie** — `1ffc5bf` (fix) — POM refactored to use option-value filters; UI beforeEach plants cookie; API Cookie header + fallback id; 11/11 green.
3. **Task 2 evidence: 154-VERIFICATION.md** — `f2a766e` (docs) — 308-line evidence file with curl outputs, HTTP status table, CatBot transcript, Playwright summary, sign-off line "approved for close 2026-04-20".
4. **Task 3: _manual.md + ROADMAP + REQUIREMENTS** — `7918f5f` (docs) — 51 insertions across 3 files; validate-kb passes.

**Plan metadata commit:** (final — captures SUMMARY + STATE + ROADMAP + REQUIREMENTS final state)

## Files Created/Modified

### Created

- `app/e2e/pages/knowledge.pom.ts` (78 LOC) — Page Object Model for /knowledge; exposes typeSelect/subtypeSelect/statusSelect/audienceSelect/searchInput/resetButton/rowCountLabel/tableRows/countsCards/timelinePlaceholder/timelineChart as readonly Locators; action helpers `goto`, `selectType`, `clickTag`, `clickRowByTitle`, `visibleRowCount`, `firstEntryHref`.
- `app/e2e/specs/knowledge.spec.ts` (120 LOC) — UI E2E describe "UI: Knowledge dashboard (KB-23, KB-24, KB-26, KB-27)" with 8 tests; `beforeEach` plants `docatflow_locale=es` cookie to bypass /welcome middleware.
- `app/e2e/api/knowledge.api.spec.ts` (78 LOC) — API E2E describe "API: GET /api/knowledge/[id] (KB-25)" with 3 tests; discoverFirstEntryId() scrapes HTML (skip *.js chunks) + falls back to known-stable id `72ef0fe5-redactor-informe-inbound`.
- `.planning/phases/154-kb-dashboard-knowledge/154-VERIFICATION.md` (308 LOC) — oracle evidence doc with KB-23/KB-24/KB-25/KB-26/KB-27 sections + Oracle CatBot + Docker rebuild + Playwright summary + HTTP status table + known gaps + sign-off.

### Modified

- `.docflow-kb/_manual.md` — appended "Phase 154 — Dashboard UI /knowledge (2026-04-20)" section (33 lines): acceso URLs, funcionalidad bullets, requirements cubiertos (KB-23..27), cómo regenerar, nota middleware/locale cookie.
- `.planning/ROADMAP.md` — Phase 154 checklist item changed `[ ]` → `[x]`; progress row `2/3 | In Progress` → `3/3 | Complete | 2026-04-20`; all 3 plan list entries `[ ]` → `[x]`.
- `.planning/REQUIREMENTS.md` — "Last updated" footer bumped to reflect Phase 154 close. KB-23..KB-27 were already `[x]` + Complete from Plan 01/02 pre-marks.

## Decisions Made

- **POM selectors use option[value=X] filter** on native `<select>` elements because the wrapping `<label class="flex flex-col">Tipo<select>...` structure produces concatenated accessible names like `"TipoTodosauditconceptguide..."` that overlap across Tipo/Subtipo and caused Playwright strict-mode violations. Filtering by unique option values (`rule` for Tipo, `catpaw` for Subtipo, `deprecated` for Estado, `catbot` for Audiencia) gives deterministic selection without refactoring the UI component.
- **Locale cookie plant is local to Phase 154 specs.** The broader test-infra gap (all spec suites fail without the cookie; `global-setup.ts` doesn't plant it) is out-of-scope per scope-boundary rule — Phase 154 only fixes the behaviour for its own specs. Systemic fix belongs to a later test-infra phase.
- **API spec discovery chain: HTML scrape → skip chunks → fallback id.** The HTML response embeds a Next.js chunk path `/knowledge/page-abc.js` that matched the regex first and yielded 404 on the real API. Fix: skip matches ending in `.js` or containing `.`. Secondary fallback probes a stable committed id (`72ef0fe5-redactor-informe-inbound`) so the spec passes even if HTML format drifts.
- **Auto-approved checkpoint:human-verify per objective.** Executor ran Docker rebuild, curl oracles, Playwright, and CatBot cross-check itself; treated user response as `"approved"` and continued to Task 3. All gates PASSED (HTTP status table in VERIFICATION shows 6/6 matches).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Docker compose service name**
- **Found during:** Task 2 Step A (docker compose build)
- **Issue:** Plan draft said `docker compose build --no-cache app` but the service in `docker-compose.yml` is named `docflow` not `app`. Command exited immediately with `no such service: app` — would have silently skipped rebuild if trusted.
- **Fix:** Rebuild executed as `docker compose build --no-cache docflow` — 43.7s, image `docflow-docflow` tagged, container restarted with new Next.js bundle.
- **Files modified:** None (command-level fix, documented in this SUMMARY)
- **Verification:** `docker logs docflow-app --tail 30` shows `✓ Ready in 268ms`; `/knowledge` returns 200 with new UI.
- **Committed in:** N/A (no code change — lesson captured in SUMMARY + VERIFICATION)

**2. [Rule 3 - Blocking] Playwright POM strict-mode violations on label-text selectors**
- **Found during:** Task 2 Step B (first Playwright run against live stack)
- **Issue:** Initial POM used `page.getByLabel('Tipo', { exact: true })` and `page.getByRole('combobox', { name: 'Tipo' })`. Both selectors matched 2 elements (Tipo AND Subtipo) because native `<select>` wrapped by `<label class="flex flex-col">Tipo<select>...<option>...</option></select></label>` exposes the concatenated text as accessible name, and the accessibility tree does not split on the `<select>` boundary. Strict-mode rejected the ambiguity and aborted click actions.
- **Fix:** Rewrote POM to disambiguate by unique option values: `main.locator('select').filter({ has: page.locator('option[value="rule"]') })` for Tipo, `option[value="catpaw"]` for Subtipo, `option[value="deprecated"]` for Estado, `option[value="catbot"]` for Audiencia. 11/11 specs pass.
- **Files modified:** app/e2e/pages/knowledge.pom.ts, app/e2e/specs/knowledge.spec.ts
- **Verification:** `npx playwright test --grep "knowledge|api/knowledge"` exits 0 with "11 passed".
- **Committed in:** `1ffc5bf` (Task 2 fix commit)

**3. [Rule 3 - Blocking] API spec scraping caught Next.js chunk URL first**
- **Found during:** Task 2 Step B (Playwright API spec failed with 404 on discovered id)
- **Issue:** `html.match(/\/knowledge\/([A-Za-z0-9_\-.]+)"/)` matched `/knowledge/page-39761f39989039f3.js` first (Next.js preload chunk path) — then the API probe hit `/api/knowledge/page-39761f39989039f3.js` which returned 404.
- **Fix:** Use `matchAll` + filter `!endsWith('.js') && !includes('.')` to skip chunk paths, plus fallback to stable committed id `72ef0fe5-redactor-informe-inbound` if primary scrape yields nothing.
- **Files modified:** app/e2e/api/knowledge.api.spec.ts
- **Verification:** API spec 3/3 green.
- **Committed in:** `1ffc5bf` (same Task 2 fix commit)

**4. [Rule 3 - Blocking] Locale cookie middleware redirect**
- **Found during:** Task 2 Step B (first Playwright run — all UI specs 9/11 failed with Page landing on /welcome)
- **Issue:** `app/src/middleware.ts` redirects any request lacking `docatflow_locale` cookie to `/welcome`. Both the Playwright browser context and the `request` fixture started without the cookie, so UI specs saw the onboarding screen and API spec got 307 HTML when scraping.
- **Fix:** UI `beforeEach` calls `context.addCookies([{ name: 'docatflow_locale', value: 'es', domain: 'localhost', path: '/' }])`. API spec adds `headers: { Cookie: 'docatflow_locale=es' }` to the discovery `GET /knowledge` call with `maxRedirects: 0` to catch the 200 before any redirect stripping.
- **Files modified:** app/e2e/specs/knowledge.spec.ts, app/e2e/api/knowledge.api.spec.ts
- **Verification:** Playwright DOM snapshots show `<h1>Knowledge Base</h1>` and sidebar "Knowledge" link; 11/11 pass.
- **Committed in:** `1ffc5bf` (same Task 2 fix commit)

### Out-of-scope deferred

**5. [Scope Boundary] Pre-existing Playwright navigation.spec.ts also fails without locale cookie**
- **Observed during:** Task 2 debug — running `navigation.spec.ts` alone fails with the same `/welcome` redirect.
- **Decision:** NOT fixed in Phase 154. This is test-infra drift (the middleware change that added the locale requirement predates Phase 154; no spec file had cookie-planting). The systemic fix belongs either in `app/e2e/global-setup.ts` (plant cookie via a Page storage-state before all tests) or in each affected POM. Phase 154 scope is ONLY the /knowledge surface; cross-repo test-infra fix is out-of-scope per scope-boundary rule.
- **Logged to:** `.planning/phases/154-kb-dashboard-knowledge/deferred-items.md` (via Plan 02 already had this file; appended if needed)

---

**Total deviations:** 4 auto-fixed (4 Rule-3 blockers — Docker service name, POM strict mode, URL scrape false positive, locale cookie), 1 out-of-scope deferred
**Impact on plan:** All 4 auto-fixes essential to make the specs green against the live stack. No scope creep. All KB-23..KB-27 requirements covered by verified automation.

## Issues Encountered

- **`operador-holded` CatPaw KB file absent:** When CatBot oracle prompt asked for the first active CatPaw's kb_entry, CatBot correctly returned `"Operador Holded"` with `kb_entry: null`. The KB directory `.docflow-kb/resources/catpaws/` contains only 10 catpaws (different ids); the Operador Holded id `53f19c51-9cac-4b23-87ca-cd4d1b30c5ad` was not committed. Pre-existing drift (documented in Phase 152-04 "Oracle evidence accepts kb_entry:null on live catpaws"). Not a Phase 154 issue — verified by picking another committed CatPaw (`72ef0fe5-redactor-informe-inbound`) whose `kb_entry` path resolves correctly and its `/knowledge/<id>` URL renders the same entry.
- **`test-results/` directory pollution:** Playwright accumulates trace.zip + screenshots per failed test. Had to `rm -rf test-results/` between iterations to avoid stale traces confusing JSON parsing. Not a blocker — just a friction point.

## User Setup Required

None — no external service configuration required. Docker stack already running; `.docflow-kb/` volume mount preserved from Phase 153.

## Next Phase Readiness

Phase 154 is fully closed. Phase 155 (KB Cleanup Final) can now:

- Trust that `/knowledge` + `/api/knowledge/[id]` is covered by automated regression tests (11/11 Playwright). Any legacy knowledge removal that breaks dashboard rendering will be caught.
- Reference the Phase 154 section in `.docflow-kb/_manual.md` as the canonical KB UI documentation — onboarding for operators.
- Build on the POM primitive (`app/e2e/pages/knowledge.pom.ts`) when testing cleanup side-effects on the dashboard.

**Milestone status:** v29.1 now has 6/7 phases complete (149, 150, 151, 152, 153, 154). Only Phase 155 remaining to close the KB Runtime Integration milestone.

---
*Phase: 154-kb-dashboard-knowledge*
*Completed: 2026-04-20*

## Self-Check: PASSED

All 4 files claimed created exist on disk (`test -f` verified). All 3 modified files present and current. All 4 task commits reachable via `git log --oneline --all` (`653df7c`, `1ffc5bf`, `f2a766e`, `7918f5f`). Playwright 11/11 specs green. validate-kb.cjs passes 128 files after _manual.md edit.
