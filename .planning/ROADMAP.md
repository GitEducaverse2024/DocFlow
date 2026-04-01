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
- **v24.0 CatPower — Email Templates** -- Phases 99-106 (current)

---

## v24.0 -- CatPower: Email Templates con Editor Visual

**Goal:** Modulo CatPower que agrupa Skills + Conectores + Templates. Editor visual drag-and-drop de plantillas email con bloques (logo, imagen, video, texto, instruccion LLM), sistema de filas/columnas, assets en Drive, preview HTML en tiempo real, e integracion con canvas/agentes via conector + skill inteligente.

**Repo:** `~/docflow/app/` (todo en DoCatFlow)

**Dependencies resueltas:** Gmail tools (mark_as_read, reply, CC, HTML), executeCatPaw con Gmail/Drive/MCP tools, canvas comerciales funcionando, RAG con chunking contextual.

## Phases

- [ ] **Phase 99: CatPower — Reorganizacion menu** — Nuevo modulo /catpower con tabs (Skills, Conectores, Templates), mover rutas, redirects, actualizar CatBot
- [ ] **Phase 100: DB + API Templates** — Tabla email_templates + template_assets, CRUD completo, API render
- [ ] **Phase 101: Editor visual — estructura y bloques** — Editor 3 secciones, 5 tipos de bloque (logo, imagen, video, texto, instruccion), añadir/eliminar bloques
- [ ] **Phase 102: Editor visual — layout filas/columnas + drag-and-drop** — Sistema de filas con 1-2 columnas, drag-and-drop con @dnd-kit, reordenar bloques/filas
- [ ] **Phase 103: Preview HTML + estilos** — Renderizado HTML email-compatible, preview en tiempo real, panel de estilos, envio de test
- [ ] **Phase 104: Assets — upload imagenes a Drive** — Upload desde editor, carpeta por template en Drive, URL publica, galeria de assets
- [ ] **Phase 105: Integracion — conector + skill + tools** — Conector email_template, tools list/get/render, skill Maquetador, soporte en execute-catpaw.ts
- [ ] **Phase 106: Seeds + documentacion + i18n** — 4 templates iniciales, docs knowledge base, claves i18n, build limpio

## Phase Details

### Phase 99: CatPower — Reorganizacion menu
**Goal**: Existe un nuevo modulo /catpower en el menu lateral con 3 tabs (Skills, Conectores, Templates). Las rutas antiguas /skills y /connectors redirigen correctamente.
**Depends on**: Nothing (first phase)
**Requirements**: MENU-01, MENU-02, MENU-03, MENU-04, MENU-05, MENU-06, MENU-07
**Success Criteria**:
  1. Menu lateral muestra CatPower con icono, expandible o con sub-rutas
  2. /catpower/skills renderiza la pagina de skills existente
  3. /catpower/connectors renderiza la pagina de conectores existente
  4. /catpower/templates muestra placeholder "Proximamente"
  5. /skills redirige a /catpower/skills (301)
  6. /connectors redirige a /catpower/connectors (301)
  7. CatBot navigate_to actualizado con nuevas rutas

### Phase 100: DB + API Templates
**Goal**: Existe tabla email_templates con CRUD completo y API de renderizado. Se puede crear, editar, listar y borrar templates via API.
**Depends on**: Phase 99
**Requirements**: DB-01, DB-02, DB-03, API-01, API-02, API-03, API-04, API-05, API-06, API-07
**Success Criteria**:
  1. Tabla email_templates existe con migracion en db.ts
  2. POST /api/email-templates crea template con structure JSON
  3. GET /api/email-templates lista con filtros
  4. PATCH actualiza, DELETE borra
  5. POST /api/email-templates/[id]/assets sube asset y devuelve URL
  6. POST /api/email-templates/[id]/render genera HTML desde structure + variables

### Phase 101: Editor visual — estructura y bloques
**Goal**: Existe una pagina /catpower/templates/[id] con editor visual de 3 secciones donde se pueden añadir bloques de 5 tipos (logo, imagen, video, texto, instruccion) con configuracion individual.
**Depends on**: Phase 100
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, BLK-01, BLK-02, BLK-03, BLK-04, BLK-05, BLK-06
**Success Criteria**:
  1. /catpower/templates muestra lista de templates con cards
  2. /catpower/templates/new abre editor vacio con 3 secciones
  3. Cada seccion tiene boton "Añadir bloque" con selector de tipo
  4. Bloque Logo: upload + posicion (izq/centro/der) + tamaño
  5. Bloque Imagen: upload/URL + alineacion + alt text
  6. Bloque Video: input URL YouTube + thumbnail auto
  7. Bloque Texto: editor con negrita, cursiva, links, listas
  8. Bloque Instruccion: textarea con fondo diferenciado
  9. Cada bloque tiene opciones de alineacion

