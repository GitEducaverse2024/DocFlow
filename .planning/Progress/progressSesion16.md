# Sesion 16 — v9.0 CatBrains: Renombrado + Conectores + Integracion

**Fecha:** 2026-03-14
**Milestone:** v9.0 CatBrains — Renombrar y ampliar Projects a unidades de conocimiento inteligente
**Estado:** COMPLETADO

---

## Resumen

Esta sesion implementa el milestone completo v9.0 en 3 fases (39, 40, 41) con 9 planes y 23 requisitos. El concepto "Proyecto" desaparece completamente de la aplicacion — reemplazado por **CatBrain**, una unidad de conocimiento inteligente con personalidad propia (system prompt), conectores dedicados, y un contrato estandarizado de entrada/salida que Canvas y Tareas consumen como componente ejecutable.

---

## Phase 39: Renombrado y Migracion (REN-01..07)

### Que hace
Elimina por completo el concepto "Proyecto" de la aplicacion. La tabla `projects` se migra a `catbrains`, todas las rutas API se renombran, la UI muestra "CatBrains" en todos los textos, y las referencias internas (Canvas, Tareas, CatBot, MCP) se actualizan.

### Migracion de base de datos
- `CREATE TABLE catbrains AS SELECT * FROM projects` → `DROP TABLE projects`
- Nuevas columnas: `system_prompt TEXT`, `mcp_enabled INTEGER DEFAULT 1`, `icon_color TEXT DEFAULT 'violet'`
- FK column names (`project_id`) preservados en `sources`/`processing_runs` para backward compat

### Rutas API
- **Nuevas:** `/api/catbrains/...` (20 archivos) — CRUD completo + sub-rutas (rag, process, sources, stats, bot, chat)
- **Redirects 301:** `/api/projects/...` (20 archivos) redirigen a las nuevas rutas para backward compat

### UI
- Sidebar: icono Brain + "CatBrains" reemplaza "Proyectos"
- Paginas: `/catbrains`, `/catbrains/new`, `/catbrains/[id]` con icono `ico_catbrain.png`
- Redirects: `/projects/*` redirige a `/catbrains/*`
- Todos los textos visibles cambiados: "Proyecto" → "CatBrain"

### Canvas y Tareas
- Nodo `PROJECT` renombrado a `CATBRAIN` con icono `ico_catbrain.png`
- Badge de estado RAG (verde=listo, amarillo+pulso=procesando, gris=sin datos)
- Badge "0 conectores" placeholder (datos reales en Phase 40)
- Paso `PROJECT` en Tareas renombrado a `CATBRAIN`
- Registro dual de tipos (`catbrain` + `project`) en canvas-executor para backward compat con flow_data existente

### Archivos clave
| Archivo | Cambio |
|---------|--------|
| `src/lib/db.ts` | Migracion projects → catbrains + columnas nuevas |
| `src/lib/types.ts` | Interface Project actualizada con system_prompt, mcp_enabled, icon_color |
| `src/app/api/catbrains/` | 20 archivos de rutas API nuevas |
| `src/app/api/projects/` | 20 archivos convertidos a redirect 301 |
| `src/app/catbrains/` | 4 paginas nuevas (listado, nuevo, detalle, error) |
| `src/components/canvas/nodes/catbrain-node.tsx` | Nodo Canvas con icono y badges |
| `src/lib/services/canvas-executor.ts` | Tipo catbrain + project dual |
| `src/lib/services/task-executor.ts` | Paso CATBRAIN |
| `src/lib/services/catbot-tools.ts` | Tools renombradas: list_catbrains, create_catbrain |

---

## Phase 40: Conectores Propios (CONN-01..06)

### Que hace
Cada CatBrain puede tener sus propios conectores (HTTP, webhook, MCP, custom) configurados, probados y ejecutables individualmente. Incluye la capacidad de conectar un CatBrain a otro via MCP, formando una red de CatBrains.

### Modelo de datos
- Nueva tabla `catbrain_connectors` con FK a `catbrains.id` + ON DELETE CASCADE
- Columnas: id, catbrain_id, name, type, config (JSON), description, is_active, test_status, last_tested, created_at, updated_at
- Interface TypeScript `CatBrainConnector` exportada desde `types.ts`

### API REST
- `GET /api/catbrains/[id]/connectors` — Lista de conectores del CatBrain
- `POST /api/catbrains/[id]/connectors` — Crear conector
- `GET /api/catbrains/[id]/connectors/[connId]` — Detalle
- `PATCH /api/catbrains/[id]/connectors/[connId]` — Actualizar
- `DELETE /api/catbrains/[id]/connectors/[connId]` — Eliminar
- `POST /api/catbrains/[id]/connectors/[connId]/test` — Probar conector

