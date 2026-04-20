---
id: rule-se02-guard-validates-contract
type: rule
subtype: side-effects
lang: es
title: "SE02 — Guard valida contrato completo"
summary: "Guard valida que el contrato de entrada tiene TODOS los campos requeridos no vacios"
tags: [canvas, SE02, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-155
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-155
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-155, change: "Migrated from app/data/knowledge/canvas-rules-index.md §Side Effects Guards + Anti-patterns (phase 155 cleanup)" }
ttl: never
---

# SE02 — Guard valida contrato completo

El guard valida que el contrato de entrada tiene **TODOS** los campos requeridos y ninguno está vacío ni `null`.

## Por qué

Validación parcial deja pasar edge cases que rompen el emitter: un string vacío pasa `!= null`, un array vacío pasa como "array ok", un objeto `{}` pasa como "objeto ok". El emitter recibe un payload estructuralmente correcto pero semánticamente inválido.

## Cómo aplicar

1. El guard declara una lista explícita `required_fields: ["reply_to_email", "respuesta.cuerpo", "respuesta.plantilla_ref"]` (incluye dot-paths para nested fields).
2. Para cada field se ejecuta `isNonEmpty(v)`:

```js
isNonEmpty = (v) =>
  v != null &&
  v !== '' &&
  (Array.isArray(v) ? v.length > 0 : true);
```

3. Todos los fields deben cumplir. Si uno falla → `guard.false` → ver **SE03**.

## Relacionado

- **SE01** (el guard existe porque algún nodo emitter lo requiere).
- **SE03** (qué hacer cuando guard.false).
- **R10** (preservar campos entrantes — si un nodo anterior los pierde, el guard lo atrapa aquí).
