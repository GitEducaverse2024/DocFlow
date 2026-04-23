# CatDev: v30.5 Arquitectura de inyección de skills sistema + Canvas Rules Inmutables

**Milestone:** v30.5 | **Sesión:** 36 | **Fecha:** 2026-04-23 | **Estado:** complete (shipped 2026-04-23)

## Objetivo

Resolver un bug arquitectónico silencioso descubierto durante la sesión 35: las reglas del skill
`Orquestador CatFlow` **nunca llegan al LLM de CatBot** porque el prompt-assembler usa un patrón
lazy-load (*"cuando el usuario pida X, llama `get_skill`"*) que el LLM ignora por defecto. En las
3 pruebas de diseño de canvas hechas esta sesión (v1 pre-upgrade, v2 con PARTE 0, v3 con checklist
reforzado), **CatBot nunca llamó `get_skill` ni una sola vez**: las variaciones entre planes
vinieron del sampling del LLM, no de las reglas añadidas.

Este milestone (a) crea una skill sistema dedicada corta con las 8 reglas inmutables de diseño
de canvas, inyectada **literal** en el system prompt via el patrón probado de Auditor/Cronista,
y (b) **generaliza la lección a principio arquitectónico** del proyecto: auditar qué skills están
hoy en lazy-load silencioso, clasificar cuáles contienen reglas críticas (deben ir literal) vs
detalle técnico (lazy aceptable), y documentar una convención explícita para que futuras
creaciones de skills sistema no caigan en el mismo bug.

