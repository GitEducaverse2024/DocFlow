# Requirements: DoCatFlow

**Defined:** 2026-03-15
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v11.0 Requirements

Requirements for milestone v11.0: LinkedIn MCP Connector. Integrar servicio LinkedIn MCP como componente nativo de DoCatFlow con scripts de instalacion, rate limiting, seed en BD, health monitoring y CatBot awareness.

### LinkedIn MCP Connector

- [ ] **LI-MCP-01**: Scripts de instalacion en `scripts/linkedin-mcp/` con setup.sh (clone, rebrand, systemd), servicio systemd, rate_limiter.py, y README.md
- [ ] **LI-MCP-02**: Rate limiter Python con limites anti-ban por tool (get_person_profile: 10/h, search_people: 5/h, total: 30/h) y estado persistido en JSON
- [ ] **LI-MCP-03**: Seed conector `seed-linkedin-mcp` en tabla connectors (tipo mcp_server) con las 6 tools de LinkedIn descritas y config de rate limiting
- [ ] **LI-MCP-04**: Endpoint `/api/health` incluye `linkedin_mcp` con status online/offline, latencia, y flag configured
- [ ] **LI-MCP-05**: Panel `/system` muestra tarjeta LinkedIn MCP (condicional a LINKEDIN_MCP_URL configurado) y footer muestra dot de estado
- [ ] **LI-MCP-06**: CatBot conoce el conector LinkedIn MCP via FEATURE_KNOWLEDGE y buildSystemPrompt menciona LinkedIn MCP condicionalmente

### Hotfix

- [x] **LI-HOTFIX-01**: Alias `list_workers` en catbot-tools.ts redirige a `list_cat_paws` (gap de Phase 46)

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
| Multi-cuenta LinkedIn | Una cuenta dedicada es suficiente |
| Rate limiter distribuido | Single-server, estado local en JSON suficiente |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LI-MCP-01 | Phase 47 | Pending |
| LI-MCP-02 | Phase 47 | Pending |
| LI-MCP-03 | Phase 47 | Pending |
| LI-MCP-04 | Phase 47 | Pending |
| LI-MCP-05 | Phase 47 | Pending |
| LI-MCP-06 | Phase 47 | Pending |
| LI-HOTFIX-01 | Phase 47 | Complete |

**Coverage:**
- v11.0 requirements: 7 total
- Mapped to phases: 7/7 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Milestone: v11.0 — LinkedIn MCP Connector*
