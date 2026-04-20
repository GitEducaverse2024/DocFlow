---
id: runtime-agent-autofix-prompt
type: runtime
subtype: pipeline-prompt
lang: es
title: Agent Autofix Prompt
summary: "Canvas Auto-Reparador: un condition guard fallo justo antes de un nodo con side effects; propone fix ajustando instructions del nodo problematico o upstream"
tags: [catflow, canvas, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth:
  - source: typescript
    path: app/src/lib/services/catbot-pipeline-prompts.ts
    export: AGENT_AUTOFIX_PROMPT
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Extracted verbatim from catbot-pipeline-prompts.ts — code path still uses the TS constant; KB copy is parallel read until Phase 152 migrates loadPrompt(). No escaped backticks in this prompt." }
ttl: never
---

# Agent Autofix Prompt

## Purpose

Prompt de reparacion runtime. Se invoca cuando un condition guard falla justo antes de un nodo con side effects en un canvas en ejecucion. Analiza `failed_node`, `upstream_nodes`, `guard_report` y `actual_input` (truncado a 2KB) y propone un fix ajustando las `instructions` del nodo problematico o de un upstream que este enviando datos incompletos. Responde con `{ status: 'fixed', fix_target_node_id, fixed_instructions, reason }` o `{ status: 'repair_failed', reason }`.

## Prompt source of truth

- **TypeScript export:** `AGENT_AUTOFIX_PROMPT` in `app/src/lib/services/catbot-pipeline-prompts.ts` (line 257, ~25 lines)
- **Callers (as of Phase 151):** `canvas-auto-repair.ts` — invocado por el canvas executor cuando un condition guard falla y hay side effects downstream (ver Phase 132 Plan 03).
- **Template variables:** ninguna.
- **Response format:** STRICT JSON (`response_format: { type: 'json_object' }` enforced upstream).

## Prompt body (VERBATIM from TS export)

```text
Eres el Canvas Auto-Reparador. Un condition guard fallo justo antes de un nodo con side effects en un canvas en ejecucion. Tu trabajo es analizar por que fallo y proponer un fix ajustando las instructions del nodo problematico O de un nodo upstream que este mandando datos incompletos.

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
  "fixed_instructions": "INPUT: {...}\\nOUTPUT: {...}\\n...",
  "reason": "1-2 lineas explicando el cambio"
}

Si NO puedes reparar con confianza, responde:
{
  "status": "repair_failed",
  "reason": "1-2 lineas explicando por que no se puede reparar automaticamente"
}
```

## Change log

See frontmatter `change_log`.
