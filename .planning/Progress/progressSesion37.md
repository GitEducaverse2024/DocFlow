# Sesion 37 — CatDev v30.6: Canvas fan-out desde START + saneamiento de tipos

**Fecha:** 2026-04-23
**Estado:** COMPLETADO

---

## Resumen

Sexto milestone bajo CatDev Protocol, ejecutado en una sola sesion corta tras el test empirico de cierre de v30.5. Al darle luz verde a CatBot para ejecutar el plan del canvas "Comparativa facturacion cuatrimestre" aparecio un defecto silencioso nuevo: la MCP tool `canvas_add_edge` rechazaba multiples salidas desde el nodo START con un mensaje "START solo puede tener 1 edge de salida", regla introducida en Phase 138 (b245dd6) sin base runtime — el `canvas-executor.ts` siempre acepto N salidas. Forzada por esa validacion artificial, CatBot invento un workaround invalido: un nodo `type='project'` sin `catbrainId` como "Lanzador" que funciona solo porque cae al fallback legacy `return predecessorOutput` del case `project` del executor. v30.6 (a) elimina la restriccion en la tool alineando build-time con runtime, (b) invierte el test CANVAS-02b para verificar fan-out legal en lugar de rechazo, (c) anade la regla R32 al KB como rule critica documentando el patron correcto + 3 antipatrones explicitos (`project` sin catbrainId, agent passthrough, cadena secuencial disfrazada), (d) corrige el canvas `005fa45e` contaminado eliminando el Lanzador y cableando START directo a ambos webhooks, y (e) verifica empiricamente que CatBot ahora produce topologias fan-out limpias y cita R32 cuando se le pregunta por el patron. Build limpio, 28/28 tests verde, 2/2 CHECKs CatBot verde en un unico push.

---

## Bloque 1 — Causa raiz del defecto silencioso

### El falso limite "START max 1 salida"

La tool `canvas_add_edge` en `app/src/lib/services/catbot-tools.ts` incluia (L3075-3081, pre-v30.6) una validacion estructural:

```typescript
if (sourceType === 'start') {
  const existingStartEdges = flowData.edges.filter(e => e.source === sourceNodeId);
  if (existingStartEdges.length > 0) {
    return { name, result: { error: 'START solo puede tener 1 edge de salida — elimina el edge existente primero' } };
  }
}
```

El runtime `canvas-executor.ts` case `'start'` (L493-504) nunca tuvo esa limitacion:

```typescript
case 'start': {
  const startCanvas = db.prepare('SELECT external_input FROM canvases WHERE id = ?').get(canvasId);
  if (startCanvas?.external_input) { ... return { output: startCanvas.external_input }; }
  return { output: (data.initialInput as string) || '' };
}
```

Y el propagador general `getOutgoingEdges(startId)` ya iteraba N sucesores sin discriminar por tipo. La regla era una invencion de la tool que no reflejaba el comportamiento runtime.

### El workaround que CatBot invento

Al crear el canvas "Comparativa facturacion cuatrimestre" (luz verde de cierre v30.5), CatBot intento:

1. `canvas_add_edge(START → Webhook Q1)` → ok
2. `canvas_add_edge(START → Webhook Q2)` → **error "START solo puede tener 1..."**
3. Autocorreccion: creo un nodo intermedio `canvas_add_node(type='project', label='Lanzador', instructions='Activa la ejecución de ambas ramas')`, `canvas_delete_edge(START→Q1)`, recableo `START → Lanzador → Q1/Q2`.

El nodo `project` sin `catbrainId` activa el fallback legacy del executor:

```typescript
case 'project': { // backward compat for old canvas data
  const catbrainId = (data.catbrainId as string) || (data.projectId as string);
  if (!catbrainId) return { output: predecessorOutput };  // ← passthrough silencioso
  // ...
}
```

El canvas quedaba "funcionalmente correcto" pero con un nodo semanticamente enganoso (UI muestra CatBrain no configurado), dependiente de un fallback no documentado, y contaminaba el KB como referencia para futuros LLMs que copiarian el patron.

### Por que no se detecto antes

