# Sesion 36 — CatDev v30.5: Arquitectura de inyeccion de skills sistema + Canvas Rules Inmutables

**Fecha:** 2026-04-23
**Estado:** COMPLETADO

---

## Resumen

Quinto milestone bajo CatDev Protocol. Resuelve un bug arquitectonico silencioso descubierto al final de la sesion 35 del propio proyecto DocFlow: las 8 reglas inmutables de diseno de canvas anadidas al skill `Orquestador CatFlow` en v30.4 iteraciones 1 y 2 **nunca llegaban al LLM de CatBot** porque el prompt-assembler referenciaba ese skill en modo lazy-load ("cuando el usuario pida X, llama get_skill(...)") y el LLM ignoraba el trigger en las pruebas. Evidencia empirica de la sesion 35: 3 pruebas consecutivas del diseno de un canvas complejo, 0 llamadas a `get_skill("Orquestador CatFlow")` en las 3. Las variaciones entre planes venian del sampling del LLM, no de las reglas anadidas. v30.5 extrae las 8 reglas a una skill sistema dedicada corta (~4k chars), la inyecta **literal** en el system prompt via `buildCanvasInmutableSection()` (mirror byte-symmetric de `buildAuditorProtocolSection` y `buildCronistaProtocolSection`), generaliza la leccion a una regla critica del KB (R31 — convencion de literal-injection para skills sistema con reglas comportamentales) y anade un endpoint de diagnostico permanente (`GET /api/catbot/diagnostic/prompt-compose`) + script de auditoria para detectar regresiones futuras. Verificacion end-to-end con bateria de 3 queries multi-dominio (facturacion comparativa / leads B2B / PDF+RAG): pre-v30.5 checklist visible 0/3 y get_entity_history 0/3; post-v30.5 ambas metricas 3/3.

---

## Bloque 1 — Diagnostico del bug: lazy-load silencioso

### El fenomeno

En `catbot-prompt-assembler.ts` hay dos patrones de inyeccion de skills sistema:

**Patron literal (funciona):** una funcion dedicada lee el skill de DB y lo inyecta como seccion con prioridad explicita.

