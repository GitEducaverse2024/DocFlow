# Requirements: DoCatFlow

**Defined:** 2026-03-16
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v12.0 Requirements

Requirements for milestone v12.0: WebSearch CatBrain. Dotar a DoCatFlow de capacidad de busqueda web reutilizable mediante SearXNG self-hosted, Gemini grounding y un CatBrain especial WebSearch con selector de motor.

### Infraestructura SearXNG

- [x] **SRXNG-01**: Servicio `docflow-searxng` en docker-compose.yml basado en `searxng/searxng:latest`, puerto 8080, volumen para settings.yml persistente
- [x] **SRXNG-02**: Fichero `searxng/settings.yml` con formato JSON activado, motores configurados (Brave, DuckDuckGo, Google, Wikipedia), y secret key via env var
- [x] **SRXNG-03**: Variable `SEARXNG_URL` en `.env` con valor `http://{IP}:8080`, leida con bracket notation
- [x] **SRXNG-04**: Seed connector `seed-searxng` en db.ts tipo `http_api` con URL, timeout 15s, campos de respuesta y max_results 8
- [x] **SRXNG-05**: Health check de SearXNG en `/api/health` (GET a /search?q=test&format=json), condicional a SEARXNG_URL definido, timeout 3s
- [x] **SRXNG-06**: Tarjeta SearXNG en `/system` con icono de lupa, estado online/offline, solo si SEARXNG_URL definido

### Gemini Grounding

- [x] **GMNGG-01**: Modelo `gemini-search` como alias en routing.yaml de LiteLLM con parametros de Vertex AI
- [x] **GMNGG-02**: Seed connector `seed-gemini-search` en db.ts tipo `http_api` que llama a LiteLLM con googleSearch tool
- [x] **GMNGG-03**: Endpoint POST `/api/websearch/gemini` que recibe query, llama a LiteLLM con gemini-search + googleSearch tool, devuelve resultados extraidos de grounding_metadata
- [x] **GMNGG-04**: Modelo `gemini-search` seleccionable como motor en el CatBrain WebSearch

### CatBrain WebSearch

- [x] **WSCB-01**: Seed CatBrain `seed-catbrain-websearch` en db.ts con system prompt especializado, emoji busqueda, search_engine "auto"
- [x] **WSCB-02**: Columna `search_engine` (TEXT, default null) en tabla catbrains via ALTER TABLE migration
- [x] **WSCB-03**: Columna `is_system` (INTEGER, default 0) en tabla catbrains para proteger CatBrains de sistema
- [x] **WSCB-04**: Endpoint POST `/api/websearch/search` con orquestacion multi-motor (SearXNG/Gemini/Ollama/auto), fallback automatico, max 500 chars query
- [x] **WSCB-05**: Servicio `execute-websearch.ts` con funcion executeWebSearch() que formatea output como markdown legible para pipelines
- [x] **WSCB-06**: Integracion en canvas-executor.ts — nodo CATBRAIN con id seed-catbrain-websearch usa executeWebSearch()
- [x] **WSCB-07**: Integracion en task-executor.ts — pasos CATBRAIN WebSearch usan executeWebSearch()

### UI WebSearch

- [x] **WSCBUI-01**: Badge "Sistema" en la card del CatBrain WebSearch, icono candado en lugar de boton eliminar
- [x] **WSCBUI-02**: Pestana "Motor de Busqueda" en detalle del CatBrain WebSearch con selector Auto/SearXNG/Gemini/Ollama y estado en tiempo real
- [x] **WSCBUI-03**: Test de busqueda en la UI — input de query + boton probar + resultados formateados
- [x] **WSCBUI-04**: Badge de motor activo en el nodo CATBRAIN WebSearch del Canvas
- [x] **WSCBUI-05**: Proteccion eliminacion — DELETE `/api/catbrains/[id]` rechaza con 403 si is_system: 1

### Actualizacion y Documentacion

- [ ] **UPD-01**: Script `scripts/update-searxng.sh` ejecutable para pull + restart del contenedor SearXNG
- [ ] **UPD-02**: Seccion "Mantenimiento de SearXNG" en guia de instalacion con comando de actualizacion y cron semanal
- [x] **UPD-03**: Variables `SEARXNG_URL` y `SEARXNG_SECRET_KEY` documentadas en .env con instrucciones

### Testing

- [ ] **TEST-01**: Tests E2E Playwright para infraestructura WebSearch (health check, connector test, endpoint search con cada motor)
- [ ] **TEST-02**: Tests E2E Playwright para CatBrain WebSearch (existe en lista, badge Sistema, proteccion eliminacion, selector motor, test busqueda)
- [ ] **TEST-03**: Tests API para WebSearch (health includes searxng, respeta max_results, sanitiza query, logs usage, fallback auto)

