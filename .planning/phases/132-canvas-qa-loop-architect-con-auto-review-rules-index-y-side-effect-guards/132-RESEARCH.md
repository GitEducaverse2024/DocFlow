# Phase 132: Canvas QA Loop — Research

**Researched:** 2026-04-10
**Domain:** LLM pipeline quality assurance (rules index + auto-review loop + side-effect guards + runtime auto-repair) layered on top of Phase 130's `IntentJobExecutor` and `canvas-executor.ts`
**Confidence:** HIGH

## Summary

Phase 132 is a **quality uplift** on top of Phase 130's 3-phase pipeline. Zero new dependencies, zero new node types, zero changes to `canvas-executor.ts` core. Everything is:

1. Two new markdown/prompt files (`canvas-rules-index.md` + rewritten `ARCHITECT_PROMPT` + new `CANVAS_QA_PROMPT`)
2. One new internal function (`getCanvasRule`) — NOT a LLM tool, called by the architect phase via a second direct LLM call pattern
3. One post-processor (`insertSideEffectGuards`) added to `canvas-flow-designer.ts`
4. One new service (`canvas-auto-repair.ts`) triggered from the condition node's `no` branch via a *reporter agent node* (reuses existing `agent` node type with `agentId=null` + inline `systemPrompt`)
5. A state machine change inside `IntentJobExecutor.runFullPipeline()` to loop architect↔QA up to 2 iterations

The critical insight is that every mechanism already has a 1:1 precedent in the codebase. Condition nodes already run via LLM (canvas-executor.ts:1392-1413). Agent nodes already support inline LLM execution when `agentId=null` (canvas-executor.ts:461-537). `log_knowledge_gap` is already always-allowed and takes exactly 3 fields (`knowledge_path`, `query`, `context`). The QA loop is just two more `callLLM()` calls like the strategist/decomposer/architect phases — same `response_format: json_object`, same parser.

**Primary recommendation:** Implement exactly as the 4 plans suggest. Plan 01 = index + `getCanvasRule` (pure additions + tests). Plan 02 = prompt rewrite + `CANVAS_QA_PROMPT` + loop in `runFullPipeline()`. Plan 03 = `insertSideEffectGuards` + `canvas-auto-repair.ts` service + wire into condition-node `no`-branch reporter. Plan 04 = Holded Q1 oracle E2E.

The single hardest subsystem is **Plan 03 runtime auto-repair**: the reporter node must call `canvas-auto-repair.ts` (new service), which updates `canvases.flow_data` mid-run and signals the executor to re-execute from the first affected node. The cleanest integration point is making the reporter a regular agent node with inline `systemPrompt`, whose instructions say "call `attempt_node_repair` tool with {failed_node_id, guard_report}" — where `attempt_node_repair` is a new permission-less internal tool wired only for reporter nodes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Index escalable, no inyección completa.** El architect NO recibe los 4KB de canvas.json + catflow.json. Recibe un index de ~2KB con referencias (`R01: descripción corta (max 100 chars)`). Si necesita detalle, llama `get_canvas_rule(rule_id)` en una segunda pasada. Escalable: mañana añades 200 reglas y el prompt base no crece.

- **Side effects detección automática (decisión del usuario documentada).** Nodo es destructivo si cumple CUALQUIERA:
  1. `connector` con `data.mode`/`data.action` matching regex `^(send|create|update|delete|upload|invoke|write|execute|publish|post|put|patch)`.
     - Subtipos: Gmail `send_email`/`send_reply`/`mark_read`/`mark_unread`/`delete`/`trash`; Drive `upload`/`create_folder`/`delete`/`rename`/`update_file`; Holded HTTP != GET; n8n todos; SMTP todos.
  2. `agent` con `data.extraConnectors` que incluya algún connector con modes destructivos, o `data.skills` con skill `has_side_effects: true`.
  3. `storage` — siempre side effect.
  4. `multiagent` — siempre side effect.
  Implementado como `isSideEffectNode(node, catalog)` puro en `canvas-flow-designer.ts`.

- **Comportamiento ante `guard.no` — Opción C: CatBot auto-repara 1 reintento.**
  1. Primer fallo: canvas NO envía side effect. Pausa nodo `waiting-for-repair`. Llama CatBot con `AGENT_AUTOFIX_PROMPT`. CatBot devuelve `{fixed_instructions, reason}` o `{repair_failed, reason}`. Si fix → update flow_data + re-ejecuta desde primer nodo afectado. Marca `repair_attempt=1`.
  2. Segundo fallo tras retry: `status='failed'`, `log_knowledge_gap` con knowledge_path=`catflow/design/data-contract`, notify al canal original.

- **QA loop max 2 iteraciones.**
  ```
  iter 0: architect → canvas_v0 → QA → {accept | revise|reject → iter 1}
  iter 1: architect(feedback=qa_report_0) → canvas_v1 → QA → {accept | reject → FAIL + log_knowledge_gap}
  ```
  Max 4 LLM calls (2 architect + 2 QA) antes de rendirse.

- **Rules index format: markdown plano agrupado**, `app/data/knowledge/canvas-rules-index.md`. ~40 líneas, ~1.5KB. Editable manualmente.

- **ARCHITECT_PROMPT rewrite** ~40 líneas: index inline + instrucción "si necesitas detalle, llama get_canvas_rule(rule_id) ANTES de diseñar" + data contracts explícitos + antipatrones DA01-DA04 + mención del QA review.

- **CANVAS_QA_PROMPT** devuelve JSON con `quality_score`, `issues[]`, `data_contract_analysis`, `recommendation: accept|revise|reject`.

- **Reporter nodes son agent nodes normales con `agentId=null` + `systemPrompt` inline**. `data.model='gemini-main'`, `data.tools=['log_knowledge_gap']`. NO inventa tipos de nodo nuevos.

- **Auto-repair helper**: `app/src/lib/services/canvas-auto-repair.ts` exporta `attemptNodeRepair(canvasRun, failedNodeId, guardReport)`. Lee canvas + node_states, identifica upstream, llama LLM con `AGENT_AUTOFIX_PROMPT`, fix → UPDATE canvases + UPDATE canvas_runs status='running' + re-ejecuta; fail → devuelve error estructurado para que caller pueda log_knowledge_gap.

### Claude's Discretion

- Exact wording/length de `CANVAS_QA_PROMPT` (target <1000 chars system content).
- Exact shape del JSON de `get_canvas_rule` (recommendation: `{rule_id, short, long, category, examples?}`).
- Donde vive `getCanvasRule`: recomendación Option B — función interna del módulo `canvas-rules.ts`, llamada directamente por el architect phase via pre-call fetch (NO expuesta a CatBot como tool normal).
- Donde vive `attemptNodeRepair`: nuevo archivo `canvas-auto-repair.ts`, importado por `canvas-executor.ts` solo cuando un reporter node se activa (no en el hot path normal).
- Temperatura de las QA/repair LLM calls (recommendation: 0.2 factual, consistent con strategist/decomposer).
- Exact wording del `AGENT_AUTOFIX_PROMPT` — recommendation: <500 chars, pide JSON estricto.
- Exact threshold de `quality_score` que mapea a `accept` vs `revise` (recommendation: usa `recommendation` field directamente, ignora score excepto para logs).

### Deferred Ideas (OUT OF SCOPE)

- UI de edición de reglas del index (markdown plano, el admin edita con editor).
- Dashboard de postmortems de canvases fallidos.
- Métricas de precision del QA reviewer.
- ML para auto-ajustar reglas según historial.
- Multi-iteration beyond 2.
- QA reviewer usando modelo distinto (usa mismo gemini-main).
- Reescribir canvas executor.
- Nuevos tipos de nodo.
- UI de edición de reglas.
- Checkpoint humano obligatorio.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QA2-01 | `canvas-rules-index.md` existe con >=25 reglas ref-able por id, cada una <=100 chars | Extracción verbatim de las 25 Golden Rules R01-R25 del catalog + 3 SE01-SE03 nuevas + 4 DA01-DA04 nuevas = 32 reglas. Ver sección "Rules Index: Contenido Exacto" abajo. |
| QA2-02 | Tool/función interna `get_canvas_rule(rule_id)` devuelve detalle completo de una regla | Nuevo módulo `app/src/lib/services/canvas-rules.ts` con función `getCanvasRule(ruleId)` que lee `canvas-nodes-catalog.md` y extrae la sección correspondiente. NO es tool de CatBot (no aparece en TOOLS[]). Ver "Módulo canvas-rules.ts" abajo. |
| QA2-03 | ARCHITECT_PROMPT reescrito con index en vez de detalle — escalable | Reemplaza `ARCHITECT_PROMPT` en `catbot-pipeline-prompts.ts` (líneas 19-42). Nuevo prompt ~40 líneas con index inline. Ver "ARCHITECT_PROMPT Rewrite" abajo. |
| QA2-04 | `CANVAS_QA_PROMPT` analiza canvas y devuelve JSON estricto | Nueva constante `CANVAS_QA_PROMPT` en `catbot-pipeline-prompts.ts`. Devuelve `{quality_score, issues, data_contract_analysis, recommendation}`. Ver "CANVAS_QA_PROMPT" abajo. |
| QA2-05 | `IntentJobExecutor.runFullPipeline` implementa loop architect→QA max 2 iter | Modifica `runFullPipeline()` en `intent-job-executor.ts:164-202`. Añade una sub-rutina `runArchitectQALoop(job, goal, tasks, resources)` que hace hasta 2 iteraciones. Ver "QA Loop State Machine" abajo. |
| QA2-06 | `insertSideEffectGuards(flowData)` post-procesa canvas detectando nodos destructivos | Nueva función exportada en `canvas-flow-designer.ts`. Llamada desde `finalizeDesign()` DESPUÉS de `validateFlowData()` y ANTES de `INSERT INTO canvases`. Ver "insertSideEffectGuards" abajo. |
| QA2-07 | Runtime: cuando guard false, agent reportador llama CatBot para ajustar instructions y reintenta 1 vez | Reporter agent node con `agentId=null` + `systemPrompt` inline + `data.tools=['attempt_node_repair']`. El tool `attempt_node_repair` (nuevo, permission-less, SOLO para reporter nodes) llama `canvas-auto-repair.ts:attemptNodeRepair()`. Ver "Auto-Repair Service" abajo. |
| QA2-08 | Si auto-repair falla 2a vez → canvas failed + log_knowledge_gap + notify | `attemptNodeRepair()` devuelve `{success: false, reason}` → reporter node llama `log_knowledge_gap` con `knowledge_path='catflow/design/data-contract'` + `createNotification({type: 'canvas_repair_failed'})`. Reusa patrón de Phase 130 notificaciones. |
</phase_requirements>

