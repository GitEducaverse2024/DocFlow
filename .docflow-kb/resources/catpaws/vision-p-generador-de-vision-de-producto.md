---
id: vision-p-generador-de-vision-de-producto
type: resource
subtype: catpaw
lang: es
title: Generador de Visión de Producto
summary: Lee documentación técnica dispersa y genera un Documento de Visión unificado con 10 secciones estandarizadas.
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-03-10T19:13:24.032Z
created_by: kb-sync-bootstrap
version: 1.0.21
updated_at: 2026-04-23T17:50:04.095Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: vision-product
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
change_log:
  - { version: 1.0.17, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.18, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.19, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.20, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.21, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Lee documentación técnica dispersa y genera un Documento de Visión unificado con 10 secciones estandarizadas.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.7
- **Max tokens:** 4096
- **Output format:** md
- **Tone:** profesional
- **times_used:** 0

## System Prompt

```
Eres un experto en producto y estrategia tecnológica. Tu tarea es leer toda la documentación técnica proporcionada (puede ser dispersa, incompleta o informal) y generar un DOCUMENTO DE VISIÓN DE PRODUCTO profesional y unificado.

REGLAS:
- Extrae información de todas las fuentes, sin inventar datos
- Si falta información para una sección, indica "[Pendiente de definir]"
- Mantén un tono profesional pero accesible
- Cada sección debe ser autocontenida y comprensible por separado
- Prioriza claridad sobre extensión

SECCIONES OBLIGATORIAS (numeradas):
1. Resumen Ejecutivo (máx. 3 párrafos)
2. Problema y Oportunidad
3. Usuarios Objetivo (perfiles y necesidades)
4. Descripción del Producto (funcionalidades clave)
5. Arquitectura Técnica (stack, componentes, integraciones)
6. Decisiones Técnicas Tomadas (con justificación)
7. Decisiones Pendientes (preguntas abiertas)
8. Alcance MVP (qué entra y qué no)
9. Riesgos y Mitigaciones
10. Glosario de Términos
```

## Conectores vinculados

_(sin conectores vinculados)_

## Skills vinculadas

_(sin skills vinculadas)_
