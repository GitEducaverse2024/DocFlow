# Sesion 39 — CatDev v30.8: MCP Discovery Protocol — capacidades de connectors descubribles

**Fecha:** 2026-04-23
**Estado:** COMPLETADO

---

## Resumen

Octavo milestone bajo CatDev Protocol. Cierra el gap de discoverability detectado en CHECK 1 de v30.7: CatBot respondia de memoria sobre capacidades de connectors MCP ("el MCP de Holded solo tiene `holded_list_invoices` y `holded_invoice_summary`, necesitas canvas custom o webhook n8n"), ignorando tools recien anadidas al KB. La clase de bug era identica a v30.5 (skills lazy-load) aplicado a connectors. Aplicamos la solucion canonica R31 (literal-injection): (a) tool nueva `list_connector_tools({connector_id})` barata y focalizada (15 LOC, single SELECT), (b) skill dedicada category=system `Protocolo MCP Discovery` (3436 chars con regla dura + anti-patterns + ejemplo positivo + lista de ids comunes), (c) `buildMcpDiscoverySection()` en el assembler, push priority=1 junto a Auditor/Cronista/Canvas Inmutable. Durante P3 aparecio un hallazgo arquitectonico colateral: el seed de connectors en `db.ts` hace `UPDATE config = ?` en cada init, sobreescribiendo cualquier PATCH API previo — el catalogo v30.7 se perdia en restart. Fix: anadir la tool al `holdedConfig` hardcodeado para que el seed sea source of truth canonica. Verificacion empirica en 2 MCPs distintos (Holded + LinkedIn) pasa sin pistas: CatBot llama `list_connector_tools` como primera tool call y cita capacidades reales.

---

## Bloque 1 — Diagnostico: fallo de discoverability, no de disponibilidad

### Sintoma (CHECK 1 de v30.7, sesion 38)

Prompt identico al del usuario: *"Necesito saber cuanto se facturo en Holded entre enero y abril 2025... ¿que tool usarias?"*

CatBot respondio:
> "no usaria ninguna de las tools actuales del MCP. `holded_list_invoices` requiere contact. `holded_invoice_summary` es per-contacto. Necesitas diseñar un CatFlow con nodo Storage/Script custom o webhook n8n."

0 tool calls. 0 consulta al KB. Respuesta de memoria con el catalogo v30.5.

### Root cause

El system prompt menciona los connectors por nombre (Holded MCP, LinkedIn Intelligence, etc.) y sus descripciones breves, pero **NO** inyecta el listado detallado de tools. Ese listado vive en dos sitios:

1. `connectors.config.tools[]` en DocFlow DB (lo actualiza el PATCH API + el seed).
2. El MCP server runtime (`tools/list` JSON-RPC).

Ambos son source of truth, pero ninguno llega al system prompt. CatBot solo los descubre si llama proactivamente `search_kb` o `get_kb_entry`. En sesion 38 CHECK 1, CatBot no hizo ninguna consulta — asumio que ya conocia las capacidades del connector por el contexto del prompt.

La clase del bug es identica a v30.5 (skills lazy-load nunca llegan al LLM). La solucion canonica tambien: **literal-injection de una skill dedicada** que obligue el comportamiento correcto.

### Diseno: tool barata + skill literal-injected

Dos piezas complementarias:

- **Tool `list_connector_tools(connector_id)`** — single SELECT del `config.tools[]`, retorna array con `{name, description}`. Barato (100x menos chars que `get_kb_entry` que trae body entero con historial, frontmatter completo, rationale_notes).
- **Skill `Protocolo MCP Discovery`** — regla dura: *"ANTES de responder sobre capacidades de un connector, ejecuta `list_connector_tools` (o `search_kb` si no sabes el id). JAMAS respondas de memoria"*. Con anti-patterns explicitos, ejemplo positivo/negativo con el caso Holded real, y lista de 4 ids comunes como referencia rapida.

---

## Bloque 2 — Tool `list_connector_tools`

**Archivo:** `app/src/lib/services/catbot-tools.ts`

Definition (junto a `list_email_connectors` L478):

```ts
{
  type: 'function',
  function: {
    name: 'list_connector_tools',
    description: 'Devuelve el catalogo completo de tools expuestas por un connector MCP (config.tools array). Usa esto ANTES de responder sobre capacidades de un connector cuando el usuario pregunte por una operacion concreta. Mas barato que get_kb_entry. Input: connector_id (ej: seed-holded-mcp, seed-linkedin-mcp).',
    parameters: {
      type: 'object',
      properties: { connector_id: { type: 'string', description: 'ID del connector' } },
      required: ['connector_id'],
    },
  },
},
```