La regla se anadio en Phase 138 (2026-04-17, commit b245dd6) junto con validaciones estructurales reales (OUTPUT terminal, CONDITION yes/no sin duplicar). Los tests del momento (CANVAS-02b) comprobaron la regla como esta, no su necesidad. Ningun canvas real demando fan-out desde START hasta el test de cierre v30.5 — casi todos los canvas iniciaban con un nodo unico (normalizador, classifier). El patron "START directo a N ramas paralelas" solo aparece en casos de comparativa/agregacion, que son nuevos en v30.5-v30.6.

---

## Bloque 2 — Cambios de codigo

### P1 — Eliminacion de la regla + inversion del test

**Archivo:** `app/src/lib/services/catbot-tools.ts`

Bloque borrado limpio (sin comentario tombstone):

```typescript
// ELIMINADO (pre-v30.6):
// // Rule: START solo puede tener 1 edge de salida
// if (sourceType === 'start') {
//   const existingStartEdges = flowData.edges.filter(e => e.source === sourceNodeId);
//   if (existingStartEdges.length > 0) {
//     return { name, result: { error: 'START solo puede tener 1 edge de salida — elimina el edge existente primero' } };
//   }
// }
```

Queda solo la cadena de validaciones reales: OUTPUT terminal, CONDITION sourceHandle yes/no sin duplicados, y no-duplicados source→target. El resto funciona con esas tres reglas.

**Archivo:** `app/src/lib/__tests__/canvas-tools-fixes.test.ts`

El test 02b se invirtio semanticamente (mismo indice, nueva semantica):

```typescript
// Pre-v30.6: 'rechaza segundo edge de salida desde START'
//   expect(body.error).toBeDefined();
//   expect(body.error).toContain('START');
//
// v30.6: 'permite fan-out desde START (N edges de salida)'
it('02b: permite fan-out desde START (N edges de salida)', async () => {
  // seed canvas con START ya conectado a n-a, intentar conectar también a n-b
  const result = await executeTool('canvas_add_edge', {
    canvasId: 'c-02b', sourceNodeId: 'n-start', targetNodeId: 'n-b'
  }, ...);
  expect(body.error).toBeUndefined();
  expect(body.edgeId).toBe('e-n-start-n-b');
  expect(body.total_edges).toBe(2);
});
```

Ejecucion: `npx vitest run canvas-tools-fixes` → **28/28 passed** en 297ms, sin regresion.

### P3 — Rewire del canvas contaminado via API PATCH

Script one-shot `scripts/rewire-canvas-005fa45e.cjs` (creado, ejecutado, borrado — no se mantiene). Primer intento con `better-sqlite3` directo fallo con `SQLITE_READONLY`: la DB esta owned por uid=1001 (nextjs del container) y el host es uid=1000 (deskmath), permisos 644. La solucion limpia es la API: `PATCH /api/canvas/[id]` con `force_overwrite: true` para saltar el merge server-side que normalmente preserva nodos no incluidos (anti race-condition UI↔CatBot).

```bash
curl -X PATCH http://localhost:3500/api/canvas/005fa45e-... \
  -H "Content-Type: application/json" \
  -d '{"flow_data": {...}, "force_overwrite": true}'
# → {"success":true} HTTP 200
```

Antes: 7 nodos, 7 edges (con `j3cqe768w` type=project). Despues: 6 nodos, 6 edges, fan-out directo START→csu4hi53t y START→zw7ry2wbx. 0 nodos type=project sin catbrainId.

---

## Bloque 3 — Documentacion en KB

### R32 — Regla critica nueva

**Archivo:** `.docflow-kb/rules/R32-canvas-fan-out-desde-start.md`

Frontmatter con tags `critical, architecture, canvas, topology`, audience `catbot, architect, developer`. Body estructurado en 3 secciones:

1. **La regla:** "START acepta N edges de salida; cablear directo desde START a cada rama es la topologia canonica para fan-out."
2. **3 antipatrones prohibidos explicitos:**
   - Nodo `project` sin `catbrainId` como "Lanzador" (fallback legacy no documentado).
   - Nodo `agent` processor passthrough (desperdicio LLM).
   - Cadena secuencial disfrazada (rompe paralelismo).
3. **Patron correcto:** topologia ASCII + ejemplo de codigo con `canvas_add_edge` multiples.

Cada antipatron incluye "Que es", "Por que es malo" y por que fallaba el razonamiento que llevaba a inventarlo.

### Actualizacion del concept canvas

**Archivo:** `.docflow-kb/domain/concepts/canvas.md:68`

