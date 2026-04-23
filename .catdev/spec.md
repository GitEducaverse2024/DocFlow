# CatDev: v30.7 Holded MCP — agregación de facturación por periodo

**Milestone:** v30.7 | **Sesión:** 38 | **Fecha:** 2026-04-23 | **Estado:** complete (shipped 2026-04-23)

## Objetivo

Al replay del prompt original "Comparativa facturacion cuatrimestre" con v30.5+v30.6 activas, CatBot produce un plan mucho mejor (iterator + comprobadores + R04 reutilización + checklist 8/8) pero, al intentar respetar R03 (cálculo determinista fuera del LLM), termina delegando agregaciones matemáticas a un webhook n8n externo. Política del usuario: **no queremos n8n como agregador** — ya existe un MCP Holded (`/home/deskmath/holded-mcp/` → `seed-holded-mcp`, 59 tools) que debería dar los datos ya calculados como una API.

Auditoría del MCP revela que `list_documents(docType=invoice, starttmp, endtmp)` filtra por periodo pero devuelve array crudo; `holded_invoice_summary` agrega totales pero es **per-contacto** con ventana relativa (`months` atrás), no rango absoluto global. Para materializar el canvas Comparativa sin violar R03 y sin depender de n8n falta exactamente un tool: **`holded_period_invoice_summary({starttmp, endtmp, docType?, paid?})` → `{total_amount, invoice_count, unique_contacts, by_month, by_status, period}`**. JavaScript determinista, reutilizable para cualquier canvas futuro que necesite agregar facturación por periodo (no solo comparativas: dashboards, alertas, KPIs).

Este milestone (a) implementa el tool nuevo en `invoice-helpers.ts` siguiendo exactamente el patrón de `holded_invoice_summary` (Zod schema + `withValidation` + rate-limit 100/60s + handler puro sin efectos), (b) añade tests vitest siguiendo `invoice-helpers.test.ts` (mock-client, casos: periodo con facturas, periodo vacío, filtro paid, cálculos by_month correctos, numeric rounding), (c) actualiza el catálogo de tools del connector en DB (`connectors.config.tools`) + rebuild KB para que CatBot descubra el tool via `search_kb`, y (d) sanea el drift del resource KB (status=deprecated erróneo). Canvas Comparativa queda desbloqueado para el siguiente milestone, sin entrar en scope de v30.7.

## Contexto técnico

- **Ficheros principales afectados:**
  - `/home/deskmath/holded-mcp/src/validation.ts` — añadir `periodInvoiceSummarySchema` (Zod)
  - `/home/deskmath/holded-mcp/src/tools/invoice-helpers.ts` — añadir `holded_period_invoice_summary` al return de `getInvoiceHelperTools(client)`
  - `/home/deskmath/holded-mcp/src/index.ts` — registrar rate-limit del tool nuevo (100/60s, alineado con `holded_invoice_summary`)
  - `/home/deskmath/holded-mcp/src/__tests__/invoice-helpers.test.ts` — añadir bloque `describe('holded_period_invoice_summary')` con 4-6 casos (follow pattern existente)
  - DB `connectors.seed-holded-mcp.config.tools` (SQLite) — append entry `{name, description}` del tool nuevo (UPDATE directo via API PATCH o script)
  - `.docflow-kb/resources/connectors/seed-hol-holded-mcp.md` — regenerado por kb-sync tras update DB; de paso corrige el drift `deprecated → active`
- **Cambios en DB DocFlow:** `connectors.config` JSON bump (field `tools[]`) para un único row (`id=seed-holded-mcp`). No schema changes.
- **Rutas API nuevas:** ninguna (el tool vive en el MCP server separado, no en DocFlow app)
- **Dependencias:**
  - v30.5 (literal-injection de skills) + v30.6 (fan-out sin antipatrón) activas — no son prerrequisitos duros pero sin ellas el canvas Comparativa no podría aprovechar el tool limpiamente.
  - Systemd user service `holded-mcp.service` — ya corriendo, requiere `systemctl --user restart holded-mcp` tras `npm run build`.
