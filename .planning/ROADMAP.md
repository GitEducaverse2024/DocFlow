# Roadmap: DoCatFlow v9.0 — CatBrains

**Milestone:** v9.0
**Phases:** 3 (phases 39-41, continuing from v8.0)
**Requirements:** 23 total
**Coverage:** 23/23
**Started:** 2026-03-14

---

## Phases

- [x] **Phase 39: Renombrado y Migracion** - Migrar tabla projects a catbrains, renombrar rutas API/UI/Canvas/Tareas, icono propio
- [ ] **Phase 40: Conectores Propios** - Tabla catbrain_connectors, CRUD API, panel UI, test, red de CatBrains via MCP
- [ ] **Phase 41: System Prompt + Configuracion + Integracion** - System prompt inyectable, pestana configuracion, contrato CatBrainInput/Output, executeCatBrain, integracion Canvas y Tareas

---

## Phase Details

### Phase 39: Renombrado y Migracion
**Goal**: El concepto "Proyectos" desaparece completamente de la aplicacion — el usuario solo ve y usa "CatBrains" en toda la interfaz, rutas, y logica interna
**Depends on**: Nothing (pure refactor, no new features)
**Requirements**: REN-01, REN-02, REN-03, REN-04, REN-05, REN-06, REN-07
**Success Criteria** (what must be TRUE when phase completes):
  1. Al arrancar la aplicacion, la tabla `catbrains` existe con todas las columnas nuevas (system_prompt, mcp_enabled, icon_color) y los datos migrados desde `projects` — la tabla `projects` ya no existe
  2. Todas las rutas API responden en `/api/catbrains/...` y las rutas antiguas `/api/projects/...` devuelven 301 redirect a las nuevas
  3. La sidebar, listados, detalle, breadcrumbs y todos los textos visibles muestran "CatBrains" en lugar de "Proyectos" — incluido el icono `ico_catbrain.png` en cards y header
  4. En Canvas, el nodo tipo PROJECT se ha renombrado a CATBRAIN con icono actualizado y badges (RAG status, conectores count); en Tareas, el paso PROJECT se ha renombrado a CATBRAIN
  5. Las referencias internas (MCP endpoint, task executor, canvas executor, CatBot tools) usan `catbrains` en vez de `projects`
**Plans**: 3 plans
Plans:
- [x] 39-01-PLAN.md — DB migration projects->catbrains + API routes /api/catbrains + 301 redirects
- [x] 39-02-PLAN.md — UI rename: sidebar, pages, breadcrumbs, components, ico_catbrain.png
- [x] 39-03-PLAN.md — Canvas node PROJECT->CATBRAIN, Task step rename, internal references

### Phase 40: Conectores Propios
**Goal**: Cada CatBrain puede tener sus propios conectores (HTTP, webhook, MCP) configurados, probados y ejecutables — incluida la capacidad de conectar un CatBrain a otro via MCP
**Depends on**: Phase 39 (tabla catbrains debe existir con nuevas columnas)
**Requirements**: CONN-01, CONN-02, CONN-03, CONN-04, CONN-05, CONN-06
**Success Criteria** (what must be TRUE when phase completes):
  1. La tabla `catbrain_connectors` existe con FK a catbrains y ON DELETE CASCADE — crear/editar/eliminar conectores funciona via API REST en `/api/catbrains/[id]/connectors`
  2. En el detalle de un CatBrain, una pestana "Conectores" muestra la lista de conectores con badges de estado (ok/error/sin probar), y permite crear, editar, eliminar y probar cada conector
  3. El boton "Probar" envia un request de test al conector y muestra el resultado (exito/error con mensaje) en tiempo real
  4. Al configurar un conector tipo `mcp_server` apuntando a `/api/mcp/{otro-catbrain-id}`, el CatBrain puede consultar el RAG de otro CatBrain — formando una red de CatBrains
  5. Los conectores activos se invocan automaticamente segun el modo configurado (connector/both) y cada conector individual es desactivable via toggle `is_active`
**Plans**: TBD

