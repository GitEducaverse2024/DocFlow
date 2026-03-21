# Index de Documentacion por Funcionalidad

> **ANTES DE ESCRIBIR CODIGO:** Lee siempre [REQUIREMENTS.md](REQUIREMENTS.md) del milestone activo para entender los requisitos exactos y no implementar de mas ni de menos.
>
> **Consejo:** Revisa tambien los **ultimos documentos de progreso** (sesiones recientes) y la **ultima fase completada** para tener contexto actualizado del estado del proyecto, decisiones recientes y patrones establecidos.

---

## Documentos Globales (leer siempre)

| Documento | Descripcion |
|-----------|-------------|
| [REQUIREMENTS.md](REQUIREMENTS.md) | Requisitos del milestone activo — leer ANTES de programar |
| [ROADMAP.md](ROADMAP.md) | Fases actuales, dependencias, criterios de exito |
| [PROJECT.md](PROJECT.md) | Vision del proyecto, features validadas, scope, milestone history |
| [CODING_RULES.md](CODING_RULES.md) | Reglas de codigo, patrones obligatorios, convenciones |
| [STATE.md](STATE.md) | Estado actual del proyecto (fase activa, que falta) |

---

## Arquitectura y Codebase

| Documento | Descripcion |
|-----------|-------------|
| [codebase/ARCHITECTURE.md](codebase/ARCHITECTURE.md) | Arquitectura general de la aplicacion |
| [codebase/STACK.md](codebase/STACK.md) | Stack tecnologico (Next.js 14, SQLite, Qdrant, etc.) |
| [codebase/STRUCTURE.md](codebase/STRUCTURE.md) | Estructura de directorios y archivos |
| [codebase/CONVENTIONS.md](codebase/CONVENTIONS.md) | Convenciones de codigo y nombrado |
| [codebase/INTEGRATIONS.md](codebase/INTEGRATIONS.md) | Integraciones con servicios externos |
| [codebase/TESTING.md](codebase/TESTING.md) | Estrategia y configuracion de tests |
| [codebase/CONCERNS.md](codebase/CONCERNS.md) | Preocupaciones tecnicas y deuda tecnica |
| [research/ARCHITECTURE.md](research/ARCHITECTURE.md) | Investigacion de arquitectura inicial |
| [research/STACK.md](research/STACK.md) | Investigacion de stack inicial |
| [research/FEATURES.md](research/FEATURES.md) | Investigacion de features |
| [research/PITFALLS.md](research/PITFALLS.md) | Pitfalls conocidos |

---

## Funcionalidades por Area

### CatBrains (Proyectos / Base de Conocimiento)

El nucleo de la plataforma: ingesta de fuentes, procesamiento con IA, indexacion RAG, chat.

| Documento | Que cubre |
|-----------|-----------|
| [phases/54-sources-pipeline/](phases/54-sources-pipeline/) | Pipeline simplificado de 3 fases (Fuentes, Procesar, Indexar RAG) |
| [phases/55-reset-catbrain/](phases/55-reset-catbrain/) | Reset de CatBrain con confirmacion en 2 pasos |
| [phases/53-entry-modal/](phases/53-entry-modal/) | Modal de entrada al CatBrain (Chatear, Fuentes, Reset) |
| [phases/39-renombrado-y-migracion/](phases/39-renombrado-y-migracion/) | Renombrado Projects → CatBrains, migracion de datos |
| [phases/40-conectores-propios/](phases/40-conectores-propios/) | Conectores propios por CatBrain (CRUD, panel, test) |
| [phases/41-system-prompt-config-integration/](phases/41-system-prompt-config-integration/) | System prompt configurable en chat, Canvas, Tareas |
| [phases/42-modelo-datos-migracion/](phases/42-modelo-datos-migracion/) | Modelo de datos CatBrains + migracion |
| [Progress/progressSesion16.md](Progress/progressSesion16.md) | v9.0: Renombrado + Conectores + Integracion |
| [Progress/progressSesion17.md](Progress/progressSesion17.md) | Correcciones Post-v9.0 + Feature Extraccion con IA |

