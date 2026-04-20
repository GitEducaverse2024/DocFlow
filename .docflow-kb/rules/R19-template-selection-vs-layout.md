---
id: rule-r19-template-selection-vs-layout
type: rule
subtype: design
lang: es
title: "R19 — Separar selección de plantilla (skill) de maquetación (código)"
summary: "Separar selección de plantilla (skill) de maquetación (código)"
tags: [canvas, R19, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R19) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R19 — Separar selección de plantilla (skill) de maquetación (código)

Separar **selección** de plantilla (responsabilidad del LLM via skill) de **maquetación** (responsabilidad del código). La skill decide **QUÉ** plantilla usar; el nodo connector **ejecuta** la maquetación.

## Por qué

- Seleccionar plantilla = juicio de negocio (skill "Leads y Funnel Educa360" mapea producto → RefCode).
- Maquetar plantilla = operación determinista (dado RefCode + variables, producir HTML).

Si el LLM maqueta, introduce variabilidad, consume rounds, y se equivoca con el CSS inline.

## Ejemplo aplicado (Revisión Inbound v4b → v4c)

- **v3 maquetador LLM:** el nodo LLM leía el RefCode, llamaba `get_template`, luego `render_template` con variables. Problemas: wrapping en markdown (R21), HTML mal formado 10% de veces, coste alto en tokens.
- **v4b:** eliminar el nodo Maquetador LLM, reemplazar por Connector `email-template` con `render_template(plantilla_ref, variables)` en código. El Respondedor solo produce `{plantilla_ref, saludo, cuerpo}`.
- **v4c:** añadir RefCode determinista — la skill mapea producto → RefCode de 6 chars. El LLM copia el código; el código del connector busca con lookup tolerante (ref_code → nombre → parcial → ID).

## Cómo aplicar

```
Nodo Respondedor (Agent LLM)
  instrucciones: "Devuelve {respuesta: {plantilla_ref, saludo, cuerpo}}"
  skill: "Leads y Funnel Educa360" (mapea producto → plantilla_ref)

Nodo Connector email-template (código)
  operation: render_template
  args: { template_id: {{respuesta.plantilla_ref}}, variables: {{respuesta}} }
```

## Beneficios

- 50% menos tokens (v3 → v4).
- 0 errores de HTML mal formado.
- Nueva plantilla = añadir RefCode + instruction block (no tocar el canvas).

## Ver también

- **R20** (código > LLM cuando sea posible).
- **R22** (RefCodes deterministas).
