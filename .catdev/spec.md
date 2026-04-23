# CatDev: v30.6 Canvas fan-out desde START + saneamiento de tipos

**Milestone:** v30.6 | **Sesión:** 37 | **Fecha:** 2026-04-23 | **Estado:** complete (shipped 2026-04-23)

## Objetivo

Empíricamente v30.5 pasó: CatBot respetó R01-R08 al crear el canvas `Comparativa facturación cuatrimestre` (8/8 checklist, 13 tool calls coherentes, R03 delegó cálculo al connector). Pero al ejecutar el plan apareció un **defecto silencioso nuevo**: la tool `canvas_add_edge` rechaza múltiples salidas desde START (regla arbitraria introducida en Phase 138 sin base runtime: el `canvas-executor.ts` SÍ acepta N salidas), lo que forzó a CatBot a inventar un workaround inválido — nodo `Lanzador` con `type=project` sin `catbrainId`, que solo "funciona" porque cae al fallback legacy `return predecessorOutput` del case `project` del executor. Este patrón es frágil, semánticamente engañoso y contaminará cualquier canvas futuro si otro LLM lo toma como referencia.

Este milestone (a) elimina la restricción artificial "START max 1 salida" en la MCP tool, alineando build-time con runtime, (b) documenta en KB como Regla R32 que el fan-out desde START es N edges directos (y que `project` sin `catbrainId` es antipatrón prohibido), (c) corrige el canvas `005fa45e` eliminando el `Lanzador` y conectando START directamente a ambos webhooks, (d) actualiza el test `canvas-tools-fixes.test.ts:273` (CANVAS-02b) invirtiendo su semántica — ahora verifica fan-out legal en lugar de rechazo, y (e) verifica empíricamente pidiendo a CatBot un canvas paralelo similar para confirmar que ahora produce topología directa sin hacks.

## Contexto técnico

- **Ficheros principales afectados:**
  - `app/src/lib/services/catbot-tools.ts:3075-3081` — eliminar bloque "Rule: START solo puede tener 1 edge de salida"
  - `app/src/lib/__tests__/canvas-tools-fixes.test.ts:273-295` — invertir CANVAS-02b (antes "rechaza 2ª salida" → ahora "permite fan-out desde START")
  - `.docflow-kb/domain/concepts/canvas.md:68` — eliminar mención "START max 1 edge de salida" del párrafo de reglas estructurales
  - `.docflow-kb/rules/R32-*.md` (NUEVO) — fan-out desde START + antipatrón `project` sin `catbrainId`, tags `critical`
  - Canvas DB `005fa45e-774d-46b7-8fe1-146856a99a3b` — rewire topología (borrar nodo `j3cqe768w` tipo `project` + 3 edges asociados, añadir 2 edges directos START→Q1 y START→Q2)
- **Cambios en DB:** no schema; solo data fix del canvas afectado (flow_data JSON)
- **Rutas API nuevas:** ninguna
- **Dependencias del proyecto:** v30.5 literal-injection de skills sistema (ya shipped) — R32 se incluirá en el skill "Canvas Rules Inmutables" seed si queda natural, pero vive primero como regla KB (R31 pattern: regla KB sola basta porque rules se consumen via `search_kb`; CatBot ya tiene skill de contexto general de canvas). La regla NO se añade al system prompt literal porque no es una invariante de diseño LLM sino una regla estructural que `canvas_add_edge` ya enforce de forma correcta (N≥1, OUTPUT terminal, CONDITION yes/no) — el LLM la descubre por error-driven feedback de la propia tool.
- **Deuda técnica relevante:** tech-debt-backlog.md §3 item "canvas tool validation drift" — este milestone resuelve la deriva concreta (START rule sin base) pero deja abierta la pregunta general "¿hay otras reglas phase-138 sin base?" (auditoría diferida).

## Fases

| # | Nombre | Estado | Estimación |
|---|--------|--------|------------|
| P1 | Eliminar regla "START max 1" en `canvas_add_edge` + invertir test CANVAS-02b | ✅ done | ~15m |
| P2 | Regla R32 KB (fan-out desde START + antipatrón `project` passthrough) + update `domain/concepts/canvas.md` | ✅ done | ~10m |
| P3 | Rewire canvas `005fa45e`: borrar nodo Lanzador + 3 edges, añadir 2 edges directos START→Q1/Q2 | ✅ done | ~5m |
| P4 | Verificación empírica: pedir a CatBot un canvas paralelo nuevo y validar topología directa sin `project` hack | ✅ done | ~15m |

### P1: Eliminar regla "START max 1" en `canvas_add_edge` + invertir test CANVAS-02b

**Qué hace:** Alinea la MCP tool con el runtime. `canvas-executor.ts` case `'start'` acepta `edges.filter(e => e.source === startId)` sin límite; la tool bloqueaba artificialmente. Se elimina el bloque `if (sourceType === 'start') { ... }` y se invierte el test que lo verificaba.

