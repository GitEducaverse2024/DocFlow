---
id: rule-r04-minimal-first-flow
type: rule
subtype: design
lang: es
title: "R04 — Probar el flujo mínimo antes de añadir nodos"
summary: "Probar el flujo mínimo antes de añadir nodos"
tags: [canvas, R04, testing]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R04) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R04 — Probar el flujo mínimo antes de añadir nodos

Probar el flujo mínimo (**START → primer nodo LLM → Output**) con datos reales ANTES de añadir más nodos. Añadir un nodo por iteración, validar, seguir.

## Por qué

Construir el canvas entero de una vez produce una maraña de 8 errores encadenados. Cuando algo falla, no sabes si fue el Respondedor, el Clasificador, el Maquetador, o el contrato entre ellos.

## Cómo aplicar (metodología fase a fase)

1. **Fase 1:** `START → Lector → Output`. Validar que el Lector produce JSON parseable, BlastFunnels capturado, cantidad esperada de items.
2. **Fase 2:** añadir ITERATOR + ITERATOR_END. Validar 6/6 items parseados.
3. **Fase 3:** añadir Clasificador dentro del loop. Validar 6/6 clasificados correctamente.
4. **Fase 4:** añadir Respondedor + Connector de envío. Validar con 1 email real.
5. **Fase 5:** post-loop (Storage + Informe + Output).

## Ejemplo aplicado (Revisión Inbound v4)

Según el historial en `protocols/catflow-inbound-review.md`:

- Fase 1 (Lector): 3 iteraciones para ajustar body 200→500→800 chars.
- Fase 2 (Iterator): 1 iteración, OK.
- Fase 3 (Clasificador): 1 iteración, OK.
- Fase 4a (Resp+Maq LLM): 2 iteraciones y FRACASO — backtrack.
- Fase 4b (Connector código, corrige el Maq): 1 iteración, OK.

Sin fase-a-fase, el fracaso de Fase 4a se habría confundido con un bug en el Lector o el Clasificador.
