---
phase: 133-foundation-tooling-found
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/docker-entrypoint.sh
  - app/data-seed/knowledge/canvas-nodes-catalog.md
  - app/src/lib/__tests__/canvas-flow-designer.test.ts
  - app/src/lib/services/canvas-rules.ts
  - app/src/lib/__tests__/canvas-rules.test.ts
autonomous: true
requirements:
  - FOUND-01
  - FOUND-02
  - FOUND-03
must_haves:
  truths:
    - "Al arrancar el contenedor, canvas-nodes-catalog.md existe en /app/data/knowledge/"
    - "getCanvasRule('R10') devuelve la regla completa dentro del contenedor sin fallback"
    - "VALID_NODE_TYPES contiene exactamente los 14 tipos que el executor acepta y está cubierto por test unitario"
  artifacts:
    - path: "app/data-seed/knowledge/canvas-nodes-catalog.md"
      provides: "Catálogo de reglas R01-R25 servido al volumen de knowledge en runtime"
    - path: "app/docker-entrypoint.sh"
      provides: "Copia *.json Y *.md al volumen /app/data/knowledge/"
      contains: "cp -u /app/data-seed/knowledge/*.md"
    - path: "app/src/lib/services/canvas-rules.ts"
      provides: "getCanvasRule() busca en /app/data/knowledge/canvas-nodes-catalog.md como primera ruta"
    - path: "app/src/lib/__tests__/canvas-flow-designer.test.ts"
      provides: "Test VALID_NODE_TYPES 14 tipos exactos"
  key_links:
    - from: "app/docker-entrypoint.sh"
      to: "/app/data/knowledge/canvas-nodes-catalog.md"
      via: "cp -u en arranque"
      pattern: "data-seed/knowledge/\\*\\.md"
    - from: "app/src/lib/services/canvas-rules.ts"
      to: "/app/data/knowledge/canvas-nodes-catalog.md"
      via: "readFileSync con path absoluto /app/data/knowledge/"
      pattern: "data/knowledge/canvas-nodes-catalog\\.md"
---

<objective>
Establecer el baseline de Phase 133: el contenedor Docker tiene el catálogo de reglas de canvas accesible en runtime, getCanvasRule('R10') funciona dentro del contenedor, y VALID_NODE_TYPES está blindado por test unitario contra los 14 tipos que canvas-executor.ts realmente acepta.

Purpose: Sin estos cimientos, los plans posteriores (timeouts, persistencia, test-pipeline) ejecutan contra un runtime donde el architect no puede expandir reglas y el validador rechaza nodos legítimos. Es prerequisito para que el QA loop produzca feedback útil.
Output: canvas-nodes-catalog.md en app/data-seed/knowledge/, entrypoint actualizado para copiar *.md, canvas-rules.ts apunta a /app/data/knowledge/ como primera ruta, tests verdes para VALID_NODE_TYPES y getCanvasRule.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@./CLAUDE.md

@app/docker-entrypoint.sh
@app/src/lib/services/canvas-flow-designer.ts
@app/src/lib/services/canvas-rules.ts
@app/src/lib/__tests__/canvas-flow-designer.test.ts
@.planning/knowledge/canvas-nodes-catalog.md

<interfaces>
<!-- Key contracts extracted from codebase — executor should use directly -->

From app/src/lib/services/canvas-flow-designer.ts:
```ts
export const VALID_NODE_TYPES = [
  'start','agent','catpaw','catbrain','condition','iterator','iterator_end',
  'merge','multiagent','scheduler','checkpoint','connector','storage','output',
] as const;
export type CanvasNodeType = (typeof VALID_NODE_TYPES)[number];
```
(14 tipos — baseline que FOUND-02 debe blindar)

From app/src/lib/services/canvas-rules.ts:
```ts
export interface RuleDetail { id: string; short: string; long: string }
export function getCanvasRule(ruleId: string): RuleDetail | null;
```
Lectura actual busca en varios paths relativos; FOUND-03 fuerza /app/data/knowledge/ como primera ruta absoluta.

From app/docker-entrypoint.sh (current):
```sh
cp -u /app/data-seed/knowledge/*.json /app/data/knowledge/ 2>/dev/null || true
cp -u /app/data-seed/knowledge/*.md /app/data/knowledge/ 2>/dev/null || true
```
Ya copia *.md — FOUND-01 sólo requiere verificación + garantizar que el seed existe.
</interfaces>

