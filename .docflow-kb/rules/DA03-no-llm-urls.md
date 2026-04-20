---
id: rule-da03-no-llm-urls
type: rule
subtype: anti-pattern
lang: es
title: "DA03 — No generes URLs con LLM"
summary: "No generes URLs con LLM, usa campos especificos del output del tool"
tags: [canvas, DA03, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-155
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-155
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-155, change: "Migrated from app/data/knowledge/canvas-rules-index.md §Side Effects Guards + Anti-patterns (phase 155 cleanup)" }
ttl: never
---

# DA03 — No generes URLs con LLM

No uses un LLM para generar URLs (tracking, redirect, deep-link). Usa campos específicos del output del tool emisor.

## Por qué

Los LLMs confunden dominios, parámetros y encoding con alta frecuencia. Bugs reales:
- URLs a `docatflow.com` en vez de `docflow.com` (domain-swap hallucination).
- Query params `?utm_source=x&utm_medium=y` perdidos o reordenados.
- Percent-encoding inconsistente en IDs con caracteres especiales.
- `tracking_id` sustituido por un placeholder inventado.

## Cómo aplicar

1. El emitter (connector, tool) devuelve la URL/ID como campo estructurado en su output (`{tracking_url, short_id, deep_link}`).
2. Los nodos downstream lo consumen por **field-name**, no regeneran la URL.
3. Si se necesita un URL derivado (ej. `${base}/leads/${id}`), genéralo con código (template string en el connector o en un nodo de tipo "transformer con código"), no con un LLM (ver **R20**).

## Relacionado

- **R20** (si puede hacerse con código, no delegar al LLM).
- **R21** (el código limpia y valida output del LLM — incluye URLs si se colaran).
