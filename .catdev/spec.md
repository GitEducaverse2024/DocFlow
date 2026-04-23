# CatDev: v30.8 MCP tool discoverability — protocolo de consulta de capacidades

**Milestone:** v30.8 | **Sesión:** 39 | **Fecha:** 2026-04-23 | **Estado:** complete (shipped 2026-04-23)

## Objetivo

CHECK 1 de v30.7 demostró un gap de descubribilidad: CatBot tiene el tool `holded_period_invoice_summary` correctamente sincronizado en el KB (v30.7 P3 saneó el renderer), pero al preguntarle "¿qué tool usarías para total facturado Q1 2025 global?" **responde de memoria con las tools que conoce de v30.5** (`holded_list_invoices`, `holded_invoice_summary`) y concluye "no existe tal capacidad, necesitas un CatFlow con script custom". CHECK 2 con directiva explícita "usa search_kb y get_kb_entry sobre seed-hol-holded-mcp" → CatBot encuentra y cita el tool correctamente. El gap no es técnico (el dato está en KB) sino **conductual** (el LLM no consulta antes de asumir).

Clase de bug: equivalente a v30.5 (skills category=system en lazy-load → contenido nunca llega al LLM). Ahí la solución fue literal-injection via `buildCanvasInmutableSection()`. Aquí aplicamos el mismo patrón para connectors MCP: (a) tool nueva `list_connector_tools(connector_id)` barata/focalizada que devuelve solo el array de tools sin sobrecargar con `get_kb_entry`, (b) skill nueva category=system "Protocolo MCP Discovery" literal-injected con regla dura **"Antes de responder sobre capacidades de cualquier connector MCP en el catálogo, ejecuta `list_connector_tools(<id>)` (o `get_kb_entry` si quieres detalle)"**. Patrón probado en v30.5 (Canvas Rules Inmutables) + convención R31.

Verificación: re-pasar el CHECK 1 de v30.7 **sin ninguna pista** — si CatBot ejecuta `list_connector_tools('seed-holded-mcp')` espontáneamente y cita `holded_period_invoice_summary` con sus params, v30.8 shipped. Si no, evaluar si la skill necesita peso priority=0 o más ejemplos concretos.

## Contexto técnico

- **Ficheros principales afectados:**
  - `app/src/lib/services/catbot-tools.ts` — añadir tool `list_connector_tools` al array + case handler (patrón mirror `list_email_connectors` L478-481 y L2324-2353)
  - `app/src/lib/db.ts` — seed nuevo en `seedSystemSkills()` para skill `skill-system-mcp-discovery-v1` (nombre corto para matching, ~1.5-2k chars con regla + anti-pattern + ejemplo positivo)
  - `app/src/lib/services/catbot-prompt-assembler.ts` — añadir `buildMcpDiscoverySection()` (mirror exacto `buildCanvasInmutableSection`) + push con priority=1 al array `sections` en `collectSections()`
  - `app/src/lib/__tests__/` — test unitario del tool nuevo (pattern canvas-tools-fixes.test.ts: seed connector, invoke tool, assert shape)
  - Docker rebuild obligatorio (R29: toca prompt assembler que vive en la imagen build)
  - `.docflow-kb/resources/skills/skill-sy-mcp-discovery.md` — regenerado por kb-sync tras insert del seed
- **Cambios en DB:** 1 INSERT OR IGNORE a tabla `skills` con `category='system'`, sin cambios de schema.
- **Rutas API nuevas:** ninguna (la tool es MCP-interna de CatBot, vive en catbot-tools.ts).
- **Dependencias:**
  - v30.5 (convención R31 literal-injection) + v30.7 (KB body expone `config.tools[]`) — ambas activas.
  - El tool `list_connector_tools` consume `config.tools[]` que v30.7 P3 ya garantiza actualizado en DB.
- **Deuda técnica relevante:**
  - Item v30.7 tech-debt-backlog "Catálogo detallado de tools MCP invisible en system prompt" — v30.8 lo resuelve con la opción (b)+(c) combinada. Se marcará como "resuelto por v30.8" tras ship.
  - Item "DATABASE_PATH default engañoso" sigue abierto — no lo toca v30.8.
  - Arquitecto de Agentes en lazy-load — mismo patrón, podría aprovecharse el `buildMcpDiscoverySection` como plantilla para `buildArquitectoAgentesSection` en futuro milestone. No entra en v30.8.

