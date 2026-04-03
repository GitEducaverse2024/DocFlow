# Index de Documentacion DoCatFlow

> **ANTES DE ESCRIBIR CODIGO:** Lee siempre [REQUIREMENTS.md](REQUIREMENTS.md) del milestone activo.
>
> **Consejo:** Revisa los **ultimos documentos de progreso** y la **ultima fase completada** para contexto actualizado.

---

## Documentos Globales (leer siempre)

| Documento | Descripcion |
|-----------|-------------|
| [REQUIREMENTS.md](REQUIREMENTS.md) | Requisitos del milestone activo |
| [ROADMAP.md](ROADMAP.md) | Fases actuales, dependencias, criterios de exito |
| [PROJECT.md](PROJECT.md) | Vision del proyecto, features validadas, scope, milestone history |
| [coding-rules.md](codebase/coding-rules.md) | Reglas de codigo, patrones obligatorios, convenciones |
| [STATE.md](STATE.md) | Estado actual del proyecto (fase activa, que falta) |

---

## Catalogos de Conocimiento (knowledge/)

Documentos vivos que se actualizan con cada implementacion. **CatBot los usa como base de conocimiento.**

| Documento | Contenido | Total |
|-----------|-----------|-------|
| [catpaw-catalog.md](knowledge/catpaw-catalog.md) | Agentes CatPaw: departamento, modo, modelo, skills, conectores | 30 |
| [skills-catalog.md](knowledge/skills-catalog.md) | Skills por categoria con descripcion y tags | 42 |
| [connectors-catalog.md](knowledge/connectors-catalog.md) | Conectores, matriz OAuth2/IMAP, reglas Canvas Inbound | 11 |
| [email-templates-catalog.md](knowledge/email-templates-catalog.md) | Plantillas email, bloques, assets Drive, mapeo producto | 11 |
| [canvas-nodes-catalog.md](knowledge/canvas-nodes-catalog.md) | Nodos Canvas, Reglas de Oro R01-R25, Iterator, RefCode, triple proteccion | 13 |
| [proceso-catflow-revision-inbound.md](knowledge/proceso-catflow-revision-inbound.md) | Postmortem Inbound v4.0: 15 errores, 25 reglas, RefCode, triple proteccion, validado | — |
| [user-guide.md](knowledge/user-guide.md) | Guia de usuario completa v25.0 | — |
| [holded-mcp-api.md](knowledge/holded-mcp-api.md) | API Holded MCP: modulos, endpoints, campos criticos | 832 lines |
| [incidents-log.md](knowledge/incidents-log.md) | Incidencias resueltas de conectores y canvas | 9 |

---

## Arquitectura y Codebase (codebase/)

Documentos tecnicos sobre la estructura interna de la aplicacion.

| Documento | Descripcion |
|-----------|-------------|
| [architecture.md](codebase/architecture.md) | Arquitectura general de la aplicacion |
| [stack.md](codebase/stack.md) | Stack tecnologico (Next.js 14, SQLite, Qdrant, etc.) |
| [structure.md](codebase/structure.md) | Estructura de directorios y archivos |
| [conventions.md](codebase/conventions.md) | Convenciones de codigo y nombrado |
| [integrations.md](codebase/integrations.md) | Integraciones con servicios externos |
| [testing.md](codebase/testing.md) | Estrategia y configuracion de tests |
| [concerns.md](codebase/concerns.md) | Preocupaciones tecnicas y deuda tecnica |

---

## Archivo Historico (archive/)

Documentacion de referencia historica. No se mantiene activamente.

| Contenido | Descripcion |
|-----------|-------------|
| [archive/research/](archive/research/) | Investigacion previa (v6.0, v19.0): arquitectura, stack, features, pitfalls |

---

## Sesiones de Progreso (Progress/)

Diario de desarrollo. Cada sesion documenta implementaciones, bugs, decisiones y metricas.

| Sesion | Titulo | Milestone |
|--------|--------|-----------|
| [2](Progress/progressSesion2.md) | Configuracion de Proyecto, Agentes IA, API Keys | v0 |
| [3](Progress/progressSesion3.md) | Seleccion Granular de Fuentes, Historial, Workers, Skills | v0 |
| [4](Progress/progressSesion4.md) | Rediseno Agentes OpenClaw, Permisos Docker, Gateway | v0 |
| [5](Progress/progressSesion5.md) | Fix RAG Chat + Barra de Progreso de Indexacion | v1.0 |
| [6](Progress/progressSesion6.md) | Sistema de Tareas Multi-Agente | v2.0 |
| [7](Progress/progressSesion7.md) | Conectores + Dashboard + Rebranding Planning | v3.0 |
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
| [26](Progress/progressSesion26.md) | Google Drive connector + Canvas IO | v19.0 |
| [27](Progress/progressSesion27.md) | CatPaw Directory + Skills Directory | v20.0/v21.0 |
| [28](Progress/progressSesion28.md) | Telegram CatBot + Canvas badges | v22.0 |
| [30](Progress/progressSesion30.md) | Sistema Comercial: Gmail, Holded, Canvas, RAG, UI | v23.0 |
| [31](Progress/progressSesion31.md) | Templates bugfixes, CatBot CRUD, Gmail OAuth2, Base+Extras, Iterator forEach | v24.0 |

---

## Milestones Completados

| Milestone | Fases | Sesiones |
|-----------|-------|----------|
| v1.0 — Fix RAG Chat | 01-02 | 5 |
| v2.0 — Tareas Multi-Agente | 03-08 | 6 |
| v3.0 — Conectores + Dashboard | 09-14 | 7 |
| v4.0 — Rebranding + CatBot + MCP | 15 | 8 |
| v5.0 — Canvas Visual | 23-26 | 9-10, 14 |
| v6.0 — Resiliencia (parcial) | 27 | 11 |
| v7.0 — Streaming + Testing + Logging | 32-37 | 12-13 |
| v8.0 — CatBot Diagnosticador | 38 | 15 |
| v9.0 — CatBrains | 39-41 | 16-17 |
| v10.0 — CatPaw Unificacion | 42-47 | 18 |
| v12.0 — WebSearch CatBrain | 48-49 | — |
| v13.0 — Conector Gmail | 50-51 | 19-21 |
| v14.0 — CatBrain UX Redesign | 52-56 | 22-24 |
| v15.0 — Tasks Unified | 57-62 | — |
| v16.0 — CatFlow | 63-70 | — |
| v17.0 — Holded MCP | 71-76 | — |
| v18.0 — Holded Auditoria | 77-81 | — |
| v19.0 — Google Drive (parcial) | 82, 85 | 26 |
| v20.0 — CatPaw Directory | 87-90 | 27 |
| v21.0 — Skills Directory | 91-94 | 27 |
| v22.0 — Telegram CatBot | 95-98 | 28 |
| v23.0 — Sistema Comercial Educa360 | — | 30 |
| v24.0 — CatPower Email Templates | 99-106 | 31 |

---

## Otros Documentos

| Documento | Descripcion |
|-----------|-------------|
| [milestones-archive.md](milestones/milestones-archive.md) | Historial de milestones archivados |
| [milestones/v12.0-REQUIREMENTS.md](milestones/v12.0-REQUIREMENTS.md) | Requisitos v12.0 (archivado) |
| [milestones/v12.0-ROADMAP.md](milestones/v12.0-ROADMAP.md) | Roadmap v12.0 (archivado) |
| [milestones/v24.0-catpower-templates.md](milestones/v24.0-catpower-templates.md) | Spec v24.0 (archivado) |

---

*Creado: 2026-03-21*
*Ultima actualizacion: 2026-04-03*
