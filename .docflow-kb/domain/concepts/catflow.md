---
id: concept-catflow
type: concept
subtype: catflow
lang: es
title: "CatFlow — Pipeline visual multi-agente"
summary: "Los CatFlows son pipelines visuales multi-agente en /catflow con 13 tipos de nodo, modelo de dos capas (base + extras), modo escucha y Reglas de Oro R01..R25 derivadas de fallos reales."
tags: [catflow, canvas]
audience: [catbot, architect, developer, user]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from app/data/knowledge/catflow.json during Phase 151 (concepts + description)" }
ttl: never
---

# CatFlow

## Descripción

Los CatFlows son pipelines visuales multi-agente en `/catflow`. Incluyen nodos de
tipo `Start`, `Agent`, `CatBrain`, `Connector`, `Checkpoint`, `Merge`, `Condition`,
`Scheduler`, `Iterator`, `Iterator End`, `Storage`, `MultiAgent`, `Output`.

Las **Tareas** son pipelines multi-agente secuenciales donde defines pasos (agente,
checkpoint humano, síntesis) que se ejecutan secuencialmente. Cada agente puede usar
RAG y skills. Los CatFlows pueden escuchar señales de otros CatFlows (modo escucha)
y activarse automáticamente.

## Conceptos fundamentales

### Composición

- CatFlows son pipelines visuales multi-agente con nodos arrastrables.
- Tareas son pipelines secuenciales multi-agente (pasos: agente, checkpoint, síntesis).
- Nodos disponibles: `Start`, `Agent`, `CatBrain`, `Connector`, `Checkpoint`, `Merge`, `Condition`, `Scheduler`, `Iterator`, `Iterator End`, `Storage`, `MultiAgent`, `Output`.
- **Modelo de dos capas** en nodos Agent: Base (CatPaw con skills/conectores/CatBrains sólidos) + Extras (canvas-only con borde dashed).
- En ejecución se mergean base + extras sin duplicados.
- CatFlows pueden escuchar señales de otros CatFlows y activarse automáticamente.
- `Iterator` permite bucles forEach sobre arrays con nodo par `Iterator End`.
- **Propagación de datos** entre nodos: cada nodo recibe SOLO el output del nodo anterior.

### Reglas de Oro (R01..R25, SE, DA)

- **Reglas de Oro** (`reglas_canvas`): R01–R25 derivadas de fallos reales para diseñar CatFlows — ver `../../rules/R*.md` para cada una.
- **R01** — Definir contrato de datos entre TODOS los nodos ANTES de escribir instrucciones.
- **R02** — Calcular `N_items × tool_calls` vs `MAX_TOOL_ROUNDS` (12). Si >60% usar `ITERATOR`.
- **R05** — Un nodo = una responsabilidad. Si redacta+maqueta+selecciona, dividir.
- **R06** — Conocimiento de negocio en SKILLS, no en instrucciones del nodo.
- **R10** — JSON in → JSON out: mantener TODOS los campos originales.
- **R20** — Si puede hacerse con código, NO delegarlo al LLM.
- **R22** — Referencias entre entidades usan RefCodes (6 chars), no nombres.
- **R24** — Nunca hacer fallback destructivo. Si input corrupto, devolver vacío.
- **R25** — Idempotencia obligatoria: registrar `messageId` procesados.
- **SE01** — Antes de cada send/write/upload/create → insertar condition guard automático.
- **SE02** — Guard valida que el contrato de entrada tiene TODOS los campos requeridos no vacíos.
- **SE03** — Si `guard.false` → agent reportador auto-repara vía CatBot 1 vez, luego `log_knowledge_gap`.
- **DA01** — No pases arrays >1 item a nodos con tool-calling interno (usa `ITERATOR`).
- **DA02** — No enlaces connectors/skills que el nodo no va a usar.
- **DA03** — No generes URLs con LLM, usa campos específicos del output del tool.
- **DA04** — No dependas de datos fuera del input explícito del nodo.

### Rules Index y lookup de reglas

- *Rules Index* escalable en `app/data/knowledge/canvas-rules-index.md` (32 reglas, cada línea ≤100 chars) consumido por Pipeline Architect vía `loadRulesIndex()`.
- `getCanvasRule(rule_id)` expande una regla específica a su texto completo leyendo `.planning/knowledge/canvas-nodes-catalog.md` (lookup on-demand, no infla prompt base).

### Side-effect detection y QA loop

