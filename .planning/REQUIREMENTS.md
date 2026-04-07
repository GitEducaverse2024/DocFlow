# Requirements: v25.1 Centro de Modelos

**Defined:** 2026-04-07
**Core Value:** El usuario gestiona todo el ecosistema de modelos desde una sola seccion en Settings, con visibilidad real de salud y sin informacion fragmentada.

## Contexto

Tras v25.0 (Discovery, MID, Alias Routing, CatBot Orchestrator, UI), la gestion de modelos funciona pero esta dispersa en 5-6 secciones de Settings (~8000px de scroll). El usuario ve la misma informacion de modelos en sitios distintos, no tiene indicador de salud real, y Discovery muestra ~140 modelos irrelevantes. Este milestone unifica todo en un "Centro de Modelos" con 4 tabs y health checks reales.

## v25.1 Requirements

### HEALTH -- API de Salud de Modelos

- [x] **HEALTH-01**: Endpoint /api/models/health que ejecuta resolveAlias() para cada alias y verifica disponibilidad real en LiteLLM
- [x] **HEALTH-02**: Status por proveedor (connected/error con latencia y conteo de modelos)
- [x] **HEALTH-03**: Status por alias (directo/fallback/error con modelo resuelto y modelo original)
- [x] **HEALTH-04**: Resultado cacheable con TTL corto (~30s), refrescable bajo demanda
- [x] **HEALTH-05**: Respuesta incluye timestamp del ultimo check para mostrar "hace X min" en UI

### TABS -- Estructura de Tabs del Centro de Modelos

- [x] **TABS-01**: Seccion "Centro de Modelos" en Settings reemplaza las secciones dispersas (MID, Costes, Embeddings)
- [x] **TABS-02**: Navegacion por 4 tabs: Resumen, Proveedores, Modelos, Enrutamiento
- [x] **TABS-03**: Tab activo persistido en URL query param para deep linking
- [x] **TABS-04**: i18n completo (es.json + en.json) para todas las claves nuevas

### RESUMEN -- Tab Resumen (Dashboard de Salud)

- [x] **RESUMEN-01**: Vista semaforo de proveedores (verde/rojo con latencia y conteo de modelos)
- [x] **RESUMEN-02**: Vista semaforo de aliases (directo/fallback/error con modelo resuelto)
- [x] **RESUMEN-03**: Boton "Verificar" que refresca Discovery + MID sync + health check
- [x] **RESUMEN-04**: Indicador "Ultimo check: hace X min" con auto-refresh opcional

### PROV -- Tab Proveedores (API Keys Compactas)

- [x] **PROV-01**: Cards de proveedor colapsadas por defecto (nombre + status + modelos resumidos)
- [x] **PROV-02**: Expandir inline para editar API key y endpoint (sin ocupar pantalla completa)
- [x] **PROV-03**: Boton "Probar" por proveedor que verifica conectividad real
- [x] **PROV-04**: Eliminar sección de API Keys separada de la pagina principal de Settings (evitar duplicacion)

### MODELOS -- Tab Modelos (MID Unificado con Costes)

- [x] **MODELOS-01**: MID cards agrupadas por tier (Elite, Pro, Libre) con conteo
- [x] **MODELOS-02**: Filtros: por tier, "solo en uso" (asignados a algun alias), por proveedor
- [x] **MODELOS-03**: Badge "en uso" en card mostrando que aliases usan este modelo
- [x] **MODELOS-04**: Seccion "Sin clasificar" para modelos auto-detectados por Discovery sin ficha MID
- [x] **MODELOS-05**: Edicion inline de costes dentro de la ficha MID (eliminar tabla Costes separada)
- [x] **MODELOS-06**: Eliminar seccion "Embeddings" placeholder (no aporta valor)

### ROUTING -- Tab Enrutamiento (Tabla Compacta)

- [x] **ROUTING-01**: Tabla compacta con columnas: alias, modelo, estado (semaforo), tier
- [x] **ROUTING-02**: Dropdown de modelo filtra modelos no disponibles (gris + warning)
- [x] **ROUTING-03**: Semaforo de disponibilidad inline usando datos de /api/models/health
- [x] **ROUTING-04**: Verificacion de disponibilidad antes de confirmar cambio de alias

### CATBOT -- CatBot Self-Diagnosis

- [x] **CATBOT-01**: Tool check_model_health que verifica conectividad real de un modelo o alias
- [x] **CATBOT-02**: CatBot puede hacer self-diagnosis ("voy a verificar si mis modelos funcionan")
- [x] **CATBOT-03**: Resultado incluye status, latencia, si uso fallback, y error si fallo

## Futuro (v26+)

### Mejoras diferidas

- **AUTO-01**: Deprecacion automatica de modelos que desaparecen de Discovery tras X dias
- **AUTO-02**: Sync bidireccional MID-Discovery con deteccion de modelos retirados
- **AUTO-03**: Clasificacion bulk automatica de modelos "sin clasificar"
- **UNIFY-01**: Unificar litellm.resolveModel() y alias-routing.resolveAlias() en un solo servicio

## Out of Scope

| Feature | Reason |
|---------|--------|
| Health check con llamada LLM real (1-token test) | Coste de tokens innecesario — verificar existencia en /v1/models es suficiente |
| WebSocket para health updates en tiempo real | Polling es suficiente para single-user |
| Mover API Keys fuera de Settings completamente | Solo se reorganizan dentro de la nueva seccion |
| Editar seeds de MID desde UI | Seeds son para desarrollo, UI edita entradas existentes |
| Dashboard de costes acumulados por modelo | Requiere tracking de uso — fuera de scope de UI redesign |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HEALTH-01 | Phase 113 | Complete |
| HEALTH-02 | Phase 113 | Complete |
| HEALTH-03 | Phase 113 | Complete |
| HEALTH-04 | Phase 113 | Complete |
| HEALTH-05 | Phase 113 | Complete |
| TABS-01 | Phase 114 | Complete |
| TABS-02 | Phase 114 | Complete |
| TABS-03 | Phase 114 | Complete |
| TABS-04 | Phase 114 | Complete |
| RESUMEN-01 | Phase 114 | Complete |
| RESUMEN-02 | Phase 114 | Complete |
| RESUMEN-03 | Phase 114 | Complete |
| RESUMEN-04 | Phase 114 | Complete |
| PROV-01 | Phase 115 | Complete |
| PROV-02 | Phase 115 | Complete |
| PROV-03 | Phase 115 | Complete |
| PROV-04 | Phase 115 | Complete |
| MODELOS-01 | Phase 116 | Complete |
| MODELOS-02 | Phase 116 | Complete |
| MODELOS-03 | Phase 116 | Complete |
| MODELOS-04 | Phase 116 | Complete |
| MODELOS-05 | Phase 116 | Complete |
| MODELOS-06 | Phase 116 | Complete |
| ROUTING-01 | Phase 117 | Complete |
| ROUTING-02 | Phase 117 | Complete |
| ROUTING-03 | Phase 117 | Complete |
| ROUTING-04 | Phase 117 | Complete |
| CATBOT-01 | Phase 117 | Complete |
| CATBOT-02 | Phase 117 | Complete |
| CATBOT-03 | Phase 117 | Complete |

**Coverage:**
- v25.1 requirements: 30 total (7 categories)
- Mapped to phases: 30/30
- Unmapped: 0

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-07 -- Roadmap created, all requirements mapped to phases 113-117*