## Standard Stack

### Core (zero new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | existing | `canvas_runs.metadata` para trackear `repair_attempt` por nodo | Same DB; zero new tables |
| vitest | existing | Unit tests para rules parser, isSideEffectNode, insertSideEffectGuards, QA parser, loop con mocks | Project test framework |
| LiteLLM (native fetch) | existing | Llamadas QA + auto-repair reusando `IntentJobExecutor.callLLM` pattern | Same pattern as Phase 130 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `logger` (@/lib/logger) | existing | Cada iteración del loop + cada repair attempt | Source: `'intent-job-executor'` y `'canvas-auto-repair'` (reusa `'canvas'` LogSource) |
| `generateId` (@/lib/utils) | existing | IDs de guard nodes, reporter nodes | Consistent with canvas-flow-designer patterns |
| `createNotification` | existing from `notifications.ts` | Notify usuario cuando auto-repair falla | Reusa tipo existente o añade `canvas_repair_failed` |
| `logKnowledgeGap` / `log_knowledge_gap` tool | existing Phase 126 | Logging de fallos irreparables | catbot-tools.ts:910-921, always_allowed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `get_canvas_rule` como función interna | Exponer como tool normal de CatBot | +Visible pero inflate tool catalog innecesariamente. El architect phase no es el loop de CatBot, es un callLLM directo — no necesita el TOOLS[] array. **Elegir Option B (función interna)**. |
| Reporter como agent node con `agentId=null` | Inventar tipo `reporter` nuevo | Romper invariant VALID_NODE_TYPES, forzar case nuevo en canvas-executor switch. Agent node ya soporta inline mode (canvas-executor.ts:461-537 maneja `data.model`). **Elegir reutilizar agent node**. |
| `attempt_node_repair` como tool permission-less visible sólo en reporters | Llamar `canvas-auto-repair.ts` directamente desde canvas-executor | El tool approach mantiene la separación LLM-vs-code (R20, R23) porque el reporter node es un LLM que "decide" reparar; el tool es el actuator. Más limpio de testear. |
| Store repair_attempt en `canvas_runs.metadata` JSON | Nueva columna | Zero schema changes, metadata JSON ya existe (canvas-executor.ts:1500-1512, 1802) para iterator_state y scheduler count. **Reusar metadata pattern**. |

**Installation:** N/A. Todo pure TypeScript en archivos nuevos o modificaciones de existentes.

## Architecture Patterns

### Recommended File Structure
```
app/
├── data/
│   └── knowledge/
│       └── canvas-rules-index.md          # NEW — Plan 01 (~40 lines, ~1.5KB)
└── src/
    └── lib/
        └── services/
            ├── canvas-rules.ts             # NEW — Plan 01 (getCanvasRule internal function)
            ├── canvas-rules.test.ts        # NEW — Plan 01
            ├── canvas-flow-designer.ts     # MODIFIED — Plan 03 (add isSideEffectNode + insertSideEffectGuards)
            ├── canvas-flow-designer.test.ts # MODIFIED — Plan 03
            ├── catbot-pipeline-prompts.ts  # MODIFIED — Plan 02 (ARCHITECT_PROMPT rewrite + CANVAS_QA_PROMPT + AGENT_AUTOFIX_PROMPT)
            ├── intent-job-executor.ts      # MODIFIED — Plan 02 (runFullPipeline → runArchitectQALoop)
            ├── intent-job-executor.test.ts # MODIFIED — Plan 02
            ├── canvas-auto-repair.ts       # NEW — Plan 03 (attemptNodeRepair function)
            ├── canvas-auto-repair.test.ts  # NEW — Plan 03
            └── catbot-tools.ts             # MODIFIED — Plan 03 (add attempt_node_repair internal tool)
```

### Pattern 1: Post-processor on validated flow_data
**What:** Take the validated architect output, walk the nodes, and surgically insert guard+reporter pairs before every side-effect node.
**When to use:** After `validateFlowData` passes, before `INSERT INTO canvases`.
**Example:**
```typescript
// Source: canvas-flow-designer.ts (existing pattern extended)
const validation = validateFlowData(design.flow_data);
if (!validation.valid) { /* fail */ }

// NEW Plan 03:
const guarded = insertSideEffectGuards(design.flow_data as FlowData);
// guarded contains the original nodes + new guard/reporter nodes + rewired edges

db.prepare(`INSERT INTO canvases ...`).run(canvasId, ..., JSON.stringify(guarded));
```

### Pattern 2: Iteration loop with feedback (extends runFullPipeline)
**What:** Wrap architect call in a loop that injects QA feedback into each subsequent architect call.
**When to use:** Replace the single architect call in runFullPipeline (intent-job-executor.ts:191-199).
**Example:** See "QA Loop State Machine" section below.

### Pattern 3: Reporter-driven auto-repair (reuse agent inline mode)
**What:** The guard's `no` branch feeds into a regular `agent` node with no CatPaw (just inline model+systemPrompt) whose LLM has one permission-less tool `attempt_node_repair`. The LLM reads the failed context, calls the tool, the tool calls the repair service.
**When to use:** Downstream of every guard condition inserted by `insertSideEffectGuards`.
**Example:**
```typescript
// Reporter node shape (auto-generated):
{
  id: `reporter-${sideEffectNodeId}`,
  type: 'agent',
  position: { x, y: y + 120 },
  data: {
    agentId: null,
    agentName: 'Auto-Reparador',
    model: 'gemini-main',
    instructions: 'Un guard condicional ha fallado justo antes de un nodo con side effects. Revisa el contexto y llama attempt_node_repair con el node_id fallido. Si la reparación también falla, llama log_knowledge_gap y detén el flujo.',
    tools: ['attempt_node_repair', 'log_knowledge_gap'],
    auto_inserted: true,  // marker for tests + debugging
    target_node_id: sideEffectNodeId,
  }
}
```

### Anti-Patterns to Avoid
- **Don't extend VALID_NODE_TYPES**: keep the invariant. Reporter is just an `agent` node.
- **Don't rewrite canvas-executor.ts core**: the condition node + agent node cases already do 100% of what's needed.
- **Don't add `get_canvas_rule` to TOOLS[]**: it's not a user-visible tool, it's a module function called inside the architect phase (pre-call, not tool-loop).
- **Don't block the tick on LLM call for auto-repair**: repair flow runs inside the regular canvas executor node execution, which already tolerates long LLM calls.
- **Don't extend LogSource**: reuse `'intent-job-executor'` and `'canvas'` (Phase 131 lesson).
- **Don't inflate prompt base**: the whole point of the index is <2KB. If you add 10 rules, descriptions stay <=100 chars each.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parse architect LLM output | Custom JSON5 parser | Existing `parseJSON` helper in intent-job-executor.ts:356-367 | Handles markdown fences + fallback already |
| Condition node runtime evaluation | New executor branch | Existing condition case (canvas-executor.ts:1392-1413) | Already runs LLM + skips branches |
| Agent node inline LLM | New executor branch | Existing agent case handling `agentId=null` (canvas-executor.ts:461-537) | Already handles inline model/instructions |
| Cross-channel notification | Custom notifier | `createNotification` from `@/lib/services/notifications` | Phase 130 pattern |
| Knowledge gap persistence | New table | Existing `knowledge_gaps` table + `log_knowledge_gap` tool | catbot-db.ts:103-111, catbot-tools.ts:910-921 |
| Track repair attempt count per node | New column | `canvas_runs.metadata` JSON object `{ repair_attempts: { [nodeId]: N } }` | metadata pattern already used for iterator_state + scheduler |
| Expose internal tool to LLM | Extend permission system | Gate `attempt_node_repair` on `data.auto_inserted === true` predecessor check | Zero permission bloat |

**Key insight:** Every moving part already has a precedent. Phase 132 is 80% prompts/markdown + 20% wiring. There is literally no "infrastructure" to build.

