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

### ~~Catálogo detallado de tools MCP invisible en system prompt~~ (RESUELTO 2026-04-23 por v30.8)
**Cerrado por:** v30.8 sesión 39 — tool `list_connector_tools(connector_id)` + skill `Protocolo MCP Discovery` literal-injected (patrón R31 v30.5). CHECK 1 Holded + CHECK 2 LinkedIn pasan sin pistas, CatBot llama `list_connector_tools` como primera tool call y descubre capacidades reales. Latencia mejor que `search_kb + get_kb_entry` (11s vs 25s en cross-connector). Item archivado.

### ~~canvas_add_node/canvas_update_node sin tool_name + tool_args~~ (RESUELTO 2026-04-23 por v30.9)
**Cerrado por:** v30.9 sesión 40 — solución sistémica `data_extra` genérico + whitelist auto-generado cubre los 53 fields del executor (no solo tool_name/tool_args sino también useRag, condition, drive_*, format, schedule_*, etc.). Audit `audit-tool-runtime-contract.cjs --verify` en CI previene regresiones. CatBot reconstruyó canvas Comparativa con `data_extra` correcto sin hints; ejecución real + email enviado sin patch manual. Item archivado.

### ~~Redactor LLM interpreta by_status=unpaid (limitación v30.7) como alarma financiera real~~ (RESUELTO 2026-04-23 por v30.9)
**Cerrado por:** v30.9 sesión 40 P4 — `holded_period_invoice_summary` ahora detecta si el endpoint Holded list expone `paid` field para al menos un documento; si no, emite `by_status: { available: false, reason: "..." }` con guía explícita para que el LLM narrator no interprete morosidad. Test vitest nuevo valida el caso. Item archivado.

### ~~Connector Gmail send_email requiere accion_final structured en predecessor~~ (RESUELTO 2026-04-23 por v30.9)
**Cerrado por:** v30.9 sesión 40 P4 — el connector Gmail ahora detecta `data.auto_send=true` + `data.target_email` y envuelve `predecessorOutput` automáticamente en `send_report` structured. El handler `send_report` tiene una segunda rama que convierte Markdown → HTML con mini-converter (~20 LOC, cubre headers, bullets, bold, italic, hr, paragraphs). Canvas Comparativa ship v30.9 ejecutó end-to-end con email real enviado, `accion_tomada: informe_enviado`. Item archivado.

### CatBot no ejecuta update_*_rationale — solo lo "ofrece" (NUEVO 2026-04-23 sesión 40 closer)
**Capturado:** 2026-04-23 sesión 40 closer tras auditoría de documentación.
**Severidad:** MEDIUM — R07 del protocolo Cronista promete documentación pero el patrón actual deja 90% sin documentar.
**Síntoma:** R07 de `Canvas Rules Inmutables` dice "Tras completar cambios, ofrece al usuario documentar cada entidad tocada con `update_<tipo>_rationale`". En la práctica CatBot cierra el turno con "¿te parece bien si documento X?" y espera respuesta del usuario. Si el usuario no dice explícitamente "sí documenta", las tools `update_*_rationale` NUNCA se llaman. Auditoría sesión 40: 4 entidades tocadas (canvas Comparativa, CatPaw Redactor, Gmail connector, Holded MCP) → **0 rationale_notes pese a 2 promesas de CatBot en checklist**.
**Evidencia concreta:** checklist al final del turno construcción canvas y checklist closer ambos marcaron `R07 (✓) he prometido ofrecer update_*_rationale al completar` sin ejecutarlo. El humano tuvo que hacer los 5 PATCH manualmente para documentar el cierre del milestone.
**Fix propuesto:**
- (a) Reforzar R07: *"OFRECER ≠ EJECUTAR. Tras prometer en el checklist, DEBE invocar las tools `update_*_rationale` en la misma respuesta o en el siguiente turno sin esperar confirmación, salvo que el usuario diga explícitamente 'no documentes'"*.
- (b) Alternativa: pattern de auto-documentación al completion (p.ej. cuando el plan marca como done, un hook en el orchestrator dispara las tools rationale con un template estándar — sin LLM en el loop).
- (c) Extender el audit `audit-skill-injection.cjs` con una verificación semántica: grep de promesas R07 vs tool calls realizadas a `update_*_rationale` en los últimos N turns; flag de "promesa no ejecutada".
**Criterio de activación:** próximo milestone. Si CatBot vuelve a cerrar sin documentar tras prometer, priorizar.

