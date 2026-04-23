# Tech Debt Backlog — Post-GSD → CatDev Transition

**Fecha:** 2026-04-22
**Contexto:** DocFlow migra de GSD (Get Shit Done) a CatDev Protocol como metodología de desarrollo. Este documento consolida **todo lo pendiente heredado de GSD** clasificado según la decisión tomada en la transición.

**Convenciones de estado:**
- 🔴 **won't do** — Decisión explícita de no abordar. Razón documentada. No se reabre salvo cambio de contexto.
- 🟡 **aceptado** — Se acepta el gap como parte del ship. Tiene criterio de reopen si cambia severidad.
- 🟢 **backlog activo** — Candidato a milestone CatDev futuro cuando haya prioridad.
- ⚪ **incidentes** — Bugs conocidos con root-cause documentado, esperando milestone de saneamiento.

---

## 1. Won't do (cerrado por decisión, no por solución)

### v29.0 Phase 145 — Operador Holded: caveats
**Milestone:** v29.0 CatFlow Inbound + CRM
**Qué quedaba:** 4 human-verify tests (CRM-02/03/04 live verification) + 2 tests rotos en `catbot-holded-tools.test.ts` (MCP response interface drift).
**Razón de won't-do:** El CatPaw "Operador Holded" (`53f19c51-9cac-4b23-87ca-cd4d1b30c5ad`) existe en DB y funciona estructuralmente, pero el escenario de uso para el que se construyó (Phase 146 Canvas Inbound+CRM manual) nunca se materializó — el patrón real de Inbound+CRM acabó resolviéndose en [progressSesion31.md Bloque 12](.planning/Progress/progressSesion31.md) con una arquitectura distinta (Connector Gmail determinista, no CatPaw Operador). El CatPaw queda como artefacto histórico sin consumidor activo.
**Criterio de reopen:** Si algún canvas futuro vincula el CatPaw `53f19c51-` como CRM Handler, los 4 human-tests y los 2 tests rotos pasan automáticamente a prioridad blocker.
**Evidencia:** [.planning/milestones/v29.0-MILESTONE-AUDIT.md](.planning/milestones/v29.0-MILESTONE-AUDIT.md) — gap "Phase 145 artifact sin uso".

---

## 2. Tech debt aceptado (ship con caveats)

### v30.0 — LLM Self-Service para CatBot
Shipped 2026-04-22 con `tech_debt` status. 21/21 requirements satisfied. Los gaps acumulados son de severidad baja y no bloquean ship.

#### Phase 158 — FQN naming drift
**Evidencia:** Production DB tiene `anthropic/claude-opus-4` (sin sufijo `-6`). El seed `UPDATE WHERE model_key='anthropic/claude-opus-4-6'` del Phase 158 es silent no-op.
**Impacto:** `list_llm_models` reporta `capabilities: null` para 4 shortcuts LiteLLM (`claude-opus`, `claude-sonnet`, `gemini-main`, `gemma-local`). Narración de CatBot correcta, sólo cosmético.
**Criterio de reopen:** Si UI Enrutamiento necesita mostrar capabilities por default para shortcuts. Fix: data migration o resolver layer.

#### Phase 161 — Gap B-stream (streaming reasoning_usage silent)
**Evidencia:** Streaming SSE path entrega contenido con calidad de reasoning (578 tokens, derivación cinemática correcta) pero el usage chunk carece de `completion_tokens_details.reasoning_tokens` en régimen de prompts 26k Anthropic/LiteLLM.
**Impacto:** Non-streaming path satisface VER-03 must_have (4 JSONL lines live con `reasoning_tokens=10/175/169/154`). Oracle check passa por non-streaming.
**Criterio de reopen:** Si aparece regresión que rompa también non-streaming, o si el stakeholder pide visibilidad de reasoning en streaming.

#### Nyquist validation gaps
**Evidencia:** 3 de 4 phases (158, 159, 161) carecen de VALIDATION.md firmado `nyquist_compliant: true`. Solo Phase 160 está compliant.
**Impacto:** No hay cobertura Nyquist retroactiva para el milestone. `config.json.workflow.nyquist_validation = true` establece la política pero no se enforced.
**Decisión:** En CatDev el Nyquist validation no se replica tal cual — la verificación se hace con el oracle de CatBot (sección 7 `CATDEV_PROTOCOL.md`). El gap GSD-era queda documentado aquí pero no se va a rellenar retroactivamente.

