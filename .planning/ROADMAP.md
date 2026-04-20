# Roadmap: DocFlow — Milestones v29.0 + v29.1

## Overview

**Milestone v29.0 — CatFlow Inbound + CRM** (scope original)
Construye un CatFlow completo de Inbound+CRM (email entrante → clasificación → operación CRM en Holded → respuesta con template) como piloto manual en 4 fases lineales: (145) crear CatPaw "Operador Holded" generalista con tools CRM, (146) construir manualmente el canvas Inbound+CRM de 8 nodos con data contracts verificados, (147) ejecutar tests E2E contra Holded real (lead nuevo, existente, spam), y (148) entrenar a CatBot con PARTE 21 del Orquestador para que construya el patron autonomamente.

**Status v29.0:** `gaps_found` (per audit 2026-04-20 en `v29.0-MILESTONE-AUDIT.md`). Phase 145 requiere fix de gaps (tests rojos + live-verify pendiente). Phases 146-148 no iniciadas. Path to completion: fix 145 → plan+execute 146 → 147 → 148 → re-audit.

**Milestone v29.1 — KB Runtime Integration** (split desde v29.0, 2026-04-20)
Materializa el Knowledge Base arquitectado en el PRD (`ANALYSIS-knowledge-base-architecture.md`) como infraestructura de conocimiento viva. Las fases 149 (KB Foundation), 150 (KB Populate desde DB) ya están entregadas. 151-155 continúan el PRD: migración estática (151), consumo por CatBot (152), creation-tool hooks (153), dashboard UI (154), limpieza final (155). Separadas a sub-milestone porque el KB sin consumidor (Fase 4 PRD = Phase 152) es infraestructura muerta — cerrarlo dentro de v29.0 sería admitir entrega incompleta del KB.

**Razón del split:** v29.0 original era 145-148 (CatFlow CRM piloto). Las fases KB se añadieron después como scope creep. Cerrar honestamente v29.0 con su scope original + abrir v29.1 para entregar el KB funcional completo.

## Phases

**Phase Numbering:** continua desde phase 144 (ultima de v28.0).

**v29.0 scope:** Phases 145-148.
**v29.1 scope:** Phases 149-155.

### v29.0 checklist
- [x] **Phase 145: CatPaw Operador Holded** - CatPaw generalista con system_prompt amplio y conector Holded MCP para cualquier operacion CRM (marked complete 2026-04-17 — has gaps per audit, needs fix)
- [ ] **Phase 146: CatFlow Inbound+CRM Manual** - Canvas de 8 nodos construido manualmente via API con data contracts completos
- [ ] **Phase 147: Tests E2E Inbound+CRM** - Validacion end-to-end contra Holded real (lead nuevo, existente, spam)
- [ ] **Phase 148: Entrenamiento CatBot Patron CRM** - PARTE 21 del Orquestador + CatBot construye canvas autonomamente >=80% correcto

### v29.1 checklist
- [x] **Phase 149: KB Foundation Bootstrap** - Estructura `.docflow-kb/` + schemas + servicio `knowledge-sync.ts` + CLI `kb-sync.cjs` (completed 2026-04-18)
- [x] **Phase 150: KB Populate desde DB** - CLI `--source db` que puebla 66 recursos reales desde tablas live (completed 2026-04-18)
- [x] **Phase 151: KB Migrate Static Knowledge** - Migrar `.planning/knowledge/*.md`, `app/data/knowledge/*.json`, skills estáticas al KB (in progress) (completed 2026-04-20)
- [x] **Phase 152: KB CatBot Consume** - Tools `get_kb_entry`/`search_kb` + prompt-assembler lee `_header.md` (completed 2026-04-20)
- [x] **Phase 153: KB Creation Tool Hooks** - Creation tools llaman `syncResource` automáticamente (completed 2026-04-20)
- [x] **Phase 154: KB Dashboard /knowledge** - Página Next.js que consume `_index.json` (completed 2026-04-20)
- [ ] **Phase 155: KB Cleanup Final** - Borrar legacy knowledge layers; simplificar CLAUDE.md

## Phase Details

