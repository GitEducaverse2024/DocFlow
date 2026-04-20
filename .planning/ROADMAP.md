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
**v29.1 scope:** Phases 149-157.

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
- [x] **Phase 155: KB Cleanup Final** - Borrar legacy knowledge layers; simplificar CLAUDE.md (completed 2026-04-20)
- [x] **Phase 156: KB Runtime Integrity (gap closure)** - Cerrar scope gaps detectados en audit v29.1: canvas write-path sync, delete_catflow soft-delete, link tools re-sync, orphan cleanup + retention policy (KB-40..KB-43) (plans-complete 2026-04-20, awaiting verifier)
- [ ] **Phase 157: KB Rebuild Determinism + Body Backfill** - Cerrar regresión descubierta en audit #2: `--full-rebuild --source db` no honra `.docflow-legacy/orphans/` (resucita 10 huérfanos) + body-sections de linked relations no se renderizan durante rebuild (~29 CatPaws pre-existing sin secciones). Fix root-cause del bug de sequencing entre commits `c6e4ab6` y `06d69af7`. Cierra milestone v29.1 (KB-46, KB-47).

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
| 155. KB Cleanup Final | 4/4 | Complete    | 2026-04-20 |
| 156. KB Runtime Integrity (gap closure) | 3/3 | Complete    | 2026-04-20 |
| 157. KB Rebuild Determinism + Body Backfill | 0/? | Not started | - |

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

**Goal:** Eliminar la deuda técnica de los dos knowledge layers legacy ahora que `.docflow-kb/` es la única fuente canónica. Borrar físicamente `app/data/knowledge/*` (11 archivos), `.planning/knowledge/*` (12 archivos), `skill_orquestador_catbot_enriched.md` (raíz), `app/src/lib/knowledge-tree.ts` + 4 tests asociados, la API route `/api/catbot/knowledge/tree` y el componente UI `TabKnowledgeTree`. Barrer todo el código consumidor (`query_knowledge` + `explain_feature` cases, `mapConceptItem`/`renderConceptItem` helpers, `PAGE_TO_AREA` map, etc.). Simplificar `CLAUDE.md` (§"Protocolo de Documentación" → pointer a `.docflow-kb/_manual.md`, §"Restricciones absolutas" → pointer a `search_kb({tags:["critical"]})`). Migrar las 4 Restricciones Absolutas a `.docflow-kb/rules/R26..R29` (canvas-executor inmutable, agentId UUID, process['env'], Docker rebuild). Rewrite `canvas-rules.ts` para leer desde `.docflow-kb/rules/` (+ crear atoms SE01-SE03 y DA01-DA04). Live-DB backfill via `kb-sync.cjs --full-rebuild --source db` cierra el drift `kb_entry: null` heredado de Phase 152. Rollback plan documentado en `_manual.md`. Corresponde a Fase 7 del PRD Knowledge Base — última fase del ciclo KB.
**Requirements**: KB-28, KB-29, KB-30, KB-31, KB-32, KB-33, KB-34, KB-35, KB-36, KB-37, KB-38, KB-39
**Depends on:** Phase 151, Phase 152, Phase 153, Phase 154 (última — no puede empezar hasta que las 4 anteriores estén mergeadas)
**Success Criteria** (what must be TRUE):
  1. `canvas-rules.ts` lee desde `.docflow-kb/rules/R*.md + SE*.md + DA*.md` preservando contrato público byte-identical (KB-28, KB-29).
  2. Legacy layers borrados físicamente (23+ archivos), código barrido (40+ edit points), Dockerfile + entrypoint limpios, CLAUDE.md ≤55 líneas (KB-30, KB-31, KB-32, KB-33).
  3. `.docflow-kb/rules/R26..R29` con `critical` tag creados; tag-taxonomy.json extendido; validate-kb.cjs exit 0 (KB-34, KB-35).
  4. Live-DB backfill aplicado post-Docker-rebuild; kb_entry non-null para Operador Holded; 2nd run idempotente (KB-36).
  5. `.docflow-kb/_manual.md` contiene sección Rollback + sección Phase 155 Cleanup; 3-prompt CatBot oracle ejecutado con evidencia pegada a `155-VERIFICATION.md`; REQUIREMENTS.md Traceability con 12 Complete rows + 5 KB-01..KB-05 rows (KB-37, KB-38, KB-39).
