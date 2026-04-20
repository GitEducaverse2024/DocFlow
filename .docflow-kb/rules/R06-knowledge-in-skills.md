---
id: rule-r06-knowledge-in-skills
type: rule
subtype: design
lang: es
title: "R06 — Conocimiento de negocio en skills, no en instrucciones del nodo"
summary: "Conocimiento de negocio en skills, no en instrucciones del nodo"
tags: [canvas, R06, learning]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R06) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R06 — Conocimiento de negocio en skills, no en instrucciones del nodo

El conocimiento de negocio va en **skills**, no en las instrucciones del nodo. Las instrucciones definen el protocolo de pasos. Las skills aportan la inteligencia.

## Por qué

- Instrucciones = **qué hacer** (protocolo: parsear input, clasificar, devolver JSON con estos campos).
- Skills = **cómo decidir bien** (conocimiento: lista de productos, heurísticas de leads cualificados, plantillas disponibles, tono de voz).

Mezclar ambos hace las instrucciones enormes, imposibles de mantener, y diluye la señal del protocolo.

## Cómo aplicar

1. Si la instrucción empieza a enumerar "productos disponibles son X, Y, Z con precios...", eso va a una skill.
2. Si la instrucción dice "clasifica según este criterio", el criterio detallado va a una skill.
3. La instrucción del nodo queda cortita: "Aplica la skill `Leads y Funnel Educa360` para clasificar este email. Devuelve `{tipo, producto_detectado}`".

## Ejemplo

**Malo:**

```
Instrucciones del Clasificador (500 líneas):
- Si el email habla de matemáticas primaria → Pro-K12
- Si habla de Rubí → Pro-REVI
- Si menciona blastfunnels → es spam de sistema
- [lista de 40 productos...]
```

**Bueno:**

```
Instrucciones del Clasificador:
Clasifica el email usando la skill "Leads y Funnel Educa360".
Devuelve JSON {tipo: "lead|registro|spam|sistema", producto_detectado: "ref_code"}.
PASA SIN MODIFICAR todos los campos del input.

Skill "Leads y Funnel Educa360" (vinculada):
[las 500 líneas con productos, criterios, ejemplos]
```

## Beneficios

- La skill se reutiliza en otros canvases.
- Las actualizaciones de catálogo (nuevo producto) no tocan el canvas.
- Testeo del protocolo independiente del conocimiento.