### Phase 145: CatPaw Operador Holded
**Goal**: Existe un CatPaw "Operador Holded" generalista capaz de ejecutar cualquier operacion CRM en Holded (buscar, crear, actualizar leads y contactos, anadir notas) via Holded MCP.
**Depends on**: Nothing (primera fase del milestone)
**Requirements**: CRM-01, CRM-02, CRM-03, CRM-04
**Success Criteria** (what must be TRUE):
  1. CatPaw "Operador Holded" existe en /agents con conector Holded MCP vinculado y system_prompt generalista (no rigido a un tipo de operacion)
  2. El Operador Holded busca leads/contactos en Holded cuando recibe una instruccion de busqueda (usa holded_search_lead y holded_search_contact)
  3. El Operador Holded crea un lead nuevo en Holded con funnelId obtenido de holded_list_funnels cuando recibe datos de un lead desconocido
  4. El Operador Holded anade notas a leads existentes via holded_create_lead_note con title y desc
**Plans**: 1 plan

Plans:
- [ ] 145-01-PLAN.md — Crear CatPaw Operador Holded con conector Holded MCP y actualizar documentacion

### Phase 146: CatFlow Inbound+CRM Manual
**Goal**: Un canvas Inbound+CRM de 8 nodos funciona end-to-end: recibe un email, lo normaliza, clasifica por producto, ejecuta operacion CRM en Holded (buscar/crear/actualizar lead), y genera respuesta con template Pro-X.
**Depends on**: Phase 145
**Requirements**: FLOW-01, FLOW-02, FLOW-03, FLOW-04, FLOW-05, FLOW-06
**Success Criteria** (what must be TRUE):
  1. Canvas Inbound+CRM de 8 nodos existe y se visualiza correctamente en el editor (START, Normalizador, Clasificador, CRM Handler, Respondedor, Connector Gmail, Output)
  2. Normalizador recibe email texto libre y produce JSON con 6 campos (from, subject, body, date, message_id, thread_id)
  3. Clasificador recibe JSON normalizado y produce JSON con reply_to_email, producto, template_id, is_spam, accion, datos_lead, resumen_consulta
  4. CRM Handler (CatPaw Operador Holded) recibe clasificacion, opera contra Holded (buscar/crear/actualizar lead + nota), y produce crm_action + lead_id
  5. Respondedor genera JSON con accion_final=send_reply y respuesta con template Pro-X para leads validos, o accion_final=no_action para spam
**Plans**: TBD

Plans:
- [ ] 146-01: TBD

### Phase 147: Tests E2E Inbound+CRM
**Goal**: El pipeline Inbound+CRM esta validado contra Holded real en los 3 escenarios criticos: lead nuevo, lead existente, y spam.
**Depends on**: Phase 146
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Test lead nuevo: al ejecutar el canvas con email de contacto desconocido, se CREA un lead en Holded con nota descriptiva Y se envia email con template Pro-K12 a antonio@educa360.com
  2. Test lead existente: al ejecutar con email de contacto conocido, se ACTUALIZA el lead en Holded con nota Y se envia email de respuesta
  3. Test spam: al ejecutar con email spam, NO se envia email, crm_action=skipped, NO se crea ni modifica nada en Holded
**Plans**: TBD

Plans:
- [ ] 147-01: TBD

### Phase 148: Entrenamiento CatBot Patron CRM
**Goal**: CatBot tiene el conocimiento y la capacidad de construir un CatFlow Inbound+CRM autonomamente (>=80% correcto al primer intento) y puede adaptarlo a variantes sin intervencion.
**Depends on**: Phase 147
**Requirements**: TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-04
**Success Criteria** (what must be TRUE):
  1. PARTE 21 del Skill Orquestador esta anadida con patron CRM completo (arquitectura 8 nodos, CatPaw requerido para CRM Handler, data contracts entre nodos, errores comunes)
  2. canvas.json del knowledge tree incluye patron CRM con cuando usar CatPaw con Holded vs nodo generico
  3. CatBot construye un canvas Inbound+CRM con >=80% de criterios correctos al primer intento (6-8 nodos, CRM Handler con CatPaw, data contracts correctos)
  4. CatBot construye una variante del patron (formulario web en vez de email) sin intervencion humana
**Plans**: TBD

Plans:
- [ ] 148-01: TBD

## Progress

