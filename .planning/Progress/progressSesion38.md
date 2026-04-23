# Sesion 38 — CatDev v30.7: Holded MCP agregacion de facturacion por periodo

**Fecha:** 2026-04-23
**Estado:** COMPLETADO

---

## Resumen

Septimo milestone bajo CatDev Protocol. Al pasar por tercera vez el prompt "Comparativa facturacion cuatrimestre" a CatBot (ya con v30.5+v30.6 activas) aparece una decision arquitectonica de CatBot aceptable pero no alineada con la politica del proyecto: para evitar sumas LLM (R03) delega el calculo a un webhook n8n externo. El usuario rechaza n8n como agregador — "tenemos un MCP Holded (59 tools, `seed-holded-mcp`) que debe devolver los datos ya calculados como una API". Auditoria del MCP confirma que `list_documents` filtra por periodo pero devuelve array crudo; `holded_invoice_summary` agrega pero solo per-contacto con ventana relativa. Falta exactamente un tool: agregacion global por rango absoluto. v30.7 implementa `holded_period_invoice_summary({starttmp, endtmp, docType?, paid?}) → {total_amount, invoice_count, unique_contacts, by_month, by_status, period}` como JS puro determinista, extiende el renderer del KB (que no exponia `config.tools[]` en el body del resource — bug arquitectonico silencioso equivalente al de v30.4 y v30.5), verifica empiricamente contra Holded real Q1 2025 (101.708,93€, 40 facturas, 20 clientes, desglose mensual coherente) y documenta una observacion arquitectonica nueva para v30.8: el catalogo de tools MCP no llega al system prompt, solo al body del KB, lo que fuerza a CatBot a hacer `search_kb` activamente para descubrirlo.

---

## Bloque 1 — El tool nuevo en el MCP Holded

### La laguna del catalogo previo

59 tools MCP de Holded cubrian CRM, facturacion per-contacto, proyectos, fichaje. `list_documents(docType='invoice', starttmp, endtmp)` traia facturas filtradas por periodo, pero el agregado (total, count distinct, group by mes) quedaba como responsabilidad del caller. El unico tool "summary" existente (`holded_invoice_summary`) aceptaba `contact` como parametro obligatorio y `months` relativo — no servia para "total Q1 2025 de toda la empresa".

Tres caminos posibles identificados:

- **(A)** Extender el MCP con un tool nuevo (`holded_period_invoice_summary`) — determinista, R03 limpio, reutilizable en cualquier canvas/dashboard/KPI futuro.
- **(B)** Delegar la agregacion a un webhook n8n (lo que CatBot propuso espontaneamente en v30.6) — rompe la regla "usar MCP del proyecto antes que infra externa".
- **(C)** Dejar que el LLM agregue con instrucciones estrictas — viola R03 directamente.

v30.7 elige **(A)**. El tool vive en `/home/deskmath/holded-mcp/src/tools/invoice-helpers.ts` junto al `holded_invoice_summary` existente; mismo estilo (withValidation HOF, Zod schema, extractArray, round2 a 2 decimales).

### Implementacion

**Archivo:** `src/validation.ts`

```typescript
export const periodInvoiceSummarySchema = z
  .object({
    starttmp: z.number().int().positive().describe('Start Unix timestamp in seconds'),
    endtmp: z.number().int().positive().describe('End Unix timestamp in seconds'),
    docType: z.enum(['invoice', 'salesreceipt', 'creditnote', 'proform', 'purchase']).optional(),
    paid: z.enum(['0', '1', '2']).optional(),
  })
  .refine((d) => d.endtmp > d.starttmp, {
    message: 'endtmp must be greater than starttmp',
  });
```

**Archivo:** `src/tools/invoice-helpers.ts` — handler puro que llama `client.get('/documents/${docType}', {starttmp, endtmp, paid?})`, itera documentos, mantiene:

- `totalAmount` acumulador, round2 al final
- `uniqueContacts: Set<string>` derivado de `inv.contact`
- `byMonth: { 'YYYY-MM': { total, count } }` via `new Date(inv.date*1000).toISOString().slice(0,7)`
- `byStatus: { paid: {count,total}, unpaid: {count,total}, partial: {count,total} }` derivado de `inv.paid` (1/2/else)
- `period: { starttmp, endtmp, human: 'YYYY-MM-DD to YYYY-MM-DD' }`

**Archivo:** `src/index.ts` — rate-limit registrado (100 requests / 60s, alineado con `holded_invoice_summary`).

