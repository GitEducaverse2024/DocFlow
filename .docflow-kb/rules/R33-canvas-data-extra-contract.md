---
id: rule-r33-canvas-data-extra-contract
type: rule
subtype: architecture
lang: es
title: "R33 — Contrato node.data: data_extra como escape hatch generico por nodeType"
summary: "canvas_add_node/update_node solo exponen 14 fields genericos; el executor lee ~50 fields totales. Usa data_extra JSON string para setear los especificos por nodeType (tool_name, useRag, condition, etc.)"
tags: [critical, architecture, canvas, tools, data-extra]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-23T17:40:00Z
created_by: v30.9-p3
version: 1.0.0
updated_at: 2026-04-23T17:40:00Z
updated_by: v30.9-p3
source_of_truth:
  - file: .docflow-kb/generated/node-data-whitelist.json
    description: Whitelist canonico auto-generado por scripts/audit-tool-runtime-contract.cjs
change_log:
  - { version: 1.0.0, date: 2026-04-23, author: v30.9-p3, change: "Created after ship v30.8 revealed canvas_add_node schema did not expose tool_name/tool_args for MCP connectors (6th occurrence of same architectural pattern)" }
ttl: never
---

# R33 — Contrato node.data: `data_extra` como escape hatch generico

## La regla

`canvas_add_node` y `canvas_update_node` exponen directamente solo fields genericos:

- `label`, `agentId`, `connectorId`, `instructions`, `model`, `separator`, `limit_mode`, `max_rounds`, `max_time`

El executor `canvas-executor.ts` lee **~50 fields** totales repartidos por `nodeType` (tool_name, tool_args, useRag, ragQuery, condition, catbrainId, drive_*, schedule_*, format, etc.). La brecha es **~36 fields inaccesibles** a traves del schema top-level de la tool.

Para setear cualquier field especifico del nodeType se usa el param `data_extra: string` (JSON). El handler valida cada key contra el whitelist auto-generado por `scripts/audit-tool-runtime-contract.cjs` (committed en `.docflow-kb/generated/node-data-whitelist.json`). Keys no listadas para ese nodeType retornan error explicito listando las keys validas.

## Por que

Este patron se descubrio tras el 6º caso consecutivo de la misma clase de bug arquitectonico en el proyecto DocFlow:

1. **v30.4**: `description` truncada en body KB (info en DB pero invisible al LLM).
2. **v30.5**: skills sistema en lazy-load — `get_skill` nunca se llamaba.
3. **v30.6**: `canvas_add_edge` rechazaba fan-out valido desde START.
4. **v30.7**: `config.tools[]` invisible en body del resource KB.
5. **v30.8**: prompt assembler no inyectaba catalogo MCP — CatBot respondia de memoria.
6. **v30.9** (este caso): `canvas_add_node` no expone `tool_name`/`tool_args` para connectors MCP. Canvas construido por CatBot para Comparativa Q1 facturacion quedo no-ejecutable hasta patch manual via PATCH API.

Cada instancia se habia resuelto con un parche ad-hoc. v30.9 cierra el pattern con una solucion generica: `data_extra` + whitelist automatico + audit en CI que detecta cualquier drift futuro.

## Whitelist por nodeType

El catalogo canonico vive en `.docflow-kb/generated/node-data-whitelist.json`. Resumen (puede evolucionar — siempre consulta la fuente canonica):

- `start`: initialInput, schedule_type, delay_value, delay_unit
- `agent`: useRag, ragQuery, projectId, maxChunks, mode, documentContent, pawId, extraCatBrains
- `catpaw`: documentContent, pawId
- `connector`: **tool_name, tool_args** (OBLIGATORIOS para MCP), auto_report, report_to, report_template_ref, template_id, mode, drive_operation, drive_file_id, drive_folder_id, drive_mime_type, drive_file_name, auto_send, target_email, target_subject
- `project` (CatBrain legacy): catbrainId, projectId, ragQuery, input_mode, connector_mode, searchEngine
- `condition`: condition
- `output`: format, notify_on_complete, outputName, trigger_targets
- `storage`: storage_mode, subdir, filename_template, format_instructions, format_model, use_llm_format
- `scheduler`: schedule_type, count_value, delay_value, delay_unit
- `multiagent`: execution_mode, payload_template, target_task_id, timeout

