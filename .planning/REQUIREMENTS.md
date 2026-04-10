# Requirements: DoCatFlow

**Defined:** 2026-04-08
**Core Value:** CatBot como cerebro inteligente de DoCatFlow con memoria persistente, conocimiento estructurado y razonamiento adaptativo

## v26.0 Requirements

Requirements for CatBot Intelligence Engine. Each maps to roadmap phases.

### Infraestructura (INFRA)

- [x] **INFRA-01**: catbot.db existe como base de datos SQLite independiente con tablas: user_profiles, user_memory, conversation_log, summaries, knowledge_learned
- [x] **INFRA-02**: El servicio catbot-db.ts expone funciones CRUD para todas las tablas de catbot.db siguiendo el patrón de db.ts existente
- [x] **INFRA-03**: Knowledge tree JSON files existen en app/data/knowledge/ con un archivo por área de la plataforma (catboard, catbrains, catpaw, catflow, canvas, catpower, settings) más _index.json
- [x] **INFRA-04**: Cada JSON del knowledge tree sigue el schema definido: id, name, path, description, endpoints, tools, concepts, howto, dont, common_errors, success_cases, sources
- [x] **INFRA-05**: El seed inicial cubre toda la plataforma migrando el contenido de FEATURE_KNOWLEDGE y el system prompt hardcodeado a JSONs estructurados
- [x] **INFRA-06**: Las conversaciones de CatBot se persisten en conversation_log de catbot.db en vez de localStorage del browser
- [x] **INFRA-07**: La migración de localStorage a DB es transparente — si hay historial en localStorage se importa una vez y se elimina

### Prompt Dinámico (PROMPT)

- [x] **PROMPT-01**: PromptAssembler reemplaza el buildSystemPrompt() hardcodeado de route.ts con ensamblaje modular desde knowledge tree + perfil usuario + config
- [x] **PROMPT-02**: El prompt se compone dinámicamente según la página actual del usuario, cargando el JSON relevante del knowledge tree
- [x] **PROMPT-03**: El PromptAssembler tiene un presupuesto de tokens y trunca secciones de menor prioridad si excede el límite del modelo
- [x] **PROMPT-04**: El tool query_knowledge permite a CatBot consultar el knowledge tree por path y fulltext cuando necesita información no inyectada en el prompt
- [x] **PROMPT-05**: Los sources en cada JSON del knowledge tree apuntan a los 80+ docs existentes en .planning/ para que CatBot pueda profundizar con search_documentation

### Config CatBot (CONFIG)

- [x] **CONFIG-01**: La UI de CatBot en Settings tiene campos editables para instrucciones primarias (texto libre, siempre inyectadas) e instrucciones secundarias (contexto adicional)
- [x] **CONFIG-02**: La personalidad tiene un campo de texto libre además del dropdown (friendly/technical/minimal) para personalización custom
- [x] **CONFIG-03**: Los permisos de acciones normales y sudo son editables como checkboxes agrupadas en la UI
- [x] **CONFIG-04**: La config ampliada se persiste en catbot_config (settings table) y se lee en cada conversación

### Perfiles de Usuario (PROFILE)

- [x] **PROFILE-01**: CatBot crea un user_profile en catbot.db la primera vez que interactúa con un usuario (web o Telegram)
- [x] **PROFILE-02**: El perfil incluye: display_name, channel, personality_notes, communication_style, preferred_format, known_context (JSON), initial_directives
- [x] **PROFILE-03**: Las initial_directives son un párrafo auto-generado que CatBot inyecta al inicio de cada conversación describiendo quién es el usuario y cómo prefiere trabajar
- [x] **PROFILE-04**: CatBot actualiza automáticamente el perfil al final de cada conversación si detectó preferencias nuevas o cambios de contexto
- [x] **PROFILE-05**: El user_id usa formato consistente: "web:default" para web, "telegram:{chat_id}" para Telegram

### Memoria de Usuario (MEMORY)