**Execution Order:** 145 -> 146 -> 147 -> 148

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 145. CatPaw Operador Holded | 1/1 | Complete    | 2026-04-17 |
| 146. CatFlow Inbound+CRM Manual | 0/? | Not started | - |
| 147. Tests E2E Inbound+CRM | 0/? | Not started | - |
| 148. Entrenamiento CatBot Patron CRM | 0/? | Not started | - |
| 149. KB Foundation Bootstrap | 5/5 | Complete    | 2026-04-18 |
| 150. KB Populate desde DB | 4/4 | Complete    | 2026-04-18 |
| 151. KB Migrate Static Knowledge | 4/4 | Complete    | 2026-04-20 |
| 152. KB CatBot Consume | 4/4 | Complete    | 2026-04-20 |
| 153. KB Creation Tool Hooks | 4/4 | Complete    | 2026-04-20 |
| 154. KB Dashboard /knowledge | 3/3 | Complete    | 2026-04-20 |
| 155. KB Cleanup Final | 0/? | Not started | - |

### Phase 149: KB Foundation Bootstrap

**Goal:** Crear la infraestructura base de `.docflow-kb/` como Source of Truth del conocimiento DocFlow: estructura de carpetas, schemas de frontmatter + tag taxonomy, servicio `knowledge-sync.ts` con bump semver, mecanismo de soft-delete + purga 180d, y zona `.docflow-legacy/` para material en transición. Prerrequisito del Canvas Creation Wizard.
**Depends on:** Nothing (infra foundation, orthogonal a v29 CRM)
**Requirements**: KB-01, KB-02, KB-03, KB-04, KB-05
**Success Criteria** (what must be TRUE):
  1. Existe `.docflow-kb/` con estructura de carpetas (`domain/`, `resources/`, `rules/`, `protocols/`, `runtime/`, `incidents/`, `features/`, `guides/`, `state/`, `_schema/`) y `_manual.md` explicativo
  2. Existe `.docflow-kb/_schema/frontmatter.schema.json` que valida los 13 campos obligatorios (id, type, lang, title, summary, tags, audience, status, lifecycle fields, source_of_truth) y CI falla si un archivo del KB incumple el schema
  3. Existe `.docflow-kb/_schema/tag-taxonomy.json` con vocabulario controlado (domains, entities, modes, connectors, roles, departments, rules, cross_cutting)
  4. Existe servicio `app/src/lib/services/knowledge-sync.ts` con funciones `syncResource(entity, op, row)`, `touchAccess(path)`, `detectBumpLevel` (tabla de reglas patch/minor/major), `markDeprecated` soft-delete. Tests unitarios pasan
  5. Existe CLI `kb-sync.cjs` con comandos `--full-rebuild`, `--audit-stale`, `--archive --confirm`, `--purge --confirm` que implementan el workflow 150d/170d/180d de purga con confirmación explícita
  6. Existe `.docflow-legacy/` con `README.md` explicando zona transitoria + subdirs vacíos preparados. `.planning/MILESTONE-CONTEXT-AUDIT.md` eliminado (duplicado). `milestone-v29-revisado.md` (raíz) fusionado en `MILESTONE-CONTEXT.md` y borrado. `auditoria-catflow.md` (raíz) movido a `.planning/reference/`
**Plans**: 5 plans

Plans:
- [x] 149-01-PLAN.md — Crear esqueleto `.docflow-kb/` + `_manual.md` + `.docflow-legacy/` + Index.md update (KB-01)
- [x] 149-02-PLAN.md — Schemas `frontmatter.schema.json` + `tag-taxonomy.json` + `resource.schema.json` + validador `scripts/validate-kb.cjs` (KB-02, KB-03)
- [x] 149-03-PLAN.md — Servicio `app/src/lib/services/knowledge-sync.ts` con `syncResource`, `touchAccess`, `detectBumpLevel`, `markDeprecated` + tests unitarios TDD (KB-04)
- [x] 149-04-PLAN.md — CLI `scripts/kb-sync.cjs` con 4 comandos (`--full-rebuild`, `--audit-stale`, `--archive --confirm`, `--purge --confirm`) + tests de integración (KB-05)
- [x] 149-05-PLAN.md — Cleanup ops: borrar duplicado MILESTONE-CONTEXT-AUDIT, fusionar milestone-v29-revisado en MILESTONE-CONTEXT, mover auditoria-catflow a .planning/reference/ (KB-01 cleanup)