- **Deuda técnica relevante:**
  - Resource KB del connector Holded marcado `status: deprecated` por error (primer kb-sync bootstrap detectó `is_active=0` transitorio). Se sanea de paso en P3.
  - Connector `0880e182 Holded Aggregator Webhook` (n8n, creado en v30.5) queda **huérfano funcional** tras este milestone — ninguna canvas lo usará legítimamente. Candidato a borrar en v30.8 o cuando se cree el canvas Comparativa real. No se borra aquí: un tool técnico (add new MCP tool) no debe tocar entidades no relacionadas.

## Fases

| # | Nombre | Estado | Estimación |
|---|--------|--------|------------|
| P1 | Implementar `holded_period_invoice_summary` (schema Zod + tool + rate-limit) | ✅ done | ~25m |
| P2 | Tests vitest del tool nuevo (mock-client, 5 casos mínimo) | ✅ done | ~20m |
| P3 | Build MCP + restart systemd + UPDATE `connectors.config.tools` + kb-sync rebuild + extender renderer connector body con catálogo tools | ✅ done | ~30m |
| P4 | Verificación empírica: llamada MCP real Q1 2025 + validación output + CatBot `search_kb` descubre el tool | ✅ done | ~20m |

### P1: Implementar `holded_period_invoice_summary`

**Qué hace:** Tool MCP read-only que llama `GET /documents/{docType}` (default `invoice`) con filtros temporales absolutos y agrega en JS puro: total facturado, número de facturas, contactos únicos (Set de `contact` ids), desglose mensual (`{'YYYY-MM': {total, count}}`), desglose por status de pago. Zero LLM. Zero dependencia n8n.

**Ficheros a crear/modificar:**
- `/home/deskmath/holded-mcp/src/validation.ts` — append:
  ```ts
  export const periodInvoiceSummarySchema = z.object({
    starttmp: z.number().int().positive().describe('Start Unix timestamp seconds'),
    endtmp: z.number().int().positive().describe('End Unix timestamp seconds'),
    docType: z.enum(['invoice','salesreceipt','creditnote','proform','purchase']).optional().describe('Document type (default: invoice)'),
    paid: z.enum(['0','1','2']).optional().describe('Filter: 0=unpaid, 1=paid, 2=partial'),
  }).refine(d => d.endtmp > d.starttmp, { message: 'endtmp must be greater than starttmp' });
  ```
- `/home/deskmath/holded-mcp/src/tools/invoice-helpers.ts` — dentro de `getInvoiceHelperTools()` añadir `holded_period_invoice_summary` con:
  - description explícita sobre "aggregate global, no contact filter, use holded_invoice_summary for per-contact"
  - inputSchema JSON Schema (mirror Zod)
  - `readOnlyHint: true`
  - handler con `withValidation(periodInvoiceSummarySchema, async (args) => { ... })`
  - Loop sobre `invoices[]` calculando:
    - `total_amount` (suma de `inv.total`, redondeo a 2 decimales)
    - `invoice_count`
    - `unique_contacts` (`new Set(invoices.map(i => i.contact)).size`)
    - `by_month`: `{ 'YYYY-MM': { total, count } }` derivado de `inv.date` (Unix → new Date → toISOString slice 0,7)
    - `by_status`: `{ paid: {count, total}, unpaid: {count, total}, partial: {count, total} }`
    - `period: { starttmp, endtmp, human: 'YYYY-MM-DD to YYYY-MM-DD' }`
- `/home/deskmath/holded-mcp/src/index.ts` — añadir línea en rate-limit map: `holded_period_invoice_summary: { maxRequests: 100, windowMs: 60000 }` (alineado con `holded_invoice_summary`).