**Current state discovered:**
- `docker-entrypoint.sh` YA copia `*.md` desde data-seed (línea 8). FOUND-01 cubierto — validar solamente.
- `canvas-nodes-catalog.md` existe en `.planning/knowledge/` pero NO en `app/data-seed/knowledge/`. Al arrancar el contenedor, el seed no tiene el fichero → la copia es no-op → `getCanvasRule` falla en runtime.
- `VALID_NODE_TYPES` ya tiene test unitario en `canvas-flow-designer.test.ts` (cubre FOUND-02). Validar que el set es exactamente 14 y dejar el test verde.
- `canvas-rules.ts` busca el catálogo en paths relativos al `cwd`. Dentro del contenedor `cwd` suele ser `/app` así que `/app/.planning/knowledge/...` es la ruta que actualmente hace match — frágil. FOUND-03 requiere que `/app/data/knowledge/canvas-nodes-catalog.md` sea la primera ruta probada.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Copiar canvas-nodes-catalog.md al seed y actualizar canvas-rules.ts para leer desde /app/data/knowledge/</name>
  <files>app/data-seed/knowledge/canvas-nodes-catalog.md, app/src/lib/services/canvas-rules.ts</files>
  <action>
1. Copiar el contenido de `.planning/knowledge/canvas-nodes-catalog.md` a `app/data-seed/knowledge/canvas-nodes-catalog.md` (sin modificar el contenido — el catálogo R01-R25 es fuente de verdad compartida con Phase 132).
   - Usar `cp .planning/knowledge/canvas-nodes-catalog.md app/data-seed/knowledge/canvas-nodes-catalog.md` via Bash.

2. En `app/src/lib/services/canvas-rules.ts`, modificar la lista de `candidatePaths` dentro de la función que localiza `canvas-nodes-catalog.md` para que `/app/data/knowledge/canvas-nodes-catalog.md` sea la PRIMERA ruta probada (runtime en contenedor). Mantener las rutas relativas existentes como fallback para ejecución local fuera de Docker (tests unitarios locales).

   Orden forzado:
   ```ts
   const candidatePaths = [
     '/app/data/knowledge/canvas-nodes-catalog.md',           // runtime Docker (primary)
     path.join(cwd, 'app/data-seed/knowledge/canvas-nodes-catalog.md'), // local dev
     path.join(cwd, '.planning/knowledge/canvas-nodes-catalog.md'),     // legacy fallback
     path.join(cwd, '../.planning/knowledge/canvas-nodes-catalog.md'),
   ];
   ```

3. NO tocar el parseo interno de `getCanvasRule` — solo las rutas. NO dejar comentarios tipo "// old path removed" (feedback_no_tombstone_comments). Eliminar las rutas obsoletas limpiamente si alguna deja de aplicar.

4. Verificar que `docker-entrypoint.sh` ya copia `*.md` (línea 8). Si la copia existe, NO tocar el fichero. Si no existe, añadirla (no debería ser el caso).
  </action>
  <verify>
    <automated>cd app &amp;&amp; test -f data-seed/knowledge/canvas-nodes-catalog.md &amp;&amp; grep -q 'data/knowledge/canvas-nodes-catalog.md' src/lib/services/canvas-rules.ts</automated>
  </verify>
  <done>
- `app/data-seed/knowledge/canvas-nodes-catalog.md` existe con el contenido completo R01-R25
- `canvas-rules.ts` lista `/app/data/knowledge/canvas-nodes-catalog.md` como primera ruta
- `docker-entrypoint.sh` copia `*.md` al volumen (ya cubierto, verificado)
- No hay tombstone comments
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Blindar VALID_NODE_TYPES + getCanvasRule con tests unitarios</name>
  <files>app/src/lib/__tests__/canvas-flow-designer.test.ts, app/src/lib/__tests__/canvas-rules.test.ts</files>
  <behavior>