### Phase 150: KB Populate desde DB (catpaws, connectors, skills, catbrains, templates)

**Goal:** Poblar `.docflow-kb/resources/*` desde las 6 tablas DB (cat_paws, connectors, skills, catbrains, email_templates, canvases) via `kb-sync.cjs --full-rebuild --source db`, validado por `validate-kb.cjs`, idempotente (segundo run produce 0 cambios), seguro (nunca escribe `connectors.config`, `canvases.flow_data`, `canvases.thumbnail`, `email_templates.structure`, `email_templates.html_preview`), con `_index.json` y `_header.md` regenerados incluyendo `canvases_active`. Deja el KB real poblado como lectura y committeado; ningún consumidor lo usa aún (PRD Fase 4+).
**Depends on:** Phase 149
**Requirements**: KB-06, KB-07, KB-08, KB-09, KB-10, KB-11
**Success Criteria** (what must be TRUE):
  1. `node scripts/kb-sync.cjs --full-rebuild --source db` produce archivos `.md` en los 6 subdirectorios de `.docflow-kb/resources/` con frontmatter schema-válido (validate-kb.cjs exit 0)
  2. Segundo run consecutivo sobre DB estable produce 0 escrituras, 0 bumps de version (idempotencia verificada con test)
  3. `_index.json.header.counts` incluye `canvases_active` (campo nuevo); `_header.md` lista los 6 contadores de recursos
  4. Tests de seguridad (fixture DB con `config: {"secret":"LEAK-A"}`) demuestran que el string `LEAK-A` nunca aparece en ningún archivo `.docflow-kb/resources/**/*.md` generado
  5. Tras correr el comando en el servidor dev: CatBot oracle test pegado a `150-VERIFICATION.md` comparando count de CatPaws en KB vs respuesta de `list_cat_paws` tool (si mismatch → gap documentado, no bloquea cierre)
  6. Snapshot del KB poblado committeado a git (`.docflow-kb/resources/**/*.md` + `_index.json` + `_header.md` + `_manual.md` actualizado)
**Plans**: 4 plans

Plans:
- [ ] 150-01-PLAN.md — Pre-req fixes a knowledge-sync.ts (config leak, canvases_active, idempotence) + register KB-06..KB-11 + Wave 0 test scaffold
- [ ] 150-02-PLAN.md — Módulo scripts/kb-sync-db-source.cjs (DB open, 6 SELECTs, two-pass ID map, collision resolver, tag translation, frontmatter+body builder, related cross-entity)
- [ ] 150-03-PLAN.md — CLI integration (kb-sync.cjs delegates to módulo) + flags --dry-run/--verbose/--only + exit codes + idempotence writer con stable-equal
- [ ] 150-04-PLAN.md — Validation (validate-kb.cjs spawn) + security tests (no config/flow_data/structure leak) + _header.md canvases_active + oracle + snapshot commit

### Phase 151: KB Migrate Static Knowledge

**Goal:** Migrar el conocimiento estático disperso (`.planning/knowledge/*.md`, `app/data/knowledge/*.json`, `skill_orquestador_catbot_enriched.md` en raíz, system prompts hardcoded en `app/src/lib/services/catbot-pipeline-prompts.ts`) al KB estructurado de `.docflow-kb/`. Partir catálogos grandes en átomos con frontmatter válido y ubicarlos en las carpetas correctas según tipo: `domain/concepts/`, `domain/taxonomies/`, `domain/architecture/`, `rules/`, `protocols/`, `runtime/*.prompt.md`, `incidents/`, `guides/`. Mantener los archivos originales con nota de redirect hasta Phase 155.
**Requirements**: KB-12, KB-13, KB-14
**Depends on:** Phase 150 (KB Populate desde DB — completada)
**Success Criteria** (what must be TRUE):
  1. Los 3 silos estáticos (Silo A `app/data/knowledge/*.json`, Silo B `.planning/knowledge/*.md`, Silo C+F skill + runtime prompts) están migrados al KB con ~60 archivos atómicos nuevos bajo `rules/`, `incidents/`, `protocols/`, `runtime/`, `domain/concepts/`, `domain/taxonomies/`, `domain/architecture/`, `guides/` (KB-12)
  2. Cada archivo original tiene un redirect stub apuntando a la nueva ubicación en el KB (markdown stub para `.md`, clave `__redirect` para JSONs). 21 redirects en total (KB-13)
  3. `node scripts/validate-kb.cjs` exits 0 sobre el KB completo post-migración (KB-14)
  4. `app/src/lib/services/catbot-pipeline-prompts.ts` NO se modifica (Phase 152 owns the loadPrompt refactor — contract preservation)
  5. `_index.json` + `_header.md` regenerados via `kb-sync.cjs --full-rebuild` con counts para todas las subdirs nuevas
  6. `151-VERIFICATION.md` contiene evidencia de KB-12/13/14 + CatBot oracle transcript (gap esperado hasta Phase 152)