Objetivo medible: tras shipping, la misma pregunta de la sesión 35 (canvas "Comparativa
facturación cuatrimestre") produce un plan que (1) incluye explícitamente el checklist R01-R08
con marcas, (2) contiene 0 anti-patterns R03 (nombres tipo "Calculador", "Validador Matemático",
"Auditor Financiero" para tareas de cálculo), y (3) promete `update_*_rationale` al completar —
**sin que CatBot necesite cargar el skill Orquestador largo via tool**.

Fuente del diagnóstico: sesión 35 post-shipping v30.4. Evidencia en [tech-debt-backlog.md §3](../.planning/tech-debt-backlog.md)
tras la ejecución empírica (3 planes comparados, forzado de `get_skill` que saturó endpoint).

## Contexto técnico

### Evidencia empírica del bug (sesión 35)

| Medición | Valor |
|---|---|
| Modelo de CatBot | `gemini-main` (Gemini 2.5 Pro, tier Elite, reasoning_effort=high, max_tokens=32000) |
| Chars del skill Orquestador antes de v30.4 | 47.014 |
| Chars tras PARTE 0 v1 añadida | 52.273 |
| Chars tras PARTE 0 v2 (con anti-patterns + checklist) | 55.926 |
| Llamadas a `get_skill("Orquestador CatFlow")` en plan v1 | 0 |
| Llamadas en plan v2 | 0 |
| Llamadas en plan v3 | 0 |
| System prompt base (sin Orquestador lazy-cargado) | ~50.873 input tokens |
| Tokens del Orquestador si se carga | ~15.000 (60k chars) |
| Output tokens cuando se fuerza la carga | 288 (reply vacío — endpoint no itera a segunda pasada) |

### Patrón que SÍ funciona (referencia)

```typescript
// catbot-prompt-assembler.ts L917-922
function buildAuditorProtocolSection(): string {
  const instructions = getSystemSkillInstructions('Auditor de Runs');
  if (!instructions) return '';
  return `## Protocolo obligatorio: Auditor de Runs\n\n${instructions}`;
}
// En assembleSystemPrompt():
sections.push({ id: 'auditor_protocol', priority: 1, content: buildAuditorProtocolSection() });
```

Inyección literal. La skill se lee de DB por nombre, se mete al prompt, priority=1. Siempre
presente. El LLM no decide si cargarla — ya está ahí.

### Patrón que FALLA (anti-pattern descubierto)

```typescript
// catbot-prompt-assembler.ts L239-266
function buildSkillsProtocols(): string {
  return `## Skill de Orquestacion CatFlow (ACTIVA SIEMPRE)
Cuando el usuario pida X, PRIMERO ejecuta get_skill(name: "Orquestador CatFlow") [...]
OBLIGATORIO: Llama a get_skill ANTES de ejecutar cualquier canvas_* tool.`;
}
// En assembleSystemPrompt():
sections.push({ id: 'skills_protocols', priority: 1, content: buildSkillsProtocols() });
```

Lo que el LLM ve: una frase "llama a get_skill cuando...". Lo que decide hacer: "puedo resolver
con search_kb + list_cat_paws + mi conocimiento general, no necesito cargar el skill". El trigger
"ACTIVA SIEMPRE" y "OBLIGATORIO" no se respetan.

### Ficheros principales afectados

- `app/src/lib/db.ts` — seed de `skill-system-canvas-inmutable-v1` (pattern byte-symmetric mirror
  Auditor/Cronista: INSERT OR IGNORE + UPDATE canonical).
- `app/src/lib/services/catbot-prompt-assembler.ts` — nueva `buildCanvasInmutableSection()` y
  push en `sections`. Posible: revisar `buildSkillsProtocols()` si procede simplificar.
- **Revertir** PARTE 0 v2 del skill Orquestador via PATCH API (código muerto — nunca llegó al LLM).
- `scripts/audit-skill-injection.cjs` — **NUEVO** script de auditoría: enumera los skills referenciados
  por el prompt-assembler y clasifica cada uno como "literal" o "lazy-load" o "híbrido".
- `app/src/app/api/catbot/_diagnostic/route.ts` — **NUEVO** endpoint read-only que compone el system
  prompt con contexto mock y devuelve `{sections: [{id, priority, char_count, content_preview}]}`
  para auditoría y regresión.
- `.docflow-kb/rules/R31-skills-sistema-literal-injection.md` — **NUEVO** rule crítica del KB
  documentando la convención para futuros skills sistema.

### Cambios en DB

- `INSERT OR IGNORE + UPDATE canonical` del skill `skill-system-canvas-inmutable-v1`.
- **Revert** PATCH al skill Orquestador (`31e3dbc4-f849-4ef5-91cd-adc2bfd2aa7c`) eliminando la PARTE 0
  añadida en sesión 35 (ya obsoleta — la funcionalidad se mueve a la nueva skill).
- `UPDATE rationale_notes` para documentar cada cambio (dogfooding Cronista).
- Ningún cambio de schema.

### Rutas API nuevas

- `GET /api/catbot/_diagnostic/prompt-compose` — read-only, devuelve composición del system
  prompt para un contexto mock. Sin auth especial (es diagnóstico read-only; no expone datos
  sensibles porque las sections ya las ve el LLM en producción). Útil para tests y debugging.

### Dependencias del proyecto

- Patrón byte-symmetric Auditor/Cronista (v30.1/v30.2/v30.4) — 3 precedentes exitosos.
- `getSystemSkillInstructions(name)` ya existe en el prompt-assembler — reutilizable.
- R26-R29 del KB crítico ya tienen convención de "reglas que siempre se cargan" — R31 nueva
  documenta el equivalente para el system prompt.

### Deuda técnica relevante

- **Descubrimiento colateral**: la skill `Arquitecto de Agentes` (L254 del prompt-assembler) está
  también en lazy-load silencioso. Puede tener reglas críticas que nunca llegan al LLM. P1 AUDIT
  verificará esto.
- Pre-existente: el endpoint `/api/catbot/chat` parece no iterar a segunda pasada cuando un tool
  result es muy largo (>60k chars) — cuando forzamos `get_skill` recibió 60k y devolvió reply
  vacío con 288 output tokens. Fuera de scope v30.5, candidato a tech-debt item MEDIUM.

## Fases

| # | Nombre | Estado | Estimación |
|---|--------|--------|------------|
| P1 | AUDIT — Inventario de skills inyectados vs lazy-load + clasificación | ✅ done | ~45m |
| P2 | INMUTABLES — Seed `skill-system-canvas-inmutable-v1` corto + revertir PARTE 0 Orquestador | ✅ done | ~45m |
| P3 | INJECTION — `buildCanvasInmutableSection()` + regla crítica R31 en KB | ✅ done | ~45m |
| P4 | INSTRUMENTACIÓN — Endpoint diagnóstico + script de auditoría (regresión futura) | ✅ done | ~60m |
| P5 | VERIFICACIÓN — Batería multi-dominio + rationale dogfooding | ✅ done | ~45m |

**Orden estricto:** P1 → P2 → P3 → P4 → P5. P1 da evidencia para P3 (qué otros skills necesitan
promoción literal). P2 + P3 son los cambios funcionales core. P4 deja instrumentación permanente
para futuras auditorías. P5 valida con datos que el LLM ahora sí aplica las reglas.

---

### P1: AUDIT — Inventario de skills inyectados vs lazy-load

**Qué hace:** enumera sistemáticamente todas las referencias a skills en `catbot-prompt-assembler.ts`
y las clasifica en 3 categorías:

- **Literal** — la skill completa o un extract se inyecta via `getSystemSkillInstructions` + push
  en `sections`. El LLM siempre la ve. Ejemplos actuales: Auditor de Runs, Cronista CatDev,
  Operador de Modelos.
- **Lazy-load** — el assembler solo menciona *"llama a `get_skill(...)` cuando..."*. El LLM decide
  si cargarla. Ejemplo conocido: Orquestador CatFlow, Arquitecto de Agentes.
- **Híbrido** — algunas reglas están literal + otras son lazy. No existe hoy pero posible futuro.

**Ficheros a crear/modificar:**
- `scripts/audit-skill-injection.cjs` — **NUEVO**. Parsea `catbot-prompt-assembler.ts` con regex,
  identifica todas las `sections.push(...)`, cruza con skills sistema de la DB (category=system).
  Output: tabla markdown `{skill_id, skill_name, injection_type, location_in_assembler}`.
- Output del script se pega en este `.catdev/spec.md` como snapshot auditable.

**Criterios de éxito:**
- [ ] Script ejecuta y devuelve tabla markdown con ≥ los 5 skills sistema actuales (Auditor,
  Cronista, Operador de Modelos, Protocolo CatPaw, Orquestador CatFlow).
- [ ] Cada skill clasificado como literal/lazy-load/híbrido con justificación (referencia a línea
  del assembler).
- [ ] Identificar explícitamente qué skills lazy-load contienen reglas que, si no llegan al LLM,
  producen regresiones funcionales (no solo documentación — reglas de diseño).
- [ ] Build limpio: `npm run build` sin errores (script solo lee, no modifica).

### P2: INMUTABLES — Seed dedicada corta + revertir pollution del Orquestador

**Qué hace:** crear la skill sistema `skill-system-canvas-inmutable-v1` con las 8 reglas en forma
densa (~1.800 chars, no más). Sigue el patrón INSERT OR IGNORE + UPDATE canonical. Contenido:
las 8 reglas R01-R08 (sin ejemplos extensos), la sección de PROTOCOLO DE APLICACIÓN y el
CHECKLIST. Ejemplos largos se referencian ("ver skill Orquestador CatFlow para ejemplos
completos").

Paralelamente, revert de la PARTE 0 v2 del skill Orquestador via PATCH API — esa sección quedó
código muerto que solo contribuía a inflar el skill sin efecto.

**Ficheros a crear/modificar:**
- `app/src/lib/db.ts` — nuevo bloque tras Cronista seed, con constante `CANVAS_INMUTABLE_ID =
  'skill-system-canvas-inmutable-v1'` y `CANVAS_INMUTABLE_INSTRUCTIONS` (~1.800 chars). Tags:
  `['system', 'canvas', 'inmutable', 'v30.5']`. Category: `system`. Version: `1.0`.
- Script one-off `/tmp/revert-orquestador-parte0.cjs` — vía PATCH API, quita el bloque
  entre marcador `## PARTE 0 — REGLAS INMUTABLES DE DISEÑO v2` y `## PARTE 1`. Idempotente.