#### Repo housekeeping
**Evidencia del audit:**
- Unstaged plan refinements on 161-01/02/03/05/06-PLAN.md (benign post-execution edits).
- Unstaged `app/scripts/pipeline-cases/baselines/*.json` (drive-sync, holded-q1, inbox-digest — regenerated baselines).
- Deleted-but-unstaged `.planning/v29.1-MILESTONE-AUDIT.md` (ya archivado en `milestones/`).
**Acción:** Commit housekeeping cuando convenga. No urgente.

---

## 3. Backlog activo (candidatos a milestones CatDev futuros)

### UX-04 — UI Enrutamiento no advierte FQN fuera de Discovery
**Capturado:** v30.1 Phase P2 (2026-04-22)
**Severidad:** LOW
**Síntoma:** el usuario puede seleccionar en la UI Enrutamiento un `model_key` que no aparece en Discovery inventory (p.ej. FQN como `anthropic/claude-sonnet-4` vs shortcut `claude-sonnet`). El resolver activa same-tier fallback silenciosamente. Si el alias es de uso frecuente, el cliente paga costes mayores sin darse cuenta (Opus vs Sonnet).
**Fix propuesto:** al cambiar `model_key`, query `/api/models` (Discovery inventory) y mostrar warning `"⚠ Este modelo no aparece en Discovery — caerá en fallback al resolverse"`. Coste estimado: ~2h (UI check + test).
**Relación:** cierra el bug de base que causó la degradación en el run `e9679f28`. Complementa Gap C de v30.0.

### Embedding retry progresivo para modelos desconocidos
**Capturado:** v30.1 Phase P3 (2026-04-22)
**Severidad:** LOW
**Síntoma:** si aparece un modelo de embedding no listado en `EMBEDDING_CHAR_LIMITS` de `ollama.ts`, no hay truncate preventivo. Si Ollama devuelve 400 por overflow, no hay retry automático con input menor.
**Fix propuesto:** capturar 400 "context length" en `getEmbedding`, retry una vez con `text.slice(0, 800)` (límite muy conservador). Añadir a la tabla el modelo detectado con el límite inferido. Coste: ~1h.

### ~~★ Iterator frágil ante JSON malformado del lector~~ (RESUELTO 2026-04-23 por v30.2 CatDev)
**Capturado:** 2026-04-22 21:10 UTC (test E2E post-v30.1)
**Severidad:** HIGH — bloqueaba completamente el canvas test-inbound
**Descubierto por:** El propio skill Auditor de Runs (v30.1 Phase P4) en el primer test E2E real — ironía positiva, valida P4
**Cerrado por:** v30.2 sesión 33 — ver [Progress/progressSesion33.md](Progress/progressSesion33.md). P1 extrae el parser a `canvas-iterator-parser.ts` con cascada jsonrepair + regex-salvage, P2 añade reglas de escape JSON al prompt del lector, P3 codifica el patrón `silent_skip_cascade` en el Auditor, P4 crea regression suite con fixture real (8/11 items recuperables donde antes = 0). Verificado live run `66aeb915` 2026-04-23: 11/11 nodos completados, degraded=false.

### Evidencia del test

Tras enviar 3 emails a info@educa360.com vía `send_email` (K12, patrimonio histórico Valladolid, REVI Granada), ejecutar el canvas `test-inbound-ff06b82c` (run `609828fa-80e6-4d1e-873d-dba3560bb762`, 21:05-21:07 UTC):

- ✅ Los 3 emails llegaron al lector (confirmado: el output contiene "Juan Martínez K12", "Laura Sánchez Valladolid", "Miguel Torres Granada REVI" + 7 emails genuinos más de moodle/securityalerts).
- ✅ Infraestructura 100% limpia: `degraded=false`, 0 errors/fallbacks/kbSyncFailures/embeddingErrors/outliers.
- ❌ El iterator recibe el output del lector (string JSON de 20369 chars) y devuelve `[]` (array vacío).
- ❌ Cascada de 8 nodos `skipped`: clasificador, respondedor, connector-gmail, connector-informe, storage-log, output-final, 2 formateadores.
- ❌ 0 respuestas a leads, 0 informe a antonio@educa360.

### Root cause diagnosticado

El output del lector es un JSON string que falla `JSON.parse` con:
```
JSON PARSE FAIL: Expecting ',' delimiter: line 7 column 9804 (char 9995)
```
Probablemente comillas sin escapar o caracteres de control (`\n` no escapado) en el `body` de algún email no-test (moodle releases, security alerts) que incluyen URLs largas y contenido HTML denso.