**Criterios de éxito:**
- [ ] `npm run build` en `/home/deskmath/holded-mcp` sin errores TS
- [ ] Tool listado en `allTools` al hacer grep del index.ts
- [ ] Rate-limit registrado

### P2: Tests vitest del tool nuevo

**Qué hace:** Sigue el patrón de `invoice-helpers.test.ts:holded_invoice_summary`. Cubre casos críticos: happy path, periodo vacío (0 facturas → return con ceros, no crash), filtro `paid`, `by_month` correcto con facturas cross-month, numeric rounding (floats sumados a 2 decimales).

**Ficheros a crear/modificar:**
- `/home/deskmath/holded-mcp/src/__tests__/invoice-helpers.test.ts` — append bloque `describe('holded_period_invoice_summary', () => { ... })` con:
  - **test 1** `should aggregate total across all contacts in period`: mock 3 facturas con `contact` distintos → assert `total_amount, invoice_count=3, unique_contacts=3`
  - **test 2** `should handle empty period`: mock `client.get` returns `[]` → assert return shape completa con ceros, no throw
  - **test 3** `should filter by paid status when provided`: mock facturas mixed, args.paid='1' → assert `by_status.paid.count == X`
  - **test 4** `should group by month correctly`: mock 2 facturas en `2025-01`, 1 en `2025-03` → assert `by_month['2025-01'].count === 2, by_month['2025-03'].count === 1`
  - **test 5** `should round totals to 2 decimals`: mock facturas con totals `100.333, 200.666` → assert `total_amount === 300.99`
  - **test 6** `should reject endtmp <= starttmp`: args inválidos → assert throws con mensaje Zod
- No mockear `resolveContactId` (el tool nuevo no lo usa).

**Criterios de éxito:**
- [ ] `npm test -- invoice-helpers` exit 0
- [ ] Los tests existentes de `holded_invoice_summary` siguen pasando (no regresión)
- [ ] Coverage del nuevo tool ≥80% (`npm run test:coverage` si procede)

### P3: Build MCP + restart systemd + UPDATE connectors + kb-sync

**Qué hace:** Deploy del MCP cambiado y sincronización del catálogo en DocFlow para que CatBot descubra el tool. El patrón del connector Holded guarda el listado de tools como JSON embebido en `connectors.config.tools[]` (no se resuelve dinámicamente contra el MCP). Hay que appendar el tool nuevo al array y regenerar el resource KB.

**Ficheros/comandos:**
- `cd /home/deskmath/holded-mcp && npm run build` — compila a `dist/`
- `systemctl --user restart holded-mcp` — aplica el binario nuevo
- Verificación server vivo con el tool: `curl -X POST http://192.168.1.49:8766/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'` → grep `holded_period_invoice_summary`
- Update `connectors.config.tools[]` en DocFlow DB via **API PATCH** `/api/connectors/seed-holded-mcp` (la API respeta el invariante de seguridad KB sin que lleguen secrets; no usamos SQL directo):
  ```bash
  # append nueva entry a config.tools[]
  curl -X PATCH http://localhost:3500/api/connectors/seed-holded-mcp -H 'Content-Type: application/json' -d @/tmp/patched-config.json
  ```
- `node scripts/kb-sync.cjs --full-rebuild --source db` — regenera `_index.json`, `_header.md` y el resource `seed-hol-holded-mcp.md` reflejando tool nuevo + corrigiendo drift `deprecated → active`.

**Criterios de éxito:**
- [ ] Respuesta MCP `tools/list` incluye `holded_period_invoice_summary`
- [ ] DB `connectors.seed-holded-mcp.config` contiene el tool en el array
- [ ] `.docflow-kb/resources/connectors/seed-hol-holded-mcp.md` frontmatter muestra `status: active` y body menciona el tool nuevo
- [ ] Build DocFlow (`npm run build` en `app/`) limpio (sanidad, aunque no tocamos code DocFlow)

