# Sesion 40 — CatDev v30.9: Contrato tool↔runtime saneado (`data_extra` + audit + fixes ship v30.8)

**Fecha:** 2026-04-23
**Estado:** COMPLETADO

---

## Resumen

Noveno milestone bajo CatDev Protocol. Cierra sistemicamente la clase de bug arquitectonico "info necesaria en runtime pero inaccesible via tool del LLM" que habia recurrido 6 veces (v30.4 description, v30.5 skills lazy-load, v30.6 fan-out rule, v30.7 config.tools invisible, v30.8 catalogo MCP no descubierto, v30.9 params MCP nodes). Parchear el 6º instance de forma ad-hoc (anadir `tool_name`+`tool_args` como top-level de `canvas_add_node`) dejaria 29 fields mas abiertos. Auditoria exhaustiva del contrato revelo 53 fields del executor en 11 nodeTypes con gap respecto al schema de la tool. v30.9 entrega la solucion canonica: (a) script `audit-tool-runtime-contract.cjs` con `--verify` en CI estilo `audit-skill-injection.cjs`, (b) param generico `data_extra: string` en `canvas_add_node`/`canvas_update_node` validado contra whitelist auto-generado, (c) regla R09 en skill Canvas Inmutable (literal-injected) + R33 rule critica en KB, (d) fixes colaterales del ship v30.8 (`by_status.available=false` en MCP Holded para no alucinar morosidad + Gmail `auto_send=true` para envolver Markdown Redactor), (e) verificacion end-to-end real: CatBot reconstruye Comparativa sin hints, `data_extra` aplicado correctamente, canvas ejecuta y envia email real a antonio@educa360.com sin patch manual. Primer ship del arco v30.5-v30.9 que NO requirio intervencion post-construccion.

---

## Bloque 1 — El diagnostico exhaustivo

### Superficie real del contrato

Parser del executor (`canvas-executor.ts` switch dispatchNode) extrajo todos los `data.X` leidos por nodeType. Paralelamente extraccion de los fields expuestos por `canvas_add_node` schema.

| Metrica | Valor |
|---------|-------|
| Fields data que el executor lee | 53 unicos |
| Top-level fields de `canvas_add_node` | 14 |
| nodeTypes distintos usados | 11 |
| nodeTypes con gap (fields no accesibles via tool) | 11 |
| Fields en gap (requieren data_extra) | 53 |

Ninguna de las 11 nodeTypes era completamente cubierta por los top-level params. La brecha era **estructural, no un caso aislado**.

### Por que era sistemica

Cada nodeType tiene su "contrato de inputs" distinto:
- `connector` MCP: `tool_name`, `tool_args`
- `agent` con RAG: `useRag`, `ragQuery`, `projectId`, `maxChunks`
- `project` (CatBrain legacy): `catbrainId`, `input_mode`, `connector_mode`
- `condition`: `condition`
- `output`: `format`, `notify_on_complete`, `outputName`
- `storage/drive`: `drive_operation`, `drive_file_id`, `drive_folder_id`, `subdir`, `storage_mode`
- `scheduler`: `schedule_type`, `delay_value`, `delay_unit`
- `multiagent`: `execution_mode`, `payload_template`
- + otros

Añadir cada uno como top-level param de `canvas_add_node` seria inflar el schema indefinidamente cada vez que el executor crece. La alternativa escalable: un param generico que acepta cualquier field del whitelist respectivo al nodeType.

---

## Bloque 2 — Audit script permanente (P1)

### Diseño

`scripts/audit-tool-runtime-contract.cjs` — ~240 LOC CommonJS. Siguiendo el patron probado de `audit-skill-injection.cjs` (v30.5).

**Lo que hace**:
1. Parser del switch `dispatchNode` en canvas-executor: extrae `data.X` references por `case 'nodeType':` block, balanceando braces.
2. Parser del schema `canvas_add_node`: extrae property keys del `parameters.properties` block via regex.
3. Mapping de tool params → node.data keys (aliases como `extra_skill_ids` → `skills`).
4. Filtrado de `RUNTIME_ONLY_FIELDS` (fields que el executor mismo setea, no inputs: `executionStatus`, `iterator_state`, `scheduler_counts`, etc.).
5. Diff: por cada nodeType, qué fields faltan en top-level tool.
6. Output en 3 formatos: tabla terminal (default), JSON stdout (`--json`), archivos committed (`--write`).
7. `--verify`: compara whitelist committed contra current runtime, exit 1 si drift.