```typescript
function buildAuditorProtocolSection(): string {
  const instructions = getSystemSkillInstructions('Auditor de Runs');
  return `## Protocolo obligatorio: Auditor de Runs\n${instructions}`;
}
sections.push({ id: 'auditor_protocol', priority: 1, content: buildAuditorProtocolSection() });
```

**Patron lazy-load (falla):** el assembler solo mete una frase tipo *"llama a get_skill(name: 'X') cuando..."*. El LLM decide si cargarla.

```typescript
function buildSkillsProtocols(): string {
  return `## Skill de Orquestacion CatFlow (ACTIVA SIEMPRE)
Cuando el usuario pida X, PRIMERO ejecuta get_skill(name: "Orquestador CatFlow") [...]
OBLIGATORIO: Llama a get_skill ANTES de ejecutar cualquier canvas_* tool.`;
}
```

El trigger "ACTIVA SIEMPRE" y "OBLIGATORIO" del segundo patron se ignora consistentemente: el LLM decide que puede arquitecturar un canvas con `search_kb` + `list_cat_paws` + su conocimiento general, sin cargar la skill completa de 55k chars que le costaria un cache miss del prompt.

### Evidencia empirica (sesion 35)

- Skill Orquestador pre-v30.4: 47.014 chars. Con PARTE 0 v1: 52.273. Con PARTE 0 v2 + checklist reforzado: 55.926.
- 3 pruebas identicas de diseno de canvas en sesion 35 (pre, post-v1, post-v2):
  - Llamadas a `get_skill("Orquestador CatFlow")`: 0 / 0 / 0.
  - Llamadas forzadas con prompt explicito: 1, pero el endpoint de chat no itero a segunda pasada (output 288 tokens, reply vacio) — probablemente por saturacion con 60k chars de tool result.
- Conclusion: mis iteraciones v30.4 fueron codigo muerto. Las 8 reglas nunca entraron al prompt.

### Por que el lazy-load es racional para el LLM

Tres razones plausibles:
1. Cargar 60k chars de tool result en el siguiente turn rompe el flujo conversacional.
2. El modelo Gemini 2.5 Pro (gemini-main, Elite tier, reasoning=high) tiene conocimiento general suficiente para "arquitecturar un canvas" sin la skill.
3. El trigger es ambiguo — "cuando el usuario pida X" deja margen interpretativo; en la duda, el LLM procede sin cargar.

El fix correcto no es endurecer el trigger (ya esta en mayusculas y "OBLIGATORIO") sino cambiar el mecanismo de entrega: injection literal garantiza que el contenido esta siempre presente.

---

## Bloque 2 — Auditoria estructural del prompt-assembler

### Script de inspeccion

`scripts/audit-skill-injection.cjs` parsea `catbot-prompt-assembler.ts` con dos regex:

1. `getSystemSkillInstructions\(\s*['"]([^'"]+)['"]\s*\)` dentro de funciones `buildXSection` → identifica injections literal.
2. `get_skill\(name:\s*["']([^"']+)["']\)` en string literals → identifica menciones lazy-load.

Correlaciona con DB (`SELECT * FROM skills ORDER BY category, name`) usando matching fuzzy. El matching fuzzy fue necesario porque la DB tiene nombres largos (*"Orquestador CatFlow — Creacion Inteligente de Flujos"*) mientras el assembler usa formas cortas (*"Orquestador CatFlow"*). La primera version del script con match exacto dio un falso negativo critico: reportaba "✓ No hay lazy-load silencioso" cuando sabia que el Orquestador lo estaba.

### Clasificacion final

| Status | Count | Skills |
|--------|-------|--------|
| LITERAL (inyectado literal) | 4 | Auditor de Runs, Cronista CatDev, Operador de Modelos, Protocolo de creacion de CatPaw |
| LAZY-LOAD (silencioso) | 2 | Orquestador CatFlow (system, 55k), Arquitecto de Agentes (strategy, 4.5k) |
| NOT-REFERENCED | 40 | Skills no-sistema (se cargan por cat_paw_skills link, correcto) |

### Flag `--verify` para CI futuro

El script falla con `exit 1` si detecta skills `category='system'` en lazy-load. Candidato a pre-commit hook o GitHub Action.

**Archivo:** `scripts/audit-skill-injection.cjs`

---

## Bloque 3 — Seed Canvas Rules Inmutables y revert de pollution

### Nueva skill sistema dedicada

`skill-system-canvas-inmutable-v1` (4.011 chars, category=system, v1.0). Contenido denso: las 8 reglas R01-R08 con test de auto-verificacion, anti-patterns R03 concretos (lista explicita de nombres prohibidos: *"Calculador Estricto, Validador Matematico, Auditor Financiero, Analista Comparativo, Contador, Verificador Aritmetico"*), pattern correcto (storage/script calcula, agent narra), y un CHECKLIST de 8 items que CatBot debe pegar al final de su respuesta.

Ejemplos largos y detalle tecnico se referencian al skill Orquestador via `get_skill` cuando haga falta — pero las reglas de alto nivel estan siempre presentes.

Seed pattern byte-symmetric INSERT OR IGNORE + UPDATE canonical (mirror Phase 161-01 shortcut rows + skill Auditor de v30.1/v30.2): cold-start garantizado + deployments existentes convergen.

### Revert del Orquestador

Script `/tmp/revert-orquestador-parte0.cjs` via PATCH API quita el bloque anadido en v30.4 iteraciones 1 y 2. Skill de 55.926 → 47.014 chars (estado pre-v30.4 iter1 restaurado). El contenido que llevaba "reglas inmutables" era codigo muerto — no cumplia ninguna funcion porque nunca llegaba al LLM.

**Archivos:**
- `app/src/lib/db.ts` (bloque `{ CANVAS_INMUTABLE_ID... }` tras el bloque Cronista)
- Revert via PATCH sobre skill `31e3dbc4-f849-4ef5-91cd-adc2bfd2aa7c`

---

## Bloque 4 — Injection y rule critica R31

### `buildCanvasInmutableSection()`

Mirror byte-symmetric de `buildAuditorProtocolSection()` y `buildCronistaProtocolSection()`. Lee el skill via `getSystemSkillInstructions('Canvas Rules Inmutables')`, lo prefija con un header corto describiendo el proposito, y lo devuelve como string. Graceful si el skill row no existe: devuelve `''` y la section se pushea vacia sin afectar el prompt.

Push con `priority: 1, id: 'canvas_inmutable_protocol'` inmediatamente despues de `cronista_protocol` para agrupar las 3 skills comportamentales seguidas en el prompt ordenado por priority.

**Archivo:** `app/src/lib/services/catbot-prompt-assembler.ts`

### R31 — regla critica del KB

`.docflow-kb/rules/R31-skills-sistema-literal-injection.md` con tags `[critical, architecture, prompt, skills, system]`. Documenta la convencion:

> Cualquier skill `category='system'` cuyo contenido deba influir en todo mensaje futuro del LLM debe inyectarse literal via `buildXProtocolSection()` + `sections.push`. Lazy-load solo es aceptable para contenido on-demand (catalogos grandes, detalle tecnico que solo aplica en tarea concreta).

Incluye arbol de decision simple para futuras creaciones y referencia al script de auditoria.

**Archivo:** `.docflow-kb/rules/R31-skills-sistema-literal-injection.md`

---

## Bloque 5 — Instrumentacion permanente del prompt

### Refactor limpio del assembler

Extrajo la recoleccion de sections a una funcion exportada:

```typescript
export function collectSections(ctx: PromptContext): PromptSection[] {
  const sections: PromptSection[] = [];
  // ... toda la logica de pushes ...
  return sections;
}

