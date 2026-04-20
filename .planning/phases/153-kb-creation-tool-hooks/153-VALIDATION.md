---
phase: 153
slug: kb-creation-tool-hooks
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 153 — Validation Strategy

> Per-phase validation contract. Derived from `153-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 (already in `app/package.json`) |
| **Config file** | `app/vitest.config.ts` (globs `src/**/*.test.ts`) |
| **Quick run command** | `cd app && npm run test:unit -- kb-hooks kb-audit` |
| **Full suite command** | `cd app && npm run test:unit` |
| **Estimated runtime** | ~10s (KB-scoped) / ~60-90s (full suite) |

---

## Sampling Rate

- **After every task commit:** `cd app && npm run test:unit -- kb-` (quick, ~10s)
- **After every plan wave:** full suite (~60-90s)
- **Before `/gsd:verify-work`:** Full suite green + Docker rebuild + oracle CatBot 3-prompt chain (create → update → delete CatPaw)
- **Max feedback latency:** 10s quick / 90s full

---

## Per-Task Verification Map

Plan structure assumed (planner will finalize): 4 plans across 4 waves.
- **Plan 01 (Wave 1) Foundation:** register KB-19..KB-22, extend LogSource, create `kb-audit.ts` + tests, create fixture for Phase 153.
- **Plan 02 (Wave 2) Tool hooks:** hook 6 tool cases (3 creates + 3 email_template ops); explicit non-hook of `update_cat_paw` (pass-through).
- **Plan 03 (Wave 3) Route hooks:** hook 15 API route handlers across 5 entities.
- **Plan 04 (Wave 4) Close + Oracle:** checkpoint:human-verify with create/update/delete CatBot chain; update `.docflow-kb/_manual.md`; KB snapshot commit.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 153-01-01 | 01 | 1 | KB-22 | unit | `cd app && npm run test:unit -- kb-audit -t "markStale appends line"` | ❌ W0 new | ⬜ pending |
| 153-01-02 | 01 | 1 | KB-22 | unit | `cd app && npm run test:unit -- kb-audit -t "first call creates header"` | ❌ W0 new | ⬜ pending |
| 153-01-03 | 01 | 1 | KB-22 | unit | `cd app && npm run test:unit -- kb-audit -t "never throws"` | ❌ W0 new | ⬜ pending |
| 153-01-04 | 01 | 1 | KB-22 | contract | `cd app && npx vitest run src/lib/__tests__/kb-audit.test.ts -t "schema-valid per frontmatter.schema.json"` | ❌ W0 new | ⬜ pending |
| 153-02-01 | 02 | 2 | KB-19 | unit | `cd app && npm run test:unit -- kb-hooks-tools -t "create_catbrain"` | ❌ W0 new | ⬜ pending |
| 153-02-02 | 02 | 2 | KB-19 | unit | `cd app && npm run test:unit -- kb-hooks-tools -t "create_cat_paw \| create_agent alias"` | ❌ W0 new | ⬜ pending |
| 153-02-03 | 02 | 2 | KB-19 | unit | `cd app && npm run test:unit -- kb-hooks-tools -t "create_connector no config leak"` | ❌ W0 new | ⬜ pending |
| 153-02-04 | 02 | 2 | KB-19 | unit | `cd app && npm run test:unit -- kb-hooks-tools -t "create_email_template no structure leak"` | ❌ W0 new | ⬜ pending |
| 153-02-05 | 02 | 2 | KB-19 | unit | `cd app && npm run test:unit -- kb-hooks-tools -t "update_email_template bump + change_log"` | ❌ W0 new | ⬜ pending |
| 153-02-06 | 02 | 2 | KB-19 + KB-21 | unit | `cd app && npm run test:unit -- kb-hooks-tools -t "delete_email_template status deprecated"` | ❌ W0 new | ⬜ pending |
| 153-02-07 | 02 | 2 | KB-19 | unit | `cd app && npm run test:unit -- kb-hooks-tools -t "update_cat_paw does NOT fire hook (pass-through)"` | ❌ W0 new | ⬜ pending |
| 153-02-08 | 02 | 2 | KB-19 | unit | `cd app && npm run test:unit -- kb-hooks-tools -t "syncResource failure: DB persists + markStale + no invalidate"` | ❌ W0 new | ⬜ pending |
| 153-02-09 | 02 | 2 | KB-19 | unit | `cd app && npm run test:unit -- kb-hooks-tools -t "invalidateKbIndex called after success only"` | ❌ W0 new | ⬜ pending |
| 153-03-01 | 03 | 3 | KB-20 | integration | `cd app && npm run test:unit -- kb-hooks-api-routes -t "POST /api/cat-paws"` | ❌ W0 new | ⬜ pending |
| 153-03-02 | 03 | 3 | KB-20 | integration | `cd app && npm run test:unit -- kb-hooks-api-routes -t "PATCH /api/cat-paws/\[id\]"` | ❌ W0 new | ⬜ pending |
| 153-03-03 | 03 | 3 | KB-20 + KB-21 | integration | `cd app && npm run test:unit -- kb-hooks-api-routes -t "DELETE /api/cat-paws/\[id\] → deprecated"` | ❌ W0 new | ⬜ pending |
| 153-03-04 | 03 | 3 | KB-20 | integration | `cd app && npm run test:unit -- kb-hooks-api-routes -t "catbrains POST/PATCH/DELETE"` | ❌ W0 new | ⬜ pending |
| 153-03-05 | 03 | 3 | KB-20 | integration | `cd app && npm run test:unit -- kb-hooks-api-routes -t "connectors POST/PATCH/DELETE no config leak"` | ❌ W0 new | ⬜ pending |
| 153-03-06 | 03 | 3 | KB-20 | integration | `cd app && npm run test:unit -- kb-hooks-api-routes -t "skills POST/PATCH/DELETE"` | ❌ W0 new | ⬜ pending |
| 153-03-07 | 03 | 3 | KB-20 | integration | `cd app && npm run test:unit -- kb-hooks-api-routes -t "email-templates POST/PATCH/DELETE no structure leak"` | ❌ W0 new | ⬜ pending |
| 153-03-08 | 03 | 3 | KB-20 | integration | `cd app && npm run test:unit -- kb-hooks-api-routes -t "author attribution api:<route>"` | ❌ W0 new | ⬜ pending |
| 153-03-09 | 03 | 3 | KB-20 | integration | `cd app && npm run test:unit -- kb-hooks-api-routes -t "route syncResource fail: 200/201 still returned + stale"` | ❌ W0 new | ⬜ pending |
| 153-03-10 | 03 | 3 | KB-21 | contract | `cd app && npm run test:unit -- kb-hooks-api-routes -t "get_kb_entry(id) still resolves deleted"` | ❌ W0 new | ⬜ pending |
| 153-03-11 | 03 | 3 | KB-21 | contract | `cd app && npm run test:unit -- kb-hooks-api-routes -t "search_kb active excludes deprecated"` | ❌ W0 new | ⬜ pending |
| 153-04-01 | 04 | 4 | concurrency | unit | `cd app && npm run test:unit -- kb-hooks-tools -t "Promise.all 2 creates → 2 KB files"` | ❌ W0 new | ⬜ pending |
| 153-04-02 | 04 | 4 | concurrency | unit | `cd app && npm run test:unit -- kb-audit -t "concurrent markStale → 2 distinct lines"` | ❌ W0 new | ⬜ pending |
| 153-04-03 | 04 | 4 | all | regression | `cd app && npm run test:unit` (38+13+18+20+18+6+6 existing green) | ✅ existing | ⬜ pending |
| 153-04-04 | 04 | 4 | perf | perf | inline timing: hook adds <20ms to write path; markStale <5ms | ❌ W0 inline | ⬜ pending |
| 153-04-05 | 04 | 4 | oracle | checkpoint:human-verify | Docker rebuild + POST /api/catbot/chat (3 prompts: create Tester, update Tester, delete Tester); paste evidence to 153-VERIFICATION.md | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/services/kb-audit.ts` — NEW module exporting `markStale(path, reason, details?)`. Writes to `.docflow-kb/_sync_failures.md` (NOT `_audit_stale.md` — per RESEARCH CONFLICT #2: that file is fully regenerated by CLI). First call creates frontmatter header; subsequent calls append a single line each (atomic via `fs.appendFileSync`). Never throws — swallows filesystem errors.
- [ ] `app/src/lib/__tests__/kb-audit.test.ts` — NEW unit tests covering markStale: append semantics, header creation, atomic concurrent writes, never-throws guarantee, schema validity.
- [ ] `app/src/lib/__tests__/kb-hooks-tools.test.ts` — NEW unit tests for 6 hookable tool cases + 1 negative (`update_cat_paw` pass-through non-hook) + failure simulation via `vi.mock('knowledge-sync')`.
- [ ] `app/src/lib/__tests__/kb-hooks-api-routes.test.ts` — NEW integration tests for 15 route handlers (5 entities × 3 methods POST/PATCH/DELETE). Uses `NextRequest` pattern (verify existing test for route integration if any — likely new pattern to establish).
- [ ] `app/src/lib/logger.ts` — EDIT: extend `LogSource` union with literal `'kb-sync'` (1-line edit, non-breaking).
- [ ] `.docflow-kb/_sync_failures.md` — created lazily on first `markStale` call (no Wave 0 file needed).
- [ ] `scripts/validate-kb.cjs` — 1-line edit: add `'_sync_failures.md'` to `EXCLUDED_FILENAMES` so validator doesn't try to schema-validate the audit log.
- [ ] Framework install: NONE (`js-yaml`, `vitest`, `zod`, `better-sqlite3` already present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot-driven create → update → delete chain produces coherent KB trace | KB-19 oracle | Ejercita 3 hooks reales via LLM call. Phase 152 campo `kb_entry: null` post-snapshot se convierte en path poblado tras Phase 153. | (1) Docker rebuild + restart. (2) `POST /api/catbot/chat` body `{"message":"Crea un CatPaw llamado Tester con descripción 'Test CatPaw'","channel":"web"}`. Verificar (a) response menciona éxito, (b) `ls .docflow-kb/resources/catpaws/*tester*.md` existe, (c) `list_cat_paws` devuelve Tester con `kb_entry` poblado. (3) `POST` body `{"message":"Actualiza la descripción del CatPaw Tester a 'Updated v2'","channel":"web"}`. Verificar version 1.0.1 + change_log 2 entries. (4) `POST` body `{"message":"Elimina el CatPaw Tester","channel":"web"}`. Verificar `status: deprecated` + archivo persiste + `get_kb_entry` devuelve el deprecated. Pegar request+response a `153-VERIFICATION.md`. |
| Route-driven (UI simulation) create produces same trace | KB-20 oracle | Valida que el flujo UI (no-CatBot) también sincroniza. | `curl -X POST http://localhost:3500/api/cat-paws -H "Content-Type: application/json" -d '{"name":"RouteTester","description":"via curl"}'`. Verificar mismo comportamiento KB. Pegar. |
| `_sync_failures.md` se crea sólo en fallo real | KB-22 oracle | Requiere simular fallo (disk full no es trivial — verificar en dev stopping write permission on .docflow-kb). | Opcional: skip si no hay forma segura de simular. Documentar como "tested vía unit tests con vi.mock". |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 new test files + 1 new module + 1 logger edit + 1 validate-kb.cjs edit)
- [ ] No watch-mode flags (tests use `vitest run`)
- [ ] Feedback latency < 10s (quick) / < 90s (full)
- [ ] Oracle chain executed (CatBot + curl) and pasted to `153-VERIFICATION.md`
- [ ] Docker rebuild verified before oracle (hooks need container with updated code)
- [ ] No regression in 239+ pre-existing KB tests
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
