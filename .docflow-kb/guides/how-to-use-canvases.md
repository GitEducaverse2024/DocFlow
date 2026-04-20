---
id: guide-how-to-use-canvases
type: guide
subtype: howto
lang: es
title: "Cómo usar Canvases en DocFlow"
summary: "Guía operativa del Canvas: endpoints, tools canvas_*, cómo crear/añadir nodos/edges/ejecutar/diagnosticar, asignación de modelos por alias (canvas-classifier/formatter/writer), errores comunes y anti-patterns."
tags: [canvas, catflow, ux]
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
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from app/data/knowledge/canvas.json during Phase 151" }
ttl: managed
---

# Cómo usar Canvases en DocFlow

Ver concepto en `../domain/concepts/canvas.md`.

## Endpoints de la API

- `GET  /api/canvas`
- `POST /api/canvas`
- `GET  /api/canvas/[id]`
- `PUT  /api/canvas/[id]`
- `POST /api/canvas/[id]/execute`
- `GET  /api/canvas/[id]/runs`
- `GET  /api/canvas/[id]/runs/[runId]`

## Tools de CatBot

- `canvas_list`, `canvas_get`
- `canvas_create`
- `canvas_add_node`, `canvas_remove_node`, `canvas_update_node`
- `canvas_add_edge`, `canvas_delete_edge`
- `canvas_generate_iterator_end`
- `canvas_set_start_input`
- `canvas_execute`, `canvas_list_runs`, `canvas_get_run`

## Cómo hacer tareas comunes

### Crear un canvas

`canvas_create` con nombre descriptivo.

### Añadir un nodo

`canvas_add_node` con tipo, posición y configuración.

### Conectar nodos

`canvas_add_edge` con `sourceId` y `targetId`.

### Ejecutar

`canvas_execute` con confirmación previa del usuario.

### Diagnosticar ejecuciones

`canvas_list_runs` y `canvas_get_run` para ver output de cada nodo.

### Skills de orquestación

SIEMPRE ejecutar `get_skill(name: 'Orquestador CatFlow')` antes de `canvas_*`.

### Configurar un CatFlow completo (pipeline)

1. `canvas_create`.
2. `canvas_add_node` para START.
3. `canvas_set_start_input` con `initialInput`.
4. `canvas_add_node` para cada nodo de procesamiento (con `model`, `instructions`, `extra_skill_ids` si necesario).
5. `canvas_add_edge` para conectar.
6. Verificar con la respuesta enriquecida que `total_nodes` y `total_edges` son correctos.

### Cambiar el modelo de un nodo existente

`canvas_update_node` con `model='nombre-modelo'`. Para resetear al default del CatPaw: `model=''`.

### Asignar modelo por tipo de nodo (aliases semánticos)

- `model='canvas-classifier'` — normalizador / clasificador.
- `model='canvas-formatter'` — formateador.
- `model='canvas-writer'` — respondedor / redactor.

## Anti-patterns (no hacer)

- No modificar un canvas sin hacer `canvas_get` primero.
- No ejecutar `canvas_execute` sin confirmar con el usuario.
- No confundir *CatPaw* (nombre de agentes) con tipo de nodo canvas — el tipo siempre es `agent`.
- No generar URLs de Drive con el LLM — usar siempre el campo `link` de la tool.
- No poner filas placeholder en emails — cada lead debe tener su propia fila con datos reales.
- No pedir sudo para consultar `canvas_list_runs` o `canvas_get_run`.
- No intentar conectar un edge de salida desde un nodo OUTPUT — es terminal.
- No crear nodos sin label descriptivo — el tool rechazará la llamada.
- No conectar un segundo edge de salida desde START — solo permite 1.
- No duplicar ramas de CONDITION — cada `sourceHandle` (`yes`/`no`) solo acepta 1 edge.
- No inventes IDs de skills o conectores — usa `list_skills` y `list_connectors` para obtener IDs reales antes de pasar `extra_skill_ids` o `extra_connector_ids`.
- No llames a `canvas_get_flow` después de cada `canvas_add_node` — la respuesta enriquecida ya incluye `total_nodes`, `total_edges` y resumen del nodo.
- No cambiar el modelo como primera medida ante un nodo que falla — el 90% de los problemas son de prompt, skill o reglas.
- **NUNCA** usar nodo `CONDITION` en pipelines de datos — pierde el JSON, solo pasa `yes/no`.
- **NUNCA** vincular CatPaw (`agentId`) a nodos que procesan datos del pipeline — reinterpretan el input.
- **NUNCA** usar nodo `CatBrain/RAG` para enriquecer datos en pipeline — usa `instructions` como query, no el input real.
- **NUNCA** devolver `{to, subject, html_body}` al connector Gmail — el formato correcto es `{accion_final: 'send_reply', respuesta: {plantilla_ref, saludo, cuerpo}}`.

