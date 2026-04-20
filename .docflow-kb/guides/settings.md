---
id: guide-settings
type: guide
subtype: configuration
lang: es
title: "Settings — Configuración de DocFlow"
summary: "Guía UI de Settings (/settings): Centro de Modelos con 4 tabs (Resumen/Proveedores/Modelos/Enrutamiento), protocolos CatBot (proporcionalidad/diagnóstico/salud), user profiles, recipes, knowledge admin dashboard, intent protocol."
tags: [ux, ops]
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
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from app/data/knowledge/settings.json during Phase 151 (single-atom guide, no ontology to split)" }
ttl: managed
---

# Settings — Configuración de DocFlow

## Descripción

El **Centro de Modelos** está en `/settings` y tiene 4 tabs: *Resumen* (vista rápida
de salud de proveedores y aliases), *Proveedores* (cards de cada proveedor con status,
latencia y modelos), *Modelos* (fichas MID agrupadas por tier Elite/Pro/Libre con
filtros y edición inline de costes), *Enrutamiento* (tabla compacta alias→modelo con
semáforo de salud y dropdown inteligente).

El menú **CatTools** en el sidebar agrupa *Configuración* (`/settings`),
*Notificaciones* (`/notifications`) y *Testing* (`/testing`).

## Conceptos

### Centro de Modelos (4 tabs)

- `centro_de_modelos`: el Centro de Modelos tiene 4 tabs: *Resumen*, *Proveedores*, *Modelos*, *Enrutamiento*.
- **Tab Resumen**: vista rápida de salud de proveedores y aliases.
- **Tab Proveedores** (`/settings?tab=proveedores`): cards de cada proveedor con status, latencia y modelos.
- **Tab Modelos** (`/settings?tab=modelos`): fichas MID agrupadas por tier (*Elite*, *Pro*, *Libre*, *Sin clasificar*). Filtros por tier, proveedor, solo en uso. Badge *"en uso"* con aliases. Costes editables inline.
- **Tab Enrutamiento** (`/settings?tab=enrutamiento`): tabla compacta alias→modelo con semáforo (verde=directo, ámbar=fallback, rojo=error) y dropdown inteligente que grisa modelos no disponibles.
- **CatTools**: menú colapsable en sidebar que agrupa Configuración, Notificaciones y Testing.
- **Tiers de modelos**: *Elite* (Claude Opus, Gemini 2.5 Pro) solo para tareas complejas, *Pro* (Claude Sonnet, GPT-4o, Gemini Flash) para mayoría de tareas, *Libre* (Ollama locales) sin coste.

### Protocolos CatBot

- **Protocolo de proporcionalidad** (CATBOT-07): evaluar complejidad antes de recomendar modelo.
- **Protocolo de diagnóstico** (CATBOT-06): ante resultado pobre, verificar modelo asignado y sugerir alternativa.
- **Protocolo de salud** (CATBOT-08): `check_model_health()` sin `target` para diagnóstico completo.

### User profiles

- `user_profiles`: perfiles de usuario auto-creados por canal (web/Telegram). CatBot recuerda preferencias, estilo de comunicación, y contexto conocido. Se crean automáticamente en la primera interacción.
- `user_profile_tools`: `get_user_profile` (consultar perfil, always_allowed) y `update_user_profile` (modificar perfil, permission-gated). Ambos aceptan `user_id` opcional (default: `web:default`).
- `user_profile_channels`: cada canal genera un ID único — `web:default` para interfaz web, `telegram:{chat_id}` para Telegram. Los perfiles son independientes por canal.
- `user_profile_directives`: al actualizar un perfil, se regeneran automáticamente las `initial_directives` que CatBot usa para personalizar sus respuestas.

### User memory (recipes)

- `user_memory`: CatBot memoriza automáticamente workflows complejos (2+ herramientas) como recetas reutilizables. Las recetas se emparejan por keyword overlap con la consulta del usuario.
- `user_memory_tools`: `list_my_recipes` (listar recetas memorizadas, always_allowed) y `forget_recipe` (eliminar una receta por ID, permission-gated `manage_profile`).
- `user_memory_matching`: antes de cada conversación, CatBot busca recetas previas que coincidan con la consulta actual y las inyecta en el prompt como contexto P1.