### Tests

`src/__tests__/invoice-helpers.test.ts` — nuevo `describe('holded_period_invoice_summary', ...)` con 8 casos:

1. Agrega total cross-contact en periodo real
2. Periodo vacio retorna shape completa con ceros, sin crash
3. Forwarding de `paid` filter a Holded API (`client.get` spy args)
4. `by_month` correcto con facturas cross-month
5. Rounding de decimales (`100.333 + 200.666 = 301` tras round2)
6. Desglose por `paid` status (1/2/0)
7. Rechazo Zod cuando `endtmp <= starttmp`
8. `docType` param cambia endpoint (`/documents/proform`)

Ejecucion: `npx vitest run src/__tests__/invoice-helpers.test.ts` → **22/22 passed** (14 previos intactos + 8 nuevos).

---

## Bloque 2 — El bug del renderer del KB (descubrimiento colateral)

### Sintoma

Tras build + deploy del MCP + UPDATE del `connectors.config.tools[]` en DocFlow DB via API PATCH (append del nuevo `holded_period_invoice_summary`), `node scripts/kb-sync.cjs --full-rebuild --source db` regenero el resource `seed-hol-holded-mcp.md` pero el body seguia siendo de 12 lineas:

```markdown
## Descripcion
Conector MCP para Holded ERP. Modulos: ...
## Configuracion
- Type: mcp_server
- test_status: ok
- times_used: 0
```

El catalogo de tools NO estaba renderizado. `grep -c holded_period_invoice_summary` sobre el resource → 0. `search_kb` no encontraria el tool nuevo aunque estuviera correctamente en DB.

### Causa raiz (dos capas)

1. **SELECT de connector no incluia `config`**: `scripts/kb-sync-db-source.cjs:175-177` leia `id, name, description, type, is_active, times_used, test_status, rationale_notes, created_at, updated_at` — `config` se omitia. Sin esa columna en `row`, el renderer no podia acceder al array de tools.
2. **buildBody subtype=connector no renderizaba `config.tools[]`**: el comentario `// NEVER render row.config (security)` se aplicaba al objeto entero. Correcto para fields como `url`, `api_key`, `body_template` (pueden contener secrets), pero **no para `config.tools[]` que es metadata publica** (`name`, `description`).

Este bug es **equivalente arquitectonico** a dos hallazgos previos:
- v30.4 P4: `description` truncada en body (solo summary se renderizaba)
- v30.5: skills category=system en lazy-load nunca llegaban al LLM

La clase comun: **informacion necesaria para la descubribilidad vive en DB pero el renderer del KB no la expone**, creando drift silencioso entre lo que la app tiene y lo que CatBot ve.

### Fix

```diff
- connector: `SELECT id, name, description, type, is_active, times_used,
+ connector: `SELECT id, name, description, type, config, is_active, times_used,
                      test_status, rationale_notes, created_at, updated_at
               FROM connectors`,
```

```javascript
} else if (subtype === 'connector') {
  // ... existing lines ...
  // DO render row.config.tools[] (MCP tool catalog): pure metadata, needed for search_kb.
  let configObj = null;
  try { configObj = typeof row.config === 'string' ? JSON.parse(row.config) : row.config; } catch { /* ignore */ }
  if (configObj && Array.isArray(configObj.tools) && configObj.tools.length > 0) {
    lines.push(`## Tools disponibles (${configObj.tools.length})`);
    lines.push('');
    lines.push('> Catalogo de tools expuestas por este connector. Los params concretos se obtienen llamando `tools/list` al servidor MCP.');
    lines.push('');
    for (const tool of configObj.tools) {
      lines.push(`- **\`${tool.name}\`** — ${tool.description || ''}`);
    }
  }
}
```

Post-rebuild: body del resource contiene **60 tools** listados (59 previos + `holded_period_invoice_summary` con descripcion completa). `search_kb("period invoice summary")` encuentra el resource; `get_kb_entry` expone el catalogo completo.

### Saneo colateral del drift `status: deprecated`

El resource Holded MCP estaba marcado `status: deprecated` desde first-population (`is_active=0 at first population` — transitorio). Como el SELECT previo no traia algunos campos relevantes, el rebuild no detectaba el cambio de `deprecated → active`. Tras el fix del SELECT, el rebuild limpio automaticamente (logica L1617-1622 de kb-sync-db-source) los fields `deprecated_at/by/reason` y bumpeo a `version: 7.0.1`, `status: active`.

---

## Bloque 3 — Verificacion empirica contra Holded real

Q1 2025 (primer cuatrimestre, enero-abril):
- `starttmp`: 1735689600 (2025-01-01 00:00:00 UTC)
- `endtmp`: 1746057599 (2025-04-30 23:59:59 UTC)

Llamada JSON-RPC al MCP:

```bash
curl -X POST http://192.168.1.49:8766/mcp \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":1,
       "params":{"name":"holded_period_invoice_summary",
                 "arguments":{"starttmp":1735689600,"endtmp":1746057599}}}'