**Plans**: 4 plans

Plans:
- [ ] 155-01-PLAN.md — Wave 1: canvas-rules.ts migration to `.docflow-kb/rules/` + create SE01-SE03 + DA01-DA04 atoms (KB-28, KB-29). **Pre-requisite estricto** de Wave 2.
- [ ] 155-02-PLAN.md — Wave 2: big atomic commit. Delete 23+ legacy files + code sweep of all consumers (catbot-tools.ts, catbot-prompt-assembler.ts, routes, UI tab, tests) + Dockerfile/entrypoint strip + CLAUDE.md simplification + .planning/Index.md cleanup (KB-30, KB-31, KB-32, KB-33).
- [ ] 155-03-PLAN.md — Wave 3: extend tag-taxonomy.json (`critical` + R26-R29), create 4 `critical` rule atoms R26-R29, Docker rebuild + live-DB backfill (KB-34, KB-35, KB-36).
- [x] 155-04-PLAN.md — Wave 4: close. _manual.md rollback + Phase 155 Cleanup sections + 3-prompt CatBot oracle + 155-VERIFICATION.md evidence + REQUIREMENTS.md traceability update + human UAT checkpoint (KB-37, KB-38, KB-39). (completed 2026-04-20)

### Phase 156: KB Runtime Integrity (gap closure)

**Goal:** Cerrar los scope gaps detectados en el audit post-Phase-155 del milestone v29.1 para que el claim "KB como fuente canónica única consumida por CatBot via search_kb + get_kb_entry + list_*" sea verdadero sin excepciones. Canvas write-path entra en el ciclo de sync hooks (POST/PATCH/DELETE de `/api/canvas/*` llaman `syncResource('canvas', op, row)` + `invalidateKbIndex`), `delete_catflow` sudo tool reemplaza hard-DELETE por soft-delete via markDeprecated, las link tools `link_connector_to_catpaw` + `link_skill_to_catpaw` re-sincan el CatPaw padre (y su KB template gana secciones "## Conectores/Skills vinculadas"), y los 10 archivos orphan acumulados quedan depurados con política de retención documentada. Cierre honesto del milestone.
**Requirements**: KB-40, KB-41, KB-42, KB-43
**Depends on:** Phase 155 (la migración KB ya completada es prerequisito; canvas hooks operan sobre la infra de `knowledge-sync.ts` entregada por Phase 149)
**Success Criteria** (what must be TRUE):
  1. `/api/canvas/route.ts` POST y `/api/canvas/[id]/route.ts` PATCH + DELETE llaman `syncResource('canvas', op, row, hookCtx(...))` + `invalidateKbIndex()` en ruta happy path; `markStale` en ruta de error. Creating canvas via UI o `canvas_create` tool → archivo `.md` aparece en `resources/canvases/`. Editing → version bump + change_log. Deleting → status: deprecated (KB-40).
  2. `delete_catflow` en `catbot-sudo-tools.ts` reemplaza `db.prepare('DELETE FROM canvases')` por flujo `syncResource('canvas','delete', ...)` + `markDeprecated()` equivalente al patrón `/api/cat-paws/[id]` DELETE. Sudo session sigue requerida (KB-41).
  3. `link_connector_to_catpaw` + `link_skill_to_catpaw` cases en `catbot-tools.ts` llaman `syncResource('catpaw','update', paw_row, hookCtx(...))` tras el INSERT; CatPaw KB template extendido con secciones "## Conectores vinculados" + "## Skills vinculadas" renderizadas desde `cat_paw_connectors` + `cat_paw_skills` JOIN queries. `search_kb({search:"holded"})` encuentra CatPaws por conector linked (KB-42).
  4. `scripts/kb-sync.cjs --audit-stale` identifica los 10 orphans (6 catpaws + 1 skill + 1 email-template + 2 canvases). Archive via `kb-sync.cjs --archive --confirm` mueve a `.docflow-legacy/orphans/` o purga según policy. Retention policy documentada en `.docflow-kb/_manual.md` (edad máxima deprecated, cuándo purgar vs archive). Post-cleanup: active-count per entity = DB row count (KB-43).