## Ejemplos

### Ejemplo positivo — connector MCP con tool + args

```text
canvas_add_node({
  canvasId: X,
  nodeType: 'CONNECTOR',
  label: 'Holded Q1 2025',
  connectorId: 'seed-holded-mcp',
  data_extra: '{"tool_name":"holded_period_invoice_summary","tool_args":{"starttmp":1735686000,"endtmp":1746050399}}'
})
```

### Ejemplo positivo — agent con RAG

```text
canvas_add_node({
  canvasId: X,
  nodeType: 'AGENT',
  label: 'Analista con contexto',
  agentId: <catpaw-uuid>,
  data_extra: '{"useRag":true,"ragQuery":"facturas Q1 2025","projectId":"cb-abc","maxChunks":5}'
})
```

### Ejemplo positivo — condition branching

```text
canvas_add_node({
  canvasId: X,
  nodeType: 'CONDITION',
  label: 'Cliente acepto',
  data_extra: '{"condition":"la respuesta es afirmativa"}'
})
```

### Ejemplo negativo (ANTIPATRON)

```text
canvas_add_node({
  canvasId: X,
  nodeType: 'CONNECTOR',
  label: 'Holded Q1 2025',
  connectorId: 'seed-holded-mcp',
  instructions: 'Usa holded_period_invoice_summary con starttmp=... y endtmp=...'
})
```

Pre-v30.9 esto era lo que CatBot hacia: texto libre en `instructions` describiendo el tool. El executor **ignora** ese texto para connectors MCP — lee solo `data.tool_name` y `data.tool_args`. Resultado: fallback a `search_people` (LinkedIn default) → llamada al MCP Holded falla silenciosamente → el nodo queda `completed` sin ejecutar nada util.

## Como descubrir el whitelist en runtime

CatBot puede obtener el whitelist vigente de 2 formas:

1. **Intentarlo** — el handler valida y devuelve error con la lista de keys validas si una key es invalida. Error-driven learning.
2. **Consulta explicita** — `search_kb({search:'data-extra whitelist'})` o `get_kb_entry({id:'rule-r33-canvas-data-extra-contract'})` trae esta regla completa.

## Audit permanente

Cualquier milestone que toque `canvas-executor.ts` debe correr:

```bash
node scripts/audit-tool-runtime-contract.cjs --verify
```

Si el executor introdujo fields nuevos a `data.X` sin actualizar el whitelist, el audit falla con exit 1 y lista los fields anadidos. Fix:

```bash
node scripts/audit-tool-runtime-contract.cjs --write
# commit el .docflow-kb/generated/node-data-whitelist.json actualizado
# + actualizar R33 (este archivo) con la lista nueva si es publica
# + actualizar R09 del skill Canvas Rules Inmutables si hay nodeTypes nuevos
```

El audit corre en cada milestone como parte del ciclo de verificacion (similar a `audit-skill-injection.cjs` establecido en v30.5).

## Relacionado

- R26 — canvas-executor inmutable (no tocar el runtime; adaptar tools alrededor).
- R27 — agentId UUID-only (mismo espiritu: contratos estrictos).
- R31 — skills sistema literal-injection (R09 en Canvas Inmutable es aplicacion de R31).
- R32 — canvas fan-out desde START.

## Referencia historica

- Sesion 40 del proyecto DocFlow (v30.9).
- Ship test v30.8 (canvas Comparativa facturacion cuatrimestre) que revelo el 6º caso del patron.
- Script `scripts/audit-tool-runtime-contract.cjs` creado en v30.9 P1.
