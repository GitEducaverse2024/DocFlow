---
id: tests-un-tests-unitarios
type: resource
subtype: skill
lang: es
title: Tests unitarios
summary: Genera tests unitarios a partir de documentación de API o especificaciones técnicas.
tags: [skill, testing]
audience: [catbot, developer]
status: active
created_at: 2026-03-10T19:53:02.987Z
created_by: kb-sync-bootstrap
version: 1.0.18
updated_at: 2026-04-23T16:41:50.092Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: tests-unitarios
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.14, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.15, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.16, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.17, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.18, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Genera tests unitarios a partir de documentación de API o especificaciones técnicas.

## Configuración

- **Category:** technical
- **Source:** built-in
- **Version:** 1.0
- **Author:** DocFlow
- **times_used:** 0

## Instrucciones

Analiza la documentación técnica proporcionada (APIs, specs, requisitos) y genera tests unitarios completos.

REGLAS:
- Usar el framework de testing apropiado según el stack (Jest, Vitest, pytest, etc.)
- Cubrir: happy path, edge cases, error handling
- Cada test debe ser independiente y reproducible
- Nombres descriptivos en formato: "should [acción] when [condición]"
- Agrupar tests por funcionalidad (describe blocks)
- Incluir mocks para dependencias externas
- Mínimo 3 tests por endpoint/función documentada

ESTRUCTURA POR TEST:
1. Arrange: Setup de datos y mocks
2. Act: Ejecución de la función/llamada
3. Assert: Verificación del resultado

PRIORIDAD DE COBERTURA:
1. Validación de inputs
2. Happy path
3. Casos de error
4. Edge cases (null, empty, límites)
