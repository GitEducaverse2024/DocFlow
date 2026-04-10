# Roadmap: DoCatFlow

## Milestones

- v12.0 WebSearch CatBrain -- Phases 48-49 (shipped 2026-03-16) -- [archive](.planning/milestones/v12.0-ROADMAP.md)
- v13.0 Conector Gmail -- Phases 50-51 (shipped 2026-03-16)
- v14.0 CatBrain UX Redesign -- Phases 52-56 (shipped 2026-03-21) -- [archive](.planning/milestones/v14.0-ROADMAP.md)
- v15.0 Tasks Unified -- Phases 57-62 (shipped 2026-03-22) -- [archive](.planning/milestones/v15.0-ROADMAP.md)
- v16.0 CatFlow -- Phases 63-70 (shipped 2026-03-22) -- [archive](.planning/milestones/v16.0-ROADMAP.md)
- v17.0 Holded MCP -- Phases 71-76 (shipped 2026-03-24)
- v18.0 Holded MCP: Auditoria API + Safe Deletes -- Phases 77-81 (shipped 2026-03-24)
- v19.0 Conector Google Drive -- Phases 82-86 (partial)
- v20.0 CatPaw Directory -- Phases 87-90 (shipped 2026-03-30)
- v21.0 Skills Directory -- Phases 91-94 (shipped 2026-03-30)
- v22.0 CatBot en Telegram -- Phases 95-98 (shipped 2026-03-30)
- v23.0 Sistema Comercial Educa360 -- Session 30 (shipped 2026-04-01)
- v24.0 CatPower -- Email Templates -- Phases 99-106 (shipped 2026-04-01)
- v25.0 Model Intelligence Orchestration -- Phases 107-112 (shipped 2026-04-07)
- v25.1 Centro de Modelos -- Phases 113-117 (shipped 2026-04-08)
- v26.0 CatBot Intelligence Engine -- Phases 118-124 (shipped 2026-04-08)
- **v26.1 Knowledge System Hardening** -- Phases 125-127 (in progress)

---

## v26.1 -- Knowledge System Hardening

**Goal:** Cerrar los gaps del sistema de documentación de CatBot para que sea robusto, auto-mantenible y profesional. El knowledge tree se valida automáticamente, CatBot detecta y reporta sus propios gaps de conocimiento, y los administradores tienen un dashboard para curar learned entries.

## Phases

- [x] **Phase 125: Knowledge Tree Hardening** — updated_at por JSON, test de sincronización tools↔knowledge, template para nuevas áreas, validación de sources reales (completed 2026-04-08)
- [x] **Phase 126: CatBot Knowledge Protocol** — CatBot consciente de su sistema de conocimiento, gap detection con log persistente, instrucciones de cuándo usar cada herramienta de knowledge (completed 2026-04-08)
- [x] **Phase 127: Knowledge Admin Dashboard** — Panel en Settings para revisar staging entries, validar/rechazar, ver gaps reportados, métricas de uso (completed 2026-04-09)

## Phase Details

### Phase 125: Knowledge Tree Hardening
**Goal**: El knowledge tree es auto-validable, trazable y extensible sin errores silenciosos
**Depends on**: Nothing (pure improvements to existing infrastructure)
**Requirements**: KTREE-01, KTREE-02, KTREE-03, KTREE-04, KTREE-05
**Success Criteria** (what must be TRUE):
  1. Cada knowledge JSON tiene un campo updated_at que se actualiza cuando el archivo cambia, y _index.json refleja la fecha del ultimo cambio global
  2. Un test automatizado verifica que todos los tools registrados en catbot-tools.ts TOOLS array aparecen en al menos un knowledge JSON tools[], y viceversa
  3. Un test automatizado verifica que todos los paths en sources[] de cada JSON existen como archivos reales en el proyecto
  4. Existe un template JSON documentado (app/data/knowledge/_template.json) con instrucciones para crear nuevas áreas de conocimiento
  5. El schema zod incluye updated_at como campo obligatorio y los tests fallan si falta
**Plans:** 2/2 plans complete
Plans:
- [ ] 125-01-PLAN.md — Schema updated_at + template JSON + index update
- [ ] 125-02-PLAN.md — Bidirectional tool sync test + source existence test + data cleanup