### P4: Verificación empírica

**Qué hace:** Prueba real end-to-end del tool nuevo contra el MCP deployado + comprobación de que CatBot lo descubre al planificar.

**Pasos:**
1. **Llamada MCP real**: `curl -X POST http://192.168.1.49:8766/mcp ... method=tools/call name=holded_period_invoice_summary args={starttmp: <Q1 2025 timestamp>, endtmp: <Q1 2025 end>}` → validar que la respuesta tiene la forma esperada (`total_amount`, `invoice_count`, `unique_contacts`, `by_month`, `by_status`, `period`) y que los números son plausibles (no NaN, no negativos, counts enteros).
2. **Comparación cruzada**: mismo periodo con `list_documents` crudo → sumar manualmente los `total` de los items y comparar con `total_amount` del tool nuevo (±0.01 por rounding). Si divergen, bug en el handler.
3. **CatBot `search_kb`**: preguntar *"¿qué tool del MCP Holded me da el total facturado global en un rango de fechas?"* → esperar que CatBot cite `holded_period_invoice_summary` con sus params. Confirma que el catálogo sincronizado es visible en `search_kb`.

**Ficheros a crear/modificar:**
- Ninguno de código.
- Actualizar `.catdev/spec.md` "Notas de sesión" con los 3 outputs verificados.

**Criterios de éxito:**
- [ ] MCP retorna objeto estructurado correcto para Q1 2025 real
- [ ] Suma manual de `list_documents` coincide con `total_amount` del tool nuevo
- [ ] CatBot cita el tool nuevo por nombre al preguntarle

## Verificación CatBot

CHECK 1: "Necesito saber la facturación total de enero a abril de 2025 en Holded: cuánto se facturó en total, cuántos clientes distintos y cuánto por mes. ¿Qué tool del MCP Holded usarías?"
  → Esperar: CatBot cita `holded_period_invoice_summary` con argumentos `{starttmp, endtmp}` correctos (no `holded_invoice_summary` que es per-contacto, ni `list_documents` crudo). Reconoce la diferencia entre los 3 tools.

CHECK 2: (opcional, solo si P4 punto 3 falla) "Usa tu tool de búsqueda en KB para encontrar tools de Holded que agreguen facturación por periodo."
  → Esperar: `search_kb` devuelve el resource del connector Holded actualizado y CatBot identifica el tool en la lista.

## Notas de sesión

### Decisiones y desviaciones

- **P3 creció de scope** al detectarse 2 huecos no triviales del KB renderer que bloqueaban la descubribilidad del tool nuevo: (a) el SELECT de connectors en `kb-sync-db-source.cjs:175-177` no incluía `config`, y (b) el `buildBody` para subtype=connector no renderizaba `config.tools[]` en el body markdown. Ambos se han resuelto en v30.7 (add `config` al SELECT + append sección `## Tools disponibles (N)` con listado `name + description` en body). Esto **sanea un bug arquitectónico más profundo**: hasta v30.7, cualquier tool añadida a un connector MCP quedaba invisible a `search_kb`/`get_kb_entry` porque el body KB nunca las mencionaba — misma clase de bug que v30.4 (description truncada) y v30.5 (lazy-load skills).
- **Tech-debt del DATABASE_PATH default confirmado en vivo**: primer rebuild con `node scripts/kb-sync.cjs --full-rebuild --source db` leyó la DB CI seed (sin el tool nuevo) produciendo body con 59 tools. Re-ejecuté con `DATABASE_PATH=/home/deskmath/docflow-data/docflow.db` explícito y funcionó. Documentado ya en tech-debt-backlog (§3 kb-sync-db-source DATABASE_PATH default engañoso) — v30.7 no lo arregla, solo lo sortea.
- **Drift status `deprecated → active`**: el resource del connector Holded seguía marcado deprecated por first-population (is_active=0 transitorio). El rebuild tras el fix del SELECT ha limpiado el drift automáticamente (lógica L1617-1622 de kb-sync-db-source limpia `deprecated_at/by/reason` al transicionar status). Resource ahora `status: active`, `version: 7.0.1`.
- **by_status siempre unpaid por limitación del API Holded**: el handler clasifica documentos por `inv.paid`, pero el endpoint `/documents/invoice` de Holded devuelve `paid` omitido (no `0`, no `undefined` en el JSON directamente pero el campo no viene). Resultado: las 40 facturas Q1 2025 se contabilizan como `unpaid` aunque algunas podrían estar pagadas. No se puede resolver en v30.7 sin llamadas extra por factura (`get_document(id)`) que romperían la característica "1 call → resumen". Observación documentada — candidata a mejora si Holded API expone `paid` en otro endpoint o si se usa el field `status` como proxy.

