---
gsd_state_version: 1.0
milestone: v30.0
milestone_name: LLM Self-Service para CatBot
status: in_progress
stopped_at: "Completed 160-03-PLAN.md (set_catbot_llm PATCH delegation + sudo gate). Plan 160-04 (Operador de Modelos skill + PromptAssembler P1) also complete per parallel commits a342051 + e4daf3c. Phase 160 complete (4/4 TOOL requirements). Next: Phase 161 UI Enrutamiento + Oracle End-to-End."
last_updated: "2026-04-22T11:05:00.000Z"
last_activity: "2026-04-22 — Phase 160 Plan 03 complete (catbot-tools.ts +71 lines: set_catbot_llm TOOLS[] schema + handler case + visibility rule; chat/route.ts ±2 lines: dual-site sudo gate extended). Plan 160-04 completed in parallel."
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 11
  completed_plans: 11
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base that users can query via natural language chat.
**Current focus:** Milestone v30.0 — LLM Self-Service para CatBot (roadmap ready, 4 phases 158-161, 21 requirements)

## Current Position

Phase: 160-catbot-self-service-tools-skill-kb (in progress, 3/4 plans)
Plan: 160-03 set_catbot_llm complete; next 160-04 (Operador de Modelos skill + PromptAssembler P1 — already in flight per parallel commits a342051 + e4daf3c)
Status: Phase 160 Plan 03 COMPLETE — CatBot now has the full LLM-self-service write-path. `set_catbot_llm` is a thin typed-fetch shim (45 LOC) over PATCH /api/alias-routing with hasOwnProperty body gating: only caller-passed fields appear in the PATCH body, preserving Phase 159-03's extended-body semantics (null=reset, absence=untouched). Zero capability validation inside the handler — single source of truth is the PATCH validator (Pitfall #1 cleared: handler grep for supports_reasoning|max_tokens_cap|is_local returns ONLY list_llm_models/get_catbot_llm read handlers from Plan 02, never set_catbot_llm). Dual-site sudo gate in chat route (L333 streaming + L603 non-streaming) extended to compound predicate `toolName === 'update_alias_routing' || toolName === 'set_catbot_llm'` — both tools share the same SUDO_REQUIRED early-return and message, preserving symmetry (Pitfall #5 cleared). Visibility rule at L1425 mirrors update_alias_routing: `manage_models` action key or empty allowedActions. 7 RED tests flipped GREEN (2 TOOL-03 delegation/error + 3 visibility gates + 2 sudo gate streaming/non-streaming). Full catbot-tools-model-self-service.test.ts: 10/10 GREEN. Full chat/__tests__/route.test.ts: 10/10 GREEN (zero regression on pre-existing PASS-03/04/BC).
Last activity: 2026-04-22 — Phase 160 Plan 03 complete (catbot-tools.ts +71 lines: set_catbot_llm TOOLS[] schema + handler case + visibility rule; chat/route.ts ±2 lines: dual-site sudo gate extended)

**Previous milestone (v29.1):** 9 phases (149-157), 35/35 plans complete, 45/45 requirements satisfied. Shipped 2026-04-21 (tag `v29.1`). Audit cycle 3 passed — 7/7 cross-phase seams WIRED, 4/4 E2E flows end-to-end, commit 06d69af7 resurrection regression closed by Phase 157. Archived: `milestones/v29.1-{ROADMAP,REQUIREMENTS,MILESTONE-AUDIT}.md`. Deferred to v29.2: KB-44 (templates duplicate-mapping delta), KB-45 (`list_connectors` tool).

**v30.0 execution order:** 158 (schema+catalog) ✅ → 159 (backend passthrough) ✅ → 160 (CatBot tools+KB skill) 🚧 → 161 (UI+oracle E2E)

