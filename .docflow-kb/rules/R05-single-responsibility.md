---
id: rule-r05-single-responsibility
type: rule
subtype: design
lang: es
title: "R05 — Un nodo = una responsabilidad"
summary: "Un nodo = una responsabilidad"
tags: [canvas, R05, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R05) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R05 — Un nodo = una responsabilidad

Un nodo = una responsabilidad. Si un nodo redacta + maqueta + selecciona plantilla, **dividirlo**.

## Por qué

- El LLM con 3 responsabilidades las ejecuta peor que 3 LLMs con 1 cada uno.
- Debugging imposible: si el email sale mal, ¿falló la redacción o la maquetación?
- Las instrucciones se vuelven una lista de negaciones (ver **R11**).

## Cómo aplicar

- Redactar ≠ maquetar ≠ seleccionar plantilla ≠ enviar.
- Cada una es un nodo (si LLM) o un paso dentro de un connector de código (si determinista).

## Ejemplo

**Anti-pattern (v3):**

```
Nodo Redactor-Maquetador-Ejecutor
  - redacta respuesta con plantilla Pro-K12
  - convierte a HTML con inline styles
  - llama gmail_send con el HTML
```

**Pattern correcto (v4):**

```
Nodo Respondedor (LLM, responsabilidad: redactar)
  - produce {respuesta: {plantilla_ref, saludo, cuerpo}}
Connector email-template (código, responsabilidad: renderizar)
  - render_template(plantilla_ref, {saludo, cuerpo}) → html
Connector Gmail (código, responsabilidad: enviar)
  - send_email(to, subject, html)
```

## Corolarios

- Ver **R23** (separar nodos de pensamiento de nodos de ejecución).
- Ver **R20** (si puede hacerse con código, no delegar al LLM).