export function build(ctx: PromptContext): string {
  return assembleWithBudget(collectSections(ctx), getBudget(ctx.catbotConfig.model));
}
```

`build()` queda como wrapper de una linea. El resto del codebase sigue usando `build()` sin cambios.

### Endpoint diagnostico

`GET /api/catbot/diagnostic/prompt-compose` devuelve `{ok, section_count, total_chars, estimated_tokens, sections: [{id, priority, char_count, content_preview}]}`. Mock ctx minimo (sin user profile ni sudo). Read-only, sin side effects.

Trap descubierto durante desarrollo: Next.js App Router trata los directorios con prefijo `_` como **private folders** y los excluye del routing. La primera version del endpoint vivia en `/api/catbot/_diagnostic/...` y devolvia 404 consistentemente. Movido a `diagnostic/` (sin underscore) y funciono al siguiente rebuild. Anadido a las "lecciones" de la sesion.

### Output actual del endpoint (post-v30.5)

- 26 secciones totales
- 46.681 chars / ~11.671 tokens (mock ctx)
- Priority=0: identity (3.299), tool_instructions (774), complexity_protocol (969)
- Priority=1: catpaw_protocol (1.467), modelos_protocol (3.258), auditor_protocol (5.824), cronista_protocol (4.645), **canvas_inmutable_protocol (4.359)**, reasoning_protocol, knowledge_protocol, intent_protocol, complex_task_protocol, skills_protocols, canvas_protocols, reporting_protocol, tool_use_first

La skill nueva (`canvas_inmutable_protocol`) esta presente con 4.359 chars — confirmacion estructural + medible de que el patron funciona.

**Archivos:**
- `app/src/app/api/catbot/diagnostic/prompt-compose/route.ts` (NUEVO)
- Refactor en `app/src/lib/services/catbot-prompt-assembler.ts`

---

## Bloque 6 — Bateria de verificacion multi-dominio

### 3 queries conceptualmente distintas

Para confirmar que las reglas generalizan mas alla del caso Holded/facturacion de la sesion 35:

1. **Q1** — Facturacion comparativa cuatrimestre (data processing + comparativa numerica).
2. **Q2** — Seguimiento automatico leads B2B via email + CRM (email automation + recency filtering).
3. **Q3** — Procesador masivo documentos PDF con indexacion RAG (file processing + deteccion de novedades).

Medimos 3 dimensiones por cada respuesta:
- CHECKLIST R01-R08 marcadores visibles.
- Anti-patterns R03 (nombres tipo "Calculador", "Validador Matematico", etc.).
- Promesa de `update_*_rationale` al completar.

### Resultados

| Query | CHECKLIST | Anti-patterns R03 | Rationale mention | get_entity_history |
|-------|-----------|-------------------|-------------------|---------------------|
| Q1 facturacion | 8/8 ✓ | ✗ "Analista Comparativo" | ✓ | ✓ 1x |
| Q2 leads B2B | 8/8 ✓ | ✓ 0 | ✓ | ✓ 2x |
| Q3 PDF+RAG | 8/8 ✓ | ✓ 0 | ✓ | ✓ 3x |

Comparativa con pre-v30.5: CHECKLIST 0/3 → 3/3. `get_entity_history` 0/3 → 3/3. Rationale mention 0/3 → 3/3. Anti-patterns R03 0/3 → 2/3.

La unica reincidencia (Q1 incluyo "Analista Comparativo" en el plan) es la query mas propensa al anti-pattern porque el dominio (comparativa numerica Q1 2025 vs Q1 2026) tira culturalmente hacia "un agent LLM que compare". Sin embargo en v30.4 Q1 proponia TRES agents de calculo ("Calculador Estricto" + "Validador Matematico" + "Analista Comparativo" con doble check aritmetico); en v30.5 solo "Analista Comparativo" aparece — una reduccion de 3 → 1. El patron arquitectonico se aplica mejor pero persiste una contaminacion cultural que solo un runtime validator eliminaria completamente.

### Dogfooding: rationale_notes

Tras completar la bateria, via `update_skill_rationale` se anaden 4 entries dogfooding (aplicando el protocolo Cronista al propio milestone):
- Canvas Rules Inmutables v1.0 — creacion.
- Orquestador CatFlow — revert PARTE 0 (codigo muerto eliminado).
- Auditor de Runs — confirmacion del patron literal-injection consolidado.
- Cronista CatDev — medicion efectiva: get_entity_history 0/3 → 3/3.

Los 4 tool calls retornaron `ok: true` — protocolo Cronista funcionando.

---

## Resumen de archivos modificados

| Archivo | Cambio |
|---------|--------|
| `app/src/lib/db.ts` | Seed `skill-system-canvas-inmutable-v1` (4011 chars, v1.0, pattern byte-symmetric INSERT OR IGNORE + UPDATE canonical tras bloque Cronista) |
| `app/src/lib/services/catbot-prompt-assembler.ts` | Nueva `buildCanvasInmutableSection()` + `sections.push({id: 'canvas_inmutable_protocol', priority: 1, ...})` tras Cronista. Refactor: `collectSections(ctx): PromptSection[]` exportada; `build(ctx)` queda como wrapper de 1 linea |
| `app/src/app/api/catbot/diagnostic/prompt-compose/route.ts` | **NUEVO** endpoint GET read-only que devuelve breakdown de secciones del prompt (id, priority, char_count, preview) para regresion y debugging |
| `scripts/audit-skill-injection.cjs` | **NUEVO** script de auditoria con matching fuzzy DB↔assembler + flag `--verify` (exit=1 si hay lazy-load silencioso de skills sistema) |
| `.docflow-kb/rules/R31-skills-sistema-literal-injection.md` | **NUEVO** rule critica (tag `critical`) documentando la convencion para futuros skills sistema |
| Skill Orquestador CatFlow (DB, id `31e3dbc4-...`) | Revert de PARTE 0 v1 y v2 via PATCH API (55926 → 47014 chars). Codigo muerto eliminado |
| `.catdev/spec.md` | spec v30.5 con 5/5 fases done + notas extensas de cada fase + bateria de verificacion + dogfooding |
| `.planning/Progress/progressSesion36.md` | **NUEVO** — este informe |

DB: 1 skill nueva (`skill-system-canvas-inmutable-v1`) + 4 entries nuevas en `rationale_notes` distribuidas en 4 skills (Canvas Inmutable creacion, Orquestador revert, Auditor consolidacion, Cronista medicion).

KB: 1 rule nueva critica (R31) + 1 skill resource nueva (sync automatico via Phase 153 hooks tras PATCH de la skill Orquestador).

**Ficheros TypeScript modificados: 3. Ficheros nuevos: 4 (1 endpoint, 1 script, 1 rule KB, 1 progressSesion).**

---

## Tips y lecciones aprendidas

### Next.js App Router excluye directorios con prefijo `_`
Un fichero en `app/api/catbot/_diagnostic/prompt-compose/route.ts` produce 404 consistentemente pese a que TypeScript compile OK. La convencion del framework es que directorios con underscore son "private folders". Renombrar a `diagnostic/` resuelve. Anti-pattern a evitar: usar `_` como prefijo para "rutas internas" — el framework lo interpreta como "no routing".

### Lazy-load silencioso es el bug mas dificil de detectar
El contenido del skill existe en DB, el skill esta referenciado en codigo, el prompt-assembler menciona "ACTIVA SIEMPRE" y "OBLIGATORIO". Pero el LLM, al decidir que tools llamar en el siguiente turn, considera que `get_skill` no es necesario. El bug no falla con error — simplemente ninguna regla del skill se aplica. La unica forma de detectar: medir empiricamente si `get_skill` aparece en los `tool_calls` de las respuestas. Por eso el script de auditoria + endpoint diagnostico son instrumentacion obligatoria.

### Patron byte-symmetric de seed es genuinamente reutilizable
A la fecha de este milestone, 5 skills sistema usan exactamente el mismo patron de seed: Auditor, Cronista, Operador de Modelos, Protocolo de creacion de CatPaw, Canvas Rules Inmutables. Cada uno cabe en un bloque `{ ... }` independiente con su constante de ID + INSTRUCTIONS + INSERT OR IGNORE + UPDATE canonical. Sin refactor por ahora (DRY prematuro), pero si aparece una sexta skill, considerar extraer `seedSystemSkill(id, name, description, tags, instructions)` como helper.

### Refactor quirurgico para habilitar diagnostico
El endpoint diagnostico requeria acceso a las sections antes del join. Opciones evaluadas: (a) duplicar la logica del build en el endpoint, (b) exportar un `buildWithDebug` separado, (c) exponer una module-level variable. La que se aplico (extraer `collectSections` + dejar `build` como wrapper de 1 linea) tiene menor footprint y cero duplicacion. Coste: cambiar 2 lineas del `build`. Ganancia: el endpoint (y cualquier test futuro) ve exactamente las mismas sections que el prompt real.

### Matching fuzzy DB vs assembler
Los nombres de skills en DB suelen ser mas descriptivos que los mencionados en codigo. Si un script de auditoria usa matching exacto, producira falsos negativos criticos. Regla: fuzzy matching con prefix/contains + floor de 10 chars para evitar matches espurios. El primer run del script audit-skill-injection dio "✓ No hay lazy-load" cuando sabiamos que el Orquestador lo estaba — senal inmediata de que el matching era demasiado estricto.

### R03 es la regla culturalmente mas dificil
Las reglas de arquitectura (R05 branches, R06 iterator 1-item) calaron en una sola iteracion del skill. Las reglas de proceso (R01 lectura, R07 rationale) calaron con literal-injection. La regla R03 (no calculos en LLM) persiste parcialmente incluso tras v30.5 literal-injection — el LLM redujo de 3 a 1 el numero de agents "de calculo" en el dominio mas propenso, pero no llega a 0. Es contraintuitivo para un modelo entrenado en patrones donde "agent con reasoning = respuesta de calidad". Considerar runtime validator o ejemplo canonico positivo en iteracion futura.

### Lazy-load NO es incorrecto — es aceptable para contenido on-demand
La regla R31 no prohibe lazy-load. Lo declara inadecuado cuando el contenido debe aplicarse SIEMPRE. Catalogos grandes (modelos disponibles), detalle de un connector especifico, referencia tecnica que solo aplica a una tarea: siguen siendo candidatos validos a lazy-load. La distincion es funcional, no estetica: si el contenido es comportamental/inmutable → literal; si es referencia/on-demand → lazy.

---

## Metricas de la sesion

- **Milestone cerrado:** 1 (v30.5 shipped 2026-04-23)
- **Fases ejecutadas:** 5/5 (AUDIT, INMUTABLES, INJECTION, INSTRUMENTACION, VERIFICACION) sin hotfixes
- **Ficheros TypeScript modificados:** 3 (db.ts, catbot-prompt-assembler.ts, + nuevo endpoint)
- **Ficheros nuevos:** 4 (endpoint route.ts, audit script, R31 rule KB, progressSesion36)
- **Skills sistema nuevas:** 1 (`skill-system-canvas-inmutable-v1`, v1.0, 4011 chars, category=system)
- **Skills sistema revertidas:** 1 (Orquestador CatFlow — PARTE 0 v2 eliminada)
- **Rules KB nuevas:** 1 (R31, tag critical)
- **Endpoints API nuevos:** 1 (`GET /api/catbot/diagnostic/prompt-compose`, read-only)
- **Scripts nuevos:** 1 (`scripts/audit-skill-injection.cjs` con flag `--verify` para CI)
- **Bugs corregidos:** 1 critico (lazy-load silencioso del Orquestador) + 1 trampa operativa (Next.js `_` private folders)
- **Entries de backfill/dogfooding:** 4 (rationale_notes en Canvas Inmutable + Orquestador + Auditor + Cronista)
- **Tech debt items capturados:** 1 nuevo (Arquitecto de Agentes tambien en lazy-load silencioso, category=strategy)
- **Tech debt items cerrados:** (ninguno directamente del backlog, pero la rule R31 documenta la prevencion del patron)
- **Build verificado:** Si (4 checks a lo largo de las fases, todos "Compiled successfully")
- **Docker rebuilds:** 2 (uno tras P2 seed Canvas Inmutable, otro tras P4 endpoint nuevo)
- **Verificacion empirica:** bateria de 3 queries multi-dominio con ganancias medibles: CHECKLIST 0/3 → 3/3, get_entity_history 0/3 → 3/3, rationale mention 0/3 → 3/3, anti-patterns R03 0/3 → 2/3
- **R26 respetado:** Si (canvas-executor sin tocar)
- **R29 aplicado:** Si (docker rebuild tras seed)