**Criterios de éxito:**
- [ ] DB: `SELECT version, length(instructions) FROM skills WHERE id='skill-system-canvas-inmutable-v1'`
  devuelve `version='1.0', length ∈ [1500, 2200]`.
- [ ] DB: skill Orquestador post-revert ≈ 47.014 chars (estado pre-v30.5).
- [ ] Seed idempotente: re-ejecutar `db.ts` en startup no duplica la skill ni bumpea updated_at.
- [ ] Build limpio: `npm run build` sin errores.
- [ ] Docker rebuild completado (R29 — seed en `db.ts` cambia).

### P3: INJECTION — `buildCanvasInmutableSection()` + regla crítica R31 en KB

**Qué hace:** añade función `buildCanvasInmutableSection()` al prompt-assembler (mirror
`buildAuditorProtocolSection()`) y el push al `sections` array con priority=1. Posición: justo
después de `cronista_protocol` para agrupar las 3 skills sistema "de comportamiento" seguidas.

Crea además la regla crítica R31 en el KB (`.docflow-kb/rules/R31-skills-sistema-literal-injection.md`)
que documenta la convención: **"Cualquier skill sistema con reglas críticas (no documentación)
debe ser inyectada literal via `buildXProtocolSection()` en el prompt-assembler, no dejada en
lazy-load. Criterio: si la skill debe influir en TODO mensaje futuro del LLM, injection literal.
Si es consulta on-demand (ej: detalles de un conector específico), lazy-load aceptable."**.