```

Respuesta:

```json
{
  "period": { "starttmp": 1735689600, "endtmp": 1746057599, "human": "2025-01-01 to 2025-04-30" },
  "docType": "invoice",
  "total_amount": 101708.93,
  "invoice_count": 40,
  "unique_contacts": 20,
  "by_month": {
    "2025-01": { "total": 6691.86, "count": 6 },
    "2025-02": { "total": 27195.26, "count": 10 },
    "2025-03": { "total": 29113.33, "count": 16 },
    "2025-04": { "total": 38708.48, "count": 8 }
  },
  "by_status": { "paid": { "count": 0, "total": 0 }, "unpaid": { "count": 40, "total": 101708.93 }, "partial": { "count": 0, "total": 0 } }
}
```

**Cross-check manual**: mismo periodo con `list_documents` crudo → `sum(item.total for item in items) = 101708.93` exacto, `len(distinct(item.contact)) = 20` — coincide al centimo con el output del tool.

**Observacion: `by_status` siempre 40 unpaid**. El endpoint `/documents/invoice` de Holded no devuelve el field `paid` en la respuesta list (solo `status`, que es otro concepto — numeracion interna). El handler clasifica fallback como `unpaid` cuando `paid` es undefined. Limitacion documentada; requeriria `get_document(id)` por factura para conocer el estado real de pago. No bloqueante — `total_amount`, `invoice_count`, `unique_contacts`, `by_month` son correctos.

---

## Bloque 4 — Test de discoverability (el matiz)

### CHECK 1: sin pista explicita

Prompt: *"Necesito saber cuanto se facturo en Holded entre enero y abril de 2025... total, clientes distintos, desglose por mes. ¿Que tool del MCP Holded usarias?"*

CatBot: **no llamo `search_kb`** (0 tool calls). Respondio de memoria:

> "Para responder a tu pregunta de forma directa: no usaria ninguna de las tools actuales del MCP de Holded directamente. `holded_list_invoices` requiere contact especifico. No expone un metodo global. [...] La solucion correcta seria disenar un CatFlow con nodo CONNECTOR HTTP + nodo STORAGE/SCRIPT determinista."

Es decir, CatBot cita solo las tools que conocia en v30.5 (`holded_list_invoices`, `holded_invoice_summary`) y concluye que la capacidad no existe, proponiendo construir un canvas con nodo script. **Fallo de descubribilidad**, no del tool nuevo.

### CHECK 2: con directiva "usa search_kb"

Prompt: *"Busca en el KB (usa search_kb y get_kb_entry sobre el connector Holded MCP seed-hol-holded-mcp) que tools de agregacion de facturacion por periodo tiene."*

CatBot: 2 llamadas `search_kb` + 1 `get_kb_entry` → cita `holded_period_invoice_summary` por nombre con descripcion completa de metricas, distingue correctamente de `holded_invoice_summary` (per-contacto), recomienda su uso para KPIs y comparativas.

### Conclusion

El tool esta correctamente indexado y descubrible, pero CatBot no lo usa por defecto a menos que se le fuerce a buscar. El system prompt inyecta nombres de connectors pero NO el catalogo detallado de tools MCP — ese solo vive en el body del KB. Candidato a mejora arquitectonica v30.8: extender el prompt assembler para inyectar un resumen compacto de tools MCP relevantes por connector activo, o reforzar la directiva "consulta search_kb sobre X antes de asumir sus capacidades" en la skill del orquestador.

---

## Resumen de archivos modificados

| Archivo | Cambio |
|---------|--------|
| `holded-mcp/src/validation.ts` | **NEW schema** `periodInvoiceSummarySchema` (Zod con refine sobre rango) |
| `holded-mcp/src/tools/invoice-helpers.ts` | **NEW tool** `holded_period_invoice_summary` (handler puro con by_month/by_status aggregation) |
| `holded-mcp/src/index.ts` | Rate-limit registrado (100/60s) |
| `holded-mcp/src/__tests__/invoice-helpers.test.ts` | **+8 tests** nuevos (mock-client, 22/22 passed) |
| `docflow/scripts/kb-sync-db-source.cjs` | SELECT connector incluye `config`; `buildBody` renderiza `config.tools[]` como seccion markdown |
| DB `connectors.seed-holded-mcp.config.tools[]` | Append entry `holded_period_invoice_summary` (59→60 tools) |
| `docflow/.docflow-kb/resources/connectors/seed-hol-holded-mcp.md` | Frontmatter `status: deprecated → active` (drift saneado), version 7.0.1, body con seccion `## Tools disponibles (60)` |
| `docflow/.planning/tech-debt-backlog.md` | 2 items anadidos (observacion v30.7 sobre catalogo tools MCP en prompt + ampliacion del item DATABASE_PATH con evidencia live) |