## Common Pitfalls

### Pitfall 1: Prompt inflation
**What goes wrong:** ARCHITECT_PROMPT grows beyond ~2KB because you paste rules verbatim instead of index lines.
**Why it happens:** Copy-paste from canvas-nodes-catalog.md (which has verbose rules).
**How to avoid:** Each rule in the index MUST be <=100 chars, single line. Verify with a test that splits lines and asserts `.length <= 100`.
**Warning signs:** Prompt file size > 3KB.

### Pitfall 2: QA loop infinite retry
**What goes wrong:** QA always returns `revise`, architect never produces acceptable canvas, loop runs forever.
**Why it happens:** Forgot to enforce max 2 iterations with a counter.
**How to avoid:** Hard-coded `MAX_QA_ITERATIONS = 2` constant. After iter 1 if still not accept → fail with log_knowledge_gap. Unit test with mocked LLM always returning revise.
**Warning signs:** Jobs stuck in `pipeline_phase='architect'` with `updated_at` growing.

### Pitfall 3: Guard insertion breaks iterators
**What goes wrong:** Side-effect node is inside an iterator loop body. Inserting a guard/reporter changes edge structure in a way that breaks the iterator_end pairing.
**Why it happens:** Iterator uses `iterator_end.iteratorId` field + executor special-cases iterator re-runs.
**How to avoid:** When inserting guards inside an iterator's loop body, the reporter's `no` branch must terminate at a regular `output` node (NOT try to re-enter the iterator). Skip guard insertion for nodes that are BOTH inside an iterator AND have an Iterator End downstream — those are loop-local side effects where the iterator's error-capture pattern (ITER-03) handles them.
**Warning signs:** Iterator End emits partial results with `status: error`.

### Pitfall 4: Reporter node infinite loop
**What goes wrong:** Reporter node activates auto-repair, repair updates flow_data, executor re-runs, guard fails again, reporter activates auto-repair...
**Why it happens:** No counter on repair_attempt.
**How to avoid:** Track `canvas_runs.metadata.repair_attempts[failedNodeId]` — if `>= 1` on entry to `attemptNodeRepair`, skip repair and go straight to `log_knowledge_gap` path.
**Warning signs:** `canvas_runs` stuck in `running` with same `current_node_id`.

### Pitfall 5: Side-effect detection false positives
**What goes wrong:** A `connector` node with `data.tool_name='search_people'` (LinkedIn MCP read-only) gets flagged as side-effect because `search` doesn't match the allow-list but isn't in the deny regex.
**Why it happens:** The regex is conservative (deny-list approach).
**How to avoid:** The regex only matches destructive verb prefixes: `^(send|create|update|delete|upload|invoke|write|execute|publish|post|put|patch)`. Verbs like `search`, `list`, `get`, `read`, `find`, `query` don't match. HTTP API nodes: check `connector.type === 'http_api'` AND parse `data.body_template` for method; if `method: 'GET'` → NOT side effect.
**Warning signs:** Guards inserted before read-only operations.

### Pitfall 6: Connector mode lives in predecessor JSON, not data.mode
**What goes wrong:** Gmail connector uses `accion_final` inside the predecessor JSON (canvas-executor.ts:660), NOT `data.mode`. Storage uses `data.storage_mode`. HTTP uses body_template.
**Why it happens:** There's no uniform `data.mode` field across all connector types.
**How to avoid:** `isSideEffectNode` must be conservative: for `connector` type, if `connector.type === 'gmail'` → ALWAYS side effect (Gmail node can send OR mark read, both side effects). For `connector.type === 'google_drive'` → check `data.drive_operation` (upload/create_folder/delete/rename/update_file = side effect; download/list = not). For `mcp_server` → check `data.tool_name` regex. For `http_api` → check body_template method (default POST → side effect).
**Warning signs:** Gmail node sends email without guard.

### Pitfall 7: channel_ref lost in notifications
**What goes wrong:** When auto-repair fails and we send notification, the original Telegram chat_id is not propagated. User doesn't receive the message.
**Why it happens:** `canvas_runs` has no `channel_ref` column. It must be retrieved from `intent_jobs` via `canvases.id`.
**How to avoid:** In `attemptNodeRepair`, query `intent_jobs` WHERE `canvas_id=?` to get the `channel`+`channel_ref` pair BEFORE notifying. Phase 131 hotfix pattern.
**Warning signs:** `canvas_repair_failed` notifications sent only to web.

### Pitfall 8: ESLint unused imports kill the Docker build
**What goes wrong:** Imports added during refactor that aren't used break `next build` in Docker.
**Why it happens:** ESLint `no-unused-vars` is error-level in next build (Phase 131 lesson).
**How to avoid:** After every refactor, run `cd ~/docflow/app && npm run build` locally before committing.

## Rules Index: Contenido Exacto

Extracción verbatim del catálogo (`.planning/knowledge/canvas-nodes-catalog.md`), comprimido a ≤100 chars por línea, agrupado.

**File:** `app/data/knowledge/canvas-rules-index.md`

```markdown
# Canvas Design Rules Index

Indice escalable de reglas de diseno para el Pipeline Architect. Si necesitas detalle de una regla especifica, llama get_canvas_rule(rule_id).

## Data Contracts
- R01: Define contrato JSON (input/output fields) entre TODOS los pares de nodos ANTES de instructions
- R10: JSON in -> JSON out. Mantener TODOS los campos originales; anadir solo los nuevos
- R13: Nombres canonicos identicos a lo largo del pipeline (reply_to_email en TODOS)
- R15: Cada nodo LLM recibe cantidad MINIMA de info. Recorta body, limita campos
- R16: Max Tokens = estimacion realista del output (N items x M campos x 60 tokens)

## Node Responsibilities
- R05: Un nodo = una responsabilidad. Redactar+maquetar+seleccionar = dividir
- R06: Conocimiento de negocio en SKILLS, no en instructions del nodo
- R07: CatBrain=text-to-text. Agent con CatBrain=JSON-to-JSON con RAG. Arrays = SIEMPRE Agent
- R08: No vincular conectores ni skills innecesarios. Cada tool confunde al LLM
- R09: CatPaws genericos, especializacion en el canvas (extras del nodo)
- R20: Si puede hacerse con codigo, NO delegar al LLM. LLM genera esquema, codigo ejecuta
- R21: El codigo SIEMPRE limpia output del LLM (strip markdown, validar JSON, merge)
- R23: Separar nodos de pensamiento (LLM) de nodos de ejecucion (codigo)

## Arrays & Loops
- R02: N_items x tool_calls vs MAX_TOOL_ROUNDS(12). Si >60% -> ITERATOR o Dispatcher
- R14: Arrays + tool-calling = ITERATOR siempre. Jamas arrays >1 item a nodos tool-calling
- R25: Idempotencia obligatoria. Registrar messageId procesados (triple proteccion)

## Instructions Writing
- R11: Decir QUE hacer, no prohibir. Si escribes "NO X" 5 veces, cambia el tipo de nodo
- R12: Especificar SIEMPRE "PASA SIN MODIFICAR" para items que el nodo debe ignorar
- R17: Todo LLM es probabilistico. Asumir basura. Planificar contratos, ITERATOR, fallbacks

## Planning & Testing
- R03: Traducir problema de negocio a criterios tecnicos verificables
- R04: Probar flujo minimo (START -> primer LLM -> Output) con datos reales antes

## Templates
- R18: Toda plantilla con contenido dinamico NECESITA >=1 bloque instruction
- R19: Separar seleccion de plantilla (skill) de maquetacion (tools)

## Resilience & References
- R22: Referencias entre entidades usan RefCodes (6 chars), lookup tolerante
- R24: Nunca fallback destructivo. Input corrupto -> vacio, no inventar

## Side Effects Guards (nueva categoria Phase 132)
- SE01: Antes de cada send/write/upload/create -> insertar condition guard automatico
- SE02: Guard valida que el contrato de entrada tiene TODOS los campos requeridos no vacios
- SE03: Si guard.false -> agent reportador auto-repara via CatBot 1 vez, luego log_knowledge_gap

## Anti-patterns (DA = Dont Anti-pattern)
- DA01: No pases arrays >1 item a nodos con tool-calling interno (usa ITERATOR)
- DA02: No enlaces connectors/skills que el nodo no va a usar
- DA03: No generes URLs con LLM, usa campos especificos del output del tool
- DA04: No dependas de datos fuera del input explicito del nodo
```

**Total count:** 32 rules (25 Golden + 3 SE + 4 DA). **Size:** ~1.7KB. All lines verified ≤100 chars.

## Módulo `canvas-rules.ts` — Diseño

**File:** `app/src/lib/services/canvas-rules.ts`