**Plans**: 4 plans

**Notas:**
- Corresponde a Fase 3 del PRD Knowledge Base (§7 de `.planning/ANALYSIS-knowledge-base-architecture.md`).
- Paralelizable con Phase 152 (CatBot Consume) y Phase 154 (Dashboard) — archivos disjuntos, se puede trabajar en worktree separado (`gsd/phase-151-kb-migrate-static`).
- NO toca `CLAUDE.md` ni borra los originales — esas operaciones son Phase 155 (cleanup final).
- Plans 01/02/03 corren en Wave 1 (paralelo, archivos disjuntos); Plan 04 en Wave 2 (valida + regenera index + oracle).

Plans:
- [ ] 151-01-PLAN.md — Migrar `.planning/knowledge/*.md` (canvas-nodes-catalog → 25 rules + 3 taxonomy/concept atoms; incidents-log → 10 atoms; proceso-catflow-revision → protocol; connector-logs-redaction → protocol; holded-mcp-api → architecture; redirects en 6 originales)
- [ ] 151-02-PLAN.md — Migrar `app/data/knowledge/*.json` (7 JSONs → 5 concept atoms + 8 guide atoms; redirects con clave `__redirect` en JSONs)
- [x] 151-03-PLAN.md — Migrar `skill_orquestador_catbot_enriched.md` (raíz) → `protocols/orquestador-catflow.md` + extraer 5 prompts de `catbot-pipeline-prompts.ts` → `runtime/*.prompt.md` (código NO modificado, Phase 152 owns refactor) (completed 2026-04-20)
- [ ] 151-04-PLAN.md — Cierre: redirects en 4 catálogos DB-synced + aggregate migration log + regenerar `_index.json`/`_header.md` + update `_manual.md` + `151-VERIFICATION.md` con evidencia KB-12/13/14 + CatBot oracle checkpoint

### Phase 152: KB CatBot Consume