El `parseIteratorItems` en [canvas-executor.ts](../app/src/lib/services/canvas-executor.ts) (introducido en v27.x Bloque 11 de progressSesion31) es frágil: si JSON.parse falla, retorna array vacío silenciosamente en vez de fallar fuerte o repararlo.

### Comparativa con pre-v30.1

En el run `e9679f28` pre-fix (15:15 UTC) el iterator output tenía 37.307 chars y los 11 nodos completaron. Post-v30.1 el iterator output es `"[]"` (2 chars). Ningún cambio de v30.1 toca canvas-executor — es un no-determinismo del LLM del lector: genera JSON con más o menos errores de escape en cada ejecución. El canvas es frágil por diseño.

### Alcance propuesto del próximo milestone

Posibles fases (a validar en `/catdev:new`):

- **ITER-01**: `parseIteratorItems` tolerante. Intentar `JSON.parse` → si falla, usar `jsonrepair` (ya está en el codebase para architect según MEMORY) → si falla, log `warn` con context + fallback a extracción por regex. **Cierra el gap raíz.**
- **LECT-01**: Refinar instrucciones del nodo lector. Forzar output JSON array puro, sin markdown, con escape explícito de comillas/saltos. Reduce probabilidad pero no garantiza (LLMs).
- **SCHEMA-01**: Validación JSON schema antes del iterator — si el output no es array válido, fail loud con error explícito en vez de cascade silent skip.
- **TEST-01**: Suite de tests del canvas con emails sintéticos variados (caracteres especiales, emails largos, HTML denso).
- **OBS-01**: Categorizar mejor los errores "completed pero skipped cascade" en el skill Auditor para que CatBot los flag como severity HIGH aunque no haya errors estrictos en logs.

### Criterio de activación

~~User decision 2026-04-22~~ **ACTIVADO Y CERRADO** — el milestone v30.2 CatDev (sesión 33, shipped 2026-04-23) ejecutó todas las fases (ITER-01, LECT-01, OBS-01, TEST-01) y cerró el bug. Item archivado.

### Referencias

- Run PRE-FIX: `e9679f28-d310-43d3-8edc-db5f23e57dbf` (11 nodes completed, degraded=true por v30.1 issues)
- Run POST con data: `609828fa-80e6-4d1e-873d-dba3560bb762` (3 completed + 8 skipped, degraded=false pero pipeline roto)
- Lector output preservado en `canvas_runs.node_states` del run 609828fa para análisis.
- CatBot transcript disponible en `/tmp/catdev-verify3.json` (análisis via inspect_canvas_run + canvas_get_run).

---

### ★ CANDIDATO A PRÓXIMO MILESTONE CATDEV — Inbound v4d: dedup semántico + BlastFunnels lead extraction + respuesta K12/Educaverse
**Capturado:** 2026-04-23 (sesión 33, verificación live del canvas post-v30.2)
**Severidad:** HIGH — el pipeline mecánicamente funciona pero la lógica de negocio pierde leads y no distingue casuísticas del producto

### Evidencia

Tras el live run `66aeb915-a415-4b8c-8012-72957bd61cc3` (2026-04-23 09:05 UTC) con pipeline técnicamente verde:

- ✅ Iterator produjo 5 items reales (bug v30.2 cerrado).
- ✅ Auditor verde (`degraded=false`, `silent_skip_cascade.detected=false`).
- ❌ Dedup del lector agrupa por `from` plano → 3 emails del mismo `from` con 3 temas distintos (K12 colegio, patrimonio histórico VR, REVI Granada) se marcaron como `is_duplicate: true` los 2 últimos. Solo se respondió al más antiguo (K12). Los leads sobre patrimonio y REVI perdidos.
- ❌ Emails de `contacto@blastfunnels.com` (gestor de leads de Educa360) tratados como leads directos. BlastFunnels es un adapter: el lead real está dentro del body (`E-mail: xxx@yyy.com`), junto con `Tipo de Organización`, `Nombre`, `País`, etc. Hay que extraer el lead real y responder a esa dirección, no a BlastFunnels.
- ❌ No se filtra por formulario: solo interesa `"Registro cuenta free"` (alta plataforma K12). Otros formularios BlastFunnels se procesan igual.
- ❌ Respuesta genérica: no hay template K12-specific con oferta premium 3 meses + CTA reunión + addon Educaverse para universidades.

### Alcance propuesto del próximo milestone (5 fases)