### RAG (Retrieval-Augmented Generation)

| Documento | Que cubre |
|-----------|-----------|
| [phases/01-fix-rag-chat-retrieval/](phases/01-fix-rag-chat-retrieval/) | Fix original RAG chat (shared services, limit, score) |
| [phases/02-real-time-rag-indexing-progress/](phases/02-real-time-rag-indexing-progress/) | Barra de progreso de indexacion RAG original |
| [Progress/RAG_IMPROVEMENT_PLAN.md](Progress/RAG_IMPROVEMENT_PLAN.md) | Plan de mejora RAG v10.0 |
| [Progress/progressSesion5.md](Progress/progressSesion5.md) | Fix RAG Chat + Barra de Progreso (v1.0) |
| [Progress/progressSesion23.md](Progress/progressSesion23.md) | Bug fixes: RAG append + extraccion multi-formato |
| [Progress/progressSesion24.md](Progress/progressSesion24.md) | RAG robustez: SSE streaming, preflight, error detallado, reconnect |

### Chat y Streaming

| Documento | Que cubre |
|-----------|-----------|
| [phases/33-streaming-backend/](phases/33-streaming-backend/) | Streaming backend (SSE, createSSEStream, token buffering) |
| [phases/34-streaming-frontend/](phases/34-streaming-frontend/) | Streaming frontend (useSSEStream hook, chat UI) |
| [Progress/progressSesion24.md](Progress/progressSesion24.md) | SSE streaming para RAG indexing (no solo chat) |

### CatBot (Asistente IA)

| Documento | Que cubre |
|-----------|-----------|
| [phases/46-catbot-tools-polish/](phases/46-catbot-tools-polish/) | CatBot tools y polish |
| [Progress/progressSesion8.md](Progress/progressSesion8.md) | v4.0: CatBot, MCP Bridge, UX Polish |
| [Progress/progressSesion15.md](Progress/progressSesion15.md) | v8.0: CatBot Diagnosticador + Base de Conocimiento |

### CatPaws (Agentes)

| Documento | Que cubre |
|-----------|-----------|
| [phases/43-api-rest-catpaws/](phases/43-api-rest-catpaws/) | API REST CatPaws (CRUD) |
| [phases/44-motor-ejecucion-executecatpaw/](phases/44-motor-ejecucion-executecatpaw/) | Motor de ejecucion executeCatPaw() |
| [phases/45-ui-pagina-agentes-rediseñada/](phases/45-ui-pagina-agentes-rediseñada/) | UI pagina de agentes rediseñada |
| [phases/52-cors-fix/](phases/52-cors-fix/) | Fix CORS /api/agents → proxy a /api/cat-paws |
| [Progress/progressSesion18.md](Progress/progressSesion18.md) | v10.0: Unificacion de Agentes + Testing |

### Canvas (Editor Visual de Workflows)

| Documento | Que cubre |
|-----------|-----------|
| [phases/23-modelo-datos-api-crud-lista-wizard/](phases/23-modelo-datos-api-crud-lista-wizard/) | Modelo datos, API CRUD, lista, wizard del Canvas |
| [phases/24-editor-visual-8-tipos-de-nodo/](phases/24-editor-visual-8-tipos-de-nodo/) | Editor React Flow, 8 tipos de nodo, paleta |
| [phases/25-motor-de-ejecucion-visual/](phases/25-motor-de-ejecucion-visual/) | Motor ejecucion Canvas (DAG, topological sort) |
| [Progress/progressSesion9.md](Progress/progressSesion9.md) | Canvas: Modelo, API, Lista, Wizard, Editor |
| [Progress/progressSesion10.md](Progress/progressSesion10.md) | Motor de Ejecucion Visual del Canvas |
| [Progress/progressSesion14.md](Progress/progressSesion14.md) | Templates + Modos de Canvas |