### Knowledge gaps y admin dashboard

- `knowledge_gaps`: sistema de detección de gaps de conocimiento. Cuando CatBot no puede responder algo (`query_knowledge` devuelve 0 resultados), registra automáticamente un gap vía `log_knowledge_gap`. Los gaps se almacenan en `knowledge_gaps` table de `catbot.db` y son consultables por admin para mejorar el knowledge tree.
- `knowledge_admin_dashboard`: sección en Settings (`/settings?ktab=learned|gaps|tree`) para visualizar y curar el conocimiento de CatBot. 3 tabs: *Aprendido* (entries staging con validar/rechazar + métricas), *Gaps* (gaps detectados con filtros por area y estado), *Knowledge Tree* (7 áreas con conteos y semáforo de completitud).

### Conversation memory

- `conversation_memory`: CatBot mantiene 10 mensajes recientes + hasta 30 compactados vía LLM. Aplica tanto en web como en Telegram.
- `compaction`: proceso de resumir mensajes antiguos usando `ollama/gemma3:12b` para preservar contexto semántico sin enviar todos los tokens al LLM.

### Intent protocol

- `intent_protocol`: CatBot tiene una cola persistente de intents en `catbot.db`. Para peticiones multi-paso crea intent ANTES de ejecutar con `create_intent`, luego actualiza vía `update_intent_status` (`completed`/`failed`). `IntentWorker` background re-queues failed intents cada 5 min (max 3 attempts, luego `abandoned`). Retry es LLM-driven: el worker solo flip status `failed → pending`, el LLM ve el intent abierto en el siguiente turno vía `buildOpenIntentsContext`.

### Aliases semánticos para canvas

- `canvas-classifier`: alias semántico para nodos de clasificación/extracción en canvas. Apunta a `gemma-local` (modelo local ligero). CatBot usa este alias al crear nodos clasificadores.
- `canvas-formatter`: alias semántico para nodos de formateo mecánico en canvas. Apunta a `gemma-local`. CatBot usa este alias al crear nodos formateadores.
- `canvas-writer`: alias semántico para nodos de redacción/generación de contenido en canvas. Apunta a `gemini-main` (requiere calidad). CatBot usa este alias al crear nodos redactores.
- `gemma-local`: modelo `Gemma4:e4b` corriendo en Ollama local (RTX 5080, 16GB VRAM). Usado para tareas mecánicas de canvas (clasificación, formateo) donde la velocidad y coste cero importan más que la calidad máxima.

## Endpoints de la API

- `GET  /api/settings`
- `PUT  /api/settings`
- `GET  /api/health`
- `GET  /api/models/aliases`
- `PUT  /api/models/aliases/[alias]`
- `GET  /api/models/mid`
- `PUT  /api/models/mid/[id]`
- `GET  /api/models/health`
- `GET    /api/catbot/knowledge/entries?validated=true|false`
- `PATCH  /api/catbot/knowledge/entries`
- `GET    /api/catbot/knowledge/gaps?resolved=true|false&area=string`
- `PATCH  /api/catbot/knowledge/gaps`
- `GET    /api/catbot/knowledge/stats`
- `GET    /api/catbot/knowledge/tree`

## Tools de CatBot

- `get_model_landscape`, `recommend_model_for_task`, `update_alias_routing`, `check_model_health`
- `list_mid_models`, `update_mid_model`
- `get_user_profile`, `update_user_profile`
- `list_my_recipes`, `forget_recipe`
- `explain_feature`, `query_knowledge`, `read_error_history`, `save_learned_entry`
- `get_summary`, `list_my_summaries`, `log_knowledge_gap`
- `create_intent`, `update_intent_status`, `list_my_intents`, `retry_intent`, `abandon_intent`
- `queue_intent_job`, `list_my_jobs`, `cancel_job`
- `approve_pipeline`, `execute_approved_pipeline`, `post_execution_decision`, `approve_catpaw_creation`

