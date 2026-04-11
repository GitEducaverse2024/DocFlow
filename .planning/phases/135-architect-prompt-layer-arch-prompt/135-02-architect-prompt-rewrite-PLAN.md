---
phase: 135-architect-prompt-layer-arch-prompt
plan: 02
type: execute
wave: 2
depends_on: ["135-01"]
files_modified:
  - app/src/lib/services/catbot-pipeline-prompts.ts
  - app/src/lib/__tests__/catbot-pipeline-prompts.test.ts
autonomous: true
requirements:
  - ARCH-PROMPT-01
  - ARCH-PROMPT-02
  - ARCH-PROMPT-03
  - ARCH-PROMPT-04
  - ARCH-PROMPT-05
  - ARCH-PROMPT-06
  - ARCH-PROMPT-07
  - ARCH-PROMPT-08
  - ARCH-PROMPT-09
must_haves:
  truths:
    - "ARCHITECT_PROMPT contains 7 numbered sections: disponibilidad, taxonomia de roles, checklist heartbeat, plantillas, few-shot, iterator, rules index"
    - "Section 1 enumerates input fields: goal, tasks[], resources.catPaws[], resources.connectors[], resources.skills[], resources.canvas_similar[], resources.templates[]"
    - "Section 2 lists the 7 roles from ROLE_TAXONOMY"
    - "Section 3 describes the 6-step heartbeat checklist"
    - "Section 4 contains INPUT/PROCESO/OUTPUT templates for transformer, renderer, emitter"
    - "Section 5 contains at least 2 few-shot MALO→BUENO pairs including emitter-as-agent"
    - "Section 6 contains an iterator flow_data template literal"
    - "Section 7 keeps {{RULES_INDEX}} placeholder"
    - "Prompt JSON schema requires data.role in each node and defines needs_cat_paws[{name, mode:'processor', system_prompt, skills_sugeridas, conectores_necesarios}]"
  artifacts:
    - path: "app/src/lib/services/catbot-pipeline-prompts.ts"
      provides: "ARCHITECT_PROMPT rewritten with 7 sections + needs_cat_paws schema"
      contains: "ARCHITECT_PROMPT"
    - path: "app/src/lib/__tests__/catbot-pipeline-prompts.test.ts"
      provides: "Unit tests asserting each of the 7 sections + schema invariants"
      contains: "ARCHITECT_PROMPT"
  key_links:
    - from: "catbot-pipeline-prompts.ts ARCHITECT_PROMPT"
      to: "canvas-flow-designer.ts ROLE_TAXONOMY"
      via: "7 role names listed in Section 2 must match ROLE_TAXONOMY exactly"
      pattern: "extractor.*transformer.*synthesizer.*renderer.*emitter.*guard.*reporter"
    - from: "catbot-pipeline-prompts.ts ARCHITECT_PROMPT"
      to: "{{RULES_INDEX}}"
      via: "placeholder replaced at render-time by intent-job-executor.ts"
      pattern: "\\{\\{RULES_INDEX\\}\\}"
---

<objective>
Rewrite `ARCHITECT_PROMPT` in `catbot-pipeline-prompts.ts` into the 7-section heartbeat structure specified by ARCH-PROMPT-01..09. The prompt must force the LLM to (a) declare `data.role` per node, (b) use real UUIDs from `resources.catPaws[]` OR emit `needs_cat_paws[]` with the new 5-field schema, and (c) follow a 6-step checklist that covers role → emitter/contract → iterator → agent+tools → data chain → needs_cat_paws fallback.

Purpose: The prompt is the surface where Phase 134's enriched data finally changes LLM behavior. Phase 134 showed the data arrives; Phase 135 makes the model consume it. Covers 9 of the 14 ARCH-PROMPT requirements.
Output: New ARCHITECT_PROMPT constant with 7 sections + companion unit tests green. CANVAS_QA_PROMPT is untouched here (plan 03 handles it).
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/135-architect-prompt-layer-arch-prompt/135-01-role-taxonomy-and-validator-PLAN.md
@app/src/lib/services/catbot-pipeline-prompts.ts
@app/src/lib/services/canvas-flow-designer.ts
@app/src/lib/services/canvas-connector-contracts.ts
@app/src/lib/__tests__/catbot-pipeline-prompts.test.ts
@app/data/knowledge/canvas-rules-index.md