- [x] **MEMORY-01**: CatBot guarda recipes (workflows aprendidos) en user_memory de catbot.db cuando resuelve exitosamente una tarea compleja
- [x] **MEMORY-02**: Cada recipe tiene: trigger_patterns (keywords/frases para matching), steps (secuencia de acciones), preferences (formato, tono, recursos preferidos)
- [x] **MEMORY-03**: Al inicio de cada interacción, CatBot busca en user_memory si hay recipes que coincidan con el trigger del mensaje (Capa 0)
- [x] **MEMORY-04**: Si hay match en Capa 0, CatBot ejecuta la recipe directamente sin pasar por knowledge tree ni razonamiento complejo
- [x] **MEMORY-05**: success_count y last_used se actualizan en cada uso exitoso de una recipe

### Resúmenes (SUMMARY)

- [x] **SUMMARY-01**: Un scheduler en instrumentation.ts genera resúmenes diarios comprimiendo las conversaciones del día anterior
- [x] **SUMMARY-02**: Cada resumen diario incluye: summary (texto), topics (JSON), tools_used (JSON), decisions (JSON), pending (JSON)
- [x] **SUMMARY-03**: Los resúmenes semanales se generan cada lunes comprimiendo los 7 resúmenes diarios
- [x] **SUMMARY-04**: Los resúmenes mensuales se generan el día 1 comprimiendo los resúmenes semanales del mes anterior
- [x] **SUMMARY-05**: Las decisions extraídas en los resúmenes nunca se pierden en la compresión — se acumulan en un campo dedicado

### Protocolo de Razonamiento (REASON)

- [x] **REASON-01**: CatBot clasifica cada petición en un nivel de complejidad: simple, medio o complejo
- [x] **REASON-02**: Nivel simple (listar, consultar, navegar) → ejecutar directamente sin preguntas
- [x] **REASON-03**: Nivel medio (crear, modificar, configurar) → proponer configuración, confirmar con usuario, ejecutar
- [x] **REASON-04**: Nivel complejo (diseñar pipeline, arquitectura multi-agente, resolver problema) → razonar → preguntar detalles → analizar inventario → proponer solución → confirmar → ejecutar paso a paso
- [x] **REASON-05**: Si hay recipe en Capa 0, el nivel de razonamiento se salta y se ejecuta directamente la recipe

### Auto-enriquecimiento (LEARN)

- [x] **LEARN-01**: Cuando CatBot resuelve un problema con el usuario, puede escribir un learned_entry en knowledge_learned de catbot.db
- [x] **LEARN-02**: Cada learned_entry tiene: knowledge_path (a qué sección pertenece), category (best_practice/pitfall/troubleshoot), content, learned_from (usage/development)
- [x] **LEARN-03**: Los learned_entries pasan por una staging table — no se inyectan en el prompt hasta ser validados (por uso repetido o por confirmación admin)
- [x] **LEARN-04**: El tool query_knowledge incluye learned_entries validadas junto con el knowledge tree estático

### Protección Admin (ADMIN)

- [x] **ADMIN-01**: CatBot nunca revela datos de un usuario a otro usuario
- [x] **ADMIN-02**: Solo con sudo activo el usuario puede: ver perfiles de otros, borrar datos de usuario, exportar datos
- [x] **ADMIN-03**: El borrado de datos de usuario requiere confirmación explícita (mismo patrón que safe delete de Holded)

## v26.1 Requirements

Requirements for Knowledge System Hardening. Each maps to roadmap phases 125-127.

### Knowledge Tree (KTREE)

- [x] **KTREE-01**: Cada knowledge JSON tiene un campo updated_at (ISO date) que refleja cuando fue editado por ultima vez, validado por zod como obligatorio
- [x] **KTREE-02**: Test automatizado que verifica que todo tool en TOOLS[] de catbot-tools.ts aparece en al menos un knowledge JSON tools[], y todo tool en JSONs existe en TOOLS[]
- [x] **KTREE-03**: Test automatizado que verifica que todo path en sources[] de cada knowledge JSON existe como archivo real en el proyecto
- [x] **KTREE-04**: Existe _template.json con schema documentado e instrucciones paso a paso para crear nuevas areas de conocimiento
- [x] **KTREE-05**: El _index.json tiene un campo areas[].updated_at sincronizado con el updated_at de cada JSON individual