## Errores comunes

### `Cannot read properties of null` (canvas)

- **Causa**: canvas sin datos o template corrompido.
- **Solución**: recargar página. Si persiste, crear canvas nuevo.

### `ECONNREFUSED host.docker.internal:3501`

- **Causa**: Host Agent no está corriendo.
- **Solución**: `systemctl --user restart docatflow-host-agent.service`.

### INC-11: `render_template` devuelve HTML con placeholder `"Contenido principal del email"`

- **Causa**: CatPaw renderer llama `render_template` con variables incompletas o con claves mal nombradas; pre-Phase 137-01 el conector no validaba y devolvía el template con placeholders literales, permitiendo que el canvas siguiera con `html_body` vacío.
- **Solución**: cerrado en Phase 137-01 Task 1. El wrapper `extractRequiredVariableKeys` + `detectUnresolvedPlaceholders` falla duro si faltan variables o si el HTML renderizado contiene `{{}}` residual o el texto literal del placeholder default. Ver `app/src/lib/services/catpaw-email-template-executor.ts` y `../protocols/connector-logs-redaction.md`.

### INC-12: `send_email` devuelve `{ok:true}` sin `messageId` y el agent emitter fabrica `"enviado correctamente"`

- **Causa**: el `catpaw-gmail` wrapper aceptaba args sin `body/html_body` y devolvía `{ok:true}` incluso cuando `sendEmail()` no traía `messageId`. El agent LLM tomaba el `ok` como confirmación y alucinaba output de éxito sin que nada se hubiera enviado.
- **Solución**: cerrado en Phase 137-01 Task 2. Validación estricta `to/subject/body` + assert `messageId` mandatorio. Si falta cualquiera, el wrapper devuelve `{error:...}` al agent, quien no puede fabricar success sin contradecir la tool response. Ver `.planning/deferred-items.md INC-12` y 137-06 signal-gate acceptance form.

### `El label es obligatorio`

- **Causa**: `canvas_add_node` llamado con `label` vacío o ausente.
- **Solución**: proporcionar `label` descriptivo de 3+ caracteres, ej: `'Clasificador de emails'`.

### `OUTPUT es un nodo terminal`

- **Causa**: `canvas_add_edge` intenta crear edge de salida desde nodo OUTPUT.
- **Solución**: OUTPUT es el último nodo del flujo. Conectar el nodo anterior a OUTPUT, no al revés.

### `CONDITION requiere sourceHandle valido`

- **Causa**: `canvas_add_edge` a CONDITION sin `sourceHandle` o con handle inválido.
- **Solución**: usar `sourceHandle: 'yes'` o `'no'` al conectar desde un nodo CONDITION.

### `Skills no encontradas: sk-xxx`

- **Causa**: el ID de skill no existe en la base de datos.
- **Solución**: ejecutar `list_skills` para ver IDs disponibles antes de usar `extra_skill_ids`.

### `Este canvas no tiene nodo START`

- **Causa**: se llamó a `canvas_set_start_input` en un canvas sin nodo START.
- **Solución**: crear el canvas con `canvas_create` que auto-genera START, o verificar con `canvas_get_flow` que el nodo START existe antes de llamar a `canvas_set_start_input`.

## Casos de éxito

- CatBot crea canvas con 3 nodos (`Start > Agent > Output`), conecta y ejecuta exitosamente.
- Usuario diagnostica ejecución fallida con `canvas_get_run` y encuentra nodo con output incorrecto.

## Referencias

- `.planning/research/FEATURES.md`
- `.planning/milestones/v16.0-ROADMAP.md`
- `.planning/phases/137-learning-loops-memory-learn/137-01-runtime-connector-contracts-PLAN.md`
- `.planning/phases/137-learning-loops-memory-learn/137-02-runtime-wiring-PLAN.md`
- `../protocols/connector-logs-redaction.md`
- `.planning/deferred-items.md`
- `.planning/phases/139-canvas-tools-capabilities-tools/139-01-SUMMARY.md`
- Concepto: `../domain/concepts/canvas.md`.
- Reglas: `../rules/R*.md`.
