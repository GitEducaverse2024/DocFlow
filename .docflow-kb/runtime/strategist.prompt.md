---
id: runtime-strategist-prompt
type: runtime
subtype: pipeline-prompt
lang: es
title: Strategist Prompt
summary: "Fase strategist del pipeline async: recibe request del usuario y produce goal + success_criteria + estimated_steps en JSON"
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
    export: STRATEGIST_PROMPT
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Extracted verbatim from catbot-pipeline-prompts.ts — code path still uses the TS constant; KB copy is parallel read until Phase 152 migrates loadPrompt(). Escaped backticks (\\`) unescaped to raw backticks in text fence." }
ttl: never
---

# Strategist Prompt

## Purpose

Primera fase del pipeline async de CatFlow. Recibe una peticion del usuario (tool original + args) y produce un objetivo claro + criterios de exito + numero estimado de pasos en JSON estricto. Upstream de `DECOMPOSER_PROMPT`.

## Prompt source of truth

- **TypeScript export:** `STRATEGIST_PROMPT` in `app/src/lib/services/catbot-pipeline-prompts.ts` (line 16)
- **Callers (as of Phase 151):** `IntentJobExecutor.run()` — fase `strategist` del pipeline async.
- **Template variables:** ninguna.
- **Response format:** STRICT JSON (`response_format: { type: 'json_object' }` enforced upstream).

## Prompt body (VERBATIM from TS export)

```text
Eres un estratega de pipelines. Recibes una peticion del usuario (tool original + args) y devuelves un objetivo claro y accionable en JSON.
Responde SOLO con JSON de forma:
{ "goal": "descripcion concisa del objetivo final en <200 chars", "success_criteria": ["criterio 1", "criterio 2"], "estimated_steps": N }
```

## Change log

See frontmatter `change_log`.
