# DoCatFlow - Sesion 10: Motor de Ejecucion Visual del Canvas (Phase 25)

> Funcionalidades implementadas sobre la base documentada en `progressSesion9.md`. Esta sesion completa la Phase 25 del milestone v5.0: motor de ejecucion DAG, estados visuales en tiempo real, dialog de checkpoints interactivos, y panel de resultados.

---

## Indice

1. [Resumen de cambios](#1-resumen-de-cambios)
2. [Plan 25-01: Motor de Ejecucion Backend](#2-plan-25-01-motor-de-ejecucion-backend)
3. [Plan 25-02: Estados Visuales en Tiempo Real](#3-plan-25-02-estados-visuales-en-tiempo-real)
4. [Plan 25-03: Checkpoint Dialog + Panel de Resultados](#4-plan-25-03-checkpoint-dialog--panel-de-resultados)
5. [Flujo completo de ejecucion](#5-flujo-completo-de-ejecucion)
6. [Errores encontrados y corregidos](#6-errores-encontrados-y-corregidos)
7. [Archivos nuevos y modificados](#7-archivos-nuevos-y-modificados)
8. [Mejoras adicionales](#8-mejoras-adicionales)

---

## 1. Resumen de cambios

### Phase 25: Motor de Ejecucion Visual — 3 plans, 13 requisitos

| Plan | Que se construyo | Requisitos |
|------|-----------------|------------|
| 25-01 | canvas-executor.ts (DAG topological sort, dispatch por tipo, checkpoint, cancel) + 5 API routes + usage logging | EXEC-01, 02, 03, 07, 08, 10, 13 |
| 25-02 | Polling 2s, inyeccion de estado en nodos, colores por estado, edges animados, toolbar progress, modo read-only | EXEC-04, 05, 06, 12 |
| 25-03 | Dialog de checkpoint (aprobar/rechazar con feedback) + panel de resultado expandible (output, stats, acciones) | EXEC-09, 11 |
| **Total** | | **13/13 EXEC requirements** |

### Transformacion principal

El canvas pasa de ser un editor estatico a un pipeline ejecutable: el usuario pulsa "Ejecutar", observa en tiempo real como cada nodo cambia de color, puede aprobar/rechazar checkpoints interactivos, y al final ve el resultado completo con estadisticas de uso.

---

## 2. Plan 25-01: Motor de Ejecucion Backend

### canvas-executor.ts (`app/src/lib/services/canvas-executor.ts`, ~580 lineas)

Motor DAG completo para ejecucion de canvas workflows.

#### Funciones exportadas

| Funcion | Proposito |
|---------|-----------|
| `topologicalSort(nodes, edges)` | Algoritmo de Kahn — ordena nodos para ejecucion secuencial respetando dependencias |
| `executeCanvas(canvasId, runId)` | Loop principal — itera orden topologico, despacha por tipo, maneja checkpoints y cancelacion |
| `cancelExecution(runId)` | Flag in-memory + update inmediato en DB a 'cancelled' |
| `resumeAfterCheckpoint(runId, nodeId, approved, feedback?)` | Aprobar continua; rechazar resetea predecesor con feedback y re-ejecuta |

#### Despacho por tipo de nodo (`dispatchNode`)

| Tipo | Que ejecuta |
|------|-------------|
| START | Passthrough — devuelve el input configurado |
| AGENT | Llama LLM via LiteLLM proxy (con RAG opcional si agente tiene proyecto) |
| PROJECT | Obtiene contexto RAG del proyecto configurado |
| CONNECTOR | HTTP fetch al endpoint del conector |
| CHECKPOINT | Passthrough — el loop principal detecta y pausa en estado 'waiting' |
| MERGE | Concatena outputs de predecessores (o llama LLM si agente configurado) |
| CONDITION | LLM evalua condicion como "yes"/"no" → determina rama |
| OUTPUT | Passthrough con formato opcional (markdown/json/text) |

#### Logica de CONDITION y skip

Cuando un nodo CONDITION evalua, la rama no elegida se marca como 'skipped'. Sin embargo, nodos alcanzables por multiples caminos (upstream de un MERGE) NO se skipean — solo se skipean si TODOS sus caminos entrantes pasan por la rama no elegida.

#### Checkpoint flow

1. Executor llega a nodo CHECKPOINT → marca como 'waiting' en DB → pausa el loop
2. Cliente detecta 'waiting' via polling → muestra dialog
3. Usuario aprueba → POST `/approve` → `resumeAfterCheckpoint` marca 'completed' y retoma ejecucion
4. Usuario rechaza con feedback → POST `/reject` → resetea predecesor a 'pending' con feedback, re-ejecuta desde ahi

#### Cancel flow

1. `cancelExecution(runId)`: pone flag en `runningExecutors` Map (in-memory)
2. Loop principal chequea flag antes de cada nodo → si cancelado, marca nodos restantes como 'pending', status 'cancelled'

#### Usage logging

Cada nodo que llama al LLM (AGENT, MERGE con agente, CONDITION) logea via `logUsage()` con `event_type: 'canvas_execution'` y metadata `{ canvas_id, run_id, node_id, node_type }`.

### 5 API Routes

| Ruta | Metodo | Que hace |
|------|--------|---------|
| `/api/canvas/[id]/execute` | POST | Crea `canvas_run` en DB, lanza `executeCanvas` fire-and-forget, devuelve `{ runId, status }` |
| `/api/canvas/[id]/run/[runId]/status` | GET | Devuelve `node_states` JSON, elapsed time, total_tokens, progress (completados/total) |
| `/api/canvas/[id]/run/[runId]/checkpoint/[nodeId]/approve` | POST | Llama `resumeAfterCheckpoint(runId, nodeId, true)` |
| `/api/canvas/[id]/run/[runId]/checkpoint/[nodeId]/reject` | POST | Llama `resumeAfterCheckpoint(runId, nodeId, false, feedback)` |
| `/api/canvas/[id]/run/[runId]/cancel` | POST | Llama `cancelExecution(runId)` |

Todas las rutas: `export const dynamic = 'force-dynamic'` + `process['env']` bracket notation.

### Modificaciones a archivos existentes

- **`usage-tracker.ts`**: Agregado `'canvas_execution'` al union type de `event_type`
- **`db.ts`**: Startup cleanup ahora resetea canvas_runs con status 'running' O 'waiting' a 'failed' (recuperacion de ejecuciones interrumpidas por crash/restart)

---

## 3. Plan 25-02: Estados Visuales en Tiempo Real

### Polling loop (`canvas-editor.tsx`)

- **Frecuencia**: cada 2 segundos
- **Patron**: `schedulePoll` → `setTimeout(2000)` → `pollStatus` → recurre si no es estado terminal
- **Endpoint**: GET `/api/canvas/{id}/run/{runId}/status`
- **Inyeccion**: respuesta `node_states` se inyecta en cada nodo React Flow via `setNodes`, poniendo `executionStatus` y `executionOutput` en `node.data`

### Colores de estado por nodo

5 estados visuales aplicados a los 8 tipos de nodo:

| Estado | Border | Shadow | Icono | Animacion |
|--------|--------|--------|-------|-----------|
| `running` | `border-violet-500` | `shadow-violet-500/30` | `Loader2` (spinning) | `animate-pulse` |
| `completed` | `border-emerald-500` | `shadow-emerald-500/30` | `Check` | — |
| `failed` | `border-red-500` | `shadow-red-500/30` | `X` | — |
| `waiting` | `border-amber-500` | `shadow-amber-500/30` | `Clock` | `animate-pulse` |
| `skipped` | `border-zinc-600 opacity-50` | — | — | — |

Icono de estado renderizado en posicion absoluta `-top-1 -right-1` como badge circular.

Comportamientos especificos por nodo:
- **checkpoint-node**: muestra "Esperando aprobacion..." cuando `isWaiting`
- **merge-node**: botones +/- deshabilitados durante ejecucion (`!!execStatus`)
- **output-node**: badge "Ver resultado" cuando `isCompleted`

### Edges animados

`applyEdgeAnimation` — funcion pura a nivel de modulo (no closure sobre estado del componente):
- Edges cuyo nodo source esta `running` o `completed`: stroke violet-500, animated true, strokeWidth 3
- Otros edges: estilo por defecto

### Toolbar durante ejecucion

| Seccion | Normal | Ejecutando |
|---------|--------|-----------|
| Centro | Undo/Redo + save status | "Ejecutando paso X/Y · Ns" con punto violet pulsante |
| Derecha | "Auto-organizar" + "Ejecutar" (violet) | "Cancelar" (rojo, icono Square) |

### Modo read-only

Durante ejecucion, React Flow se configura:
```typescript
nodesDraggable={!isExecuting}
nodesConnectable={!isExecuting}
elementsSelectable={!isExecuting}
deleteKeyCode={isExecuting ? null : ['Backspace', 'Delete']}
```
Ademas, `NodePalette` se oculta con render condicional (no trick de opacidad).

---

## 4. Plan 25-03: Checkpoint Dialog + Panel de Resultados

### Checkpoint Dialog (EXEC-09)

Integrado directamente en `canvas-editor.tsx` usando shadcn Dialog:

- **Trigger**: `pollStatus` detecta nodo con status `'waiting'` → pausa polling → abre dialog
- **Contenido**: output del nodo predecesor renderizado como Markdown
- **No dismissable**: Escape y click-outside bloqueados — el usuario DEBE aprobar o rechazar
- **Boton "Aprobar"**: POST `.../approve` → cierra dialog → reanuda polling
- **Boton "Rechazar"**: requiere feedback no vacio en textarea (toast error si vacio) → POST `.../reject` con feedback → cierra dialog → reanuda polling

### Execution Result Panel (`app/src/components/canvas/execution-result.tsx`)

Panel colapsable que aparece debajo del canvas al completar la ejecucion (status completed/failed/cancelled):

#### Layout
- **70% izquierda**: Output final del nodo OUTPUT, renderizado como Markdown, scrollable
- **30% derecha**: Card de estadisticas + botones de accion

#### Estadisticas mostradas

| Stat | Fuente |
|------|--------|
| Duracion | `executionStats.elapsed` segundos |
| Tokens | `executionStats.totalTokens` |
| Costo estimado | `executionStats.estimatedCost` USD |
| Nodos ejecutados | Conteo de nodos con status != 'pending' |

#### Botones de accion

| Boton | Icono | Que hace |
|-------|-------|---------|
| Copiar | Copy | Copia output al clipboard (toast confirmacion) |
| Descargar .md | Download | Descarga output como archivo Markdown |
| Re-ejecutar | RotateCcw | Inicia nueva ejecucion del mismo canvas |
| Cerrar | X | Cierra el panel de resultados |

#### Header con color por status
- Completado: emerald "Resultado de ejecucion: Completado"
- Fallido: red "Resultado de ejecucion: Fallido"
- Cancelado: amber "Resultado de ejecucion: Cancelado"

#### Integracion en canvas-editor
- `showResult` state controla visibilidad
- `outputContent` se computa buscando el nodo OUTPUT con `executionOutput`
- Reemplaza `NodeConfigPanel` cuando esta visible
- `NodePalette` oculta durante visualizacion de resultados

---

## 5. Flujo completo de ejecucion

### Secuencia end-to-end

```
1. Usuario diseña canvas: START → AGENT → CHECKPOINT → AGENT → OUTPUT
2. Configura cada nodo (modelo LLM, proyecto RAG, condicion, etc.)
3. Pulsa "Ejecutar" en toolbar

4. Frontend: POST /api/canvas/{id}/execute
   → Backend crea canvas_run, lanza executeCanvas() fire-and-forget
   → Frontend recibe {runId}, inicia polling cada 2s

5. Backend ejecuta nodos en orden topologico:
   a. START: passthrough → status 'completed' (verde)
   b. AGENT: llama LLM → status 'running' (violeta) → 'completed' (verde)
   c. CHECKPOINT: status 'waiting' (ambar, "Esperando aprobacion...")
      → Backend pausa

6. Frontend detecta 'waiting' en polling → abre Dialog checkpoint
   - Muestra output del AGENT anterior en Markdown
   - Usuario aprueba → POST .../approve
   - Backend resume: marca checkpoint 'completed', continua

7. Backend continua:
   d. AGENT (2do): llama LLM → 'completed'
   e. OUTPUT: passthrough → 'completed'
   → canvas_run.status = 'completed'

8. Frontend detecta status terminal → para polling
   → Todos los nodos verdes, edges animados se desactivan
   → Panel de resultados aparece: output + stats + botones

9. Usuario puede: copiar, descargar .md, re-ejecutar, o cerrar
```

### Diagrama de estados del canvas_run

```
running ──→ waiting (checkpoint) ──→ running (resume)
   │                                      │
   ├──→ completed (all nodes done)        │
   ├──→ failed (node error)               │
   └──→ cancelled (user cancel)           └──→ completed | failed | cancelled
```

### Diagrama de estados por nodo

```
pending ──→ running ──→ completed
                │
                ├──→ failed
                ├──→ waiting (only CHECKPOINT)
                └──→ skipped (CONDITION branch not taken)
```

---

## 6. Errores encontrados y corregidos

### Error 1: projects API response format (pre-existente Phase 24)
`/api/projects` devuelve `{ data: [...], pagination: {...} }` pero `node-config-panel.tsx` llamaba `.map()` sobre el objeto completo.
**Fix**: `fetch('/api/projects').then(r => r.json()).then(d => setProjects(d.data || []))`.

### Error 2: usage-tracker event_type union
`'canvas_execution'` no estaba en el union type de `UsageEvent`.
**Fix**: Agregado al tipo en `usage-tracker.ts`.

### Error 3: canvas_runs stuck en 'waiting' tras restart
Si el servidor se reinicia con un canvas_run en estado 'waiting' (esperando checkpoint), el run queda atrapado.
**Fix**: `db.ts` startup cleanup ahora resetea AMBOS 'running' y 'waiting' a 'failed'.

---

## 7. Archivos nuevos y modificados

### Archivos nuevos

| Archivo | Lineas | Descripcion |
|---------|--------|-------------|
| `app/src/lib/services/canvas-executor.ts` | ~580 | Motor DAG: topologicalSort, executeCanvas, cancelExecution, resumeAfterCheckpoint, dispatchNode |
| `app/src/app/api/canvas/[id]/execute/route.ts` | ~50 | POST — crea run, lanza ejecucion |
| `app/src/app/api/canvas/[id]/run/[runId]/status/route.ts` | ~40 | GET — node_states, elapsed, progress |
| `app/src/app/api/canvas/[id]/run/[runId]/checkpoint/[nodeId]/approve/route.ts` | ~30 | POST — aprueba checkpoint |
| `app/src/app/api/canvas/[id]/run/[runId]/checkpoint/[nodeId]/reject/route.ts` | ~30 | POST — rechaza checkpoint con feedback |
| `app/src/app/api/canvas/[id]/run/[runId]/cancel/route.ts` | ~25 | POST — cancela ejecucion |
| `app/src/components/canvas/execution-result.tsx` | ~200 | Panel de resultado: output + stats + copy/download/re-run |

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `app/src/lib/services/usage-tracker.ts` | +`'canvas_execution'` en event_type union |
| `app/src/lib/db.ts` | +cleanup de 'waiting' canvas_runs en startup |
| `app/src/components/canvas/canvas-editor.tsx` | +polling loop, +execution state injection, +read-only mode, +checkpoint dialog, +result panel integration |
| `app/src/components/canvas/canvas-toolbar.tsx` | +executionState prop, +progress display, +Ejecutar/Cancelar buttons |
| `app/src/components/canvas/nodes/start-node.tsx` | +5-state execution border + status icon overlay |
| `app/src/components/canvas/nodes/agent-node.tsx` | +5-state execution border + status icon overlay |
| `app/src/components/canvas/nodes/project-node.tsx` | +5-state execution border + status icon overlay |
| `app/src/components/canvas/nodes/connector-node.tsx` | +5-state execution border + status icon overlay |
| `app/src/components/canvas/nodes/checkpoint-node.tsx` | +5-state border + "Esperando aprobacion..." text |
| `app/src/components/canvas/nodes/merge-node.tsx` | +5-state border + botones +/- disabled durante ejecucion |
| `app/src/components/canvas/nodes/condition-node.tsx` | +5-state execution border + status icon overlay |
| `app/src/components/canvas/nodes/output-node.tsx` | +5-state border + "Ver resultado" badge |
| `app/src/components/canvas/node-config-panel.tsx` | Fix: projects API .data extraction |

### Commits

```
28bd978 feat(25-01): create canvas-executor.ts with DAG execution engine
7966781 feat(25-01): create all 5 API routes for canvas execution
98bf10b feat(25-02): add polling, execution state injection, and read-only mode to canvas
786e696 feat(25-02): add execution-aware styling to all 8 node components
d76fcab feat(25-03): add checkpoint dialog to canvas-editor
bbcdc63 feat(25-03): create execution result panel component (EXEC-11)
```

---

## 8. Mejoras adicionales

### Mascota en sidebar

Se agrego la imagen `app/Images/dcf_01.png` (gato con traje) al sidebar, entre la navegacion y el footer de servicios:
- Contenedor `flex-1` que ocupa todo el espacio sobrante
- `object-contain` para escalar sin deformar
- `items-end` para anclar la imagen al fondo
- Responsive: se reduce automaticamente si se agregan mas botones al nav
- Import: `import mascotImg from '@/../Images/dcf_01.png'`

### Requisitos completados (acumulado milestone v5.0)

| Fase | Requisitos | Status |
|------|-----------|--------|
| 23 | DATA-01..12, NAV-01..02, LIST-01..04, WIZ-01..03 (21) | Completo |
| 24 | EDIT-01..11, NODE-01..08 (19) | Completo |
| 25 | EXEC-01..13 (13) | Completo |
| 26 | TMPL-01..03, MODE-01..02 (5) | Pendiente |
| **Total** | **52 requisitos** | **47/52 (90%)** |

### Siguiente paso

Phase 26: Templates + Modos de Canvas — 4 plantillas predefinidas (Propuesta comercial, Doc tecnica, Research+sintesis, Pipeline+conector) y filtrado de paleta segun el modo del canvas (Agentes/Proyectos/Mixto).