**Ficheros a crear/modificar:**
- `app/src/lib/services/catbot-tools.ts` — borrar líneas 3075-3081 limpiamente (no dejar comentario tombstone)
- `app/src/lib/__tests__/canvas-tools-fixes.test.ts` — CANVAS-02b (línea 273) cambia de "rechaza" a "permite fan-out" (2 edges START→A y START→B ambos con status ok, `total_edges=2`). Ajustar título del `it(...)` y aserciones.

**Criterios de éxito:**
- [ ] `canvas_add_edge` con 2 edges desde START retorna 200 OK en ambos (no 400/error)
- [ ] Test CANVAS-02b pasa con semántica invertida (permitir)
- [ ] `npm test -- canvas-tools-fixes` verde
- [ ] Build limpio: `npm run build` sin errores

### P2: Regla R32 KB + update `domain/concepts/canvas.md`

**Qué hace:** Documenta el patrón correcto y el antipatrón. R32 vive como rule crítica (tags `critical`) porque define un contrato de topología que cualquier agente que construya canvas debe respetar. No hay que meterla en system prompt literal — `canvas_add_edge` ya no fallará, así que el LLM no inventará workarounds; si aún así los busca por intuición, R32 aparecerá vía `search_kb({tags:["critical"]})`.

**Ficheros a crear/modificar:**
- `.docflow-kb/rules/R32-canvas-fan-out-desde-start.md` (NUEVO) — estructura como las otras rules (frontmatter + body con regla + antipatrón + ejemplo). Tags: `critical`, `canvas`, `topology`. Audience: `catbot, architect, developer`.
- `.docflow-kb/domain/concepts/canvas.md:68` — eliminar la frase "`START` max 1 edge de salida" del párrafo de reglas. Añadir nota breve: "`START` acepta N edges de salida (fan-out directo a ramas paralelas)."
- `.docflow-kb/_index.json` + `.docflow-kb/_header.md` — regenerar via `node scripts/kb-sync.cjs --full-rebuild --source db` al final para incluir R32.

**Criterios de éxito:**
- [ ] `R32-canvas-fan-out-desde-start.md` existe con frontmatter válido
- [ ] Grep de "max 1 edge" en `.docflow-kb/domain/concepts/canvas.md` no devuelve nada
- [ ] `_index.json` incluye entry para R32
- [ ] Build limpio: `npm run build` sin errores

### P3: Rewire canvas `005fa45e`

**Qué hace:** Corrige topología del canvas existente. El nodo `j3cqe768w` (type=project, Lanzador) es antipatrón — eliminarlo junto con sus 3 edges asociados (START→Lanzador, Lanzador→Webhook_Q1, Lanzador→Webhook_Q2) y crear 2 edges directos START→Webhook_Q1 y START→Webhook_Q2. Script Node.js one-shot que escribe directamente en DB via `better-sqlite3` dentro de Docker (o bind mount).

**Ficheros a crear/modificar:**
- `scripts/rewire-canvas-005fa45e.cjs` (NUEVO, one-shot; no se mantiene) — carga flow_data, filtra nodo+edges afectados, añade 2 edges nuevos, persiste. Imprime diff.
- Eliminar script tras aplicar (no es deuda mantenible).

**Criterios de éxito:**
- [ ] Canvas `005fa45e` queda con 6 nodos (sin `j3cqe768w`) y 6 edges (start→Q1, start→Q2, Q1→merge, Q2→merge, merge→redactor, redactor→output)
- [ ] React Flow lo renderiza sin errores (verificable en browser opcional, pero la consistencia DB basta)
- [ ] `knowledge-sync` dispara en el PATCH si pasamos por API; si usamos SQL directo, ok — flow_data no se sincroniza al KB por invariante de seguridad
- [ ] Build limpio: `npm run build` sin errores

### P4: Verificación empírica

**Qué hace:** Re-pregunta a CatBot: "Crea un canvas paralelo 'Test fan-out paralelo' con 2 ramas webhook distintas, merge, output. No ejecutes." Validamos (a) 0 tool calls a `canvas_add_node` con `type=project` o `type=catbrain` sin `catbrainId` claro, (b) `canvas_add_edge` desde START a 2 nodos distintos retorna ok en ambos, (c) topología final es directa (6 nodos incluyendo START, 5 edges: START→A, START→B, A→M, B→M, M→O), (d) self-report no menciona "solo admite 1 salida" como limitación.

**Ficheros a crear/modificar:**
- Ninguno de código — solo verificación runtime.
- Actualizar `.catdev/spec.md` "Notas de sesión" con resumen del test.

**Criterios de éxito:**
- [ ] CatBot NO crea nodo tipo `project` sin `catbrainId` funcional (validación post-hoc en DB)
- [ ] 2 edges directos START→X y START→Y creados sin error
- [ ] Build limpio: `npm run build` sin errores

## Verificación CatBot

CHECK 1: "Crea un mini-canvas 'Test fan-out paralelo' con START → 2 ramas (dos nodos agent processor diferentes) → merge → output. No lo ejecutes, solo crealo."
  → Esperar: 1 canvas creado, 5-6 nodos (incluyendo START), 5 edges con 2 de ellos saliendo de START. NO debe aparecer ningún nodo tipo `project`/`catbrain` sin `catbrainId`.