```diff
- `canvas_add_edge` valida reglas estructurales: `OUTPUT` es terminal (no puede tener edges de salida), `START` max 1 edge de salida, `CONDITION` requiere `sourceHandle` yes/no sin duplicar ramas.
+ `canvas_add_edge` valida reglas estructurales: `OUTPUT` es terminal (no puede tener edges de salida), `CONDITION` requiere `sourceHandle` yes/no sin duplicar ramas, y no se permiten duplicados `source→target`. `START` acepta N edges de salida para fan-out directo a ramas paralelas (ver R32 en rules KB).
```

### Taxonomia ampliada

**Archivo:** `.docflow-kb/_schema/tag-taxonomy.json`

```diff
- "rules": [..., "R30", "SE01", ...]
+ "rules": [..., "R30", "R31", "R32", "SE01", ...]

- "cross_cutting": [..., "kb-sync", "rebuild"]
+ "cross_cutting": [..., "kb-sync", "rebuild", "architecture", "prompt", "skills", "system", "topology"]
```

R31 (creada en v30.5) tambien pasa validacion limpia ahora: los warnings de "tag no esta en tag-taxonomy.json" desaparecieron.

### kb-sync full-rebuild

```bash
node scripts/kb-sync.cjs --full-rebuild --source db
# OK: _index.json + _header.md regenerados con 198 entries
```

`_index.json` incluye 2 referencias a R32 (entry principal + metadata). 5 FAILs residuales en 3 canvases + 2 entries de catpaws pre-existentes (frontmatter incompleto, deuda ajena a v30.6).

---

## Bloque 4 — Verificacion empirica con CatBot

### CHECK 1: creacion de canvas fan-out sin hints

**Prompt:** "Crea un mini-canvas Test fan-out paralelo con START → 2 ramas paralelas → merge → output. No lo ejecutes, solo crealo."

**Resultado (86s, 13 tool calls):**
- Canvas `bee6093d-dab4-4879-9494-a67fe1c1527f` creado.
- 5 nodos: START autogenerado + 2 agents (reutilizo `executive-summary` y `prd-generator` tras `list_cat_paws`) + merge + output.
- **5 edges**, con `START→a6rtftkm3` y `START→uvhx71dbk` cableados directamente.
- **0 nodos type=project sin catbrainId.**
- Checklist R01-R08 8/8 pegado al final.

### CHECK 2: cita de la regla KB

**Prompt:** "Cual es el patron correcto para hacer fan-out desde un nodo START? ¿Hay alguna regla critica sobre esto en el KB? ¿Y que antipatrones existen?"

**Resultado (35s, 2 tool calls):**
- `search_kb` + `get_kb_entry` llamados (recupero R32 directamente).
- Cita textual: *"existe una regla critica y explicita sobre esto: la R32 — Canvas fan-out desde START."*
- Reproduce los 3 antipatrones con la misma estructura "Que es / Por que es malo" del KB.
- Ejemplo ASCII topology incluido.

### Conclusion empirica

CatBot no solo deja de usar el hack — tambien *sabe* explicar por que estaba mal. Con la tool ya no bloqueando, el LLM opta por el camino directo (fan-out desde START) por coherencia sintactica; R32 sirve como memoria institucional para preguntas conceptuales futuras y para auditar canvas existentes.

---

## Resumen de archivos modificados

| Archivo | Cambio |
|---------|--------|
| `app/src/lib/services/catbot-tools.ts` | Eliminado bloque "Rule: START max 1" en `canvas_add_edge` |
| `app/src/lib/__tests__/canvas-tools-fixes.test.ts` | Invertido test CANVAS-02b (rechaza → permite fan-out) |
| `.docflow-kb/rules/R32-canvas-fan-out-desde-start.md` | **NUEVO** — regla critica con patron + 3 antipatrones |
| `.docflow-kb/domain/concepts/canvas.md` | Actualizada descripcion de reglas estructurales de `canvas_add_edge` |
| `.docflow-kb/_schema/tag-taxonomy.json` | Anadidos `R31`, `R32` a rules y `architecture, prompt, skills, system, topology` a cross_cutting |
| `.docflow-kb/_index.json` + `_header.md` | Regenerados via kb-sync full-rebuild (198 entries, incluyen R32) |
| `.docflow-kb/resources/canvases/005fa45e-comparativa-facturacion-cuatrimestre.md` | **NUEVO** — auto-generado por kb-sync tras rewire |
| `.docflow-kb/resources/canvases/bee6093d-test-fan-out-paralelo.md` | **NUEVO** — auto-generado tras creacion por CatBot |
| `.docflow-kb/resources/catpaws/b5d586b4-redactor-comparativo.md` | **NUEVO** — auto-generado tras creacion por CatBot (CHECK previo de v30.5 shipped) |
| `.catdev/spec.md` | Sustituido por spec v30.6 en curso → marcado complete al final |
| Canvas `005fa45e-...` (DB) | Rewire: eliminado nodo Lanzador + 3 edges, anadidos 2 edges directos START→Q1/Q2 |

