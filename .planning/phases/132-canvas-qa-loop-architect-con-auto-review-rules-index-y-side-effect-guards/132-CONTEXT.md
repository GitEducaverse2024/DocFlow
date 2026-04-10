# Phase 132: Canvas QA Loop - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning (decisions locked by user)

<domain>
## Phase Boundary

Reforzar el Pipeline Architect (Phase 130) para producir canvases de calidad profesional usando:
1. Rules index escalable (markdown) referenciable desde el prompt
2. Tool on-demand para expandir reglas concretas
3. QA reviewer LLM que audita el canvas propuesto
4. Loop de revisión architect↔QA con max 2 iteraciones
5. Guards automáticos antes de side effects con auto-reparación

Motivado por fallo real del caso Holded Q1: el canvas se diseñó estructuralmente válido pero produjo un email vacío, sin template aplicado, enviado a un solo destinatario en vez de dos. Hay 1654 líneas de docs sobre cómo diseñar catflows bien (skill_orquestador + canvas-nodes-catalog + canvas.json + catflow.json) pero el architect prompt es genérico de 23 líneas.

Fuera del scope:
- Reescribir el canvas executor (usa lo que hay)
- Añadir nuevos tipos de nodo
- UI de edición de reglas (las reglas viven en markdown, editables directamente)
- Checkpoint humano obligatorio (el usuario pidió automatización con fallback)

</domain>

<decisions>
## Implementation Decisions (user-locked + my elections)

### Enfoque: index escalable, no inyección completa
- El architect NO recibe los 4KB de canvas.json + catflow.json
- Recibe un index de ~2KB con referencias en lenguaje natural (formato: `R01: descripción corta (max 100 chars)`)
- Si necesita detalle de una regla específica, llama `get_canvas_rule(rule_id)` en una segunda pasada
- Escalable: mañana añades 200 reglas y el prompt base no crece

### Side effects — detección automática (decisión mía, eficiente y escalable)
Nodo se considera destructivo/side-effect si cumple CUALQUIERA de:

**1. Nodos `connector`:**
- `data.mode` o `data.action` coincide con regex: `^(send|create|update|delete|upload|invoke|write|execute|publish|post|put|patch)`
- Subtipos específicos para conectores conocidos:
  - Gmail: `send_email`, `send_reply`, `mark_read`, `mark_unread`, `delete`, `trash`
  - Google Drive: `upload`, `create_folder`, `delete`, `rename`, `update_file`
  - Holded HTTP: todos los métodos != GET
  - n8n webhook: todos (webhooks pueden tener side effects)
  - SMTP directo: todos

**2. Nodos `agent` con side effects implícitos:**
- `data.extraConnectors` incluye cualquier connector con modes destructivos
- `data.skills` incluye cualquier skill marcada como `has_side_effects: true`

**3. Nodos `storage`:**
- Siempre considerados side effect (escriben a archivo o connector)

**4. Nodos `multiagent`:**
- Siempre considerados side effect (disparan otros canvases externamente)

Implementado como función pura `isSideEffectNode(node, catalog)` en canvas-flow-designer.ts (nuevo helper, ~30 líneas). Un solo sitio para ajustar si añadimos tipos.

### Comportamiento ante guard.no — Opción C del usuario: CatBot auto-repara con 1 reintento
Cuando un condition guard se evalúa false en runtime:

1. **Primer fallo detectado:**
   - Canvas NO envía el side effect
   - Canvas pausa ese nodo con status 'waiting-for-repair'
   - Se llama a CatBot vía LLM call directa (patrón de Phase 130) con un prompt `AGENT_AUTOFIX_PROMPT` que recibe:
     - Las instructions originales del nodo fallido
     - El input real que recibió el nodo
     - El output esperado (de data contract)
     - Las instructions previas de los nodos upstream que alimentan este
   - CatBot devuelve `{ fixed_instructions: "...", reason: "..." }` o `{ repair_failed: true, reason: "..." }`
   - Si devuelve fix: el canvas actualiza las instructions del nodo Y de los nodos upstream si el problema está más arriba, re-ejecuta desde el primer nodo afectado
   - Se marca `repair_attempt = 1` en node_states

2. **Segundo fallo (tras reparar):**
   - Si el guard vuelve a ser false tras el retry → ABANDONO
   - `status = 'failed'`
   - `log_knowledge_gap` con:
     - `knowledge_path`: 'catflow/design/data-contract'
     - `query`: describe qué nodo falló y por qué el auto-fix no fue suficiente
     - `context`: JSON con instructions originales, intento de reparación, output del guard en ambos intentos
   - Notificación al usuario por canal original:
     - Telegram: mensaje con el informe del problema + link al canvas
     - Web: notification type 'pipeline_failed_irreparable'

### QA loop architect ↔ reviewer — max 2 iteraciones (decisión usuario)
Flujo dentro de IntentJobExecutor architect phase:

