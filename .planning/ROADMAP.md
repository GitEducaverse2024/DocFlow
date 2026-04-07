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
- **v25.1 Centro de Modelos** -- Phases 113-117 (in progress)

---

## v25.1 -- Centro de Modelos

**Goal:** Unificar las secciones dispersas de gestion de modelos en Settings en un "Centro de Modelos" con 4 tabs, health checks reales por alias/proveedor, y CatBot self-diagnosis. El usuario gestiona todo el ecosistema de modelos desde una sola seccion con visibilidad real de salud.

## Phases

- [x] **Phase 113: Health API** - Endpoint de verificacion real de salud por alias y proveedor con cache y timestamps (completed 2026-04-07)
- [x] **Phase 114: Centro de Modelos Shell + Tab Resumen** - Estructura de 4 tabs con deep linking y dashboard semaforo de salud (completed 2026-04-07)
- [x] **Phase 115: Tab Proveedores** - Cards compactas colapsables con edicion inline de API keys y test de conectividad (completed 2026-04-07)
- [x] **Phase 116: Tab Modelos** - MID unificado con costes inline, filtros por tier/uso, seccion "sin clasificar" (completed 2026-04-07)
- [ ] **Phase 117: Tab Enrutamiento + CatBot + Cleanup** - Tabla compacta con semaforos, CatBot self-diagnosis, eliminacion de secciones redundantes

## Phase Details

### Phase 113: Health API
**Goal**: La plataforma puede verificar en tiempo real la salud de cada alias y proveedor de modelos LLM
**Depends on**: Nothing (builds on v25.0 infrastructure)
**Requirements**: HEALTH-01, HEALTH-02, HEALTH-03, HEALTH-04, HEALTH-05
**Success Criteria** (what must be TRUE):
  1. GET /api/models/health devuelve status real (connected/error) para cada proveedor con latencia medida
  2. Cada alias muestra si resolvio directo, via fallback, o fallo, incluyendo el modelo concreto resuelto
  3. El resultado se cachea ~30s y el usuario puede forzar un refresco bajo demanda
  4. La respuesta incluye timestamp del ultimo check, consumible por la UI para mostrar "hace X min"
**Plans:** 1/1 plans complete
Plans:
- [ ] 113-01-PLAN.md — Health service + API route (types, orchestration, cache, endpoint)

### Phase 114: Centro de Modelos Shell + Tab Resumen
**Goal**: El usuario accede a toda la gestion de modelos desde una sola seccion con tabs navegables y ve de un vistazo la salud del ecosistema
**Depends on**: Phase 113
**Requirements**: TABS-01, TABS-02, TABS-03, TABS-04, RESUMEN-01, RESUMEN-02, RESUMEN-03, RESUMEN-04
**Success Criteria** (what must be TRUE):
  1. En Settings existe una seccion "Centro de Modelos" que reemplaza las secciones dispersas (MID, Costes, Embeddings)
  2. La seccion tiene 4 tabs navegables (Resumen, Proveedores, Modelos, Enrutamiento) con el tab activo persistido en URL
  3. El Tab Resumen muestra semaforos verde/rojo para cada proveedor (con latencia) y cada alias (directo/fallback/error)
  4. El boton "Verificar" refresca Discovery + MID sync + health check y el indicador muestra "Ultimo check: hace X min"
  5. Todas las claves de UI tienen traducciones en es.json y en.json
**Plans**: 2 plans
Plans:
- [ ] 114-01-PLAN.md — Tab shell structure with 4 tabs, URL persistence, i18n, settings page rewiring
- [ ] 114-02-PLAN.md — Tab Resumen health dashboard with semaphores, verify button, timestamp