### PATCH /api/connectors/[id] y /api/skills/[id] no serializan rationale_notes array (NUEVO 2026-04-23)
**Capturado:** 2026-04-23 sesión 40 closer (documentando entidades manualmente).
**Severidad:** LOW-MEDIUM — workaround sencillo (serializar a string en el cliente) pero inconsistente con `/api/canvas/[id]` que sí lo hace.
**Síntoma:** `PATCH /api/canvas/[id]/route.ts:86-89` serializa `rationale_notes` automáticamente si el payload es objeto: `typeof rationale_notes === 'string' ? rationale_notes : JSON.stringify(rationale_notes)`. Los handlers equivalentes de `/api/connectors/[id]` (L100-131) y `/api/skills/[id]` NO hacen esto — caen en el loop genérico `for (const field of allowedFields) { values.push(body[field]) }` que pasa el array tal cual → better-sqlite3 lanza "SQLite3 can only bind numbers, strings, bigints, buffers, and null". Resultado: HTTP 500.
**Evidencia concreta:** durante closer v30.9, 3 PATCH con `rationale_notes: [...]` fallaron (connectors Gmail + Holded + skill Canvas Inmutable). Workaround: enviar `rationale_notes: JSON.stringify([...])` en el payload → funciona.
**Fix propuesto:** copiar el branch del canvas PATCH handler a los otros 3 handlers (connectors, skills, catpaws, catbrains, email-templates si usan patrón similar). ~5 min por handler, ~20 LOC total. También añadir validación JSON.parse para rejetar JSON inválido en los 4.
**Criterio de activación:** inmediato si el usuario o CatBot documenta via API (cualquier ciclo). Candidato corto, fix quick-win para próximo milestone.

### Redactor LLM calcula ticket promedio — violación leve R03 (NUEVO 2026-04-23)
**Capturado:** 2026-04-23 sesión 40 closer (inspección del Markdown del Redactor en canvas Comparativa).
**Severidad:** LOW — el cálculo es trivial (división simple), los números base son correctos del MCP, resultado verificado manualmente. Pero rompe la regla R03 estricta.
**Síntoma:** Redactor Comparativo generó en el informe "Ticket Promedio: 2.542,72 € (Q1 2025) / 6.479,31 € (Q1 2026) / +154,8%". Cálculos: 101708.93/40=2542.72, 90710.41/14=6479.31 — exactos. Pero R03 dice "LLM no calcula". Aunque este caso el LLM acertó, no escalable con datasets más complejos.
**Fix propuesto:**
- (a) Extender `holded_period_invoice_summary` output con `avg_ticket: round2(total_amount/invoice_count)` — el MCP calcula el derivado, el Redactor solo narra.
- (b) Añadir otras métricas derivadas commonly useful: `growth_pct` cuando se cruzan 2 periodos (requeriría wrapper tool de "compare 2 holded_period_invoice_summary outputs"), `top_month_by_total`, etc.
- (c) Documentar en skill del Redactor: "no calcules — si falta una métrica, pídela al caller en vez de derivarla".
**Criterio de activación:** si aparece un cálculo más complejo que una división trivial y el Redactor lo invente mal. O si extendemos a más canvas financieros. No prioritario ahora.

### Pipeline orchestrator async se atasca en canvas complejos (NUEVO 2026-04-23)
**Capturado:** 2026-04-23 sesión 40 (durante v30.9 P5 verificación empírica)
**Severidad:** MEDIUM — tiene workaround (prompt explícito "modo sync") pero afecta UX en flujos de usuario natural.
**Síntoma:** primer prompt del usuario "crea canvas Comparativa facturación..." disparó el complexity classifier del orchestrator → encolado como `intent_job`. El job progresó construcción 3/6 nodos en los primeros 2 min, luego quedó stuck por 7+ min sin avanzar. Canvas parcial quedó en DB con `tkrpfx1ei` y `bmfzbbysq` (los 2 Holded) pero sin merge, agent, output. Segundo prompt "completa en modo sync" funcionó en 66s.
**Hipótesis:** el watchdog del orchestrator no re-dispatcha eficientemente cuando el sub-task interno requiere más pasos que el budget inicial asignado. O el strategist se queda esperando un tick que nunca llega.
**Fix propuesto:**
- (a) Investigar `intent-jobs` pipeline (`app/src/lib/services/intent-jobs-worker.ts` o similar). Identificar dónde el job se bloquea.
- (b) Añadir watchdog que re-tickee jobs `in_progress` sin update >3 min.
- (c) Logs más verbose en cada tick para diagnóstico.
**Criterio de activación:** próximo canvas complejo que el usuario pida construir. Si vuelve a atascarse sin solución del orchestrator, priorizar.

