---
gsd_state_version: 1.0
milestone: v27.0
milestone_name: milestone
status: "Phase 135 ARCH-PROMPT COMPLETE (3/3 plans). Plan 135-03 shipped: CANVAS_QA_PROMPT v135 role-aware (R10 scoped a transformer/synthesizer; emitter/guard/reporter/renderer NUNCA reciben R10), nuevo output schema con instruction_quality_score + per-issue scope/node_role, validateCanvasDeterministic cableado como pre-LLM gate dentro de runArchitectQALoop entre needs_cat_paws short-circuit y QA callLLM. buildActiveSets privado lee cat_paws/connectors WHERE is_active=1. On rejection, synthetic QaReport con recommendation='reject' + data_contract_score=0 alimenta decideQaOutcome sin gastar tokens de QA LLM. Fixtures pre-existentes (ARCH_V0_OK/V1_OK/ARCHITECT_OK/ARCH_WITH_NODES/archV0/v1/archDraft/Expanded) actualizadas con start node + valid agentId; default buildActiveSets spy en top-level beforeEach cubre todos los fixture ids. Synthetic validator report persistido en qa_iter{0,1} para FOUND-06 post-mortem. TDD 4 commits atómicos (29a38f1 RED1 / 88fce4d GREEN1 / 10eb78b RED2 / 357c8b3 GREEN2). 147/147 tests verdes (51 intent-job-executor + 36 catbot-pipeline-prompts + 60 canvas-flow-designer). 30/45 requirements cubiertos (ARCH-PROMPT-11..14 añadidos). Next: Phase 136 End-to-End Validation gate."
last_updated: "2026-04-11T16:00:00.000Z"
last_activity: 2026-04-11 -- 135-03 qa-role-aware-and-wiring COMPLETE (2 tasks TDD, 8 min, commits 29a38f1 + 88fce4d + 10eb78b + 357c8b3)
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 12
  completed_plans: 12
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)

**Core value:** Pipeline Architect inyecta el contexto correcto en cada ejecución (tools, contratos, canvases similares) — no espera que el LLM lo recuerde. Caso canónico Holded Q1 debe completarse end-to-end sin intervención.
**Current focus:** v27.0 CatBot Intelligence Engine v2 -- Phase 135 Architect Prompt Layer COMPLETE (3/3 plans). Next: Phase 136 End-to-End Validation (GATE).

## Current Position

Phase: 135 Architect Prompt Layer (ARCH-PROMPT) COMPLETE — 3/3 plans shipped
Plan: 135-03 qa-role-aware-and-wiring COMPLETE (ARCH-PROMPT-11..14). Next: Phase 136 VALIDATION gate.
Status: Phase 135 COMPLETE. Plan 135-03 shipped: CANVAS_QA_PROMPT v135 role-aware (R10 scoped a transformer/synthesizer; emitter/guard/reporter/renderer NUNCA reciben R10), algoritmo de revisión de 7 pasos con data.role read como step 1, triple scoring (quality_score + data_contract_score + instruction_quality_score), per-issue scope + node_role. validateCanvasDeterministic cableado como pre-LLM gate dentro de runArchitectQALoop entre needs_cat_paws short-circuit y QA callLLM. buildActiveSets privado lee cat_paws/connectors WHERE is_active=1. Rejection path sintetiza QaReport con recommendation='reject' + data_contract_score=0 + blockers=validation.issues → decideQaOutcome (Phase 134 contract unchanged) devuelve 'revise' y el loop avanza SIN llamar al QA LLM (token saving en canvases con fabricated slugs). Synthetic validator report persistido en qa_iter{0,1} para FOUND-06 post-mortem. QaReport extendido con instruction_quality_score/scope/node_role opcionales (backward compat). Pre-existing fixtures actualizadas (ARCH_V0_OK, ARCH_V1_OK, ARCHITECT_OK, ARCH_WITH_NODES, archV0/v1, archDraft/Expanded) con start node + valid agentId; default buildActiveSets spy en top-level beforeEach cubre todos los ids. TDD estricto 4 commits atómicos (29a38f1 RED1 4 failed / 88fce4d GREEN1 83/83 / 10eb78b RED2 4 failed / 357c8b3 GREEN2 147/147). 30/45 requirements cubiertos (ARCH-PROMPT-01..14 completos). Phase 136 es gate de validación pura contra LiteLLM real con failure routing matrix.
Last activity: 2026-04-11 -- 135-03 qa-role-aware-and-wiring COMPLETE (2 tasks TDD, 8 min, commits 29a38f1 + 88fce4d + 10eb78b + 357c8b3)

