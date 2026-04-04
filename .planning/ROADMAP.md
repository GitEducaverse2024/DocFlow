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
- **v25.0 Model Intelligence Orchestration** -- Phases 107-112 (in progress)

---

## v25.0 -- Model Intelligence Orchestration

**Goal:** CatBot como cerebro orquestador del ecosistema LLM -- la plataforma sabe que modelos tiene, que hace cada uno mejor, y CatBot recomienda y enruta inteligentemente. Tres capas: Discovery (que hay disponible), MID (que hace cada uno mejor), Routing (el codigo habla de intenciones, no de modelos).

## Phases

- [ ] **Phase 107: LLM Discovery Engine** - Inventario real-time de modelos Ollama + API providers con cache y degradacion limpia
- [ ] **Phase 108: Model Intelligence Document (MID)** - Base de conocimiento de capacidades, tiers y mejor uso por modelo
- [ ] **Phase 109: Model Alias Routing System** - Reemplazar modelos hardcodeados por aliases de intencion con resolucion inteligente
- [ ] **Phase 110: CatBot como Orquestador de Modelos** - Tools para consultar, recomendar y cambiar modelos via CatBot
- [ ] **Phase 111: UI de Inteligencia de Modelos** - Seccion en Settings con inventario, MID cards, editor y tabla de routing
- [ ] **Phase 112: Integracion Gemma 4:31B + Cierre** - Validacion end-to-end de los 4 escenarios con modelo real

## Phase Details

### Phase 107: LLM Discovery Engine
**Goal**: La plataforma conoce en todo momento que modelos LLM estan disponibles y operativos
**Depends on**: Nothing (first phase)
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06, DISC-07, DISC-08
**Success Criteria** (what must be TRUE):
  1. El usuario puede ver una lista actualizada de todos los modelos Ollama instalados y modelos de API providers activos
  2. CatBot puede consultar el inventario de modelos y recibir datos estructurados para inyectar en contexto
  3. Si Ollama o un provider esta caido, la app sigue funcionando y el inventario muestra solo lo disponible
  4. El inventario se refresca automaticamente (cache TTL) y puede forzarse manualmente
  5. Modelos nuevos instalados en Ollama aparecen en el inventario sin tocar codigo
**Plans**: 2 plans

Plans:
- [ ] 107-01-PLAN.md — DiscoveryService: types, parallel provider discovery, cache, degradation, tests
- [ ] 107-02-PLAN.md — API endpoints: /api/discovery/models (JSON + CatBot markdown) + /api/discovery/refresh

### Phase 108: Model Intelligence Document (MID)
**Goal**: Cada modelo tiene documentadas sus capacidades, tier, mejor uso y coste, consultable por humanos y por CatBot
**Depends on**: Phase 107
**Requirements**: MID-01, MID-02, MID-03, MID-04, MID-05, MID-06, MID-07, MID-08
**Success Criteria** (what must be TRUE):
  1. Cada modelo conocido tiene una ficha con tier (Elite/Pro/Libre), descripcion de mejor uso, capacidades y coste aproximado
  2. El usuario puede editar scores, descripciones y tiers de cualquier modelo desde la API
  3. Cuando Discovery detecta un modelo nuevo no presente en MID, se crea automaticamente una entrada basica
  4. CatBot recibe un documento markdown conciso con la inteligencia de todos los modelos para sus decisiones
  5. Modelos documentados en MID pueden estar inactivos temporalmente sin perder su ficha
**Plans**: TBD

Plans:
- [ ] 108-01: TBD
- [ ] 108-02: TBD

### Phase 109: Model Alias Routing System
**Goal**: El codigo habla de intenciones (chat-rag, process-docs, catbot) en vez de modelos concretos, y la resolucion es inteligente con fallback multicapa
**Depends on**: Phase 107, Phase 108
**Requirements**: ALIAS-01, ALIAS-02, ALIAS-03, ALIAS-04, ALIAS-05, ALIAS-06, ALIAS-07, ALIAS-08
**Success Criteria** (what must be TRUE):
  1. Ninguna referencia a modelo LLM hardcodeado queda en el codebase -- todo pasa por aliases de intencion
  2. Cada alias resuelve al modelo configurado, verificando con Discovery que esta operativo antes de usarlo
  3. Si el modelo configurado no esta disponible, el sistema hace fallback automatico (MID alternativo, luego CHAT_MODEL env)
  4. Cada resolucion de alias queda registrada en logs para diagnostico y trazabilidad
  5. Tras la migracion, el comportamiento observable es identico al anterior (mismos modelos por defecto)
**Plans**: TBD