### _historical context — canvas_add_node sin tool_name/tool_args (resuelto por v30.9)_
**Capturado:** 2026-04-23 sesión 39 (durante ship del canvas Comparativa facturación tras v30.8)
**Severidad:** HIGH — canvas construidos con connectors MCP por CatBot NO son ejecutables sin patch manual post-construcción. Gap sistémico equivalente a los 5 milestones previos (info necesaria en runtime pero inaccesible vía tool MCP del LLM).
**Síntoma:** `canvas_add_node` schema acepta `agentId, connectorId, instructions, model, extra_*_ids, position, separator, limit_mode, max_rounds, max_time, insert_between` pero NO `tool_name` ni `tool_args`. El executor en `canvas-executor.ts:1193-1199` lee `data.tool_name` (default `search_people` — LinkedIn!) y `data.tool_args` para invocar tools MCP. CatBot crea connector MCP nodes con solo `instructions='Usa X con params Y'` que el executor ignora. Resultado: todos los connector MCP nodes caen al default (`search_people` contra Holded MCP falla silenciosamente).
**Evidencia concreta:** Canvas `4e601cc4 Comparativa facturación cuatrimestre` (ship v30.8) — CatBot construyó 2 connectors Holded perfectamente (R04 reuso, fan-out R32, etc) pero sin `tool_name`/`tool_args`. Ejecución iba a fallar con `tool 'search_people' not found in Holded MCP`. Fix manual via PATCH API añadió `data.tool_name='holded_period_invoice_summary'` + `data.tool_args={starttmp, endtmp}` y el canvas ejecutó end-to-end (101708.93€ / 40 fact Q1 2025, 90710.41€ / 14 fact Q1 2026 parcial).
**Fix propuesto:**
- (a) Extender `canvas_add_node` y `canvas_update_node` con params `tool_name: string` y `tool_args: object` (JSON). Validar que si `connectorId` apunta a un connector tipo `mcp_server`, `tool_name` es obligatorio y aparece en su `config.tools[]`.
- (b) Añadir R09 a skill `Canvas Rules Inmutables`: *"Connector MCP nodes requieren `tool_name` + `tool_args` estructurados — NO basta con `instructions` texto libre. Antes de crear el nodo, llama `list_connector_tools` para conocer el tool_name y schema de args correcto"*.
- (c) Post-ship de (a)+(b): reconstruir canvas Comparativa desde cero con CatBot para validar que ahora lo hace completo (topología + params MCP).
**Criterio de activación:** inmediato. Cualquier canvas que use connectors MCP requiere este fix. Candidato v30.9.
**Referencia:** [.planning/Progress/progressSesion39.md] + observación en las notas de sesión del spec v30.8.