## Cómo hacer tareas comunes

### Ver salud de modelos

`/settings` > tab *Resumen* o usar `check_model_health` sin `target`.

### Cambiar routing de alias

`/settings?tab=enrutamiento` > dropdown > seleccionar modelo.

### Editar coste de modelo

`/settings?tab=modelos` > click en coste > editar inline.

### Listar modelos por tier

Usar `list_mid_models` con filtro `tier`.

### Diagnosticar resultado pobre

`get_model_landscape` > verificar modelo del alias > `recommend_model_for_task`.

### Verificar conectividad

`check_model_health()` > revisar `total_aliases`, `healthy`, `fallback`, `errors`.

### Consultar tu perfil

*"muéstrame mi perfil"* — usa `get_user_profile` con `user_id` por defecto.

### Cambiar tu nombre

*"cambiar mi nombre a X"* — usa `update_user_profile` con `display_name`.

### Ver perfil de Telegram

Especificar `user_id telegram:{chat_id}` en `get_user_profile`.

### Cambiar estilo de comunicación

*"prefiero comunicación formal/casual/técnica"* — usa `update_user_profile` con `communication_style`.

### Listar recetas memorizadas

*"lista mis recetas"* o *"qué workflows recuerdas"* — usa `list_my_recipes`.

### Olvidar una receta

*"olvida la receta X"* — usa `forget_recipe` con `recipe_id`.

### Curar conocimiento aprendido

`/settings?ktab=learned` — ver entries en staging, validar (✓) o rechazar (✗). Toggle entre staging y validadas.

### Ver gaps de conocimiento

`/settings?ktab=gaps` — filtrar por área y estado (pendientes/resueltos). Marcar gap como resuelto cuando se haya añadido la información al knowledge tree.

### Memoria de conversación

La memoria es automática. No requiere configuración. CatBot compacta mensajes viejos y mantiene los 10 más recientes completos.

### Ver intents pendientes

*"qué tareas tienes pendientes"* → `list_my_intents({status:'pending'})`. Para reintentar: *"reintentalo"* → `retry_intent(id)`. Para abandonar: *"olvídalo"* → `abandon_intent(id, reason)`.

### Asignar modelo a un nodo de canvas

Usar aliases semánticos (`canvas-classifier`, `canvas-formatter`, `canvas-writer`) en vez de nombres de modelo directos. CatBot debe pasar el alias como parámetro `model` en `canvas_add_node`.

## Anti-patterns (no hacer)

- No recomendar modelo *Elite* para tareas triviales — sugerir *Pro* o *Libre* con justificación.
- No cambiar routing sin confirmar con el usuario primero — `update_alias_routing` requiere confirmación.
- No usar modelos *Elite* para preguntas simples, listados o formato — eso es *Pro* o *Libre*.
- No revelar perfil de un usuario a otro sin sudo activo — los perfiles son privados por canal.
- No usar `gemma-local` para tareas de redacción (`canvas-writer`) — la calidad es insuficiente para generar emails o contenido. Usar `gemini-main` o superior.
- No usar `gemma4:31b` — excede los 16GB de VRAM del RTX 5080. Solo `gemma4:e4b` (9GB) es viable.

## Errores comunes

### `invalid model ID`

- **Causa**: modelo configurado no existe en LiteLLM `routing.yaml`.
- **Solución**: ir a Configuración > verificar modelos activos. Editar y seleccionar modelo válido.

### `LiteLLM timeout / 502`

- **Causa**: LiteLLM sobrecargado o API key inválida.
- **Solución**: reintentar. Si persiste, verificar API key del provider en Configuración.

## Casos de éxito

- CatBot diagnostica modelo subóptimo (*Libre* para tarea compleja), sugiere *Pro* y cambia routing con confirmación.
- Usuario pide check de salud, CatBot ejecuta diagnóstico completo y reporta 2 aliases en fallback con sugerencia de fix.

## Referencias

- `.planning/research/ARCHITECTURE.md`
- `.planning/ROADMAP.md`
