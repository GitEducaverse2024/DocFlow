# Phase 130: Async CatFlow Pipeline - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Cuando CatBot recibe una petición que no puede completar en <60 segundos, detecta la complejidad, pregunta al usuario si quiere que prepare un CatFlow asistido, ejecuta un pipeline de planificación en 3 fases (estratega → despiezador → arquitecto), diseña un canvas reutilizando recursos existentes (creando CatPaws nuevos si hacen falta), envía la propuesta al usuario con botón de aprobación, ejecuta el canvas asíncronamente tras confirmación, y finaliza preguntando si mantener/guardar como recipe/eliminar.

Fuera del scope:
- Edición visual del canvas propuesto (el usuario lo abre en /catflow/{id} con el editor existente si quiere retocar)
- Versionado de planes (si falla, se genera uno nuevo, no hay historial)
- Modificaciones al canvas executor actual
- Detección de complejidad para peticiones que CatBot puede resolver en <60s (siguen el flujo síncrono normal)

</domain>

<decisions>
## Implementation Decisions (user-locked)

### Pipeline roles — Opción B: CatBot único con system prompts especializados
- **NO crear 3 CatPaws nuevos** (`catflow-strategist`, `catflow-decomposer`, `catflow-architect`)
- CatBot ejecuta las 3 fases internamente cambiando el system prompt en cada fase
- Cada fase usa LLM call con prompt enfocado: estratega, despiezador, arquitecto
- Razón: el usuario prefiere no saturar la lista de CatPaws con entidades auxiliares

### Creación on-the-fly de CatPaws
- Cuando el Arquitecto de Canvas busca recursos (`list_cat_paws`) y no encuentra uno adecuado para una tarea específica, **DEBE preguntar al usuario**: "Necesito un CatPaw que sepa X para este paso, ¿puedo crearlo?"
- Si el usuario acepta: CatBot crea el CatPaw con el system prompt adecuado, lo guarda, y continúa el diseño
- Si el usuario rechaza: CatBot reporta que no puede completar el diseño y marca el pipeline como failed con `last_error` explicativo
- Esto es el punto de integración con el skill "Arquitecto de Agentes" existente de CatBot

### Trigger — Opción C: Heurística + confirmación explícita
- Detección automática via flag `async: true` o `estimated_duration_ms > 60000` en TOOLS[]
- CatBot detecta → **pregunta al usuario**: "Esto va a requerir varios pasos y tiempo. ¿Quieres que prepare un CatFlow?"
- Si el usuario acepta → arranca el pipeline
- Si el usuario rechaza → intenta ejecución inline (probablemente fallará con timeout, pero es decisión del usuario)
- Instrucción en nueva sección P1 del PromptAssembler: "Protocolo de Tareas Complejas"

### Scope trigger
- **Solo aplica a tareas que requieren >60 segundos** de ejecución
- Peticiones simples (lecturas, list_*, get_*, edits rápidos, ejecución de canvas pre-existentes) siguen el flujo síncrono actual sin cambios
- No se toca el flujo actual de `/api/catbot/chat` para peticiones simples

### Lista inicial de tools marcadas como async (a confirmar en research)
- `execute_catflow` — ejecución de canvas complejos
- `execute_task` — tareas lineales con múltiples steps
- `process_source_rag` — indexación de documentos grandes
- Otras que el research identifique por patrón de uso

### Post-execution lifecycle (3 opciones siempre)
1. **Mantener como plantilla**: `is_template = 1` en canvases → aparece en galería de plantillas
2. **Guardar como recipe**: integración con Phase 122 user_memory → fast-path en peticiones similares
3. **Eliminar**: DELETE FROM canvases WHERE id = ? → evita ruido de canvases desechables

### Notificación cross-channel
- **Dashboard**: tabla `notifications` existente + tipo `catflow_pipeline` nuevo
- **Telegram**: `sendMessage` con InlineKeyboard (botones "Ejecutar/Cancelar" via callback_data)
- El canal se determina por el `channel` del intent padre (telegram/web)

### Pipeline visibility
- `progress_message` en `intent_jobs` se actualiza en cada fase
- Dashboard: nueva card/tab en la sección "Conocimiento de CatBot" (integración con Phase 127) o sección independiente
- Telegram: mensajes de progreso opcionales cada vez que cambia de fase (estratega → despiezador → arquitecto → ejecución)

</decisions>

<code_context>
## Existing Assets to Reuse

### Infrastructure patterns (proven in Phases 128-129)
- **Worker singleton**: `IntentWorker` (intent-worker.ts), `AlertService` (alert-service.ts) — clase con static start()/stop(), setInterval, registrada en instrumentation.ts
- **CRUD pattern**: `catbot-db.ts` ya tiene 6 tablas + CRUD tipado (knowledge_gaps, knowledge_learned, intents son los más recientes y relevantes)
- **Tool registration**: TOOLS[] array + executeTool switch + always_allowed check + knowledge tree sync (KTREE-02 test)
- **PromptAssembler sections**: `buildIntentProtocol` (Phase 129) es el template para `buildComplexTaskProtocol`
- **Notification cross-channel**: `notifications` table (ya existe desde antes) + `TelegramBotService.sendMessage` (ya existe)

