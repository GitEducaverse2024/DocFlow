---
phase: 152
slug: kb-catbot-consume
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 152 — Validation Strategy

> Per-phase validation contract derived from `152-RESEARCH.md` §Validation Architecture + CONTEXT.md §D6.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 (already in `app/package.json`) |
| **Config file** | `app/vitest.config.ts` (globs `src/**/*.test.ts`) |
| **Quick run command** | `cd app && npm run test:unit -- kb-` |
| **Full suite command** | `cd app && npm run test:unit` |
| **Estimated runtime** | ~5s (KB-scoped tests) / ~60s (full suite) |

---

## Sampling Rate

- **After every task commit:** `cd app && npm run test:unit -- kb-` (quick, ~5s)
- **After every plan wave:** `cd app && npm run test:unit` (full suite, ~60s)
- **Before `/gsd:verify-work`:** Full suite green + Docker rebuild + oracle POST `/api/catbot/chat` with 3 verification prompts
- **Max feedback latency:** 5s (quick) / 60s (full)

---

## Per-Task Verification Map

Assumes 4-plan structure (planner will finalize):
- Plan 01 = Foundation (kb-index-cache module, Zod schema fix, test helper)
- Plan 02 = Tools (search_kb + get_kb_entry)
- Plan 03 = Assembler + kb_entry in list tools
- Plan 04 = Oracle + knowledge-tree JSON update + phase close

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 152-01-01 | 01 | 1 | KB-18 | unit | `cd app && npm run test:unit -- knowledge-tree` (union schema accepts string \| {term,definition} \| {__redirect}) | ❌ W0 extend | ⬜ pending |
| 152-01-02 | 01 | 1 | KB-17 | unit | `cd app && npm run test:unit -- kb-index-cache` (cache, TTL 60s, invalidate, resolveKbEntry hit/miss) | ❌ W0 new | ⬜ pending |
| 152-01-03 | 01 | 1 | KB-17 | unit | `cd app && npm run test:unit -- kb-index-cache` (YAML frontmatter parsing via js-yaml) | ❌ W0 new | ⬜ pending |
| 152-01-04 | 01 | 1 | all | unit | `cd app && npm run test:unit -- kb-test-utils` (createFixtureKb helper) | ❌ W0 new | ⬜ pending |
| 152-02-01 | 02 | 2 | KB-16 | unit | `cd app && npm run test:unit -- kb-tools -t "search_kb filters"` (type/subtype/tags AND/audience/status) | ❌ W0 new | ⬜ pending |
| 152-02-02 | 02 | 2 | KB-16 | unit | `cd app && npm run test:unit -- kb-tools -t "search_kb ranking"` (title×3, summary×2, tags/hints×1) | ❌ W0 new | ⬜ pending |
| 152-02-03 | 02 | 2 | KB-16 | unit | `cd app && npm run test:unit -- kb-tools -t "search_kb limit default status"` (limit cap 50, default active) | ❌ W0 new | ⬜ pending |
| 152-02-04 | 02 | 2 | KB-16 | unit | `cd app && npm run test:unit -- kb-tools -t "get_kb_entry"` (found/not-found/related_resolved string+object) | ❌ W0 new | ⬜ pending |
| 152-02-05 | 02 | 2 | KB-16 | contract | `cd app && npm run test:unit -- kb-tools -t "registered in TOOLS"` (search_kb/get_kb_entry shape + always-allowed via getToolsForLLM) | ❌ W0 new | ⬜ pending |
| 152-02-06 | 02 | 2 | KB-18 | unit | `cd app && npm run test:unit -- catbot-tools -t "query_knowledge redirect"` (redirect hint emitted, no Zod throw) | ❌ W0 extend | ⬜ pending |
| 152-03-01 | 03 | 3 | KB-15 | unit | `cd app && npm run test:unit -- catbot-prompt-assembler -t "kb_header"` (P1 position, fresh-read, graceful missing) | ❌ W0 extend | ⬜ pending |
| 152-03-02 | 03 | 3 | KB-15 | unit | `cd app && npm run test:unit -- catbot-prompt-assembler -t "knowledge protocol"` (mentions search_kb/get_kb_entry, order) | ❌ W0 extend | ⬜ pending |
| 152-03-03 | 03 | 3 | KB-17 | integration | `cd app && npm run test:unit -- kb-tools-integration -t "list_cat_paws kb_entry"` (path resolved OR null if missing) | ❌ W0 new | ⬜ pending |
| 152-03-04 | 03 | 3 | KB-17 | integration | `cd app && npm run test:unit -- kb-tools-integration -t "list_*"` (connectors/catbrains/skills/email_templates/canvas_list same) | ❌ W0 new | ⬜ pending |
| 152-03-05 | 03 | 3 | KB-17 | unit | `cd app && npm run test:unit -- kb-tools-integration -t "cache efficiency"` (1 read inside 60s window) | ❌ W0 new | ⬜ pending |
| 152-04-01 | 04 | 4 | all | regression | `cd app && npm run test:unit` (knowledge-sync 38/38, kb-sync-cli 13/13, kb-sync-db-source 18/18, knowledge-tools-sync green) | ✅ existing | ⬜ pending |
| 152-04-02 | 04 | 4 | KB-16 | tripwire | `cd app && npm run test:unit -- knowledge-tools-sync` (search_kb/get_kb_entry listed in a knowledge/*.json — recommended catboard.json) | ✅ existing gates change | ⬜ pending |
| 152-04-03 | 04 | 4 | perf | perf | inline timing assertions (search_kb < 50ms over 126 entries; get_kb_entry < 10ms; cache hit < 1ms) | ❌ W0 | ⬜ pending |
| 152-04-04 | 04 | 4 | oracle | checkpoint:human-verify | Docker rebuild + POST /api/catbot/chat with 3 prompts (see Manual-Only below); paste to `152-VERIFICATION.md` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/services/kb-index-cache.ts` — new module exposing `getKbIndex()`, `invalidateKbIndex()`, `resolveKbEntry(table, id)`, `searchKb(params)`, `getKbEntry(id)`, `parseKbFile(path)` (uses `js-yaml` already transitive in `app/node_modules/`)
- [ ] `app/src/lib/__tests__/kb-test-utils.ts` — shared helper `createFixtureKb(tmpDir)` with 7-entry minimal KB (1 per subtype + 1 rule)
- [ ] `app/src/lib/__tests__/kb-index-cache.test.ts` — unit tests (cache TTL, invalidation, resolver hit/miss, YAML parse)
- [ ] `app/src/lib/__tests__/kb-tools.test.ts` — unit tests (search_kb filters + ranking + limits, get_kb_entry found/not-found/related)
- [ ] `app/src/lib/__tests__/kb-tools-integration.test.ts` — integration (6 list_* tools return kb_entry correctly; cache efficiency)
- [ ] `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` — **extend** existing file with kb_header section tests + knowledge_protocol v2 tests
- [ ] `app/src/lib/__tests__/knowledge-tree.test.ts` — **extend** with Zod union schema tests (string | {term,definition} | {__redirect})
- [ ] `app/src/lib/__tests__/catbot-tools.test.ts` (or new file) — tests for `query_knowledge` redirect hint emission + no Zod throw
- [ ] `app/data/knowledge/catboard.json` — **update** `tools[]` array to include `search_kb` and `get_kb_entry` (satisfies knowledge-tools-sync tripwire)
- [ ] Framework install: NONE — `js-yaml@4.1.1`, `zod@3.25.76`, `vitest@4.1.0` already present (transitive)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot responds factually to "¿Qué sabes del KB de DocFlow?" | KB-15 oracle | Ejercita el `kb_header` inyectado via LLM call real. Phase 151 oracle devolvió "NO TENGO ACCESO" pre-152 → post-152 debe devolver contenido del header. | (1) Docker rebuild tras merge. (2) `POST http://localhost:3500/api/catbot/chat` con body `{"message":"¿Qué sabes del KB de DocFlow?","channel":"web"}`. (3) Response DEBE mencionar al menos 3 de: CatPaws activos, Connectors activos, Skills activas, Rules, Protocols, counts. (4) Pegar request + response en `152-VERIFICATION.md`. |
| CatBot lista CatPaws usando list_cat_paws + muestra kb_entry path | KB-17 oracle | Ejercita el campo `kb_entry` end-to-end. | (1) POST con `{"message":"¿Qué CatPaws existen?","channel":"web"}`. (2) Verificar que CatBot llama `list_cat_paws` y el response incluye al menos 1 item con `kb_entry` tipo `"resources/catpaws/*.md"`. (3) Pegar evidencia. |
| CatBot profundiza con search_kb → get_kb_entry | KB-16 oracle | Ejercita el flow completo search → detail. | (1) POST con `{"message":"Dame el detalle del CatPaw Operador Holded","channel":"web"}`. (2) Verificar logs que CatBot invoca `search_kb({subtype:"catpaw",search:"Operador Holded"})` O llama `get_kb_entry` directamente. (3) Response debe incluir system_prompt/mode/department del CatPaw. (4) Pegar. |
| KB snapshot NO se pisa tras phase | regression | Phase 151 dejó `_header.md` hand-patched con counts que regenerateHeaderFile no conoce. Verificar que Phase 152 NO regenera el header automáticamente. | Después de merge, comparar `git diff .docflow-kb/_header.md` entre antes y después. Debe ser vacío (Phase 152 solo LEE, no regenera). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (5 new files + 3 extensions + 1 knowledge/*.json update)
- [ ] No watch-mode flags (tests use `vitest run`)
- [ ] Feedback latency < 5s (quick) / < 60s (full)
- [ ] Oracle tests executed and pasted to `152-VERIFICATION.md`
- [ ] Docker rebuild verified before oracle (else kb_header won't be loaded by running container)
- [ ] knowledge-tools-sync tripwire satisfied (search_kb + get_kb_entry in a knowledge/*.json)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