### Phase 102: Editor visual — layout filas/columnas + drag-and-drop
**Goal**: Los bloques se organizan en filas de 1-2 columnas con drag-and-drop para reordenar. Un logo puede estar a la izquierda con un banner a la derecha en la misma fila.
**Depends on**: Phase 101
**Requirements**: LAY-01, LAY-02, LAY-03, LAY-04, LAY-05, LAY-06, LAY-07, BLK-07
**Success Criteria**:
  1. Cada seccion muestra filas, cada fila tiene 1 o 2 columnas
  2. Boton "Añadir al lado" crea segunda columna en la fila
  3. Drag-and-drop reordena filas dentro de seccion
  4. Drag-and-drop mueve bloques entre columnas/filas
  5. Layout responsivo: 2 columnas en desktop, apilan en mobile
  6. Logo izquierda + banner derecha funciona visualmente

### Phase 103: Preview HTML + estilos
**Goal**: El editor muestra preview HTML en tiempo real en panel lateral. El HTML generado es compatible con clientes de email (table layout, inline styles).
**Depends on**: Phase 101
**Requirements**: STY-01, STY-02, STY-03, STY-04, STY-05, STY-06, PRV-01, PRV-02, PRV-03, PRV-04, PRV-05, PRV-06
**Success Criteria**:
  1. Panel lateral muestra preview actualizado en cada cambio
  2. HTML usa table-based layout con inline styles
  3. Estilos configurables: color fondo, color primario, fuente, color texto
  4. Instrucciones LLM visibles con placeholder estilizado
  5. Boton "Copiar HTML" funciona
  6. Boton "Enviar test" envia preview a email de prueba

### Phase 104: Assets — upload imagenes a Drive
**Goal**: Las imagenes del template se suben a Drive automaticamente con URL publica. Cada template tiene su carpeta en Drive.
**Depends on**: Phase 101
**Requirements**: AST-01, AST-02, AST-03, AST-04, AST-05, AST-06
**Success Criteria**:
  1. Upload desde bloque crea archivo en DoCatFlow/templates/{name}/ en Drive
  2. La URL devuelta es publica (sharing: anyone with link)
  3. Alternativa: pegar URL directa funciona
  4. Galeria de assets muestra todos los archivos del template
  5. Soporta PNG, JPG, GIF, SVG y URLs de YouTube

### Phase 105: Integracion — conector + skill + tools
**Goal**: Un agente en canvas puede consultar templates disponibles, seleccionar el apropiado, y generar HTML final con contenido real automaticamente.
**Depends on**: Phase 100, Phase 103
**Requirements**: INT-01, INT-02, INT-03, INT-04, INT-05, INT-06, INT-07
**Success Criteria**:
  1. Tool list_email_templates devuelve templates activos con descripcion
  2. Tool get_email_template devuelve estructura con bloques
  3. Tool render_email_template genera HTML final con variables
  4. Conector email_template se puede vincular a CatPaw
  5. Skill "Maquetador de Email" selecciona template correcto segun contexto
  6. Test E2E: Canvas Inbound envia email con template corporativo

### Phase 106: Seeds + documentacion + i18n
**Goal**: 4 templates seed, documentacion actualizada, claves i18n, build limpio.
**Depends on**: All previous phases
**Requirements**: SEED-01, SEED-02, SEED-03, SEED-04, TECH-01
**Success Criteria**:
  1. 4 templates seed creados (Corporativa, Informe, Comercial, Notificacion)
  2. GUIA_USUARIO.md, CONNECTORS.md, canvas-nodes.md actualizados
  3. Claves i18n en es.json y en.json
  4. npm run build pasa sin errores
  5. Docker build pasa sin errores

---

### Dependencies

```
99 (Menu CatPower) ──→ 100 (DB+API) ──→ 101 (Editor bloques) ──→ 102 (Layout D&D)
                                    │                           ──→ 103 (Preview+Estilos)
                                    │                           ──→ 104 (Assets Drive)
                                    └──────────────────────────────→ 105 (Integracion)
                                                                       ──→ 106 (Seeds+Docs)
```

Phases 102, 103, 104 son paralelas (dependen de 101 pero no entre si).
Phase 105 depende de 100 y 103.
Phase 106 depende de todo.

---

## Progress

| Phase | Status | Completed |
|-------|--------|-----------|
| 99. CatPower — Reorganizacion menu | Not started | - |
| 100. DB + API Templates | Not started | - |
| 101. Editor visual — bloques | Not started | - |
| 102. Layout filas/columnas + D&D | Not started | - |
| 103. Preview HTML + estilos | Not started | - |
| 104. Assets Drive | Not started | - |
| 105. Integracion conector + skill | In Progress (1/2 plans) | 2026-04-01 |
| 106. Seeds + docs + i18n | Not started | - |

---
*Created: 2026-04-01*
*Last updated: 2026-04-01*