### Tareas (Sistema Multi-Agente)

| Documento | Que cubre |
|-----------|-----------|
| [phases/03-data-model-templates-seed/](phases/03-data-model-templates-seed/) | Modelo de datos tareas + templates |
| [phases/04-api-crud-tasks-steps-templates/](phases/04-api-crud-tasks-steps-templates/) | API CRUD tareas |
| [phases/05-pipeline-execution-engine/](phases/05-pipeline-execution-engine/) | Motor de ejecucion pipeline |
| [phases/06-tasks-list-page-sidebar/](phases/06-tasks-list-page-sidebar/) | Pagina de lista de tareas |
| [phases/07-task-creation-wizard/](phases/07-task-creation-wizard/) | Wizard de creacion de tareas |
| [phases/08-execution-view-realtime/](phases/08-execution-view-realtime/) | Vista de ejecucion en tiempo real |
| [Progress/progressSesion6.md](Progress/progressSesion6.md) | v2.0: Sistema de Tareas Multi-Agente |

### Conectores

| Documento | Que cubre |
|-----------|-----------|
| [CONNECTORS.md](CONNECTORS.md) | Documentacion completa de conectores |
| [phases/09-data-model-connectors-logs-usage/](phases/09-data-model-connectors-logs-usage/) | Modelo datos conectores + logs + usage |
| [phases/10-connectors-api-crud/](phases/10-connectors-api-crud/) | API CRUD conectores |
| [phases/11-connectors-ui-page/](phases/11-connectors-ui-page/) | UI pagina de conectores |
| [phases/12-pipeline-connector-integration/](phases/12-pipeline-connector-integration/) | Integracion conectores en pipeline |
| [phases/50-emailservice-gmail-apppassword/](phases/50-emailservice-gmail-apppassword/) | Conector Gmail (App Password) |
| [phases/51-oauth2-wizard-catbot-tests/](phases/51-oauth2-wizard-catbot-tests/) | OAuth2 wizard + CatBot tests |
| [Progress/progressSesion7.md](Progress/progressSesion7.md) | Conectores + Dashboard (v3.0) |
| [Progress/progressSesion19.md](Progress/progressSesion19.md) | v13.0: Conector Gmail |
| [Progress/progressSesion20.md](Progress/progressSesion20.md) | v13.0: Phase 51 + Bugfixes + RAG Append |
| [Progress/progressSesion21.md](Progress/progressSesion21.md) | Bugfixes Gmail Wizard + Selector Modelo |

### WebSearch

| Documento | Que cubre |
|-----------|-----------|
| [phases/48-infraestructura-websearch/](phases/48-infraestructura-websearch/) | SearXNG Docker, Gemini grounding, health checks |
| [phases/49-catbrain-websearch/](phases/49-catbrain-websearch/) | CatBrain WebSearch, multi-engine API, UI |

### Testing y Calidad

| Documento | Que cubre |
|-----------|-----------|
| [phases/36-playwright-setup-test-specs/](phases/36-playwright-setup-test-specs/) | Playwright setup + test specs |
| [phases/37-testing-dashboard-log-viewer/](phases/37-testing-dashboard-log-viewer/) | Dashboard de testing + log viewer |
| [Progress/progressSesion12.md](Progress/progressSesion12.md) | Playwright Setup (v7.0) |
| [Progress/progressSesion13.md](Progress/progressSesion13.md) | Testing Dashboard + Log Viewer (v7.0) |

### Logging y Observabilidad

| Documento | Que cubre |
|-----------|-----------|
| [phases/32-logging-foundation/](phases/32-logging-foundation/) | Logging JSONL estructurado, rotacion, integracion |
| [phases/13-usage-tracking-costs/](phases/13-usage-tracking-costs/) | Usage tracking y costos |

### Resiliencia y Performance