### Phase 126: CatBot Knowledge Protocol
**Goal**: CatBot sabe que tiene un sistema de conocimiento, lo usa estratégicamente, y reporta gaps automáticamente
**Depends on**: Phase 125 (knowledge tree must be valid first)
**Requirements**: KPROTO-01, KPROTO-02, KPROTO-03, KPROTO-04, KPROTO-05
**Success Criteria** (what must be TRUE):
  1. El PromptAssembler incluye una sección P1 "Protocolo de Conocimiento" que instruye a CatBot sobre cuándo usar query_knowledge, search_documentation, save_learned_entry, y cuándo reportar gaps
  2. CatBot tiene un tool log_knowledge_gap que registra en catbot.db cuando no puede responder algo (knowledge_path estimado, query que falló, contexto)
  3. Existe una tabla knowledge_gaps en catbot.db con campos: id, knowledge_path, query, context, reported_at, resolved (boolean), resolved_at
  4. Cuando query_knowledge devuelve 0 resultados Y el LLM tampoco tiene respuesta, CatBot automáticamente llama a log_knowledge_gap antes de responder al usuario
  5. El reasoning protocol referencia el protocolo de conocimiento: antes de clasificar como COMPLEJO, CatBot debe consultar knowledge primero
**Plans:** 2/2 plans complete
Plans:
- [ ] 126-01-PLAN.md — knowledge_gaps table + CRUD + log_knowledge_gap tool
- [ ] 126-02-PLAN.md — Knowledge Protocol P1 section + reasoning protocol update

### Phase 127: Knowledge Admin Dashboard
**Goal**: Los administradores tienen visibilidad completa sobre el estado del conocimiento de CatBot y pueden curarlo
**Depends on**: Phase 126 (gaps must be logged to display them)
**Requirements**: KADMIN-01, KADMIN-02, KADMIN-03, KADMIN-04
**Success Criteria** (what must be TRUE):
  1. En Settings existe una sección "Conocimiento de CatBot" con 3 tabs: Learned Entries, Knowledge Gaps, Knowledge Tree
  2. Tab Learned Entries muestra entries en staging con botones validar/rechazar, entries validadas, y métricas (total, staging, validated, access_count promedio)
  3. Tab Knowledge Gaps muestra gaps reportados con filtro por área y estado (pendiente/resuelto), con botón para marcar como resuelto
  4. Tab Knowledge Tree muestra las 7 áreas con updated_at, conteo de tools/concepts/howto por área, y un indicador visual de completitud
**Plans:** 2/2 plans complete
Plans:
- [ ] 127-01-PLAN.md — Backend: API routes (entries, gaps, stats, tree) + getKnowledgeStats + i18n keys
- [ ] 127-02-PLAN.md — Frontend: Shell + 3 tab components + Settings integration + knowledge tree update

---

## v26.0 -- CatBot Intelligence Engine (completed 2026-04-08)

**Goal:** Transformar CatBot de un asistente con prompt hardcodeado a un cerebro inteligente con memoria persistente, conocimiento estructurado en JSON, perfiles de usuario, razonamiento adaptativo y auto-aprendizaje. El usuario experimenta un CatBot que recuerda, aprende y mejora con cada interaccion.

## Phases

- [x] **Phase 118: Foundation -- catbot.db + Knowledge Tree** - Base de datos independiente para inteligencia de CatBot y knowledge tree JSON que reemplaza el contenido hardcodeado (completed 2026-04-08)
- [x] **Phase 119: PromptAssembler** - Ensamblaje dinamico de system prompt desde knowledge tree + config + perfil, reemplazando buildSystemPrompt() hardcodeado (completed 2026-04-08)
- [x] **Phase 120: Config CatBot UI** - UI expandida en Settings para instrucciones primarias/secundarias, personalidad custom y permisos editables (completed 2026-04-08)
- [x] **Phase 121: User Profiles + Reasoning Protocol** - Perfiles auto-creados por canal con directivas iniciales, y protocolo de razonamiento que clasifica complejidad de peticiones (completed 2026-04-08)
- [x] **Phase 122: User Memory (Capa 0)** - Recipes de workflows exitosos con matching por keywords y fast-path que salta el razonamiento complejo (completed 2026-04-08)
- [x] **Phase 123: Summaries** - Compresion automatica de conversaciones en resumenes diarios, semanales y mensuales via scheduler (completed 2026-04-08)
- [x] **Phase 124: Auto-enrichment + Admin Protection** - CatBot aprende de interacciones exitosas con staging de validacion, y proteccion de datos entre usuarios (completed 2026-04-08)