- Test FOUND-02: `VALID_NODE_TYPES` contiene exactamente los 14 tipos: `start, agent, catpaw, catbrain, condition, iterator, iterator_end, merge, multiagent, scheduler, checkpoint, connector, storage, output`. El test debe fallar si alguien añade o quita un tipo sin actualizar el test (gate contra drift).
- Test FOUND-03: `getCanvasRule('R10')` devuelve un objeto con `id === 'R10'` y `long.length > 200` (la regla existe y tiene cuerpo expandido). `getCanvasRule('R99')` (inexistente) devuelve `null`.
- Los tests corren dentro de jest/vitest local (fuera de Docker) y resuelven el catálogo desde `app/data-seed/knowledge/canvas-nodes-catalog.md` vía el fallback del candidatePaths.
  </behavior>
  <action>
1. Revisar el test existente de `VALID_NODE_TYPES` en `canvas-flow-designer.test.ts`. Si ya valida los 14 tipos exactos (ya hay `describe('VALID_NODE_TYPES')`), solo confirmar que la lista esperada está hard-coded y `.length` se compara con `14`. Si no, actualizarlo:
   ```ts
   it('contains exactly the 14 types the canvas-executor accepts', () => {
     const expected = [
       'start','agent','catpaw','catbrain','condition','iterator','iterator_end',
       'merge','multiagent','scheduler','checkpoint','connector','storage','output',
     ];
     for (const t of expected) expect(VALID_NODE_TYPES).toContain(t);
     expect(VALID_NODE_TYPES.length).toBe(14);
   });
   ```

2. Añadir a `canvas-rules.test.ts` (crear el fichero si no existe):
   ```ts
   import { getCanvasRule } from '../services/canvas-rules';
   describe('getCanvasRule', () => {
     it('returns R10 with full long body from canvas-nodes-catalog.md', () => {
       const rule = getCanvasRule('R10');
       expect(rule).not.toBeNull();
       expect(rule!.id).toBe('R10');
       expect(rule!.long.length).toBeGreaterThan(200);
     });
     it('returns null for non-existent rule id', () => {
       expect(getCanvasRule('R99')).toBeNull();
     });
   });
   ```

3. Los tests DEBEN resolver el catálogo desde `app/data-seed/knowledge/canvas-nodes-catalog.md` (ruta del fallback `cwd + 'app/data-seed/knowledge/...'` cuando se ejecuta desde la raíz del repo). Si cwd en jest es `app/`, añadir también `path.join(cwd, 'data-seed/knowledge/canvas-nodes-catalog.md')` al candidatePaths.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm test -- --run canvas-flow-designer.test canvas-rules.test 2>&amp;1 | tail -20</automated>
  </verify>
  <done>
- Test de `VALID_NODE_TYPES` valida los 14 tipos exactos y `.length === 14`
- Test de `getCanvasRule('R10')` pasa (encuentra la regla con body > 200 chars)
- Test de `getCanvasRule('R99')` devuelve null
- Suite verde
  </done>
</task>

</tasks>

<verification>
1. `npm run build` dentro de `app/` compila sin errores (ESLint no-unused-vars es error)
2. Tests unitarios verdes: `npm test -- --run canvas-flow-designer canvas-rules`
3. `app/data-seed/knowledge/canvas-nodes-catalog.md` existe con R01-R25
4. (Manual post-deploy, fuera de este plan) En runtime Docker: `docker exec docflow-app ls /app/data/knowledge/canvas-nodes-catalog.md` devuelve el fichero
</verification>

<success_criteria>
- Entrypoint copia `*.md` al volumen de knowledge (FOUND-01) ✓
- `VALID_NODE_TYPES` tiene exactamente 14 tipos con test unitario gate (FOUND-02) ✓
- `canvas-nodes-catalog.md` existe en el seed y `getCanvasRule('R10')` funciona en tests locales y en runtime contenedor (FOUND-03) ✓
- Sin tombstone comments, sin unused imports
</success_criteria>

<output>
After completion, create `.planning/phases/133-foundation-tooling-found/133-01-SUMMARY.md` con:
- Estado del entrypoint (verificado ya funcionaba)
- Rutas canonicalizadas en canvas-rules.ts
- Tests añadidos/extendidos
- Evidencia CatBot (opcional): pedir a CatBot via tool `query_knowledge('catflow', 'R10')` que confirme que la regla se puede leer
</output>