<interfaces>
From plan 135-01 (wave 1):
```typescript
export const ROLE_TAXONOMY = [
  'extractor','transformer','synthesizer','renderer','emitter','guard','reporter',
] as const;
```
Import in tests via `import { ROLE_TAXONOMY } from '@/lib/services/canvas-flow-designer'`.

From Phase 134 ARCH-DATA (already shipped):
- `resources.catPaws[]` items: `{paw_id, paw_name, paw_mode, tools_available[], skills[], best_for}` — paw_id is a real UUID from cat_paws table
- `resources.connectors[]` items: `{connector_id, connector_type, contracts: {accion: {required_fields, optional_fields, description}}}`
- `resources.canvas_similar[]` top-3, `resources.templates[]`
- `canvas-rules-index.md` already has `[scope: role]` annotations on R10/R15/R02/SE01

Existing ARCHITECT_PROMPT (lines 26-73 of catbot-pipeline-prompts.ts) is the starting point to REPLACE, not augment. Keep `{{RULES_INDEX}}` as Section 7.

Canonical failure case (holded-q1, from 134-VERIFICATION.md soft gap): architect emitted `agentId='analista-financiero-ia'` (slug, not UUID) for a transformer role. Few-shot MALO→BUENO must explicitly cover this: MALO = fabricated slug, BUENO = declare `needs_cat_paws[{name:'analista-financiero-ia', mode:'processor', ...}]` instead.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rewrite ARCHITECT_PROMPT into 7 sections + structural tests</name>
  <files>app/src/lib/services/catbot-pipeline-prompts.ts, app/src/lib/__tests__/catbot-pipeline-prompts.test.ts</files>
  <behavior>
    Tests added to catbot-pipeline-prompts.test.ts (describe block `ARCHITECT_PROMPT v135 (ARCH-PROMPT-01..09)`):
    - `ARCHITECT_PROMPT` contains marker headings `## 1.`, `## 2.`, `## 3.`, `## 4.`, `## 5.`, `## 6.`, `## 7.` (7 sections present)
    - Section 1 mentions each of: 'goal', 'tasks', 'resources.catPaws', 'resources.connectors', 'resources.skills', 'resources.canvas_similar', 'resources.templates'
    - Section 2 contains all 7 ROLE_TAXONOMY entries literally: extractor, transformer, synthesizer, renderer, emitter, guard, reporter
    - Section 3 mentions each of the 6 heartbeat steps by keyword: 'clasifica rol', 'emitter', 'contract', 'iterator', 'CatPaw', 'tools', 'cadena de datos', 'needs_cat_paws'
    - Section 4 contains the literal tokens 'INPUT:', 'PROCESO:', 'OUTPUT:' and headings for 'transformer', 'renderer', 'emitter'
    - Section 5 contains at least two 'MALO' and two 'BUENO' markers; contains the emitter-as-agent word 'emitter' near a MALO block
    - Section 5 contains the string 'analista-financiero-ia' OR explicit mention of the fabricated-agentId anti-pattern
    - Section 6 contains the literal tokens 'iterator' and a JSON-looking fragment with 'nodes' and 'edges'
    - Section 7 contains the literal `{{RULES_INDEX}}` placeholder (single occurrence, placeholder preserved)
    - JSON output schema section mentions `"data"` with `"role"` and lists all 7 roles as allowed values
    - JSON output schema includes `needs_cat_paws` with keys `name`, `mode`, `system_prompt`, `skills_sugeridas`, `conectores_necesarios` (all 5)
    - The prompt explicitly forbids inventing agentIds — contains text matching /no inventes|NO inventes|prohibido inventar/i AND /paw_id/
  </behavior>
  <action>
