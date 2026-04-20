---
id: incident-inc-05
type: incident
lang: es
title: "INC-05 — Deploy Docker necesario tras cambios en execute-catpaw.ts"
summary: "Deploy Docker necesario tras cambios en execute-catpaw.ts"
tags: [canvas, ops, canvas]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/incidents-log.md §INC-05" }
ttl: never
---

# INC-05 — Deploy Docker necesario tras cambios en execute-catpaw.ts

**Fecha:** 2026-03-31
**Severidad:** OPERATIVA

## Síntoma

Tras corregir `execute-catpaw.ts` localmente, los canvases en Docker seguían sin funcionar.

## Causa raíz

La app corre en Docker. Los cambios en el código fuente local no se reflejan hasta hacer `docker compose build && docker compose up -d`.

## Solución

Protocolo de deploy:

```bash
cd ~/docflow
docker compose build --no-cache
docker compose up -d
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/
docker restart docflow-app
```

## Regla para el futuro

Cualquier cambio en `execute-catpaw.ts` (u otros services consumidos en runtime) requiere rebuild. Las skills de CatBot deben recordárselo al usuario.