```
v27.0 roadmap progress:
  [x] Phase 133 — Foundation & Tooling (FOUND)          10 reqs   COMPLETE
      [x] 133-01 baseline-knowledge (FOUND-01/02/03)
      [x] 133-02 resilience-llm (FOUND-04/07/10)
      [x] 133-03 job-reaper (FOUND-05)
      [x] 133-04 intermediate-outputs-persistence (FOUND-06)
      [x] 133-05 test-pipeline-script (FOUND-08/09)
  [x] Phase 134 — Architect Data Layer (ARCH-DATA)       7 reqs   COMPLETE
      [x] 134-01 connector-contracts-module (ARCH-DATA-02/03)
      [x] 134-02 rules-index-scope-annotations (ARCH-DATA-07)
      [x] 134-03 scan-canvas-resources-enriched (ARCH-DATA-01/04/05)
      [x] 134-04 deterministic-qa-threshold (ARCH-DATA-06)
  [x] Phase 135 — Architect Prompt Layer (ARCH-PROMPT)  14 reqs   COMPLETE
      [x] 135-01 role-taxonomy-and-validator (ARCH-PROMPT-10)
      [x] 135-02 architect-prompt-rewrite (ARCH-PROMPT-01..09)
      [x] 135-03 qa-role-aware-and-wiring (ARCH-PROMPT-11..14)
  [ ] Phase 136 — End-to-End Validation (VALIDATION)     5 reqs   GATE
  [ ] Phase 137 — Learning Loops & Memory (LEARN)        9 reqs
Execution: linear 133 → 134 → 135 → 136 (gate) → 137
```

## Performance Metrics

- Phases completed this milestone (v27.0): 3/5 (Phase 133 + Phase 134 + Phase 135 COMPLETE)
- Plans completed this milestone: 12/25 (133-01..05, 134-01..04, 135-01..03)
- Requirements covered (v27.0): 30/45 (FOUND-01..10, ARCH-DATA-01..07, ARCH-PROMPT-01..14)

| Plan    | Duration | Tasks | Files | Date       |
|---------|----------|-------|-------|------------|
| 133-01  | 3 min    | 2     | 4     | 2026-04-11 |
| 133-02  | 3 min    | 2     | 2     | 2026-04-11 |
| 133-03  | 6 min    | 1     | 2     | 2026-04-11 |
| 133-04  | 4 min    | 2     | 3     | 2026-04-11 |
| 133-05  | 25 min   | 3     | 7     | 2026-04-11 |
| 134-01  | 2 min    | 1     | 2     | 2026-04-11 |
| 134-02  | 3 min    | 2     | 2     | 2026-04-11 |
| 134-03  | 4 min    | 3     | 4     | 2026-04-11 |
| 134-04  | 3 min    | 3     | 5     | 2026-04-11 |
- Previous milestone (v26.0): 41 reqs + PIPE-01..08 + QA2-01..08 completed en phases 118-132
| Phase 135 P01 | 4 min | 2 tasks | 2 files |
| Phase 135 P02 | 5 min | 1 tasks | 2 files |
| Phase 135 P03 | 8 | 2 tasks | 4 files |

## Accumulated Context

### Roadmap Evolution
- **v27.0 (new):** 5-phase linear roadmap 133-137 para arreglar el "Memento Man problem" del Pipeline Architect. Phase 136 es gate de validación pura contra LiteLLM real con failure routing matrix por capa (datos→134, prompt→135, gate tooling→133, runtime canvas→defer).
- Phase 128 added: Sistema de Alertas + Memoria de Conversación CatBot (alertas consolidadas, memoria web 10+30, Telegram, sudo preserva contexto)