```
iteration 0: architect llama LLM → canvas_v0
             ↓
             QA reviewer llama LLM con canvas_v0 → qa_report_0
             ↓
             if recommendation == 'accept' → usar canvas_v0, continuar
             if recommendation == 'revise' o 'reject' → goto iteration 1
             ↓
iteration 1: architect llama LLM con feedback=qa_report_0 → canvas_v1
             ↓
             QA reviewer llama LLM con canvas_v1 → qa_report_1
             ↓
             if recommendation == 'accept' → usar canvas_v1, continuar
             if recommendation == 'revise' o 'reject' → FAIL, log_knowledge_gap
```

Cada iteración son 2 LLM calls (architect + QA). Total max: 4 LLM calls antes de rendirse.

### Rules index format (decisión mía: markdown plano agrupado)
`app/data/knowledge/canvas-rules-index.md`:

```markdown
# Canvas Design Rules Index

## Data Contracts
- R01: Define contrato JSON entre cada par de nodos ANTES de instructions
- R10: JSON in → JSON out, mantén TODOS los campos originales
- R13: Nombres de campos canónicos idénticos a lo largo del pipeline

## Node Responsibilities
- R05: Un nodo = una responsabilidad
- R06: Lógica de negocio en skills, no en instructions
- R20: Si código puede hacerlo, NO delegues a LLM
- R23: Separa nodos pensantes (LLM) de ejecutores (código)

## Arrays & Loops
- R02: N_items × tool_calls > 60% MAX_TOOL_ROUNDS → usa ITERATOR
- R14: Arrays + tool-calling = ITERATOR siempre
- R25: Idempotencia obligatoria (track processed IDs)

## Side Effects Guards (nueva categoría)
- SE01: Antes de cada send/write/upload/create → insertar condition guard
- SE02: Guard valida que el contrato de entrada tiene todos los campos
- SE03: Si guard.false → agent reportador que auto-repara vía CatBot

## Anti-patterns
- DA01: No pases arrays >1 item a nodos con tool-calling interno
- DA02: No enlaces connectors/skills innecesarios
- DA03: No generes URLs con LLM, usa campos específicos
- DA04: No dependas de datos fuera del input del nodo
```

40 líneas, ~1.5KB. Editable manualmente cuando añadimos reglas.

### ARCHITECT_PROMPT rewrite
Nuevo prompt conciso (~40 líneas) que:
1. Incluye el rules index entero (~2KB inline)
2. Añade instrucción clara: "si necesitas detalle de una regla, llama get_canvas_rule(rule_id) ANTES de diseñar"
3. Exige data contracts explícitos en las instructions de cada nodo (ej: "INPUT: {invoices: array, comparison: string}. OUTPUT: rendered HTML")
4. Obliga a pensar en antipatrones: DA01-DA04
5. Menciona que habrá un QA review posterior y que debe anticiparse a posibles blockers

### CANVAS_QA_PROMPT
Nuevo prompt que recibe:
- Rules index completo
- Canvas propuesto (flow_data)
- Tasks originales del decomposer
- Lista de recursos escaneados

Y devuelve JSON estricto:
```json
{
  "quality_score": 85,
  "issues": [
    {
      "severity": "blocker",
      "rule_id": "R01",
      "node_id": "n4",
      "description": "Node n4 (Maquetador) no declara data contract de input",
      "fix_hint": "Añadir a instructions: 'INPUT: {comparison_summary, invoices, period_labels}...'"
    }
  ],
  "data_contract_analysis": {
    "n1→n3": "ok",
    "n3→n4": "broken: n3 emite JSON con campo 'summary' pero n4 instructions asume 'comparison_summary'"
  },
  "recommendation": "revise"
}
```

### Nuevo nodo tipo auto-inyectado: "reporter" (subtipo de agent)
Los agents reportadores que inserta `insertSideEffectGuards` son nodos `agent` normales pero con:
- `data.agentId`: null (no usa CatPaw existente)
- `data.systemPrompt`: inline (patrón de ejecución directa con model + instructions)
- `data.model`: 'gemini-main'
- `data.instructions`: genérico "Este nodo se activa si un guard condicional falla. Invoca log_knowledge_gap con el contexto del fallo y detén el flujo."
- `data.tools`: ['log_knowledge_gap']

Esto reutiliza el tipo `agent` que ya existe sin inventar nuevos tipos.

### Auto-repair helper (nuevo archivo)
`app/src/lib/services/canvas-auto-repair.ts` exporta `attemptNodeRepair(canvasRun, failedNodeId, guardReport)`:
1. Lee el canvas completo + node_states
2. Identifica nodos upstream que alimentan el failed node
3. Llama LLM con `AGENT_AUTOFIX_PROMPT` + el contexto
4. Si devuelve fix válido: UPDATE canvases SET flow_data = ... WHERE id = ?, UPDATE canvas_runs SET status='running', re-ejecuta desde el primer nodo afectado
5. Si repair_failed: devuelve el error estructurado para que el caller pueda llamar log_knowledge_gap