```typescript
/**
 * Phase 132 — Rules index loader + on-demand rule lookup.
 *
 * Internal service (NOT a CatBot tool). Used by IntentJobExecutor
 * architect phase to feed rules into ARCHITECT_PROMPT and to expand
 * individual rules when the LLM requests via get_canvas_rule.
 */

import fs from 'fs';
import path from 'path';

const RULES_INDEX_PATH = path.join(process.cwd(), 'app/data/knowledge/canvas-rules-index.md');
const CATALOG_PATH = path.join(process.cwd(), '.planning/knowledge/canvas-nodes-catalog.md');

let cachedIndex: string | null = null;
let cachedRules: Map<string, RuleDetail> | null = null;

export interface RuleDetail {
  id: string;
  short: string;         // <=100 chars from index
  long: string;          // full paragraph from catalog
  category: string;      // 'data_contracts' | 'responsibilities' | 'arrays' | 'templates' | 'side_effects' | 'anti_patterns' | ...
}

export function loadRulesIndex(): string {
  if (cachedIndex) return cachedIndex;
  cachedIndex = fs.readFileSync(RULES_INDEX_PATH, 'utf-8');
  return cachedIndex;
}

export function getCanvasRule(ruleId: string): RuleDetail | null {
  if (!cachedRules) {
    cachedRules = parseRulesFromCatalog();
  }
  return cachedRules.get(ruleId.toUpperCase()) ?? null;
}

function parseRulesFromCatalog(): Map<string, RuleDetail> {
  // Parse canvas-nodes-catalog.md "Reglas de Oro" section.
  // R01-R25 are in `- **RNN** text.` format.
  // SE01-SE03 and DA01-DA04 come from the index itself (no long form yet).
  const out = new Map<string, RuleDetail>();
  const catalog = fs.readFileSync(CATALOG_PATH, 'utf-8');
  const ruleRe = /- \*\*(R\d{2})\*\*\s*(.+?)(?=\n- \*\*R\d{2}|\n\n|\n##)/gs;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(catalog)) !== null) {
    const id = m[1];
    const long = m[2].trim().replace(/\n\s+/g, ' ');
    out.set(id, { id, short: truncate100(long), long, category: categorize(id) });
  }
  // Add SE01-SE03 and DA01-DA04 from the index
  const index = loadRulesIndex();
  const extraRe = /- (SE\d{2}|DA\d{2}): (.+)/g;
  while ((m = extraRe.exec(index)) !== null) {
    const id = m[1];
    const text = m[2].trim();
    out.set(id, { id, short: text, long: text, category: categorize(id) });
  }
  return out;
}

function truncate100(s: string): string {
  return s.length <= 100 ? s : s.slice(0, 97) + '...';
}

function categorize(id: string): string {
  if (id.startsWith('SE')) return 'side_effects';
  if (id.startsWith('DA')) return 'anti_patterns';
  const n = Number(id.slice(1));
  if ([1,10,13,15,16].includes(n)) return 'data_contracts';
  if ([5,6,7,8,9,20,21,23].includes(n)) return 'responsibilities';
  if ([2,14,25].includes(n)) return 'arrays_loops';
  if ([11,12,17].includes(n)) return 'instructions';
  if ([3,4].includes(n)) return 'planning';
  if ([18,19].includes(n)) return 'templates';
  if ([22,24].includes(n)) return 'resilience';
  return 'other';
}

// Test seam: allow tests to reset cache
export function _resetCache(): void {
  cachedIndex = null;
  cachedRules = null;
}
```

**Key decisions:**
- File-system read, cached in memory on first call.
- No async — sync file read is fine since this only runs inside the architect pre-call phase (already LLM-bound).
- `getCanvasRule` is NOT exposed to the LLM tool loop. It's called directly from `runArchitectQALoop` if needed (Option B from CONTEXT.md Claude's Discretion).
- Test seam `_resetCache()` for unit tests.

## `isSideEffectNode` — Diseño Exacto

**Function signature:** added to `canvas-flow-designer.ts`:

```typescript
const SIDE_EFFECT_VERB_RE = /^(send|create|update|delete|upload|invoke|write|execute|publish|post|put|patch|mark|trash|rename|move)/i;
const NON_DESTRUCTIVE_DRIVE_OPS = new Set(['download', 'list', 'read', 'search', 'get']);

interface SideEffectContext {
  /** Connector type from connectors table if the node is a connector. Optional. */
  connectorType?: string;
}

export function isSideEffectNode(node: Record<string, unknown>, ctx?: SideEffectContext): boolean {
  const type = node.type as string;
  const data = (node.data ?? {}) as Record<string, unknown>;

  // Category 3 + 4: always side effect
  if (type === 'storage') return true;
  if (type === 'multiagent') return true;

  // Category 2: agent with destructive extras
  if (type === 'agent') {
    const extraConnectors = (data.extraConnectors as string[]) ?? [];
    // Conservative: ANY extraConnector on an agent = potential side effect
    // (we have no catalog of connector types at post-processor time without DB query)
    if (extraConnectors.length > 0) return true;
    const skills = (data.skills as Array<{ has_side_effects?: boolean } | string>) ?? [];
    for (const s of skills) {
      if (typeof s === 'object' && s?.has_side_effects === true) return true;
    }
    return false;
  }

  // Category 1: connector
  if (type === 'connector') {
    // Check data.mode / data.action (generic)
    const mode = (data.mode as string) ?? '';
    const action = (data.action as string) ?? '';
    if (SIDE_EFFECT_VERB_RE.test(mode) || SIDE_EFFECT_VERB_RE.test(action)) return true;

    // Check Drive operation
    const driveOp = data.drive_operation as string | undefined;
    if (driveOp) {
      if (NON_DESTRUCTIVE_DRIVE_OPS.has(driveOp.toLowerCase())) return false;
      return true;  // upload, create_folder, delete, rename, update_file, move
    }

    // Check MCP tool_name
    const toolName = data.tool_name as string | undefined;
    if (toolName && SIDE_EFFECT_VERB_RE.test(toolName)) return true;

    // Check connector type from ctx (fall-back rule)
    const ct = ctx?.connectorType;
    if (ct === 'gmail') return true;      // gmail nodes can send, mark_read, delete — always side effect
    if (ct === 'smtp') return true;
    if (ct === 'n8n_webhook') return true; // webhooks may have side effects downstream
    if (ct === 'http_api') {
      // Parse body_template for method; default POST = side effect
      const bt = (data.body_template as string) ?? '';
      if (/"method"\s*:\s*"GET"/i.test(bt)) return false;
      return true;
    }
    if (ct === 'mcp_server') {
      // Holded/LinkedIn — if we couldn't match via tool_name, err on the side of caution
      return !toolName || SIDE_EFFECT_VERB_RE.test(toolName);
    }

    // Unknown connector type with no recognized mode → conservative: assume side effect
    return !!ct;
  }

  // Everything else: not a side effect
  // start, checkpoint, condition, iterator, iterator_end, merge, output, catbrain, scheduler
  return false;
}
```

**Verb regex verbatim:**
```
/^(send|create|update|delete|upload|invoke|write|execute|publish|post|put|patch|mark|trash|rename|move)/i
```

**Classification table for the 13 node types:**
| Node Type | Side Effect? | Reason |
|-----------|-------------|--------|
| `start` | NEVER | Entry point, no I/O |
| `agent` | CONDITIONAL | Only if `data.extraConnectors` or skill with `has_side_effects` |
| `catbrain` | NEVER | Read-only RAG query |
| `connector` | CONDITIONAL | Regex on mode/action/tool_name; Drive op check; Gmail/SMTP always yes |
| `checkpoint` | NEVER | Human pause |
| `merge` | NEVER | Pure data combination |
| `condition` | NEVER | Pure branching |
| `scheduler` | NEVER | Time control only |
| `storage` | ALWAYS | Writes disk/Drive |
| `multiagent` | ALWAYS | Launches external canvas (fire-and-forget side effect) |
| `output` | NEVER | Terminal, only notifies (already has flag) |
| `iterator` | NEVER | Control flow |
| `iterator_end` | NEVER | Control flow |

## `insertSideEffectGuards` — Diseño Exacto