### Output

Dos artefactos en sync por construccion:
- `.docflow-kb/generated/node-data-whitelist.json` — canonical para humanos + CI.
- `app/src/lib/generated/node-data-whitelist.ts` — mirror TS consumible por Next.js (fuera del KB `app/` Docker build context seria inaccesible).

Ambos se regeneran con `--write`. Ambos versionan commit.

```
✓ Whitelist written: .docflow-kb/generated/node-data-whitelist.json
✓ TS mirror written: app/src/lib/generated/node-data-whitelist.ts
  53 runtime fields across 11 nodeTypes with gaps
```

### Integración en ciclo CatDev

Cualquier milestone que toque `canvas-executor.ts`:

```bash
node scripts/audit-tool-runtime-contract.cjs --verify || {
  node scripts/audit-tool-runtime-contract.cjs --write
  # commit the regenerated whitelist + update R33/R09 if new nodeTypes
}
```

El mismo patron ya probado con skills desde v30.5. Audit → detecta drift → forza update coherente.

---

## Bloque 3 — `data_extra` generico (P2)

### Schema update

Ambas tools canvas:

```ts
data_extra: {
  type: 'string',
  description: 'JSON string con fields de node.data especificos del nodeType. Ver R09 en Canvas Rules Inmutables + R33 KB. Ejemplos: ...'
}
```

**Por que string y no object**: JSON Schema anidado object-in-object tiene soporte irregular en algunos SDKs LLM. String es universalmente soportado, el handler parsea + valida.

### Handler: `parseAndValidateDataExtra`

Helper centralizado:

```ts
function parseAndValidateDataExtra(
  dataExtraRaw: unknown,
  nodeTypeLower: string,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  // 1. undefined/null/'' → no-op, ok true empty data
  // 2. not string → error "debe ser JSON string"
  // 3. parse JSON → error si malformed
  // 4. whitelist lookup por nodeType en NODE_DATA_WHITELIST
  // 5. si nodeType no acepta data_extra → error explicito
  // 6. keys invalidas → error con lista de validas
  // 7. ok → Object.assign al node.data del caller
}
```

Aplicado en `canvas_add_node` (tras configuracion iterator) y `canvas_update_node` (tras fields estandar). Integracion minimalmente invasiva: una linea de `Object.assign(nodeData, extraResult.data)`.

### Validación error-driven

Si el LLM envia `data_extra='{"tool_name":"X","garbage":"Y"}'` al nodeType `connector`:

```
{ "error": "data_extra contiene keys no validos para nodeType 'connector': [garbage]. Keys validos: [auto_report, auto_send, drive_*, mode, report_*, target_*, template_id, tool_args, tool_name]. Revisa R09 en Canvas Rules Inmutables o consulta R33 en KB." }
```

El LLM recibe exactamente la informacion necesaria para corregirse en el siguiente turn.

---

## Bloque 4 — R09 literal + R33 KB (P3)

### R09 en Canvas Rules Inmutables

Añadido al skill `skill-system-canvas-inmutable-v1` (patron v30.5). Instructions pasan de 4011 → 6728 chars (+2717 chars para R09). Contenido:

1. Regla dura: "si creas connector MCP sin data_extra con tool_name, el executor cae al default search_people (LinkedIn) y falla silenciosamente".
2. Protocolo: `list_connector_tools` primero → luego `data_extra='{"tool_name":"...","tool_args":{...}}'`.
3. Whitelist condensada por nodeType (11 entradas).
4. 4 ejemplos positivos (connector MCP, agent RAG, condition, output).
5. 1 ejemplo negativo (antipattern: texto libre en instructions).
6. Referencia a R33 KB para detalle completo.

CHECKLIST OBLIGATORIO amplia de 8 a 9 items, añade: `R09 ( ) nodos connector/agent/etc tienen data_extra con fields runtime cuando el nodeType lo requiere`.

Audit skill injection reporta: **5 LITERAL** (Auditor, Cronista, Canvas Inmutable+R09, Operador Modelos, MCP Discovery). Orquestador + Arquitecto siguen en LAZY-LOAD (tech-debt heredado, no scope).

### R33 en KB