- **P1 — Detector BlastFunnels + extractor de lead real:** domain match `blastfunnels.com` (cualquier local-part). Parser del body semi-estructurado → campos `formulario`, `E-mail`, `Nombre Completo`, `Tipo de Organización`, `Centro Educativo`, `País`, `Ciudad`, `Teléfono`, `Dispone de VR`. Nuevo CatPaw/skill.
- **P2 — Filtro de formularios relevantes:** solo `formulario ∈ { "Registro cuenta free" + variantes }` continúa en pipeline. Otros → `mark_read, motivo: "formulario no-target"`.
- **P3 — Deduplicación semántica reescrita:** reemplazar `group by from` por `group by (lead_email_real, formulario|threadId|similitud-asunto)`. BlastFunnels dedup usa `email_real` del body + formulario. Email directo dedup respeta threadId distintos como consultas independientes.
- **P4 — Respuesta K12 Free→Premium + variante Universidad:** nuevo email-template en `.docflow-kb/resources/email-templates/` + seed idempotente en `db.ts`. Base K12: bienvenida + descripción premium (cientos de salas / generador de rutas didácticas / métricas / gestión profesores-usuarios / cursos) + oferta 3 meses premium + CTA reunión. Addon Universidad: bloque con `www.educaverse.org` ("Recrea tu universidad en el metaverso y crea experiencias únicas") + CTA. Detección por regex case-insensitive sobre `Tipo de Organización` contiene `universidad|facultad|universitario`.
- **P5 — Verificación + regression tests:** unit tests del parser BlastFunnels body + detector dominio + dedup semántico. Oracle CatBot end-to-end con emails test cubriendo: K12 universidad, K12 colegio, BlastFunnels doble envío (notificación + datos), Antonio 3 temas distintos mismo `from`. Validación manual del usuario.

### Referencias

- Run 609828fa (pre-v30.2, iterator bug): pipeline roto antes.
- Run 66aeb915 (post-v30.2, live verificado sesión 33): pipeline mecánico OK, lógica de negocio insuficiente.
- Conversación sesión 33 con copy aprobado del usuario para email K12 (premium conversion) + añadido universitario (Educaverse).

### Criterio de activación

User decision 2026-04-23 (sesión 33): confirmado para abrir como próximo milestone `/catdev:new "Inbound v4d: dedup semántico + BlastFunnels lead extraction + respuesta K12/Educaverse"`.

### ~~★ Cronista CatDev: protocolo de documentación viva~~ (RESUELTO 2026-04-23 por v30.4)
**Capturado:** 2026-04-23 sesión 34 (petición del usuario tras v30.3 cierre)
**Cerrado por:** v30.4 sesión 35 — ver [Progress/progressSesion35.md](Progress/progressSesion35.md). 5 fases shipped sin hotfixes: P1 infraestructura (columna `rationale_notes` en 5 tablas + interface `RationaleNote` + endpoints PATCH extendidos), P2 tools (get_entity_history + 5 update_*_rationale append-only con idempotencia), P3 skill sistema Cronista CatDev (4313 chars, pattern byte-symmetric mirror Auditor), P4 sync con sección `## Historial de mejoras` en KB + fix del bug de description truncada via API PATCH descubierto en v30.3 quick-win, P5 backfill retroactivo de 9 entries en 5 entidades cubriendo v30.2 + v30.3. Oracle verde: CatBot respondió sobre `parseIteratorItems` citando run 609828fa + silent_skip_cascade + tip regex-salvage sin pista explícita. Item archivado.

### Arquitecto de Agentes skill en lazy-load silencioso (mismo bug resuelto en v30.5 para Orquestador)
**Capturado:** 2026-04-23 sesión 36 (durante P1 AUDIT de v30.5)
**Severidad:** LOW — category=strategy, no system. Su contenido (4508 chars) no llega al LLM automáticamente, pero no está claro que contenga reglas "comportamentales" críticas (a diferencia del Orquestador que sí las tenía).
**Síntoma:** el script `audit-skill-injection.cjs --verify` lista `Arquitecto de Agentes` (id `arquitecto-agentes`) como LAZY-LOAD junto al Orquestador. Su mención está en `catbot-prompt-assembler.ts:256` con el mismo patrón *"cuando el usuario pida X, llama a get_skill"*.
**Fix propuesto:** evaluar si su contenido merece promoción literal según la convención R31. Si sí → mismo pattern que v30.5 (skill sistema o adjusted + `buildArquitectoProtocolSection()` + push priority=1). Si no → dejar como lazy-load documentado y reconocido.
**Criterio de activación:** cuando aparezca un síntoma concreto de "CatBot no sigue lo que dice el Arquitecto de Agentes" o cuando un milestone futuro toque creación/configuración de agentes.

