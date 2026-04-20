---
id: rule-r17-probabilistic-llm
type: rule
subtype: design
lang: es
title: "R17 — Todo nodo LLM es probabilístico"
summary: "Todo nodo LLM es probabilístico"
tags: [canvas, R17, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R17) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R17 — Todo nodo LLM es probabilístico

Todo nodo LLM es probabilístico. **Asumir que puede devolver basura**. Planificar contratos, ITERATOR, fallbacks.

## Por qué

El mismo input puede producir outputs diferentes entre runs. Incluso con `temperature=0`, modelos modernos no son deterministas al 100% (kernel fusion, tokenización, etc.).

Además:

- El LLM puede devolver markdown wrapped (```json ... ```) — R21.
- Puede renombrar campos — R10 + R21 (merge en código).
- Puede truncarse — R16 + R24.
- Puede omitir items — R12.
- Puede alucinar (inventar un `messageId` plausible) — R10.

## Cómo aplicar

1. **Contratos explícitos:** define el esquema esperado del output en la instrucción.
2. **Validación post-LLM:** el código valida el output, no confía en él (R21).
3. **Fallback no-destructivo:** si el output está corrupto, devolver vacío/error estructurado, NO split-by-newlines (R24).
4. **Idempotencia:** el nodo se puede reintentar con el mismo input (R25).
5. **ITERATOR para arrays:** reduce el output a 1 item por iteración — menos varianza (R14).
6. **Double-check:** para decisiones críticas, un segundo nodo LLM verifica la salida del primero (Condition con "¿Parece correcto?").

## Corolario operativo

- No escribir "el LLM siempre devuelve JSON válido" en ninguna doc.
- Todo test de pipeline debe incluir el caso "LLM devuelve basura" — ver `incidents/INC-10-buildactivesets-wrong-db.md` para la regla de oro sobre tests de integración.