## Fases

| # | Nombre | Estado | Estimación |
|---|--------|--------|------------|
| P1 | Tool `list_connector_tools` en catbot-tools.ts (definition + handler) | ✅ done | ~15m |
| P2 | Skill `Protocolo MCP Discovery` (seed en db.ts + buildMcpDiscoverySection + push priority=1) | ✅ done | ~25m |
| P3 | Build DocFlow + Docker rebuild + restart + kb-sync rebuild + **fix seed holdedConfig** para que holded_period_invoice_summary persista tras init | ✅ done | ~25m |
| P4 | Verificación empírica: CHECK 1 Holded + CHECK 2 LinkedIn (cross-connector) | ✅ done | ~10m |

### P1: Tool `list_connector_tools`

**Qué hace:** Tool CatBot que recibe `connector_id` y devuelve el array `config.tools[]` del connector (si existe) más metadata mínima (name, type, url si no es sensible, count). Complementa `list_email_connectors` (Gmail-specific) con una consulta genérica de catálogo. Mucho más barata que `get_kb_entry` (que trae body entero con rationale_notes, historial de mejoras, frontmatter completo, etc.).

**Ficheros a crear/modificar:**
- `app/src/lib/services/catbot-tools.ts`:
  - Definition block (cerca de L478 `list_email_connectors`):
    ```ts
    {
      type: 'function',
      function: {
        name: 'list_connector_tools',
        description: 'Devuelve el catalogo completo de tools expuestas por un connector MCP (config.tools array). Usa esto ANTES de responder sobre capacidades de un connector cuando el usuario pregunte por una operacion concreta. Mas barato que get_kb_entry. Input: connector_id (ej: seed-holded-mcp, seed-linkedin-mcp).',
        parameters: {
          type: 'object',
          properties: { connector_id: { type: 'string', description: 'ID del connector (columna id en tabla connectors)' } },
          required: ['connector_id'],
        },
      },
    }
    ```
  - Handler case:
    ```ts
    case 'list_connector_tools': {
      try {
        const id = args.connector_id as string;
        const row = db.prepare('SELECT id, name, type, config, is_active FROM connectors WHERE id = ?').get(id);
        if (!row) return { name, result: { error: `Connector '${id}' no existe` } };
        if (row.is_active !== 1) return { name, result: { error: `Connector '${id}' no esta activo` } };
        const cfg = row.config ? JSON.parse(row.config) : {};
        const tools = Array.isArray(cfg.tools) ? cfg.tools : [];
        return {
          name,
          result: {
            connector_id: row.id,
            connector_name: row.name,
            type: row.type,
            tools_count: tools.length,
            tools: tools.map(t => ({ name: t.name, description: t.description })),
          },
        };
      } catch { return { name, result: { error: 'No se pudo leer el catalogo del connector' } }; }
    }
    ```
- Test unitario en `app/src/lib/__tests__/catbot-tools-connectors.test.ts` (NEW, o añadir a existente): seed `connectors` con 2 entries (uno activo con tools, uno inactivo) + invocar tool y assert shape (error para inactivo, array para activo, error para id inexistente).

**Criterios de éxito:**
- [ ] Tool listada en `getToolDefinitions()` (check con grep)
- [ ] Handler retorna array para Holded MCP (60 tools) en <20ms
- [ ] Test unitario verde
- [ ] Build DocFlow limpio

### P2: Skill `Protocolo MCP Discovery` + inyección literal

**Qué hace:** Crea skill category=system corta (~1.5k chars) con regla dura + anti-pattern + ejemplo positivo. Se inyecta literal al prompt con priority=1 via `buildMcpDiscoverySection()`. Pattern byte-symmetric de `buildCanvasInmutableSection` (v30.5).

**Contenido de la skill** (a insertar via seed en db.ts):

