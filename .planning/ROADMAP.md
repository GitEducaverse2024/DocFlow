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
- **v20.0 CatPaw Directory -- Phases 87-90 (active)**

---

## v20.0 -- CatPaw Directory: Taxonomia de Negocio & UX Reorganizacion

**Goal:** Organizar los CatPaws en un directorio por departamentos con taxonomia de negocio, busqueda en tiempo real y rediseno completo de la pagina /agents. Milestone puramente UX/UI -- sin cambios en logica de ejecucion de agentes, canvas ni conectores.

**Repo:** `~/docflow/app/` (todo en DoCatFlow)

**Dependencies resueltas:** Tabla `cat_paws` existente, pagina /agents funcional, CatBot tools existentes, i18n bilingue (es/en) ya configurado.

## Phases

- [ ] **Phase 87: DB + API** - Columna department en cat_paws, validacion de valores, endpoints actualizados
- [ ] **Phase 88: Formulario con selector de departamento** - Selector obligatorio en wizard/formulario CatPaw con agrupacion visual
- [ ] **Phase 89: Directorio /agents rediseñado** - Secciones expandibles, busqueda, badges, estilos por grupo
- [ ] **Phase 90: CatBot + i18n + verificacion build** - Tool create_catpaw actualizada, i18n completo, build limpio

## Phase Details

### Phase 87: DB + API
**Goal**: Los CatPaws tienen un campo department persistido y accesible via API, con validacion contra la lista de 9 valores permitidos.
**Depends on**: Nothing (first phase)
**Requirements**: DB-01, DB-02, DB-03, API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. La tabla cat_paws tiene columna `department TEXT DEFAULT 'other'` y los agentes existentes aparecen como `other`
  2. GET /api/cat-paws devuelve el campo department en cada agente, y acepta query param `?department=` para filtrar
  3. POST /api/cat-paws acepta department en el body, lo valida contra los 9 valores permitidos, y rechaza con 400 si el valor es invalido
  4. PATCH /api/cat-paws/[id] permite actualizar el department de un agente existente
**Plans**: TBD

### Phase 88: Formulario con selector de departamento
**Goal**: El usuario elige departamento obligatoriamente al crear o editar un CatPaw, con un selector visual que agrupa las opciones por seccion (Empresa/Personal/Otros).
**Depends on**: Phase 87
**Requirements**: FORM-01, FORM-02, FORM-03, FORM-04, FORM-05
**Success Criteria** (what must be TRUE):
  1. El wizard/formulario de CatPaw muestra un selector de departamento obligatorio antes del campo nombre
  2. Cada opcion del selector muestra icono + nombre del departamento, agrupadas en Empresa (7 opciones), Personal y Otros
  3. Al crear un nuevo CatPaw sin seleccion explicita, el default es `other`
  4. No se puede guardar el formulario sin un departamento seleccionado (validacion activa)
**Plans**: TBD

### Phase 89: Directorio /agents rediseñado
**Goal**: La pagina /agents funciona como un directorio organizado por departamentos con secciones expandibles, busqueda en tiempo real con highlight, badges de departamento en tarjetas y estilos visuales diferenciados por grupo.
**Depends on**: Phase 87, Phase 88
**Requirements**: DIR-01, DIR-02, DIR-03, DIR-04, DIR-05, DIR-06, DIR-07, DIR-08, SEARCH-01, SEARCH-02, SEARCH-03, SEARCH-04, BADGE-01, BADGE-02, BADGE-03, STYLE-01, STYLE-02, STYLE-03
**Success Criteria** (what must be TRUE):
  1. La pagina muestra tres secciones principales (Empresa, Personal, Otros) con subsecciones de departamento dentro de Empresa, cada una con icono, nombre y badge de conteo
  2. Las secciones se expanden/colapsan con animacion; el estado se persiste en localStorage y se restaura al volver
  3. El input de busqueda filtra por nombre, descripcion, modelo y tags; las secciones con resultados se abren automaticamente y el texto coincidente se resalta en amarillo
  4. Cada CatPawCard muestra un badge de departamento (icono + nombre) con color segun grupo: violet Empresa, sky Personal, zinc Otros
  5. Secciones vacias se muestran atenuadas (opacity-50) sin flecha de expansion, con texto "(vacio)"
**Plans**: TBD

### Phase 90: CatBot + i18n + verificacion build
**Goal**: CatBot puede crear CatPaws con departamento, todos los textos tienen traduccion bilingue, y el build pasa limpio.
**Depends on**: Phase 87, Phase 88, Phase 89
**Requirements**: CATBOT-01, CATBOT-02, I18N-01, I18N-02, I18N-03, I18N-04, I18N-05, I18N-06, BUILD-01, BUILD-02
**Success Criteria** (what must be TRUE):
  1. La tool `create_catpaw` de CatBot acepta parametro `department` en su schema y asigna `other` si no se especifica
  2. Todos los nombres de departamento, labels de seccion, textos de estado, selector y busqueda tienen traduccion en es.json y en.json
  3. La aplicacion funciona correctamente en ambos idiomas (es y en) sin claves faltantes
  4. `npm run build` pasa sin errores con todos los cambios de v20.0
**Plans**: TBD

---

### Dependencies

```
87 (DB + API) ──→ 88 (Form selector) ──→ 89 (Directory page) ──→ 90 (CatBot + i18n + build)
```

Linear dependency chain: each phase builds on the previous. Phase 87 creates the data layer, 88 adds the form UI, 89 redesigns the listing page, 90 integrates CatBot and finalizes i18n + build verification.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 87. DB + API | 0/? | Not started | - |
| 88. Formulario con selector de departamento | 0/? | Not started | - |
| 89. Directorio /agents rediseñado | 0/? | Not started | - |
| 90. CatBot + i18n + verificacion build | 0/? | Not started | - |

---
*Created: 2026-03-30*
*Last updated: 2026-03-30*