- **Side-effect detection** usa `ctxResolver` cacheado que mapea `data.connectorId → connectors.type`, así Gmail/SMTP/http_api/mcp_server reciben guard aunque el nodo no declare `mode/action/tool_name`.
- La ruta de reanudación `architect_retry` (tras aprobación de CatPaws) pasa por el mismo QA loop de 2 iteraciones que los pipelines frescos.
- `notifications` tiene columnas first-class `channel` + `channel_ref`; `notifyUserIrreparable` hace push directo a Telegram cuando el pipeline originario fue Telegram.

### Architect data layer (Phase 134)

- **Canvas Connector Contracts** (Phase 134 ARCH-DATA): módulo estático `app/src/lib/services/canvas-connector-contracts.ts` que mapea cada connector type (`gmail`, `google_drive`, `mcp_server`, `smtp`, `http_api`, `n8n_webhook`, `email_template`) a sus actions con `required_fields`/`optional_fields`. `scanCanvasResources` hace JOIN de `cat_paw_connectors` y llama `getConnectorContracts(type)` para expandir cada CatPaw con sus tools reales — así el architect LLM no fabrica `agentIds` ni tools inexistentes.
- **Deterministic QA Threshold** (Phase 134 ARCH-DATA-06): `IntentJobExecutor.decideQaOutcome(qaReport)` es pure function que decide `accept/revise` en código sin leer `qaReport.recommendation` del LLM. Regla exacta: `data_contract_score >= 80 AND blockers.length === 0` → accept; todo lo demás → revise. Fallback retrocompat a `quality_score` si el LLM omite `data_contract_score`. Determinismo verificable en unit tests para que Phase 136 enrute fallos reproduciblemente.
- **Enriched CanvasResources shape** (Phase 134 ARCH-DATA-01/04/05): `scanCanvasResources(db, {goal})` en `canvas-flow-designer.ts` devuelve 4 keys que `runArchitectQALoop` pasa al LLM cada iter y loguea como `architect_input`: `catPaws[] {paw_id,paw_name,paw_mode,tools_available[],skills[],best_for}`; `connectors[] {connector_id,connector_name,connector_type,contracts}`; `canvas_similar[]` top-3 filtrado por keywords del goal; `templates[]` desde `canvas_templates` con `node_types[]`.

### Learning loops y outcomes

- `complexity_decisions.outcome` (Phase 137 Plan 02 LEARN-08): campo que se cierra en los terminal paths del pipeline async. Valores: `completed | cancelled | timeout | queued | null`. Cerrado por `intent-job-executor` en 3 puntos — `finalizeDesign` al alcanzar `awaiting_approval` (completed), `runArchitectQALoop` cuando agota iteraciones (cancelled), `reapStaleJobs` cuando el reaper mata un job colgado >10min (timeout). El loop permite al oracle tool `get_complexity_outcome_stats` (plan 137-03) devolver un histograma real de éxito/fallo por clasificación para que CatBot se auto-verifique per CLAUDE.md oracle protocol.
- `intent_jobs.complexity_decision_id` (Phase 137 Plan 02 LEARN-08): FK opcional a `complexity_decisions.id` añadida vía migración idempotente en `catbot-db.ts`. `createIntentJob` acepta `complexityDecisionId` como parámetro opcional; `catbot/chat/route.ts` lo pasa en ambos escalation call sites. Pipelines que bypassan la clasificación de complejidad quedan con NULL y el helper `closeComplexityOutcome` hace no-op en vez de romper. El helper reutiliza `updateComplexityOutcome` ya existente en `catbot-db.ts` — NO re-implementa el UPDATE.
- **START node convention** (Phase 137 Plan 02 LEARN-05): `runArchitectQALoop` muta `design.flow_data.nodes[start].data.initialInput = goal` antes de devolver el design aceptado. El goal del strategist manda sobre cualquier `initialInput` preexistente. Sin esta propagación el primer nodo downstream recibiría el `original_request` ambiguo en vez del goal accionable refinado por el strategist.
- **Condition node multilingual variants** (Phase 137 Plan 02 LEARN-06): `canvas-executor` `normalizeConditionAnswer` acepta `yes|si|afirmativo|correcto|true|1` → YES; `no|negativo|incorrecto|false|0` → NO. Case-insensitive, con cleanup de puntuación final y first-token fallback para respuestas del tipo *"si, con reservas"*. Excepción sancionada a la regla "no tocar `canvas-executor.ts`" per milestone v27.0.

## Referencias

- Guía operativa: `../../guides/how-to-use-catflows.md`.
- Reglas atómicas: `../../rules/R01-data-contracts.md` .. `../../rules/R25-mandatory-idempotence.md`, más `SE01..SE03` y `DA01..DA04`.
- Canvas nodes: `./canvas-node.md` + `../taxonomies/node-roles.md`.
- Fuente original: `app/data/knowledge/catflow.json` (migración Phase 151).