---

## Tips y lecciones aprendidas

### El SELECT es la superficie oculta del KB
El hook `syncResource('connector','update',row)` y el `populateFromDb` full-rebuild leen la misma tabla, pero el SELECT usado para construir `row` determina que campos del DB quedan expuestos al KB. Si el SELECT omite un campo (`config` en este caso), el body KB no puede exponerlo aunque el renderer tenga logica lista. **Al anadir render de un campo nuevo, verifica PRIMERO que el SELECT lo trae**. Este bug ya habia pasado en v30.3 (quick-win: description truncada por query) y aqui recurre. Candidato a auditoria en v30.8: cross-check automatico entre `buildBody` y `FIELDS_FROM_DB_BY_SUBTYPE`/SELECT.

### `NEVER render row.config` es demasiado grueso
El comentario de seguridad original era correcto (no queremos URLs con tokens o body_templates con PII en el KB), pero el array `config.tools` es metadata publica que el LLM necesita. Es mas preciso **whitelistear campos publicos de config por subtype** que **blacklistear el config entero**. Patron general: en JSON de configuracion, distinguir "secrets (never expose)" de "catalog metadata (always expose)".

### El DATABASE_PATH default silencioso sigue mordiendo
Primer rebuild con `kb-sync.cjs --source db` uso la DB seed CI (`~/docflow/app/data/docflow.db`, ~9 catpaws) sin darse cuenta. El resultado: body con 59 tools (sin el nuevo), test_status=untested (el seed tiene valores viejos). Solo con `DATABASE_PATH=/home/deskmath/docflow-data/docflow.db node ...` se apunto a la DB real. Este item esta documentado desde sesion 35 pero no resuelto — cada milestone que toca kb-sync redescubre el pie-de-pagina. Priorizar fix.

### CatBot confia en su memoria mas de lo que deberia
CHECK 1 demostro que con solo el nombre del connector en el system prompt, CatBot asume que conoce todas sus tools y responde sin consultar el KB. El hit en CHECK 2 (con directiva explicita) no compensa la regresion: un usuario real no sabe que debe decir "usa search_kb" — esperaria que CatBot lo haga por defecto. Esta es una capa superior del bug v30.5 (skills lazy-load) aplicado a connectors: el sistema cree que "tener la informacion en KB" equivale a "hacerla accesible", pero sin trigger explicito el LLM no la busca. Candidato fuerte para v30.8.

---

## Metricas de la sesion

- **Fases completadas:** 4/4
- **Ficheros modificados:** 3 (validation, invoice-helpers, index.ts) + 1 test + 1 script + 1 resource KB + frontmatter en 1 DB row
- **Ficheros nuevos:** 0 (solo extensiones de existentes)
- **Tools MCP nuevas:** 1 (`holded_period_invoice_summary`)
- **Tests nuevos:** 8 (todos verde)
- **Build verificado:** Si (MCP build + DocFlow app sanity)
- **Verificacion end-to-end contra Holded real:** Si — 101.708,93€ Q1 2025 corroborado por cross-check manual exacto al centimo
- **Verificacion CatBot:** Parcial — CHECK 1 sin hints fallo (respondio de memoria, no descubrio el tool); CHECK 2 con directiva explicita paso (cito el tool con metricas correctas). Observacion arquitectonica nueva documentada para v30.8.
- **Tiempo total sesion:** ~85 min (incluyendo el scope expandido del renderer)
