# Roadmap: DoCatFlow v10.0 — CatPaw: Unificacion de Agentes

**Milestone:** v10.0
**Phases:** 5 (phases 42-46, continuing from v9.0)
**Requirements:** 39 total
**Coverage:** 39/39
**Started:** 2026-03-15

---

## Phases

- [x] **Phase 42: Modelo de Datos + Migracion** - Crear tablas cat_paws y relaciones, migrar custom_agents y docs_workers, interfaz TypeScript (completed 2026-03-15)
- [x] **Phase 43: API REST CatPaws** - CRUD completo + endpoints de relaciones + OpenClaw sync + backward compat redirects (completed 2026-03-15)
- [x] **Phase 44: Motor de Ejecucion executeCatPaw()** - Funcion central de orquestacion, integracion en task-executor y canvas-executor (completed 2026-03-15)
- [x] **Phase 45: UI Pagina de Agentes Rediseñada** - Listado con grid/filtros, wizard 4 pasos, detalle con tabs, chat directo, integracion Canvas/Tareas (completed 2026-03-15)
- [x] **Phase 46: CatBot Tools + Polish** - Tools CatBot, banner migracion workers, dashboard unificado, seeds de ejemplo (completed 2026-03-15)

---

## Phase Details

### Phase 42: Modelo de Datos + Migracion
**Goal**: Las 5 tablas nuevas existen en la DB, los datos de custom_agents y docs_workers estan migrados sin perdida, y la interfaz CatPaw esta definida en TypeScript
**Depends on**: Nothing (pure data layer)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08
**Success Criteria** (what must be TRUE when phase completes):
  1. Al arrancar la aplicacion, las tablas `cat_paws`, `cat_paw_catbrains`, `cat_paw_connectors`, `cat_paw_agents` y `cat_paw_skills` existen con todas las columnas y constraints definidos
  2. Los registros de `custom_agents` aparecen en `cat_paws` con mode='chat' y los de `docs_workers` con mode='processor', preservando IDs originales
  3. Los skills de agent_skills y worker_skills estan migrados a cat_paw_skills
  4. La interfaz TypeScript `CatPaw` esta exportada desde types.ts con todos los campos y tipos correctos
  5. `npm run build` pasa sin errores TypeScript
**Plans**: 1 plan (data model is self-contained)
Plans:
- [x] 42-01-PLAN.md — DB tables (5 CREATE TABLE), migrations (3 INSERT OR IGNORE), TypeScript interface

### Phase 43: API REST CatPaws
**Goal**: El API REST de CatPaws esta completo con CRUD, relaciones, OpenClaw sync y backward compat — todos los endpoints responden correctamente
**Depends on**: Phase 42 (tablas cat_paws y relaciones deben existir)
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06, API-07, API-08, API-09, API-10, API-11, API-12
**Success Criteria** (what must be TRUE when phase completes):
  1. `GET /api/cat-paws` devuelve lista de CatPaws con counts de relaciones, filtrables por mode/department/active
  2. `POST /api/cat-paws` crea un CatPaw valido y `DELETE /api/cat-paws/[id]` lo elimina con CASCADE
  3. Los endpoints de relaciones (catbrains, connectors, agents) permiten vincular y desvincular correctamente
  4. `POST /api/cat-paws/[id]/openclaw-sync` crea/actualiza el agente en OpenClaw workspace
  5. Las rutas antiguas `/api/agents` y `/api/workers` devuelven 301 redirect a `/api/cat-paws`
**Plans**: 2 plans
Plans:
- [x] 43-01-PLAN.md — CRUD routes (GET/POST/PATCH/DELETE cat-paws) + detail with relations
- [x] 43-02-PLAN.md — Relation routes (catbrains, connectors, agents) + openclaw-sync + backward compat redirects