### Verificación CatDev — 2026-04-23

- ✅ **Build MCP** (`npm run build` en `/home/deskmath/holded-mcp`) exit 0, sin errores TS
- ✅ **Tests MCP** (`npx vitest run invoice-helpers.test.ts`) → 22/22 passed (14 previos + 8 nuevos, 0 regresiones)
- ✅ **Build DocFlow** sanitycheck limpio (no se tocó código app, solo scripts)
- ✅ **Systemd** `holded-mcp.service` active tras restart
- ✅ **MCP tools/list** responde con 124 tools (antes 118), `holded_period_invoice_summary` presente con description completa
- ✅ **Llamada MCP real Q1 2025** (starttmp=1735689600, endtmp=1746057599):
  - `total_amount`: 101708.93€
  - `invoice_count`: 40
  - `unique_contacts`: 20
  - `by_month`: 2025-01 → 6691.86€ (6 fact), 2025-02 → 27195.26€ (10), 2025-03 → 29113.33€ (16), 2025-04 → 38708.48€ (8) — crecimiento monotónico coherente
  - `by_status`: 40 unpaid (ver nota sobre limitación API)
- ✅ **Cross-check manual**: `list_documents` crudo → sumar `total` de 40 items → **101708.93€** exacto, 20 contactos distintos (coincidencia centésima)
- ✅ **KB resource**: `seed-hol-holded-mcp.md` frontmatter `status: active`, body incluye sección `## Tools disponibles (60)` con `holded_period_invoice_summary` en el listado
- ⚠️ **CatBot CHECK 1 (sin hints)**: CatBot respondió de memoria citando solo las tools de v30.5 (`holded_list_invoices`, `holded_invoice_summary`), sin llamar `search_kb`, concluyendo "no tengo ninguna tool para esto". Falla de discoverability, no del tool.
- ✅ **CatBot CHECK 2 (forzando `search_kb`)**: 2 llamadas search_kb + 1 get_kb_entry → cita `holded_period_invoice_summary` por nombre con descripción completa de métricas (`total_amount`, `invoice_count`, `unique_contacts`, `by_month`, `by_status`). Distingue correctamente de `holded_invoice_summary` (per-contacto).

### Observación arquitectónica nueva (candidato v30.8)

**Catálogo de tools MCP invisible en system prompt**: CatBot conoce los connectors (Holded MCP, LinkedIn Intelligence, etc.) por nombre en el system prompt, pero el listado de sus tools solo vive en el body del KB resource. Descubribilidad depende de que CatBot llame proactivamente `search_kb` cuando se le consulta algo específico del dominio de un connector — y el LLM no siempre lo hace (CHECK 1 demostró que responde con conocimiento cacheado si parece suficiente). Propuesta v30.8: extender el prompt assembler para inyectar una sección compacta `## Tools MCP disponibles por connector` con el catálogo top-N por relevancia, O reforzar la directiva "SIEMPRE consulta search_kb sobre <connector> antes de responder sobre sus capacidades" en el skill del orquestador. Añadido a tech-debt-backlog.
