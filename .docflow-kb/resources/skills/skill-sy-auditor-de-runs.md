---
id: skill-sy-auditor-de-runs
type: resource
subtype: skill
lang: es
title: Auditor de Runs
summary: Skill del sistema que obliga a CatBot a cruzar output_plane con infrastructure_plane via inspect_canvas_run tras ejecutar un canvas, evitando reportes enganosamente optimistas.
tags: [skill, system]
audience: [catbot, developer]
status: active
created_at: 2026-04-22T20:29:02.519Z
created_by: kb-sync-bootstrap
version: 1.0.2
updated_at: 2026-04-23T15:46:23.091Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: skill-system-auditor-runs-v1
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Skill del sistema que obliga a CatBot a cruzar output_plane con infrastructure_plane via inspect_canvas_run tras ejecutar un canvas, evitando reportes enganosamente optimistas.

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

