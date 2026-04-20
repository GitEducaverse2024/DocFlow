---
id: rule-r21-code-cleans-llm-output
type: rule
subtype: design
lang: es
title: "R21 — El código SIEMPRE limpia el output del LLM"
summary: "El código SIEMPRE limpia el output del LLM"
tags: [canvas, R21, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R21) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R21 — El código SIEMPRE limpia el output del LLM

El código **SIEMPRE** limpia el output del LLM (strip markdown, validar JSON, merge campos). Nunca confiar en el formato.

## Por qué

Los modelos wrappean JSON en bloques markdown ```json ... ``` (Gemini lo hace ~40% de las veces). Cualquier parser que no haga strip previo falla.

Además:

- Puede haber texto explicativo antes del JSON ("Aquí tienes el resultado:\n\n```json...").
- Puede haber trailing whitespace, BOM, escape characters mal formados.
- Puede haber comillas "tipográficas" (`"..."`) en lugar de ASCII.

## Implementación canónica (`cleanLlmOutput`)

El canvas-executor aplica en cada output LLM:

1. Strip markdown fences (```json ... ```` → contenido).
2. Strip BOM y caracteres Unicode invisibles.
3. Intentar `JSON.parse`. Si falla, intentar reparar comillas tipográficas.
4. Si sigue fallando: devolver error estructurado (**R24**, no fallback destructivo).

## Cómo aplicar (si escribes un nodo custom)

```ts
import { cleanLlmOutput } from '@/lib/services/canvas-llm-helpers';

const raw = await callLlm(...);
const cleaned = cleanLlmOutput(raw);     // strip markdown, BOM, etc.
let parsed;
try {
  parsed = JSON.parse(cleaned);
} catch (e) {
  return { ok: false, error: 'llm_output_not_json', raw: cleaned.slice(0, 500) };
}

// Merge con los campos del input (R10 backup)
const merged = { ...input, ...parsed };
return merged;
```

## Ejemplo del incidente

**E5 del pipeline v4**: Gemini devolvía ```json\n[...]\n``` en el 40% de runs. El ITERATOR recibía ```json\n[...\n``` y parseaba 0 items. Fix: `cleanLlmOutput()` en el executor hace strip automático.

## Ver también

- **R10** (preserve fields — el merge post-parse repara campos comidos).
- **R24** (JSON truncado → vacío, no fallback destructivo).