### Protocolo de Conocimiento (KPROTO)

- [x] **KPROTO-01**: PromptAssembler inyecta seccion P1 "Protocolo de Conocimiento" con instrucciones de cuando usar cada tool de knowledge (query_knowledge, search_documentation, save_learned_entry, log_knowledge_gap)
- [x] **KPROTO-02**: Existe un tool log_knowledge_gap que registra en catbot.db cuando CatBot no puede responder (knowledge_path estimado, query fallida, contexto)
- [x] **KPROTO-03**: Tabla knowledge_gaps en catbot.db con campos: id, knowledge_path, query, context, reported_at, resolved, resolved_at
- [x] **KPROTO-04**: Cuando query_knowledge devuelve 0 resultados, CatBot llama automaticamente a log_knowledge_gap (instruccion en prompt, no codigo)
- [x] **KPROTO-05**: El reasoning protocol referencia el protocolo de conocimiento: antes de COMPLEJO, consultar knowledge tree primero

### Admin Dashboard (KADMIN)

- [x] **KADMIN-01**: En Settings existe seccion "Conocimiento de CatBot" con tabs: Learned Entries, Knowledge Gaps, Knowledge Tree
- [x] **KADMIN-02**: Tab Learned Entries muestra entries staging con botones validar/rechazar, entries validadas, metricas (total, staging, validated, avg access_count)
- [x] **KADMIN-03**: Tab Knowledge Gaps muestra gaps reportados con filtros por area/estado, boton marcar resuelto
- [x] **KADMIN-04**: Tab Knowledge Tree muestra las 7 areas con updated_at, conteos (tools, concepts, howto) por area, indicador visual de completitud

### Sistema de Alertas (ALERTS)

- [x] **ALERTS-01**: Al cargar el dashboard, si hay alertas pendientes aparece un AlertDialog consolidado con log agrupado por categoria (Conocimiento, Ejecuciones, Integraciones, Notificaciones) que requiere click en "Entendido"
- [x] **ALERTS-02**: Servicio de alertas corre cada 5min detectando: knowledge_gaps>20, staging entries>30, tasks stuck>1h, canvas_runs huerfanos>2h, conector fallando>3x/hora, drive sync desfasado>2x intervalo, notificaciones unread>50

### Memoria de Conversación CatBot (CONVMEM)

- [x] **CONVMEM-01**: CatBot en web mantiene los ultimos 10 mensajes completos y compacta hasta 30 mensajes anteriores como contexto resumido al enviar al LLM
- [x] **CONVMEM-02**: Cuando el usuario introduce sudo en el chat, CatBot no pierde el contexto de la conversacion anterior (hilo preservado)
- [x] **CONVMEM-03**: CatBot en Telegram mantiene contexto equivalente al web (10 recientes + compactados) usando el mismo mecanismo de memoria

### Intent Queue (INTENT)

- [x] **INTENT-01**: Tabla intents en catbot.db con campos id, user_id, channel, original_request, parsed_goal, steps, current_step, status, attempts, last_error, result, timestamps — expuesta via CRUD en catbot-db.ts
- [x] **INTENT-02**: PromptAssembler inyecta seccion "Protocolo de Intents" que instruye a CatBot a crear un intent antes de ejecutar acciones multi-paso y actualizarlo al terminar
- [x] **INTENT-03**: CatBot tiene 5 tools: create_intent, update_intent_status, list_my_intents (always_allowed), retry_intent, abandon_intent — registradas en knowledge tree
- [x] **INTENT-04**: IntentWorker singleton corre cada 5 minutos, reintenta intents 'failed' hasta 3 veces, marca como 'abandoned' tras superar el limite — registrado en instrumentation.ts
- [x] **INTENT-05**: Cuando un intent termina en 'failed' con last_error que sugiere knowledge faltante, CatBot llama log_knowledge_gap automaticamente (integracion Phase 126)
- [x] **INTENT-06**: AlertService detecta cuando hay >5 intents sin resolver y genera alerta 'intents_unresolved' en el AlertDialog del dashboard (integracion Phase 128)