| Documento | Que cubre |
|-----------|-----------|
| [phases/27-resilience-foundations/](phases/27-resilience-foundations/) | withRetry, TTL cache, Error Boundaries |
| [Progress/progressSesion11.md](Progress/progressSesion11.md) | Resilience Foundations |

### Notificaciones

| Documento | Que cubre |
|-----------|-----------|
| [phases/35-notifications-system/](phases/35-notifications-system/) | Sistema de notificaciones (campana, badge, CRUD) |

### i18n (Internacionalizacion)

| Documento | Que cubre |
|-----------|-----------|
| [Progress/progressI18n-Fase3.md](Progress/progressI18n-Fase3.md) | Layout Global |
| [Progress/progressI18n-Fase4.md](Progress/progressI18n-Fase4.md) | CatBot |
| [Progress/progressI18n-Fase5.md](Progress/progressI18n-Fase5.md) | Dashboard + CatBrains + Pipeline |
| [Progress/progressI18n-Fase6.md](Progress/progressI18n-Fase6.md) | Agentes + Workers + Skills |
| [Progress/progressI18n-Fase7.md](Progress/progressI18n-Fase7.md) | Tareas + Canvas |
| [Progress/progressI18n-Fase8.md](Progress/progressI18n-Fase8.md) | Conectores + Settings + System + Testing |
| [Progress/progressI18n-Resumen-Final.md](Progress/progressI18n-Resumen-Final.md) | Resumen completo del milestone i18n |

### UI / UX / Branding

| Documento | Que cubre |
|-----------|-----------|
| [phases/15-rebranding-visual/](phases/15-rebranding-visual/) | Rebranding DocFlow → DoCatFlow |
| [Progress/progressSesion8.md](Progress/progressSesion8.md) | v4.0: Rebranding + CatBot + MCP + UX |

### Infraestructura y Despliegue

| Documento | Que cubre |
|-----------|-----------|
| [Progress/DocFlow_Guia_Instalacion_Infraestructura.md](Progress/DocFlow_Guia_Instalacion_Infraestructura.md) | Guia completa de instalacion Docker + servicios |
| [Progress/progressWebapp.md](Progress/progressWebapp.md) | Guia completa de desarrollo de la webapp |

---

## Milestones Completados

| Milestone | Fases | Documentos clave |
|-----------|-------|------------------|
| v1.0 — Fix RAG Chat | 01-02 | [Phase 01](phases/01-fix-rag-chat-retrieval/), [Phase 02](phases/02-real-time-rag-indexing-progress/), [Sesion 5](Progress/progressSesion5.md) |
| v2.0 — Tareas Multi-Agente | 03-08 | [Phases 03-08](phases/), [Sesion 6](Progress/progressSesion6.md) |
| v3.0 — Conectores + Dashboard | 09-14 | [Phases 09-14](phases/), [Sesion 7](Progress/progressSesion7.md) |
| v4.0 — Rebranding + CatBot + MCP | 15 | [Phase 15](phases/15-rebranding-visual/), [Sesion 8](Progress/progressSesion8.md) |
| v5.0 — Canvas Visual | 23-26 | [Phases 23-25](phases/), [Sesiones 9-10, 14](Progress/) |
| v6.0 — Resiliencia (parcial) | 27 | [Phase 27](phases/27-resilience-foundations/), [Sesion 11](Progress/progressSesion11.md) |
| v7.0 — Streaming + Testing + Logging | 32-37 | [Phases 32-37](phases/), [Sesiones 12-13](Progress/) |
| v8.0 — CatBot Diagnosticador | 38 | [Sesion 15](Progress/progressSesion15.md) |
| v9.0 — CatBrains | 39-45 | [Phases 39-45](phases/), [Sesiones 16-17](Progress/) |
| v10.0 — CatPaw Unificacion | 43-46 | [Phases 43-46](phases/), [Sesion 18](Progress/progressSesion18.md) |
| v12.0 — WebSearch CatBrain | 48-49 | [Phases 48-49](phases/), [v12.0 Roadmap](milestones/v12.0-ROADMAP.md) |
| v13.0 — Conector Gmail | 50-51 | [Phases 50-51](phases/), [Sesiones 19-21](Progress/) |
| **v14.0 — CatBrain UX Redesign** | 52-56 | [ROADMAP.md](ROADMAP.md), [Sesiones 22-24](Progress/) |