## Phase Details

### Phase 118: Foundation -- catbot.db + Knowledge Tree
**Goal**: CatBot tiene su propia base de datos y un arbol de conocimiento estructurado que reemplaza todo el contenido hardcodeado
**Depends on**: Nothing (pure additions, no existing code changes)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07
**Success Criteria** (what must be TRUE):
  1. catbot.db existe en app/data/ con las 5 tablas (user_profiles, user_memory, conversation_log, summaries, knowledge_learned) y catbot-db.ts expone CRUD funcional
  2. Los archivos JSON en app/data/knowledge/ cubren toda la plataforma (catboard, catbrains, catpaw, catflow, canvas, catpower, settings) con schema validado y _index.json
  3. Las conversaciones de CatBot se persisten en conversation_log de catbot.db y ya no dependen de localStorage del browser
  4. Si el usuario tenia historial en localStorage, se importa automaticamente a catbot.db una vez y se limpia del browser
  5. El contenido de FEATURE_KNOWLEDGE y las secciones hardcodeadas del system prompt estan migradas a los JSON del knowledge tree
**Plans:** 3/3 plans complete
Plans:
- [ ] 118-01-PLAN.md — catbot.db schema + catbot-db.ts CRUD module
- [ ] 118-02-PLAN.md — Knowledge tree JSON files + loader con zod
- [ ] 118-03-PLAN.md — Conversation persistence API + localStorage migration

### Phase 119: PromptAssembler
**Goal**: El system prompt de CatBot se ensambla dinamicamente desde knowledge tree + config + contexto de pagina, con presupuesto de tokens
**Depends on**: Phase 118
**Requirements**: PROMPT-01, PROMPT-02, PROMPT-03, PROMPT-04, PROMPT-05
**Success Criteria** (what must be TRUE):
  1. PromptAssembler.build() reemplaza completamente buildSystemPrompt() en route.ts -- el prompt ya no tiene texto hardcodeado
  2. El prompt cargado cambia segun la pagina actual del usuario (ej: en /catflow se inyecta catflow.json, en /settings se inyecta settings.json)
  3. Si el prompt ensamblado excede el presupuesto de tokens del modelo, las secciones de menor prioridad se truncan automaticamente
  4. CatBot puede usar el tool query_knowledge para consultar el knowledge tree por path y fulltext cuando necesita informacion no inyectada en el prompt
  5. Los sources en cada JSON del knowledge tree apuntan a los docs en .planning/ para que CatBot pueda profundizar con search_documentation
**Plans:** 2/2 plans complete
Plans:
- [ ] 119-01-PLAN.md — PromptAssembler module (TDD) + route.ts integration
- [ ] 119-02-PLAN.md — query_knowledge tool + sources population

### Phase 120: Config CatBot UI
**Goal**: El usuario configura instrucciones, personalidad y permisos de CatBot desde una UI expandida en Settings
**Depends on**: Phase 119 (config feeds PromptAssembler)
**Requirements**: CONFIG-01, CONFIG-02, CONFIG-03, CONFIG-04
**Success Criteria** (what must be TRUE):
  1. En Settings > CatBot el usuario puede escribir instrucciones primarias (texto libre, siempre inyectadas en el prompt) e instrucciones secundarias (contexto adicional de menor prioridad)
  2. La personalidad tiene un campo de texto libre ademas del dropdown (friendly/technical/minimal) y el texto custom se refleja en el comportamiento de CatBot
  3. Los permisos de acciones normales y sudo se muestran como checkboxes agrupadas editables, y los cambios surten efecto inmediato en la siguiente conversacion
  4. Toda la config ampliada se persiste en catbot_config de la settings table y se lee en cada conversacion via PromptAssembler