### R03 fine-tune — anti-patterns reincidentes en dominio comparativa numérica
**Capturado:** 2026-04-23 sesión 36 (batería P5 de v30.5)
**Severidad:** LOW — el patrón arquitectónico (literal injection de R01-R08) funciona en 3/4 métricas. R03 persiste parcialmente en 1/3 queries.
**Síntoma:** la query "Comparativa facturación Q1 2025 vs Q1 2026" sigue incluyendo "Analista Comparativo" en el plan pese a que R03 lista ese nombre explícitamente como anti-pattern. El dominio (comparativa numérica temporal) tira culturalmente hacia "un agent LLM que compare". En v30.4 iter 2 el plan incluía 3 agents de cálculo; en v30.5 solo 1 (reducción 3→1 pero no 0).
**Fix propuesto:** (a) runtime validator pre-response que detecte nombres `/^(Calculador|Validador|Auditor|Analista|Verificador|Contador)/` en agents propuestos y fuerce re-planificación; (b) ejemplo canónico positivo dentro del skill Canvas Inmutable (un canvas deterministic-calculator completo); (c) R03 con más peso en el prompt (priority=0 en lugar de 1 — sacrificar 4k chars de priority=0).
**Criterio de activación:** si aparece un canvas en producción con hallucination numérica silenciosa — momento de endurecer.

### kb-sync-db-source DATABASE_PATH default engañoso
**Capturado:** 2026-04-23 sesión 35 (durante P5 BACKFILL de v30.4)
**Severidad:** MEDIUM — causa confusión silenciosa, 0 updates cuando parece haber corrido OK
**Síntoma:** el script usa por default `~/docflow/app/data/docflow.db` (seed CI con 9 catpaws) en lugar del mount real `/home/deskmath/docflow-data/docflow.db` (DB de producción con ~40 catpaws). Si se ejecuta sin `DATABASE_PATH=...`, todas las entidades reales aparecen como "orphan" y los cambios no se propagan al KB. El operador no ve el error — solo nota que los resources no reflejan los cambios.
**Fix propuesto:** añadir sanity check en `openDb` — si `cat_paws COUNT(*) < 10` o `canvases COUNT(*) < 5`, warning "suspicious DB shape — ¿estás usando la DB buena?". Alternativa: cambiar DEFAULT_DB_PATH a `~/docflow-data/docflow.db` si existe (detectar mount real).
**Criterio de activación:** al próximo ciclo donde toque ejecutar kb-sync-db-source, incluirlo en el milestone.

### Connectors n8n_webhook sin body_template ni headers en config
**Capturado:** 2026-04-23 sesión 37 (observación v30.6 post-verificación)
**Severidad:** LOW — no rompe nada hoy (el canvas 005fa45e no se ejecuta sin el endpoint n8n real), pero establece un contrato implícito poco robusto.
**Síntoma:** CatBot crea connectors `n8n_webhook` con `config = { method, url }` pero pone el payload en `node.data.instructions` (ej: `{ "periodo": "Q1" }`). El executor case `connector` no tiene semántica documentada que diga "instructions → request body". Si el executor envía el body como `predecessorOutput` (el patrón general), entonces el JSON con `periodo` no llega y el webhook recibe otra cosa. Canvas `005fa45e` queda con este contrato ambiguo.
**Fix propuesto:** (a) definir `connector.config.body_template` con placeholders `{{periodo}}` resueltos a partir de `node.data` en tiempo de ejecución; (b) documentar en concepto canvas el mapping `node.data → body`; (c) validator en `canvas_add_node` tipo=connector que exija que el connector referenciado tenga `body_template` o que el canvas defina `data.request_body` explícito. Alternativa mínima: actualizar el skill `Canvas Rules Inmutables` con un bullet "para `n8n_webhook` pasa el payload via `data.request_body`, no `data.instructions`".
**Criterio de activación:** cuando se intente ejecutar por primera vez un canvas real con connector n8n (probablemente Comparativa facturación cuatrimestre cuando el n8n endpoint exista).

