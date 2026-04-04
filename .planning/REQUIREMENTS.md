# Requirements: v25.0 Model Intelligence Orchestration

**Defined:** 2026-04-04
**Core Value:** La plataforma conoce su ecosistema LLM, sabe que modelo es mejor para cada tarea, y CatBot orquesta las decisiones de routing inteligentemente.

## Contexto

DoCatFlow tiene un ecosistema LLM rico (Gemma 4:31B local, Claude Sonnet/Opus, Gemini 2.5 Pro/Flash, GPT-4o, modelos Ollama) pero los usa de forma homogenea -- mismo modelo para todo, hardcodeado, sin distincion de tarea ni capacidad. Este milestone construye tres capas de inteligencia: Discovery (que hay disponible), MID (que hace cada uno mejor), y Routing (el codigo habla de intenciones, no de modelos).

## v25.0 Requirements

### DISC -- LLM Discovery Engine

- [x] **DISC-01**: Servicio que descubre automaticamente todos los modelos Ollama instalados (nombre, tamano, fecha de pull)
- [x] **DISC-02**: Verificacion de API providers configurados (OpenAI, Anthropic, Google) con coste minimo/cero de tokens
- [x] **DISC-03**: Listado de modelos concretos disponibles en cada provider activo
- [x] **DISC-04**: Inventario cacheable con TTL razonable, refrescable bajo demanda
- [ ] **DISC-05**: Endpoint interno consultable por CatBot con formato legible para inyeccion en system prompt
- [x] **DISC-06**: Degradacion limpia si Ollama no esta disponible (no rompe app ni arranque)
- [x] **DISC-07**: No hardcodear lista de modelos esperados -- funciona con cualquier modelo presente
- [x] **DISC-08**: Discovery no bloquea el arranque de la app (bajo demanda o background)

### MID -- Model Intelligence Document

- [ ] **MID-01**: Tabla SQLite para el MID con schema que balance legibilidad LLM y edicion humana
- [ ] **MID-02**: Cada modelo tiene: tier (Elite/Pro/Libre), descripcion de mejor uso, capacidades diferenciales, coste aproximado, proveedor
- [ ] **MID-03**: Seeds para modelos del ecosistema actual: Gemma 4 (E2B, E4B, 26B, 31B), Claude (Haiku 3.5/Sonnet 4/Opus 4), GPT-4o/4o-mini, Gemini 2.5 Pro/Flash, Llama 3.x, Mistral, Qwen
- [ ] **MID-04**: Exportacion como documento markdown conciso y escaneable para contexto de CatBot
- [ ] **MID-05**: Auto-creacion de entrada basica cuando Discovery detecta modelo nuevo no presente en MID
- [ ] **MID-06**: API CRUD completa: listar, editar capacidades, anadir manualmente, marcar como obsoleto/retirado
- [ ] **MID-07**: Modelos pueden estar documentados en MID aunque no esten activos (ej: key desconfigurada temporalmente)
- [ ] **MID-08**: Scores y descripciones editables por el usuario -- son opinion basada en benchmarks, no verdad absoluta

### ALIAS -- Model Alias Routing System

- [ ] **ALIAS-01**: Auditoria completa del codebase: localizar CADA referencia a modelo LLM hardcodeado
- [ ] **ALIAS-02**: Conjunto minimo de aliases de intencion: chat-rag, process-docs, agent-task, catbot, generate-content, embed
- [ ] **ALIAS-03**: Funcion de resolucion: busca alias -> verifica con Discovery que modelo esta operativo -> fallback MID -> fallback CHAT_MODEL env
- [ ] **ALIAS-04**: Registro de cada resolucion en logs para trazabilidad
- [ ] **ALIAS-05**: Seeds por defecto que apuntan a los modelos usados antes de la migracion (comportamiento identico al actual)
- [ ] **ALIAS-06**: Migracion subsistema a subsistema: chat RAG -> procesamiento docs -> tasks -> CatBot -> generacion agentes
- [ ] **ALIAS-07**: Verificacion manual tras cada subsistema migrado antes de avanzar al siguiente
- [ ] **ALIAS-08**: Fallback graceful multicapa: alias configurado -> mejor alternativo MID -> CHAT_MODEL env

### CATBOT -- CatBot como Orquestador de Modelos

- [ ] **CATBOT-01**: Tool `get_model_landscape` -- inventario Discovery + MID resumido, datos reales y actualizados
- [ ] **CATBOT-02**: Tool `recommend_model_for_task` -- recomendacion basada en MID con justificacion clara
- [ ] **CATBOT-03**: Tool `update_alias_routing` -- cambiar modelo de un alias con confirmacion explicita del usuario
- [ ] **CATBOT-04**: System prompt actualizado con resumen MID, guia Elite vs Libre, protocolo de diagnostico
- [ ] **CATBOT-05**: Al crear/revisar canvas, CatBot sugiere modelo optimo por nodo (Agente/Razonamiento) basado en MID
- [ ] **CATBOT-06**: Protocolo de diagnostico: cuando resultado es pobre, revisar modelo usado vs MID y sugerir alternativa
- [ ] **CATBOT-07**: No recomendar modelos Elite en conversaciones triviales -- solo cuando complejidad lo justifica

### UI -- Interfaz de Inteligencia de Modelos

