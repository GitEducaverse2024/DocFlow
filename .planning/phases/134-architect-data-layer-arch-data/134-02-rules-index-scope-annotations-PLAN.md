---
phase: 134-architect-data-layer-arch-data
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - app/data/knowledge/canvas-rules-index.md
  - app/src/lib/__tests__/canvas-rules-scope.test.ts
autonomous: true
requirements:
  - ARCH-DATA-07
must_haves:
  truths:
    - "Cada regla no universal en canvas-rules-index.md declara `[scope: role1,role2,...]` al final de su línea"
    - "R10 declara [scope: transformer,synthesizer]"
    - "SE01 declara [scope: emitter]"
    - "R15 declara [scope: transformer,synthesizer,renderer]"
    - "R02 declara [scope: extractor,transformer]"
    - "Las reglas universales (R03, R04, R11, R20, R23, R24) NO tienen anotación de scope"
    - "Un test unitario parsea el markdown y verifica que el archivo tiene las anotaciones correctas"
  artifacts:
    - path: "app/data/knowledge/canvas-rules-index.md"
      provides: "Rules index con scope-by-role annotations"
      contains: "[scope:"
    - path: "app/src/lib/__tests__/canvas-rules-scope.test.ts"
      provides: "Validación estática de las anotaciones [scope: role]"
  key_links:
    - from: "app/data/knowledge/canvas-rules-index.md"
      to: "Phase 135 reviewer (consumirá estos scopes)"
      via: "rules index inyectado en CANVAS_QA_PROMPT vía {{RULES_INDEX}}"
      pattern: "loadRulesIndex\\(\\)"
---

<objective>
Añadir anotaciones `[scope: role1,role2,...]` a las reglas no universales en `canvas-rules-index.md`, siguiendo EXACTAMENTE el mapping que REQUIREMENTS.md ARCH-DATA-07 dicta. Phase 135 usará estos scopes para que el reviewer aplique R10 solo a transformer/synthesizer, SE01 solo a emitter, etc. Este plan es independiente (toca solo markdown + un test de parsing), ergo puede correr paralelo a Plan 01 en Wave 1.

Purpose: sin scope-by-role, Phase 135 no tiene forma de enseñarle al reviewer que R10 no aplica a un emitter. Este es el edge wiring que desbloquea la QA role-aware del siguiente phase.

Output:
- `app/data/knowledge/canvas-rules-index.md` actualizado con anotaciones
- `app/src/lib/__tests__/canvas-rules-scope.test.ts` que lee el archivo real del disco y valida las anotaciones
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@app/data/knowledge/canvas-rules-index.md

**Spec literal de ARCH-DATA-07 (verbatim de REQUIREMENTS.md):**
> `canvas-rules-index.md` declara `[scope: role]` en cada regla que no sea universal:
> - R10 → `transformer,synthesizer`
> - SE01 → `emitter`
> - R15 → `transformer,synthesizer,renderer`
> - R02 → `extractor,transformer cuando produce arrays`
>
> Las universales (R03, R04, R11, R20, R23, R24) no necesitan anotación

**Sintaxis decidida:** agregar al final de cada línea el sufijo ` [scope: role1,role2]`.
Ejemplo: `- R10: JSON in -> JSON out. Mantener TODOS los campos originales; anadir solo los nuevos [scope: transformer,synthesizer]`