### Refactor DRY buildBody (knowledge-sync vs kb-sync-db-source)
**Capturado:** 2026-04-23 sesión 35 (durante P4 fix de description completa)
**Severidad:** LOW — no bloquea, pero facilita la siguiente generación de bugs asimétricos
**Síntoma:** dos scripts separados (`app/src/lib/services/knowledge-sync.ts` para API PATCH incremental y `scripts/kb-sync-db-source.cjs` para full-rebuild) rendereizan el body markdown con lógica independiente. El bug del v30.3 quick-win (description con `---` truncada) solo ocurría via API PATCH — el full-rebuild renderizaba bien. v30.4 P4 hizo el fix en ambos, pero la duplicación permanece.
**Fix propuesto:** extraer `buildBody(row, subtype, context)` a un módulo compartido (`app/src/lib/services/kb-body-builder.ts` con export dual commonjs/esm) consumido por los dos scripts. Coste: ~1-2h de código + tests de regresión para cada subtype.
**Criterio de activación:** cuando aparezca otro bug asimétrico entre API sync y full-rebuild.

### ★ CANDIDATO ARCHIVADO — Cronista CatDev (contenido original del item pre-v30.4)
**Capturado:** 2026-04-23 sesión 34 (petición del usuario tras v30.3 cierre)
**Severidad:** MEDIUM — mejora drásticamente la eficiencia de CatBot en análisis futuros, pero no bloquea nada hoy

### Motivación

Durante v30.2 + v30.3 se invirtió tiempo en mejoras del pipeline Inbound (reescritura de 3 nodos del canvas, 8 marcadores idempotentes, 2 templates populados, skill Auditor bumpeado). El contexto "**por qué se hizo así**" + tips de prompts usados + decisiones de diseño vive **solo** en `.catdev/spec.md` y `progressSesion*.md`. El KB público (que CatBot lee automáticamente) tiene metadata pero no el rationale. Cuando se pida a CatBot "mejora el canvas Control Leads" en el futuro, empezará sin ese contexto y puede reinventar.

### Estado actual (lo que NO existe)

- Ninguna skill/rule/protocolo para disparar "¿documentar esto?".
- Ninguna columna `rationale_notes`, `tips`, `improvement_log` en `cat_paws`, `canvases`, `catbrains`, `connectors`, `skills`.
- Tools `update_canvas_description`, `update_catbrain_description`, `update_connector`, `update_skill` faltan (solo existen `update_cat_paw`, `update_email_template`).
- El `change_log` del KB frontmatter registra solo auto-syncs mecánicos ("Auto-sync patch bump"), no contexto humano.
- Los security invariants (`canvases.flow_data`, `email_templates.structure`) excluyen del KB los prompts reales — el contenido operativo del pipeline no es visible.

### Scope propuesto (5 fases)

- **P1** — Infraestructura metadatos: ALTER TABLE idempotente para añadir columna `rationale_notes TEXT` (JSON estructurado `[{date, change, why, tip, prompt_snippet?, session_ref}]`) a las 5 tablas principales.
- **P2** — Tools CRUD: completar las `update_*_rationale` + `update_*_description` faltantes + tool de lectura `get_entity_history(type, id)` que combine `rationale_notes` + `change_log` del KB.
- **P3** — Skill "Cronista CatDev": protocolo comportamental inyectado en P1 del prompt. "Antes de modificar X, consulta `get_entity_history(X)`. Tras completar, ofrece documentar: '¿guardo esto en rationale_notes?'". Hook en `/catdev:done` para ofrecer documentar decisiones de la sesión.
- **P4** — Relajar invariants selectivamente: `kb-sync-db-source.cjs` lee nueva columna `rationale_notes` (sin secretos) y la sincroniza al KB como sección `## Historial de mejoras`. Mantener excluidos `flow_data`, `template.structure`, `connector.config`.
- **P5** — Backfill histórico: poblar `rationale_notes` de las entidades tocadas en v30.2 + v30.3 extrayendo contenido de `.catdev/spec.md` de esas sesiones. Historial arranca lleno, no vacío. Oracle CatBot: preguntar "¿por qué el parseIteratorItems usa jsonrepair?" → debe responder con contexto del run 609828fa sin que se le diga.

### Criterio de activación

User decision 2026-04-23 (sesión 34): confirmado como **próximo milestone CatDev v30.4** tras un quick-win de backfill manual en v30.3 post-shipping. Abrir con `/catdev:new "v30.4 Cronista CatDev — protocolo de documentación viva"` cuando corresponda.

### Referencias

- Investigación realizada en sesión 34 post-v30.3: grep de skills/rules/columnas + análisis del sync invariants.
- Pattern base: skill Auditor de Runs de v30.2 (byte-symmetric seed INSERT OR IGNORE + UPDATE canonical).

