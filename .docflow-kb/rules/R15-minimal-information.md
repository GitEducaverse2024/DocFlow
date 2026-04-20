---
id: rule-r15-minimal-information
type: rule
subtype: design
lang: es
title: "R15 — Un nodo LLM recibe la cantidad mínima de información necesaria"
summary: "Un nodo LLM recibe la cantidad mínima de información necesaria"
tags: [canvas, R15, performance]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R15) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R15 — Un nodo LLM recibe la cantidad mínima de información necesaria

Un nodo LLM recibe la cantidad **MÍNIMA** de información necesaria para hacer su trabajo. Recortar body de emails, limitar campos, eliminar metadatos irrelevantes.

## Por qué

- **Coste:** más tokens = más dinero y más latencia.
- **Calidad:** más contexto irrelevante = más ruido = peor señal. El LLM distrae su atención.
- **Max tokens output (R16):** el output estima el input + los campos añadidos. Input gordo → output truncado.

## Cómo aplicar

1. El Lector recorta el body de cada email a 800 chars (preservando subject completo).
2. El Clasificador recibe `{from, subject, body_snippet}`, no `{from, subject, body, html_body, raw_headers, attachments}`.
3. El Respondedor recibe `{producto_detectado, datos_lead, tipo}` — ya no necesita el body completo porque el Clasificador ya extrajo lo relevante.
4. Campos técnicos necesarios downstream (`messageId`, `threadId`, `reply_to_email`) se conservan (R10, R13) — son identificadores, no contenido.

## Ejemplo aplicado (Revisión Inbound v4 — Fase 1, 3 iteraciones)

| Iteración | body snippet | Resultado |
|-----------|-------------|-----------|
| 1 | 200 chars | Clasificador no veía el CTA — clasificaba mal leads cortos |
| 2 | 500 chars | Clasificaba OK en 4/6 casos; 2 leads borderline mal |
| 3 | 800 chars | 6/6 OK, coste manejable |

El óptimo no fue ni 200 ni 4000 — se encontró empíricamente.

## Ver también

- **R16** (max_tokens estimación realista).
- **R17** (LLM es probabilístico — el recorte reduce la varianza).