**Function signature:**
```typescript
interface FlowData {
  nodes: Array<Record<string, unknown>>;
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
}

export function insertSideEffectGuards(fd: FlowData, ctxResolver?: (n: Record<string, unknown>) => SideEffectContext): FlowData {
  const newNodes = [...fd.nodes];
  const newEdges: typeof fd.edges = [];

  // Skip guard insertion inside iterator loop bodies (Pitfall 3)
  const insideIterator = computeIteratorBodyNodes(fd);

  for (const edge of fd.edges) {
    const targetNode = fd.nodes.find(n => n.id === edge.target);
    if (!targetNode || insideIterator.has(edge.target) || !isSideEffectNode(targetNode, ctxResolver?.(targetNode))) {
      newEdges.push(edge);
      continue;
    }

    // Insert guard + reporter before targetNode
    const guardId = `guard-${edge.target}`;
    const reporterId = `reporter-${edge.target}`;

    // Only create the guard once per target — if multiple edges feed the same
    // side-effect node (via merge upstream), we still need a single guard
    const existingGuard = newNodes.find(n => n.id === guardId);
    if (!existingGuard) {
      const targetData = (targetNode.data ?? {}) as Record<string, unknown>;
      const targetInstructions = (targetData.instructions as string) ?? '';
      const guardCondition = buildGuardCondition(targetNode, targetInstructions);
      const targetPos = (targetNode.position as { x: number; y: number }) ?? { x: 0, y: 0 };

      newNodes.push({
        id: guardId,
        type: 'condition',
        position: { x: targetPos.x - 250, y: targetPos.y },
        data: {
          condition: guardCondition,
          model: 'gemini-main',
          auto_inserted: true,
          target_node_id: edge.target,
        },
      });

      newNodes.push({
        id: reporterId,
        type: 'agent',
        position: { x: targetPos.x - 250, y: targetPos.y + 160 },
        data: {
          agentId: null,
          agentName: `Auto-Reparador de ${edge.target}`,
          model: 'gemini-main',
          instructions: `Un guard condicional ha fallado justo antes del nodo ${edge.target}, que ejecuta side effects. Revisa el contexto de entrada y llama attempt_node_repair con {failed_node_id: "${edge.target}", guard_report: "<resumen del problema>"}. Si el repair también falla, llama log_knowledge_gap con knowledge_path="catflow/design/data-contract" y detén el flujo.`,
          tools: ['attempt_node_repair', 'log_knowledge_gap'],
          auto_inserted: true,
          target_node_id: edge.target,
        },
      });
    }

    // Rewire: predecessor → guard, guard.yes → targetNode, guard.no → reporter
    newEdges.push({
      id: `e-${edge.source}-${guardId}`,
      source: edge.source,
      target: guardId,
      sourceHandle: edge.sourceHandle,
    });
    newEdges.push({
      id: `e-${guardId}-yes-${edge.target}`,
      source: guardId,
      target: edge.target,
      sourceHandle: 'yes',
      targetHandle: edge.targetHandle,
    });
    // Only add the no->reporter edge once per guard
    if (!newEdges.some(e => e.source === guardId && e.sourceHandle === 'no')) {
      newEdges.push({
        id: `e-${guardId}-no-${reporterId}`,
        source: guardId,
        target: reporterId,
        sourceHandle: 'no',
      });
    }
  }

  return { nodes: newNodes, edges: newEdges };
}

function buildGuardCondition(targetNode: Record<string, unknown>, instructions: string): string {
  const type = targetNode.type as string;
  // Extract data-contract hint from instructions ("INPUT: {field1, field2}")
  const inputMatch = instructions.match(/INPUT\s*:\s*\{([^}]+)\}/);
  const fields = inputMatch ? inputMatch[1].split(',').map(f => f.trim()) : [];
  if (fields.length > 0) {
    return `El input incluye TODOS estos campos no vacios: ${fields.join(', ')}. Responde 'yes' solo si ninguno esta vacio, null o undefined.`;
  }
  // Fallback by type
  if (type === 'connector') return 'El input contiene un payload completo y bien formado para el side effect (no vacio, no null, campos coherentes). Responde yes o no.';
  if (type === 'storage') return 'El input tiene contenido no vacio para guardar. Responde yes o no.';
  if (type === 'multiagent') return 'El input tiene un payload valido para el canvas destino. Responde yes o no.';
  return 'El input es valido y no vacio. Responde yes o no.';
}

function computeIteratorBodyNodes(fd: FlowData): Set<string> {
  // Walk from each iterator.element handle until reaching the paired iterator_end.
  // Any node visited in between is "inside the loop body" and should NOT get guards.
  const result = new Set<string>();
  const iterators = fd.nodes.filter(n => n.type === 'iterator');
  for (const it of iterators) {
    const endId = (it.data as Record<string, unknown> | undefined)?.iteratorEndId as string | undefined;
    if (!endId) continue;
    // BFS from iterator.element edges until endId
    const stack = fd.edges.filter(e => e.source === it.id && e.sourceHandle === 'element').map(e => e.target);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === endId || result.has(cur)) continue;
      result.add(cur);
      stack.push(...fd.edges.filter(e => e.source === cur).map(e => e.target));
    }
  }
  return result;
}
```