### Phase 115: Tab Proveedores
**Goal**: El usuario gestiona API keys y endpoints de proveedores de forma compacta sin scroll infinito
**Depends on**: Phase 114
**Requirements**: PROV-01, PROV-02, PROV-03, PROV-04
**Success Criteria** (what must be TRUE):
  1. Cada proveedor se muestra como card colapsada por defecto (nombre + status + resumen de modelos)
  2. Al expandir, el usuario puede editar API key y endpoint inline sin ocupar pantalla completa
  3. El boton "Probar" por proveedor verifica conectividad real y muestra resultado inmediato
  4. La seccion de API Keys separada de la pagina principal de Settings desaparece (sin duplicacion)
**Plans**: 2 plans
Plans:
- [ ] 115-01-PLAN.md — TabProveedores component with collapsible accordion cards, inline editing, health semaphores
- [ ] 115-02-PLAN.md — Remove old ProviderCard/PROVIDER_META dead code from page.tsx

### Phase 116: Tab Modelos
**Goal**: El usuario ve y gestiona todas las fichas MID con costes, filtros y clasificacion desde un solo lugar
**Depends on**: Phase 114
**Requirements**: MODELOS-01, MODELOS-02, MODELOS-03, MODELOS-04, MODELOS-05, MODELOS-06
**Success Criteria** (what must be TRUE):
  1. Las MID cards se agrupan por tier (Elite, Pro, Libre) con conteo visible
  2. El usuario puede filtrar por tier, por "solo en uso" (asignados a alias), y por proveedor
  3. Cada card muestra badge "en uso" indicando que aliases consumen ese modelo
  4. Modelos auto-detectados por Discovery sin ficha MID aparecen en seccion "Sin clasificar"
  5. Los costes se editan inline dentro de la ficha MID (la tabla de Costes separada y la seccion Embeddings placeholder se eliminan)
**Plans**: 2 plans
Plans:
- [ ] 116-01-PLAN.md — TabModelos component with tier grouping, filters, en-uso badges, sin-clasificar section
- [ ] 116-02-PLAN.md — Inline cost editing + remove ModelPricingSettings and Embeddings dead code

### Phase 117: Tab Enrutamiento + CatBot + Cleanup
**Goal**: El usuario gestiona alias routing con visibilidad de disponibilidad, CatBot puede auto-diagnosticar la salud de sus modelos, y las secciones redundantes desaparecen
**Depends on**: Phase 113, Phase 115, Phase 116
**Requirements**: ROUTING-01, ROUTING-02, ROUTING-03, ROUTING-04, CATBOT-01, CATBOT-02, CATBOT-03
**Success Criteria** (what must be TRUE):
  1. La tabla de enrutamiento muestra alias, modelo, semaforo de estado y tier en formato compacto
  2. El dropdown de modelo filtra modelos no disponibles (gris + warning) y verifica disponibilidad antes de confirmar cambio
  3. CatBot puede ejecutar check_model_health para verificar conectividad real de un modelo/alias, recibiendo status, latencia, fallback y errores
  4. CatBot puede hacer self-diagnosis ("voy a verificar si mis modelos funcionan") y reportar resultados al usuario
**Plans**: TBD

---

### Dependencies

```
113 (Health API)
    |
    v
114 (Shell + Resumen) --+--> 115 (Proveedores)
                        |
                        +--> 116 (Modelos)
                        |
113 + 115 + 116 ------> 117 (Enrutamiento + CatBot + Cleanup)
```

## Progress

| 1/1 | Complete    | 2026-04-07 | Completed |
|-------|----------------|--------|-----------|
| 113. Health API | 0/1 | Planning complete | - |
| 114. Centro de Modelos Shell + Tab Resumen | 2/2 | Complete    | 2026-04-07 |
| 115. Tab Proveedores | 2/2 | Complete    | 2026-04-07 |
| 116. Tab Modelos | 2/2 | Complete    | 2026-04-07 |
| 117. Tab Enrutamiento + CatBot + Cleanup | 0/TBD | Not started | - |

---
*Created: 2026-04-07*
*Last updated: 2026-04-07*
