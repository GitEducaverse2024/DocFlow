---
phase: 154
slug: kb-dashboard-knowledge
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 154 — Validation Strategy

> Per-phase validation contract. Derived from `154-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Unit framework** | vitest 4.1.0, env `node` (no jsdom, no @testing-library/react) |
| **E2E framework** | Playwright 1.58.2, baseURL `http://localhost:3500` |
| **Unit config** | `app/vitest.config.ts` (globs `src/**/*.test.ts`) |
| **E2E config** | `app/playwright.config.ts` (testDir `app/e2e/`) |
| **Quick unit** | `cd app && npm run test:unit` |
| **Quick E2E** | `cd app && npm run test:e2e -- --grep "knowledge"` |
| **Full suite** | `cd app && npm run test:unit && npm run test:e2e` |
| **Estimated runtime** | unit ~60s / E2E Phase 154 scoped ~30-60s |

**Critical constraint:** vitest env=node → React component unit tests NOT feasible. Strategy: extract pure TS logic (filters, timeline, time) → vitest unit tests; UI behavior → Playwright E2E specs.

---

## Sampling Rate

- **After every task commit:** `cd app && npm run test:unit -- --changed` + `npm run build` (ESLint + TS compile gate)
- **After every plan wave:** full unit + E2E knowledge scope
- **Before `/gsd:verify-work`:** full unit + full E2E + oracle CatBot manual nav (Docker rebuild + browse `/knowledge` + click entry)
- **Max feedback latency:** 60s unit / 60s E2E scoped / 3min full

---

## Per-Task Verification Map