</decisions>

<code_context>
## Existing Assets to Reuse (inventariado por Explore)

### Knowledge ya documentado (NO reinventar)
- `/home/deskmath/docflow/skill_orquestador_catbot_enriched.md` (890 líneas) — decision protocol, CatPaw creation, integration rules
- `/home/deskmath/docflow/.planning/knowledge/canvas-nodes-catalog.md` (764 líneas) — 25 Golden Rules R01-R25, node specs completos
- `/home/deskmath/docflow/app/data/knowledge/catflow.json` — 13 concepts, 4 dont, 6 common_errors
- `/home/deskmath/docflow/app/data/knowledge/canvas.json` — 8 concepts, 6 dont
- `/home/deskmath/docflow/.planning/phases/24-editor-visual-8-tipos-de-nodo/24-RESEARCH.md` — React Flow pitfalls

### Code ya existente
- `canvas-flow-designer.ts:20-30` — VALID_NODE_TYPES (9 tipos)
- `canvas-flow-designer.ts:39-83` — validateFlowData() (structural validation)
- `canvas-flow-designer.ts:99-117` — scanCanvasResources() (inventory)
- `catbot-pipeline-prompts.ts:19-42` — ARCHITECT_PROMPT (23 líneas, a reemplazar)
- `intent-job-executor.ts:154-310` — runFullPipeline() con fases strategist/decomposer/architect
- `intent-job-executor.ts:311-350` — callLLM() helper (patrón a reusar para QA call)
- `canvas-executor.ts:1392-1413` — condition node handling (evalúa via LLM, devuelve yes/no)
- `canvas-executor.ts:461-537` — agent node execution (inline model+instructions mode existe)
- `log_knowledge_gap` tool — Phase 126, ya registrado y always_allowed

### Integration Points
- **Phase 130 pipeline architect phase**: donde se injecta el QA loop
- **Phase 126 knowledge gaps**: auto-reparación fallida → gap automático
- **Phase 128 notifications**: reportar irreparable al canal original
- **Phase 129 intent jobs**: intent_job pausa durante auto-repair attempt

## Known Pitfalls (from Phase 131)

- `CATBOT_PIPELINE_MODEL` env var debe respetar el default `gemini-main` (no `ollama/gemma3:12b`)
- ESLint strict: no unused imports
- LogSource union: NO extender (reusa `intent-job-executor` y `catbot`)
- `channel_ref` ahora se propaga correctamente (Phase 131 hotfix)
- Parser regex leniente para outputs del LLM con posibles variaciones

</code_context>

<specifics>
## User Intent

Usuario quiere **calidad profesional sin complejidad operacional**:
1. Los canvas deben producir resultados útiles, no estructuras válidas vacías
2. Los nodos deben validar sus inputs antes de ejecutar side effects
3. Si algo sale mal, CatBot debe intentar arreglarlo automáticamente antes de rendirse
4. Solo reportar gaps/notificaciones cuando el sistema realmente no puede resolverlo
5. Reutilizar todo lo que ya está documentado (1654 líneas de docs)

Caso real que motivó la fase:
```
User (Telegram): comparativa Holded Q1 → email
Pipeline: estratega → despiezador → architect generó canvas OK
Canvas execution: 5 nodos, 3m 15s, 82K tokens
Result: email enviado pero VACÍO, sin template, solo 1 destinatario
```

Los problemas del canvas generado:
1. n4 Maquetador no leyó el output de n3 Resumidor
2. n4 instructions no especificaron data contract ("espero JSON con campos x, y, z")
3. n5 Ejecutor Gmail solo tomó 1 email del texto libre
4. No había guard antes del send
5. El Maquetador llamó 4 tools de templates pero nunca renderizó con datos reales

Con Phase 132:
```
Pipeline arranca → architect genera canvas_v0 con data contracts
→ QA review detecta blocker: "n3→n4 data contract inconsistente"
→ architect revisa con feedback → canvas_v1 corregido
→ QA review: accept
→ insertSideEffectGuards añade condition antes de n5
→ canvas se ejecuta
→ si en runtime el n5 recibe html_body vacío → guard.false
→ auto-repair: CatBot analiza, ajusta instructions del Maquetador, re-run
→ si funciona → send email → success
→ si no → log_knowledge_gap + notify
```

</specifics>

<deferred>
## Deferred Ideas

- UI de edición de reglas del index (por ahora markdown plano, el admin edita con editor)
- Dashboard de postmortems de canvases fallidos
- Métricas de precision del QA reviewer (% de accept en iter 0, 1, 2)
- Machine learning para auto-ajustar las reglas según historial de fallos
- Multi-iteration beyond 2 (complicaría el sistema sin beneficio claro)
- QA reviewer usando modelo distinto (por ahora mismo gemini-main que el architect)

</deferred>

---

*Phase: 132-canvas-qa-loop-architect-con-auto-review-rules-index-y-side-effect-guards*
*Context decisions locked: 2026-04-10*
