---
gsd_state_version: 1.0
milestone: v26.1
milestone_name: -- Knowledge System Hardening
status: completed
last_updated: "2026-04-10T19:50:55.205Z"
last_activity: 2026-04-10 -- Completed 131-01 (complexity_decisions schema + CRUD + buildComplexityProtocol P0 section, 1101/1200 chars). 15 new tests, 82 passing, build ok.
progress:
  total_phases: 14
  completed_phases: 14
  total_plans: 38
  completed_plans: 38
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** CatBot como cerebro inteligente de DoCatFlow con memoria persistente, conocimiento estructurado y razonamiento adaptativo
**Current focus:** v26.0 CatBot Intelligence Engine -- Roadmap created, ready for Phase 118 planning

## Current Position

Phase: 131 (Complexity Assessment -- CatBot razona antes de ejecutar)
Plan: 01 of 4 complete -- complexity_decisions audit schema + CRUD + buildComplexityProtocol P0 prompt section (1101/1200 chars)
Status: Plan 01 GREEN. complexity_decisions table live in catbot.db with 4 CRUD functions (save/updateOutcome/listByUser/countComplexTimeoutsLast24h). buildComplexityProtocol registered as P0 immediately after tool_instructions in PromptAssembler.build(), with COMPLEX/SIMPLE casuisticas (holded Q1, Drive RAG, list_*, CatBrains) + hard rule (NO ejecutes tools si complex -> queue_intent_job). Wave 1 complete; Wave 2 (parser + gate in route.ts) ready to start.
Last activity: 2026-04-10 -- Completed 131-01 (complexity_decisions schema + CRUD + buildComplexityProtocol P0 section, 1101/1200 chars). 15 new tests, 82 passing, build ok.

```
[========================----------------] 3/5 plans in phase (60% code)
```

## Performance Metrics

- Phases completed this milestone: 1/7
- Plans completed this milestone: 6 (129: 3/3; 130: 3/5)
- Requirements covered: 41 v26.0 + PIPE-01 full + PIPE-02/03 full + PIPE-04 full (validation + pause) + PIPE-07/08 partial

## Accumulated Context

### Roadmap Evolution
- Phase 128 added: Sistema de Alertas + Memoria de Conversación CatBot (alertas consolidadas, memoria web 10+30, Telegram, sudo preserva contexto)

### From v25.1 (Centro de Modelos)
- Health API con verificacion real por alias/proveedor
- Centro de Modelos: 4 tabs (Resumen, Proveedores, Modelos, Enrutamiento)
- CatBot check_model_health con 3 modos
- UI cleanup: CatBoard, CatTools menu, horizontal tabs, model selector por tier
- CatBot tools: list_mid_models, update_mid_model, FEATURE_KNOWLEDGE actualizado
- Knowledge docs: 80+ archivos .md en .planning/ (catalogos, progress sessions, codebase docs)