### connector-informe: report_cc no soportado por el executor
**Capturado:** 2026-04-23 sesión 34 (durante P4 hotfix del Redactor v4d)
**Severidad:** LOW
**Síntoma:** el Redactor emite `{accion_final:"send_report", report_to, report_cc: "fen@educa360.com, fran@educa360.com, adriano@educa360.com", ...}` pero el handler `send_report` en [canvas-executor.ts:913-1025](../app/src/lib/services/canvas-executor.ts#L913-L1025) solo lee `reportTo` (L915) y llama `sendEmail` sin pasar `cc`. El informe llega a antonio pero no al resto del equipo directivo.
**Fix propuesto:** extender el handler para leer `actionData.report_cc` y reenviarlo a `sendEmail({..., cc})`. Requiere RFC por R26 (modificar canvas-executor). Alternativa: usar un email group / alias en Gmail. Coste: ~15 min de código + RFC + rebuild.
**Criterio de activación:** cuando el equipo directivo reciba quejas por no recibir el informe, o next canvas refactor toque el executor.

### Redactor-like nodes producen truncate en JSON outputs largos
**Capturado:** 2026-04-23 sesión 34
**Severidad:** MEDIUM — el bug v30.3 P4 hotfix B se produjo por esta causa
**Síntoma:** nodos LLM que reemiten el array de iterator.results con todos los campos (incluyendo body, threadId, subjects largos) generan JSON > 8-10kb que los modelos (gemini-main en este caso) truncan silenciosamente. El output parcial falla `JSON.parse` en el executor y cae al legacy path.
**Mitigación aplicada ahora:** instrucciones explícitas al Redactor de emitir solo campos mínimos por item (marcador REDACTOR-V4D-STRIP). Patrón reutilizable para futuros nodos reducers/aggregators.
**Fix propuesto (next):** canvas-iterator-parser.ts (v30.2 P1) aplicado también al path del connector deterministico — si `parsed.accion_final` no existe por truncate, intentar jsonrepair antes de caer a legacy. Coste: ~30 min + test.
**Criterio de activación:** cuando aparezca el mismo síntoma en otro canvas o volumen de items alto.

### Helper catbot_check shape legacy

**Capturado:** 2026-04-23 sesión 33 (durante CHECK 1 de /catdev:verify)
**Severidad:** LOW
**Síntoma:** `scripts/catdev-utils.sh :: catbot_check` envía `{message, context}` al endpoint `/api/catbot/chat` pero la API actual requiere `{messages: [{role,content}], context}`. Resultado: `{"error":"messages array is required"}`. Workaround durante la sesión: `curl` directo.
**Fix propuesto:** actualizar el helper para construir `{messages: [{role:"user", content: message}], context}`. ~10 min.

### v29.0 Phases 146-148 — scope migrado
**Origen:** v29.0 CatFlow Inbound + CRM.
**Qué queda:** El scope del canvas Inbound+CRM de 8 nodos + tests E2E + PARTE 21 del Skill Orquestador. Las phases GSD no se ejecutaron.
**Estado:** El patrón Inbound ya vive en producción en [progressSesion31.md Bloque 12 "CatFlow Inbound v4c"](.planning/Progress/progressSesion31.md) pero con arquitectura distinta (Connector Gmail determinista, no CatPaw Operador). Esto cubre FLOW-01 a FLOW-06 funcionalmente.
**Posibles items CatDev:**
- **TRAIN**: Añadir al Skill Orquestador la documentación del patrón Inbound v4c validado (equivalente a PARTE 21 pero con la arquitectura real, no la planeada en v29.0).
- **TEST**: Suite E2E automatizada del canvas Inbound en producción (actualmente verificación manual).
- **DOC**: Entry en `.docflow-kb/protocols/catflow-inbound-v4.md` con decisiones de diseño (R20-R23 ya en KB).
**Criterio de activación:** Cuando el usuario diga "necesito automatizar los tests E2E del Inbound" o "CatBot debería saber construir variantes del patrón Inbound".

### v29.1 deferred — KB items
**Origen:** v29.1 KB Runtime Integration (shipped 2026-04-21).
- **KB-44**: `email-templates` active count shows +1 vs DB (duplicate-mapping pathology, 2 KB files → 1 DB row, no orphan).
- **KB-45**: CatBot `list_connectors` tool missing (only scoped `list_email_connectors` exists).
- **Idempotence cosmetic regression**: Second `kb-sync.cjs --full-rebuild --source db` re-bumps 56 version/timestamp fields on unchanged DB (pre-existing Phase 150/153 drift, non-blocking).
**Criterio de activación:** Milestone CatDev de saneamiento del KB cuando pese el ruido.

---

## 4. Incidentes conocidos (runtime bugs documentados)

Los 3 incidentes siguientes fueron descubiertos durante Phase 136 gate (2026-04-11) y están documentados con root-cause. Originalmente ruteados a "milestone v27.1" que nunca se abrió. Siguen vigentes como deuda.

### INC-11 — Renderer agent no interpola contenido en render_template
**Severidad:** Alta (rompe envío real de emails en canvases con renderer)
**Estado:** **Posiblemente mitigado** en progressSesion31 Bloque 5 (resolveAssetsForEmail + Maquetador v2.0) pero el contrato `render_template` variables obligatorias no fue documentado explícitamente.
**Criterios de cierre vigentes:**
- Run de `test-pipeline.mjs --case holded-q1` produce `html_body` en n4 con texto del resumen ejecutivo de n3 (no placeholder).
- `render_template` devuelve error explícito cuando faltan variables requeridas.
**Detalle completo:** [.planning/deferred-items.md](.planning/deferred-items.md) sección INC-11.

### INC-12 — Gmail catpaw-connector acepta send_email con args vacíos y devuelve {ok:true}
**Severidad:** Crítica (silent success enmascara fallos reales)
**Estado:** **Posiblemente mitigado** en progressSesion31 Bloque 4 (`send_email` + `html_body` field, Connector Gmail determinista) pero la validación obligatoria de `to/subject/body` y el check de `messageId` en el response no fueron verificados explícitamente.
**Criterios de cierre vigentes:**
- `send_email` con args incompletos devuelve error explícito (nunca `{ok:true}`).
- Executor marca nodo emitter como `failed` cuando `response_payload` no trae `messageId`.
- Test de regresión `send_email` sin `to` → error.
**Detalle completo:** [.planning/deferred-items.md](.planning/deferred-items.md) sección INC-12.

### INC-13 — connector_logs.request_payload redactado (observabilidad rota)
**Severidad:** Alta (bloquea post-mortem de fallos runtime)
**Estado:** Sin mitigación conocida. El catpaw-connector wrapper sigue registrando `{operation, pawId}` en vez de payload real.
**Criterios de cierre vigentes:**
- Run produce `connector_logs.request_payload` con args reales.
- `response_payload` de `send_email` contiene `messageId` en caso de éxito.
- Documentación en `.docflow-kb/` de qué se persiste y qué se redacta.
**Detalle completo:** [.planning/deferred-items.md](.planning/deferred-items.md) sección INC-13.

---

## 5. Legacy tests rojos

**Total:** ~18 failures pre-existentes en test suite, toleradas como baseline de CI.

| Suite | Fails | Última referencia |
|-------|-------|-------------------|
| `knowledge-tree.test.ts` | 7 | Pre-v29.1 legacy (módulo eliminado físicamente Phase 155); los tests deberían borrarse |
| `knowledge-tools-sync.test.ts` | 1 | Pre-existente, relacionado con el módulo eliminado arriba |
| `task-scheduler.test.ts` | 5 | Pre-v29.0, probablemente regression path de v22.0 Telegram |
| `alias-routing.test.ts` | 3 | Phase 140 añadió 3 canvas semantic aliases pero tests siguen esperando 8-row shape |
| `catbot-holded-tools.test.ts` | 2 | MCP fetch response interface drift, bloqueante para live-verify de v29.0 Phase 145 (ya won't-do) |

**Decisión:** Mantener como baseline. Limpieza en un milestone CatDev de saneamiento cuando el ruido CI pese. `knowledge-tree.test.ts` + `knowledge-tools-sync.test.ts` podrían borrarse YA (el módulo ya no existe) — si te molesta, 15 min de trabajo.

---

## 6. Fases históricas archivadas

Como parte de esta transición se archivaron **~42 directorios pre-v25** (phases 01-55) desde `.planning/phases/` a `.planning/phases-archive/` vía `git mv` para preservar historia con ruido reducido. Todas estas phases pertenecen a milestones shipped (v1-v14) cuyo trabajo está íntegro en el código y documentado en `.planning/Progress/progressSesionN.md`.

**Ver:** `.planning/phases-archive/` para el historial completo.

---

## Política de reopen

Un item de este backlog vuelve a activo cuando:
1. Un nuevo milestone CatDev menciona el scope.
2. Un bug en producción apunta al root-cause documentado aquí.
3. El usuario explícitamente lo pide.

La lista se revisa al inicio de cada milestone CatDev (paso 1 de `/catdev:new`).

---

*Documento generado en la transición GSD → CatDev. Mantenido por `/catdev:new` y `/catdev:done` (pueden añadir/cerrar items aquí como parte del lifecycle).*