---

## Sesiones de Progreso (orden cronologico)

| Sesion | Titulo | Milestone |
|--------|--------|-----------|
| [2](Progress/progressSesion2.md) | Configuracion de Proyecto, Agentes IA, API Keys | v0 |
| [3](Progress/progressSesion3.md) | Seleccion Granular de Fuentes, Historial, Workers, Skills | v0 |
| [4](Progress/progressSesion4.md) | Rediseno Agentes OpenClaw, Permisos Docker, Gateway | v0 |
| [5](Progress/progressSesion5.md) | Fix RAG Chat + Barra de Progreso de Indexacion | v1.0 |
| [6](Progress/progressSesion6.md) | Sistema de Tareas Multi-Agente | v2.0 |
| [7](Progress/progressSesion7.md) | Conectores + Dashboard + Rebranding Planning | v3.0/v4.0 |
| [8](Progress/progressSesion8.md) | Rebranding + CatBot + MCP Bridge + UX Polish | v4.0 |
| [9](Progress/progressSesion9.md) | Canvas: Modelo de Datos, API, Lista, Wizard, Editor | v5.0 |
| [10](Progress/progressSesion10.md) | Motor de Ejecucion Visual del Canvas | v5.0 |
| [11](Progress/progressSesion11.md) | Resilience Foundations | v6.0 |
| [12](Progress/progressSesion12.md) | Playwright Setup + Test Specs | v7.0 |
| [13](Progress/progressSesion13.md) | Testing Dashboard + Log Viewer | v7.0 |
| [14](Progress/progressSesion14.md) | Templates + Modos de Canvas | v5.0 |
| [15](Progress/progressSesion15.md) | CatBot Diagnosticador + Base de Conocimiento | v8.0 |
| [16](Progress/progressSesion16.md) | CatBrains: Renombrado + Conectores + Integracion | v9.0 |
| [17](Progress/progressSesion17.md) | Correcciones Post-v9.0 + Extraccion con IA | v9.0 |
| [18](Progress/progressSesion18.md) | CatPaw: Unificacion de Agentes + Testing | v10.0 |
| [19](Progress/progressSesion19.md) | Conector Gmail | v13.0 |
| [20](Progress/progressSesion20.md) | Phase 51 + Bugfixes + RAG Append | v13.0 |
| [21](Progress/progressSesion21.md) | Bugfixes Gmail Wizard + Selector Modelo | v13.0 |
| [22](Progress/progressSesion22.md) | Documentacion + Git Push | v14.0 |
| [23](Progress/progressSesion23.md) | Bug fixes: RAG append + extraccion multi-formato | v14.0 |
| [24](Progress/progressSesion24.md) | RAG robustez + SSE streaming + i18n pipeline fix | v14.0 |

---

## Otros Documentos

| Documento | Descripcion |
|-----------|-------------|
| [GUIA_USUARIO.md](GUIA_USUARIO.md) | Guia de usuario de DoCatFlow |
| [MILESTONES.md](MILESTONES.md) | Historial de milestones archivados |
| [milestones/v12.0-REQUIREMENTS.md](milestones/v12.0-REQUIREMENTS.md) | Requisitos v12.0 (archivado) |
| [milestones/v12.0-ROADMAP.md](milestones/v12.0-ROADMAP.md) | Roadmap v12.0 (archivado) |

---

*Creado: 2026-03-21*
*Ultima actualizacion: 2026-03-21*