**Goal:** CatBot consume el Knowledge Base estructurado. `catbot-prompt-assembler.ts` inyecta `.docflow-kb/_header.md` como sección P1 `kb_header` en cada sesión (fresh-read, antes de `platform_overview`). Nuevas tools `search_kb({type?,subtype?,tags?,audience?,status?,search?,limit?})` y `get_kb_entry({id})` registradas always-allowed en `catbot-tools.ts`. Los 5 tools canónicos de listado (`list_cat_paws`, `list_catbrains`, `list_skills`, `list_email_templates`, `canvas_list`) devuelven campo nuevo `kb_entry: string | null` con path relativo al KB, resuelto vía módulo `kb-index-cache.ts` con cache TTL 60s + byTableId map construido leyendo frontmatter de 66 resource files. (`list_connectors` NO está en scope — no existe como tool; si se necesita exposure genérico de connectors, será otra fase). Fix heredado de Phase 151: Zod schema de `query_knowledge` extendido para admitir `{term,definition}` y `{__redirect}` objects en concepts/howto/dont arrays (root cause: `catboard.json.concepts[18..20]` pre-existentes eran `{term,definition}` — `__redirect` top-level era red herring).
**Requirements**: KB-15, KB-16, KB-17, KB-18
**Depends on:** Phase 150 (KB poblado desde DB — completada). Phase 151 enriquece el KB con rules/concepts/protocols pero Phase 152 funciona con solo header+resources de Phase 150.
**Success Criteria** (what must be TRUE):
  1. Prompt system de CatBot contiene sección `kb_header` con el contenido literal de `.docflow-kb/_header.md` (126 entradas, counts de resources + knowledge), inyectada antes de `platform_overview`. Assembler funciona graceful si el archivo no existe.
  2. Tools `search_kb` y `get_kb_entry` operativas, registradas en TOOLS[] + always-allowed en `getToolsForLLM`. `search_kb({type:'resource',subtype:'catpaw'})` devuelve los 9 catpaws. `get_kb_entry('R10-preserve-fields')` devuelve frontmatter + body + related_resolved.
  3. Los 5 tools canónicos de listado (`list_cat_paws`, `list_catbrains`, `list_skills`, `list_email_templates`, `canvas_list`) devuelven items con campo `kb_entry: string | null` resuelto correctamente contra el frontmatter de los archivos KB. (Nota: `list_connectors` no existe como tool en el codebase actual; queda deferred a una fase futura si se necesita.)
  4. `query_knowledge` NO rompe con Zod validation error al cargar `catboard.json` (que tiene `concepts[18..20]` como objetos `{term,definition}`). Cuando encuentra un entry con `__redirect` top-level, emite hint `{type:'redirect', target_kb_path}` sin throw.
  5. CatBot oracle test (POST `/api/catbot/chat`) ejecuta 3 prompts post-Docker-rebuild: (a) "¿Qué sabes del KB de DocFlow?" → respuesta factual con counts del header; (b) "¿Qué CatPaws existen?" → invoca `list_cat_paws`, response incluye `kb_entry: "resources/catpaws/..."`; (c) "Busca reglas de seguridad" → invoca `search_kb({type:'rule',tags:['safety']})`. Evidence pegada en `152-VERIFICATION.md`.
**Plans**: 4 plans

**Notas:**
- Corresponde a Fase 4 del PRD Knowledge Base.
- Paralelizable con Phase 151 (Migrate Static) y Phase 154 (Dashboard) — archivos disjuntos, worktree separado (`gsd/phase-152-kb-catbot-consume`).
- No depende de 151 directamente: aunque 151 enriquece el KB con `domain/`, `rules/`, etc., el header + resources de 150 ya bastan para validar el consumo.

Plans:
- [ ] 152-01-PLAN.md — Foundation: register KB-15..KB-18, crear `kb-index-cache.ts` module, extender Zod schema de `knowledge-tree.ts`, crear `createFixtureKb` test helper
- [ ] 152-02-PLAN.md — Tools: registrar `search_kb` + `get_kb_entry` en TOOLS[] + executeTool switch, fix `query_knowledge` redirect hint, actualizar tool description de `query_knowledge` a "Legacy fallback"
- [ ] 152-03-PLAN.md — Assembler + list_* field: añadir `buildKbHeader()` + insertar sección `kb_header` en assembler, reescribir `buildKnowledgeProtocol()`, inyectar campo `kb_entry` en los 5 list_* tools canónicos
- [ ] 152-04-PLAN.md — Close: actualizar `catboard.json.tools[]` (tripwire `knowledge-tools-sync`), Docker rebuild, oracle CatBot con 3 prompts, `152-VERIFICATION.md` con evidencia KB-15..KB-18

### Phase 153: KB Creation Tool Hooks