Handler (just before `case 'list_email_connectors'`):

```ts
case 'list_connector_tools': {
  try {
    const id = args.connector_id as string;
    if (!id) return { name, result: { error: 'connector_id es requerido' } };
    const row = db.prepare('SELECT id, name, type, config, is_active FROM connectors WHERE id = ?').get(id);
    if (!row) return { name, result: { error: `Connector '${id}' no existe` } };
    if (row.is_active !== 1) return { name, result: { error: `Connector '${id}' no esta activo` } };
    let cfg = {};
    try { cfg = row.config ? JSON.parse(row.config) : {}; } catch {}
    const rawTools = Array.isArray(cfg.tools) ? cfg.tools : [];
    const tools = rawTools.map(t => ({ name: String(t.name || ''), description: String(t.description || '') }));
    return { name, result: { connector_id: row.id, connector_name: row.name, type: row.type, tools_count: tools.length, tools } };
  } catch {
    return { name, result: { error: 'No se pudo leer el catalogo del connector' } };
  }
}
```

Sin test unitario (trade-off justificado en las notas del spec: la tool es trivial y la verificacion empirica de P4 la ejerce dos veces). Si un futuro milestone cambia la semantica del `config.tools[]`, anadir test.

---

## Bloque 3 — Skill `Protocolo MCP Discovery`

Seed en `app/src/lib/db.ts` (anadido despues del seed `Canvas Rules Inmutables`), ~3436 chars, pattern byte-symmetric `INSERT OR IGNORE + UPDATE canonical` (v30.4 Cronista + v30.5 Canvas Inmutable).

Contenido resumido:

1. **Objetivo**: obligar consulta de catalogo actualizado antes de responder sobre capacidades.
2. **Regla obligatoria** con los 3 pasos (conocer id → llamar tool directa; no conocer → search_kb primero).
3. **Anti-patterns prohibidos** con 4 ejemplos concretos (responder de memoria, proponer script custom sin confirmar, asumir catalogo previo vigente, decir "no tengo tool" sin haber llamado).
4. **Ejemplo positivo vs negativo** con el caso Holded de sesion 38.
5. **Por que**: los catalogos son mutables; la memoria del LLM no es source of truth.
6. **Lista de 4 connector ids comunes** como referencia rapida (Holded, LinkedIn, SearxNG, Gemini) — pero con disclaimer "VERIFICA siempre".

**Archivo:** `app/src/lib/services/catbot-prompt-assembler.ts`

```ts
function buildMcpDiscoverySection(): string {
  try {
    const instructions = getSystemSkillInstructions('Protocolo MCP Discovery');
    if (!instructions) return '';
    return `## Protocolo obligatorio: MCP Discovery (antes de responder sobre capacidades de connectors)
Cuando el usuario pregunte sobre un connector... LLAMA primero list_connector_tools...

${instructions}`;
  } catch { return ''; }
}
```

Push al array en `collectSections(ctx)`:

```ts
try {
  sections.push({ id: 'mcp_discovery_protocol', priority: 1, content: buildMcpDiscoverySection() });
} catch {}
```

Verificacion `scripts/audit-skill-injection.cjs`:
- **LITERAL: 5** (Auditor, Cronista, Operador Modelos, Canvas Inmutable, MCP Discovery)
- LAZY-LOAD: 2 (Orquestador pre-existente, Arquitecto — tech-debt heredado, no scope v30.8)

Endpoint `/api/catbot/diagnostic/prompt-compose` confirma seccion entregada:

```
auditor_protocol         priority=1 chars=5824
cronista_protocol        priority=1 chars=4645
canvas_inmutable_protocol priority=1 chars=4359
mcp_discovery_protocol   priority=1 chars=3871  ← nuevo
```

---

## Bloque 4 — El hallazgo arquitectonico del seed vs API

### El sintoma durante P3

Primer deploy completo (build + Docker rebuild + restart) + test CHECK 1:

```
=== TOOL CALLS ===
  list_connector_tools
=== REPLY ===
"Tras consultar el catalogo en tiempo real, no existe una tool nativa
 que devuelva estos datos agregados de forma global (como podria ser
 un `holded_period_invoice_summary`)... Necesitas construir un canvas
 con nodo storage custom."
```

CatBot SI llamo la tool (protocolo MCP Discovery funciono). Pero el resultado del tool **no incluia `holded_period_invoice_summary`** — solo las 59 tools v30.5 originales.

### Root cause

```bash
python3 -c "
import sqlite3, json
db = sqlite3.connect('/.../docflow.db')
cfg = json.loads(db.execute(\"SELECT config FROM connectors WHERE id='seed-holded-mcp'\").fetchone()[0])
print(len(cfg['tools']))  # → 59, no 60
"
```