### Phase 44: Motor de Ejecucion executeCatPaw()
**Goal**: La funcion executeCatPaw() orquesta correctamente RAG, conectores y LLM, y esta integrada en task-executor y canvas-executor
**Depends on**: Phase 43 (API necesaria para cargar CatPaw con relaciones)
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05
**Success Criteria** (what must be TRUE when phase completes):
  1. Las interfaces CatPawInput y CatPawOutput estan definidas y exportadas
  2. executeCatPaw() carga el CatPaw completo, consulta CatBrains vinculados via executeCatBrain(), invoca conectores activos, y llama LiteLLM con el system prompt correcto
  3. Cada ejecucion registra uso en usage_logs con paw_id, tokens y modelo
  4. El task executor detecta agent_id en cat_paws y usa executeCatPaw(), con fallback a custom_agents
  5. El canvas executor usa executeCatPaw() para nodos AGENT/CATPAW
**Plans**: 1 plan (executor is self-contained ~150 lines + 2 integration points)
Plans:
- [x] 44-01-PLAN.md — CatPawInput/Output types, executeCatPaw service, task-executor integration, canvas-executor integration

### Phase 45: UI Pagina de Agentes Rediseñada
**Goal**: La pagina /agents muestra CatPaws unificados con wizard de 4 pasos, detalle con tabs, chat directo, y los selectores en CatBrain pipeline, Tareas y Canvas apuntan a CatPaws
**Depends on**: Phase 44 (executeCatPaw necesario para chat y selectores)
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, UI-09
**Success Criteria** (what must be TRUE when phase completes):
  1. El sidebar muestra "Agentes" con icono PawPrint y NO muestra "Docs Workers"
  2. La pagina /agents muestra grid de cards con badges de modo (violet/teal/amber), filtros funcionales, y busqueda por nombre
  3. El wizard de 4 pasos permite crear un CatPaw completo con todas las relaciones
  4. La pagina de detalle tiene 5 tabs funcionales (Identidad, Conexiones, Skills, Chat, OpenClaw) con Chat usando streaming SSE
  5. En CatBrain pipeline, el selector de Worker muestra CatPaws procesadores; en Tareas y Canvas, los selectores apuntan a CatPaws
**Plans**: 3 plans
Plans:
- [x] 45-01-PLAN.md — Sidebar update + list page with grid/filters + CatPaw card component
- [x] 45-02-PLAN.md — Wizard 4 steps + detail page with 5 tabs (Identidad, Conexiones, Skills, Chat, OpenClaw)
- [x] 45-03-PLAN.md — CatBrain pipeline selector, Tasks agent selector, Canvas AGENT node update

### Phase 46: CatBot Tools + Polish
**Goal**: CatBot conoce CatPaws, la pagina /workers muestra banner de migracion, el dashboard muestra stats unificados, y hay seeds de ejemplo para instalaciones nuevas
**Depends on**: Phase 45 (UI debe estar completa para verificar polish)
**Requirements**: POLISH-01, POLISH-02, POLISH-03, POLISH-04, POLISH-05
**Success Criteria** (what must be TRUE when phase completes):
  1. CatBot puede listar CatPaws (por modo) y crear un CatPaw nuevo via tool calling
  2. La pagina /workers muestra banner de migracion con enlace a /agents?mode=processor, sin boton de crear
  3. El dashboard muestra "CatPaws activos" con desglose por modo (chat/processor/hybrid)
  4. El panel /system muestra metricas unificadas de CatPaws (no agents/workers separados)
  5. Si cat_paws esta vacia tras migracion, se insertan 2 seeds de ejemplo
**Plans**: 1 plan (polish tasks are small and independent)
Plans:
- [x] 46-01-PLAN.md — CatBot tools update, /workers banner, dashboard stats, /system metrics, seeds

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 42. Modelo de Datos + Migracion | 1/1 | Complete    | 2026-03-15 |
| 43. API REST CatPaws | 2/2 | Complete    | 2026-03-15 |
| 44. Motor de Ejecucion executeCatPaw() | 1/1 | Complete    | 2026-03-15 |
| 45. UI Pagina de Agentes Rediseñada | 3/3 | Complete    | 2026-03-15 |
| 46. CatBot Tools + Polish | 1/1 | Complete | 2026-03-15 |

