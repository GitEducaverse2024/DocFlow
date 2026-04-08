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

- [ ] **MEMORY-01**: CatBot guarda recipes (workflows aprendidos) en user_memory de catbot.db cuando resuelve exitosamente una tarea compleja
- [ ] **MEMORY-02**: Cada recipe tiene: trigger_patterns (keywords/frases para matching), steps (secuencia de acciones), preferences (formato, tono, recursos preferidos)
- [ ] **MEMORY-03**: Al inicio de cada interacción, CatBot busca en user_memory si hay recipes que coincidan con el trigger del mensaje (Capa 0)
- [ ] **MEMORY-04**: Si hay match en Capa 0, CatBot ejecuta la recipe directamente sin pasar por knowledge tree ni razonamiento complejo
- [ ] **MEMORY-05**: success_count y last_used se actualizan en cada uso exitoso de una recipe

### Resúmenes (SUMMARY)

- [ ] **SUMMARY-01**: Un scheduler en instrumentation.ts genera resúmenes diarios comprimiendo las conversaciones del día anterior
- [ ] **SUMMARY-02**: Cada resumen diario incluye: summary (texto), topics (JSON), tools_used (JSON), decisions (JSON), pending (JSON)
- [ ] **SUMMARY-03**: Los resúmenes semanales se generan cada lunes comprimiendo los 7 resúmenes diarios
- [ ] **SUMMARY-04**: Los resúmenes mensuales se generan el día 1 comprimiendo los resúmenes semanales del mes anterior
- [ ] **SUMMARY-05**: Las decisions extraídas en los resúmenes nunca se pierden en la compresión — se acumulan en un campo dedicado

### Protocolo de Razonamiento (REASON)

- [x] **REASON-01**: CatBot clasifica cada petición en un nivel de complejidad: simple, medio o complejo
- [x] **REASON-02**: Nivel simple (listar, consultar, navegar) → ejecutar directamente sin preguntas
- [x] **REASON-03**: Nivel medio (crear, modificar, configurar) → proponer configuración, confirmar con usuario, ejecutar
- [x] **REASON-04**: Nivel complejo (diseñar pipeline, arquitectura multi-agente, resolver problema) → razonar → preguntar detalles → analizar inventario → proponer solución → confirmar → ejecutar paso a paso
- [x] **REASON-05**: Si hay recipe en Capa 0, el nivel de razonamiento se salta y se ejecuta directamente la recipe

### Auto-enriquecimiento (LEARN)

- [ ] **LEARN-01**: Cuando CatBot resuelve un problema con el usuario, puede escribir un learned_entry en knowledge_learned de catbot.db
- [ ] **LEARN-02**: Cada learned_entry tiene: knowledge_path (a qué sección pertenece), category (best_practice/pitfall/troubleshoot), content, learned_from (usage/development)
- [ ] **LEARN-03**: Los learned_entries pasan por una staging table — no se inyectan en el prompt hasta ser validados (por uso repetido o por confirmación admin)
- [ ] **LEARN-04**: El tool query_knowledge incluye learned_entries validadas junto con el knowledge tree estático

### Protección Admin (ADMIN)

- [ ] **ADMIN-01**: CatBot nunca revela datos de un usuario a otro usuario
- [ ] **ADMIN-02**: Solo con sudo activo el usuario puede: ver perfiles de otros, borrar datos de usuario, exportar datos
- [ ] **ADMIN-03**: El borrado de datos de usuario requiere confirmación explícita (mismo patrón que safe delete de Holded)

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
| MEMORY-01 | Phase 122 | Pending |
| MEMORY-02 | Phase 122 | Pending |
| MEMORY-03 | Phase 122 | Pending |
| MEMORY-04 | Phase 122 | Pending |
| MEMORY-05 | Phase 122 | Pending |
| SUMMARY-01 | Phase 123 | Pending |
| SUMMARY-02 | Phase 123 | Pending |
| SUMMARY-03 | Phase 123 | Pending |
| SUMMARY-04 | Phase 123 | Pending |
| SUMMARY-05 | Phase 123 | Pending |
| LEARN-01 | Phase 124 | Pending |
| LEARN-02 | Phase 124 | Pending |
| LEARN-03 | Phase 124 | Pending |
| LEARN-04 | Phase 124 | Pending |
| ADMIN-01 | Phase 124 | Pending |
| ADMIN-02 | Phase 124 | Pending |
| ADMIN-03 | Phase 124 | Pending |

**Coverage:**
- v26.0 requirements: 41 total
- Mapped to phases: 41
- Unmapped: 0

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-08 after roadmap creation (phases 118-124)*
