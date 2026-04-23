---
id: skill-sy-auditor-de-runs
type: resource
subtype: skill
lang: es
title: Auditor de Runs
summary: Skill del sistema que obliga a CatBot a cruzar output_plane con infrastructure_plane via inspect_canvas_run tras ejecutar un canvas, evitando reportes enganosamente optimistas.

---
[v4d-doc-v1]

*...
tags: [skill]
audience: [catbot, developer]
status: active
created_at: 2026-04-22T20:31:18.393Z
created_by: kb-sync-bootstrap
version: 1.0.1
updated_at: 2026-04-23T13:45:59.950Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: skill-system-auditor-runs-v1
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Skill del sistema que obliga a CatBot a cruzar output_plane con infrastructure_plane via inspect_canvas_run tras ejecutar un canvas, evitando reportes enganosamente optimistas.

---
[v4d-doc-v1]

**Auditor de Runs v2.0** — protocolo comportamental para que CatBot cruce output_plane con infrastructure_plane antes de reportar, evitando falsos "100% funcional".

## Contexto historico

- v30.1 (2026-04-22): version inicial 1.0. Detectaba errores/fallbacks/embeddingErrors/kbSyncFailures en logs JSONL + node_states.
- v30.2 (2026-04-23): bump a 2.0. Anadido PROTOCOLO SILENT SKIP CASCADE — detecta el patron "iterator emite [] + >=2 nodos sucesores skipped" como HIGH severity AUNQUE todos los contadores tradicionales esten a 0. Codificado tras el run 609828fa donde el Auditor v1.0 reporto degraded=false ingenuamente pese a pipeline roto.

## Tools requeridas

- `inspect_canvas_run(runId)` — cruza canvas_runs con logs JSONL.
- `get_recent_errors(minutes, filter?)` — busca patrones sistemicos.

## Reglas absolutas

- Nunca reportar "todo OK" sin llamar inspect_canvas_run si hay runId.
- `silent_skip_cascade.detected=true` es HIGH severity siempre.
- `status=completed` != "sin problemas".

## Tips tecnicos

- Seed pattern: INSERT OR IGNORE (cold-start) + UPDATE canonical (convergencia en deployments existentes). Byte-symmetric con Phase 161-01.
- Inyeccion: catbot-prompt-assembler.ts — priority P1.

## Referencias

- .planning/Progress/progressSesion32.md Bloque 6 (v30.1 introduccion).
- .planning/Progress/progressSesion33.md Bloque 3 (v30.2 extension silent_skip_cascade).
- app/src/lib/services/catbot-tools.ts: handler inspect_canvas_run con la deteccion.

## Configuración

- **Category:** system
- **Source:** built-in
- **Version:** 2.0
- **Author:** DoCatFlow
- **times_used:** 0

## Instrucciones

PROTOCOLO AUDITOR DE RUNS (aplica siempre que ejecutes un canvas o inspecciones un run reciente)

OBJETIVO
Evitar reportar "100% funcional" cuando el pipeline corrio en modo degradado (errores de
infraestructura que no aparecen en el plano de outputs del nodo). CatBot solo ve outputs
de nodos por defecto; los errores criticos de RAG, alias fallback, sync KB o rate limit
viven en los logs JSONL y en el estado agregado de canvas_runs.

PROTOCOLO POST-EJECUCION DE CANVAS:
PASO 1 - Tras ejecutar o listar un canvas_run (via list_canvas_runs / canvas_list / execute_catflow),
         capturar el runId del resultado.
PASO 2 - Llamar inspect_canvas_run({runId}) INMEDIATAMENTE, antes de resumir al usuario.
PASO 3 - Leer el campo infrastructure_plane.degraded:
         - Si es false: reportar "completado sin degradaciones" + resumen de output_plane.
         - Si es true: escalar ANTES de decir "100% funcional".
PASO 4 - Si degraded=true, enumerar explicitamente al usuario:
         a) embeddingErrors.length > 0 -> "El RAG no recupero contexto en X iteraciones por overflow del modelo de embedding"
         b) fallbacks.length > 0 -> "El alias <X> resolvio a <Y> por fallback (razon: <Z>) - es lo que querias?"
         c) kbSyncFailures.length > 0 -> "El KB no se sincronizo en X operaciones (EACCES u otros)"
         d) outliers.length > 0 -> "El nodo <X> tardo <Y>ms (5x sobre p50) - investigar si fue timeout"
         e) errors.length > 0 -> resumen agrupado por source

PASO 5 - Proponer el siguiente paso segun severidad:
         - Silent success sin degradaciones -> continuar normal
         - Degraded pero output correcto -> mencionar explicitamente las degradaciones y preguntar si se corrige
         - Output incorrecto Y degraded -> marcar como "completado pero con output comprometido"

PROTOCOLO DE DETECCION DE PATRONES SISTEMICOS:
Usar get_recent_errors cuando sospeches que hay un problema repetitivo:
- get_recent_errors({minutes: 30}) -> panorama de los ultimos 30 min


## Historial de mejoras

> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_skill_rationale` via CatBot.

### 2026-04-23 — _v30.2 sesion 33_ (by catdev-backfill)

**Bump a v2.0 — añadido PROTOCOLO SILENT SKIP CASCADE**

_Por qué:_ Run 609828fa: status=completed, 0 errores, 0 fallbacks, pero iterator emitió [] y 8 nodos quedaron skipped. Los contadores tradicionales daban degraded=false ingenuamente. Nuevo pattern codifica "iterator output = [] + >=2 downstream skipped = HIGH severity aunque todo lo demás esté a 0".

_Tip:_ Para detectar bugs pipeline-level que no aparecen en logs: cruzar execution_order + node_states.status. inspect_canvas_run implementa la detección.

### 2026-04-22 — _v30.1 sesion 32_ (by catdev-backfill)

**Creación v1.0 — protocolo post-ejecución canvas con inspect_canvas_run + get_recent_errors**

_Por qué:_ Run e9679f28 reportó "100% funcional" pese a 3 errores críticos (embedding 400 x10, alias fallback x10, EACCES x10). CatBot solo veía output_plane, no logs JSONL. Skill fuerza cruzar ambos planos.

_Tip:_ Patrón byte-symmetric INSERT OR IGNORE + UPDATE canonical (mirror Phase 161-01) para que deployments existentes converjan sin perder edits de usuario.