Replace the existing `ARCHITECT_PROMPT` export (lines 26-73) in `app/src/lib/services/catbot-pipeline-prompts.ts` with a template-literal string that implements the 7-section structure. Keep preceding/following exports (STRATEGIST_PROMPT, DECOMPOSER_PROMPT, CANVAS_QA_PROMPT, AGENT_AUTOFIX_PROMPT) UNCHANGED — plan 03 handles CANVAS_QA_PROMPT.

Draft structure (each section heading must be on its own line starting with `## N.`):

```
Eres el Pipeline Architect de CatFlow. Construyes un canvas ejecutable siguiendo un checklist heartbeat estricto. No improvisas: cada decisión se apoya en `resources` (inventario real) y en el rules index.

## 1. Lo que tienes disponible (input)
Recibes un objeto JSON con:
- `goal`: string, objetivo refinado del strategist
- `tasks`: array de tareas del decomposer con {id, name, description, depends_on, expected_output}
- `resources.catPaws[]`: inventario REAL de CatPaws activos con {paw_id (UUID), paw_name, paw_mode, tools_available[], skills[], best_for}
- `resources.connectors[]`: inventario REAL de connectors con {connector_id, connector_type, contracts}
- `resources.skills[]`: skills disponibles
- `resources.canvas_similar[]`: top-3 canvases parecidos (reusa patrones)
- `resources.templates[]`: templates con estructura de nodos
- `qa_report` / `previous_design`: SOLO en iteraciones > 0, son el feedback del reviewer — corrige los issues

NUNCA inventes `paw_id`. Si necesitas un CatPaw que NO está en `resources.catPaws[]`, usa `needs_cat_paws` (ver sección 3, paso 6).

## 2. Taxonomía de roles funcionales (compartida con el reviewer)
Cada nodo del `flow_data` DEBE declarar `data.role` en uno de estos 7 valores:
- **extractor**: saca datos de una fuente externa (MCP, Drive, Gmail read). NO transforma.
- **transformer**: modifica el shape de un JSON preservando campos no tocados (R10).
- **synthesizer**: combina múltiples arrays/objetos en uno nuevo. Sujeto a R10 si enriquece.
- **renderer**: produce el payload declarativo final para el emitter (accion_final, report_to, results[]).
- **emitter**: efecto lateral terminal (send_email, write_drive, post_http). R10 NO aplica.
- **guard**: condition/checkpoint que filtra el flujo. R10 NO aplica.
- **reporter**: storage/output de post-mortem. R10 NO aplica.

El reviewer (CANVAS_QA_PROMPT) aplica R10 SOLO a nodos con `role ∈ {transformer, synthesizer}`. Declarar role mal hace fallar el QA.

## 3. Checklist heartbeat (6 pasos, uno por tarea del decomposer)
Recorre `tasks` en orden de dependencias y para cada tarea:
1. **Clasifica rol**: elige el role de la taxonomía (sección 2) según qué hace la tarea.
2. **Si es emitter**: busca en `resources.connectors[]` el contract de la acción (ej. gmail.send_report) y declara `required_fields` en las instructions del nodo.
3. **Si produce o consume un array >1 items con tool-calling interno**: envuélvelo en un `iterator` (ver sección 6, regla R14/R02).
4. **Si es agent**: busca en `resources.catPaws[]` un paw cuyo `best_for` o `skills` cubra la tarea. Copia el `paw_id` EXACTO (es un UUID). Menciona por nombre las `tools_available` que va a usar dentro de las instructions.
5. **Valida la cadena de datos**: los campos OUTPUT del nodo N deben aparecer como INPUT en el nodo N+1 con el MISMO nombre canónico (R13).
6. **Si ningún CatPaw encaja**: NO inventes un slug. Emite una entrada en `needs_cat_paws[]` con el schema completo (ver sección de output) y cierra el flujo usando un placeholder `type:'agent'` cuyo `data.agentId` quede como string vacío — el sistema pausará en `awaiting_user` para que el usuario apruebe la creación.

## 4. Plantillas copiables de instructions por rol
Cada instructions DEBE seguir este formato:

### transformer
INPUT: {campo1, campo2, ...}
PROCESO: [1-3 líneas describiendo la transformación]
OUTPUT: {campo1, campo2, ..., nuevo_campo}
REGLA: Devuelve el MISMO array/objeto, preserva TODOS los campos de entrada, añade solo los nuevos (R10).

### renderer
INPUT: {campoA, campoB, results_array}
PROCESO: Construye el payload final para el emitter downstream.
OUTPUT: {accion_final, destinatario_o_target, subject_o_path, results[], template_id}
REGLA: Los field names deben coincidir 1:1 con los required_fields del connector downstream (sección 1 del input: resources.connectors[].contracts).

### emitter
INPUT: {todos los required_fields del contract}
PROCESO: Ejecuta la acción (NO la describe — el connector la ejecuta vía canvas-executor).
OUTPUT: {status, external_id (cuando aplica)}
REGLA: R10 NO aplica. No transforma. Si el contract pide 'report_to', el upstream renderer DEBE haberlo producido.

## 5. Few-shot MALO → BUENO

### Caso 1 — emitter-as-agent (holded-q1 original failure)
MALO:
```
{ "id":"n5", "type":"agent", "data":{"agentId":"gmail-sender","role":"emitter","instructions":"Envía el email a antonio@..."} }
```
Razón del fallo: un emitter NO es un agent — es un connector. El canvas-executor no dispara envío de email desde `type:'agent'`.

BUENO:
```
{ "id":"n5", "type":"connector", "data":{"connectorId":"<uuid-gmail-real>","role":"emitter","instructions":"INPUT:{accion_final,report_to,report_subject,results,template_id}\nPROCESO: Enviar email vía Gmail\nOUTPUT:{status,message_id}"} }
```

### Caso 2 — fabricated agentId slug (holded-q1 soft gap)
MALO:
```
{ "id":"n3", "type":"agent", "data":{"agentId":"analista-financiero-ia","role":"transformer","instructions":"..."} }
```
Razón del fallo: "analista-financiero-ia" es un slug inventado. El validador determinístico rechaza el canvas sin llamar al LLM del QA.

BUENO (opción A — hay un paw real):
```
{ "id":"n3", "type":"agent", "data":{"agentId":"<paw_id UUID desde resources.catPaws[]>","role":"transformer","instructions":"INPUT:{...}\nPROCESO:...\nOUTPUT:{...}"} }
```
BUENO (opción B — no hay paw real): emite `needs_cat_paws` (ver sección 3 paso 6).

## 6. Patrón iterator copiable
Cuando un nodo upstream produce un array >1 items y el siguiente paso necesita tool-calling per-item, envuélvelo:

```
{
  "nodes": [
    { "id":"n_iter", "type":"iterator", "data":{"role":"transformer","instructions":"INPUT:{items[]}\nPROCESO: Por cada item, invoca el body subflow\nOUTPUT:{items[] con campos añadidos}"} },
    { "id":"n_body", "type":"agent", "data":{"agentId":"<paw_id>","role":"transformer","instructions":"..."} }
  ],
  "edges": [
    { "id":"e1", "source":"n_iter", "target":"n_body" },
    { "id":"e2", "source":"n_body", "target":"n_iter" }
  ]
}
```

## 7. Rules index (lookup on-demand)
{{RULES_INDEX}}

Si una regla (R01, R10, SE01, DA01, ...) necesita más detalle del que da su línea del index, puedes pedirlo incluyendo `needs_rule_details: ["R10","R13"]` junto a tu flow_data preliminar. Recibirás una segunda llamada (expansion pass) con `expanded_rules` y deberás devolver el flow_data definitivo. Usa este mecanismo solo si es estrictamente necesario.

## Output esperado (SOLO JSON, sin prosa)
{
  "name": "Nombre del canvas <50 chars",
  "description": "Descripcion <200 chars",
  "flow_data": {
    "nodes": [
      {
        "id": "n1",
        "type": "agent|connector|iterator|condition|start|...",
        "data": {
          "role": "extractor|transformer|synthesizer|renderer|emitter|guard|reporter",
          "agentId": "<uuid real o vacío si needs_cat_paws>",
          "connectorId": "<uuid real cuando type=connector>",
          "instructions": "INPUT:{...}\nPROCESO: ...\nOUTPUT:{...}"
        },
        "position": {"x":100,"y":100}
      }
    ],
    "edges": [{ "id":"e1", "source":"n1", "target":"n2" }]
  },
  "needs_cat_paws": [
    {
      "name": "analista-financiero-ia",
      "mode": "processor",
      "system_prompt": "ROL: ...\nMISIÓN: ...\nPROCESO: ...\nOUTPUT: ...",
      "skills_sugeridas": ["skill_id_1","skill_id_2"],
      "conectores_necesarios": ["connector_id_1"]
    }
  ],
  "needs_rule_details": ["R10"]
}

Reglas duras:
- NO inventes paw_id. Usa SIEMPRE el valor literal de `resources.catPaws[].paw_id` o emite needs_cat_paws.
- Cada nodo DEBE tener `data.role` en uno de los 7 valores.
- El reviewer determinístico rechaza sin gastar tokens si faltan estas invariantes.
```