### Async CatFlow Pipeline (PIPE)

- [x] **PIPE-01**: Tabla intent_jobs en catbot.db con campos id, intent_id, user_id, channel, channel_ref, pipeline_phase, tool_name, tool_args, canvas_id, status, progress_message, result, error, timestamps — expuesta via CRUD en catbot-db.ts
- [x] **PIPE-02**: CatBot detecta peticiones complejas via flag async o estimated_duration_ms > 60000 en TOOLS[] y pregunta confirmacion al usuario antes de disparar el pipeline (instruccion en PromptAssembler seccion P1)
- [x] **PIPE-03**: Pipeline Orchestrator ejecuta 3 fases secuenciales con system prompts especializados (estratega define objetivo, despiezador crea tareas, arquitecto mapea a canvas) usando el mismo LLM de CatBot sin agentes separados
- [x] **PIPE-04**: Canvas Flow Designer construye flow_data reusando recursos (CatBrains, CatPaws, skills, conectores) — si falta CatPaw especifico pregunta al usuario y lo crea antes de continuar
- [x] **PIPE-05**: Al completar diseño, envia propuesta al canal original (dashboard notification + Telegram message con botones) con objetivo, pasos, recursos, y opcion ejecutar/cancelar
- [x] **PIPE-06**: Tras aprobacion del usuario, ejecuta el canvas via /api/canvas/{id}/execute en background y notifica resultado final por el mismo canal
- [x] **PIPE-07**: Post-ejecucion CatBot pregunta si mantener como plantilla (is_template=1), guardar como recipe (Phase 122), o eliminar
- [x] **PIPE-08**: progress_message se actualiza en cada fase del pipeline y es consultable via list_my_jobs — visible en tiempo real en dashboard y via notificaciones opcionales en Telegram

### Complexity Assessment (QA)

- [x] **QA-01**: Tabla complexity_decisions en catbot.db con campos id, user_id, channel, message_snippet, classification (simple/complex/ambiguous), reason, estimated_duration_s, async_path_taken (bool), outcome, created_at — expuesta via CRUD en catbot-db.ts
- [x] **QA-02**: PromptAssembler inyecta seccion P0 "Protocolo de Evaluacion de Complejidad" con casuisticas del proyecto (ejemplos concretos) + regla dura de bloqueo si la peticion es compleja
- [x] **QA-03**: CatBot antepone [COMPLEXITY:simple|complex|ambiguous] [REASON:...] [EST:Ns] en cada respuesta, parseado en /api/catbot/chat/route.ts y persistido en complexity_decisions
- [x] **QA-04**: Si classification=complex, CatBot pregunta al usuario "Esta tarea es compleja y puede requerir ~Nmin. Preparo un CatFlow asincrono con reportes cada 60s?" y NO ejecuta tools directamente (gate en route.ts)
- [x] **QA-05**: queue_intent_job acepta campo description libre — ya no requiere tool_name especifica. El estratega de Phase 130 decide las tools internas.
- [ ] **QA-06**: Self-check durante tool loop: si CatBot ejecuta >3 tool calls y aun hay trabajo pendiente, detiene el loop, llama queue_intent_job con el resto, y avisa al usuario. IntentJobExecutor reporta progreso cada 60s al canal original mientras esta running.
- [ ] **QA-07**: AlertService.checkClassificationTimeouts detecta patrones de >5 timeouts/dia en requests con classification=complex que no tomaron el async path — alerta para ajustar casuisticas

---

## Futuro (v27+)

