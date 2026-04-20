---
id: rule-r28-env-bracket-notation
type: rule
subtype: safety
lang: es
title: "R28 — process['env']['X'] obligatorio, nunca process.env.X"
summary: "Webpack inlines process.env.X at build time — bracket notation escapes inline substitution and keeps runtime access"
tags: [build, R28, safety, critical]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-155
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-155
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-155, change: "Migrated from CLAUDE.md §Restricciones absolutas (phase 155 cleanup)" }
ttl: never
---

# R28 — process['env']['X'] bracket notation

**Regla absoluta:** acceder a variables de entorno SIEMPRE con `process['env']['X']` (bracket notation). JAMÁS `process.env.X` (dot notation).

## Por qué

Next.js + webpack inliinan `process.env.X` en tiempo de build: el string `"process.env.STRIPE_KEY"` en el source se reemplaza por el valor literal antes del bundle. Si el valor no existía al build (docker build sin env) → queda como `undefined` literal en el bundle.

Bracket notation (`process['env']['STRIPE_KEY']`) es opaca al análisis estático de webpack y se preserva como acceso dinámico al objeto `process.env` en runtime, que SÍ tiene los valores correctos cuando el container arranca con `docker compose up`.

## Cómo aplicar

- API routes, services, lib: todo acceso a env var usa bracket notation.
- Type declaration si hace falta:
  ```typescript
  declare const process: { env: Record<string, string | undefined> };
  ```
- Config constante tipada: extraer al top del file una vez, usar la constante downstream:
  ```typescript
  const STRIPE_KEY = process['env']['STRIPE_KEY'] ?? throwMissing('STRIPE_KEY');
  ```

## Anti-ejemplo
```typescript
// BAD — webpack inlines at build time
const url = process.env.QDRANT_URL;
```
Right:
```typescript
// GOOD — preserved as runtime access
const url = process['env']['QDRANT_URL'];
```

## Relacionado

- R29 — Docker rebuild tras execute-catpaw.ts (otro gotcha de webpack/Docker)
- MEMORY §Architecture: "process.env: Use process['env']['VARIABLE'] (bracket notation) to bypass webpack inlining at build time"
