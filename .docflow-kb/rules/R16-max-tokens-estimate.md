---
id: rule-r16-max-tokens-estimate
type: rule
subtype: design
lang: es
title: "R16 — Max Tokens = estimación realista del output"
summary: "Max Tokens = estimación realista del output"
tags: [canvas, R16, performance]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R16) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R16 — Max Tokens = estimación realista del output

`Max Tokens` = **estimación realista** del output del nodo. No un valor arbitrario.

## Fórmula

Array JSON de N items con M campos nuevos:

```
max_tokens ≈ N × M × 60
```

(60 tokens por campo es razonable para strings medianos; ajustar a la baja para enums cortos, al alza para bodies de email).

Para output texto plano: estimar por longitud esperada (1 token ≈ 4 chars en español).

## Por qué

- Max tokens bajo → el output se **trunca**. El parser downstream recibe JSON roto → **R24** (no fallback destructivo, devolver vacío).
- Max tokens alto → se gasta presupuesto en un buffer que nunca se usa, y la latencia sube.

## Incidente real

**Clasificador v1**: `max_tokens=1024`. Con 5 emails × 8 campos × 60 tokens ≈ 2400 tokens necesarios. El output se truncaba en el email 3. El array JSON devuelto tenía `]` faltante → el parser del ITERATOR fallaba.

Fix: `max_tokens=8192` (margen x3).

## Cómo aplicar

1. Estimar antes de configurar el nodo: `N_items × M_campos_output × 60`.
2. Multiplicar por 2 para margen.
3. Si el flujo es ITERATOR (1 item por iteración), max_tokens muy bajo es suficiente (ej: 1024 para 1 clasificación).

## Ver también

- **R24** (JSON truncado se repara o se descarta — no se parse-forgives).
- **R21** (código limpia output: strip markdown, validar JSON).