### Mejoras de Inteligencia
- **FUTURE-01**: Knowledge tree editable desde UI (editor visual de nodos)
- **FUTURE-02**: CatBot auto-valida learned_entries sin intervención admin (confidence score)
- **FUTURE-03**: Resúmenes cross-usuario para detectar patrones de uso de la plataforma
- **FUTURE-04**: Vector search sobre knowledge tree para matching semántico avanzado

## Out of Scope

| Feature | Reason |
|---------|--------|
| Knowledge tree editable por usuario final | Es infraestructura de desarrollo, invisible para el usuario |
| Vector embeddings para user memory | Keyword matching es suficiente para <100 recipes por usuario |
| WebSocket para conversación en tiempo real | Polling existente es suficiente |
| Multi-tenant con base de datos separada por tenant | Single-server, single-admin |
| Cron system externo | Usar TaskScheduler existente en instrumentation.ts |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 118 | Complete |
| INFRA-02 | Phase 118 | Complete |
| INFRA-03 | Phase 118 | Complete |
| INFRA-04 | Phase 118 | Complete |
| INFRA-05 | Phase 118 | Complete |
| INFRA-06 | Phase 118 | Complete |
| INFRA-07 | Phase 118 | Complete |
| PROMPT-01 | Phase 119 | Complete |
| PROMPT-02 | Phase 119 | Complete |
| PROMPT-03 | Phase 119 | Complete |
| PROMPT-04 | Phase 119 | Complete |
| PROMPT-05 | Phase 119 | Complete |
| CONFIG-01 | Phase 120 | Complete |
| CONFIG-02 | Phase 120 | Complete |
| CONFIG-03 | Phase 120 | Complete |
| CONFIG-04 | Phase 120 | Complete |
| PROFILE-01 | Phase 121 | Complete |
| PROFILE-02 | Phase 121 | Complete |
| PROFILE-03 | Phase 121 | Complete |
| PROFILE-04 | Phase 121 | Complete |
| PROFILE-05 | Phase 121 | Complete |
| REASON-01 | Phase 121 | Complete |
| REASON-02 | Phase 121 | Complete |
| REASON-03 | Phase 121 | Complete |
| REASON-04 | Phase 121 | Complete |
| REASON-05 | Phase 121 | Complete |
| MEMORY-01 | Phase 122 | Complete |
| MEMORY-02 | Phase 122 | Complete |
| MEMORY-03 | Phase 122 | Complete |
| MEMORY-04 | Phase 122 | Complete |
| MEMORY-05 | Phase 122 | Complete |
| SUMMARY-01 | Phase 123 | Complete |
| SUMMARY-02 | Phase 123 | Complete |
| SUMMARY-03 | Phase 123 | Complete |
| SUMMARY-04 | Phase 123 | Complete |
| SUMMARY-05 | Phase 123 | Complete |
| LEARN-01 | Phase 124 | Complete |
| LEARN-02 | Phase 124 | Complete |
| LEARN-03 | Phase 124 | Complete |
| LEARN-04 | Phase 124 | Complete |
| ADMIN-01 | Phase 124 | Complete |
| ADMIN-02 | Phase 124 | Complete |
| ADMIN-03 | Phase 124 | Complete |

| KTREE-01 | Phase 125 | Complete |
| KTREE-02 | Phase 125 | Complete |
| KTREE-03 | Phase 125 | Complete |
| KTREE-04 | Phase 125 | Complete |
| KTREE-05 | Phase 125 | Complete |
| KPROTO-01 | Phase 126 | Complete |
| KPROTO-02 | Phase 126 | Complete |
| KPROTO-03 | Phase 126 | Complete |
| KPROTO-04 | Phase 126 | Complete |
| KPROTO-05 | Phase 126 | Complete |
| KADMIN-01 | Phase 127 | Complete |
| KADMIN-02 | Phase 127 | Complete |
| KADMIN-03 | Phase 127 | Complete |
| KADMIN-04 | Phase 127 | Complete |

**Coverage:**
- v26.0 requirements: 41 total (all complete)
- v26.1 requirements: 14 total (all pending)
- Mapped to phases: 55
- Unmapped: 0

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-08 after roadmap creation (phases 118-124)*