### Phase 41: System Prompt + Configuracion + Integracion
**Goal**: Cada CatBrain tiene personalidad propia (system prompt + modelo LLM) y un contrato de entrada/salida estandarizado que Canvas y Tareas usan para ejecutarlo como unidad inteligente
**Depends on**: Phase 40 (conectores deben existir para que executeCatBrain pueda orquestar RAG + conectores + LLM)
**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04, CFG-05, INT-01, INT-02, INT-03, INT-04, INT-05
**Success Criteria** (what must be TRUE when phase completes):
  1. En la pestana "Configuracion" del detalle del CatBrain, el usuario puede editar nombre, descripcion, modelo LLM (selector dinamico desde /api/models), system prompt (textarea expandible), toggle MCP con URL copiable, y boton eliminar
  2. Al chatear con un CatBrain, el system prompt configurado se inyecta automaticamente en cada interaccion LLM — el mismo system prompt se aplica cuando el CatBrain se ejecuta desde Canvas o desde Tareas
  3. El nodo CATBRAIN en Canvas expone un selector de modo (Solo RAG / Solo Conectores / RAG + Conectores) y ejecuta via `executeCatBrain()` respetando system prompt y conectores
  4. El paso CATBRAIN en Tareas ejecuta via `executeCatBrain()` con el modo configurado en el wizard, respetando system prompt y conectores
  5. Las aristas entre nodos CATBRAIN en Canvas permiten elegir Modo A (consulta RAG independiente) o Modo B (pipeline secuencial con context passing)
**Plans**: TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 39. Renombrado y Migracion | 3/3 | Complete | 2026-03-14 |
| 40. Conectores Propios | 0/? | Not started | - |
| 41. System Prompt + Configuracion + Integracion | 0/? | Not started | - |

---

## Dependency Chain

```
Phase 39 (Renombrado y Migracion)
  |-> Phase 40 (Conectores Propios)
        |-> Phase 41 (System Prompt + Configuracion + Integracion)
```

Build order: 39 -> 40 -> 41
- Phase 39 first (renaming is foundation — catbrains table must exist)
- Phase 40 second (connectors need catbrains table, and Phase 41 needs connectors for executeCatBrain)
- Phase 41 last (system prompt + integration orchestrates everything built in 39-40)

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| REN-01 | 39 |
| REN-02 | 39 |
| REN-03 | 39 |
| REN-04 | 39 |
| REN-05 | 39 |
| REN-06 | 39 |
| REN-07 | 39 |
| CONN-01 | 40 |
| CONN-02 | 40 |
| CONN-03 | 40 |
| CONN-04 | 40 |
| CONN-05 | 40 |
| CONN-06 | 40 |
| CFG-01 | 41 |
| CFG-02 | 41 |
| CFG-03 | 41 |
| CFG-04 | 41 |
| CFG-05 | 41 |
| INT-01 | 41 |
| INT-02 | 41 |
| INT-03 | 41 |
| INT-04 | 41 |
| INT-05 | 41 |

**Mapped: 23/23 -- 100% coverage**

---

## Technical Notes (for plan-phase)

### Key patterns
- Migration: CREATE TABLE catbrains AS SELECT ... FROM projects + DROP TABLE projects + ALTER TABLE for new columns
- DB pattern: CREATE TABLE IF NOT EXISTS + ALTER TABLE try-catch (existing project pattern)
- API aliases: old `/api/projects/...` routes return 301 redirect to `/api/catbrains/...`
- catbrain_connectors: separate table with FK, reuses connector patterns from v3.0 (types, test, logs)
- executeCatBrain: shared function that orchestrates RAG + connectors + LLM with system prompt injection
- CatBrainInput/CatBrainOutput: TypeScript interfaces in shared file (e.g., lib/types/catbrain.ts)
- Canvas node rename: update node type registry, palette, executor — preserve existing node data
- Task step rename: update step types in task-engine.ts, wizard UI, step display

### Critical constraints
- All env vars: `process['env']['VARIABLE']` bracket notation
- All UI text in Spanish
- All API routes: `export const dynamic = 'force-dynamic'`
- crypto.randomUUID NOT available — use generateId()
- Colors: Primary mauve (#8B6D8B), accent violet-500/600, bg zinc-950
- MCP: Streamable HTTP protocol, one endpoint per CatBrain
- Canvas nodes: min-width 200px, max-width 300px
- ico_catbrain.png must be created/placed in app/images/

---
*Roadmap created: 2026-03-14*
*Milestone: v9.0 — CatBrains*
