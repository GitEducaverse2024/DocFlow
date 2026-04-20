---
id: rule-r10-preserve-fields
type: rule
subtype: design
lang: es
title: "R10 — R10 — Preserve JSON fields (anti-teléfono-escacharrado)"
summary: "R10 — Preserve JSON fields (anti-teléfono-escacharrado)"
tags: [canvas, R10, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R10) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R10 — R10 — Preserve JSON fields (anti-teléfono-escacharrado)

Si un nodo LLM recibe JSON y devuelve JSON, la **primera línea** del system prompt DEBE ser la regla anti-teléfono-escacharrado:

> "Devuelve el MISMO array JSON, añadiendo solo tus campos. Mantén TODOS los originales intactos."

## Por qué

El LLM "completa" campos que percibe vacíos, omite campos que no parecen relevantes, o renombra campos para "mejorar" la estructura. Sin instrucción explícita, pierdes información crítica entre nodos.

## Incidente real

**Respondedor v3**: recibía `{messageId, threadId, from, subject, body, reply_to_email, tipo, producto}` y devolvía `{respuesta: {...}}` — se comió los 8 campos originales. El Connector Gmail, que esperaba `reply_to_email` y `threadId` para responder en hilo, recibía solo `{respuesta}` y no sabía a quién responder.

Fix: instrucción `"Devuelve el MISMO objeto añadiendo solo \"respuesta\". Mantén messageId, threadId, reply_to_email, from, subject, body, tipo, producto INTACTOS."`

## Cómo aplicar

Primera línea de TODO nodo LLM con contrato JSON in/out:

```
Eres un [rol]. Devuelve el MISMO objeto JSON (o el MISMO array de objetos) añadiendo SOLO los campos [campo1, campo2]. Mantén TODOS los campos originales intactos — no los renombres, no los omitas, no los "mejores".
```

## Reforzar con R12 y R13

- **R12**: decir explícitamente "PASA SIN MODIFICAR" para items que el nodo debe ignorar.
- **R13**: nombres de campos canónicos idénticos en todo el pipeline.

## Backup en código

- **R21**: el código post-LLM valida el merge. Si el nodo devolvió un objeto sin `messageId` pero el input lo tenía, re-mergear.
