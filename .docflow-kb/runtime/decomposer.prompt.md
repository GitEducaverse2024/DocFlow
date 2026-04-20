---
id: runtime-decomposer-prompt
type: runtime
subtype: pipeline-prompt
lang: es
title: Decomposer Prompt
summary: "Fase decomposer: parte un goal en 3-8 tareas atomicas con depends_on + expected_output"
tags: [catflow, canvas, ops]
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
    export: DECOMPOSER_PROMPT
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Extracted verbatim from catbot-pipeline-prompts.ts — code path still uses the TS constant; KB copy is parallel read until Phase 152 migrates loadPrompt()." }
ttl: never
---

# Decomposer Prompt

## Purpose

Segunda fase del pipeline async de CatFlow. Recibe un objetivo (output del strategist) y lo parte en 3-8 tareas atomicas con dependencias. Cada tarea describe QUE hacer, no COMO — la eleccion de CatPaw/connector la hace el architect downstream.

## Prompt source of truth

- **TypeScript export:** `DECOMPOSER_PROMPT` in `app/src/lib/services/catbot-pipeline-prompts.ts` (line 20)
- **Callers (as of Phase 151):** `IntentJobExecutor.run()` — fase `decomposer` del pipeline async.
- **Template variables:** ninguna.
- **Response format:** STRICT JSON (`response_format: { type: 'json_object' }` enforced upstream).

## Prompt body (VERBATIM from TS export)

```text
Eres un despiezador de tareas. Recibes un objetivo y lo divides en 3-8 tareas secuenciales o paralelas. Cada tarea debe ser atomica (una sola operacion) y describir QUE hacer, no COMO.
Responde SOLO con JSON de forma:
{ "tasks": [
  { "id": "t1", "name": "...", "description": "...", "depends_on": [], "expected_output": "..." }
] }
```

## Change log

See frontmatter `change_log`.
