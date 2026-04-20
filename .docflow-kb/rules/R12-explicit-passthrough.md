---
id: rule-r12-explicit-passthrough
type: rule
subtype: design
lang: es
title: "R12 — Especificar SIEMPRE \"PASA SIN MODIFICAR\""
summary: "Especificar SIEMPRE \"PASA SIN MODIFICAR\""
tags: [canvas, R12, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R12) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R12 — Especificar SIEMPRE "PASA SIN MODIFICAR"

Especificar SIEMPRE "**PASA SIN MODIFICAR**" para los items (o campos) que el nodo debe ignorar.

## Por qué

Un nodo LLM que procesa un array y tiene lógica diferenciada por tipo (ej: Respondedor que redacta para leads y pasa de largo para spam) tiene dos tentaciones:

1. Procesar TODOS los items igual (redactar respuesta para el spam también).
2. Devolver SOLO los items procesados (omitir los demás).

Ambas rompen el contrato del pipeline.

## Incidente real

**Respondedor v3** recibía 6 emails, redactaba respuesta para los 3 leads, y devolvía un array de 3 items. El Connector Gmail post-iteración esperaba 6 items y fallaba al iterar el array de 3. Los 3 emails de spam quedaban sin marcar como leídos.

Fix: instrucción `"Para emails con tipo='spam'|'sistema', PASA SIN MODIFICAR el objeto. Para tipo='lead', añade el campo \"respuesta\"."`

## Cómo aplicar

Para cada nodo LLM con lógica condicional sobre los items:

```
Para items que cumplen la condición X, haz Y.
Para items que NO cumplen X, PASA SIN MODIFICAR (devuelve el objeto tal cual lo recibiste).
Devuelve el array COMPLETO con la misma cantidad de items.
```

## Combinar con R10

- **R10**: mantén TODOS los campos originales intactos.
- **R12**: mantén TODOS los items originales intactos (aunque no los proceses).

Juntas garantizan que ningún nodo del pipeline actúe como filtro silencioso.
