---
gsd_state_version: 1.0
milestone: v30.0
milestone_name: LLM Self-Service para CatBot
status: Phase 158 complete — schema + enriched /api/models shipped; next Phase 159
stopped_at: "Completed 158-02-api-models-enrichment-PLAN.md; Phase 158 complete; next: Phase 159 backend passthrough"
last_updated: "2026-04-21T15:30:16.746Z"
last_activity: 2026-04-21 — Phase 158 Plan 02 complete (enriched /api/models + 4 UI consumers + 10 Vitest green)
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base that users can query via natural language chat.
**Current focus:** Milestone v30.0 — LLM Self-Service para CatBot (roadmap ready, 4 phases 158-161, 21 requirements)

## Current Position

Phase: 158-model-catalog-capabilities-alias-schema (complete, 2/2 plans)
Plan: next is 159-backend-passthrough-litellm-reasoning (to be planned)
Status: Phase 158 shipped — schema + seed + enriched /api/models + 4 UI consumers + 26 Vitest tests green across both plans
Last activity: 2026-04-21 — Phase 158 Plan 02 complete (enriched /api/models + 4 UI consumers + 10 Vitest green)

**Previous milestone (v29.1):** 9 phases (149-157), 35/35 plans complete, 45/45 requirements satisfied. Shipped 2026-04-21 (tag `v29.1`). Audit cycle 3 passed — 7/7 cross-phase seams WIRED, 4/4 E2E flows end-to-end, commit 06d69af7 resurrection regression closed by Phase 157. Archived: `milestones/v29.1-{ROADMAP,REQUIREMENTS,MILESTONE-AUDIT}.md`. Deferred to v29.2: KB-44 (templates duplicate-mapping delta), KB-45 (`list_connectors` tool).

**v30.0 execution order:** 158 (schema+catalog) ✅ → 159 (backend passthrough) → 160 (CatBot tools+KB skill) → 161 (UI+oracle E2E)

Progress: [██▌       ] 25% (1/4 phases complete, Phase 158 2/2 plans, 4/21 requirements: CAT-01, CAT-02, CAT-03, CFG-01)

### Known blockers flagged for Phase 159+

- **Model-id namespace mismatch**: LiteLLM exposes shortcut aliases (`gemini-main`, `claude-opus`, `gemma-local`) while `model_intelligence.model_key` uses fully-qualified names (`google/gemini-2.5-pro`, `anthropic/claude-opus-4`, `ollama/gemma3:4b`). The enriched `/api/models` shape works correctly (tests green), but in production all 12 returned items have enriched=null because no LiteLLM id matches any `model_key`. Phases 160/161 oracle verification will see useless data until alignment lands. Options: (a) rename LiteLLM aliases to FQNs, (b) seed shortcut rows into `model_intelligence`, (c) add resolver layer (consults `model_aliases`) inside the route. Recommend tactical Plan before Phase 160.

## Performance Metrics

**Previous milestone (v28.0):** 7 phases (138-144), 20 requirements, all complete. Score CatBot 60->70 (medido), piloto E2E verificado.

**Velocity (v29.1 cumulative, available for reference):**
- Total plans completed: 35
- Average duration: ~12 min per plan
- Fastest: Phase 153 P01 (~4 min, 3 tasks, 6 files)
- Slowest: Phase 151 P04 (~55 min, 3 tasks, 9 files)