---

## Tips y lecciones aprendidas

### Las validaciones de tool MCP sin base runtime producen hacks

La regla "START max 1 salida" era invencion de Phase 138. No reflejaba el executor. El LLM, forzado, invento un workaround sintacticamente valido pero semanticamente corrupto (`project` sin `catbrainId`). Leccion: **antes de anadir validacion estructural a una tool, confirma que el runtime la necesita**. Si el runtime acepta N, la tool tambien. La MCP tool es un proxy del runtime, no un gate adicional.

### El fallback legacy silencioso es peor que el error explicito

El case `'project'` del executor retorna `predecessorOutput` si no hay `catbrainId`. Funciona, pero es un fallback para canvas antiguos, no una feature. Cuando se convierte en "patron accidental" el riesgo crece: otros LLMs lo copiaran del canvas contaminado, la UI lo muestra como CatBrain roto, el executor podria desaparecer la rama en un refactor. Leccion: **los fallbacks legacy deben ser audibles (log WARN) o eliminados**. Aceptar silenciosamente un `project` sin configuracion es convertir deuda en bomba.

### `force_overwrite` del PATCH canvas no es opcional aqui

El merge server-side de `PATCH /api/canvas/[id]` preserva nodos que el cliente no envia (anti race-condition UI↔CatBot). Al hacer rewire administrativo (eliminar un nodo intencionadamente) hay que pasar `force_overwrite: true` o el nodo se reintroduce. Primera PATCH sin el flag: canvas quedaba con 7 nodos y 9 edges (merge add de 2 edges nuevos sobre topologia completa). Con `force_overwrite: true`: 6 y 6 limpios.

### kb-sync cierra gaps de taxonomia cuando se actualiza primero el schema

R31 se creo en v30.5 con tags `architecture, prompt, skills, system` no declarados en `tag-taxonomy.json`. El validator emite FAIL pero no bloquea la sync. En v30.6 se anadieron a `cross_cutting` + `R31, R32` a `rules` antes del rebuild final — el output es limpio para las 2 rules y las FAILs residuales son pre-existentes. Leccion: **al anadir un tag nuevo a una rule, actualiza `tag-taxonomy.json` en el mismo commit**.

### El error-driven learning del LLM es fiable cuando la tool no miente

Pre-v30.6, CatBot intentaba `canvas_add_edge(START→Q2)`, recibia error, y "aprendia" una regla falsa ("START solo admite 1 salida") que luego le obligaba a inventar. Post-v30.6, el segundo `canvas_add_edge(START→Q2)` retorna ok → el LLM ya tiene el patron correcto. El assembler de prompts puede contener reglas generales; los ejemplos/casos vienen del comportamiento de las tools. Si las tools son honestas, el LLM converge al patron canonico sin necesidad de hardcodear instrucciones.

---

## Metricas de la sesion

- **Fases completadas:** 4/4
- **Ficheros modificados:** 3 (catbot-tools, test, concept canvas)
- **Ficheros nuevos:** 1 rule KB (R32) + 3 KB resources auto-sync + tag-taxonomy update
- **Bugs corregidos:** 1 (regla artificial en canvas_add_edge) + 1 data fix (canvas 005fa45e contaminado)
- **Antipatrones bloqueados a futuro:** 3 (project splitter, agent passthrough, cadena secuencial)
- **Build verificado:** Si (exit 0, solo warnings pre-existentes)
- **Tests verificados:** 28/28 canvas-tools-fixes
- **Verificacion CatBot:** Si — CHECK 1 (creacion sin hints) 5/5, CHECK 2 (cita R32) 2/2 tool calls relevantes
- **Tiempo total sesion:** ~45 min (incluyendo rebuild Docker)