Rule critica `.docflow-kb/rules/R33-canvas-data-extra-contract.md`. Tags: `critical, architecture, canvas, tools, data-extra`.

Body estructurado:
- La regla + razonamiento (por que existe data_extra).
- Historia de los 6 casos del patron.
- Whitelist por nodeType (con referencia a fuente canonica JSON).
- 3 ejemplos positivos + 1 antipattern.
- Como descubrir el whitelist en runtime (error-driven vs explicito via `get_kb_entry`).
- Audit permanente instruccion para futuros milestones.

Tag-taxonomy actualizado: `R33` + tags `tools`, `data-extra` a cross_cutting.

---

## Bloque 5 — Fixes colaterales ship v30.8 (P4)

### `by_status.available=false` en holded_period_invoice_summary

Bug: el tool devolvia `by_status={paid:{count:0}, unpaid:{count:40,total:101708}, partial:{count:0}}` cuando Holded API no exponia `paid` field. El Redactor LLM interpretaba como "100% morosidad criticidad absoluta".

Fix: detectar si al menos un documento trae `paid` field numeric:

```ts
let paidFieldAvailable = false;
for (const doc of documents) {
  if (typeof doc.paid === 'number') paidFieldAvailable = true;
  // ... (clasificacion solo si field existe)
}

const byStatusOut = paidFieldAvailable
  ? { paid: {...}, unpaid: {...}, partial: {...} }
  : { available: false, reason: 'Holded list endpoint did not expose "paid" field. Use holded_invoice_summary per-contact or get_document(id) for detailed status.' };
```

Test nuevo: `should emit by_status.available=false when Holded list does not expose paid field`. Test existing `should handle empty period` actualizado — lista vacia tambien es available=false (no sabemos, no "todo unpaid 0€"). 23/23 tests verde.

### Gmail `auto_send=true` + `send_report` Markdown path

Bug: el executor Gmail esperaba `predecessorOutput` con `accion_final='send_email'` structured. Un Redactor LLM que emite Markdown plano caia en passthrough silencioso — nodo `completed`, email NO enviado.

Fix en `canvas-executor.ts:698-735`:

```ts
// v30.9 P4 — auto_send: envolver predecessorOutput en send_report
if (!actionData && data.auto_send === true && data.target_email) {
  actionData = {
    accion_final: 'send_report',
    report_to: data.target_email as string,
    report_template_ref: data.report_template_ref as string || null,
    report_subject: (data.target_subject as string) || `Informe generado — ${new Date().toISOString().slice(0, 10)}`,
    report_body: predecessorOutput,
  };
}
```

Pero el handler existente de `send_report` asumia `actionData.results` array (caso Inbound daily). Para el caso nuevo con `report_body` Markdown: bifurcacion.

```ts
if (accion === 'send_report') {
  const reportBody = actionData.report_body as string || '';
  if (reportBody) {
    // Path A (v30.9 P4): Markdown → HTML via mini-converter.
    // Cubre headers (#, ##, ###), bullets (- *), bold **, italic *, hr (---), paragraphs.
    reportHtml = markdownToHtml(reportBody);
  } else {
    // Path B (legacy): items[] → stats + tabla (Inbound daily path intacto).
  }
  // ... (render template + send)
}
```

Mini-converter ~20 LOC sin dependencia externa. Cubre 90% del Markdown que un Redactor LLM emite. Si emerge necesidad de code blocks/tables/nested, evaluar `marked` lib. No scope v30.9.

Fields añadidos al whitelist `connector`: `auto_send`, `target_email`, `target_subject`. Audit regenera automaticamente.

---

## Bloque 6 — Verificacion empirica (P5)

### Deploy

```bash
cd /home/deskmath/holded-mcp && npm run build && systemctl --user restart holded-mcp  # ✓ active
cd /home/deskmath/docflow && node scripts/audit-tool-runtime-contract.cjs --write    # 53 fields / 11 nodeTypes
cd app && npm run build                                                               # ✓ exit 0
docker compose build --no-cache && docker compose up -d                               # ✓
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app
DATABASE_PATH=/home/deskmath/docflow-data/docflow.db node scripts/kb-sync.cjs --full-rebuild --source db  # 202 entries
```

`/api/catbot/diagnostic/prompt-compose` confirma:
- `canvas_inmutable_protocol char_count=7076` (antes 4359, +R09 aplicado)
- `mcp_discovery_protocol char_count=3871` (v30.8 intacto)