| Phase | Plan | Duration | Tasks | Files |
| ----- | ---- | -------- | ----- | ----- |
| 149   | 01   | ~8 min   | 5     | 30+   |
| 149   | 05   | ~10 min  | 2     | 6     |
| 149   | 02   | ~6 min   | 2     | 1     |
| 149   | 03   | ~7.5 min | 2     | 2     |
| 149   | 04   | ~8 min   | 2     | 4     |
| 150   | 01   | ~8 min   | 3     | 7     |
| Phase 150 P02 | 6min | 2 tasks | 2 files |
| Phase 150 P03 | 6min | 2 tasks | 6 files |
| Phase 150 P04 | 6.5min | 3 tasks | 74 files |
| Phase 151 P01 | ~45min | 3 tasks | 42 files |
| Phase 151 P02 | 12min | 3 tasks | 25 files |
| Phase 151 P03 | 4min | 2 tasks | 8 files |
| Phase 151 P04 | ~55min | 3 tasks | 9 files |
| Phase 152 P01 | 13min | 2 tasks | 10 files |
| Phase 152 P02 | 6min | 2 tasks | 4 files |
| Phase 152 P03 | 7min | 2 tasks | 4 files |
| Phase 152 P04 | 11min | 3 tasks | 5 files |
| Phase 153 P01 | 4min | 3 tasks | 6 files |
| Phase 153 P02 | 7min | 2 tasks | 2 files |
| Phase Phase 153 PP03 | 9min | 2 tasks | 12 files |
| Phase 153 P4 | 18min | 4 tasks | 11 files |
| Phase 154 P01 | 5min | 3 tasks | 12 files |
| Phase 154 P02 | 5min | 2 tasks | 9 files |
| Phase 154 P03 | 20min | 3 tasks | 7 files |
| Phase 155 P01 | 12min | 3 tasks | 9 files |
| Phase 155 P02 | 11min | 3 tasks | 52 files |
| Phase 155 P03 | 6min | 3 tasks | 114 files |
| Phase 155 P04 | 8min | 4 tasks | 4 files |
| Phase 156 P01 | 7min | 3 tasks | 5 files |
| Phase 156 P02 | 22min | 3 tasks | 4 files |
| Phase 156 P03 | ~35min | 4 tasks | 25 files |
| Phase 157-kb-rebuild-determinism P01 | 9min | 4 tasks | 62 files |
| Phase 157 P02 | 6min | 3 tasks | 95 files |
| Phase Phase 157 PP03 | ~90min | 5 tasks | 13 files |
| Phase 158 P01 | 5min | 3 tasks | 3 files |
| Phase 158 P02 | 7min | 3 tasks | 6 files |

## Accumulated Context

### Roadmap Evolution

**v30.0 (2026-04-21):**
- Phase 158 added: Model Catalog Capabilities + Alias Schema — extiende `model_intelligence` con `supports_reasoning`/`max_tokens_cap`/`tier` + `model_aliases` con `reasoning_effort`/`max_tokens`/`thinking_budget` + seed + `GET /api/models` amplía shape. CAT-01..03, CFG-01. Sin runtime changes todavía — data plumbing puro.
- Phase 159 added: Backend Passthrough LiteLLM Reasoning — `resolveAlias` devuelve objeto completo, `PATCH /api/alias-routing` valida contra capabilities, `streamLiteLLM` propaga `reasoning_effort` + `thinking.budget_tokens` + `max_tokens`, CatBot chat route consume params resueltos. CFG-02..03, PASS-01..04. LiteLLM gateway ya soporta passthrough per 2026-04-21 verification.
- Phase 160 added: CatBot Self-Service Tools + Skill KB — tools `list_llm_models` (always-allowed), `get_catbot_llm` (always-allowed), `set_catbot_llm` (sudo-gated + valida capabilities antes de PATCH) + skill KB "Operador de Modelos" con protocolo de recomendación tarea→modelo. TOOL-01..04.
- Phase 161 added: UI Enrutamiento + Oracle End-to-End — tab Enrutamiento gana dropdown Inteligencia + input max_tokens + input thinking_budget condicionales por capability + oracle CatBot 3/3 (enumerar capabilities, cambiar a Opus+high via sudo, siguiente request usa reasoning_content) + unit test `resolveAlias('catbot')` post-PATCH. UI-01..03, VER-01..04.

**v29.1 (histórico):**
- Phase 149 added: KB Foundation Bootstrap — prerequisite of Canvas Creation Wizard. Creates `.docflow-kb/` unified knowledge base with schema validation, semver versioning, soft-delete + 180d purge mechanism.
- Phase 150 added: KB Populate desde DB — Fase 2 del PRD KB. Extends `kb-sync.cjs` with `--source db`, generates `resources/*.md` from live DB tables.
- Phase 151 added: KB Migrate Static Knowledge — PRD Fase 3. Migra silos estáticos al KB estructurado con redirects en originales.
- Phase 152 added: KB CatBot Consume — PRD Fase 4. prompt-assembler consume `_header.md`; tools `get_kb_entry` / `search_kb`; list_* canonical tools añaden campo `kb_entry`.
- Phase 153 added: KB Creation Tool Hooks — PRD Fase 5. 21 hook insertion points (6 tool + 15 route) en create/update/delete → syncResource.

### From v28.0 (Lecciones del Piloto E2E)
- RESTRICCION: CONDITION solo pasa "yes/no" — el nodo siguiente pierde el JSON. NO usar en pipelines de datos.
- RESTRICCION: CatBrain/RAG usa instructions como query al CatBrain, no el predecessorOutput.
- RESTRICCION: CatPaws con system_prompt elaborado reinterpretan el input. Nodos genericos para procesamiento.
- PATRON VALIDADO: 8 nodos lineales (START -> Normalizador -> Clasificador -> Respondedor -> Gmail -> Output)
- CatPaw SOLO para tools externas (Holded MCP, Gmail send). Sin CatPaw para procesamiento de datos.

