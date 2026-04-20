---
id: guide-how-to-use-catflows
type: guide
subtype: howto
lang: es
title: "Cómo usar CatFlows en DocFlow"
summary: "Guía operativa para CatFlows: endpoints REST, tools CatBot, cómo crear/fork/borrar/activar escucha, errores comunes (INC-11 render_template, INC-12 send_email) y referencias a las Reglas de Oro."
tags: [catflow, canvas, ux]
audience: [catbot, user, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
last_accessed_at: 2026-04-20T00:00:00Z
access_count: 0
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from app/data/knowledge/catflow.json during Phase 151" }
ttl: managed
---

# Cómo usar CatFlows en DocFlow

Ver concepto en `../domain/concepts/catflow.md`.

## Endpoints de la API

- `GET  /api/catflow`
- `POST /api/catflow`
- `GET  /api/catflow/[id]`
- `POST /api/catflow/[id]/execute`
- `DELETE /api/canvas/[id]`
- `GET  /api/tasks`
- `POST /api/tasks`
- `POST /api/tasks/[id]/execute`

## Tools de CatBot

- `list_catflows`, `execute_catflow`, `toggle_catflow_listen`, `fork_catflow`, `delete_catflow`
- `create_task`, `list_tasks`
- `_internal_attempt_node_repair`

## Cómo hacer tareas comunes

### Crear un CatFlow

Ir a `/catflow` > Nuevo > añadir nodos > conectar > ejecutar.

### Crear un Iterator

Usar `canvas_add_node` con `nodeType=ITERATOR`, luego `canvas_generate_iterator_end` para crear el par.

### Activar escucha

`toggle_catflow_listen` para recibir señales de otros CatFlows.

### Duplicar un CatFlow

Usar `fork_catflow`.

### Borrar un CatFlow

Usar `delete_catflow` (sudo-required). Flujo de dos pasos:

1. Primera llamada con `identifier` (nombre o ID) devuelve `CONFIRM_REQUIRED` con preview (nombre, status, `canvas_runs_to_cascade`).
2. Segunda llamada con `identifier=<id exacto>` y `confirmed=true` ejecuta el borrado. Los `canvas_runs` asociados se eliminan por CASCADE.

### Diagnosticar por qué un renderer email envía HTML vacío

Consultar `connector_logs` con `request_payload` rico (post-Phase 137-01 INC-13) para ver qué variables recibió `render_template`. Si el HTML todavía contiene `{{X}}` o `"Contenido principal del email"`, el wrapper post-INC-11 habrá devuelto error explícito listando las variables faltantes.

## Anti-patterns (no hacer)

- No pasar arrays >1 item a nodos con tool-calling interno — usar `ITERATOR` siempre.
- No vincular conectores/skills innecesarios — cada tool es contexto que confunde al LLM.
- No mezclar nodos de pensamiento (LLM) con nodos de ejecución (código) en el mismo nodo.
- No depender de que un nodo "sepa" datos que no están en su input — propagación explícita.

## Errores comunes

### `Cannot read properties of null` (canvas)

- **Causa**: canvas sin datos o template corrompido.
- **Solución**: recargar página. Si persiste, crear canvas nuevo.

### INC-11: `render_template` del conector Email Templates emite HTML con placeholders sin sustituir

- **Causa**: pre-Phase 137-01 el `catpaw-email-template-executor` no validaba que `variables` cubriese todos los `instruction.text` del template structure; permitía que el canvas siguiera con `html_body` vacío o con el literal `"Contenido principal del email"`.
- **Solución**: cerrado en Phase 137-01 Task 1 (capa wrapper). `render_template` ahora recorre las secciones `header/body/footer`, extrae todos los `block.text` de tipo `instruction` como claves obligatorias, y devuelve error explícito listando las variables faltantes. Segunda defensa: inspecciona el HTML renderizado buscando `{{X}}` residuales o el literal `"Contenido principal del email"`.

### INC-12: Gmail `send_email` devuelve `{ok:true}` sin `messageId` y el agent emitter fabrica `"enviado correctamente"`

- **Causa**: el `catpaw-gmail` wrapper aceptaba args sin `body/html_body` y devolvía `ok` cuando el conector real no devolvía `messageId`. El agent LLM interpretaba el ok como confirmación y emitía output textual de éxito sin que ningún email hubiera salido.
- **Solución**: cerrado en Phase 137-01 Task 2 (capa wrapper, Option B). `send_email` exige `to/subject/body|html_body` no vacíos, y si `sendEmail()` devuelve sin `messageId` el wrapper emite `{error:'...no devolvió messageId...', raw_response}`. La verificación end-to-end (agent output coincide con tool response) queda delegada al signal-gate Phase 137-06 que observa la verdad real (llegada del email a los inboxes). Ver `../protocols/connector-logs-redaction.md`.

## Casos de éxito

- Pipeline de 5 nodos: `Start > Lista emails > Iterator > Procesa cada email > Output con resumen`.
- CatFlow con modo escucha activo que se dispara automáticamente al recibir señal de otro CatFlow.

## Referencias

- `.planning/research/FEATURES.md`
- `.planning/milestones/v16.0-ROADMAP.md`
- `app/data/knowledge/canvas-rules-index.md` (redirigido — ver Plan 01 `rules/R*.md`)
- `.planning/knowledge/canvas-nodes-catalog.md` (redirigido — ver Plan 01 `domain/concepts/canvas-node.md`)
- `.planning/phases/132-canvas-qa-loop-architect-con-auto-review-rules-index-y-side-effect-guards/132-RESEARCH.md`
- `.planning/phases/134-architect-data-layer-arch-data/134-04-SUMMARY.md`
- `.planning/phases/137-learning-loops-memory-learn/137-01-runtime-connector-contracts-PLAN.md`
- `.planning/phases/137-learning-loops-memory-learn/137-02-runtime-wiring-PLAN.md`
- `../protocols/connector-logs-redaction.md`
- Concepto: `../domain/concepts/catflow.md`.
- Reglas de Oro: `../rules/R01-data-contracts.md` .. `../rules/R25-mandatory-idempotence.md`.
