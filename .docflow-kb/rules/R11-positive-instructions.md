---
id: rule-r11-positive-instructions
type: rule
subtype: design
lang: es
title: "R11 — Las instrucciones dicen QUÉ hacer, no prohíben"
summary: "Las instrucciones dicen QUÉ hacer, no prohíben"
tags: [canvas, R11, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R11) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R11 — Las instrucciones dicen QUÉ hacer, no prohíben

Las instrucciones dicen **QUÉ hacer**, no prohíben. Si escribes "NO hagas X" cinco veces, **cambia el tipo de nodo** o el diseño.

## Por qué

Los modelos LLM son razonablemente buenos siguiendo instrucciones positivas (`"clasifica en X|Y|Z"`) y sorprendentemente malos siguiendo listas de prohibiciones (`"no hagas A, no hagas B, no hagas C..."`). La negación es contexto que confunde: el modelo "ve" A, B, C como opciones posibles.

## Cómo aplicar

1. Primera redacción: positiva. "Haz X. Devuelve Y con estos campos".
2. Si aparece una prohibición: preguntarse si el diseño es correcto.
3. Si necesitas varias prohibiciones: cambia el tipo de nodo (ej: condición → código), divide responsabilidades, o elimina el conector que provoca la tentación.

## Ejemplo

**Malo:**

```
NO llames a send_email.
NO modifiques el campo messageId.
NO rellenes reply_to_email si está vacío.
NO uses markdown.
NO respondas si el email es spam.
```

5 negaciones → el diseño está mal. El Respondedor NO debería tener Gmail vinculado (R08), NO debería recibir spam en primer lugar (filtrar en el Clasificador), y NO debería tener permiso de modificar messageId (contrato JSON estricto, R10).

**Bueno:**

```
Redacta la respuesta en texto plano para los emails con tipo="lead".
Devuelve el objeto con un campo "respuesta": {plantilla_ref, saludo, cuerpo}.
Mantén TODOS los campos originales intactos.
Para tipo≠"lead", copia el objeto sin añadir "respuesta".
```

## Ver también

- **R05** (un nodo, una responsabilidad).
- **R08** (no vincular tools innecesarios).