Assumed 3-plan structure (planner finalizes):
- **Plan 01 (Wave 1) Foundation:** register KB-23..KB-27 + extend KbIndex type + 3 pure TS libs + i18n keys + sidebar nav entry.
- **Plan 02 (Wave 2) Core UI:** `/knowledge/page.tsx` + `/knowledge/[id]/page.tsx` + 4 client components + `GET /api/knowledge/[id]`.
- **Plan 03 (Wave 3) Validation + Oracle:** Playwright E2E + oracle CatBot manual + `_manual.md` update + phase close.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 154-01-01 | 01 | 1 | KB-23..KB-27 | doc | `grep -c "KB-2[34567]" .planning/REQUIREMENTS.md` >=5 | N/A | ⬜ |
| 154-01-02 | 01 | 1 | KB-23 type safety | unit | `cd app && npx vitest run src/lib/kb-filters.test.ts` | ❌ W0 | ⬜ |
| 154-01-03 | 01 | 1 | KB-26 timeline | unit | `cd app && npx vitest run src/lib/kb-timeline.test.ts` | ❌ W0 | ⬜ |
| 154-01-04 | 01 | 1 | KB-23 time fmt | unit | `cd app && npx vitest run src/lib/relative-time.test.ts` | ❌ W0 | ⬜ |
| 154-01-05 | 01 | 1 | KB-27 nav | unit/typecheck | `cd app && grep -n "nav.knowledge\|/knowledge" src/components/layout/sidebar.tsx messages/es.json messages/en.json` — presence check | ❌ W0 | ⬜ |
| 154-02-01 | 02 | 2 | KB-23 | E2E | `cd app && npx playwright test e2e/specs/knowledge.spec.ts -g "lista"` | ❌ W0 | ⬜ |
| 154-02-02 | 02 | 2 | KB-23 | E2E | `... -g "filter type"` | ❌ W0 | ⬜ |
| 154-02-03 | 02 | 2 | KB-23 | E2E | `... -g "filter tags AND"` | ❌ W0 | ⬜ |
| 154-02-04 | 02 | 2 | KB-23 | E2E | `... -g "filter status default active"` | ❌ W0 | ⬜ |
| 154-02-05 | 02 | 2 | KB-24 | E2E | `... -g "detail markdown body"` | ❌ W0 | ⬜ |
| 154-02-06 | 02 | 2 | KB-24 | E2E | `... -g "detail deprecated banner"` | ❌ W0 | ⬜ |
| 154-02-07 | 02 | 2 | KB-24 | E2E | `... -g "detail related_resolved links"` | ❌ W0 | ⬜ |
| 154-02-08 | 02 | 2 | KB-25 | integration | `cd app && npx playwright test e2e/api/knowledge.api.spec.ts -g "200"` | ❌ W0 | ⬜ |
| 154-02-09 | 02 | 2 | KB-25 | integration | `... -g "404"` | ❌ W0 | ⬜ |
| 154-02-10 | 02 | 2 | KB-25 | integration | `... -g "shape"` | ❌ W0 | ⬜ |
| 154-02-11 | 02 | 2 | KB-26 | E2E | `... -g "counts bar 8 cards"` | ❌ W0 | ⬜ |
| 154-02-12 | 02 | 2 | KB-26 | E2E | `... -g "timeline renders"` | ❌ W0 | ⬜ |
| 154-02-13 | 02 | 2 | KB-27 | E2E | `... -g "sidebar link navigates"` | ❌ W0 | ⬜ |
| 154-02-14 | 02 | 2 | build | ci gate | `cd app && npm run build` exit 0 (ESLint + TS) | existing | ⬜ |
| 154-03-01 | 03 | 3 | all | regression | `cd app && npm run test:unit` (all pre-existing + new) | existing | ⬜ |
| 154-03-02 | 03 | 3 | all | E2E full | `cd app && npx playwright test --grep "knowledge|api/knowledge"` | ❌ W0 | ⬜ |
| 154-03-03 | 03 | 3 | oracle | checkpoint:human-verify | Docker rebuild + manual browse `/knowledge`, aplicar 2 filtros, click entry, ver detalle; paste evidence to `154-VERIFICATION.md` | N/A | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/kb-filters.ts` — pure filter functions (type, subtype, tags AND-match, audience, status default active, search case-insensitive, reset)
- [ ] `app/src/lib/kb-filters.test.ts` — 6+ unit tests
- [ ] `app/src/lib/kb-timeline.ts` — pure aggregate `last_changes[]` → `{date, count}[]` grouped by day, handles SQL format dates
- [ ] `app/src/lib/kb-timeline.test.ts` — 3 tests: aggregate / empty / SQL format
- [ ] `app/src/lib/relative-time.ts` — formatRelativeTime helper (hoy/ayer/N días/N meses)
- [ ] `app/src/lib/relative-time.test.ts` — 4 tests
- [ ] `app/src/lib/services/kb-index-cache.ts` — EXTEND `KbIndex` interface to include `header` field (Conflict #1 from RESEARCH; ~10-line edit, non-breaking)
- [ ] `app/src/app/knowledge/page.tsx` — server component entry
- [ ] `app/src/app/knowledge/[id]/page.tsx` — detail server component
- [ ] `app/src/app/api/knowledge/[id]/route.ts` — GET handler
- [ ] `app/src/components/knowledge/KnowledgeTable.tsx` — client component with filters state
- [ ] `app/src/components/knowledge/KnowledgeDetail.tsx` — client react-markdown wrapper
- [ ] `app/src/components/knowledge/KnowledgeTimeline.tsx` — recharts LineChart wrapper
- [ ] `app/src/components/knowledge/KnowledgeCountsBar.tsx` — 8 Card counts
- [ ] `app/src/components/knowledge/KnowledgeFilters.tsx` — filter panel (if extracted)
- [ ] `app/src/components/layout/sidebar.tsx` — EDIT: add `{ href: '/knowledge', label: t('nav.knowledge'), icon: BookOpen }` to `navItems` array (L51-57)
- [ ] `app/messages/es.json` — ADD key `nav.knowledge: "Knowledge Base"` (or similar) + breadcrumb
- [ ] `app/messages/en.json` — ADD same keys in English
- [ ] `app/e2e/specs/knowledge.spec.ts` — UI E2E spec using POM pattern
- [ ] `app/e2e/api/knowledge.api.spec.ts` — API E2E spec (GET /api/knowledge/[id])
- [ ] `app/e2e/pages/knowledge.pom.ts` — Playwright POM page object
- [ ] Framework install: NONE (react-markdown, remark-gfm, recharts, lucide-react, next-intl, @tailwindcss/typography, playwright — all present)
- [ ] OPTIONAL: `npx shadcn add table` — decided NO (native `<table>` with Tailwind is cleaner for 128 rows and introduces no dep risk)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/knowledge` dashboard renders and is usable end-to-end | KB-23..KB-27 oracle | Requiere browser interaction reales + verificar estética consistente con repo. | (1) Docker rebuild + restart. (2) Navegar http://localhost:3500/knowledge. Verificar: counts bar con 8 cards + timeline LineChart + tabla con 128 entries + filtros visibles. Screenshot. (3) Aplicar filter `type: resource` + `subtype: catpaw` → tabla muestra ≤10 entries. Screenshot. (4) Click en "Operador Holded" (o cualquier CatPaw) → navega a `/knowledge/[id]`, vista detalle renderiza markdown body (system_prompt visible), bloque Relaciones con links si aplica. Screenshot. (5) Abrir entry `status:deprecated` → banner amarillo visible. (6) Pegar screenshots + request/response transcripts en `154-VERIFICATION.md`. |
| CatBot link al KB coincide con UI | KB-23 + KB-24 | Cross-check entre tool CatBot `kb_entry` path y el path real de la UI. | POST `/api/catbot/chat` `{"message":"Dame el kb_entry del CatPaw Operador Holded"}`. Copy the kb_entry path (e.g. `resources/catpaws/53f19c51-operador-holded.md`). Convert to `/knowledge/53f19c51-operador-holded` (strip prefix + extension). Navigate URL → same content renders. Paste evidence. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 pure libs + test files + 9 new UI files + i18n keys + sidebar edit + 3 E2E specs)
- [ ] No watch-mode flags (vitest run, playwright test, no --watchAll)
- [ ] Feedback latency < 60s unit / < 60s E2E scoped
- [ ] Oracle browse executed and screenshots + evidence pasted to `154-VERIFICATION.md`
- [ ] Docker rebuild verified before oracle (bind mount `./.docflow-kb:/docflow-kb:ro` ya existe Phase 152)
- [ ] No regression in 239+ pre-existing tests incl. Phase 153 hooks tests (108/108 KB suite)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
