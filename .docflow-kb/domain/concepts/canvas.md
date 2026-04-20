---
id: concept-canvas
type: concept
subtype: canvas
lang: es
title: "Canvas — Editor visual de flujos con nodos arrastrables"
summary: "Canvas es el editor visual de flujos con 13 tipos de nodo. Expone tools canvas_* para gestión programática. Los nodos AGENT con CatPaws se ejecutan vía executeCatPaw() con tool-calling multi-round."
tags: [canvas, catflow]
audience: [catbot, architect, developer, user]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from app/data/knowledge/canvas.json during Phase 151 (concepts + description)" }
ttl: never
---

# Canvas

## Descripción

El **Canvas** es el editor visual de flujos con nodos arrastrables. Puedes gestionar
canvas completos con las tools `canvas_*`.

**Tipos de nodo disponibles (13):** `START` (auto-creado, punto de entrada),
`AGENT` (ejecuta CatPaw con LLM), `CONNECTOR` (integra servicio externo: Gmail,
Drive, Holded), `CONDITION` (bifurcación yes/no), `OUTPUT` (nodo terminal),
`MERGE` (une ramas paralelas), `CHECKPOINT` (pausar para aprobación humana),
`PROJECT` (referencia a otro canvas), `ITERATOR` (bucle sobre colección, emparejado
con `ITERATOR_END`), `ITERATOR_END` (cierre de bucle), `STORAGE` (lectura/escritura
persistente), `SCHEDULER` (ejecución programada/cron), `MULTIAGENT` (orquesta
múltiples agentes en paralelo).

Los nodos `AGENT` con CatPaws se ejecutan automáticamente vía `executeCatPaw()`
con tool-calling multi-round.

## Conceptos fundamentales

### Tipos de nodo y ejecución

- Canvas es el editor visual de flujos con nodos arrastrables.
- **Tipos de nodo (13 disponibles)**: `START` (auto-creado por `canvas_create`), `AGENT`, `CONNECTOR`, `CONDITION`, `OUTPUT`, `MERGE`, `CHECKPOINT`, `PROJECT`, `ITERATOR`, `ITERATOR_END`, `STORAGE`, `SCHEDULER`, `MULTIAGENT`.
- **Tipos especiales**: `START` se crea automáticamente con `canvas_create` (no se crea con `canvas_add_node`). `ITERATOR_END` se genera con `canvas_generate_iterator_end`. `STORAGE`, `SCHEDULER` y `MULTIAGENT` existen en el editor pero no se crean vía `canvas_add_node` — se crean desde la UI del editor.
- Nodos `AGENT` con `agentId` apuntando a CatPaw ejecutan automáticamente vía `executeCatPaw()`.

### Protocolo y UX

- **Protocolo obligatorio**: `canvas_get` PRIMERO antes de modificar cualquier canvas.
- Posiciones: calcular `X: +250` del último nodo para evitar solapamiento.
- Siempre añadir edges después de los nodos.
- **Propagación de datos**: cada nodo recibe SOLO el output del nodo anterior.
- Emails con formato HTML: estilos inline, colores `#1a73e8` header, `#f8f9fa` filas alternas.
- **URLs de Google Drive** NUNCA generadas por LLM — obtener del campo `link` de `drive_upload_file`.

### Nodos específicos y convenciones

- **Condition node** (LEARN-06 milestone v27.0): acepta respuestas multilingües con `normalizeConditionAnswer`. YES: `yes|si|si-con-tilde|true|1|afirmativo|correcto`. NO: `no|false|0|negativo|incorrecto`. Case-insensitive, cleanup de puntuación al final, first-token fallback para respuestas del tipo *"si, con reservas"*. Default conservador: `no` si el LLM responde algo fuera de las listas. Implementado en `canvas-executor.ts` como excepción sancionada a la regla *"no tocar canvas-executor.ts"*.
- **START node convention** (LEARN-05 milestone v27.0): `runArchitectQALoop` muta `flow_data.nodes[start].data.initialInput = goal` justo antes de devolver el design aceptado. El strategist refina el texto original del usuario a un goal accionable; propagarlo al start node garantiza que el primer nodo del canvas trabaja con contexto de propósito, no con el `original_request` ambiguo.