Then add the test block described in `<behavior>` to `catbot-pipeline-prompts.test.ts`. Import ROLE_TAXONOMY from canvas-flow-designer and assert each role appears in the prompt. Use `.toMatch()` / `.toContain()` / regex assertions.

Run the test file.

Constraints:
- Do NOT touch CANVAS_QA_PROMPT (plan 03 owns it)
- Do NOT touch any file outside the two listed
- Keep `{{RULES_INDEX}}` as a LITERAL `{{RULES_INDEX}}` — intent-job-executor.ts line 430 does `replace('{{RULES_INDEX}}', rulesIndex)`
- Use `process['env']` bracket notation if adding any env access (not expected)
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/catbot-pipeline-prompts.test.ts 2>&1 | tail -30</automated>
  </verify>
  <done>ARCHITECT_PROMPT has 7 numbered sections; all 7 ROLE_TAXONOMY roles appear in Section 2; Section 5 contains both MALO→BUENO cases including the 'analista-financiero-ia' anti-pattern; JSON output schema requires `data.role` and declares `needs_cat_paws` with the 5 fields; `{{RULES_INDEX}}` placeholder preserved; all existing 18 + new ~12 tests GREEN in catbot-pipeline-prompts.test.ts.</done>
</task>

</tasks>

<verification>
- catbot-pipeline-prompts.test.ts fully green (existing 18 ARCH-DATA tests + new structural tests)
- `grep -c "^## [1-7]\\." app/src/lib/services/catbot-pipeline-prompts.ts` shows 7
- `grep -c "{{RULES_INDEX}}" app/src/lib/services/catbot-pipeline-prompts.ts` shows exactly 1 (inside ARCHITECT_PROMPT only; CANVAS_QA_PROMPT also has one so total 2)
- CANVAS_QA_PROMPT unchanged (diff shows only ARCHITECT_PROMPT block modified)
</verification>

<success_criteria>
ARCHITECT_PROMPT rewritten with 7 sections, heartbeat checklist, role taxonomy, templates, few-shot, iterator, rules index placeholder. Output schema requires data.role per node and declares needs_cat_paws with {name, mode, system_prompt, skills_sugeridas, conectores_necesarios}. Tests green. 9/14 requirements closed.
</success_criteria>

<output>
After completion, create `.planning/phases/135-architect-prompt-layer-arch-prompt/135-02-SUMMARY.md`
</output>
</content>
</invoke>