Plans:
- [ ] 109-01: TBD
- [ ] 109-02: TBD
- [ ] 109-03: TBD

### Phase 110: CatBot como Orquestador de Modelos
**Goal**: CatBot puede consultar el paisaje de modelos, recomendar el optimo para cada tarea, y cambiar routing con confirmacion del usuario
**Depends on**: Phase 109
**Requirements**: CATBOT-01, CATBOT-02, CATBOT-03, CATBOT-04, CATBOT-05, CATBOT-06, CATBOT-07
**Success Criteria** (what must be TRUE):
  1. El usuario pregunta "que modelos tengo" y CatBot responde con inventario real, tiers y usos recomendados
  2. El usuario pide recomendacion para una tarea y CatBot sugiere modelo con justificacion basada en MID
  3. CatBot puede cambiar el modelo de un alias con confirmacion explicita del usuario antes de aplicar
  4. Cuando un resultado es pobre, CatBot diagnostica si el modelo usado era suboptimo y sugiere alternativa
  5. CatBot no recomienda modelos Elite para tareas triviales -- aplica criterio de proporcionalidad
**Plans**: TBD

Plans:
- [ ] 110-01: TBD
- [ ] 110-02: TBD

### Phase 111: UI de Inteligencia de Modelos
**Goal**: El usuario ve y gestiona toda la inteligencia de modelos desde Settings sin tocar codigo ni API
**Depends on**: Phase 109, Phase 110
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07
**Success Criteria** (what must be TRUE):
  1. En Settings existe una seccion "Modelos" con vista de inventario real-time mostrando modelos activos
  2. Las fichas MID se muestran como cards legibles con tier, capacidades y mejor uso
  3. El usuario puede editar capacidades, tier y descripcion de cualquier modelo directamente desde Settings
  4. Una tabla de routing muestra que modelo usa cada alias, con dropdown para cambiar inmediatamente
  5. Badges de modelo y tier aparecen en la vista de agentes y nodos canvas para ver coste de un vistazo
**Plans**: TBD

Plans:
- [ ] 111-01: TBD
- [ ] 111-02: TBD
- [ ] 111-03: TBD

### Phase 112: Integracion Gemma 4:31B + Cierre
**Goal**: Gemma 4:31B valida el pipeline completo end-to-end y se documenta el procedimiento de 3 pasos para nuevos modelos
**Depends on**: Phase 107, Phase 108, Phase 109, Phase 110, Phase 111
**Requirements**: GEMMA-01, GEMMA-02, GEMMA-03, GEMMA-04, GEMMA-05, GEMMA-06, GEMMA-07, GEMMA-08
**Success Criteria** (what must be TRUE):
  1. Gemma 4:31B esta instalado en Ollama con parametros optimos y Discovery lo detecta correctamente con MID poblado
  2. El usuario pregunta "que modelos tengo" y CatBot incluye Gemma 4:31B con sus capacidades reales en la respuesta
  3. CatBot detecta un resultado pobre de un modelo Libre y sugiere escalar a Gemma 4:31B o Elite con justificacion
  4. Un modelo nuevo instalado en Ollama es detectado automaticamente, clasificado en MID, y CatBot lo puede recomendar
  5. Existe un procedimiento documentado de exactamente 3 pasos para anadir un nuevo LLM al ecosistema
**Plans**: TBD

Plans:
- [ ] 112-01: TBD
- [ ] 112-02: TBD

---

### Dependencies

```
107 (Discovery) --> 108 (MID) --> 109 (Alias Routing)
                                       |
107 + 108 --------------------------> 109
                                       |
                    109 + 110 -------> 111 (UI)
                         |
                    109 --> 110 (CatBot)
                         |
107-111 ----------------------------------------> 112 (Gemma + Cierre)
```

Phases 107-112 son estrictamente secuenciales con dependencias cruzadas:
- Phase 109 requiere tanto 107 como 108
- Phase 111 requiere tanto 109 como 110
- Phase 112 requiere todas las anteriores (107-111)

---

## Progress

**Execution Order:** 107 > 108 > 109 > 110 > 111 > 112

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 107. LLM Discovery Engine | 0/2 | Planning complete | - |
| 108. Model Intelligence Document (MID) | 0/? | Not started | - |
| 109. Model Alias Routing System | 0/? | Not started | - |
| 110. CatBot como Orquestador de Modelos | 0/? | Not started | - |
| 111. UI de Inteligencia de Modelos | 0/? | Not started | - |
| 112. Integracion Gemma 4:31B + Cierre | 0/? | Not started | - |

---
*Created: 2026-04-04*
*Last updated: 2026-04-04*