### v27.0 Key Decisions (goal-backward anchors)
- **Señal única de éxito (PART 7 MILESTONE-CONTEXT.md):** Holded Q1 end-to-end vía Telegram, email a antonio+fen con template corporativo y cifras reales, reproducible 3 veces consecutivas sin intervención.
- **Fix del Memento Man NO es pedir al LLM que recuerde** — es inyectarle contexto estructurado (tools, contratos declarativos, canvases similares, templates) en cada invocación.
- **Phase 133 internal order mandatory:** `test-pipeline.mjs` (FOUND-08/09) es el ÚLTIMO task. Baseline (01/02) → canvas-nodes-catalog (03) → timeout (04) → flow_data exhaustion (07) → exhaustion notify (10) → reaper (05) → persistencia outputs (06) → test-pipeline (08/09).
- **Phase 134 quality threshold en código:** `data_contract_score >= 80 AND blockers.length === 0` determinista — NO parseado del prompt.
- **Phase 135 role-aware QA:** `data.role ∈ {extractor, transformer, synthesizer, renderer, emitter, guard, reporter}` obligatorio; R10 solo aplica a `transformer/synthesizer`; validador determinístico rechaza canvas con agentIds inexistentes sin gastar tokens.
- **Phase 136 NO es fase de código** — es gate de validación con failure routing matrix. Excepción permitida única: "passed QA, defer runtime" si `canvas-executor.ts` falla en runtime real (out-of-scope intocable).
- **Out of scope v27.0:** tocar `canvas-executor.ts`, `insertSideEffectGuards`, state machine `intent_jobs`, `attemptNodeRepair`, channel propagation, UI del canvas, tipos de nodo nuevos, subir `MAX_QA_ITERATIONS`, rehacer `complexity_assessment`.

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

## Session Continuity

**Next action:** Ejecutar Phase 136 End-to-End Validation (VALIDATION) — 5 requirements que son gate puro contra LiteLLM real (no es fase de código). Usar `app/scripts/test-pipeline.mjs --case holded-q1` como el oráculo end-to-end tras docker rebuild con Phase 135 integrado. Failure routing matrix: datos→134, prompt→135, gate tooling→133, runtime canvas→defer. Excepción permitida única: "passed QA, defer runtime" si canvas-executor.ts falla en runtime real (out-of-scope intocable). Pre-requisito: `docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app` para que CANVAS_QA_PROMPT v135 + validator gate estén vivos en runtime. Phase 135 commits en main: 29a38f1, 88fce4d, 10eb78b, 357c8b3 (más el metadata final).

### Señales empíricas para Phase 134 planner (extraídas del baseline holded-q1)

**LEE ESTAS ANTES DE PLANIFICAR PHASE 134** — son observaciones reproducibles del run real contra LiteLLM, no hipótesis:

1. **ARCH-DATA signal: architect alucina agentId slugs cuando el CatPaw no existe en inventario.**
   En el baseline holded-q1, `n3.data.agentId = "consolidador-financiero"` (run del baseline) / `"data-interpreter-agent"` (run previo) — ambos son **slugs fabricados, no UUIDs reales**. Contraste directo: `n1`, `n2` (holded MCP seed) y `n5` (Gmail emitter) **sí** tienen UUIDs reales. El patrón es reproducible: el architect encuentra agentes que existen en el scan, pero inventa slugs placeholder para cualquier CatPaw listado por el decomposer que aún no tiene fila en `agents`. **Phase 134 scanCanvasResources debe inyectar la lista completa de UUIDs reales con sus capacidades (descripción, connectorId asociado, tipo I/O) — sin inventario completo, el canvas-executor romperá en runtime al intentar resolver un slug que no existe en la tabla.**

2. **ARCH-PROMPT signal (Phase 135, no 134 — contextual): cero nodos del canvas generado tienen `data.role` declarado.**
   Los 6 nodes del baseline (`start`, `extract_2025`, `extract_2026`, `consolidate_data`, `generate_report`, `send_email`) emiten `instructions`, `agentId`, `connectorId` — ningún `role`. VALIDATION-01 (Phase 137) lo exige, y el reviewer de Phase 136 lo necesita para aplicar reglas condicionalmente (p.ej. R10 sólo a collectors/enrichers). Phase 134 no tiene que fixear esto — va en Phase 135 ARCH-PROMPT — **pero la interface entre capa de datos (134) y prompt (135) tiene que contemplar el campo role desde el inicio**.