## v11.0 Requirements (COMPLETE)

<details>
<summary>7 requirements — all complete</summary>

### LinkedIn MCP Connector
- [x] **LI-MCP-01**: Scripts de instalacion en scripts/linkedin-mcp/
- [x] **LI-MCP-02**: Rate limiter Python con limites anti-ban
- [x] **LI-MCP-03**: Seed conector seed-linkedin-mcp en tabla connectors
- [x] **LI-MCP-04**: Health check LinkedIn MCP en /api/health
- [x] **LI-MCP-05**: Panel /system y footer dot para LinkedIn MCP
- [x] **LI-MCP-06**: CatBot awareness del conector LinkedIn MCP

### Hotfix
- [x] **LI-HOTFIX-01**: Alias list_workers en catbot-tools.ts

</details>

## v10.0 Requirements (COMPLETE)

<details>
<summary>50 requirements — all complete</summary>

### Modelo de Datos y Migracion
- [x] **DATA-01** through **DATA-08**: Tablas cat_paws, relaciones, migraciones

### API REST CatPaws
- [x] **API-01** through **API-12**: CRUD, relaciones, OpenClaw sync, backward compat

### Motor de Ejecucion
- [x] **EXEC-01** through **EXEC-05**: executeCatPaw, task/canvas integration

### UI Pagina de Agentes
- [x] **UI-01** through **UI-09**: Sidebar, grid, wizard, detalle, chat, selectores

### Polish y Compatibilidad
- [x] **POLISH-01** through **POLISH-05**: CatBot tools, banner, dashboard, seeds

### Testing y Validacion
- [x] **TEST-01** through **TEST-11**: Vitest, unit tests, E2E rewrite

</details>

## Future Requirements

- **TFUT-01**: Generacion automatica de tests con IA como script CLI independiente
- **TFUT-02**: Cobertura de codigo integrada en resultados
- **TFUT-03**: Tests de rendimiento/carga
- **SFUT-01**: Streaming en ejecucion de tareas multi-agente (paso a paso)
- **SFUT-02**: Streaming en ejecucion de canvas (nodo a nodo)
- **FFUT-01**: Exportar/importar CatBrain como unidad portable
- **FFUT-02**: Limite configurable de conectores por CatBrain
- **FFUT-03**: Variantes de color de icono por CatBrain
- **FFUT-04**: Canvas loop detection para redes de CatBrains
- **RFUT-01**: RAG R3 — Busqueda avanzada + reranking
- **RFUT-02**: RAG R4 — Escalabilidad + optimizacion

## Out of Scope

| Feature | Reason |
|---------|--------|
| LinkedIn scraping masivo | Riesgo de ban, solo consultas controladas con rate limiting |
| LinkedIn OAuth / API oficial | Requiere LinkedIn Partner Program, no disponible |
| SearXNG con autenticacion | Single-server internal, no expuesto a internet |
| Scraping directo de Google | SearXNG lo abstrae via metabusqueda |
| Rate limiter distribuido para SearXNG | Single-server, sin necesidad de coordinacion |
| Ollama Web Search como servicio self-hosted | Es API externa de ollama.com, no self-hosteable |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SRXNG-01 | Phase 48 | Complete |
| SRXNG-02 | Phase 48 | Complete |
| SRXNG-03 | Phase 48 | Complete |
| SRXNG-04 | Phase 48 | Complete |
| SRXNG-05 | Phase 48 | Complete |
| SRXNG-06 | Phase 48 | Complete |
| GMNGG-01 | Phase 48 | Complete |
| GMNGG-02 | Phase 48 | Complete |
| GMNGG-03 | Phase 48 | Complete |
| GMNGG-04 | Phase 49 | Complete |
| WSCB-01 | Phase 49 | Complete |
| WSCB-02 | Phase 49 | Complete |
| WSCB-03 | Phase 49 | Complete |
| WSCB-04 | Phase 49 | Complete |
| WSCB-05 | Phase 49 | Complete |
| WSCB-06 | Phase 49 | Complete |
| WSCB-07 | Phase 49 | Complete |
| WSCBUI-01 | Phase 49 | Complete |
| WSCBUI-02 | Phase 49 | Complete |
| WSCBUI-03 | Phase 49 | Complete |
| WSCBUI-04 | Phase 49 | Complete |
| WSCBUI-05 | Phase 49 | Complete |
| UPD-01 | Phase 49 | Pending |
| UPD-02 | Phase 49 | Pending |
| UPD-03 | Phase 48 | Complete |
| TEST-01 | Phase 49 | Pending |
| TEST-02 | Phase 49 | Pending |
| TEST-03 | Phase 49 | Pending |

**Coverage:**
- v12.0 requirements: 28 total
- Mapped to phases: 28/28 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-03-16*
*Milestone: v12.0 — WebSearch CatBrain*