### Decisions (v30.0)

- **[Roadmap v30.0, 2026-04-21]**: 4 phases chosen over 3 or 5 — schema (158) and passthrough (159) split because runtime wiring is independently testable and high-risk (LiteLLM body shape). UI+Oracle unified (161) because oracle verification requires UI parity to prove user-facing contract; splitting would duplicate oracle infrastructure.
- **[Roadmap v30.0, 2026-04-21]**: CFG-01 (`model_aliases` schema) placed in Phase 158 (schema) instead of Phase 159 (backend) — keeps all DDL atomic in one migration, lets Phase 159 focus on runtime plumbing without schema risk.
- **[Roadmap v30.0, 2026-04-21]**: Oracle (VER-01..03) consolidated in Phase 161 rather than distributed across phases — end-to-end verification requires the full stack operational (tools + UI + backend). Splitting oracles per phase would force mocking or stubbing that invalidates the "CatBot can demonstrate the feature" contract from CLAUDE.md.
- **[Roadmap v30.0, 2026-04-21]**: Skill KB "Operador de Modelos" (TOOL-04) grouped with tools in Phase 160 rather than treated as UI artifact — the skill is behavioral (how CatBot chooses), and it's injected via PromptAssembler alongside the tools that execute the choices. Separating would delay the "usable recommendation loop" until 161, adding 1 integration layer.
- **[Roadmap v30.0, 2026-04-21]**: No separate research phase — LiteLLM reasoning passthrough behavior already verified 2026-04-21 (gateway supports Claude Anthropic + Gemini 2.5 Pro translation). Model IDs validated (`anthropic/claude-opus-4-6` real name under alias `claude-opus`).
- **[Phase 158-01, 2026-04-21]**: Schema migration inline via 6 ALTER + canonical UPDATE seed in db.ts bootstrap; idempotent try/catch pattern; `is_local INTEGER` chosen over adding a tier CHECK('paid','local') column to avoid regression on existing Elite/Pro/Libre semantics. Seed UPDATE runs every bootstrap (idempotent by design) rather than guarded on NULL — canonical values override manual edits per CONTEXT.md. Task 3 test file consolidated into Task 1 commit because the test helpers ARE the canonical spec for the db.ts block.
- **[Phase 158-02, 2026-04-21]**: `GET /api/models` enriched with flat-root shape (NOT nested `capabilities: {...}`) — simpler consumer code on both UI and CatBot tool sides. Enriched fields default to `null` (not omission) when `model_key` absent from `model_intelligence` to distinguish "unknown" from "explicit false". `toBoolOrNull` coerces SQLite INTEGER 0/1 to JSON boolean/null. Graceful-degradation fallback (empty Map on query failure) keeps endpoint live during v30.0 rollout. UI consumers adopted defensive extraction pattern `items.map(m => m?.id ?? '').filter(Boolean)`; `source-list.tsx` needed zero changes (already forward-compatible). `tasks/new/page.tsx` pre-existing bug (Array.isArray on object) fixed inline since the handler was being rewritten anyway. Logger source `'system'` instead of extending `LogSource` enum to avoid cross-cutting changes for 2 call sites.

### Decisions (v29.1 — historical)
- [Phase 145]: Operador Holded as generalist CRM agent for flexible canvas pipelines (vs rigid Consultor CRM)
- [Phase 149-kb-foundation-bootstrap]: Bootstrap .docflow-kb/ and .docflow-legacy/ scaffolding with deterministic stubs
- [Phase 157-01]: loadArchivedIds scans .docflow-legacy/ as SIBLING of kbRoot; non-resurrection invariant holds
- [Phase 157-02]: buildBody(subtype, row, relations?) 3-arg signature — relations only consumed for catpaws
- [Phase Phase 157-03]: cmdRestore uses fs.renameSync (atomic); R30 rule atom promoted for operator + CatBot dual-discovery

### Blockers/Concerns

- None for v30.0. LiteLLM gateway passthrough verified 2026-04-21. Existing files identified and accessible. Schema additions are additive (no data loss risk).
- Dependencia externa: `anthropic/claude-opus-4-6` y `gemini/gemini-2.5-pro` deben estar provisionados en LiteLLM gateway con API keys válidas — verificable via `check_model_health` tool (v25.1 deliverable).

## Session Continuity

Last session: 2026-04-21T15:30:16.745Z
Stopped at: Completed 158-02-api-models-enrichment-PLAN.md; Phase 158 complete; next: Phase 159 backend passthrough
Resume file: None
