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
- **v26.0 CatBot Intelligence Engine** -- Phases 118-124 (in progress)

---

## v26.0 -- CatBot Intelligence Engine

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
| 124. Auto-enrichment + Admin Protection | 3/3 | Complete   | 2026-04-08 |

---
*Created: 2026-04-08*
*Last updated: 2026-04-08*
