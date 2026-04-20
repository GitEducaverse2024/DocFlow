---
id: rule-r20-code-over-llm
type: rule
subtype: design
lang: es
title: "R20 — Si puede hacerse con código, NO delegarlo al LLM"
summary: "Si puede hacerse con código, NO delegarlo al LLM"
tags: [canvas, R20, performance, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R20) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R20 — Si puede hacerse con código, NO delegarlo al LLM

Si puede hacerse con **código** (render template, enviar email, mark_read, buscar DB), NO delegarlo al LLM. El LLM produce el **ESQUEMA**. El código **EJECUTA**.

## Por qué

- Código = determinista, barato, rápido, testeable.
- LLM = probabilístico, caro, lento, frágil ante formato.

Cada tarea "ejecutable" delegada al LLM es un punto de fallo adicional que no aporta valor — el LLM no tiene que "decidir" cómo enviar un email, solo qué decir en el body.

## Ejemplo transformación (Revisión Inbound v3 → v4)

**v3 (3 nodos LLM):**

```
Respondedor (LLM: rellena esquema + redacta)
  ↓
Maquetador (LLM: list_templates + get_template + render_template)
  ↓
Ejecutor (LLM: send_email + mark_as_read)
```

**v4 (1 nodo LLM + 1 connector código):**

```
Respondedor (LLM: rellena esquema + redacta)
  ↓
Connector email+gmail (CÓDIGO: render + send + mark_read)
```

Resultado: 50% menos tokens, 0 errores de template, 100% determinista, 0 tool-calls LLM para ejecución.

## Cómo aplicar

Para cada nodo del pipeline, preguntarse: "¿Esto requiere juicio o solo ejecución mecánica?"

| Tarea | Juicio / Ejecución | Nodo correcto |
|-------|-------------------|---------------|
| Clasificar email (lead/spam) | Juicio | LLM |
| Redactar respuesta | Juicio | LLM |
| Seleccionar plantilla | Juicio | LLM (skill) |
| Maquetar HTML | Ejecución | Código |
| Enviar email | Ejecución | Código |
| Mark as read | Ejecución | Código |
| Filtrar duplicados por messageId | Ejecución | Código |
| Consultar DB | Ejecución | Código |
| Log al informe final | Ejecución | Código |

## Ver también

- **R19** (selección vs maquetación).
- **R23** (separar nodos de pensamiento de nodos de ejecución).
