---
id: taxonomy-node-roles
type: taxonomy
subtype: node-roles
lang: es
title: "Taxonomía de roles funcionales de nodos Canvas"
summary: "Los 7 roles funcionales (extractor, transformer, synthesizer, renderer, emitter, guard, reporter) y cómo mapean a los 13 tipos de nodo del Canvas."
tags: [canvas, extractor, transformer, synthesizer, renderer, emitter, guard, reporter]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Consolidated from canvas-nodes-catalog.md (13-node table) + ARCHITECT_PROMPT §2 role definitions" }
ttl: never
---

# Taxonomía de roles funcionales de nodos Canvas

Mientras el **tipo** de nodo (`agent`, `connector`, …) define el motor de ejecución, el **rol funcional** describe qué hace el nodo en la arquitectura del pipeline. El arquitecto de canvas usa esta taxonomía para razonar sobre la composición del flujo.

## Los 7 roles

| Rol | Responsabilidad | Ejemplo típico |
|-----|-----------------|----------------|
| **extractor** | Lee del mundo externo (email, Drive, Holded, HTTP). Produce datos crudos. | Agent+CatPaw "Ejecutor Gmail" que llama `gmail_list_emails` |
| **transformer** | Mapea el input a una forma distinta sin sintetizar. Un campo nuevo, un reformato. | Agent que clasifica cada email con un enum `tipo: lead|spam|sistema` |
| **synthesizer** | Combina múltiples fuentes o genera texto nuevo. La salida no se obtiene por transformación 1:1. | Agent "Redactor" que produce `respuesta.cuerpo` a partir de email + plantilla |
| **renderer** | Toma datos estructurados y los convierte en formato presentable (HTML, PDF, markdown). Preferiblemente código, no LLM (R19+R20). | Connector email-template con `render_template(template_id, variables)` |
| **emitter** | Envía al mundo externo (send_email, upload_file, mcp_call). Efecto lateral. | Connector Gmail que envía el mensaje |
| **guard** | Valida invariantes o aprueba antes de continuar. Puede pausar (checkpoint) o desviar (condition). | Checkpoint "¿Email correcto?", Condition "¿Hay leads?" |
| **reporter** | Consolida resultados finales para notificación o log. Nodo terminal. | Output con `notify_on_complete`, Connector Informe que arma resumen |

## Mapeo rol → tipo de nodo

No es 1:1. Un mismo tipo puede cubrir varios roles según configuración:

| Tipo de nodo | Roles típicos |
|--------------|---------------|
| `start` | (entrada) |
| `agent` | extractor (con conector), transformer, synthesizer |
| `catbrain` | extractor (RAG), synthesizer |
| `connector` | emitter (casi siempre), extractor en modo read vía CatPaw |
| `checkpoint` | guard |
| `merge` | synthesizer |
| `condition` | guard |
| `scheduler` | (control de flujo) |
| `storage` | emitter (write), renderer (con `use_llm_format`) |
| `multiagent` | synthesizer (sync) / emitter (async) |
| `output` | reporter |
| `iterator` / `iterator_end` | (control de flujo sobre arrays) |

## Implicaciones para R20/R23

- Nodos **LLM** (agent, catbrain, condition, merge-con-LLM): roles de **pensamiento** — clasificar, redactar, evaluar.
- Nodos **código** (connector, storage, iterator, output): roles de **ejecución** — render, send, mark_read.
- **R23** prohíbe mezclar pensamiento + ejecución en el mismo nodo. Si un nodo redacta + maqueta + envía, hay que separarlo en 3 nodos.
- **R20** prioriza código sobre LLM cuando sea posible (renderer y emitter idealmente son código).

## Referencias

- Concepto base de nodo: `domain/concepts/canvas-node.md`.
- Modos del canvas: `domain/taxonomies/canvas-modes.md`.
- Regla R23 (pensamiento vs ejecución): `rules/R23-thinking-vs-execution-nodes.md`.
- Regla R20 (código > LLM): `rules/R20-code-over-llm.md`.