Para R02 (extractor,transformer cuando produce arrays), usar sintaxis condicional: `[scope: extractor,transformer-when-array]`. El guion convierte la condición en token único parseable sin romper el formato simple.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Añadir anotaciones [scope: role] a canvas-rules-index.md</name>
  <files>app/data/knowledge/canvas-rules-index.md</files>
  <action>
    Editar `app/data/knowledge/canvas-rules-index.md` añadiendo el sufijo ` [scope: ...]` a las 4 reglas dictadas por ARCH-DATA-07:

    - Línea R10 (actualmente `- R10: JSON in -> JSON out. Mantener TODOS los campos originales; anadir solo los nuevos`):
      → añadir ` [scope: transformer,synthesizer]`
    - Línea R15 (actualmente `- R15: Cada nodo LLM recibe cantidad MINIMA de info. Recorta body, limita campos`):
      → añadir ` [scope: transformer,synthesizer,renderer]`
    - Línea R02 (actualmente `- R02: N_items x tool_calls vs MAX_TOOL_ROUNDS(12). Si >60% -> ITERATOR o Dispatcher`):
      → añadir ` [scope: extractor,transformer-when-array]`
    - Línea SE01 (actualmente `- SE01: Antes de cada send/write/upload/create -> insertar condition guard automatico`):
      → añadir ` [scope: emitter]`

    NO tocar R03, R04, R11, R20, R23, R24 — son universales por especificación.

    NO tocar las demás reglas (R01, R05, R06, R07, R08, R09, R12, R13, R14, R16, R17, R18, R19, R21, R22, R25, SE02, SE03, DA01-04) — el spec solo exige las 4 arriba + las 6 universales exentas; las demás pueden quedar sin anotación sin violar el requirement.

    Tras editar: verificar visualmente que el formato del markdown sigue intacto (headers, bullets, espaciado).
  </action>
  <verify>
    <automated>grep -E '^- (R10|R15|R02|SE01):' app/data/knowledge/canvas-rules-index.md | grep -q '\[scope:' &amp;&amp; echo OK</automated>
  </verify>
  <done>
    Las 4 reglas (R10, R15, R02, SE01) tienen su anotación [scope: ...] correcta al final de la línea. El markdown sigue siendo válido (sin corrupciones de formato).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Test unitario que parsea el markdown y valida las anotaciones</name>
  <files>app/src/lib/__tests__/canvas-rules-scope.test.ts</files>
  <behavior>
    - Test 1: lee `app/data/knowledge/canvas-rules-index.md` del disco vía `fs.readFileSync`, parsea líneas que empiezan por `- R` o `- SE` o `- DA`, extrae pares `{rule_id, scope_annotation|null}`.
    - Test 2: R10 tiene `scope_annotation === 'transformer,synthesizer'`.
    - Test 3: R15 tiene `scope_annotation === 'transformer,synthesizer,renderer'`.
    - Test 4: R02 tiene `scope_annotation === 'extractor,transformer-when-array'`.
    - Test 5: SE01 tiene `scope_annotation === 'emitter'`.
    - Test 6: R03, R04, R11, R20, R23, R24 (universales por spec) NO tienen anotación de scope (scope_annotation === null).
    - Test 7 (sanity): el parser encuentra al menos 20 reglas (regression guard contra vaciar el archivo por accidente).
  </behavior>
  <action>
    Crear `app/src/lib/__tests__/canvas-rules-scope.test.ts`:

    ```typescript
    import { describe, it, expect } from 'vitest';
    import fs from 'node:fs';
    import path from 'node:path';

    const RULES_PATH = path.resolve(__dirname, '../../../data/knowledge/canvas-rules-index.md');

    interface ParsedRule {
      rule_id: string;
      scope_annotation: string | null;
    }

    function parseRules(md: string): ParsedRule[] {
      const out: ParsedRule[] = [];
      const re = /^- (R\d+|SE\d+|DA\d+):.*?(?:\[scope:\s*([^\]]+)\])?\s*$/;
      for (const line of md.split('\n')) {
        const m = line.match(re);
        if (!m) continue;
        out.push({ rule_id: m[1], scope_annotation: m[2] ? m[2].trim() : null });
      }
      return out;
    }

    describe('canvas-rules-index.md scope annotations (ARCH-DATA-07)', () => {
      const md = fs.readFileSync(RULES_PATH, 'utf8');
      const rules = parseRules(md);
      const byId = new Map(rules.map(r => [r.rule_id, r]));

      it('R10 declares [scope: transformer,synthesizer]', () => {
        expect(byId.get('R10')?.scope_annotation).toBe('transformer,synthesizer');
      });
      it('R15 declares [scope: transformer,synthesizer,renderer]', () => {
        expect(byId.get('R15')?.scope_annotation).toBe('transformer,synthesizer,renderer');
      });
      it('R02 declares [scope: extractor,transformer-when-array]', () => {
        expect(byId.get('R02')?.scope_annotation).toBe('extractor,transformer-when-array');
      });
      it('SE01 declares [scope: emitter]', () => {
        expect(byId.get('SE01')?.scope_annotation).toBe('emitter');
      });
      it('universal rules (R03, R04, R11, R20, R23, R24) have no scope annotation', () => {
        for (const id of ['R03', 'R04', 'R11', 'R20', 'R23', 'R24']) {
          expect(byId.get(id)?.scope_annotation).toBeNull();
        }
      });
      it('parses at least 20 rules (sanity)', () => {
        expect(rules.length).toBeGreaterThanOrEqual(20);
      });
    });
    ```
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/canvas-rules-scope.test.ts</automated>
  </verify>
  <done>
    Los 6 tests pasan. Cualquier regresión futura en canvas-rules-index.md (cambio de scope o desaparición de regla) rompe este test.
  </done>
</task>

</tasks>

<verification>
- `grep -c '\[scope:' app/data/knowledge/canvas-rules-index.md` debe devolver exactamente 4.
- `npx vitest run src/lib/__tests__/canvas-rules-scope.test.ts` verde.
</verification>

<success_criteria>
- [ ] canvas-rules-index.md tiene las 4 anotaciones [scope: ...] correctas en R10, R15, R02, SE01
- [ ] Las 6 reglas universales siguen sin anotación
- [ ] Test unitario parsea el archivo y valida cada mapping (6 asserts + 1 sanity)
- [ ] El test lee el archivo real (no mock) — romperá si alguien edita el .md sin actualizar
</success_criteria>

<output>
Crear `.planning/phases/134-architect-data-layer-arch-data/134-02-SUMMARY.md`
</output>