### Redactor LLM interpreta by_status=unpaid (limitación v30.7) como alarma financiera real (NUEVO 2026-04-23)
**Capturado:** 2026-04-23 sesión 39 (tras ejecución real del canvas Comparativa)
**Severidad:** MEDIUM — output narrativo incorrecto puede llevar a decisiones operativas erróneas, especialmente si el informe se envía a stakeholders.
**Síntoma:** `holded_period_invoice_summary` (v30.7) asigna todos los documents a `by_status.unpaid` cuando el endpoint Holded `/documents/invoice` no devuelve el field `paid` en la respuesta list (limitación conocida). El informe del Redactor LLM al procesar el JSON recibe `by_status.unpaid.count: 40, paid.count: 0` y lo narra como: *"el 100% de la facturación se encuentra en estado 'No Pagado'... ausencia total de recaudación... riesgo de liquidez crítico"* — cuando en realidad es artefacto del API, no del estado real de pagos.
**Evidencia:** Ejecución real del canvas `4e601cc4`, sección 4 del informe del Redactor incluye frases alarmantes sobre morosidad que son falsas.
**Fix propuesto:**
- (a) En `holded_period_invoice_summary` handler: detectar si el field `paid` viene undefined en todos los documents → marcar `by_status: { available: false, reason: 'Holded list endpoint does not expose paid field' }` en lugar de clasificar como unpaid. Al llegar al Redactor, recibe señal explícita de "no evaluar morosidad" en lugar de dato erróneo.
- (b) Alternativa: añadir llamada batch `holded_get_document(id)` para resolver paid status real, con trade-off de N requests.
- (c) Documentar en skill del Redactor Comparativo (o en la instructions del nodo) la directiva: *"Si `by_status.available===false`, omite cualquier análisis de morosidad/liquidez del informe"*.
**Criterio de activación:** inmediato si el canvas Comparativa va a ejecutarse de forma recurrente. Fix menor (~15 min en handler MCP).

### Connector Gmail send_email requiere accion_final structured en predecessor (LIMITACION CONOCIDA)
**Capturado:** 2026-04-23 sesión 39 (ejecución canvas Comparativa — nodo Gmail marcó `completed` sin enviar email)
**Severidad:** MEDIUM — silencioso: el executor marca el nodo `completed` aunque no envíe email; no hay error visible.
**Síntoma:** `canvas-executor.ts:698-715` del connector Gmail parsea `predecessorOutput` buscando JSON con `accion_final='send_email'` o `send_report`. Si el predecessor (típicamente un Redactor AGENT) emite Markdown plano, el Gmail connector hace passthrough del texto sin disparar envío. Pattern diseñado para Phase 141 SKILL-02 (Respondedor/Redactor emitían JSON estructurado). Pattern moderno de "LLM genera Markdown libre" no encaja.
**Fix propuesto:**
- (a) Heurística en el connector Gmail: si `data.auto_send=true` o `data.target_email=X` en el node data, envolver predecessorOutput (sea Markdown o texto) en `{accion_final: 'send_report', report_to: target_email, report_body: predecessorOutput}` automáticamente.
- (b) Instruction template en skill Canvas Inmutable para Redactores que terminan en Gmail: *"emite JSON con `{accion_final:'send_email', to: ..., subject: ..., body_md: <markdown>}`"*.
- (c) Detectar si el nodo Gmail está sin structured input y marcar `status: waiting_structured_input` en lugar de `completed`.
**Criterio de activación:** cuando un canvas real que manda email deja de enviarlo silenciosamente (ya pasó en ship v30.8).

### Seed canónico sobreescribe cambios via API en connectors.config (NUEVO 2026-04-23)
**Capturado:** 2026-04-23 sesión 39 (durante v30.8 P3)
**Severidad:** MEDIUM — silencioso, se manifiesta solo tras rebuild; puede invalidar trabajo legítimo vía API.
**Síntoma:** `db.ts:1470-1474` hace `UPDATE connectors SET config = ?, description = ?, updated_at = ? WHERE id = 'seed-holded-mcp'` en cada container init. Si un PATCH API previo añadió una entry a `config.tools[]` (como v30.7 P3 hizo), ese cambio se pierde en el siguiente restart. La respuesta HTTP 200 del PATCH da falsa confianza.
**Evidencia:** v30.8 P3 primer deploy — `list_connector_tools` devolvió 59 tools pese a que v30.7 había hecho PATCH con 60. Solo arreglándolo en el seed hardcoded persistió.
**Fix propuesto:**
- (a) Marcar campos como "seed-initial" (solo INSERT OR IGNORE, nunca UPDATE) vs "seed-canonical" (siempre overwrite). Por defecto `config` debería ser "seed-initial" — el seed solo aplica si no existe row.
- (b) Merge selectivo: en el UPDATE, hacer array-merge de `config.tools[]` (añadir entries nuevas del seed, conservar las de DB), NO replace completo.
- (c) Mover `holdedConfig` fuera de `db.ts` a un JSON versionado separado + diff contra DB al startup con logger warn si divergen.
**Criterio de activación:** si otro milestone añade tools al MCP Holded o a cualquier connector con `config` mutable, esto se manifiesta inmediatamente. Priorizar en v30.9 o cuando se haga hot-add de tool en otro MCP.
**Workaround actual:** añadir toda tool nueva MCP al seed hardcoded de `db.ts` + al PATCH via API (doble fuente).