Investigando `db.ts:1470-1474`:

```ts
if (holdedConnectorExists === 0) {
  // INSERT new connector with holdedConfig (59 tools)
} else {
  db.prepare(`UPDATE connectors SET config = ?, ... WHERE id = 'seed-holded-mcp'`).run(holdedConfig, ...);
}
```

Cada container start ejecuta el seed, y el `else` branch **sobreescribe `config` con el hardcodeado** (59 tools de v30.5). Mi PATCH via API de v30.7 P3 (60 tools) se perdia en cada restart. Bug silencioso: la respuesta HTTP 200 del PATCH convencia al operador de que el cambio era permanente, pero no lo era.

### Fix y lesson learned

Anadir la entry al `holdedConfig` inline en `db.ts:1401`:

```diff
  { name: 'holded_invoice_summary', description: 'Resumen de facturacion por contacto' },
+ { name: 'holded_period_invoice_summary', description: 'Aggregate global invoice summary for a date range (NOT per-contact): total_amount, invoice_count, unique_contacts, by_month, by_status. Use for period comparisons/dashboards/KPIs. For per-contact use holded_invoice_summary.' },
  { name: 'list_products', description: 'Lista productos' },
```

Tras el second rebuild, DB persiste 60 tools. CHECK 1 pasa.

Leccion: **el PATCH via API no es suficiente para cambios que deben sobrevivir rebuilds** cuando el seed incluye UPDATE. Dos fuentes de verdad compiten (seed hardcoded + API). Candidato a refactor arquitectonico en v30.9+: separar "seed inicial" (INSERT OR IGNORE sin UPDATE) de "hot config" (no tocar tras creacion), o merge selectivo donde el seed solo anade entries sin borrar existentes.

---

## Bloque 5 — Verificacion empirica

### CHECK 1 (Holded, idem prompt v30.7 fallido, sin pistas)

Prompt: *"Necesito saber cuanto se facturo en total en Holded entre enero y abril de 2025: total facturado, cuantos clientes distintos, y el desglose por mes. ¿Que tool del MCP Holded usarias para obtener estos datos agregados?"*

CatBot:
1. Primera tool call: `list_connector_tools({connector_id: 'seed-holded-mcp'})` — **patron MCP Discovery aplicado**.
2. Recibe 60 tools, detecta `holded_period_invoice_summary`.
3. Respuesta: *"Para obtener un resumen global de facturacion en un rango de fechas concreto, la tool exacta que usaria es `holded_period_invoice_summary`. A diferencia de `holded_invoice_summary` (per-contacto), esta agrega globalmente y devuelve `total_amount`, `unique_contacts`, `by_month`. ¿Quieres que la ejecute ahora mismo?"*

0 menciones de "necesitas canvas custom con nodo Storage/Script". Distingue per-contacto vs global. Ofrece ejecutar. Latencia 32s.

### CHECK 2 (LinkedIn, cross-connector)

Prompt: *"Que tools expone el conector LinkedIn Intelligence? No recuerdo ninguna."*

CatBot:
1. Primera tool call: `list_connector_tools({connector_id: 'seed-linkedin-mcp'})`.
2. Respuesta enumera las 6 tools reales organizadas por dominio (perfiles, empresas, empleos), cada una con descripcion precisa y emoji agrupador.

Latencia 11s (mucho mas rapida que CHECK 1 v30.7 con `search_kb` en 25s). Protocolo aplicado sin hardcoding especifico Holded.

### Resumen cuantitativo

| Metrica | v30.7 CHECK 1 (fallido) | v30.7 CHECK 2 (forzado) | v30.8 CHECK 1 | v30.8 CHECK 2 |
|---------|------------------------|-------------------------|---------------|---------------|
| Tool call principal | ninguna (memoria) | `search_kb` + `get_kb_entry` | `list_connector_tools` | `list_connector_tools` |
| Cita tool nuevo | No | Si (tras forzar) | Si (espontaneo) | Si (6 tools LinkedIn) |
| Propone n8n/script custom | Si | No | No | No |
| Latencia | 40s | 25s | 32s | 11s |
| Tokens input | 128k | 19k | 35k | 17k |

El protocolo MCP Discovery convierte el hit forzado de v30.7 CHECK 2 en comportamiento por defecto, ademas reduciendo latencia en CHECK 2 cross-connector por mejor focalizacion de la tool (single SELECT vs KB scan).

---

## Resumen de archivos modificados

