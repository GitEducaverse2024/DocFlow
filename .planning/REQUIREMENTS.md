# Requirements: v20.0 CatPaw Directory

**Defined:** 2026-03-30
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v20.0 Requirements

Taxonomía de departamentos para CatPaws y rediseño de la página /agents como directorio organizado por secciones expandibles. Milestone puramente UX/UI — sin cambios en lógica de ejecución de agentes, canvas ni conectores.

### DB — Modelo de datos

- [ ] **DB-01**: Columna `department TEXT DEFAULT 'other'` en tabla `cat_paws` (ALTER TABLE con try-catch)
- [ ] **DB-02**: Valores permitidos: `direction`, `business`, `marketing`, `finance`, `production`, `logistics`, `hr`, `personal`, `other`
- [ ] **DB-03**: Agentes existentes sin departamento quedan como `other` automáticamente (DEFAULT)

### API — Endpoints

- [ ] **API-01**: `GET /api/cat-paws` incluye campo `department` en la respuesta
- [ ] **API-02**: `GET /api/cat-paws` acepta query param `?department=` para filtrar (opcional, puede filtrar en cliente)
- [ ] **API-03**: `POST /api/cat-paws` acepta `department` en body, valida contra lista permitida, default `other`
- [ ] **API-04**: `PATCH /api/cat-paws/[id]` acepta `department` en body de actualización

### DIR — Directorio / Página /agents

- [ ] **DIR-01**: Página /agents muestra tres secciones expandibles principales: Empresa, Personal, Otros
- [ ] **DIR-02**: Dentro de Empresa, 7 subsecciones expandibles: Dirección, Negocio, Marketing, Finanzas, Producción, Logística, RRHH
- [ ] **DIR-03**: Cada sección muestra icono + nombre + badge de conteo de agentes
- [ ] **DIR-04**: Secciones vacías (0 agentes) se muestran atenuadas (opacity-50), sin flecha de expansión, texto "(vacío)"
- [ ] **DIR-05**: Estado inicial: Empresa expandida + subdepartamento con más agentes expandido; Personal y Otros colapsados
- [ ] **DIR-06**: Estado de expansión persistido en localStorage, restaurado al volver a la página
- [ ] **DIR-07**: Headers de grupo principal: fondo zinc-900/60, borde izquierdo 3px color acento, hover:bg-zinc-800/40, flecha animada
- [ ] **DIR-08**: Subdepartamentos: fondo transparente, borde izquierdo 2px sutil, indentación visual

### SEARCH — Búsqueda en tiempo real

- [ ] **SEARCH-01**: Input de búsqueda filtra por nombre, descripción, modelo y tags del agente
- [ ] **SEARCH-02**: Al buscar, secciones con resultados se abren automáticamente, secciones sin resultados se colapsan
- [ ] **SEARCH-03**: Highlight en amarillo suave del texto coincidente dentro del nombre de la tarjeta
- [ ] **SEARCH-04**: Estado vacío con ilustración y texto "No se encontraron CatPaws para esa búsqueda"

### FORM — Formulario de creación/edición

- [ ] **FORM-01**: Selector de departamento obligatorio en wizard/formulario de CatPaw (antes del campo nombre o primera sección)
- [ ] **FORM-02**: Default al crear: `other`
- [ ] **FORM-03**: Selector muestra icono + nombre del departamento en cada opción
- [ ] **FORM-04**: Select con grupos: Empresa (7 opciones con separador), Personal, Otros
- [ ] **FORM-05**: Validación: no se puede guardar sin departamento seleccionado

### BADGE — Badge de departamento en tarjeta

- [ ] **BADGE-01**: Badge de departamento visible en cada CatPawCard debajo del nombre, junto a tags existentes
- [ ] **BADGE-02**: Badge muestra icono (12px) + nombre del departamento
- [ ] **BADGE-03**: Color del badge según grupo: violet para Empresa, sky para Personal, zinc para Otros

### STYLE — Colores y estética

- [ ] **STYLE-01**: Empresa: acento violet-400 / violet-900 (icono, badge, línea activa)
- [ ] **STYLE-02**: Personal: acento sky-400 / sky-900
- [ ] **STYLE-03**: Otros: acento zinc-400 / zinc-800 (aspecto neutro)

### CATBOT — CatBot tool

- [ ] **CATBOT-01**: Tool `create_catpaw` actualizada con parámetro `department` en schema
- [ ] **CATBOT-02**: Si el usuario no especifica departamento via CatBot, asignar `other` como fallback

### I18N — Internacionalización

- [ ] **I18N-01**: Nombres de departamento en namespace `agents`: `department.direction`, `department.business`, etc. (es + en)
- [ ] **I18N-02**: Labels de secciones: `section.company`, `section.personal`, `section.other` (es + en)
- [ ] **I18N-03**: Textos de estado: `section.empty`, `section.agents` con count (es + en)
- [ ] **I18N-04**: Selector: `form.department`, `form.departmentPlaceholder`, `form.departmentRequired` (es + en)
- [ ] **I18N-05**: Búsqueda: `search.noResults`, `search.noResultsHint` (es + en)
- [ ] **I18N-06**: Tooltip badge: `badge.department` (es + en)

### BUILD — Verificación

- [ ] **BUILD-01**: `npm run build` pasa sin errores
- [ ] **BUILD-02**: Ambos idiomas (es/en) funcionan correctamente

## Future Requirements

### CatPaw Directory Enhancements (deferred)

- **FUTURE-01**: Taxonomía de departamentos editable por el usuario
- **FUTURE-02**: Drag-and-drop para reordenar agentes dentro de secciones
- **FUTURE-03**: Subdepartamentos personalizables (crear/renombrar)
- **FUTURE-04**: Filtro combinado departamento + tipo (Chat/Procesador/Híbrido) en URL query params
- **FUTURE-05**: Vista de tabla alternativa (toggle grid/table)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Taxonomía editable por usuario | Complejidad de UI para v20.0 — jerarquía fija suficiente |
| Drag-and-drop de agentes | No necesario para organización inicial |
| Cambios en CatPawCard interna | Solo se añade badge, estructura interna sin cambios |
| Página de detalle /agents/[id] | Sin cambios en v20.0 |
| CatPawChatSheet | Sin cambios en v20.0 |
| Lógica de ejecución de agentes | Milestone puramente UX/UI |
| Sistema de skills y conectores | Sin cambios en v20.0 |
| Canvas y CatFlow | Sin cambios en v20.0 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01..03 | Phase 87 | Pending |
| API-01..04 | Phase 87 | Pending |
| FORM-01..05 | Phase 88 | Pending |
| DIR-01..08 | Phase 89 | Pending |
| SEARCH-01..04 | Phase 89 | Pending |
| BADGE-01..03 | Phase 89 | Pending |
| STYLE-01..03 | Phase 89 | Pending |
| CATBOT-01..02 | Phase 90 | Pending |
| I18N-01..06 | Phase 90 | Pending |
| BUILD-01..02 | Phase 90 | Pending |

**Coverage:**
- v20.0 requirements: 40 total
- Mapped to phases: 40
- Unmapped: 0

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 after initial definition*