- [ ] **UI-01**: Seccion "Modelos" en Settings con vista de inventario activo (Discovery real-time)
- [ ] **UI-02**: Vista de Inteligencia de Modelos -- MID como cards legibles con capacidades, tier y mejor uso
- [ ] **UI-03**: Editor de capacidades de modelo desde Settings (editar scores, descripcion, tier)
- [ ] **UI-04**: Tabla de routing de aliases: que modelo usa cada tipo de tarea, cambio via dropdown inmediato
- [ ] **UI-05**: Tier y estimacion de coste visible junto a cada modelo en la tabla de routing
- [ ] **UI-06**: UX para sugerencias de CatBot: recomendacion + justificacion + acciones [Aplicar]/[Ignorar]
- [ ] **UI-07**: Badge de modelo + tier en vista de agentes y nodos canvas (vistazo rapido coste vs gratuito)

### GEMMA -- Integracion Gemma 4:31B + Cierre

- [ ] **GEMMA-01**: Gemma 4:31B instalado en Ollama con parametros optimos para RTX 5080 (16GB VRAM)
- [ ] **GEMMA-02**: Discovery detecta correctamente, MID poblado con capacidades reales (function calling, thinking, multimodal, 128K context)
- [ ] **GEMMA-03**: Alias routing puede usar Gemma 4:31B para tareas estandar (chat RAG, procesamiento)
- [ ] **GEMMA-04**: Validacion Escenario A -- CatBot detecta atasco y sugiere modelo Elite
- [ ] **GEMMA-05**: Validacion Escenario B -- Canvas con modelo optimo por nodo sugerido por CatBot
- [ ] **GEMMA-06**: Validacion Escenario C -- "Que modelos tengo?" responde inventario real con tiers y usos
- [ ] **GEMMA-07**: Validacion Escenario D -- Modelo nuevo detectado automaticamente, clasificado en MID, CatBot lo recomienda
- [ ] **GEMMA-08**: Procedimiento documentado para anadir nuevo LLM en exactamente 3 pasos

## v26.0 Requirements (Deferred)

### Robustez Enterprise
- **ENT-01**: Patron Dispatcher/Worker (MultiAgent + listen_mode) para cargas pesadas en canvas
- **ENT-02**: Dead Letter Queue (DLQ) visual en UI para items fallidos de canvas
- **ENT-03**: Edge validation con schemas opcionales entre nodos canvas
- **ENT-04**: Data Contracts basicos en executor (json_required, non_empty entre nodos)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-benchmark de modelos (run eval suite) | Excesiva complejidad, benchmarks publicos son suficiente base |
| Cost tracking detallado por modelo (usage billing) | Ya existe usage_logs -- no duplicar, solo mostrar estimacion |
| A/B testing automatico entre modelos | Requiere infraestructura de experimentacion -- futuro |
| Fine-tuning o LoRA management | Fuera del alcance de orquestacion -- es gestion de modelos |
| Multi-GPU routing | Single GPU (RTX 5080), no aplica |
| Rate limiting por provider | LiteLLM ya maneja esto parcialmente |
| Model download management (pull/delete Ollama) | CatBot sudo ya puede ejecutar ollama pull/rm |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISC-01 | Phase 107 | Complete |
| DISC-02 | Phase 107 | Complete |
| DISC-03 | Phase 107 | Complete |
| DISC-04 | Phase 107 | Complete |
| DISC-05 | Phase 107 | Pending |
| DISC-06 | Phase 107 | Complete |
| DISC-07 | Phase 107 | Complete |
| DISC-08 | Phase 107 | Complete |
| MID-01 | Phase 108 | Pending |
| MID-02 | Phase 108 | Pending |
| MID-03 | Phase 108 | Pending |
| MID-04 | Phase 108 | Pending |
| MID-05 | Phase 108 | Pending |
| MID-06 | Phase 108 | Pending |
| MID-07 | Phase 108 | Pending |
| MID-08 | Phase 108 | Pending |
| ALIAS-01 | Phase 109 | Pending |
| ALIAS-02 | Phase 109 | Pending |
| ALIAS-03 | Phase 109 | Pending |
| ALIAS-04 | Phase 109 | Pending |
| ALIAS-05 | Phase 109 | Pending |
| ALIAS-06 | Phase 109 | Pending |
| ALIAS-07 | Phase 109 | Pending |
| ALIAS-08 | Phase 109 | Pending |
| CATBOT-01 | Phase 110 | Pending |
| CATBOT-02 | Phase 110 | Pending |
| CATBOT-03 | Phase 110 | Pending |
| CATBOT-04 | Phase 110 | Pending |
| CATBOT-05 | Phase 110 | Pending |
| CATBOT-06 | Phase 110 | Pending |
| CATBOT-07 | Phase 110 | Pending |
| UI-01 | Phase 111 | Pending |
| UI-02 | Phase 111 | Pending |
| UI-03 | Phase 111 | Pending |
| UI-04 | Phase 111 | Pending |
| UI-05 | Phase 111 | Pending |
| UI-06 | Phase 111 | Pending |
| UI-07 | Phase 111 | Pending |
| GEMMA-01 | Phase 112 | Pending |
| GEMMA-02 | Phase 112 | Pending |
| GEMMA-03 | Phase 112 | Pending |
| GEMMA-04 | Phase 112 | Pending |
| GEMMA-05 | Phase 112 | Pending |
| GEMMA-06 | Phase 112 | Pending |
| GEMMA-07 | Phase 112 | Pending |
| GEMMA-08 | Phase 112 | Pending |

**Coverage:**
- v25.0 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 -- Roadmap created, traceability confirmed*