**Test cases (Plan 03):**
1. **Single side-effect node:** Start → Agent(redactor) → Connector(gmail send). Expected: Start → Agent → guard → (yes) Connector, (no) Reporter. 3 original nodes become 5.
2. **Two side-effects in sequence:** Start → Agent → Connector(gmail) → Storage. Expected: guard+reporter inserted BEFORE Connector AND BEFORE Storage. 4 nodes become 8.
3. **Side-effect with merge upstream:** Start → [A, B] → Merge → Storage. Single guard+reporter before Storage, Merge edge rewired. 5 nodes become 7.
4. **Side-effect inside iterator body:** Start → Agent(list) → Iterator → Agent(process) → Connector(gmail) → IteratorEnd → Output. No guards inserted (iterator's error capture pattern handles it per Pitfall 3).
5. **Read-only connector:** Start → Connector(drive_operation=list) → Output. No guards.
6. **HTTP GET:** Start → Connector(http_api, body_template="{method:GET}") → Output. No guards.

## ARCHITECT_PROMPT Rewrite — Exact Text

Replace `catbot-pipeline-prompts.ts` lines 19-42 with:

```typescript
export const ARCHITECT_PROMPT = `Eres un arquitecto de CatFlow. Recibes: objetivo + tareas + inventario de recursos (catPaws, catBrains, skills, connectors) + index de reglas de diseno.

REGLAS DE DISENO (lookup on-demand con get_canvas_rule):
{{RULES_INDEX}}

Tipos de nodo validos: agent | catbrain | condition | iterator | multiagent | scheduler | checkpoint | connector | storage | merge | output | start. NO inventes otros.

Para cada tarea mapeas UN nodo:
- 'agent' con data.agentId = cat_paws.id si hay CatPaw adecuado. Si no hay, inclúyelo en needs_cat_paws.
- 'catbrain' con data.catbrainId para RAG.
- 'connector' con data.connectorId para email/drive/http/mcp.
- 'iterator' para arrays >1 item con tool-calling (R14, R02).
- 'condition' para bifurcaciones logicas.

DATA CONTRACTS OBLIGATORIOS (R01, R10, R13):
- Cada nodo 'instructions' DEBE empezar con "INPUT: {campo1, campo2, ...}\\nOUTPUT: {campoA, ...}" declarando el contrato explicitamente.
- Los campos OUTPUT del nodo N DEBEN coincidir 1:1 con los campos INPUT del nodo N+1.
- Si recibe JSON y devuelve JSON, incluye "Devuelve el MISMO array JSON, anadiendo solo tus campos. Manten TODOS los originales intactos." (R10).

ANTI-PATTERNS A EVITAR:
- DA01: No pases arrays >1 item a nodos con tool-calling interno (usa ITERATOR).
- DA02: No enlaces connectors/skills innecesarios.
- DA03: No generes URLs con LLM, usa campos especificos del output del tool.
- DA04: No dependas de datos fuera del input explicito del nodo.

QA REVIEW:
Tu diseno pasara por un reviewer QA automatico que validara data contracts y reglas. Anticipa posibles blockers:
- cada nodo tiene INPUT+OUTPUT declarados?
- los nombres de campo son canonicos a lo largo del pipeline?
- los arrays >1 items van dentro de un iterator?
- los nodos con side effects (send/write/upload/create) aparecen al final del pipeline y no dentro de un loop?

Si NO hay CatPaw adecuado para una tarea, NO inventes un id — inclúyelo en needs_cat_paws con name+system_prompt+reason.

Si recibes feedback de un QA review previo (qa_report), corrige los issues en tu nuevo diseno.

Responde SOLO con JSON:
{
  "name": "Nombre del canvas <50 chars",
  "description": "Descripcion <200 chars",
  "flow_data": {
    "nodes": [ { "id": "n1", "type": "agent", "data": { "agentId": "...", "instructions": "INPUT: {...}\\nOUTPUT: {...}\\n..." }, "position": { "x": 100, "y": 100 } } ],
    "edges": [ { "id": "e1", "source": "n1", "target": "n2" } ]
  },
  "needs_cat_paws": [ { "name": "...", "system_prompt": "...", "reason": "..." } ]
}`;
```

**Key change:** `{{RULES_INDEX}}` placeholder is replaced at call-time by `IntentJobExecutor` using `loadRulesIndex()` from `canvas-rules.ts`. This keeps the prompt source file stable and lets tests snapshot the substitution.

**Line count:** ~45 lines, ~2.2KB after rules substitution (rules are ~1.7KB). Target met.

## CANVAS_QA_PROMPT — Exact Text

```typescript
export const CANVAS_QA_PROMPT = `Eres el Canvas QA Reviewer. Recibes: rules_index, canvas_proposal (flow_data), tasks originales, resources. Tu trabajo: auditar el canvas contra las reglas de diseno y devolver un reporte estricto en JSON.

REGLAS DE DISENO:
{{RULES_INDEX}}

CHECKLIST OBLIGATORIO:
1. Data contracts (R01, R10, R13): cada nodo tiene INPUT:+OUTPUT: en sus instructions? Los OUTPUT del nodo N coinciden 1:1 con los INPUT del nodo N+1? Los nombres de campo son canonicos?
2. Arrays & loops (R02, R14): hay arrays >1 item siendo pasados a nodos con tool-calling fuera de un iterator?
3. Responsabilidades (R05, R06, R20, R23): algun nodo mezcla pensamiento y ejecucion? Alguna instruccion hace logica de negocio que deberia estar en skill?
4. Side effects: hay nodos send/write/upload/create/delete sin guard condition antes? (NOTA: el post-procesador insertara guards automaticamente, pero el architect debe anticipar su ubicacion final).
5. Anti-patterns DA01-DA04.

Para cada issue encontrado asigna severity:
- 'blocker': el canvas fallara en runtime o producira output vacio/incorrecto garantizado
- 'major': alta probabilidad de fallo o resultado subopimo
- 'minor': mejora pero no critico

RECOMENDACION:
- 'accept' si quality_score >= 80 Y ningun blocker
- 'revise' si hay blockers o quality_score < 80 pero el diseno es rescatable
- 'reject' si el diseno no se puede rescatar (falta fundamental de entender la tarea)

Responde SOLO con JSON:
{
  "quality_score": 0-100,
  "issues": [
    {
      "severity": "blocker|major|minor",
      "rule_id": "R01|R10|SE01|DA01|...",
      "node_id": "n4",
      "description": "Descripcion corta del problema",
      "fix_hint": "Cambio concreto sugerido (2 lineas max)"
    }
  ],
  "data_contract_analysis": {
    "n1->n2": "ok | broken: razon concreta",
    "n2->n3": "..."
  },
  "recommendation": "accept | revise | reject"
}`;
```

**Size:** ~1.8KB after RULES_INDEX substitution. Fits well within LiteLLM context.

## AGENT_AUTOFIX_PROMPT — Exact Text

```typescript
export const AGENT_AUTOFIX_PROMPT = `Eres el Canvas Auto-Reparador. Un condition guard fallo justo antes de un nodo con side effects en un canvas en ejecucion. Tu trabajo es analizar por que fallo y proponer un fix ajustando las instructions del nodo problematico O de un nodo upstream que este mandando datos incompletos.

Recibes:
- failed_node: el nodo cuyas entradas fallaron el guard (con su type, data, instructions)
- upstream_nodes: los nodos que feed al failed_node
- guard_report: resumen del contexto que no paso el guard
- actual_input: lo que realmente recibio el nodo (truncado a 2KB)

Analiza:
1. Las instructions del failed_node declaran un INPUT contract? Si no, anadelo.
2. El OUTPUT de los upstream nodes cumple el INPUT contract? Si no, ajusta las instructions upstream.
3. Es un problema de nombres de campo inconsistentes (R13)? Fija los nombres canonicos.
4. Es un problema de array vacio inesperado? Anade un fallback R24.

Si puedes reparar, responde:
{
  "status": "fixed",
  "fix_target_node_id": "nX",
  "fixed_instructions": "INPUT: {...}\\nOUTPUT: {...}\\n..."  (las nuevas instructions completas),
  "reason": "1-2 lineas explicando el cambio"
}

Si NO puedes reparar con confianza, responde:
{
  "status": "repair_failed",
  "reason": "1-2 lineas explicando por que no se puede reparar automaticamente"
}`;
```

## QA Loop State Machine — Exact Pseudocode

Replace `intent-job-executor.ts:191-202` (the architect phase block inside `runFullPipeline`) with:

```typescript
// Phase 3: architect + QA loop
updateIntentJob(job.id, { pipeline_phase: 'architect' });
this.notifyProgress(job, 'Procesando fase=architect (iter 0)...', true);
const resources = this.scanResources();

const design = await this.runArchitectQALoop(job, goal, tasks, resources);
if (!design) {
  // loop exhausted; already marked terminal by runArchitectQALoop
  return;
}

await this.finalizeDesign(job, design, goal, tasks, resources);
```

And add the new method:

```typescript
private static readonly MAX_QA_ITERATIONS = 2;

private static async runArchitectQALoop(
  job: IntentJobRow,
  goal: unknown,
  tasks: unknown,
  resources: CanvasResources,
): Promise<ArchitectDesign | null> {
  const rulesIndex = loadRulesIndex();  // from canvas-rules.ts
  const architectSystem = ARCHITECT_PROMPT.replace('{{RULES_INDEX}}', rulesIndex);
  const qaSystem = CANVAS_QA_PROMPT.replace('{{RULES_INDEX}}', rulesIndex);

  let previousDesign: ArchitectDesign | null = null;
  let previousQaReport: unknown = null;

  for (let iter = 0; iter < this.MAX_QA_ITERATIONS; iter++) {
    // Architect call
    const architectInput = JSON.stringify({
      goal,
      tasks,
      resources,
      // Feedback from previous iteration if any
      qa_report: previousQaReport,
      previous_design: previousDesign,
    });

    this.notifyProgress(job, `Architect iteracion ${iter}...`, true);
    const architectRaw = await this.callLLM(architectSystem, architectInput);
    const design = this.parseJSON(architectRaw) as ArchitectDesign;

    // Short-circuit: if architect declares needs_cat_paws, skip QA and pause
    if (design.needs_cat_paws && design.needs_cat_paws.length > 0) {
      logger.info('intent-job-executor', 'Architect needs cat_paws, skipping QA', {
        jobId: job.id,
        iteration: iter,
      });
      return design;
    }

    // QA call
    this.notifyProgress(job, `QA review iteracion ${iter}...`, true);
    const qaRaw = await this.callLLM(
      qaSystem,
      JSON.stringify({ canvas_proposal: design, tasks, resources }),
    );
    const qaReport = this.parseJSON(qaRaw) as {
      quality_score?: number;
      issues?: unknown[];
      recommendation?: string;
    };

    logger.info('intent-job-executor', 'QA review complete', {
      jobId: job.id,
      iteration: iter,
      recommendation: qaReport.recommendation,
      score: qaReport.quality_score,
      issueCount: Array.isArray(qaReport.issues) ? qaReport.issues.length : 0,
    });

    updateIntentJob(job.id, {
      progressMessage: {
        phase: 'architect',
        iteration: iter,
        qa_recommendation: qaReport.recommendation,
        qa_score: qaReport.quality_score,
        message: `QA iter ${iter}: ${qaReport.recommendation}`,
      },
    });

    if (qaReport.recommendation === 'accept') {
      return design;
    }

    // Store for feedback into next iteration
    previousDesign = design;
    previousQaReport = qaReport;
  }

  // Exhausted: log knowledge gap + fail
  logger.warn('intent-job-executor', 'QA loop exhausted without accept', {
    jobId: job.id,
  });
  try {
    const { logKnowledgeGap } = await import('@/lib/catbot-db');
    logKnowledgeGap({
      knowledge_path: 'catflow/design/quality',
      query: `Pipeline architect could not produce acceptable canvas for job ${job.id} after ${this.MAX_QA_ITERATIONS} iterations`,
      context: JSON.stringify({
        job_id: job.id,
        goal,
        last_qa_report: previousQaReport,
      }).slice(0, 4000),
    });
  } catch (err) {
    logger.error('intent-job-executor', 'Failed to log knowledge gap after QA exhaustion', {
      error: String(err),
    });
  }
  updateIntentJob(job.id, {
    status: 'failed',
    error: `QA loop exhausted after ${this.MAX_QA_ITERATIONS} iterations; last recommendation=${String(previousQaReport && (previousQaReport as { recommendation?: string }).recommendation)}`,
  });
  this.markTerminal(job.id);
  return null;
}
```

**LLM budget:** iter 0 = 2 calls (architect + QA). iter 1 = 2 calls. Max = 4 LLM calls × ~15s each = ~60s. Fits comfortably within the IntentJobExecutor tick cadence (`CHECK_INTERVAL = 30s` and each job runs until completion in its own async context).

## Auto-Repair Service — Diseño

**File:** `app/src/lib/services/canvas-auto-repair.ts`

```typescript
/**
 * Phase 132 — Runtime auto-repair for canvases with failed condition guards.
 *
 * Triggered from the reporter agent node (auto-inserted by insertSideEffectGuards)
 * via the internal tool attempt_node_repair. Reads canvas + node_states, calls LLM
 * with AGENT_AUTOFIX_PROMPT, and if successful updates flow_data in place and
 * signals the executor to re-run from the affected node.
 *
 * If repair_attempt >= 1, skips repair and returns a failure structure so the
 * reporter can call log_knowledge_gap instead.
 */

import db from '@/lib/db';
import catbotDb, { logKnowledgeGap } from '@/lib/catbot-db';
import { logger } from '@/lib/logger';
import { AGENT_AUTOFIX_PROMPT } from './catbot-pipeline-prompts';
import { createNotification } from './notifications';

interface RepairInput {
  canvasRunId: string;
  failedNodeId: string;
  guardReport: string;
  actualInput: string;  // truncated already
}

interface RepairResult {
  success: boolean;
  reason: string;
  updated_node_id?: string;
}

export async function attemptNodeRepair(input: RepairInput): Promise<RepairResult> {
  const { canvasRunId, failedNodeId, guardReport, actualInput } = input;

  // 1. Read canvas_runs + canvas
  const run = db.prepare(
    'SELECT id, canvas_id, metadata, node_states FROM canvas_runs WHERE id = ?',
  ).get(canvasRunId) as
    | { id: string; canvas_id: string; metadata: string | null; node_states: string | null }
    | undefined;
  if (!run) return { success: false, reason: 'canvas_run not found' };

  const metadata = run.metadata ? JSON.parse(run.metadata) : {};
  const repairAttempts: Record<string, number> = metadata.repair_attempts ?? {};
  const prevAttempts = repairAttempts[failedNodeId] ?? 0;

  if (prevAttempts >= 1) {
    // Second failure — give up, log gap, notify
    logger.warn('canvas', 'auto-repair: second failure, giving up', {
      canvasRunId,
      failedNodeId,
      prevAttempts,
    });
    try {
      logKnowledgeGap({
        knowledge_path: 'catflow/design/data-contract',
        query: `Auto-repair failed twice for node ${failedNodeId} in canvas ${run.canvas_id}`,
        context: JSON.stringify({
          canvas_id: run.canvas_id,
          canvas_run_id: canvasRunId,
          failed_node_id: failedNodeId,
          guard_report: guardReport,
          actual_input: actualInput.slice(0, 2000),
        }).slice(0, 4000),
      });
    } catch (err) {
      logger.error('canvas', 'logKnowledgeGap failed after auto-repair exhaustion', { error: String(err) });
    }
    await notifyUserIrreparable(run.canvas_id, failedNodeId, guardReport);
    return { success: false, reason: 'repair_attempt exhausted (2 failures)' };
  }

  // 2. Load canvas flow_data
  const canvas = db.prepare(
    'SELECT flow_data FROM canvases WHERE id = ?',
  ).get(run.canvas_id) as { flow_data: string } | undefined;
  if (!canvas) return { success: false, reason: 'canvas not found' };

  const flowData = JSON.parse(canvas.flow_data) as {
    nodes: Array<Record<string, unknown>>;
    edges: Array<{ source: string; target: string }>;
  };
  const failedNode = flowData.nodes.find(n => n.id === failedNodeId);
  if (!failedNode) return { success: false, reason: 'failed node not in flow_data' };

  // 3. Identify upstream nodes (direct predecessors of failedNodeId)
  const upstreamIds = flowData.edges.filter(e => e.target === failedNodeId).map(e => e.source);
  const upstreamNodes = flowData.nodes.filter(n => upstreamIds.includes(n.id as string));

  // 4. Call LLM with AGENT_AUTOFIX_PROMPT
  const llmInput = JSON.stringify({
    failed_node: failedNode,
    upstream_nodes: upstreamNodes,
    guard_report: guardReport,
    actual_input: actualInput.slice(0, 2000),
  });
  const llmRaw = await callRepairLLM(llmInput);
  let llmOut: { status?: string; fix_target_node_id?: string; fixed_instructions?: string; reason?: string };
  try {
    llmOut = JSON.parse(llmRaw);
  } catch {
    return { success: false, reason: 'invalid LLM JSON' };
  }

  if (llmOut.status !== 'fixed' || !llmOut.fix_target_node_id || !llmOut.fixed_instructions) {
    return { success: false, reason: llmOut.reason ?? 'LLM declared repair_failed' };
  }

  // 5. Apply fix
  const targetNode = flowData.nodes.find(n => n.id === llmOut.fix_target_node_id);
  if (!targetNode) return { success: false, reason: 'fix target node not found' };
  (targetNode.data as Record<string, unknown>).instructions = llmOut.fixed_instructions;

  db.prepare('UPDATE canvases SET flow_data = ? WHERE id = ?')
    .run(JSON.stringify(flowData), run.canvas_id);

  // Track attempt
  repairAttempts[failedNodeId] = prevAttempts + 1;
  metadata.repair_attempts = repairAttempts;
  db.prepare('UPDATE canvas_runs SET metadata = ? WHERE id = ?')
    .run(JSON.stringify(metadata), canvasRunId);

  // 6. Reset node_states for the fixed node + failed node so they re-run
  // (canvas executor reads node_states to decide what to run)
  const nodeStates = run.node_states ? JSON.parse(run.node_states) : {};
  delete nodeStates[llmOut.fix_target_node_id];
  delete nodeStates[failedNodeId];
  db.prepare('UPDATE canvas_runs SET node_states = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(nodeStates), 'running', canvasRunId);

  logger.info('canvas', 'auto-repair applied fix', {
    canvasRunId,
    fix_target: llmOut.fix_target_node_id,
    reason: llmOut.reason,
  });

  return { success: true, reason: llmOut.reason ?? 'fixed', updated_node_id: llmOut.fix_target_node_id };
}

async function callRepairLLM(userInput: string): Promise<string> {
  // Same shape as IntentJobExecutor.callLLM — extract to a shared helper if you want
  const url = process['env']['LITELLM_URL'] || 'http://litellm:4000';
  const key = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
  const model = process['env']['CATBOT_PIPELINE_MODEL'] || 'gemini-main';
  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: AGENT_AUTOFIX_PROMPT },
        { role: 'user', content: userInput },
      ],
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`litellm ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '{}';
}