Progress: [███████   ] 63% (2/4 phases complete, 13/21 requirements: CAT-01, CAT-02, CAT-03, CFG-01, CFG-02, CFG-03, PASS-01, PASS-02, PASS-03, PASS-04, TOOL-01, TOOL-02, TOOL-03). Phase 160 Plans 01-03 complete — TOOL-04 (Operador de Modelos skill) remains pending (Plan 160-04, already in flight per parallel commits a342051 + e4daf3c).

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
| Phase 159 P02 | 3min | 2 tasks | 2 files |
| Phase 159 P01 | 5min | 2 tasks | 2 files |
| Phase 159 P03 | 3min | 2 tasks | 2 files |
| Phase 159 P04 | 4min | 2 tasks | 2 files |
| Phase 160 P01 | ~4min | 2 tasks | 4 files |
| Phase 160 P02 | ~3min | 2 tasks | 1 files |
| Phase 160 P03 | 3min | 2 tasks | 2 files |
| Phase 160 P04 | ~5min | 2 tasks | 3 files |

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
- **[Phase 159-02, 2026-04-22]**: `'off'` sentinel stays DocFlow-internal — translated to field-omission at stream-utils boundary so LiteLLM never sees it (LiteLLM doesn't recognize `'off'` as valid enum; only `low|medium|high`). Spread pattern `...(options.reasoning_effort && options.reasoning_effort !== 'off' ? {...} : {})` mirrors existing `max_tokens`/`tools` pattern for consistency. Phase 159 is OUTBOUND-only — reasoning_content NOT parsed from response delta (FUT-03 in v30.1). No new logger calls added for reasoning params — Phase 161 oracle verifies end-to-end via CatBot demonstration, not log scraping. `makeFetchMockCapture()` test helper introduced — mocks `global.fetch` with minimal SSE `[DONE]` response and captures parsed request body; reusable for future body-shape verification tests. Additive-pure: all 4 existing callers (catbot/chat, cat-paws/chat, catbrains/process, catbrains/chat) compile unchanged because both new fields are optional.
- **[Phase 159-01, 2026-04-22]**: Parallel-function over breaking change — `resolveAliasConfig(alias): Promise<AliasConfig>` introduced alongside existing `resolveAlias(alias): Promise<string>` (now a one-line shim delegating to the new function). Research Pitfall #1 locked this: changing `resolveAlias` return type would cascade-break 14 call-sites + 7 test mocks. Shim delegation keeps blast radius at zero. Fallback carries row's reasoning config: when Discovery is down and we fall back to a same-tier alt model, the original alias's `reasoning_effort`/`max_tokens`/`thinking_budget` ride along (documented behavior — consumers re-validate capabilities if strict). `updateAlias(alias, modelKey, opts?)` branches SQL shape on opts presence: legacy 2-arg callers hit unchanged UPDATE; opts-aware callers (Plan 03 PATCH) hit extended 4-column UPDATE. 3 pre-existing `seedAliases` test failures (Phase 140 added 3 unconditional canvas semantic aliases but tests still expect 8-row shape) deferred to `deferred-items.md` — verified pre-existing via stash-pop, out of scope for 159-01 per SCOPE BOUNDARY rule.
- **[Phase 159-03, 2026-04-22]**: `PATCH /api/alias-routing` validator uses `hasOwnProperty` gate for extended-body detection — explicit `null` on any of the 3 new fields activates the extended path (enabling CFG-02j reset semantics where `{alias, model_key, reasoning_effort: null, max_tokens: null, thinking_budget: null}` writes NULLs via extended UPDATE); a truthiness check would silently fall back to legacy 2-arg `updateAlias` and fail the reset. Two-layer graceful degradation on capability lookup: outer try/catch handles the rare table-absent cold-start case, inner undefined-row check handles the common model_key-not-yet-seeded case (STATE.md namespace-mismatch blocker between LiteLLM shortcuts and `model_intelligence.model_key` FQNs). Both degrade identically via `logger.warn` + skip validation + proceed to persist — same pattern Phase 158 used for `/api/models` enrichment. `'off'` sentinel explicitly permitted on non-reasoning models (CFG-02i) because it's a DocFlow-internal sentinel translated to field-omission at the stream-utils boundary (Plan 02) before hitting LiteLLM; only `low|medium|high` require `supports_reasoning=1`. Cap lookup targets TARGET `model_key` per research Pitfall #6 — validator must reason about post-update state; checking pre-update state would let a config legal under the old model slip through when the new model has a lower cap. Validator ordering: shape (type guards) -> relation (cross-field) -> capability (cross-table), fast-fails cheap checks first so DB is never touched on invalid input streams.
- **[Phase 159-04, 2026-04-22]**: CatBot chat route is the SINGLE call-site that migrates from `resolveAlias` to `resolveAliasConfig` — 14+ other callers keep using the `Promise<string>` shim (Pitfall #1 locked). Four surgical anchors: import swap, cfg derivation block, `streamLiteLLM` call, inline `fetch` body. `max_tokens` uses `?? 2048` (not `|| 2048`) to preserve the historical hardcoded fallback without silently resetting a hypothetical 0. `reasoning_effort = cfg.reasoning_effort ?? undefined` converts null to undefined because `StreamOptions` enum doesn't accept null. Non-streaming path re-implements stream-utils's spread-when-truthy-and-not-off pattern byte-symmetric to prevent asymmetric oracle failures. New `__tests__/route.test.ts` (first ever tests for this route, 300 lines) stubs 15+ dependencies and asserts the narrow PASS-03/PASS-04 contract via `mock.calls` inspection — not end-to-end. Oracle verification (VER-01..03) explicitly deferred to Phase 161 which will add the CatBot self-service tool + UI + live gateway smoke.
- **[Phase 160-02, 2026-04-22]**: Read-only CatBot tool registration pattern established — `list_llm_models` + `get_catbot_llm` added to TOOLS[] + executeTool switch in single file (`catbot-tools.ts` +115 lines, zero new files, zero new deps). Both tools auto-allowed by existing `name.startsWith('list_')` / `name.startsWith('get_')` visibility rules at L1358 — no new visibility logic needed for read-only surface (write-path `set_catbot_llm` in Plan 03 WILL need `manage_models` gate). `resolveAliasConfig('catbot')` is the first call-site migration per Phase 159-01 Pitfall #1 locking 14+ other callers on the `resolveAlias` string shim — strictly additive import (`resolveAliasConfig` added to existing alias-routing destructure, no new line). Graceful degradation on namespace mismatch: `capabilities: capRow ? {...} : null` distinguishes "unknown" from "explicit false" so CatBot can narrate "I don't have capability data for this LiteLLM shortcut id" vs "this model does not support reasoning" (mirrors Phase 158-02's `toBoolOrNull` + empty-Map fallback pattern for /api/models). Used `new Set(inventory.models.map(m=>m.id))` in list_llm_models instead of calling the local `isModelAvailable` helper per row — the helper's prefix/colon-split logic is for matching curated short MID keys against verbose Discovery ids, not needed when model_intelligence already stores canonical keys that either match Discovery exactly or don't at all. Set keeps the O(n) loop O(1) per lookup. 5 RED → GREEN in this plan, 4 RED remaining in the same test file (all TOOL-03 set_catbot_llm — Plan 03's scope).
- **[Phase 160-03, 2026-04-22]**: `set_catbot_llm` is a thin typed-fetch shim (45 LOC) over `PATCH /api/alias-routing` — zero capability validation inside the handler (verified via grep: no `supports_reasoning`/`max_tokens_cap`/`is_local` references inside the case block), all cross-checks delegated to Phase 159-03 server-side validator as the single source of truth (Pitfall #1 cleared). `hasOwnProperty` gate via `in` operator: only caller-passed fields appear in outgoing PATCH body, preserving extended-body semantics where `null`=reset, absence=legacy-untouched, `'off'` sentinel passes through safely. Response wraps PATCH's `updated` in a caller-centric `applied` shape with `'unchanged'` string literal for untouched fields — lets CatBot narrate "quedó como estaba" vs "se reseteó a null" without ambiguity. Dual-site sudo gate mirrored in chat route L333 (streaming) + L603 (non-streaming) via compound predicate `toolName === 'update_alias_routing' || toolName === 'set_catbot_llm'` — both tools share the same SUDO_REQUIRED early-return and message (intentional symmetry per RESEARCH.md Open Q #5). Visibility rule at L1425 mirrors `update_alias_routing` adjacent to it (write-path model rules cluster). Handler-as-shim pattern established as the default for future sudo-gated write-path CatBot tools: eliminates validation drift between manual UI (Phase 161) and programmatic call-sites, simplifies testing via fetch-mock body assertions + status passthrough. 7 RED→GREEN transitions (2 TOOL-03 delegation + 3 visibility + 2 sudo gate). Parallel agent committed 160-04 work (a342051 db.ts + e4daf3c catbot-prompt-assembler.ts) between task commits — confirmed non-overlapping files, zero interference.
- **[Phase 160-01, 2026-04-22]**: Wave 0 RED-first scaffolding landed 14 failing test cases across 4 files (2 NEW + 2 EXTEND) covering TOOL-01..04 before any implementation code exists. SSE event capture added to shared `createSSEStream` mock (`sseEvents` array at module scope with per-describe reset) — backward compatible with 8 pre-existing PASS-03/PASS-04/BC tests and unlocks streaming-path sudo assertions for Phase 160-04 + Phase 161 oracle reuse. DATABASE_PATH hoisted (not CATBOT_DB_PATH) in `db-seeds.test.ts` because `skills` lives in `docflow.db` governed by `DATABASE_PATH` — common mix-up flagged in `kb-tools-integration.test.ts:7`. PromptAssembler extension uses `vi.resetModules() + vi.doMock() + dynamic import` inside each `it()` so the two modelos_protocol cases can swap `getSystemSkillInstructions('Operador de Modelos')` contradictorily (stub vs null) without cross-contaminating the 80 pre-existing assembler tests. set_catbot_llm sudo test written from scratch (NOT parameterized with `update_alias_routing` as RESEARCH.md line 921 hinted — that test does not exist in `route.test.ts`; only PASS-03/PASS-04 and BC tests live there). Pre-existing baseline of 10 unrelated failures (task-scheduler × 5, alias-routing seedAliases × 3, catbot-holded-tools × 2 — all deferred-items.md) unchanged: post-plan 24 total = 10 baseline + 14 new. Wave 1+ plans (160-02..04) now have measurable green-signal targets via `-t "TOOL-0x"` / `-t "set_catbot_llm"` / `-t "Operador de Modelos"` / `-t "modelos_protocol"` filters.

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

Last session: 2026-04-22T11:04:13.881Z
Stopped at: Completed 160-04-PLAN.md (Operador de Modelos skill seeded + PromptAssembler P1 injection). Phase 160 complete (4/4 TOOL requirements). Next: Phase 161 UI Enrutamiento + Oracle End-to-End.
Resume file: None