**Plans:** 2/2 plans complete
Plans:
- [ ] 120-01-PLAN.md — Backend wiring: PromptAssembler inyecta instrucciones + personality_custom + route.ts type fix
- [ ] 120-02-PLAN.md — UI expansion: textareas, personality custom, checkboxes agrupadas + i18n

### Phase 121: User Profiles + Reasoning Protocol
**Goal**: CatBot conoce a cada usuario por canal, acumula contexto sobre sus preferencias, y adapta la profundidad de su razonamiento segun la complejidad de cada peticion
**Depends on**: Phase 118 (catbot.db), Phase 119 (PromptAssembler inyecta perfil)
**Requirements**: PROFILE-01, PROFILE-02, PROFILE-03, PROFILE-04, PROFILE-05, REASON-01, REASON-02, REASON-03, REASON-04, REASON-05
**Success Criteria** (what must be TRUE):
  1. La primera vez que un usuario interactua con CatBot (web o Telegram), se crea automaticamente un user_profile en catbot.db con user_id consistente ("web:default", "telegram:{chat_id}")
  2. El perfil incluye display_name, channel, personality_notes, communication_style, preferred_format, known_context y initial_directives -- y las directives se inyectan al inicio de cada conversacion
  3. Al final de cada conversacion, CatBot actualiza automaticamente el perfil si detecto preferencias nuevas (extraido de patrones de tool calls, no de LLM call)
  4. CatBot clasifica cada peticion en simple/medio/complejo y actua acorde: simple = ejecuta directo, medio = propone y confirma, complejo = razona + pregunta + propone paso a paso
  5. Si hay una recipe en Capa 0 que matchea, el protocolo de razonamiento se salta y se ejecuta la recipe directamente
**Plans:** 3/3 plans complete
Plans:
- [ ] 121-01-PLAN.md — UserProfileService + PromptAssembler (profile section + reasoning protocol)
- [ ] 121-02-PLAN.md — route.ts integration + Telegram bot user_id fix
- [ ] 121-03-PLAN.md — CatBot tools (get/update profile) + knowledge tree

### Phase 122: User Memory (Capa 0)
**Goal**: CatBot recuerda workflows exitosos y los reutiliza como fast-path sin pasar por razonamiento complejo
**Depends on**: Phase 121 (profiles + reasoning protocol define when recipes bypass reasoning)
**Requirements**: MEMORY-01, MEMORY-02, MEMORY-03, MEMORY-04, MEMORY-05
**Success Criteria** (what must be TRUE):
  1. Cuando CatBot resuelve exitosamente una tarea compleja (2+ tool calls), guarda automaticamente una recipe en user_memory con trigger_patterns, steps y preferences
  2. Al inicio de cada interaccion, CatBot busca en user_memory si hay recipes que coincidan con el trigger del mensaje (matching por keywords)
  3. Si hay match en Capa 0, CatBot ejecuta la recipe directamente sin pasar por knowledge tree ni razonamiento complejo -- el usuario nota respuesta mas rapida
  4. success_count y last_used se actualizan en cada uso exitoso de una recipe
**Plans:** 2/2 plans complete
Plans:
- [x] 122-01-PLAN.md — MemoryService TDD + DB additions + PromptAssembler recipe injection
- [x] 122-02-PLAN.md — route.ts integration + CatBot tools (list_my_recipes, forget_recipe)

### Phase 123: Summaries
**Goal**: Las conversaciones se comprimen automaticamente en resumenes jerarquicos que preservan decisiones y contexto sin perder informacion critica
**Depends on**: Phase 118 (conversation_log must be populated)
**Requirements**: SUMMARY-01, SUMMARY-02, SUMMARY-03, SUMMARY-04, SUMMARY-05
**Success Criteria** (what must be TRUE):
  1. Un scheduler en instrumentation.ts genera resumenes diarios comprimiendo las conversaciones del dia anterior usando un modelo Libre tier (coste cero)
  2. Cada resumen diario incluye summary, topics, tools_used, decisions y pending como campos estructurados en catbot.db
  3. Los resumenes semanales se generan cada lunes y los mensuales el dia 1, comprimiendo los resumenes del periodo anterior
  4. Las decisions extraidas en los resumenes nunca se pierden en la compresion -- se acumulan en un campo dedicado a traves de todos los niveles de compresion
