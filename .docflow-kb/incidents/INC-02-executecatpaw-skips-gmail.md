---
id: incident-inc-02
type: incident
lang: es
title: "INC-02 — executeCatPaw() skipea Gmail — tools no disponibles en canvas"
summary: "executeCatPaw() skipea Gmail — tools no disponibles en canvas"
tags: [canvas, catpaw, gmail, ops]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/incidents-log.md §INC-02" }
ttl: never
---

# INC-02 — executeCatPaw() skipea Gmail — tools no disponibles en canvas

**Fecha:** 2026-03-31
**Severidad:** CRITICA — incluso con CatPaw vinculado, Gmail no funcionaba

## Síntoma

Un nodo Agent con CatPaw que tiene conector Gmail vinculado ejecuta el CatPaw pero las tools de Gmail no aparecen. El agente no puede buscar, leer ni enviar emails.

## Causa raíz

En `execute-catpaw.ts` linea 119:

```typescript
if (['google_drive', 'gmail'].includes(conn.connector_type)) {
  // Skip connector types that require specialized clients
  continue;
}
```

El código skipea Gmail y Drive en la fase de invocación de conectores. Drive ya tenía tool-calling implementado más abajo, pero Gmail no.

## Solución

1. Importar `getGmailToolsForPaw` y `executeGmailToolCall` en `execute-catpaw.ts`.
2. Cargar Gmail tools junto a Drive tools en la sección 5 (build tool definitions).
3. Añadir Gmail dispatch en el tool-calling loop (sección 6).
4. El skip ahora solo evita la invocación directa del conector pero las tools se cargan correctamente.

**Archivos modificados:** `app/src/lib/services/execute-catpaw.ts`.
**Estado:** RESUELTO — requirió docker rebuild para desplegar.

## Regla para el futuro

Cuando se añada un nuevo connector_type que requiera cliente especializado, hacer lo mismo: cargar tools en la sección 5, añadir dispatch en el loop, y saltar la invocación directa.