### Decisiones previas relevantes para v26.0
- CatBot usa localStorage para historial de conversacion (a migrar a catbot.db)
- FEATURE_KNOWLEDGE eliminado, migrado a knowledge tree (query_knowledge + explain_feature usan loadKnowledgeArea)
- System prompt reemplazado por PromptAssembler con seciones priorizadas P0-P3 y presupuesto de tokens por tier
- CatBot tiene 52+ tools con permission gate (always_allowed, permission-gated, sudo-required)
- search_documentation tool ya busca en .planning/*.md con chunking y scoring
- Telegram bot soporta multi-usuario (chat_id based sessions)

### Decisiones de roadmap v26.0
- catbot.db como SQLite separado (no ATTACH, no tablas en docflow.db) -- aislamiento de lifecycle y backup
- Knowledge tree como JSON files en disco (no DB) -- versionable, diffable, editable por humanos
- PromptAssembler se aborda en Phase 2 (119) por ser el cambio de mayor riesgo -- hacerlo temprano minimiza superficie de cambio
- REASON y PROFILE se agrupan en Phase 121 porque el protocolo de razonamiento necesita el perfil para funcionar y ambos modifican route.ts
- LEARN y ADMIN se agrupan en Phase 124 (ultima) porque auto-enrichment necesita knowledge tree estable y admin protection necesita user profiles
- Summaries (Phase 123) puede paralelizar con 120-122 ya que solo depende de conversation_log de Phase 118

### Decisiones de Phase 121
- ensureProfile no llama upsertProfile si perfil ya existe (evita double interaction_count, Pitfall 4)
- Profile directives y known_context capados a 500 chars cada uno para proteger budget de tokens (Pitfall 3)
- Reasoning protocol con 3 niveles (SIMPLE/MEDIO/COMPLEJO) + Capa 0 skip inyectado como P1
- extractPreferencesFromTools usa zero-cost tool name patterns, sin LLM calls (Anti-Pattern 3)
- userId resolved from bodyUserId (Telegram) first, then deriveUserId fallback for web (Plan 02)
- Post-conversation profile update wrapped in try-catch to never break chat flow (Plan 02)
- Profile update only triggers when allToolResults.length > 0 (Plan 02)
- get_user_profile always_allowed via existing get_ prefix pattern; update_user_profile permission-gated with manage_profile action (Plan 03)
- update_user_profile regenerates initial_directives after every update for consistency (Plan 03)

### Decisiones de Phase 122
- Jaccard similarity threshold 0.8 for recipe dedup — high bar avoids false positives
- Recipe section capped at 500 chars to protect token budget on Libre tier
- Minimum 2 keyword matches required (or all if single-keyword trigger)
- Spanish stopwords filtered from trigger patterns for cleaner matching
- Recipe injection as P1 priority — can be truncated on Libre tier

### Decisiones de Phase 123
- Model ollama/gemma3:12b at temp 0.3 for factual extraction (zero cost Libre tier)
- Decision accumulation uses Set union to guarantee no decisions lost across compression levels
- JSON parse retry 1x then fallback to metadata-based summary (never lose data)
- Boot delay 2min para no interferir con Next.js startup
- extractConversationContent trunca a 4000 chars por conversacion

### Decisiones de Phase 124
- Jaccard similarity uses word-level tokenization (min 3 chars) with 0.8 threshold for learned entry dedup
- Rate limiting tracked per-process in-memory Map keyed by conversationId (3 entries max)
- save_learned_entry permission-gated with manage_knowledge action
- Content truncated to 500 chars matching profile directives pattern from Phase 121
- Safe delete pattern: two-step confirm flow (CONFIRM_REQUIRED preview then confirmed=true executes)
- knowledge_learned excluded from deleteUserData (global entries, no user_id); admin uses validate/reject
- executeTool context parameter is optional (default undefined) for backward compatibility with all existing callers
- USER_SCOPED_TOOLS (6 tools) enforce identity verification; cross-user access returns SUDO_REQUIRED

### Decisiones de Phase 125
- Parse catbot-tools.ts via regex instead of importing TOOLS to avoid heavy DB dependencies in test environment
- Duplicate tools across JSONs allowed (warn only) since some tools span areas like catpaw and catpower
- Bidirectional sync test + fs.existsSync source test as CI guardrails for knowledge tree drift

### Decisiones de Phase 126
- log_knowledge_gap is always_allowed — CatBot must register gaps without permission gates (self-improvement mechanism)
- knowledge_gaps table uses TEXT datetime defaults consistent with all other catbot.db tables
- Knowledge protocol section 771 chars (under 800 budget) to avoid Libre tier token pressure
- Escalation chain: query_knowledge -> search_documentation -> log_knowledge_gap
- Gap obligatorio: MUST call log_knowledge_gap when query_knowledge returns 0 results AND CatBot lacks answer
- query_knowledge consultation placed BEFORE Nivel COMPLEJO in reasoning protocol

### Decisiones de Phase 127
- getKnowledgeStats uses single SQL with COUNT/SUM CASE/AVG for efficiency (no multiple queries)
- Tree completeness calculated as filled-sections/7 (7 array fields per knowledge area)
- avgAccessCount rounded to 2 decimals for clean UI display
- Knowledge API pattern: GET with query param filters + PATCH with {id, action} body
- ktab param instead of tab to avoid collision with ModelCenterShell navigation
- Optimistic UI removal on validate/reject/resolve for instant feedback
- API response destructuring with fallback (res.entries ?? res) for robustness

### Decisiones de Phase 128
- AlertService boot delay 30s (lighter than SummaryService 2min since alert checks are fast SQLite queries)
- Dedup by category+alert_key prevents same alert from accumulating
- Each check method wrapped in individual try-catch so one failing check does not block others
- Acknowledged alerts auto-cleaned after 30 days in tick() cleanup
- AlertDialog uses shadcn base-ui components with dark theme styling matching project conventions
- Single-entry module cache keyed by JSON length + content prefix avoids redundant LLM compaction calls
- Compacted context injected as system role message with message count metadata
- Fallback returns error message string so LLM sees prior context existed even if compaction failed

### Decisiones de Phase 129 (Plan 03)
- INTENT-05 rule discovered to be already present in Plan 02's buildIntentProtocol (line 646: "Si last_error revela que no sabes algo, llama log_knowledge_gap ANTES de update_intent_status"); Plan 03 scope collapsed to test strengthening
- UNRESOLVED_INTENTS_THRESHOLD kept as file-level const (matches KNOWLEDGE_GAPS_THRESHOLD, STAGING_ENTRIES_THRESHOLD style) instead of the class-member pattern the plan proposed
- Strict > 5 threshold (not >=) per RESEARCH Pattern 6: 5 unresolved is normal, 6 is the escalation point
- Window semantics: completed_at IS NULL OR completed_at > -7 days -- catches both currently-stuck and recently-failed
- Test strengthening: new assertion requires last_error trigger word AND "antes" temporal word between log_knowledge_gap and update_intent_status, regression-proofing the INTENT-05 rule against future prompt trimming
- Task 2 (oracle verification) intentionally deferred to human -- cannot be automated per CLAUDE.md "CatBot como Oráculo" protocol

### Decisiones de Phase 129
- Named export of catbotDb added alongside default export (tests need DELETE FROM intents in beforeEach)
- executeTool context type extended with optional channel (backward compatible with every existing caller)
- retry_intent does NOT increment attempts at tool layer -- user-triggered retries are a green-light signal, not a failed attempt; attempts >= 3 ceiling still enforced via pre-check
- Plan 02 IntentWorker will carry the attempt-increment responsibility during background re-prompt cycle (LLM-driven retries are the only path that bumps the counter)
- list_my_intents is covered by both startsWith('list_') AND explicit allowlist entries for grep-ability
- Test pattern: tmp CATBOT_DB_PATH + vi.mock heavy deps allows real CRUD + real tool layer in one vitest file (reusable for 129-02 IntentWorker tests)
- Intent CRUD mirrors knowledge_gaps CRUD exactly for locality + discoverability
- IntentWorker NEVER re-executes tools -- retry is LLM-driven via buildOpenIntentsContext surfacing re-queued intents on the user's next turn (no double-execution risk)
- BOOT_DELAY=45s staggers IntentWorker after AlertService (30s) to minimize startup I/O contention on catbot.db WAL
- Intent protocol trimmed to 797 chars (under 800 Libre budget) via abbreviated headings and compact tool args to stay within PromptAssembler token budget
- buildOpenIntentsContext uses context.userId with 'web:default' fallback -- cross-user isolation verified in tests
- vi.hoisted pre-import env var override pattern adopted to isolate prompt-assembler tests from production catbot.db (static import of listIntentsByUser forces module load before any beforeAll runs)
- Source-grep test pattern adopted for anti-pattern enforcement (test reads intent-worker.ts string and asserts no executeTool match)
- Abandon condition uses intent.attempts + 1 >= MAX_ATTEMPTS so intents at attempts=2 are abandoned on the very next tick instead of re-queued to attempts=3

### Decisiones de Phase 130 (Plan 03)
- canvas-flow-designer.ts extraido como modulo standalone con VALID_NODE_TYPES as-const tuple (9 types) + validateFlowData + scanCanvasResources para aislar la logica de resource scanning + flow shape validation y hacerla unit-testeable sin mockear better-sqlite3
- validateFlowData acumula errores en vez de fail-fast para que el architect phase pueda loggear TODOS los problemas en una sola pasada (mejor loop de debugging del LLM prompt)
- scanCanvasResources usa per-table try/catch via helper `safe(sql)` interno — una tabla rota/inexistente devuelve [] sin afectar las otras tres (verificado por test que throws solo en el segundo prepare call)
- Validation gate en finalizeDesign colocado DESPUES del short-circuit needs_cat_paws pero ANTES del INSERT canvases: cuando el architect pausa para CatPaws, su flow_data es esperadamente parcial y validar seria ruido
- DbLike interface local (no exportado) — el Database real de better-sqlite3 satisface estructuralmente el type check sin necesidad de exportar un tipo publico adicional
- scanResources() en IntentJobExecutor mantenido como private static passthrough (no inlineado) para preservar test seam por si Plan 04 necesita overridearlo
- notifyUserCatPawApproval bumped a async para que finalizeDesign pueda awaitear sin warnings; Plan 04 Task 4 reemplazara el body por createNotification + TelegramBotService.sendMessageWithInlineKeyboard sin tocar el call site

### Decisiones de Phase 130 (Plan 01)
- ASYNC tool metadata kept in separate `ASYNC_TOOLS` const map (not inline `TOOLS[]` fields) to preserve strict OpenAI tools API schema compatibility -- getToolsForLLM spreads decorated copies for the LLM while tests assert source TOOLS[] stays clean
- list_my_jobs gate covered by `startsWith('list_')` always-allowed rule in getToolsForLLM (not an explicit allowlist entry) to avoid duplication with Phase 129 pattern
- execute_approved_pipeline implemented as permission-less internal twin of approve_pipeline -- same canvas execute kick but without the `phase !== 'awaiting_approval'` check, so IntentJobExecutor can drive it after the architect phase
- approve_pipeline fetch uses `INTERNAL_BASE_URL || baseUrl` (the executeTool caller's resolved URL) instead of hardcoding `http://localhost:3000` -- DocFlow actually runs on :3500 and hardcoding would break container networking
- countStuckPipelines threshold 30min matches Phase 128 AlertService convention for future checkStuckPipelines hook
- post_execution_decision save_recipe derives triggerPatterns from `progress.goal || job.tool_name` with empty-string filter to avoid useless `['']` patterns when progress has no goal field yet
- USER_SCOPED_TOOLS extended with the 5 user-facing new tools (not execute_approved_pipeline since it's internal) following Phase 124 cross-user isolation precedent
- Test file mirrors catbot-intents.test.ts exactly for locality: tmp CATBOT_DB_PATH + vi.hoisted-style env override + heavy-dep vi.mocks + real CRUD/tool layer -- 22 tests all green

### Riesgos identificados (de research)
- Token explosion: PromptAssembler DEBE tener presupuesto de tokens estricto (PITFALL-1)
- Dual SQLite: busy_timeout en ambas DBs, considerar ATTACH si hay conflictos WAL (PITFALL-2)
- Profile extraction: usar tool call patterns (coste cero), NO LLM call por conversacion (ANTI-PATTERN-3)

## Session Continuity

### Bloqueadores activos
- Phase 129 Plan 03 Task 2 (checkpoint:human-verify): CatBot oracle 7-step smoke test pending. Evidence goes in 129-03-SUMMARY.md "Oracle Evidence" section. Until completed, INTENT-05 + INTENT-06 are code-complete but not UAT-verified.

### TODOs
- [ ] Plan Phase 118 (Foundation)
- [ ] Plan remaining phases after 118 completes

### Archivos clave para v26.0
- .planning/ROADMAP.md -- Roadmap con 7 fases
- .planning/REQUIREMENTS.md -- 41 requisitos v26.0
- .planning/research/ARCHITECTURE.md -- Arquitectura target, patrones, file structure
- .planning/research/PITFALLS.md -- 5+ pitfalls criticos documentados
- .planning/research/FEATURES.md -- Feature research
- app/src/app/api/catbot/chat/route.ts -- Chat endpoint actual (a modificar en Phase 119)
- app/src/lib/services/catbot-tools.ts -- Tools actuales (a modificar en Phase 119)
- app/src/lib/db.ts -- Patron a seguir para catbot-db.ts
- app/src/instrumentation.ts -- Scheduler para summaries (Phase 123)
