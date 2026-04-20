---
id: analisis-analisis-dafo
type: resource
subtype: skill
lang: es
title: Análisis DAFO
summary: Genera un análisis DAFO (Debilidades, Amenazas, Fortalezas, Oportunidades) del proyecto documentado.
tags: [skill]
audience: [catbot, developer]
status: active
created_at: 2026-03-10T19:53:02.987Z
created_by: kb-sync-bootstrap
version: 1.0.12
updated_at: 2026-04-20T22:31:20.511Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: analisis-dafo
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used]
change_log:
  - { version: 1.0.8, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.9, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.10, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.11, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.12, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Genera un análisis DAFO (Debilidades, Amenazas, Fortalezas, Oportunidades) del proyecto documentado.

## Configuración

- **Category:** strategy
- **Source:** built-in
- **Version:** 1.0
- **Author:** DocFlow
- **times_used:** 0

## Instrucciones

Analiza toda la documentación proporcionada y genera un análisis DAFO (SWOT) completo del proyecto o producto.

ESTRUCTURA:
- **Fortalezas** (internas, positivas): Ventajas técnicas, equipo, recursos, features únicos
- **Debilidades** (internas, negativas): Limitaciones técnicas, deuda técnica, gaps de conocimiento
- **Oportunidades** (externas, positivas): Mercado, tendencias, integraciones posibles
- **Amenazas** (externas, negativas): Competencia, riesgos regulatorios, dependencias externas

REGLAS:
- Mínimo 3 items por cuadrante
- Cada item debe ser específico y basado en la documentación (no genérico)
- Incluir una sección de "Estrategias cruzadas" (FO, FA, DO, DA)
- Priorizar items por impacto
- Cerrar con 3 recomendaciones accionables