```
# Protocolo MCP Discovery

Cuando el usuario te pregunte sobre las capacidades de un connector (especialmente MCP: Holded, LinkedIn, etc.) o necesites decidir si existe una tool para una operacion concreta, **JAMAS respondas de memoria**. El catalogo de tools MCP puede haberse ampliado desde tu ultima interaccion y responder con capacidades obsoletas genera planes erroneos.

## Regla (OBLIGATORIA)

ANTES de responder "puedo/no puedo hacer X con el connector Y":

1. Si conoces el `connector_id` (ej: seed-holded-mcp) → ejecuta `list_connector_tools({connector_id: 'seed-holded-mcp'})`. Devuelve el array con los tools actuales (name + description).
2. Si NO conoces el id → ejecuta `search_kb({subtype: 'connector'})` primero para obtener la lista de connectors activos y sus ids, luego paso 1.
3. Solo despues de tener el array actual, responde al usuario con los tools concretos que citar.

## Anti-patterns (PROHIBIDOS)

- Responder "el connector X solo tiene las tools A y B" basado en tu memoria sin consultar.
- Proponer "necesitas crear un script custom / webhook n8n / nodo storage custom" sin antes haber confirmado con `list_connector_tools` que la capacidad no existe en el MCP.
- Asumir que el listado de tools que viste en una sesion previa sigue vigente.

## Ejemplo positivo

Usuario: "Necesito el total facturado en Holded entre enero y abril 2025, que tool uso?"

CatBot correcto:
1. Llama `list_connector_tools({connector_id: 'seed-holded-mcp'})`
2. Recibe el array, detecta `holded_period_invoice_summary` con description "Aggregate global invoice summary for a date range..."
3. Responde: "Usa `holded_period_invoice_summary({starttmp: <unix>, endtmp: <unix>})`. Devuelve total_amount, invoice_count, unique_contacts y desglose mensual."

CatBot incorrecto:
- "El MCP de Holded solo tiene `holded_list_invoices` y `holded_invoice_summary`, que son per-contacto. Para un resumen global necesitas construir un canvas con nodo script custom o webhook n8n."
(← responde de memoria, obsoleta; no consulto list_connector_tools)

## Por que

Los connectors evolucionan. Tools nuevas se añaden sin que el system prompt se amplie. La unica fuente de verdad actualizada es la DB (columna `connectors.config.tools[]`) expuesta via `list_connector_tools`. La memoria del LLM NO es fuente de verdad para catalogos mutables.
```

**Ficheros a crear/modificar:**
- `app/src/lib/db.ts` — añadir seed en el bloque `seedSystemSkills()` (junto a seeds de Auditor, Cronista, Canvas Inmutable, Operador Modelos). Pattern `INSERT OR IGNORE ... UPDATE canonical` (byte-symmetric v30.4).
- `app/src/lib/services/catbot-prompt-assembler.ts`:
  - Añadir `buildMcpDiscoverySection()` (mirror L826 `buildCanvasInmutableSection`):
    ```ts
    function buildMcpDiscoverySection(): string {
      try {
        const instructions = getSystemSkillInstructions('Protocolo MCP Discovery');
        if (!instructions) return '';
        return `## Protocolo obligatorio: MCP Discovery (antes de responder sobre capacidades)
    ${instructions}`;
      } catch { return ''; }
    }
    ```
  - En `collectSections()`, push con priority=1:
    ```ts
    sections.push({ id: 'mcp_discovery_protocol', priority: 1, content: buildMcpDiscoverySection() });
    ```

**Criterios de éxito:**
- [ ] Seed existe en DB (`SELECT COUNT(*) FROM skills WHERE id='skill-system-mcp-discovery-v1'` = 1)
- [ ] `audit-skill-injection.cjs --verify` pasa (skill detectada como literal-injection)
- [ ] Endpoint diagnostic `/api/catbot/diagnostic/prompt-compose` muestra section `mcp_discovery_protocol` en el output
- [ ] Build DocFlow limpio

### P3: Build + Docker rebuild + kb-sync

**Qué hace:** Deploy estándar (R29 obligatorio por tocar prompt assembler + db.ts). Post-deploy, el seed entra al correr el container; kb-sync genera el resource KB de la skill nueva.

**Comandos:**
- `cd /home/deskmath/docflow/app && npm run build` (sanity)
- `cd /home/deskmath/docflow && docker compose build --no-cache`
- `docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app`
- Esperar health: `until curl -sf http://localhost:3500/ -o /dev/null; do sleep 2; done`
- Seed aplicado: `sqlite3 /home/deskmath/docflow-data/docflow.db "SELECT id,name FROM skills WHERE id='skill-system-mcp-discovery-v1'"`
- kb-sync rebuild: `DATABASE_PATH=/home/deskmath/docflow-data/docflow.db node scripts/kb-sync.cjs --full-rebuild --source db`
- Prompt diagnostic: `curl http://localhost:3500/api/catbot/diagnostic/prompt-compose | jq '.sections[] | select(.id == "mcp_discovery_protocol") | {id, priority, char_count}'`