3. **Backlog observation (NO bloquea v27.0):** el executor deja `status='pending'` cuando `pipeline_phase='awaiting_user'` en el PAW-approval gate. El script `test-pipeline.mjs` ya absorbe esto via `TERMINAL_PHASE`, pero cualquier otro caller que pollee `status` se queda colgado. Candidato a gap futuro.

Evidencia completa en `.planning/phases/133-foundation-tooling-found/133-VERIFICATION.md` (sección "Señales para fases siguientes") y baseline en `app/scripts/pipeline-cases/baselines/holded-q1.json`.

### v27.0 Execution Decisions
- **Plan 135-03 (ARCH-PROMPT-11..14):** CANVAS_QA_PROMPT v135 rebuild con "lee data.role ANTES de aplicar reglas" como step 1 explícito del algoritmo de revisión (no afterthought) — hace que R10-scope sea precondición, no condicional post-hoc. R10 scoped LITERAL a {transformer, synthesizer} con prohibición explícita doble en el prompt: en el paso 4 del algoritmo Y en la sección IMPORTANTE al final ("Un emitter o un nodo terminal NUNCA debe recibir R10"). Triple scoring (quality_score legacy + data_contract_score Phase 134 + instruction_quality_score NEW) preserva la regla `data_contract_score >= 80 AND blockers === 0` de decideQaOutcome (Phase 134 Plan 04 contract intocable). Per-issue `scope` (p.ej. "transformer,synthesizer" o "universal") + `node_role` sostienen traceability al debug: cuando un issue dispara en runtime real, el post-mortem puede verificar que el scope matched el role. validateCanvasDeterministic cableado dentro de runArchitectQALoop en posición ESPECÍFICA: después del `needs_cat_paws` short-circuit (Phase 132), antes del QA callLLM. Este orden es invariante de diseño: needs_cat_paws debe ganar porque el validator rechazaría canvases con placeholder agentId vacíos mientras que la short-circuit los trata como "pending human approval"; por eso el validator solo ve canvases que el architect cree definitivos. On rejection, synthetic QaReport con `recommendation:'reject' + data_contract_score:0 + blockers=validation.issues.map(...)` se alimenta a decideQaOutcome — devuelve 'revise' (score 0 < 80) y el loop avanza sin gastar QA LLM tokens. Synthetic QaReport persistido en qa_iter{0,1} para FOUND-06 post-mortem: sin esta línea, el post-mortem de Phase 136 perdería los rejection signals del validator y vería qa_iter{0,1}=NULL en fallos deterministas, confundiendo fallos del validator con fallos de infraestructura. Rule 3 deviation ARCH-PROMPT-14 sanctioned: 6 fixtures pre-existentes del test suite (ARCH_V0_OK/V1_OK/ARCHITECT_OK/ARCH_WITH_NODES/archV0/v1/archDraft/Expanded) actualizados con start node + valid agentId — eran minimal canvases de 1 nodo sin start, imposibles de pasar el validator. Un default `vi.spyOn(IntentJobExecutor, 'buildActiveSets').mockReturnValue(...)` en el top-level beforeEach cubre todos los fixture ids (`cp-1`, `cp-new`, `cp-test-1`, `paw-real-1`, `conn-test-1`, `conn-gmail`) en un solo lugar — tests del test (d) override localmente con active set restringido para forzar rechazo. Un inline assertion update: FOUND-07 node count 2→3 (por el start añadido a ARCH_WITH_NODES). QaReport interface extendido con `instruction_quality_score?` + `issues[].node_role?` + `issues[].scope?` — todos opcionales para preservar backward compat con los 47 tests existentes (ninguno tocado excepto los fixtures). buildActiveSets vive en intent-job-executor.ts (no en canvas-flow-designer.ts) porque validateCanvasDeterministic es pure function y la construcción de active sets es un I/O concern del executor. Error path de buildActiveSets: catch + log warn + return empty sets — un DB outage rechaza todos los canvas loudmente en vez de dejar al architect fabricar slugs unchecked. TDD estricto 4 commits (2 RED + 2 GREEN). 147/147 tests verdes final (51 intent-job-executor incl. 4 ARCH-PROMPT-13 + 36 catbot-pipeline-prompts incl. 4 ARCH-PROMPT-11..12 + 60 canvas-flow-designer intactos).
- **Plan 135-02 (ARCH-PROMPT-01..09):** ARCHITECT_PROMPT rehecho como estructura de 7 secciones machine-parseables (`## N.` markers) para que el test-as-spec pueda split-por-sección y assertar por bloque. Heartbeat checklist en 6 pasos (sección 3) es el corazón del plan: obliga al LLM a recorrer tasks en orden y tomar decisiones explícitas sobre role → contract → iterator → paw_id → cadena → fallback. Few-shot con anti-pattern literal `analista-financiero-ia` (no hipótesis): si el LLM genera exactamente ese slug lo reconocerá como ejemplo MALO del prompt. needs_cat_paws subió de 3 fields (name/system_prompt/reason) a 5 fields (name/mode/system_prompt/skills_sugeridas/conectores_necesarios) — cambio breaking para downstream consumer `awaiting_user` approval flow, pero plan 03 + Phase 136 aún no validan contra esa key y el único call site que la lee (intent-job-executor.ts línea ~560-580 needs_cat_paws persistence) solo hace JSON passthrough al gate de aprobación. Deviation menor (dentro de plan intent): añadido bloque compacto "Anti-patterns a recordar (DA01-DA04)" entre sección 7 y output schema porque el test existente de Phase 132 `references anti-patterns DA01-DA04` sigue verde y removerlo rompería backward compat. Output schema `type` enumera TODOS los VALID_NODE_TYPES (no solo los 6 canónicos del draft) para prevenir poda inadvertida de tipos legacy (catbrain/multiagent/scheduler/checkpoint/storage/merge/output). Preservado `needs_rule_details` expansion pass (QA2-02) — sección 7 documenta los dos call sites (preliminary + expanded). TDD estricto: RED con 12 failed explícitos (`12 failed | 19 passed`), GREEN con 31/31. Regresion gate amplia: 107/107 en intent-job-executor + canvas-flow-designer (suites intocadas pero verificadas). Zero cambios fuera de los 2 archivos listados.
- **Plan 135-01 (ARCH-PROMPT-10):** ROLE_TAXONOMY colocada en `canvas-flow-designer.ts` (no módulo nuevo) para evitar ciclos de import y tener un único source-of-truth junto a VALID_NODE_TYPES. validateCanvasDeterministic es pure function sin import de catbotDb — las active sets (activeCatPaws, activeConnectors) las construye el caller de plan 03 desde `cat_paws WHERE is_active=1` y `connectors WHERE is_active=1`. El validator NO se inyecta en el executor aún; plan 03 lo cablea como pre-LLM gate. Shape del rejection `{ok:false, recommendation:'reject', issues:[{severity:'blocker',rule_id:'VALIDATOR',node_id,description}]}` diseñada como drop-in para QaReport consumer: si el validator rechaza, runArchitectQALoop puede emitir una QaReport sintética sin parsear JSON del LLM. agentId también se valida para `multiagent` (no solo `agent`) porque canvas-executor trata multiagent como dispatch de grupo de agentes — mismo requisito de UUID real. DFS de ciclos breaks on first cycle (un issue basta como señal). Reuso de `VALID_NODE_TYPES.includes` sin duplicar — satisface el key_links pattern declarado en el plan. TDD RED→GREEN en 2 commits atómicos (test-only primero, feat después). 60/60 tests canvas-flow-designer verdes (53 existentes + ROLE_TAXONOMY shape + 2 happy paths + 7 rejection cases). Zero deviations.
- **Plan 134-04 (ARCH-DATA-06):** decideQaOutcome es `static public` (no private) para que los tests lo llamen via `IntentJobExecutor.decideQaOutcome(...)` sin wrapper nuevo. Acceso a parseJSON (private) en tests se hace via `as unknown as DecideQaExec` — mismo pattern del `qaInternals()` existente que ya defeat el `private` modifier. NO se necesitó extender qaInternals export en producción. Dos log lines por QA iter: `QA outcome (deterministic)` (nuevo, autoritative para Phase 136 routing) + `QA review complete` (preservado para compat con grepeos existentes). progressMessage mantiene qa_recommendation Y añade qa_outcome — downstream UI/Telegram consumers no se rompen y el qa_outcome es la fuente de verdad. Fallback retrocompat (data_contract_score ausente → quality_score) mantuvo los 34 tests de runArchitectQALoop existentes verdes en primer run. Tests 12-13 feedean raw JSON string por parseJSON y assertean doble invariante: (a) `parsed.data_contract_score === N` (el campo sobrevive el parser), (b) `decideQaOutcome(parsed)` usa el data_contract_score, NO cae silentmente al quality_score. Este es el oráculo end-to-end del BLOCKER 2 del planner. 47 intent-job-executor tests + 18 catbot-pipeline-prompts tests verdes. Checkpoint Task 4 auto-aprobado por `workflow.auto_advance=true`; docker rebuild + live log audit es responsabilidad del próximo deploy.
- **Plan 134-03 (ARCH-DATA-01/04/05):** scanCanvasResources reescrito con 4 top-level keys (catPaws, connectors, canvas_similar, templates). Cada catPaw trae tools_available derivado via JOIN cat_paw_connectors → getConnectorContracts(type).contracts keys — sin alucinación de action names. Cada connector publica contracts slim (drop source_line_ref: saving de ~30% en tokens del prompt architect; el source_line_ref sigue vivo en el módulo para auditing humano). canvas_similar top-3 con keyword extraction (stopwords ES/EN + 3-char min threshold; q1/q2 caen bajo el threshold pero la señal 'facturación' + 'holded' del caso canónico cubre holded-q1). node_roles por canvas_similar parseado de flow_data.nodes[].type dedupado cap 20. templates ordenado por times_used DESC LIMIT 20 con node_types dedupado. buildCatPaws/Connectors/CanvasSimilar/Templates como helpers puros con top-level try/catch wrapper cada uno → resilencia per-table (un table error blanquea solo esa key). BLOCKER 3 closure: architect_input log emite canvas_similar_shape/templates_shape/catPaws_shape como arrays con {id,name,*_count} — no solo counts — probando que los arrays enriquecidos propagaron a architectInputObj. Rule 3 deviation (menor): 16 call sites de tests en intent-job-executor.test.ts pasaban old shape {catPaws,catBrains,skills,connectors}; sed global rename al shape nuevo + actualización de un mock catPaw al CatPawResource shape. 50 tests canvas-flow-designer + 34 intent-job-executor verdes.
- **Plan 134-01 (ARCH-DATA-02/03):** Gmail action keys en snake_case (send_report/send_reply/mark_read/forward) para coincidir con literales `actionData.accion_final` comparados por === en canvas-executor.ts — evita capa de mapeo que sería fuente de bugs. google_drive modela campos de `node.data` (no predecessorOutput) porque el executor los lee de ahí; distinción explícita en cada description. mcp_server: una sola action `invoke_tool` genérica (required=[tool_name], optional=[tool_args]); Holded vive aquí vía tool_name='holded_*' — NO se modelan contratos por tool porque los MCP servers son autodescribibles en runtime. smtp/http_api/n8n_webhook quedan como stubs por completeness para que getConnectorContracts nunca devuelva null en escenarios fuera del caso canónico. source_line_ref obligatorio en cada action (no dinámico, cumple "no scan" del plan). Módulo type-only sin imports → Plan 03 puede importarlo desde canvas-flow-designer.ts sin riesgo de ciclos. TDD rojo→verde: test falló primero (12 tests, 0 passing), luego 12/12 green tras implementar.
- **Plan 134-02 (ARCH-DATA-07):** Sintaxis condicional R02 `[scope: extractor,transformer-when-array]` — guion convierte la condicion en token unico parseable sin romper formato simple de un solo bracket. Reglas no dictadas por ARCH-DATA-07 (R01, R05-R09, R12-R14, R16-R19, R21, R22, R25, SE02, SE03, DA01-DA04) se dejan SIN anotacion: el spec solo exige las 4 enumeradas + las 6 universales exentas. Test parser-over-disk (`fs.readFileSync`) rompe si alguien edita el .md sin actualizar — regression guard efectivo contra drift silencioso entre Phase 134 y Phase 135 reviewer.
- **Plan 133-02 (FOUND-04/07/10):** callLLM rewrap AbortError inside (no en tick catch) para mantener prefix `litellm timeout (90s)` consistente con otros error paths. Knowledge_gap.context slice subido 4000 → 8000 para fit flow_data. extractTop2Issues ranks blocker > major/high > minor/medium para cubrir ambas convenciones del QA prompt. notifyProgress(force=true) DEBE firear ANTES de markTerminal para que channel info aún esté presente.
- **Plan 133-03 (FOUND-05):** Reaper query usa `pipeline_phase IN (...)` NO `status IN (...)` — en el schema real `status` es pending/failed/completed/cancelled y la fase del pipeline vive en `pipeline_phase`. Importado `catbotDb` directo (no default `db` de `@/lib/db`) porque intent_jobs vive en catbot.db, no en sources. Reaper NO se auto-ejecuta al arrancar — primer fire es +5min, aún dentro del threshold 10min y evita race con cleanupOrphans. awaiting_user/awaiting_approval NUNCA se reapan (pueden vivir horas esperando humano).
- **Plan 133-04 (FOUND-06):** Rule 3 deviation — migración y tipos van en `catbot-db.ts`, NO en `db.ts` + `intent-jobs.ts` que el plan pedía (esos paths no existen; intent_jobs vive en catbotDb). Helper `addColumnIfMissing(table, column, type)` introspecta PRAGMA table_info antes del ADD COLUMN (SQLite no soporta IF NOT EXISTS para ADD COLUMN). En runArchitectQALoop se persiste `architectRawFinal` (variable que arranca como architectRaw y se sobreescribe con expandedRaw si la expansion pass needs_rule_details dispara) — así Phase 134 audita el architect output que REALMENTE llegó a QA, no el draft descartado. Mapping iter→columna hardcoded a iter0/iter1 (no dynamic keys) porque MAX_QA_ITERATIONS=2 es invariante declarada en Phase 132 y mantiene TypeScript estricto. Stage columns opt-in en patch (no positional) preserva compatibilidad con 30+ call sites existentes.
- **Plan 133-05 (FOUND-08/09):** Rule 3 deviation — import strategy pivot: el plan asumía `.next/standalone/app/src/lib/services/intent-job-executor.js` pero Next.js bundlea esa clase en chunks de API routes, no la expone como standalone. Abandonar import del executor entero; mirror `setup-inbound-canvas.mjs` (better-sqlite3 puro via ESM). El script inserta fila sintética y confía en `IntentJobExecutor.start()` ya corriendo dentro del contenedor Next.js (lo arranca `instrumentation.ts`) — mismo dispatch flow que un POST desde la UI web. Zero new deps, zero build step. Cleanup SIGINT handler añadido (Rule 2) para no dejar zombies si se Ctrl+C durante el polling. Timeout script = 120s (criterio <60s es de done, no del tooling) para dar headroom al primer pickup (tick 30s) y reportar útil aún en slow runs. Auto-mode checkpoint:human-verify auto-aprobado; smoke-test runtime <60s queda como responsabilidad operacional post docker rebuild.

**Remember when planning Phase 133:**
- `test-pipeline.mjs` (FOUND-08/09) DEBE ser el último task del último plan de la fase. Si se planifica antes, el script ejecuta el pipeline incompleto y sus resultados no sirven.
- Criterio de done exacto: `node app/scripts/test-pipeline.mjs --case holded-q1` imprime flow_data + qa_report + outputs intermedios en stdout en < 60 segundos.

**Referencias canonizadas del milestone:**
- `.planning/MILESTONE-CONTEXT.md` — briefing final (8 partes, PART 7 = señal única)
- `.planning/MILESTONE-CONTEXT-AUDIT.md` — auditoría 86 preguntas
- `.planning/REQUIREMENTS.md` — 45 requirements mapeados a fases 133-137
- `.planning/ROADMAP.md` — este roadmap (creado 2026-04-11)
