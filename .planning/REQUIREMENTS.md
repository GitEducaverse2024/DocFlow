# Requirements: v21.0 Skills Directory

**Defined:** 2026-03-30
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v21.0 Requirements

Nueva taxonomia de categorias para skills, catalogo curado de ~20 skills nuevos, y rediseno de la pagina /skills como directorio expandible. Milestone UX/UI + contenido -- sin cambios en logica de ejecucion ni inyeccion de skills.

### DB -- Modelo de datos

- [ ] **DB-01**: Nuevos valores validos de category: `writing`, `analysis`, `strategy`, `technical`, `format` (reemplazando documentation, communication, code, design)
- [ ] **DB-02**: Migracion de categorias de los 5 seeds existentes: redaccion-ejecutiva->writing, diagramas-mermaid->format, formato-diataxis->format, analisis-dafo->strategy, tests-unitarios->technical
- [ ] **DB-03**: Columna `is_featured INTEGER DEFAULT 0` en tabla skills (ALTER TABLE con try-catch)
- [x] **DB-04**: Seeds de 20 skills nuevos con instructions completas (min 200 palabras cada uno), insertados condicionalmente si COUNT < 25

### CAT -- Categorias y taxonomia

- [ ] **CAT-01**: 5 categorias con iconos y colores: writing/Pen/emerald, analysis/ChartBar/blue, strategy/Target/violet, technical/Code2/amber, format/LayoutTemplate/cyan
- [ ] **CAT-02**: Interface Skill en types.ts actualizada con los 5 nuevos valores de category
- [ ] **CAT-03**: Selector de categoria en Sheet editor actualizado con las 5 nuevas opciones (icono + nombre)

### SEED -- Skills nuevos (20 total)

- [x] **SEED-01**: 5 skills de categoria writing: business-writing-formal, proposal-writer, social-media-content, executive-briefing, email-professional
- [x] **SEED-02**: 4 skills de categoria analysis: deep-research, decision-framework, competitive-analysis, data-interpreter
- [x] **SEED-03**: 5 skills de categoria strategy: strategy-document, product-roadmap, okr-generator, risk-assessment, business-case
- [x] **SEED-04**: 4 skills de categoria technical: code-reviewer, api-documenter, technical-writer, academic-researcher
- [x] **SEED-05**: 2 skills de categoria format: brand-voice, structured-output

### API -- Endpoints

- [ ] **API-01**: GET /api/skills acepta `?category=` con los 5 nuevos valores
- [ ] **API-02**: POST /api/skills acepta los nuevos valores de category
- [ ] **API-03**: GET /api/skills devuelve campo is_featured en la respuesta

### DIR -- Directorio / Pagina /skills

- [ ] **DIR-01**: Pagina /skills muestra 5 secciones expandibles por categoria: Escritura, Analisis, Estrategia, Tecnico, Formato
- [ ] **DIR-02**: Cada seccion muestra icono + nombre + badge de conteo de skills + color de categoria
- [ ] **DIR-03**: Secciones vacias (0 skills) se muestran atenuadas (opacity-50), sin flecha, texto "(vacio)"
- [ ] **DIR-04**: Estado inicial: primera seccion con skills expandida, resto colapsado
- [ ] **DIR-05**: Estado de expansion persistido en localStorage con clave `skills-sections-state`
- [ ] **DIR-06**: Headers de seccion: fondo zinc-900/60, borde izquierdo 3px color categoria, hover:bg-zinc-800/40, flecha animada

### SEARCH -- Busqueda en tiempo real

- [ ] **SEARCH-01**: Input de busqueda filtra por nombre, descripcion y tags del skill
- [ ] **SEARCH-02**: Al buscar, secciones con resultados se abren automaticamente, sin resultados se colapsan
- [ ] **SEARCH-03**: Highlight amarillo del texto coincidente en nombre de la tarjeta
- [ ] **SEARCH-04**: Estado vacio con ilustracion y texto "No se encontraron skills"

### CARD -- Tarjeta de skill rediseñada

- [ ] **CARD-01**: Tarjeta muestra: nombre con icono categoria, descripcion (2 lineas truncadas), badge categoria con color
- [ ] **CARD-02**: Tags (max 3 visibles, "+N mas" si hay overflow)
- [ ] **CARD-03**: Metadata: source badge (built-in/user/imported), version, times_used con icono
- [ ] **CARD-04**: Botones de accion: Editar, Asignar, Duplicar, Exportar, Eliminar
- [ ] **CARD-05**: Pills de filtro rapido por categoria: [Todos] [Escritura] [Analisis] [Estrategia] [Tecnico] [Formato]

### I18N -- Internacionalizacion

- [ ] **I18N-01**: Nombres de categorias en namespace skills: `category.writing`, `category.analysis`, `category.strategy`, `category.technical`, `category.format` (es + en)
- [ ] **I18N-02**: Labels de fuente: `source.builtin`, `source.user`, `source.imported`, `source.openclaw` (es + en)
- [ ] **I18N-03**: Secciones: `section.skills` con count, `section.empty` (es + en)
- [ ] **I18N-04**: Tarjeta: `card.uses`, `card.assign`, `card.featured` (es + en)
- [ ] **I18N-05**: Busqueda: `search.noResults`, `search.noResultsHint` (es + en)

### BUILD -- Verificacion

- [ ] **BUILD-01**: `npm run build` pasa sin errores
- [ ] **BUILD-02**: Ambos idiomas (es/en) funcionan correctamente

## Future Requirements

- **FUTURE-01**: Seccion "Destacados" usando is_featured para mostrar skills recomendados
- **FUTURE-02**: Importacion de skills desde URL de repositorio GitHub
- **FUTURE-03**: Valoracion/rating de skills por el usuario

## Out of Scope

| Feature | Reason |
|---------|--------|
| Logica de inyeccion de skills | No cambia en v21.0 |
| Relaciones worker_skills y agent_skills | No cambian en v21.0 |
| Importacion desde OpenClaw | Ya existe, no se modifica |
| Sheet editor de skills (estructura) | Se mantiene, solo se actualiza selector de categoria |
| Pagina de detalle de skill | No existe, no se crea en v21.0 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01..04 | Phase 91 | Pending |
| CAT-01..03 | Phase 91 | Pending |
| SEED-01..05 | Phase 92 | **Complete** |
| API-01..03 | Phase 91 | Pending |
| DIR-01..06 | Phase 93 | Pending |
| SEARCH-01..04 | Phase 93 | Pending |
| CARD-01..05 | Phase 93 | Pending |
| I18N-01..05 | Phase 94 | Pending |
| BUILD-01..02 | Phase 94 | Pending |

**Coverage:**
- v21.0 requirements: 40 total
- Mapped to phases: 40
- Unmapped: 0

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 after initial definition*