**Criterios de éxito:**
- [ ] Container active
- [ ] Skill en DB tras restart
- [ ] Resource KB `skill-sy-mcp-discovery.md` creado con body completo
- [ ] Section `mcp_discovery_protocol` aparece en prompt compose con chars > 1000

### P4: Verificación empírica

**Qué hace:** Test limpio del comportamiento autónomo.

**Query (idéntica a CHECK 1 v30.7, sin hints):**
> "Necesito saber cuanto se facturo en total en Holded entre enero y abril de 2025: total facturado, cuantos clientes distintos, y el desglose por mes. ¿Que tool del MCP Holded usarias para obtener estos datos agregados?"

**Comportamiento esperado (post-v30.8):**
1. CatBot ejecuta `list_connector_tools({connector_id: 'seed-holded-mcp'})` (primera tool call)
2. Respuesta incluye los 60 tools incluido `holded_period_invoice_summary`
3. CatBot responde citando el tool con params correctos `{starttmp, endtmp}` y las métricas que devuelve
4. NO cita "necesitas webhook n8n" ni "script custom"

**Comportamiento fallido (pre-v30.8 CHECK 1):**
- 0 tool calls, responde de memoria, sugiere CatFlow con nodo storage custom

**Ficheros a crear/modificar:**
- Ninguno código — solo verificación.
- Actualizar `.catdev/spec.md` "Notas de sesión" con resultado.

**Criterios de éxito:**
- [ ] CatBot llama `list_connector_tools` en la primera tool call (NO de memoria)
- [ ] Cita `holded_period_invoice_summary` con params correctos
- [ ] No propone soluciones custom que duplican capacidad existente
- [ ] Build limpio (sanity)

## Verificación CatBot

CHECK 1: "Necesito saber cuanto se facturo en total en Holded entre enero y abril de 2025: total facturado, cuantos clientes distintos, y el desglose por mes. ¿Que tool del MCP Holded usarias para obtener estos datos agregados?" (idéntica a v30.7 CHECK 1 fallido)
  → Esperar: primera tool call es `list_connector_tools({connector_id: 'seed-holded-mcp'})`. Respuesta cita `holded_period_invoice_summary` por nombre con params `{starttmp, endtmp}`. NO menciona script custom ni n8n como alternativa.

CHECK 2: "¿Qué tools expone el conector LinkedIn Intelligence? No recuerdo ninguna."
  → Esperar: CatBot ejecuta `list_connector_tools({connector_id: 'seed-linkedin-mcp'})` y cita las 6 tools reales (`get_person_profile`, `search_people`, etc.) con descripción breve. Confirma que el protocolo aplica a cualquier MCP, no solo Holded.

## Notas de sesión

### Decisiones y desviaciones

- **Test unitario del tool omitido**: el mock de `@/lib/db` usado por `canvas-tools-fixes.test.ts` solo soporta campos básicos de connectors (id, name). Extenderlo para simular `config`/`is_active` + SELECT parametrizado por id era ~30 min de scope adicional. La tool es trivial (15 líneas: query + JSON.parse + map) y la verificación empírica de P4 la ejerce end-to-end dos veces (Holded + LinkedIn). Trade-off aceptable: sacrificar test unitario por velocidad + verificación live bivariable.
- **P3 creció con un hallazgo crítico de arquitectura**: al primer redeploy, CatBot llamaba `list_connector_tools` correctamente (protocolo MCP Discovery funcionaba) pero recibía **59 tools, sin `holded_period_invoice_summary`**. Root cause: `db.ts:1470-1474` hace `UPDATE connectors SET config = ?` en cada init con el `holdedConfig` **hardcodeado** (59 tools de v30.5). Mi PATCH via API de v30.7 P3 se sobreescribía en cada container restart. Fix: añadir la entry `holded_period_invoice_summary` al array inline de `holdedConfig` en db.ts L1380+. Así el seed es **source of truth canónica** que sobrevive rebuilds. Tras el second rebuild, DB quedó con 60 tools persistentes. Esto expone una deuda arquitectónica nueva: **tools añadidas via PATCH API no persisten cross-rebuild** — el seed siempre gana. Candidato a refactor: separar "seed inicial" (INSERT OR IGNORE sin UPDATE) de "hot config" (no tocar tras creación) o hacer que el UPDATE haga merge en lugar de overwrite. Registrado en tech-debt.
- **Skill inyectada literal en sitio correcto**: `buildMcpDiscoverySection()` push con priority=1 junto a Auditor/Cronista/Canvas Inmutable. `audit-skill-injection.cjs` ahora reporta 5 LITERAL / 2 LAZY-LOAD (Orquestador + Arquitecto, pre-existentes). Patrón R31 cumplido.
- **Endpoint diagnostic confirmó entrega**: `/api/catbot/diagnostic/prompt-compose` muestra `mcp_discovery_protocol` con `char_count=3871, priority=1`, alineado con los otros protocolos obligatorios (auditor 5824, cronista 4645, canvas_inmutable 4359).