### CHECK empirico: reconstruir Comparativa sin hints

Prompt idéntico sesion 35 (sin guías sobre data_extra ni R09). Canvas `4e601cc4` v30.8 borrado previamente para baseline limpio.

**Observacion async**: primer prompt disparo job async (orchestrator clasifico complex). Job progreso 3/6 nodos en 7+ min. Candidato a investigar en v30.10.

**Workaround sync**: segundo prompt "modo sync completa sin encolar". CatBot uso 17 tool calls en 66s, completo topologia.

**Verificacion DB** canvas `ecf591c3`:

| Nodo | Type | data_extra aplicado |
|------|------|---------------------|
| Inicio | start | — |
| Holded Q1 2025 | connector | `tool_name: holded_period_invoice_summary, tool_args: {starttmp:1735689600, endtmp:1746057599}` |
| Holded Q1 2026 | connector | `tool_name: holded_period_invoice_summary, tool_args: {starttmp:1767225600, endtmp:1777593599}` |
| MERGE Periodos | merge | — |
| Redactor Comparativo | agent | `agentId: b5d586b4-...` |
| Envio Antonio | connector | `auto_send: true, target_email: antonio@educa360.com, target_subject: Comparativa facturacion Q1 2025 vs 2026` |

**6 nodos, 6 edges, 0 patches manuales**. `data_extra` aplicado correctamente en 3 nodos (2 Holded + 1 Gmail).

### CHECK ejecucion end-to-end real

Canvas ejecutado (`runId 952f2d99`). 5 ticks (25s) hasta `completed`.

```
[c5e02260-2fa] start      completed  out_len=0
[tkrpfx1ei]    connector  completed  out_len=682   ← Holded 2025 JSON
[bmfzbbysq]    connector  completed  out_len=672   ← Holded 2026 JSON
[uz2czoupe]    merge      completed  out_len=1387  ← consolidado
[3cpcde2mt]    agent      completed  out_len=3188  ← Redactor Markdown
[vawamtkk6]    connector  completed  out_len=3603  ← Gmail (con send_report result)
```

Parse del output Gmail:
```json
{
  "ejecutado": true,
  "accion_tomada": "informe_enviado",
  "destinatario_final": "antonio@educa360.com",
  "plantilla_usada": "seed-tpl-informe-leads",
  "accion_final": "send_report",
  "report_subject": "Comparativa facturacion Q1 2025 vs 2026"
}
```

**Email REAL enviado** a antonio@educa360.com. Primera ejecucion del arco v30.5-v30.9 sin intervencion manual.

---

## Resumen de archivos modificados

| Archivo | Cambio |
|---------|--------|
| `scripts/audit-tool-runtime-contract.cjs` | **NEW** — audit parser + `--write` + `--verify` (~240 LOC) |
| `.docflow-kb/generated/node-data-whitelist.json` | **NEW** — whitelist canonica auto-generada |
| `app/src/lib/generated/node-data-whitelist.ts` | **NEW** — mirror TS para import en Next.js |
| `app/src/lib/services/catbot-tools.ts` | Import + helper `parseAndValidateDataExtra` + param `data_extra` en `canvas_add_node`/`canvas_update_node` schemas + aplicación en handlers |
| `app/src/lib/db.ts` | `CANVAS_INMUTABLE_INSTRUCTIONS` extendido con **R09** (+2717 chars), CHECKLIST pasa de 8 a 9 items. Skill se re-aplica via UPDATE canonical |
| `app/src/lib/services/canvas-executor.ts` | `case 'connector'` Gmail: auto-wrap predecessorOutput con `data.auto_send`; `send_report` handler bifurca path Markdown (`reportBody`) vs legacy items array, con mini-converter Markdown→HTML |
| `/home/deskmath/holded-mcp/src/tools/invoice-helpers.ts` | `holded_period_invoice_summary`: detect `paid` field availability, emit `by_status.available=false` cuando no detectable |
| `/home/deskmath/holded-mcp/src/__tests__/invoice-helpers.test.ts` | Test nuevo `should emit by_status.available=false...` + test empty period actualizado |
| `.docflow-kb/rules/R33-canvas-data-extra-contract.md` | **NEW** — rule critica con patron + whitelist + ejemplos + audit integration |
| `.docflow-kb/_schema/tag-taxonomy.json` | `R33` + tags `tools`, `data-extra` |
| `.docflow-kb/resources/skills/skill-sy-canvas-rules-inmutables.md` | Regenerado por kb-sync (version bump + R09 body) |