**Plans:** 2/2 plans complete
Plans:
- [ ] 123-01-PLAN.md — SummaryService TDD: DB helpers + compresion jerarquica (daily/weekly/monthly)
- [ ] 123-02-PLAN.md — Scheduler registration en instrumentation.ts + CatBot tools (list_my_summaries, get_summary)

### Phase 124: Auto-enrichment + Admin Protection
**Goal**: CatBot aprende de interacciones exitosas con validacion antes de inyectar en el prompt, y protege datos entre usuarios
**Depends on**: Phase 119 (query_knowledge includes learned entries), Phase 121 (user profiles for data isolation)
**Requirements**: LEARN-01, LEARN-02, LEARN-03, LEARN-04, ADMIN-01, ADMIN-02, ADMIN-03
**Success Criteria** (what must be TRUE):
  1. Cuando CatBot resuelve un problema con el usuario, puede escribir un learned_entry en knowledge_learned con knowledge_path, category (best_practice/pitfall/troubleshoot), content y learned_from
  2. Los learned_entries pasan por staging -- no se inyectan en el prompt hasta ser validados por uso repetido o confirmacion admin
  3. El tool query_knowledge incluye learned_entries validadas junto con el knowledge tree estatico
  4. CatBot nunca revela datos de un usuario a otro usuario, y las operaciones sensibles (ver perfiles ajenos, borrar datos, exportar) requieren sudo activo con confirmacion explicita
**Plans:** 3/3 plans complete
Plans:
- [ ] 124-01-PLAN.md — LearnedEntryService TDD + save_learned_entry tool + DB helpers
- [ ] 124-02-PLAN.md — query_knowledge extension con learned entries + user-scoped tool enforcement
- [ ] 124-03-PLAN.md — Admin sudo tools + safe delete confirmation

---

### Dependencies

