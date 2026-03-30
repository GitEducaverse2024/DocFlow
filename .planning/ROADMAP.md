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
- **v21.0 Skills Directory -- Phases 91-94 (active)**

---

## v21.0 -- Skills Directory: Nueva Taxonomia, Skills Externos & Rediseno UX

**Goal:** Reemplazar las 6 categorias tecnicas de skills por 5 orientadas a valor de negocio, anadir un catalogo curado de 20 skills nuevos, y redisenar la pagina /skills con el mismo patron de directorio expandible de v20.0. Milestone UX/UI + contenido -- sin cambios en logica de ejecucion ni inyeccion de skills.

**Repo:** `~/docflow/app/` (todo en DoCatFlow)

**Dependencies resueltas:** Tabla `skills` existente con 5 seeds, pagina /skills funcional, patron de directorio expandible probado en v20.0, i18n bilingue (es/en) configurado.

## Phases

- [ ] **Phase 91: DB + tipos + API + categoria en formulario** - Migracion de categorias, is_featured, tipos actualizados, API filtros, selector en Sheet editor
- [ ] **Phase 92: Seeds de 20 skills nuevos** - Contenido completo de instructions para los 20 skills curados
- [ ] **Phase 93: Directorio /skills rediseñado** - Secciones expandibles, busqueda, tarjeta rediseñada, pills de filtro
- [ ] **Phase 94: i18n + build + verificacion** - Todas las claves bilingues, build limpio

## Phase Details

### Phase 91: DB + tipos + API + categoria en formulario
**Goal**: Las categorias de skills estan actualizadas a la nueva taxonomia (writing/analysis/strategy/technical/format), los seeds existentes reclasificados, la columna is_featured existe, y el selector en el formulario muestra las nuevas opciones con iconos.
**Depends on**: Nothing (first phase)
**Requirements**: DB-01, DB-02, DB-03, CAT-01, CAT-02, CAT-03, API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. La interface Skill en types.ts tiene los 5 nuevos valores de category
  2. Los 5 seeds existentes tienen las categorias nuevas en la DB (verificable via API)
  3. La tabla skills tiene columna is_featured INTEGER DEFAULT 0
  4. GET /api/skills?category=writing devuelve los skills de esa categoria
  5. El selector de categoria en el Sheet editor muestra icono + nombre para las 5 categorias nuevas
**Plans**: TBD

### Phase 92: Seeds de 20 skills nuevos
**Goal**: La plataforma tiene al menos 25 skills (5 existentes + 20 nuevos) con contenido profesional y extenso en el campo instructions.
**Depends on**: Phase 91
**Requirements**: DB-04, SEED-01, SEED-02, SEED-03, SEED-04, SEED-05
**Success Criteria** (what must be TRUE):
  1. Hay 20 skills nuevos insertados como seeds en db.ts con insercion condicional
  2. Cada skill tiene instructions de minimo 200 palabras con: rol, proceso, reglas de formato, casos especiales
  3. Los skills estan distribuidos: 5 writing, 4 analysis, 5 strategy, 4 technical, 2 format
  4. Cada skill tiene name, description, category, tags, instructions, source='built-in'
**Plans**: TBD

### Phase 93: Directorio /skills rediseñado
**Goal**: La pagina /skills funciona como directorio organizado por categorias con secciones expandibles, busqueda en tiempo real con highlight, tarjeta rediseñada con metadata completa y pills de filtro.
**Depends on**: Phase 91, Phase 92
**Requirements**: DIR-01, DIR-02, DIR-03, DIR-04, DIR-05, DIR-06, SEARCH-01, SEARCH-02, SEARCH-03, SEARCH-04, CARD-01, CARD-02, CARD-03, CARD-04, CARD-05
**Success Criteria** (what must be TRUE):
  1. La pagina muestra 5 secciones expandibles (Escritura, Analisis, Estrategia, Tecnico, Formato) con icono, nombre y badge de conteo
  2. Las secciones se expanden/colapsan con flecha animada; estado persiste en localStorage
  3. La busqueda filtra por nombre, descripcion y tags; secciones con resultados se abren automaticamente y texto coincidente se resalta
  4. La tarjeta muestra: badge categoria, tags, source, version, times_used, botones de accion
  5. Los pills de filtro rapido por categoria funcionan junto al buscador
**Plans**: TBD

### Phase 94: i18n + build + verificacion
**Goal**: Todos los textos tienen traduccion bilingue y el build pasa limpio.
**Depends on**: Phase 91, Phase 92, Phase 93
**Requirements**: I18N-01, I18N-02, I18N-03, I18N-04, I18N-05, BUILD-01, BUILD-02
**Success Criteria** (what must be TRUE):
  1. Todas las claves i18n de categorias, fuentes, secciones, tarjeta y busqueda presentes en es.json y en.json
  2. La aplicacion funciona correctamente en ambos idiomas sin claves faltantes
  3. `npm run build` pasa sin errores
**Plans**: TBD

---

### Dependencies

```
91 (DB + tipos + API) ──→ 92 (Seeds) ──→ 93 (Directory page) ──→ 94 (i18n + build)
```

Linear dependency chain: Phase 91 creates the data layer, 92 populates content, 93 redesigns the UI, 94 finalizes i18n + build verification.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 91. DB + tipos + API + formulario | 0/? | Not started | - |
| 92. Seeds de 20 skills nuevos | 0/? | Not started | - |
| 93. Directorio /skills rediseñado | 0/? | Not started | - |
| 94. i18n + build + verificacion | 0/? | Not started | - |

---
*Created: 2026-03-30*
*Last updated: 2026-03-30*