CHECK 2: "¿Cuál es el patrón correcto para hacer fan-out desde START en un canvas DocFlow? Cita la regla del KB."
  → Esperar: CatBot cita R32 o el concepto canvas.md actualizado, confirma "N edges directos desde START" y menciona el antipatrón `project` sin `catbrainId`.

## Notas de sesión

### Decisiones de implementación

- **P1 — borrado limpio, no deprecation**: La regla "START max 1" en `canvas_add_edge` se eliminó sin dejar comentario tombstone ni flag de feature (no hay feature flags en DocFlow). El test CANVAS-02b se invirtió in-situ (mantiene el mismo `it(...)` index 02b pero ahora verifica fan-out legal). Alternativa descartada: convertir la regla en warning no-bloqueante — rechazada porque la regla nunca tuvo base runtime; un warning solo genera ruido.
- **P2 — R32 vive como rule KB, no como skill sistema**: Consideré añadirla al skill "Canvas Rules Inmutables" que v30.5 inyecta literal, pero la naturaleza de R32 es **error-driven**: el LLM la descubre cuando `canvas_add_edge` ya no falla y no necesita inventar workarounds. Con R01-R08 inyectadas literal (v30.5) + la tool comportándose limpia (v30.6 P1), R32 solo importa como referencia cuando alguien pregunta "¿cuál es el patrón?". `search_kb` la encuentra via tag `critical` + `canvas` + `topology`.
- **P3 — PATCH via API con `force_overwrite: true`**: Descartado acceso directo SQLite (DB owned por uid=1001 nextjs dentro del contenedor, host es uid=1000 → readonly). La API `PATCH /api/canvas/[id]` hace merge por defecto para evitar race conditions entre UI↔CatBot; con `force_overwrite: true` sobreescribe limpio. Script `rewire-canvas-005fa45e.cjs` creado y borrado tras uso (one-shot, no se mantiene).
- **P4 — deploy Docker antes de verificar**: Cambios TypeScript en `catbot-tools.ts` requieren rebuild de imagen Docker (R29). Ejecutado `docker compose build --no-cache && up -d && chown /app/data && restart`. Verificación empírica post-deploy.

### Verificación CatDev — 2026-04-23

- ✅ **Build limpio** (`npm run build` exit=0, warnings pre-existentes solamente — React hooks, `<img>`, migration errors ajenos al cambio)
- ✅ **Tests**: `npx vitest run canvas-tools-fixes` → 28/28 passed (inversión de CANVAS-02b OK, resto sin regresión)
- ✅ **DB canvas `005fa45e`**: 6 nodos (sin `j3cqe768w`), 6 edges, fan-out directo `START→csu4hi53t` y `START→zw7ry2wbx` confirmados. 0 antipatrones `project` sin `catbrainId`.
- ✅ **KB index**: `_index.json` regenerado con 198 entries incluyendo R32. Taxonomía actualizada (tags `architecture, prompt, skills, system, topology` + rules `R31, R32` añadidos a `_schema/tag-taxonomy.json`).
- ✅ **CatBot CHECK 1** (mini canvas fan-out): CatBot creó canvas `bee6093d-dab4-4879-9494-a67fe1c1527f` con 5 nodos (START + 2 agents paralelos + merge + output) y 5 edges — `START→BranchA` y `START→BranchB` en paralelo directo. **0 nodos tipo `project` sin catbrainId**. Checklist R01-R08 8/8. 13 tool calls coherentes.
- ✅ **CatBot CHECK 2** (cita regla KB): CatBot llamó `search_kb` + `get_kb_entry` → citó explícitamente **"R32 — Canvas fan-out desde START"** por nombre, reprodujo los 3 antipatrones (project sin catbrainId, agent passthrough, cadena secuencial) con la misma redacción y ejemplos del KB. Respuesta de 35s, 2 tool calls precisos.

### Observaciones post-verificación (no bloqueantes)

- **Observación A**: En CHECK 1, CatBot citó CatPaws por slug (`executive-summary`, `prd-generator`) en lugar de UUID. R27 exige UUID en `agentId` — pero en este caso son **nombres lógicos** mencionados en el reply al usuario, no en la tool call a `canvas_add_node`. La tool call probablemente usó UUIDs reales (no verificado en este milestone). Candidato a observar en futuras pruebas; no entra en v30.6.
- **Observación B**: Conector Holded del canvas `005fa45e` sigue sin `body_template` ni `headers` en `config`. El `{"periodo":"Q1"}` está en `node.data.instructions`, que connectors no leen como body. Es un issue de contrato de `n8n_webhook` (se resuelve configurando el connector correctamente o mejorando el executor para leer instructions como body override). Fuera de scope v30.6.
- **Observación C**: R32 aplica al tipo `start`, pero existe la misma pregunta conceptual para otros puntos de fan-out (p.ej. un `agent` cuyo output debe disparar 3 ramas). La implementación de `canvas_add_edge` ya lo permite (solo rechaza OUTPUT y duplicados); R32 cubre el caso explícito más común. Si aparecen más antipatrones de splitting, extender R32 o crear R33.