async function notifyUserIrreparable(canvasId: string, failedNodeId: string, guardReport: string): Promise<void> {
  // Look up intent_jobs to get channel + channel_ref (Pitfall 7)
  const job = catbotDb.prepare(
    'SELECT user_id, channel, channel_ref FROM intent_jobs WHERE canvas_id = ? ORDER BY created_at DESC LIMIT 1',
  ).get(canvasId) as { user_id: string; channel: string; channel_ref: string | null } | undefined;
  if (!job) return;

  try {
    await createNotification({
      user_id: job.user_id,
      type: 'canvas_repair_failed',
      title: 'Canvas no se pudo reparar automaticamente',
      body: `El nodo ${failedNodeId} fallo el guard dos veces. Motivo: ${guardReport.slice(0, 200)}.`,
      channel_ref: job.channel_ref ?? undefined,
    });
  } catch (err) {
    logger.error('canvas', 'notifyUserIrreparable failed', { error: String(err) });
  }
}
```

**Integration point with canvas-executor.ts:**
- No direct call. The reporter agent node executes its LLM loop normally. Its `data.tools = ['attempt_node_repair', 'log_knowledge_gap']`. When the LLM calls `attempt_node_repair`, the canvas executor's tool dispatcher (which already exists for agent nodes) routes the call to the new tool handler that imports and calls `attemptNodeRepair()`.

**New tool `attempt_node_repair`:** Added to `catbot-tools.ts` TOOLS[] as internal tool (permission-less, only available to nodes with `auto_inserted: true`). The gating happens in `getToolsForLLM` by checking the calling context — when `ctx.canvas_node_data?.auto_inserted === true`, include the tool; otherwise hide it. For MVP simplicity, making it always available but no-op for non-reporter contexts is also acceptable since it requires specific parameters only a reporter has.

## `get_canvas_rule` — Where it Lives

**Recommendation: Option B (internal function, NOT a CatBot tool).**

The architect phase is a direct `callLLM` (no tool loop). The prompt already inlines the full index. If the architect wants rule detail, the cleanest approach is to have `runArchitectQALoop` parse the architect's response for a marker like `"need_rule": "R10"` and re-call the LLM with the rule expansion — but in practice, the index descriptions are clear enough that this mechanism is rarely triggered. The function lives in `canvas-rules.ts:getCanvasRule(ruleId)` and is callable from any internal TypeScript code.

**Why not Option A (tool):** Exposing `get_canvas_rule` to CatBot's normal tool catalog would pollute the user-facing tool list (52+ tools today), require knowledge tree entry, permission gating, etc. The architect phase doesn't participate in CatBot's chat loop — it's an isolated pipeline. Option B is 10x simpler.

If during testing you discover the architect genuinely needs on-demand expansion, add it as a post-hoc pattern: the LLM puts `need_rules: ["R10", "R13"]` at the top of its response, the loop detects it, expands via `getCanvasRule`, and re-calls with the expansions appended. This is zero-cost to implement because the JSON parser already runs.

## Integration with `log_knowledge_gap`

**Existing signature (catbot-tools.ts:910-921):**
```typescript
{
  name: 'log_knowledge_gap',
  parameters: {
    knowledge_path: string,  // optional
    query: string,            // required
    context: string,          // optional
  }
}
```

**Existing DB function (catbot-db.ts:624):**
```typescript
INSERT INTO knowledge_gaps (id, knowledge_path, query, context) VALUES (?, ?, ?, ?)
```

**Phase 132 usage — all 3 compatible calls:**
1. **QA loop exhaustion** (runArchitectQALoop): `{knowledge_path: 'catflow/design/quality', query: 'Pipeline architect could not produce acceptable canvas...', context: JSON.stringify({job_id, goal, last_qa_report})}`
2. **Auto-repair exhaustion** (attemptNodeRepair): `{knowledge_path: 'catflow/design/data-contract', query: 'Auto-repair failed twice for node X', context: JSON.stringify({canvas_id, failed_node_id, guard_report, actual_input})}`
3. **Reporter fallback** (reporter agent node via LLM tool call): `{knowledge_path: 'catflow/design/data-contract', query: 'Guard failed and auto-repair could not fix node X', context: '...'}`

All three use the existing tool — zero new fields. Context truncated to 4000 chars (safety).

## State of the Art

| Old Approach (Phase 130) | New Approach (Phase 132) | When Changed | Impact |
|--------------------------|--------------------------|--------------|--------|
| Single architect LLM call | Architect → QA → Architect loop (max 2 iter) | 132-02 | 4x max LLM calls, +~45s max runtime, but +quality |
| ARCHITECT_PROMPT 23 lines generic | ARCHITECT_PROMPT ~45 lines with rules index inline | 132-02 | Prompt grows ~1.8KB but rules are reusable |
| No runtime guards | Auto-inserted condition guards before side effects | 132-03 | +2 nodes per side effect node, zero executor changes |
| Manual debugging of failed canvases | Auto-repair with 1 retry + knowledge gap logging | 132-03 | Self-healing on data contract mismatches |
| Canvas rules live in 1654 lines of docs | Canvas rules live in 32-line markdown index + catalog | 132-01 | Scalable to 200+ rules without prompt inflation |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | `app/vitest.config.ts` |
| Quick run command | `cd app && npx vitest run src/lib/services/canvas-rules.test.ts src/lib/services/canvas-flow-designer.test.ts src/lib/services/canvas-auto-repair.test.ts src/lib/services/intent-job-executor.test.ts -t "Phase 132"` |
| Full suite command | `cd app && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QA2-01 | rules index has >=25 rules, each line <=100 chars, groups present | unit | `npx vitest run src/lib/services/canvas-rules.test.ts -t "loadRulesIndex"` | Wave 0 new file |
| QA2-02 | getCanvasRule returns detail for R01..R25 and null for unknown | unit | `npx vitest run src/lib/services/canvas-rules.test.ts -t "getCanvasRule"` | Wave 0 new file |
| QA2-03 | ARCHITECT_PROMPT contains {{RULES_INDEX}} placeholder + data contract requirement | unit (snapshot) | `npx vitest run src/lib/services/intent-job-executor.test.ts -t "ARCHITECT_PROMPT"` | existing |
| QA2-04 | CANVAS_QA_PROMPT returns JSON with required fields when given mock input | unit (parser) | `npx vitest run src/lib/services/intent-job-executor.test.ts -t "CANVAS_QA parser"` | existing |
| QA2-05 | runArchitectQALoop: accept in iter 0 = 2 LLM calls; revise→accept in iter 1 = 4 LLM calls; revise→revise = fail+knowledge_gap | unit with LLM mock | `npx vitest run src/lib/services/intent-job-executor.test.ts -t "QA loop"` | existing |
| QA2-06 | insertSideEffectGuards produces expected node/edge shapes for 6 scenarios (Test Cases 1-6) | unit | `npx vitest run src/lib/services/canvas-flow-designer.test.ts -t "insertSideEffectGuards"` | existing (extend) |
| QA2-07 | attemptNodeRepair: fix success → updates flow_data + metadata; repair_failed → returns error; repair_attempts=1 on entry → skips to log_knowledge_gap | unit with LLM+db mock | `npx vitest run src/lib/services/canvas-auto-repair.test.ts -t "attemptNodeRepair"` | Wave 0 new file |
| QA2-08 | notifyUserIrreparable looks up intent_jobs for channel_ref + calls createNotification | unit with db mock | `npx vitest run src/lib/services/canvas-auto-repair.test.ts -t "notifyUserIrreparable"` | Wave 0 new file |
| Oracle (Plan 04) | CatBot-as-oracle reproduces Holded Q1 case with full email content + template + 2 recipients | manual-only | human verification per CLAUDE.md CatBot oracle protocol | N/A |