### Panel UI "Conectores"
- Componente `ConnectorsPanel` (660 lineas) integrado como pestana en el detalle del CatBrain
- Lista de conectores con badges de estado (ok/error/sin probar)
- Sheets para crear y editar conectores
- Boton "Probar" con resultado en tiempo real
- Toggle `is_active` por conector
- Hint para conectar a otro CatBrain via MCP: `http://{host}:3500/api/mcp/{catbrain-id}`

### Motor de ejecucion
- `catbrain-connector-executor.ts` (231 lineas) — Ejecutor compartido
- Ejecucion paralela de conectores activos con timeout de 15s
- 4 tipos soportados: `http` (REST), `webhook` (fire-and-forget), `mcp_server` (JSON-RPC 2.0), `custom`
- MCP: envia `tools/call` → `search_knowledge` para consultar el RAG de otro CatBrain
- Integrado en `canvas-executor.ts` y `task-executor.ts`

### Archivos clave
| Archivo | Cambio |
|---------|--------|
| `src/lib/db.ts` | DDL tabla catbrain_connectors |
| `src/lib/types.ts` | Interface CatBrainConnector |
| `src/app/api/catbrains/[id]/connectors/route.ts` | GET lista + POST crear |
| `src/app/api/catbrains/[id]/connectors/[connId]/route.ts` | GET + PATCH + DELETE |
| `src/app/api/catbrains/[id]/connectors/[connId]/test/route.ts` | POST test |
| `src/components/catbrains/connectors-panel.tsx` | Panel UI completo (660 lineas) |
| `src/lib/services/catbrain-connector-executor.ts` | Motor de ejecucion (231 lineas) |

---

## Phase 41: System Prompt + Configuracion + Integracion (CFG-01..05, INT-01..05)

### Que hace
Cada CatBrain tiene personalidad propia (system prompt + modelo LLM) y un contrato de entrada/salida estandarizado (`CatBrainInput`/`CatBrainOutput`) que Canvas y Tareas usan para ejecutarlo como unidad inteligente via `executeCatBrain()`.

### Contrato de E/S
- `CatBrainInput`: query, context?, mode? (rag/connector/both)
- `CatBrainOutput`: answer, sources?, connector_data?, catbrain_id, catbrain_name
- Definidos en `src/lib/types/catbrain.ts`

### Funcion executeCatBrain()
- Archivo: `src/lib/services/execute-catbrain.ts` (183 lineas)
- Orquesta: RAG (Qdrant + Ollama) + Conectores + LLM (LiteLLM) con system prompt
- Lee system_prompt del CatBrain desde la DB e inyecta como system message
- Respeta el modo configurado (solo RAG, solo conectores, ambos)
- Usado por: chat route, canvas executor, task executor

### System Prompt
- Campo `system_prompt` ya existia en tabla `catbrains` (Phase 39)
- Ahora inyectado en TODA interaccion LLM del CatBrain:
  - Chat directo (streaming y no-streaming)
  - Ejecucion desde Canvas
  - Ejecucion desde Tareas

### Pestana "Configuracion"
- Componente `ConfigPanel` (225 lineas) con 6 secciones:
  1. **Info basica** — Nombre y descripcion editables
  2. **System Prompt** — Textarea expandible (min 120px, resize-y)
  3. **Modelo LLM** — Selector dinamico que carga de `/api/models`
  4. **MCP Endpoint** — Toggle activo/inactivo con URL copiable al clipboard
  5. **Guardar** — Boton que hace PATCH a `/api/catbrains/[id]`
  6. **Zona peligrosa** — Boton eliminar CatBrain con confirmacion

### Integracion Canvas
- Nodo CATBRAIN ejecuta via `executeCatBrain()` en vez de logica inline
- Selector de modo en config del nodo: Solo RAG / Solo Conectores / RAG + Conectores
- Selector de `input_mode` para aristas entre nodos CATBRAIN:
  - **Mode A (Independiente):** Cada CatBrain hace consulta RAG independiente
  - **Mode B (Pipeline):** Contexto del CatBrain anterior pasa como `context` al siguiente

### Integracion Tareas
- Task executor reemplaza logica inline RAG+conectores por llamadas a `executeCatBrain()`
- Cada CatBrain vinculado se ejecuta con su system prompt y conectores propios
- Resultados se inyectan como contexto para el agente LLM