```
118 (Foundation: catbot.db + Knowledge Tree)
    |
    v
119 (PromptAssembler)
    |
    +------+------+
    |      |      |
    v      v      |
  120    121      | 2/2 | Complete    | 2026-04-08 |      |
           v      |
         122      | 1/2 | Complete    | 2026-04-08 |
118 ------------> 123 (Summaries)
                  | 3/3 | Complete    | 2026-04-08 | Status | Completed |
|-------|----------------|--------|-----------|
| 118. Foundation: catbot.db + Knowledge Tree | 0/3 | Planned | - |
| 119. PromptAssembler | 2/2 | Complete    | 2026-04-08 |
| 120. Config CatBot UI | 0/2 | Planned | - |
| 121. User Profiles + Reasoning Protocol | 3/3 | Complete    | 2026-04-08 |
| 122. User Memory (Capa 0) | 2/2 | Complete | 2026-04-08 |
| 123. Summaries | 2/2 | Complete    | 2026-04-08 |
| 124. Auto-enrichment + Admin Protection | 3/3 | Complete    | 2026-04-08 |

### Phase 128: Sistema de Alertas + Memoria de Conversación CatBot
**Goal**: El sistema detecta y muestra alertas consolidadas en un popup obligatorio, CatBot mantiene contexto completo en web (10 mensajes recientes + 30 compactados) y Telegram, y sudo no rompe el hilo de conversación
**Depends on**: Phase 127 (alertas necesitan knowledge gaps y dashboard)
**Requirements**: ALERTS-01, ALERTS-02, CONVMEM-01, CONVMEM-02, CONVMEM-03
**Success Criteria** (what must be TRUE):
  1. Al cargar el dashboard, si hay alertas pendientes aparece un AlertDialog con log agrupado por categoría (Conocimiento, Ejecuciones, Integraciones, Notificaciones) que requiere click en Entendido
  2. El servicio de alertas corre cada 5min y detecta: knowledge_gaps>20, learned_entries staging>30, tasks stuck>1h, canvas_runs huérfanos>2h, conector fallando>3x/hora, drive sync desfasado>2x intervalo, notificaciones unread>50
  3. CatBot en web mantiene los últimos 10 mensajes completos y compacta hasta 30 mensajes anteriores como contexto resumido al enviar al LLM
  4. Cuando el usuario introduce sudo en el chat, CatBot no pierde el contexto de la conversación anterior
  5. CatBot en Telegram mantiene contexto equivalente al web (10 recientes + compactados) usando el mismo mecanismo de memoria
**Plans:** 3/3 plans complete

Plans:
- [ ] 128-01-PLAN.md — Servicio de alertas internas + API + AlertDialog consolidado
- [ ] 128-02-PLAN.md — Memoria de conversación CatBot web (10 recientes + 30 compactados, sudo preserva contexto)
- [ ] 128-03-PLAN.md — Memoria de conversación CatBot Telegram (mismo mecanismo que web)

### Phase 129: Intent Queue — promesas persistentes de CatBot
**Goal**: CatBot persiste cada petición del usuario como un intent first-class, la divide en steps si es compleja, reintenta automáticamente si falla, y el usuario puede consultar en cualquier momento el estado de sus peticiones
**Depends on**: Phase 128 (alertas y memoria ya disponibles para integración)
**Requirements**: INTENT-01, INTENT-02, INTENT-03, INTENT-04, INTENT-05, INTENT-06
**Success Criteria** (what must be TRUE):
  1. Existe tabla intents en catbot.db con campos: id, user_id, channel, original_request, parsed_goal, steps, current_step, status, attempts, last_error, result, created_at, updated_at, completed_at
  2. PromptAssembler inyecta sección "Protocolo de Intents": antes de ejecutar tools multi-paso o acciones significativas, CatBot crea un intent con create_intent, lo ejecuta, y marca el estado al terminar
  3. CatBot tiene tools create_intent, update_intent_status, list_my_intents (always_allowed), retry_intent, abandon_intent
  4. Un IntentWorker corre cada 5 minutos y reintenta intents en estado 'failed' hasta 3 veces antes de marcarlos 'abandoned'
  5. Cuando un intent falla (status='failed' con last_error), CatBot también llama log_knowledge_gap si el error sugiere knowledge faltante (integración Phase 126)
  6. Cuando hay >5 intents en 'failed' o 'abandoned' sin resolver, aparece como alerta en el AlertDialog del dashboard (integración Phase 128)
**Plans:** 3/3 plans complete

Plans:
- [ ] 129-01-PLAN.md — Schema intents + CRUD + 5 tools de CatBot
- [ ] 129-02-PLAN.md — IntentWorker (reintentos) + integración en PromptAssembler
- [ ] 129-03-PLAN.md — Integración con AlertService (Phase 128) y knowledge_gaps (Phase 126)

### Phase 130: Async CatFlow Pipeline — creación asistida de workflows
**Goal**: Cuando CatBot detecta una petición que requiere más de 60s, propone crear un CatFlow asistido: planifica objetivo, despieza en tareas, diseña el canvas reutilizando recursos existentes (o creando CatPaws nuevos si hacen falta), notifica al usuario con la propuesta, y tras aprobación ejecuta el canvas asíncronamente sin bloquear el chat
**Depends on**: Phase 129 (intents persistentes) + Phase 128 (alertas) + Phase 127 (dashboard)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06, PIPE-07, PIPE-08
**Success Criteria** (what must be TRUE):
  1. Existe tabla intent_jobs en catbot.db con campos id, intent_id, user_id, channel, channel_ref, pipeline_phase, tool_name, tool_args, canvas_id, status, progress_message, result, error, timestamps
  2. CatBot detecta peticiones complejas (heurística: tool marcada async o estimated_duration_ms > 60000) y antes de ejecutar pregunta al usuario si quiere que prepare un CatFlow
  3. Al confirmar, CatBot ejecuta internamente un pipeline de 3 fases con system prompts especializados (estratega → despiezador → arquitecto de canvas) usando el mismo LLM sin agentes separados
  4. El Arquitecto de Canvas consulta list_catbrains, list_cat_paws, list_skills, list_connectors — si no encuentra un CatPaw adecuado, pregunta al usuario si puede crear uno específico, y si acepta lo crea antes de seguir
  5. Al terminar el diseño, se crea un canvas con flow_data válido y se envía al usuario una propuesta con objetivo + pasos + recursos + botón "Ejecutar/Cancelar" (dashboard + Telegram)
  6. Si el usuario aprueba, el canvas se ejecuta via /api/canvas/{id}/execute en background — al completar se notifica el resultado por el canal original
  7. Después de la ejecución, CatBot pregunta: mantener como plantilla / guardar como recipe (Phase 122) / eliminar
  8. El estado del pipeline es visible en tiempo real: progress_message se actualiza en cada fase y aparece en dashboard + notificaciones Telegram
**Plans:** 5/5 plans complete

Plans:
- [ ] 130-01-PLAN.md — Schema intent_jobs + CRUD + flag async en TOOLS[] + tool queue_intent_job
- [ ] 130-02-PLAN.md — Pipeline Orchestrator con 3 system prompts especializados + persistencia de fases + detección de complejidad en prompt
- [ ] 130-03-PLAN.md — Canvas Flow Designer: mapeo de tareas a flow_data + scan recursos + creación CatPaw on-the-fly con confirmación
- [ ] 130-04-PLAN.md — Notificaciones cross-channel (dashboard + Telegram) + approval flow + execution async
- [ ] 130-05-PLAN.md — Lifecycle post-ejecución (mantener/recipe/eliminar) + integración AlertService + CatBot-as-oracle E2E test

### Phase 131: Complexity Assessment — CatBot razona antes de ejecutar
**Goal**: CatBot evalúa la complejidad de cada petición ANTES de ejecutar tools usando casuísticas explícitas del proyecto. Si detecta tarea compleja (>60s estimados o >3 sub-operaciones) pregunta al usuario si prepara un CatFlow asíncrono. Se reporta progreso cada 60s. Cada decisión se audita en complexity_decisions.
**Depends on**: Phase 130 (pipeline async) + Phase 128 (alertas)
**Requirements**: QA-01, QA-02, QA-03, QA-04, QA-05, QA-06, QA-07
**Success Criteria** (what must be TRUE):
  1. Existe tabla complexity_decisions en catbot.db con campos id, user_id, channel, message_snippet, classification (simple/complex/ambiguous), reason, estimated_duration_s, async_path_taken (bool), outcome (completed/queued/timeout/cancelled), created_at
  2. PromptAssembler inyecta sección P0 "Protocolo de Evaluación de Complejidad" con casuísticas del proyecto (ejemplos concretos complex/simple) + regla dura: si clasifica como complex, preguntar al usuario antes de ejecutar tools
  3. CatBot antepone [COMPLEXITY:simple|complex|ambiguous] [REASON:...] [EST:Ns] en cada respuesta — parseado desde /api/catbot/chat/route.ts y persistido
  4. Si classification=complex, CatBot responde preguntando "Esta tarea es compleja y puede requerir ~Nmin. ¿Preparo un CatFlow asíncrono que se ejecute en segundo plano con reportes cada 60s?" y NO ejecuta tools directamente
  5. queue_intent_job acepta ahora un campo description libre (no requiere tool_name específica) — el estratega de Phase 130 decide las tools internas
  6. Self-check durante tool loop: si CatBot ha hecho >3 tool calls y detecta trabajo pendiente, detiene el loop, llama queue_intent_job con el resto, y avisa al usuario
  7. IntentJobExecutor de Phase 130 reporta progreso cada 60s al canal original (Telegram sendMessage o dashboard notification) mientras el pipeline está running — mensaje informativo con pipeline_phase actual
  8. AlertService.checkClassificationTimeouts detecta patrones: >5 timeouts/día en requests con classification=complex que NO tomaron async_path — alerta para ajustar casuísticas
**Plans:** 1/4 plans executed

Plans:
- [ ] 131-01-PLAN.md — Schema complexity_decisions + CRUD + sección P0 en PromptAssembler con casuísticas del proyecto
- [ ] 131-02-PLAN.md — Parser de [COMPLEXITY:*] en route.ts + persistencia + gate que bloquea tool loop si complex + queue_intent_job con description libre
- [ ] 131-03-PLAN.md — Self-check en tool loop (>3 iteraciones) + progress reporter cada 60s en IntentJobExecutor (extensión Phase 130)
- [ ] 131-04-PLAN.md — AlertService checkClassificationTimeouts + CatBot-as-oracle reproduciendo el caso real del usuario (Holded Q1 comparison)

---
*Created: 2026-04-08*
*Last updated: 2026-04-08*
