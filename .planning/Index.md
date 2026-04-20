# Index de Documentacion DoCatFlow

> **ANTES DE ESCRIBIR CODIGO:** Lee siempre [REQUIREMENTS.md](REQUIREMENTS.md) del milestone activo.
>
> **Consejo:** Revisa los **ultimos documentos de progreso** y la **ultima fase completada** para contexto actualizado.

---

## Knowledge Base

Toda la documentación vive en [`.docflow-kb/`](../.docflow-kb/). Ver [`.docflow-kb/_manual.md`](../.docflow-kb/_manual.md).

**Material transitorio:** Archivos de milestones cerrados y catálogos post-migración se archivan en [`.docflow-legacy/`](../.docflow-legacy/). Ver [`.docflow-legacy/README.md`](../.docflow-legacy/README.md).

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

## Auditorias Activas (insumos para planificacion)

Documentos de diagnostico cross-fase. **Leer antes de planificar fases relacionadas.**

| Documento | Tema | Insumo para |
|-----------|------|-------------|
| [AUDIT-catflow-pipeline-quality.md](AUDIT-catflow-pipeline-quality.md) | Inventario tecnico de Phases 130-132 + hotfixes, casuistica de 5 fallos reales (incl. R10 over-strict, exhaustion muda), taxonomia de 7 roles funcionales propuesta, 5 decisiones pendientes | Phase 133 (Professional Node Instructions + Role-Aware QA) |
| [reference/auditoria-catflow.md](reference/auditoria-catflow.md) | Auditoría técnica de flujo CatFlow (movido desde root en Phase 149) | Referencia arquitectónica general |

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
| [25](Progress/progressSesion25.md) | Chat directo con CatPaw | v14.0 |
| [29](Progress/progressSesion29.md) | Milestone v22.0 Telegram CatBot + Mejoras Canvas + Arquitecto de Agentes | v22.0 |
| [30](Progress/progressSesion30.md) | Sistema Comercial: Gmail, Holded, Canvas, RAG, UI | v23.0 |
| [31](Progress/progressSesion31.md) | Templates bugfixes, CatBot CRUD, Gmail OAuth2, Base+Extras, Iterator forEach | v24.0 |

### Documentacion Adicional en Progress/

Documentos transversales o de milestones especificos que no siguen la numeracion de sesiones.

| Documento | Tema | Milestone |
|-----------|------|-----------|
| [progressI18n-Fase3.md](Progress/progressI18n-Fase3.md) | i18n Fase 3 — Layout Global | i18n |
| [progressI18n-Fase4.md](Progress/progressI18n-Fase4.md) | i18n Fase 4 | i18n |
| [progressI18n-Fase5.md](Progress/progressI18n-Fase5.md) | i18n Fase 5 | i18n |
| [progressI18n-Fase6.md](Progress/progressI18n-Fase6.md) | i18n Fase 6 | i18n |
| [progressI18n-Fase7.md](Progress/progressI18n-Fase7.md) | i18n Fase 7 | i18n |
| [progressI18n-Fase8.md](Progress/progressI18n-Fase8.md) | i18n Fase 8 | i18n |
| [progressI18n-Resumen-Final.md](Progress/progressI18n-Resumen-Final.md) | i18n Milestone — Resumen final consolidado | i18n |
| [progressWebapp.md](Progress/progressWebapp.md) | DocFlow — Guia Completa de Desarrollo (vision general de la plataforma) | — |
| [DocFlow_Guia_Instalacion_Infraestructura.md](Progress/DocFlow_Guia_Instalacion_Infraestructura.md) | Guia de instalacion del stack completo en Ubuntu | — |
| [RAG_IMPROVEMENT_PLAN.md](Progress/RAG_IMPROVEMENT_PLAN.md) | Plan de mejora RAG v10.0 (2026-03-15) | v10.0 |

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
| v25.0 — Model Intelligence Orchestration | 107-112 | — |
| v25.1 — Centro de Modelos | 113-117 | — |
| v26.0 — CatBot Intelligence Engine | 118-124 | — |
| v26.1 — Knowledge System Hardening (expandido) | 125-132 | — |

> **Nota v26.1:** El roadmap original cubria 125-127 pero se expandio durante la ejecucion para incluir:
> - Phase 128 — Sistema de Alertas + Memoria de Conversacion CatBot
> - Phase 129 — Intent Queue (promesas persistentes de CatBot)
> - Phase 130 — Async CatFlow Pipeline (creacion asistida de workflows)
> - Phase 131 — Complexity Assessment (CatBot razona antes de ejecutar)
> - Phase 132 — Canvas QA Loop Architect (auto-review + rules index + side-effect guards)
>
> El estado actual y los hotfixes post-132 se documentan en [AUDIT-catflow-pipeline-quality.md](AUDIT-catflow-pipeline-quality.md).

---

## Otros Documentos

| Documento | Descripcion |
|-----------|-------------|
| [milestones-archive.md](milestones/milestones-archive.md) | Historial de milestones archivados |
| [milestones/v12.0-REQUIREMENTS.md](milestones/v12.0-REQUIREMENTS.md) | Requisitos v12.0 (archivado) |
| [milestones/v12.0-ROADMAP.md](milestones/v12.0-ROADMAP.md) | Roadmap v12.0 (archivado) |
| [milestones/v16.0-REQUIREMENTS.md](milestones/v16.0-REQUIREMENTS.md) | Requisitos v16.0 CatFlow (archivado) |
| [milestones/v16.0-ROADMAP.md](milestones/v16.0-ROADMAP.md) | Roadmap v16.0 CatFlow (archivado) |
| [milestones/v24.0-catpower-templates.md](milestones/v24.0-catpower-templates.md) | Spec v24.0 (archivado) |

---

*Creado: 2026-03-21*
*Ultima actualizacion: 2026-04-11* — añadida seccion Auditorias Activas + sesiones 25/29 + serie i18n + milestones v25.0/v25.1/v26.0/v26.1 + nota expansion v26.1 + v16.0 archivado en Otros Documentos