### Sampling Rate
- **Per task commit:** Run the phase-scoped test command above (fast, ~5s per file).
- **Per wave merge:** Full suite `cd app && npx vitest run` (~10-20s total).
- **Phase gate:** Full suite green + `cd app && npm run build` (ESLint check) + CatBot oracle Plan 04 before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `app/data/knowledge/canvas-rules-index.md` — new file, covers QA2-01
- [ ] `app/src/lib/services/canvas-rules.ts` — new file, covers QA2-02
- [ ] `app/src/lib/services/canvas-rules.test.ts` — new file
- [ ] `app/src/lib/services/canvas-auto-repair.ts` — new file, covers QA2-07/08
- [ ] `app/src/lib/services/canvas-auto-repair.test.ts` — new file
- [ ] Extensions to `app/src/lib/services/canvas-flow-designer.ts` + its test (isSideEffectNode, insertSideEffectGuards, computeIteratorBodyNodes)
- [ ] Extensions to `app/src/lib/services/catbot-pipeline-prompts.ts` (ARCHITECT_PROMPT rewrite + CANVAS_QA_PROMPT + AGENT_AUTOFIX_PROMPT)
- [ ] Extensions to `app/src/lib/services/intent-job-executor.ts` (runArchitectQALoop) + its test
- [ ] Extensions to `app/src/lib/services/catbot-tools.ts` (register attempt_node_repair tool)
- [ ] Knowledge tree entries in `app/data/knowledge/catflow.json` for SE01-SE03, DA01-DA04 concepts (per CLAUDE.md protocol)

No new test framework install needed — vitest already present and covers all these files.

## Open Questions

1. **Reporter node tool gating — strict or lax?**
   - What we know: the reporter needs `attempt_node_repair` which must not leak to regular CatBot chat tool loop
   - What's unclear: should we gate via `ctx.canvas_node_data?.auto_inserted === true` check in `getToolsForLLM`, or just register it with a prefix like `_internal_attempt_node_repair` and filter by name?
   - Recommendation: name-based filter is simpler (1 line in getToolsForLLM: `if (name.startsWith('_internal_') && !ctx.isReporter) return false`). Plan 03 decides final shape.

2. **Guard condition quality depends on architect declaring `INPUT:` contract properly.**
   - What we know: buildGuardCondition parses `INPUT: {field1, field2}` from instructions
   - What's unclear: what if the architect doesn't follow the convention despite the prompt?
   - Recommendation: fallback guard text ("el input es valido y no vacio") still triggers, and the QA loop should catch missing contracts on iter 0. Plan 03 test should cover the fallback case.

3. **Do we need to invalidate rules cache during hot-reload?**
   - What we know: `canvas-rules.ts` caches file reads in memory
   - What's unclear: if admin edits `canvas-rules-index.md` live, does the cache need invalidation?
   - Recommendation: no. The file is edited rarely and the IntentJobExecutor is a long-running singleton that restarts on deploy. Document this limitation and offer `_resetCache()` for tests only.

4. **Does the reporter agent node count as its own node for the executor's topological sort?**
   - What we know: yes — it's a regular `agent` node, executor will process it in topological order
   - What's unclear: the `no` branch leads to the reporter and the reporter has NO outgoing edges, so the executor will finish processing it and the canvas_run will transition to `completed` even though the side effect never happened
   - Recommendation: reporter must set canvas_runs.status='failed' or launch auto-repair which sets status back to running. The auto-repair flow handles it.

5. **MAX_QA_ITERATIONS=2 is the architect iteration count (arch+QA, arch+QA). Should we count arch+QA as 1 iteration or 2?**
   - CONTEXT.md explicitly says "max 2 iterations" meaning up to 2 architect runs (iter 0 + iter 1). Total LLM calls = 4. This research adopts that convention.

## Sources

### Primary (HIGH confidence)
- `.planning/knowledge/canvas-nodes-catalog.md` (764 lines) — **verbatim extraction of R01-R25** Golden Rules lines 12-48
- `app/src/lib/services/catbot-pipeline-prompts.ts` (42 lines) — full current content of STRATEGIST/DECOMPOSER/ARCHITECT prompts
- `app/src/lib/services/intent-job-executor.ts` (lines 1-367 read) — runFullPipeline structure, callLLM pattern, parseJSON helper, finalizeDesign logic
- `app/src/lib/services/canvas-flow-designer.ts` (118 lines) — existing VALID_NODE_TYPES, validateFlowData, scanCanvasResources
- `app/src/lib/services/canvas-executor.ts` lines 640-700 (connector exec), 1392-1413 (condition exec), 1500-1512 + 1802 (metadata pattern) — exact executor behavior
- `app/src/lib/services/catbot-tools.ts` lines 905-921 — exact log_knowledge_gap tool shape
- `app/src/lib/catbot-db.ts` lines 103-111 (knowledge_gaps table), 133-150 (intent_jobs table), 614-660 (knowledge_gaps CRUD)
- `.planning/phases/132.../132-CONTEXT.md` — all user-locked decisions
- `.planning/REQUIREMENTS.md` lines 148-157 — QA2-01 through QA2-08 exact text
- `app/data/knowledge/canvas.json`, `catflow.json` — current knowledge tree entries to extend
- `.planning/phases/130.../130-RESEARCH.md` — Phase 130 patterns this phase builds on
- `app/vitest.config.ts` — test framework config
- `.planning/config.json` — nyquist_validation enabled

### Secondary (MEDIUM confidence)
- `skill_orquestador_catbot_enriched.md` header (first 100 lines) — context for skill-based patterns referenced by R06/R08/R09

### Tertiary (LOW confidence)
- None — all claims in this research are verified against primary source files.

## Metadata

**Confidence breakdown:**
- Rules index content: HIGH — verbatim extraction from canvas-nodes-catalog.md
- Side-effect detection logic: HIGH — grounded in actual canvas-executor.ts code for connector/storage/multiagent dispatch
- ARCHITECT_PROMPT rewrite: HIGH — built on existing prompt with user's locked requirements
- CANVAS_QA_PROMPT: MEDIUM — new design but follows strategist/decomposer shape
- insertSideEffectGuards algorithm: HIGH — standard graph rewrite over flow_data, iterator-aware skip derived from executor semantics
- Auto-repair service: HIGH — reuses canvas_runs.metadata pattern, existing tables, existing tools
- QA loop state machine: HIGH — linear extension of runFullPipeline with zero new infrastructure
- Wave 0 test gaps: HIGH — fresh files only, no framework changes
- Integration with log_knowledge_gap: HIGH — verified exact tool signature

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable — depends on Phase 130 which is locked)