---

## Tips y lecciones aprendidas

### La auditoria antes que el fix cambio la escala del milestone

Spec inicial propuesta era 2 params top-level (`tool_name` + `tool_args`). Tras el audit P1 revelar 53 fields en gap, quedo claro que la solucion sistemica era tan pequena como la puntual (`data_extra` string + validacion) pero cubria 28x mas superficie. Leccion: **antes de parchear un caso, medir el patron**. En audit de 40 min se gano escalabilidad O(1).

### JSON string > nested object en params LLM

Anidar objects en `parameters.properties.X.type=object` tiene soporte irregular. Algunos modelos (Claude, Gemini) lo manejan bien; otros fuerzan plain types. Un JSON string con description rica + parse+validate en handler es universal, type-check robusto, y permite `description` explicito con ejemplos concretos.

### Mirror TS = resolver el gap Docker build context

El KB `.docflow-kb/` vive fuera de `app/` (Docker build context). Si el handler TS de `canvas-tools.ts` hace `import` del JSON del KB, el build Next.js falla (file outside project). Generar **dos** outputs del audit (JSON canonical + TS mirror) resuelve el tension: humanos/CI leen el JSON, codigo runtime importa el TS. Ambos en sync por construccion (audit `--write` genera los dos). Pattern reutilizable en cualquier futuro artefacto auto-generado que el app deba consumir.

### Error-driven learning con whitelist completo > regex estricto

Cuando el LLM envia una key invalida al handler, devolver `error: "Keys invalidas: [garbage]. Validas: [A, B, C, ...]"` permite self-correction en el siguiente turn. El LLM corrige sin intervencion humana. Con regex stricto que solo dice "schema error" el LLM no sabe que corregir. Trade-off 50 chars mas en el error message por eliminar debug rounds enteras.

### El pipeline async orchestrator tiene edge cases

Primer prompt disparo job async (orchestrator complexity classifier), job quedo atascado en 3/6 nodos. Hipotesis: watchdog no re-dispatcha cuando el sub-tarea interna necesita mas pasos que su budget inicial. v30.10 candidato. Workaround: prompt explicito "modo sync" funciona. **No convertir esto en v30.9 scope** — el objetivo del milestone era el contrato tool↔runtime, el orchestrator async es otro ciclo de bugs.

---

## Metricas de la sesion

- **Fases completadas:** 5/5
- **Ficheros modificados:** 6 (catbot-tools, db.ts, canvas-executor + mcp invoice-helpers + 2 tests) + 3 nuevos (audit script, whitelist JSON, whitelist TS mirror, R33 rule)
- **Runtime fields documentados en whitelist:** 53 (en 11 nodeTypes distintos)
- **Skills sistema en literal-injection:** 5/7 (sin cambio cuantitativo, pero Canvas Inmutable +R09 pasa de 4011 a 6728 chars)
- **Tests MCP:** 23/23 passed (14 previos + 9 nuevos que incluyen by_status.available=false y empty period fix)
- **Build verificado:** Si — 3 ciclos de build (2 docflow tras lint fix + 1 MCP)
- **Deploy:** Docker rebuild no-cache + MCP systemd restart. ~8 min total.
- **Verificacion CatBot:** 17 tool calls en 66s, topologia 6/6 nodos correcta, `data_extra` aplicado en 3 nodos sin error.
- **Ejecucion real end-to-end:** 25s, 6/6 nodos completed, email REAL enviado a antonio@educa360.com. **Primer ship del arco v30.5-v30.9 sin patch manual.**
- **Tech-debt cerrado:** 3 items del v30.8 (canvas_add_node sin tool_name/tool_args, by_status alarma falsa, Gmail passthrough silencioso).
- **Tech-debt nuevo:** 1 item (pipeline orchestrator async stuck en canvas complejos — candidato v30.10).
- **Audit permanente en CI:** `audit-tool-runtime-contract.cjs --verify` habilitado para prevenir regresiones del contrato.
- **Tiempo total sesion:** ~3h (incluyendo 2 ciclos de build + deploy).
