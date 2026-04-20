---
id: rule-r24-no-destructive-fallback
type: rule
subtype: design
lang: es
title: "R24 — Nunca hacer fallback destructivo"
summary: "Nunca hacer fallback destructivo"
tags: [canvas, R24, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R24) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R24 — Nunca hacer fallback destructivo

Nunca hacer fallback destructivo. Si el input está corrupto, **devolver vacío** — NO inventar datos. JSON truncado se repara o se descarta.

## Por qué

Los fallbacks "simpáticos" enmascaran errores y producen pipeline-fantasma:

- JSON truncado parseado como split-by-newlines → 50 items basura → todo el pipeline procesa datos inventados.
- Campo vacío → default a string "unknown" → downstream filtra por "unknown" y procesa todo como desconocido.
- LLM devuelve `null` → código usa valor anterior en cache → datos staleados.

La señal de error se pierde. El pipeline "funciona" pero produce mierda consistente.

## Incidente real (E3)

**parseIteratorItems v3**: si el input JSON era inválido (truncado por R16), el fallback era `input.split('\n')`. Con un JSON truncado de 500 líneas, producía 500 items "items" cada uno con JSON roto. El Clasificador downstream recibía 500 strings basura → error en iteración 0 pero sin trazabilidad del origen.

Fix:
```js
function parseIteratorItems(raw) {
  const cleaned = cleanLlmOutput(raw); // R21
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch (e) {
    // NO split por newlines. NO split por separador.
    console.error('ITERATOR: JSON inválido, devolviendo []', e.message);
    return [];
  }
}
```

## Cómo aplicar

1. Si el input del nodo no es parseable: log explícito + devolver vacío estructurado (`[]` para arrays, `{ok: false, error: ...}` para objetos).
2. NO hacer split-by-newlines, split-by-separator, regex-based extraction sobre JSON roto.
3. El ITERATOR con 0 items salta el loop body y va por `completed` — el pipeline continúa, el informe dice "0 procesados".
4. Logear el fallo para alertar/monitorear.

## Ver también

- **R17** (LLM es probabilístico — asumir que puede devolver basura).
- **R21** (código limpia output).
- **R25** (idempotencia — si hay fallo, reintentar con el mismo input).