### Catálogo detallado de tools MCP (contexto histórico del item resuelto)
**Capturado:** 2026-04-23 sesión 38 (durante P4 de v30.7, CHECK 1 fallido)
**Severidad:** HIGH — degrada la descubribilidad de tools MCP nuevas, hace que CatBot responda con capacidades obsoletas cuando existe un tool adecuado en el KB.
**Síntoma:** Al añadir `holded_period_invoice_summary` y sincronizarlo al KB body correctamente (v30.7 P3), CatBot sigue respondiendo "no tengo ninguna tool para esto" si la consulta del usuario no incluye la directiva explícita "usa search_kb". El system prompt incluye los nombres de connectors (Holded MCP, LinkedIn Intelligence) pero no los catálogos detallados de sus tools — esos solo viven en el body del KB resource. CatBot responde de memoria con las tools que vio en iteraciones previas.
**Evidencia concreta:** CHECK 1 v30.7 — prompt "¿qué tool usarías para total facturado Q1 2025 global?" → CatBot cita solo `holded_list_invoices` y `holded_invoice_summary` (v30.5 level) y concluye "no expone un método global, necesitas un CatFlow con script custom". CHECK 2 con directiva "usa search_kb y get_kb_entry sobre seed-hol-holded-mcp" → CatBot encuentra y describe `holded_period_invoice_summary` correctamente.
**Fix propuesto:**
- (a) Extender `catbot-prompt-assembler.ts` con una sección `## Tools MCP disponibles` que inyecte un resumen compacto (name + description one-liner) de los tools de los connectors activos (límite de chars razonable, ej: 3-5k tokens max). Riesgo: inflar prompt si hay muchos connectors MCP.
- (b) Añadir a `Canvas Rules Inmutables` (o skill equivalente) una regla dura: "SIEMPRE antes de responder sobre capacidades de un connector MCP, ejecuta `search_kb({tags:['connector']})` o `get_kb_entry({id:'<connector-id>'})`". Aprovecha el patrón literal-injection v30.5 para que el trigger no se ignore (R31).
- (c) Tool nueva `list_connector_tools(connectorId)` dedicada que devuelva el array `config.tools[]` — más barata que search_kb completo, permite a CatBot querer conocer capacidades sin rebuscar.
**Criterio de activación:** inmediato. Siguiente milestone que añada tool MCP o canvas complejo debería cerrar este item — si no, se repetirá el fallo de descubribilidad.
**Referencia:** [.planning/Progress/progressSesion38.md] bloque 4 "Test de discoverability".

### DATABASE_PATH default (ampliación de observación existente)
**Capturado inicialmente:** 2026-04-23 sesión 35.
**Re-incidencia confirmada en vivo:** 2026-04-23 sesión 38 (v30.7 P3) — primer `kb-sync.cjs --source db` sin env explícita leyó la DB CI seed (`~/docflow/app/data/docflow.db`, 9 catpaws, `test_status: untested`) en lugar de la DB real (`/home/deskmath/docflow-data/docflow.db`, 40 catpaws). Resultado: resource regenerado sin el tool nuevo, sin saneo del drift deprecated. Solo corriendo con `DATABASE_PATH=/home/deskmath/docflow-data/docflow.db node scripts/kb-sync.cjs ...` funcionó.
**Por qué es crítico mantenerlo visible:** cada vez que se añade un tool MCP o se toca el KB vía script, este pitfall silencioso puede corromper el estado sincronizado. Ya ha mordido 2 sesiones consecutivas (v30.4 y v30.7).
**Fix propuesto (sin cambio):** sanity check en `openDb` — si `cat_paws COUNT(*) < 10` o `connectors COUNT(*) < 10`, warning ruidoso "suspicious DB shape at PATH=X — ¿estás usando la DB real?". Alternativa: detectar `/home/deskmath/docflow-data/docflow.db` si existe y preferirlo.

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