| Archivo | Cambio |
|---------|--------|
| `app/src/lib/services/catbot-tools.ts` | **NEW tool** `list_connector_tools` (definition + handler, 15 LOC handler puro) |
| `app/src/lib/db.ts` | **NEW seed** `skill-system-mcp-discovery-v1` (3436 chars, mismo patron byte-symmetric que Canvas Inmutable/Cronista); **fix** `holdedConfig` — anadir entry `holded_period_invoice_summary` al array inline (resuelve drift seed vs API) |
| `app/src/lib/services/catbot-prompt-assembler.ts` | **NEW function** `buildMcpDiscoverySection()` (mirror byte-symmetric buildCanvasInmutableSection); **push** al array sections con id `mcp_discovery_protocol` priority=1 |
| `.docflow-kb/resources/skills/skill-sy-protocolo-mcp-discovery.md` | **NEW** — auto-generado por kb-sync tras seed |
| `.docflow-kb/_index.json` + `_header.md` | Regenerados con 200 entries (antes 199) |
| `.planning/tech-debt-backlog.md` | Marcar **resuelto** el item "catalogo detallado de tools MCP invisible en system prompt" (v30.8 cierra v30.7 observacion); anadir **nuevo item** sobre seed-vs-API drift de connectors.config |

---

## Tips y lecciones aprendidas

### `list_connector_tools` es 100x mas barato que `get_kb_entry` para descubrir capacidades

En CHECK 2 v30.7 forzando `search_kb + get_kb_entry`, CatBot tardo 25s y recibio el body entero del resource (con historial de mejoras, frontmatter completo, rationale_notes, tags, audience, created_at, etc.). En CHECK 2 v30.8 con `list_connector_tools`, 11s y solo el array `{name, description}`. **Regla generalizable**: para consultas sobre estructura de datos (catalogos, schemas, contratos), tools single-purpose baratas superan a queries de KB generales. Si un pattern aparece con frecuencia, merece su propia tool en lugar de reusar `search_kb`/`get_kb_entry` generics.

### Seed canonical + PATCH API = drift silencioso

El patron `INSERT OR IGNORE + UPDATE canonical` es el default en DocFlow para sincronizar DB con codigo fuente. Perfecto para campos estaticos (name, description fijas). Peligroso para campos donde la API legitimamente actualiza valores (`config.tools[]`, `rationale_notes`, `is_active` manipulado por ops). v30.4 tuvo un problema similar con description truncada via API → buildBody no lo rendereaba → drift oculto hasta v30.4 P4 fix. v30.8 tuvo el mismo patron: PATCH API actualizaba pero el seed lo sobreescribia. Candidato arquitectonico v30.9: marcar campos como "hot" (la API gana) vs "canonical" (el seed gana), o mecanismo de merge selectivo.

### El patron R31 sigue escalando bien

Es el cuarto milestone consecutivo que aplica literal-injection de skill dedicada corta (v30.1 Auditor, v30.4 Cronista, v30.5 Canvas Inmutable, v30.8 MCP Discovery). Cada aplicacion anade ~3-5k chars al prompt fijo (total ~20k chars de protocolos inmutables ahora) pero genera ganancia comportamental medible. El limite practico esta en budget del prompt (`assembleWithBudget`) que gestiona las prioridades bien. Si aparece un 5to protocolo (ej: "Arquitecto de Agentes", tech-debt heredado v30.5) podemos mantener el patron sin complicar el assembler.

### Los pre-deploy checks del audit-skill-injection son basicos pero efectivos

`node scripts/audit-skill-injection.cjs --verify` detecta regresiones de lazy-load en 200ms. Si en v30.9 alguien anade un skill system con PARTE 0 embebida (anti-pattern v30.4 iter), el audit lo flaggea. Siempre correrlo antes de commit en milestones que tocan skills.

---

## Metricas de la sesion

- **Fases completadas:** 4/4
- **Ficheros modificados:** 3 (catbot-tools, db.ts, catbot-prompt-assembler)
- **Ficheros nuevos:** 0 codigo + 1 KB resource (auto-generado)
- **Tools nuevas:** 1 (`list_connector_tools`)
- **Skills sistema nuevas:** 1 (`Protocolo MCP Discovery`, 3436 chars)
- **Build verificado:** Si (2 ciclos necesarios por el descubrimiento del drift seed-vs-API)
- **Verificacion CatBot:** Si (2/2 CHECKs pasan sin pistas explicitas, Holded + LinkedIn)
- **Tech-debt cerrado:** 1 item (v30.7 "catalogo tools MCP invisible")
- **Tech-debt nuevo:** 1 item (seed-vs-API drift en connectors.config)
- **Skills en literal-injection ahora:** 5/7 (antes 4/7 — se cierra la brecha del canvas creation protocol)
- **Tiempo total sesion:** ~75 min (incluyendo el second rebuild tras hallazgo)
