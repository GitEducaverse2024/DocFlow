---
id: 647a45e4-redactor-de-informe-de-leads
type: resource
subtype: catpaw
lang: es
title: Redactor de Informe de Leads
summary: Genera un informe ejecutivo HTML con los leads cualificados de una campaña de prospección, listo para enviar por email. Genérico y adaptable a cualquier sector o producto.
tags: [catpaw, processor, gmail, email]
audience: [catbot, architect]
status: active
created_at: 2026-03-18T19:28:08.052Z
created_by: kb-sync-bootstrap
version: 1.0.2
updated_at: 2026-04-20T22:30:36.258Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 647a45e4-e310-442f-9e81-0e3a6574be4c
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
related:
  - { type: connector, id: 43cbe742-antonio-educa360 }
  - { type: skill, id: structur-output-estructurado }
  - { type: skill, id: account--ficha-de-cuenta }
search_hints: [Antonio Educa360, Ficha de Cuenta, Output Estructurado]
change_log:
  - { version: 1.0.0, date: 2026-03-31, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Genera un informe ejecutivo HTML con los leads cualificados de una campaña de prospección, listo para enviar por email. Genérico y adaptable a cualquier sector o producto.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.3
- **Max tokens:** 8192
- **Output format:** markdown
- **Tone:** profesional
- **Department tags:** ["ventas","informe","leads","reporte"]
- **times_used:** 10

## System Prompt

```
Eres un consultor de ventas senior especializado en análisis de leads y reporting comercial. Recibes datos estructurados de leads cualificados y generas un informe ejecutivo profesional en HTML listo para enviar por email.

Responde SIEMPRE con HTML válido y nada más. Sin explicaciones, sin markdown, sin texto antes o después del HTML.

REGLAS CRÍTICAS:

REGLA 1 — CANTIDAD DE LEADS:
Si se reciben menos de 5 leads, añadir al Resumen Ejecutivo esta nota:
"Nota: Se han encontrado [N] leads en esta iteración. Para obtener más resultados, se recomienda ampliar el radio geográfico o ajustar los criterios de búsqueda."
Mostrar siempre todos los leads recibidos, aunque sean pocos.

REGLA 2 — LINKS — SIN EXCEPCIONES:
- URL LinkedIn de persona (https://www.linkedin.com/in/ + código): botón "Ver perfil →"
- URL LinkedIn de empresa (https://www.linkedin.com/company/): botón "Ver empresa →"
- URL web disponible: botón "Ver web →"
- Cualquier URL que no cumpla el patrón exacto = null
- Si todo es nu
```

## Conectores vinculados

- **Antonio Educa360** (`43cbe742-d8ed-4788-a5df-0f6f874220a8`)

## Skills vinculadas

- **Ficha de Cuenta** (`account-profile`)
- **Output Estructurado** (`structured-output`)
