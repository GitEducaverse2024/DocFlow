---
id: rule-r32-canvas-fan-out-desde-start
type: rule
subtype: architecture
lang: es
title: "R32 — Canvas fan-out desde START: N edges directos, no inventar bifurcadores"
summary: "START acepta N edges de salida hacia ramas paralelas. Crear un nodo intermedio solo para bifurcar es antipatron; usar type='project' sin catbrainId como splitter esta prohibido."
tags: [critical, architecture, canvas, topology]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-23T16:00:00Z
created_by: v30.6-p2
version: 1.0.0
updated_at: 2026-04-23T16:00:00Z
updated_by: v30.6-p2
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-23, author: v30.6-p2, change: "Created after v30.5 empirical test — CatBot invento nodo project-sin-catbrainId para evitar un falso limite 'START 1 salida' en canvas_add_edge" }
ttl: never
---

# R32 — Canvas fan-out desde START: N edges directos

## Regla

El nodo `start` de un canvas DocFlow **acepta cualquier numero de edges de salida** (fan-out
directo a ramas paralelas). El runtime `canvas-executor.ts` case `'start'` simplemente emite
su output a todos sus sucesores via `edges.filter(e => e.source === startId)`, sin limite.

No hay que insertar un nodo intermedio solo para bifurcar. Cuando el canvas tiene N ramas
paralelas que dependen del disparo del canvas (no de calculos previos), cablear N edges
directos desde `start` a cada rama es la topologia canonica.

## Antipatrones explicitos (PROHIBIDOS)

### 1. Nodo `project` sin `catbrainId` como "Lanzador"

```
START → [nodo type='project', sin catbrainId, label='Lanzador'] → rama1
                                                                 → rama2
```

El case `'project'` del executor (backward-compat legacy) cae en:

```ts
const catbrainId = data.catbrainId || data.projectId;
if (!catbrainId) return { output: predecessorOutput };  // passthrough silencioso
```

Es un fallback **no documentado** que podria desaparecer sin aviso. El nodo aparece en UI
como un CatBrain no configurado (error visual). Otros LLMs que tomen el canvas como
referencia copiaran el hack. **Prohibido.**

### 2. Nodo `agent` processor como passthrough

```
START → [agent processor, instructions='Pasa el input sin cambios'] → rama1
                                                                     → rama2
```

Desperdicia una llamada LLM (coste + latencia) para no hacer nada. Si realmente necesitas
que un LLM evalue el input antes de bifurcar, usa `condition` (rama yes/no) o un agente
que aporte valor; nunca un LLM passthrough.

### 3. Cadena secuencial disfrazada

```
START → rama1_nodo1 → rama1_nodoN → rama2_nodo1 → rama2_nodoN → merge
```

Si las ramas son independientes, serializar es tambien antipatron: rompe paralelismo y
complica la logica de merge. Cablea desde START a la cabeza de cada rama.

## Patron correcto

```
START ─┬─► Rama1_Nodo1 ─► ... ─┐
       ├─► Rama2_Nodo1 ─► ... ─┼─► Merge ─► ...
       └─► RamaN_Nodo1 ─► ... ─┘
```

Desde `canvas_add_edge`:

```js
canvas_add_edge({ canvasId, sourceNodeId: 'start-id', targetNodeId: 'rama1-head' })
canvas_add_edge({ canvasId, sourceNodeId: 'start-id', targetNodeId: 'rama2-head' })
// N veces, una por rama
```

Todos retornan `{ edgeId, total_edges: N }` sin error.

## Por que

Historicamente (Phase 138, 2026-04-17) la tool `canvas_add_edge` incluia una validacion
artificial "START max 1 edge de salida" sin base runtime — el executor nunca tuvo esa
restriccion. La regla se eliminoo en v30.6 tras observar empiricamente que forzaba a CatBot
a inventar workarounds invalidos (ver "Referencia historica"). El runtime siempre fue
agnostico: un solo handle `source` de React Flow acepta N conexiones y el executor las
itera todas.

## Relacionado

- R26 — canvas-executor inmutable (el runtime siempre soporto fan-out; no tocarlo).
- R03 — no hardcodear logica LLM donde un connector deterministico basta (complementaria:
  si las ramas son webhooks paralelos, son conectores, no agents).
- R05 — datasets comparables en branches paralelos, no iterator mezclado.
- `.docflow-kb/domain/concepts/canvas.md` — concepto canvas actualizado tras v30.6.

## Referencia historica

- Sesion 37 del proyecto DocFlow (v30.6 CatDev Protocol).
- Canvas `005fa45e-774d-46b7-8fe1-146856a99a3b` (Comparativa facturacion cuatrimestre) fue
  contaminado por el antipatron en v30.5 y saneado en v30.6 P3.
- Phase 138-01 (commit b245dd6): origen de la regla artificial.
- v30.6 P1: eliminacion de la regla en `catbot-tools.ts:3075-3081` + inversion del test
  `canvas-tools-fixes.test.ts` CANVAS-02b (ahora verifica fan-out legal).