**Goal**: Enganchar las tools de creación de CatBot (6 cases hookeables en `catbot-tools.ts`) y 15 API route handlers (5 entidades × POST/PATCH/DELETE) a `syncResource()` de `knowledge-sync.ts` para que cada write en DB actualice automáticamente el archivo `.docflow-kb/resources/**` correspondiente + regenere `_index.json` + `_header.md` + invalide el cache `kb-index-cache`. Política de fallo: DB gana (op NO se revierte si sync falla); failure escribe a `_sync_failures.md` para reconciliación manual via `kb-sync.cjs --full-rebuild --source db`. Delete es soft (via `markDeprecated`): archivo persiste con `status: deprecated`. Cierra el gap heredado de Phase 152 donde `list_cat_paws` devolvía `kb_entry: null` para CatPaws creados post-snapshot Phase 150.
**Depends on**: Phase 152 (mismo dispatcher de tools + `invalidateKbIndex` export)
**Requirements**: KB-19, KB-20, KB-21, KB-22
**Success Criteria** (what must be TRUE):
  1. Los 21 hook insertion points (6 tool cases + 15 route handlers) compilan y ejecutan `await syncResource(...)` + `invalidateKbIndex()` tras DB write exitoso; tras fallo ejecutan `logger.error('kb-sync', ...)` + `markStale(path, reason, {entity, db_id, error})` pero NO `invalidateKbIndex()`.
  2. `update_cat_paw` (catbot-tools.ts L2238) explícitamente NO tiene hook (pass-through a PATCH route); negative test lo verifica.
  3. Hooks usan entity keys singulares (`'catpaw'`, `'catbrain'`, `'connector'`, `'skill'`, `'template'`) — NO los nombres de tabla DB. `email_templates` DB table → entity `'template'` (trap verificado en `knowledge-sync.ts:104-111`).
  4. Delete via `syncResource(entity, 'delete', {id}, ctx)` nunca `fs.unlink` ni `markDeprecated` directo; archivo KB persiste con frontmatter `status: deprecated`.
  5. `_sync_failures.md` es el fichero de audit log para Phase 153 (NO `_audit_stale.md`, que es regenerado por CLI); excluido de `validate-kb.cjs` y `kb-sync.cjs` via `EXCLUDED_FILENAMES`.
  6. Docker rebuild + 3-prompt CatBot oracle chain (crear Tester → actualizar descripción → eliminar) produce traza coherente: archivo KB aparece, version bump correcto, change_log crece, delete → `status: deprecated`, `get_kb_entry` resuelve, `list_cat_paws({status:'active'})` NO incluye deprecated.
**Plans**: 3/4 plans executed

**Notas:**
- Corresponde a Fase 5 del PRD Knowledge Base.
- Secuencial tras 152 porque Plans 02+03 modifican el mismo dispatcher de tools de CatBot (`catbot-tools.ts`) y las routes `/api/*` que Phase 152 dejó intocadas.
- Plan 01 (foundation) → Wave 1; Plan 02 (tool hooks) → Wave 2; Plan 03 (route hooks) → Wave 3; Plan 04 (Docker rebuild + oracle + snapshot) → Wave 4. Estrictamente secuencial porque archivos compartidos (`catbot-tools.ts`, routes) impiden paralelismo.

Plans:
- [x] 153-01-PLAN.md — Foundation: register KB-19..KB-22, extender `LogSource`, crear `kb-audit.ts` + tests, excluir `_sync_failures.md` de `validate-kb.cjs` (KB-22)
- [x] 153-02-PLAN.md — Tool hooks: 6 cases hookeables en `catbot-tools.ts` (L1610/L1636/L1699/L3097/L3122/L3152) + negative non-hook en `update_cat_paw` (L2238) + tests `kb-hooks-tools.test.ts` (KB-19, KB-21)
- [x] 153-03-PLAN.md — Route hooks: 15 handlers en `cat-paws`, `catbrains`, `connectors`, `skills`, `email-templates` (POST/PATCH/DELETE × 5) + tests `kb-hooks-api-routes.test.ts` (KB-20, KB-21)
- [x] 153-04-PLAN.md — Close: Docker rebuild + concurrency test + CatBot oracle chain (create/update/delete Tester) + snapshot commit + actualizar `_manual.md` con sección Phase 153 (todas las reqs) (completed 2026-04-20)

### Phase 154: KB Dashboard /knowledge

