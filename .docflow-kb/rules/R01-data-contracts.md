---
id: rule-r01-data-contracts
type: rule
subtype: design
lang: es
title: "R01 — Definir el contrato de datos entre todos los nodos"
summary: "Definir el contrato de datos entre todos los nodos"
tags: [canvas, R01, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R01) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R01 — Definir el contrato de datos entre todos los nodos

**Antes de escribir cualquier instrucción**, definir el contrato de datos entre TODOS los nodos del pipeline: qué campos produce cada nodo y qué campos consume el siguiente.

## Por qué

Sin contrato explícito, los nodos LLM se inventan campos, renombran los existentes (`reply_to` → `replyTo` → `email`), o pierden información al reformatear. El efecto se amplifica por cada nodo (teléfono escacharrado).

## Cómo aplicar

1. Antes de tocar el canvas, escribir en papel: `NodoN recibe {a, b, c}; produce {a, b, c, d}` para cada nodo.
2. Verificar que los nombres de campo son **idénticos** a lo largo del pipeline (ver **R13**).
3. Especificar qué campos "pasan sin modificar" (ver **R12**).
4. Si el nodo devuelve JSON, la primera línea de su instrucción es la regla anti-teléfono-escacharrado (ver **R10**).

## Ejemplo aplicado (Revisión Inbound v4)

```
Lector   → produce {messageId, threadId, from, subject, body, reply_to_email}
Clasif.  → recibe {..., reply_to_email}; añade {tipo, producto_detectado, datos_lead}
Respond. → recibe {..., tipo, producto}; añade {respuesta: {plantilla_ref, saludo, cuerpo}}
Gmail    → recibe {respuesta, reply_to_email}; efecto lateral (envío), pass-through
```

El canonical `reply_to_email` se mantiene en **todos** los nodos (R13). El Respondedor NO lo renombra a `to` aunque así se llamara en la API Gmail — la traducción es responsabilidad del código del Connector, no del LLM.