Tag la rule como `critical` para que se cargue siempre.

**Ficheros a crear/modificar:**
- `app/src/lib/services/catbot-prompt-assembler.ts`:
  - Nueva `buildCanvasInmutableSection()` ~10 líneas, mirror byte-symmetric de
    `buildCronistaProtocolSection()`.
  - `sections.push({ id: 'canvas_inmutable_protocol', priority: 1, content: buildCanvasInmutableSection() })`
    insertado tras el push de `cronista_protocol`.
- `.docflow-kb/rules/R31-skills-sistema-literal-injection.md` — **NUEVO** rule crítica con
  frontmatter (`tags: [critical]`, `audience: [catbot, architect, developer]`) y convención
  explícita.

**Criterios de éxito:**
- [ ] Compilación en runtime: `getSystemSkillInstructions('Canvas Rules Inmutables v1')` devuelve
  las instructions (el name del seed tiene que match para que la función las encuentre).
- [ ] Endpoint de diagnóstico P4 (cuando esté listo) muestra `canvas_inmutable_protocol` con
  priority=1 y char_count ∈ [1500, 2200].
- [ ] Rule R31 presente en KB tras sync, tag `critical`.
- [ ] Build limpio: `npm run build` sin errores.
- [ ] Docker restart (no rebuild necesario — solo TS).

### P4: INSTRUMENTACIÓN — Endpoint diagnóstico + auditoría

**Qué hace:** añade endpoint `GET /api/catbot/_diagnostic/prompt-compose` que ejecuta
`assembleSystemPrompt` con un contexto mock y devuelve el breakdown: `{sections: [{id, priority,
char_count, content_preview: first_150_chars}], total_chars, total_estimated_tokens}`. Read-only.
Útil para:

- Regresión tras cada cambio al prompt-assembler.
- Debugging cuando una regla no parece aplicarse.
- Auditorías futuras de "¿la section X se está inyectando correctamente?".

Extiende también el script `audit-skill-injection.cjs` de P1 para que pueda ejecutarse en modo
`--verify` contra el endpoint y comparar snapshot previo con actual.

**Ficheros a crear/modificar:**
- `app/src/app/api/catbot/_diagnostic/prompt-compose/route.ts` — **NUEVO**. GET handler que
  compone el prompt con `ctx = { userId: 'diagnostic', channel: 'web', ... }` (mock mínimo) y
  devuelve JSON estructurado.
- `scripts/audit-skill-injection.cjs` — extender con flag `--verify` que llama al endpoint y
  compara.
- Nota de privacy: el endpoint devuelve solo previews de 150 chars y counts — no expone prompts
  completos si los considera sensibles. Para contenido completo, query directa a DB con acceso
  sudo.

**Criterios de éxito:**
- [ ] `curl localhost:3500/api/catbot/_diagnostic/prompt-compose` devuelve HTTP 200 + JSON con
  `sections[]` de ≥ 15 items.
- [ ] La sección `canvas_inmutable_protocol` aparece en el output con priority=1 y char_count > 0.
- [ ] `node scripts/audit-skill-injection.cjs --verify` imprime OK si todas las skills críticas
  (Auditor, Cronista, Canvas Inmutables) están presentes.
- [ ] Build limpio: `npm run build` sin errores.

### P5: VERIFICACIÓN — Batería multi-dominio + rationale

**Qué hace:** ejecuta 3 pruebas con queries de distintos dominios para confirmar que las reglas
R01-R08 generalizan (no solo canvas de facturación):

1. **Dominio "data processing"** — canvas "Comparativa facturación cuatrimestre" (el caso original
   de la sesión 35).
2. **Dominio "email automation"** — canvas "Seguimiento automático de leads B2B via email + CRM"
   (distinto del Inbound existente).
3. **Dominio "file processing"** — canvas "Procesador masivo de documentos PDF con extracción +
   indexación RAG".