### Archivos clave
| Archivo | Cambio |
|---------|--------|
| `src/lib/types/catbrain.ts` | CatBrainInput/CatBrainOutput interfaces |
| `src/lib/services/execute-catbrain.ts` | Funcion de orquestacion (183 lineas) |
| `src/app/api/catbrains/[id]/chat/route.ts` | System prompt injection + executeCatBrain |
| `src/components/catbrains/config-panel.tsx` | Panel de configuracion (225 lineas) |
| `src/app/catbrains/[id]/page.tsx` | 7 pestanas: Fuentes, Procesado, RAG, Conectores, Chat, Configuracion, Canvas |
| `src/components/canvas/node-config-panel.tsx` | Selectores de modo y input_mode |
| `src/lib/services/canvas-executor.ts` | executeCatBrain() + edge modes |
| `src/lib/services/task-executor.ts` | executeCatBrain() por cada CatBrain vinculado |

---

## Que reemplaza a "Proyectos"

| Antes (Proyecto) | Ahora (CatBrain) |
|-------------------|------------------|
| Tabla `projects` | Tabla `catbrains` (migrada automaticamente) |
| `/api/projects/...` | `/api/catbrains/...` (301 redirect desde las antiguas) |
| Pagina `/projects` | Pagina `/catbrains` |
| Sidebar "Proyectos" | Sidebar "CatBrains" con icono Brain |
| Icono FolderKanban | Icono `ico_catbrain.png` personalizado |
| Nodo Canvas `PROJECT` | Nodo Canvas `CATBRAIN` con badges RAG + conectores |
| Paso Tarea `PROJECT` | Paso Tarea `CATBRAIN` |
| Sin system prompt | System prompt configurable por CatBrain |
| Sin conectores propios | Conectores propios (HTTP, webhook, MCP, custom) |
| Sin contrato E/S | `CatBrainInput`/`CatBrainOutput` estandarizado |
| Logica inline en executors | `executeCatBrain()` como funcion central |
| Sin red de conocimiento | CatBrain-to-CatBrain via MCP (red de CatBrains) |

---

## Metricas del Milestone

| Fase | Planes | Commits | Requisitos | Duracion |
|------|--------|---------|------------|----------|
| 39. Renombrado y Migracion | 3 | 12 | 7 (REN-01..07) | ~33 min |
| 40. Conectores Propios | 3 | 9 | 6 (CONN-01..06) | ~12 min |
| 41. System Prompt + Config + Integracion | 3 | 9 | 10 (CFG-01..05, INT-01..05) | ~15 min |
| **Total** | **9** | **30** | **23/23** | **~60 min** |

---

## Decisiones tecnicas

| Decision | Razon |
|----------|-------|
| Migracion CREATE AS SELECT + DROP | SQLite no soporta RENAME TABLE confiablemente en todas las versiones |
| Redirects 301 desde rutas antiguas | Backward compat para bookmarks, MCP URLs, integraciones externas |
| Registro dual de tipos en Canvas | flow_data existente en DB puede tener type: "project" |
| Conectores propios (no globales) | Cada CatBrain tiene su contexto; conectores globales ya existen en v3.0 |
| executeCatBrain() centralizado | Un unico punto de orquestacion para chat, Canvas y Tareas |
| Edge modes en nodo (no en arista) | Evita UI compleja de seleccion en aristas; campo `input_mode` en datos del nodo |
| MCP via JSON-RPC 2.0 | Protocolo estandar para interoperabilidad entre CatBrains |
| Timeout 15s para conectores | Balance entre espera razonable y no bloquear ejecucion |

---

## Estado Final de Milestones

| Milestone | Estado | Requisitos |
|-----------|--------|------------|
| v1.0 | COMPLETE | 14/14 |
| v2.0 | COMPLETE | 48/48 |
| v3.0 | COMPLETE | 48/48 |
| v4.0 | COMPLETE | 52/52 |
| v5.0 | COMPLETE | 52/52 |
| v6.0 | PARTIAL (Phase 27 only, 28-31 superseded by v7.0) | 8/58 |
| v7.0 | COMPLETE | 53/53 |
| v8.0 | COMPLETE | 15/15 |
| **v9.0** | **COMPLETE** | **23/23** |

**Total implementado:** 313 requisitos completados across 9 milestones.

---

## Problemas detectados post-migracion (resueltos en Sesion 17)

> Ver `progressSesion17.md` para detalles completos de las correcciones.

- **FK rotas:** Las tablas `sources` y `processing_runs` conservaban FK a `projects(id)` que ya no existia → error 500 al subir archivos
- **SSE token mismatch:** 3 rutas enviaban `{ content: token }` pero el cliente esperaba `{ token: token }` → chat y streaming no mostraban contenido
- **Controller cerrado:** `createSSEStream` no protegia contra escritura a controller cerrado → crash en documentos grandes
- **Sin modo pass-through:** Procesar sin instrucciones forzaba llamada LLM innecesaria con truncamiento
