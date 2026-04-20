---
id: concept-canvas-node
type: concept
subtype: canvas-node
lang: es
title: "Canvas Node — concepto base"
summary: "Unidad ejecutable del Canvas DocFlow: nodo tipado (start/agent/catbrain/connector/…) que recibe input del predecesor, aplica su lógica, y emite salida al siguiente en el DAG."
tags: [canvas, catflow]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md (intro + índice + arquitectura de ejecución)" }
ttl: never
---

# Canvas Node — concepto base

Un **Canvas Node** es la unidad ejecutable mínima de un CatFlow (Canvas) en DocFlow. Cada nodo tiene un tipo tipado (`start`, `agent`, `catbrain`, `connector`, `checkpoint`, `merge`, `condition`, `scheduler`, `storage`, `multiagent`, `output`, `iterator`, `iterator_end`) que determina su lógica, sus handles de entrada/salida y su color en el editor visual.

## Anatomía de un nodo

Un nodo canvas se compone de:

- **Tipo (`type`)** — determina comportamiento (ver `domain/taxonomies/node-roles.md`).
- **Configuración (`data`)** — parámetros específicos del tipo: `agentId`, `connectorId`, `instructions`, `condition`, `storage_mode`, etc.
- **Handles** — puntos de entrada (izquierda) y salida (derecha) con IDs que definen qué ramas se conectan en el DAG.
- **Estado de ejecución** — `idle | running | completed | failed | waiting | skipped`.

## Ejecución

El Canvas ejecuta los nodos en **orden topológico** (algoritmo de Kahn) sobre un grafo dirigido acíclico (DAG). Para cada nodo:

1. Se marca como `running`.
2. Se obtiene la salida del nodo predecesor (input).
3. Se ejecuta la lógica del nodo según su tipo.
4. Se marca como `completed` o `failed`.
5. La salida se pasa al siguiente nodo conectado.

## Catálogo (13 nodos activos + 1 deprecado)

| # | Nodo | Tipo | Color | Función principal |
|---|------|------|-------|-------------------|
| 1 | Start | `start` | Esmeralda | Punto de entrada del flujo. Define input inicial y modo escucha |
| 2 | Agent | `agent` | Violeta | Ejecuta un CatPaw o LLM directo con instrucciones |
| 3 | CatBrain | `catbrain` | Violeta | Consulta base de conocimiento RAG o búsqueda web |
| 4 | Connector | `connector` | Naranja | Invoca servicio externo (Gmail, Drive, Holded, HTTP, MCP) |
| 5 | Checkpoint | `checkpoint` | Ámbar | Pausa la ejecución para aprobación humana |
| 6 | Merge | `merge` | Cyan | Combina múltiples entradas en una sola salida |
| 7 | Condition | `condition` | Amarillo | Bifurca el flujo según evaluación LLM (si/no) |
| 8 | Scheduler | `scheduler` | Ámbar | Controla tiempos: delay, conteo de ciclos, escucha |
| 9 | Storage | `storage` | Teal | Guarda contenido en disco local y/o conector externo |
| 10 | MultiAgent | `multiagent` | Púrpura | Lanza otro Canvas (CatFlow) de forma síncrona o asíncrona |
| 11 | Output | `output` | Esmeralda | Nodo terminal: formatea resultado, notifica, encadena otros flujos |
| 12 | Iterator | `iterator` | Rosa | Bucle forEach sobre arrays con límite configurable |
| 13 | Iterator End | `iterator_end` | Rosa | Interruptor que señaliza fin de cada iteración |
| 14 | Project | `project` | Azul | **DEPRECADO** — alias de CatBrain por compatibilidad |

## Referencias

- **Roles funcionales** de los nodos (extractor/transformer/synthesizer/...): `domain/taxonomies/node-roles.md`.
- **Modos del Canvas** (agents/catbrains/mixed): `domain/taxonomies/canvas-modes.md`.
- **Reglas de Oro** que restringen cómo construir flujos (R01..R25): `rules/R01-*.md` .. `rules/R25-*.md`.
- **Protocolo de revisión** de canvas inbound con los 15 errores reales: `protocols/catflow-inbound-review.md`.
- **Restricción absoluta**: `app/src/lib/canvas-executor.ts` NUNCA se modifica. Los cambios de ejecución van en `execute-catpaw.ts` u otros executores.