### Tools: parámetros y respuestas enriquecidas

- `canvas_add_node` requiere **label descriptivo obligatorio** (mínimo 3 caracteres) — sin label, CatBot recibe error de validación.
- `canvas_add_node` acepta parámetro `model` para asignar modelo LLM explícito por nodo, que override el modelo del CatPaw.
- `canvas_add_edge` valida reglas estructurales: `OUTPUT` es terminal (no puede tener edges de salida), `START` max 1 edge de salida, `CONDITION` requiere `sourceHandle` yes/no sin duplicar ramas.
- `canvas_set_start_input` configura el `initialInput` (datos de entrada) y opcionalmente `listen_mode` del nodo START de un canvas. Usa esta tool después de crear el canvas y el nodo START.
- **Respuesta enriquecida**: `canvas_add_node`, `canvas_update_node`, `canvas_add_edge` y `canvas_set_start_input` devuelven `nodeId, label, type, model, has_instructions, has_agent, has_skills, has_connectors, total_nodes, total_edges` — no necesitas llamar a `canvas_get_flow` para verificar.
- `extra_skill_ids` y `extra_connector_ids`: parámetros opcionales en `canvas_add_node` y `canvas_update_node`. Se pasan como strings separados por coma (ej: `'sk1,sk2'`). Los IDs se validan contra la DB — usa `list_skills` y `list_connectors` antes para verificar disponibilidad.
- `model` en `canvas_update_node`: puedes cambiar el modelo LLM de un nodo existente. Enviar string vacío resetea el override y el nodo usa el modelo del CatPaw.

### Data contracts y modelos por tipo de nodo

- **Data contracts entre nodos**: cada nodo debe producir un JSON con campos definidos que el siguiente nodo consume. El normalizador produce 6 campos (`from`, `subject`, `body`, `date`, `message_id`, `thread_id`), el clasificador propaga todos los campos y añade `reply_to_email`, `producto`, `template_id`, `is_spam`, `accion`, `datos_lead`. El respondedor produce JSON con `accion_final=send_reply` y bloque `respuesta` con `plantilla_ref`, `saludo`, `cuerpo` texto plano.
- **Modelos por tipo de nodo**: para pipelines de datos usar `gemini-main` en todos los nodos agent (fiable y rápido). Los aliases `canvas-classifier` y `canvas-writer` también funcionan.

### Restricciones críticas (v28.0 piloto E2E)

- **RESTRICCIÓN CRÍTICA**: Los nodos `CONDITION` solo pasan `'yes'` o `'no'` como output — el nodo siguiente PIERDE el JSON original. NO usar `CONDITION` en pipelines de datos. Filtrar spam/condiciones DENTRO del nodo Respondedor con lógica en instrucciones.
- **RESTRICCIÓN CRÍTICA**: Los nodos `CatBrain/RAG` usan `data.instructions` como query de búsqueda (NO el `predecessorOutput`). El contexto de productos debe ir INLINE en las instrucciones del nodo procesador, no vía CatBrain.
- **RESTRICCIÓN CRÍTICA**: Los CatPaws con `system_prompt` elaborado REINTERPRETAN el input del pipeline y crean datos ficticios. Para nodos que transforman datos (normalizar, clasificar, generar respuestas), usar agentes genéricos SIN `agentId`.
- **Patrón validado Email Pipeline (7 nodos)**: `START → Normalizador (genérico) → Clasificador (genérico) → Respondedor (genérico, incluye filtrado spam + contexto productos + JSON para connector) → Connector Gmail → Output`. Duración: 25–32 segundos.
- **Protocolo de diagnóstico**: cuando un nodo falla, orden estricto: 1) mejorar prompt, 2) aislar y probar, 3) ajustar skill/reglas, 4) cambiar modelo como último recurso.

## Referencias

- Guía operativa: `../../guides/how-to-use-canvases.md`.
- Nodo canvas base: `./canvas-node.md` + `../taxonomies/node-roles.md`.
- Reglas que restringen canvas: `../../rules/R*.md`.
- Fuente original: `app/data/knowledge/canvas.json` (migración Phase 151).