**Goal:** Exponer `.docflow-kb/` como dashboard read-only navegable en `/knowledge` (server component + 4 client components + 1 API route) que permite a humanos y a CatBot (via URL del `kb_entry` path) explorar los 128 recursos del KB: lista tabla con filtros client-side (type/subtype/tags AND/audience/status default active/search case-insensitive), vista detalle por id con markdown body renderizado + related_resolved + metadata (react-markdown + remark-gfm + `prose prose-invert`), gráfico timeline recharts agregando `_index.json.header.last_changes[]` por día, counts bar con 8 cards desde `header.counts`, y entrada en sidebar nav. Sin write UI, sin Qdrant, sin virtualización (Phase 155+). Corresponde a Fase 6 del PRD Knowledge Base.
**Requirements**: KB-23, KB-24, KB-25, KB-26, KB-27
**Depends on:** Phase 150 (`_index.json` poblado), Phase 152 (`kb-index-cache.ts` contract — `getKbIndex`/`getKbEntry`)
**Success Criteria** (what must be TRUE):
  1. `GET /knowledge` renderiza server component con timeline + counts bar + tabla de 128 entries; filtros client-side operativos sobre el array (type/subtype/tags/audience/status/search + reset)
  2. `GET /knowledge/[id]` renderiza markdown body via react-markdown + remark-gfm con wrapper `prose prose-invert`; metadata/related/banner deprecated según `entry.frontmatter.status`
  3. `GET /api/knowledge/[id]` devuelve 200 con shape `{id, path, frontmatter, body, related_resolved}` o 404 `{error:'NOT_FOUND', id}`
  4. Sidebar muestra link "Knowledge" (icon BookOpen) que navega a `/knowledge`; breadcrumb auto-generado renderiza i18n key `layout.breadcrumb.knowledge`
  5. `app/src/lib/services/kb-index-cache.ts` extiende `KbIndex` interface con `header: KbIndexHeader` (Conflict 1 RESEARCH) sin romper suite Phase 152 (108/108 KB tests siguen verdes)
  6. Nyquist: tests unit vitest sobre 3 libs puras (`kb-filters`, `kb-timeline`, `relative-time`) + Playwright E2E (UI + API) verdes; oracle manual (Docker rebuild + browse `/knowledge` + click entry + API ping) pegado a `154-VERIFICATION.md`
**Plans**: 3 plans

Plans:
- [x] 154-01-PLAN.md — Foundation: register KB-23..KB-27 + extend KbIndex type (Conflict 1) + 3 pure TS libs (kb-filters, kb-timeline, relative-time) con tests + i18n keys + sidebar nav entry + breadcrumb ROUTE_KEYS (completed 2026-04-20)
- [x] 154-02-PLAN.md — Core UI: /knowledge/page.tsx + /knowledge/[id]/page.tsx + GET /api/knowledge/[id] + 4 client components (KnowledgeTable+Filters, KnowledgeDetail, KnowledgeTimeline, KnowledgeCountsBar) + npm run build exit 0 (completed 2026-04-20)
- [x] 154-03-PLAN.md — E2E + Oracle + Close: Playwright specs (UI + API + POM) + Docker rebuild + manual browse evidence + _manual.md section + 154-VERIFICATION.md (completed 2026-04-20)

### Phase 155: KB Cleanup Final

**Goal:** Eliminar la deuda técnica de los dos knowledge layers legacy ahora que el KB es la única fuente canónica. Borrar `app/data/knowledge/*.json` (datos migrados en Phase 151 a `.docflow-kb/domain/concepts/`). Borrar `.planning/knowledge/*.md` (o convertir a redirects simbólicos apuntando al KB equivalent). Simplificar §29 de `CLAUDE.md` reemplazando "Protocolo de Documentación: Knowledge Tree + CatBot" por referencia única a `.docflow-kb/_manual.md`. Deprecar concepto de "dos knowledge layers" en `.planning/Index.md`, comentarios de código y skills. Limpiar `skill_orquestador_catbot_enriched.md` de la raíz (migrado en Phase 151 a `protocols/`). Verificar que los 8 tests pre-existentes fallando en `knowledge-tree.test.ts` y `knowledge-tools-sync.test.ts` (logged en deferred-items.md de Phase 150) ahora pasan o se borran limpiamente. Tests E2E: arrancar Next con knowledge tree borrado + CatBot responde correctamente apoyándose solo en KB. Rollback plan documentado en `_manual.md`. Corresponde a Fase 7 del PRD Knowledge Base — última fase del ciclo KB.
**Requirements**: TBD (se registran durante /gsd:plan-phase 155)
**Depends on:** Phase 151, Phase 152, Phase 153, Phase 154 (última — no puede empezar hasta que las 4 anteriores estén mergeadas)
**Plans:** 2/3 plans executed

Plans:
- [ ] TBD (run /gsd:plan-phase 155 to break down)