### Canvas infrastructure (reusable)
- **Canvas execution**: `/api/canvas/{id}/execute` — endpoint POST que ejecuta un canvas, no necesita modificación
- **Canvas executor**: `canvas-executor.ts` con `topologicalSort` y `executeCanvas` — ya maneja la ejecución de flow_data
- **flow_data schema**: nodes + edges JSON — conocido y estable
- **Canvas CRUD**: tabla `canvases` con `flow_data` TEXT, `is_template` INT, `status` TEXT

### Recursos queryables (para el Arquitecto de Canvas)
- `list_catbrains` (existe como tool) — proyectos con RAG
- `list_cat_paws` (existe como tool) — agentes con modelo/skills
- `list_skills` (existe como tool) — catálogo de skills disponibles
- `list_connectors` (existe como tool) — conectores configurados (n8n, APIs, etc.)
- Todos ya retornan JSON estructurado consumible por el LLM

### CatPaw creation
- Ya existe flujo de creación en `/api/cat-paws` (CRUD de CatPaws)
- Skill "Arquitecto de Agentes" en CatBot (MEMORY.md) — tiene protocolo de 5 pasos para crear CatPaws
- Patrón: buscar existentes → recomendar skills → diseñar config → confirmar → crear

### Telegram patterns
- `telegram-bot.ts` ya tiene `sendMessage` con Markdown escape, typing indicator, processing message
- Falta: `sendMessageWithInlineKeyboard` (para los botones de aprobación) — nueva helper
- `handleUpdate` ya maneja `callback_query` events de Telegram — verificar en research

### Intent integration (Phase 129)
- Tabla `intents` ya existe con status/steps/attempts
- Un `intent` puede generar N `intent_jobs` (1-a-muchos)
- `list_my_intents` tool ya existe — se extiende mentalmente con jobs
- `buildOpenIntentsContext` inyecta intents en el prompt — se extiende para inyectar jobs activos

## Integration Points

- **Phase 122 (User Memory)**: opción "guardar como recipe" tras ejecución exitosa
- **Phase 126 (Knowledge Gaps)**: si el Arquitecto no puede diseñar porque falta info, se reporta como gap
- **Phase 127 (Knowledge Admin Dashboard)**: nueva sección/tab para visualizar pipelines activos
- **Phase 128 (AlertService)**: nueva check `checkStuckPipelines()` — pipelines en 'running' >30min son alertables
- **Phase 129 (Intent Queue)**: `intent_jobs.intent_id` FK a `intents.id` — cada pipeline nace de un intent

</code_context>

<specifics>
## User Intent

El usuario quiere un **sistema profesional y completo** que:
1. No deje tareas a medias (reusa Phase 129 retry + nuevo executor async)
2. Reaproveche toda la infraestructura existente (canvases, CatPaws, CatBrains, skills, conectores)
3. Sea transparente y controlable — el usuario ve qué se planifica y decide si se ejecuta
4. Tenga un lifecycle post-ejecución claro (no se acumulan canvases basura)
5. Funcione por los dos canales: dashboard y Telegram

La petición original fue: *"hacer un sistema asincrono en el momento que detectemos y antes que lleguemos al timeout de 60 segundos, avisa al usuario que va a crear una subtarea asincrona... este job se puede convertir en varios subjobs... se monta un catFlow con los recursos catbrain, catpaw, skills, conectores necesarios con el experto catBot o una creacion nueva que sea especialista en catFlow... se notifica en dashboard y telegram y se pregunta si se ejecuta con instrucciones de que hace, una vez que se ejecuta se pregunta si se mantiene o se elimina"*

Es un patrón de **AI-assisted workflow composition** — no ejecución ciega, sino diseño supervisado con aprobación humana.

</specifics>

<deferred>
## Deferred Ideas (explicitly NOT in this phase)

- **Edición visual del canvas propuesto desde el chat** — el usuario abre /catflow/{id} en el editor existente
- **Versionado de planes fallidos** — si el pipeline falla, se genera uno nuevo, no hay historial
- **Auto-creación de CatBrains** nuevos — solo se pueden crear CatPaws nuevos, los CatBrains requieren decisión del usuario fuera del pipeline
- **Ejecución sin aprobación** — no hay modo "auto-approve", siempre se pregunta
- **Compartir pipelines entre usuarios** — cross-user admin view sigue siendo FUTURE
- **Edición de flow_data después del diseño** — si el diseño no es correcto, se rechaza y se regenera

</deferred>

---

*Phase: 130-async-catflow-pipeline-creaci-n-asistida-de-workflows*
*Context decisions locked: 2026-04-10*