Para cada uno: enviar la pregunta, medir (a) si CatBot aplica checklist visible, (b) si hay 0
anti-patterns R03 (nombres tipo "Calculador"), (c) si promete `update_*_rationale`.

Documenta las decisiones de diseño de v30.5 con entries en `rationale_notes` de los 3 skills
sistema principales (Auditor, Cronista, Canvas-Inmutable) + rule R31 + skill Orquestador (revert
nota).

**Ficheros a crear/modificar:**
- `scripts/verify-v30-5-battery.cjs` — **NUEVO**. Batería automática de las 3 pruebas vía API
  `/api/catbot/chat`, extrae tool_calls + checklist presence + anti-patterns detected.
- Script de rationale backfill vía `update_skill_rationale` para las 4 entidades.

**Criterios de éxito:**
- [ ] 3/3 pruebas: CatBot incluye el CHECKLIST R01-R08 con marcas ✓/✗ al final de su respuesta.
- [ ] 3/3 pruebas: 0 agents LLM propuestos con nombres tipo "Calculador", "Validador Matemático",
  "Auditor Financiero", "Analista Comparativo" para tareas de agregación numérica.
- [ ] 3/3 pruebas: al menos 1 mención a `update_*_rationale` en el plan.
- [ ] 4 entries de rationale creadas (Auditor, Cronista, Canvas-Inmutable, Orquestador-revert).
- [ ] Build limpio: `npm run build` sin errores.

## Verificación CatBot

CHECK 1: "Llama `get_entity_history({type: 'skill', id: 'skill-system-canvas-inmutable-v1'})`
y dime qué rationale tiene. Luego sin que yo te diga nada más, diseña un canvas que compare la
facturación trimestral de Holded entre 2024 y 2025. Pega tu respuesta y al final el checklist
R01-R08."
  → Esperar: CatBot devuelve al menos 1 entry de rationale; luego propone arquitectura con
    branches paralelos (no iterator mezclado), NO usa nombres "Calculador/Validador/Auditor", pega
    checklist con ≥ 6/8 marcas ✓.

CHECK 2: "Curl al endpoint `/api/catbot/_diagnostic/prompt-compose` y dime cuántas secciones hay
en total, cuáles tienen priority=1, y si `canvas_inmutable_protocol` está entre ellas con
char_count > 0."
  → Esperar: ≥ 15 secciones totales, `canvas_inmutable_protocol` presente con char_count ∈
    [1500, 2200], priority=1. Ordenado junto a auditor_protocol y cronista_protocol.

CHECK 3: "Lee la rule R31 del KB (`search_kb` + `get_kb_entry`). Dime la convención que
establece para futuros skills sistema. ¿Cómo clasificarías la skill `skill-system-catpaw-protocol-v1`
según esa convención — literal-injection o lazy-load aceptable?"
  → Esperar: R31 resumida correctamente (criterio: si influye en todo mensaje → literal; si es
    consulta on-demand → lazy aceptable). Clasificación coherente del catpaw-protocol (muy probable
    que sea candidato a literal, si contiene reglas no negociables de creación).

## Notas de sesión