**Plans**: 3 plans

Plans:
- [x] 156-01-canvas-sync-hooks-PLAN.md — Canvas API hooks (POST/PATCH/DELETE) + delete_catflow soft-delete refactor (KB-40, KB-41) — TDD RED-first (completed 2026-04-20)
- [x] 156-02-link-tools-resync-PLAN.md — link_connector/link_skill tool hooks + buildBody catpaw template extension con §Conectores/Skills vinculadas (KB-42) — TDD RED-first (completed 2026-04-20)
- [x] 156-03-orphan-cleanup-PLAN.md — Audit orphans contra DB live + archive a .docflow-legacy/orphans/ + §Retention Policy en _manual.md + CatBot oracle 4 prompts (KB-43). Depends on 156-01 + 156-02. (completed 2026-04-20: 40→15 orphan reconciliation, search_hints gap closure, oracle 4/4 passed)

### Phase 157: KB Rebuild Determinism + Body Backfill

**Goal:** Cerrar definitivamente el milestone v29.1 eliminando la regresión descubierta en audit #2 (2026-04-20 noche): `scripts/kb-sync-db-source.cjs --full-rebuild --source db` viola el lifecycle KB al resucitar archivos archivados en `.docflow-legacy/orphans/` (root cause: iteración DB-first sin exclusion list + `fs.existsSync` solo chequea `.docflow-kb/resources/`), y el body-rendering del rebuild genera CatPaws sin las secciones "## Conectores vinculados" / "## Skills vinculadas" porque `buildBody` en el script DB-source no recibe `relations` ni invoca `renderLinkedSection` (definido únicamente en `knowledge-sync.ts` update path). Resultado del fix: `_index.json.counts` refleja filas DB con Δ=0 para las 6 entidades, y `search_kb({search:"holded"})` encuentra Operador Holded via body-match además de search_hints. Alineado con PRD §5.3 Lifecycle ("archivado es transición hacia purga, no hacia resurrección") y con CLAUDE.md Protocolo CatBot como Oráculo.
**Depends on:** Phase 156 (misma infra `knowledge-sync.ts` + `kb-sync-db-source.cjs`; solo añade correctness + determinism al rebuild path)
**Requirements**: KB-46, KB-47
**Success Criteria** (what must be TRUE):
  1. `scripts/kb-sync-db-source.cjs` `populateFromDb` carga un `archivedIds` set desde `.docflow-legacy/orphans/<subtype>/*.md` tras `buildIdMap` (línea ~1526) y excluye cualquier `sub:shortIdSlug` presente en ese set del Pass-2 loop (línea 1534+). Si DB tiene el row pero el archivo está archivado, el script emite `WARN [archived-skip]` y **no** llama `writeResourceFile`. Nuevo comando opcional `kb-sync.cjs --restore --from-legacy <id>` mueve explícitamente un archivo de legacy a resources — el rebuild por sí solo NUNCA resucita (KB-46).
  2. Tras ejecutar `node scripts/kb-sync.cjs --full-rebuild --source db` en working tree actual: los 10 archivos resucitados post-commit `06d69af7` (6 catpaws: 72ef0fe5/7af5f0a7/96c00f37/98c3f27c/a56c8ee8/a78bb00b; 2 canvases: 5a56962a/9366fa92; 1 skill: 4f7f5abf; 1 connector deprecated: conn-gma) NO vuelven a aparecer en `.docflow-kb/resources/**`. `_index.json.counts` post-rebuild = `{catpaws_active: 39, canvases_active: 1, catbrains_active: 3, skills_active: 43, templates_active: 15, connectors_active: 12}` matching DB row counts (KB-46).
  3. `buildBody(subtype, row, relations)` en `kb-sync-db-source.cjs` acepta `relations` como 3er argumento opcional. Para subtype=`catpaw`, si `relations.connectors` o `relations.skills` no-vacío, el body incluye secciones `## Conectores vinculados` + `## Skills vinculadas` rendered desde los arrays ordenados por `name ASC` (mismo formato que `renderLinkedSection` de `knowledge-sync.ts:1021`). La llamada en Pass-2 (línea 1549) pasa `relations = loadCatPawRelations(db, row.id)` que ya existe en el script (línea ~1529). Idempotencia preservada: segundo rebuild sin cambios DB = 0 writes (KB-47).
  4. Post-rebuild + `invalidateKbIndex`, verificable por oráculo CatBot (Docker rebuild + `POST /api/catbot/chat`):
     - Prompt A: "Dame el `get_kb_entry` del Operador Holded y léeme las secciones del body" → response cita "## Conectores vinculados" con "Holded MCP (seed-holded-mcp)" + "## Skills vinculadas" con al menos una skill.
     - Prompt B: "¿Cuántos CatPaws activos hay en el KB y cuántos en la DB?" → response invoca `search_kb({type:'resource',subtype:'catpaw',status:'active'})` + `list_cat_paws()` y confirma ambos counts == 39.
     - Prompt C: "¿Hay archivos archivados que el rebuild debería ignorar?" → response describe la política: archivos en `.docflow-legacy/orphans/` no se resucitan; `--restore --from-legacy` es la única vía.
  5. `.docflow-kb/_manual.md` §Retention Policy (pre-existente Phase 156-03) gana sub-sección "Rebuild Determinism" que documenta: (a) `--full-rebuild --source db` NO resucita archivos archivados, (b) la exclusion list usa `.docflow-legacy/orphans/<subtype>/<file>.md` como señal permanente, (c) `--restore --from-legacy <id>` es el opt-in explícito para re-admitir un archivo. Cross-link a PRD §5.3 (`.planning/ANALYSIS-knowledge-base-architecture.md`).
  6. Tests unitarios nuevos en `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` (o equivalente): (a) archivo en `.docflow-legacy/orphans/catpaws/X.md` + DB row con mismo id → rebuild NO escribe `.docflow-kb/resources/catpaws/X.md`; (b) archivo ausente + DB row → rebuild escribe; (c) buildBody con `relations={connectors:[{name:'Holded MCP',slug:'seed-holded-mcp'}]}` produce body con sección "## Conectores vinculados". Mínimo 3 tests.
  7. Audit re-run (`/gsd:audit-milestone v29.1`) produce `status: passed` con `integration: 11/11 WIRED` y `flows: 4/4 COMPLETE`. Retrocompatibilidad con audit YAML schema (gaps vacío) para que `/gsd:complete-milestone v29.1` proceda.
**Plans**: TBD (3 esperados)

**Notas:**
- Análisis root-cause completo en `.planning/phases/157-kb-rebuild-determinism/157-CONTEXT.md` (creado junto a esta entrada).
- Referencia PRD: `.planning/ANALYSIS-knowledge-base-architecture.md` §5.3 Lifecycle.
- Referencia CLAUDE.md: Protocolo CatBot como Oráculo (toda feature verificable via CatBot).
- Esta fase NO introduce nuevos endpoints ni UI — todo el scope vive en `scripts/kb-sync-db-source.cjs`, un posible one-shot script en `scripts/`, y tests.
- Política explícita: archivos archivados son **frozen** — sólo `--restore --from-legacy <id>` los puede re-admitir. Alinea el lifecycle KB con el de DB (soft-delete + deprecation explícita).

Plans:
- [ ] 157-01: TBD — Rebuild exclusion list (KB-46)
- [ ] 157-02: TBD — buildBody relations + body-section rendering (KB-47)
- [ ] 157-03: TBD — Restore command + tests + oracle + _manual.md section + cleanup de los 10 resucitados actuales