---

## Dependency Chain

```
Phase 42 (Modelo de Datos + Migracion)
  |-> Phase 43 (API REST CatPaws)
        |-> Phase 44 (Motor de Ejecucion)
              |-> Phase 45 (UI Agentes)
                    |-> Phase 46 (Polish)
```

Build order: 42 -> 43 -> 44 -> 45 -> 46
- Phase 42 first (data foundation — tables and types must exist)
- Phase 43 second (API needs tables, executor needs API)
- Phase 44 third (executor needs API to load CatPaw data)
- Phase 45 fourth (UI needs executor for chat and API for CRUD)
- Phase 46 last (polish depends on everything else being functional)

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| DATA-01 | 42 |
| DATA-02 | 42 |
| DATA-03 | 42 |
| DATA-04 | 42 |
| DATA-05 | 42 |
| DATA-06 | 42 |
| DATA-07 | 42 |
| DATA-08 | 42 |
| API-01 | 43 |
| API-02 | 43 |
| API-03 | 43 |
| API-04 | 43 |
| API-05 | 43 |
| API-06 | 43 |
| API-07 | 43 |
| API-08 | 43 |
| API-09 | 43 |
| API-10 | 43 |
| API-11 | 43 |
| API-12 | 43 |
| EXEC-01 | 44 |
| EXEC-02 | 44 |
| EXEC-03 | 44 |
| EXEC-04 | 44 |
| EXEC-05 | 44 |
| UI-01 | 45 |
| UI-02 | 45 |
| UI-03 | 45 |
| UI-04 | 45 |
| UI-05 | 45 |
| UI-06 | 45 |
| UI-07 | 45 |
| UI-08 | 45 |
| UI-09 | 45 |
| POLISH-01 | 46 |
| POLISH-02 | 46 |
| POLISH-03 | 46 |
| POLISH-04 | 46 |
| POLISH-05 | 46 |

**Mapped: 39/39 — 100% coverage**

---

## Technical Notes (for plan-phase)

### Key patterns
- cat_paws: CREATE TABLE IF NOT EXISTS in db.ts init block, migrations via INSERT OR IGNORE
- executeCatPaw: mirrors executeCatBrain pattern — load entity, orchestrate RAG+connectors+LLM
- CatPawInput/CatPawOutput: in lib/types/catpaw.ts (new file, alongside catbrain.ts)
- API routes: /api/cat-paws/ with dynamic = 'force-dynamic', generateId() for UUIDs
- Backward compat: 301 redirects from /api/agents and /api/workers (keep old route files)
- UI: /agents page rewrite (not new URL), wizard uses Sheet/Dialog pattern
- Canvas: AGENT node type stays, selector changes from custom_agents to cat_paws
- Tasks: agent_id field in task_steps points to cat_paws, fallback to custom_agents
- Chat: POST /api/cat-paws/[id]/chat with SSE streaming (same pattern as catbrains chat)

### Critical constraints
- All env vars: `process['env']['VARIABLE']` bracket notation
- All UI text in Spanish
- All API routes: `export const dynamic = 'force-dynamic'`
- crypto.randomUUID NOT available — use generateId()
- Colors: Primary mauve (#8B6D8B), accent violet-500/600, bg zinc-950
- Badge colors: chat=violet, processor=teal, hybrid=amber
- Streaming: text/event-stream, X-Accel-Buffering: no, runtime: 'nodejs'
- withRetry on all external calls (LiteLLM, Ollama, Qdrant)
- Canvas nodes: min-width 200px, max-width 300px

### Files NOT to touch
- src/lib/services/execute-catbrain.ts — only import, don't modify
- src/app/api/catbrains/ — only read for pattern reference
- scripts/host-agent.mjs — don't touch
- docker-compose.yml — don't touch
- src/components/catbot/catbot-panel.tsx — only add tools, don't restructure

---
*Roadmap created: 2026-03-15*
*Milestone: v10.0 — CatPaw: Unificacion de Agentes*