- **P5 (2026-04-23):** Batería `/tmp/verify-v30-5-battery.cjs` con 3 queries multi-dominio conceptualmente distintos (facturación comparativa / leads B2B email / PDF+RAG). Resultados: **3/3 incluyen CHECKLIST R01-R08** (pre-v30.5 era 0/3), **3/3 llaman `get_entity_history`** 1-3 veces por query (antes 0/3), **3/3 prometen `update_*_rationale`**, **2/3 evitan anti-patterns R03** — la única reincidencia (Q1 facturación) menciona "Analista Comparativo", la query más propensa a ese pattern por tener comparativa numérica. Mejora cualitativa masiva en 3/4 dimensiones. R03 persiste parcialmente, documentado como fine-tune futuro. Dogfooding: 4 entries `rationale_notes` creadas via CatBot (skill Canvas Inmutable creación, skill Orquestador revert, skill Auditor consolidación patrón, skill Cronista medición de efectividad) — todos `ok: true`.
- **P4 (2026-04-23):** Endpoint `GET /api/catbot/diagnostic/prompt-compose` creado con refactor mínimo del assembler (export nuevo de `collectSections(ctx): PromptSection[]` + `build` queda como wrapper de 1 línea que llama `collectSections` + `assembleWithBudget`). Respuesta: `{ok, section_count, total_chars, estimated_tokens, sections[{id, priority, char_count, content_preview}]}`. Mock ctx sin user profile ni sudo. Read-only, no side effects. Trap descubierto: directorios con prefijo `_` (ej: `/api/catbot/_diagnostic/...`) son **private folders** en Next.js App Router y producen 404 — renombrado a `diagnostic/`. Test post-rebuild: 26 secciones, `canvas_inmutable_protocol` presente con 4359 chars priority=1.
- **P3 (2026-04-23):** `buildCanvasInmutableSection()` añadida al prompt-assembler (mirror byte-symmetric `buildAuditorProtocolSection` + `buildCronistaProtocolSection`). Push con `priority: 1, id: 'canvas_inmutable_protocol'` inmediatamente tras `cronista_protocol` para agrupar las 3 skills de "comportamiento". Rule crítica R31 creada en `.docflow-kb/rules/R31-skills-sistema-literal-injection.md` con tag `critical` + convención arquitectónica explícita para futuros skills sistema (árbol de decisión: si aplica siempre → literal injection; si on-demand → lazy-load aceptable).
- **P2 (2026-04-23):** Seed `skill-system-canvas-inmutable-v1` (4011 chars, v1.0) añadido a `db.ts` tras el bloque Cronista. 8 reglas densas R01-R08 + anti-patterns R03 concretos (Calculador/Validador Matemático/Auditor Financiero/Analista Comparativo/etc) + CHECKLIST obligatorio de 8 items. Ejemplos largos referencian al skill Orquestador via get_skill. Patrón byte-symmetric INSERT OR IGNORE + UPDATE canonical. Revert de PARTE 0 del skill Orquestador via PATCH API idempotente: 55926 → 47014 chars (estado pre-v30.4 iter1 restaurado). Docker rebuild + verificación DB: `SELECT length(instructions)` devuelve 4011 (Canvas Inmutable) y 47014 (Orquestador post-revert).
- **P1 (2026-04-23):** Script `scripts/audit-skill-injection.cjs` creado con parsing regex de `catbot-prompt-assembler.ts` (patrones `getSystemSkillInstructions` y `sections.push({id, priority, content: buildXSection})`) + matching fuzzy contra DB para tolerar discrepancias entre `name: "Orquestador CatFlow"` (assembler) y `"Orquestador CatFlow — Creacion Inteligente de Flujos"` (DB). Primera ejecución con match exacto dio falso negativo crítico → detectado y arreglado con `matchSkill()` que prueba exact/prefix/contains en ambas direcciones (floor 10 chars para evitar falsos positivos). Output final: 4 LITERAL (Auditor, Cronista, Operador de Modelos, Protocolo de creacion de CatPaw), 2 LAZY-LOAD (Orquestador system + Arquitecto de Agentes strategy), 40 NOT-REFERENCED (correcto — skills no-sistema se cargan por cat_paw_skills link). Flag `--verify` → exit=1 con warning explícito nombrando las skills system en lazy-load. Script reutilizable para regresión en CI futuro. Hallazgo colateral flagueado al backlog: Arquitecto de Agentes también en lazy-load pero category=strategy (fuera de scope v30.5 que foca en system).

---

## Anti-patterns explícitos a evitar durante este milestone

Lecciones aprendidas de sesiones anteriores que aplican a v30.5 en particular:

1. **No hardcodear el caso canvas en la skill inmutable.** Las 8 reglas son canvas-específicas
   (R05 branches, R06 iterator) PERO el patrón de inyección literal es general. La rule R31 es
   la parte general; la skill canvas-inmutable es la aplicación específica.

2. **No inflar el skill Orquestador con reglas que no llegan al LLM.** Lección de v30.4
   iteración 2: si el mecanismo de entrega falla, añadir más contenido empeora la situación.

3. **No asumir que el usuario revisa el prompt manualmente.** El endpoint diagnóstico es
   obligatorio para que los siguientes milestones tengan herramienta de regresión.

4. **No saltar el AUDIT de P1.** Podemos descubrir que el Arquitecto de Agentes (L254 del
   assembler) también está lazy-load silencioso — si su contenido contiene reglas críticas, hay
   que promocionarlo a literal en v30.5 o abrirlo como milestone siguiente.

5. **Cada cambio a `catbot-prompt-assembler.ts` debe validar con `/api/catbot/_diagnostic/prompt-compose`
   antes de commit.** La compilación TypeScript OK no garantiza que una section esté efectivamente
   en el prompt final.