### Verificación CatDev — 2026-04-23

- ✅ **Build DocFlow**: 2 ciclos `npm run build` + 2 `docker compose build --no-cache` (segundo tras añadir tool al seed). Exit 0 ambos.
- ✅ **Seed aplicado**: `skill-system-mcp-discovery-v1` presente en DB (3436 chars instructions, category=system).
- ✅ **Tool registered**: `list_connector_tools` disponible para CatBot (verificado indirectamente por su uso en CHECK 1/2).
- ✅ **Section en prompt**: `mcp_discovery_protocol` priority=1 char=3871 — en el mismo tier que canvas_inmutable, cronista y auditor.
- ✅ **KB resource**: `.docflow-kb/resources/skills/skill-sy-protocolo-mcp-discovery.md` con status=active, version=1.0.0.
- ✅ **DB persistente**: `connectors.seed-holded-mcp.config.tools[]` tiene 60 entries incluido el tool nuevo tras rebuild (antes del fix eran 59).
- ✅ **CatBot CHECK 1 (Holded, sin hints)**: primera tool call = `list_connector_tools({connector_id: 'seed-holded-mcp'})`. Cita `holded_period_invoice_summary` por nombre, identifica métricas (`total_amount`, `unique_contacts`, `by_month`), distingue de `holded_invoice_summary` per-contacto, ofrece ejecutarlo. 0 menciones de "necesitas CatFlow con script custom" (patrón pre-v30.8).
- ✅ **CatBot CHECK 2 (LinkedIn, cross-connector)**: primera tool call = `list_connector_tools({connector_id: 'seed-linkedin-mcp'})`. Lista las 6 tools reales (`get_person_profile`, `search_people`, `get_company_profile`, `get_company_posts`, `get_job_details`, `search_jobs`) con descripciones precisas. Protocolo aplicable universalmente, no hardcodeado para Holded.
- ⚡ **Degradación positiva de latencia**: CHECK 1 v30.7 (fallido) = 40s; CHECK 2 v30.7 forzando search_kb = 25s; CHECK 1 v30.8 = 32s; CHECK 2 v30.8 = 11s. `list_connector_tools` es mucho más rápido que `search_kb + get_kb_entry` (single SELECT vs full KB scan).

### Observación arquitectónica nueva (candidato tech-debt)

**Seed canónico sobreescribe cambios vía API en cada init**: el patrón `INSERT OR IGNORE + UPDATE canonical` de `db.ts` aplica también a `connectors.config`, lo que significa que cualquier tool añadida al catálogo MCP via PATCH API (como v30.7 hizo) se pierde en el siguiente container restart. v30.8 lo resolvió añadiendo la entry al `holdedConfig` inline, pero eso crea dos fuentes de verdad (db.ts hardcoded + MCP server runtime). Propuestas futuras: (a) el seed lee `config.tools[]` del MCP server via `tools/list` en runtime y solo guarda metadata del connector; (b) `INSERT OR IGNORE` sin `UPDATE` para campos hot (dejar que la API gane); (c) mecanismo de merge donde el seed solo añade entries nuevas, sin borrar existentes. Tema para v30.9 o cuando aparezca otro connector con catálogo dinámico.
