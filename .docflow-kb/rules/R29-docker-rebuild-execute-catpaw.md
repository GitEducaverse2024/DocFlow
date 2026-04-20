---
id: rule-r29-docker-rebuild-execute-catpaw
type: rule
subtype: safety
lang: es
title: "R29 — Docker rebuild necesario tras cambios en execute-catpaw.ts"
summary: "execute-catpaw.ts forma parte del bundle server de Next; cambios SOLO se reflejan tras docker compose build + up -d"
tags: [docker, catpaw, R29, safety, critical]
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

# R29 — Docker rebuild tras execute-catpaw.ts

**Regla absoluta:** al modificar `app/src/lib/services/execute-catpaw.ts`, SIEMPRE seguir con:

```bash
cd /home/deskmath/docflow && docker compose build docflow && docker compose up -d
```

## Por qué

- `execute-catpaw.ts` se compila dentro del bundle Next.js server que se congela en la imagen Docker.
- `docker compose restart` SIN rebuild reinicia el container con la MISMA imagen → el código viejo se ejecuta → los cambios no aplican.
- Este gotcha ha causado ≥3 incidentes históricos "arreglé el bug pero el síntoma persiste".

## Cómo aplicar

1. Edita `execute-catpaw.ts` (o cualquier módulo server compilado al bundle).
2. `cd /home/deskmath/docflow`.
3. `docker compose build docflow` (sin `--no-cache` salvo que sospeches cache stale en una capa).
4. `docker compose up -d` (recrea el container con la imagen nueva).
5. Verifica: `docker logs docflow-app --tail 50` debe mostrar logs del reinicio reciente; ejecuta el caso de prueba que debería arreglarse.

## Cuándo SÍ basta con restart (sin rebuild)

- Cambios sólo en `.docflow-kb/` (volumen mount live-reads the host dir).
- Cambios sólo en `app/data/` (volumen mount).
- Cambios en env vars del docker-compose.yml (recreate pero no rebuild).

## Anti-ejemplo

```bash
# BAD — restart sin rebuild: cambios no aplican
docker restart docflow-app

# GOOD — build + up -d: imagen nueva, cambios aplicados
docker compose build docflow && docker compose up -d
```

## Relacionado

- R28 — process['env'] bracket notation (otro gotcha de webpack/bundle)
- MEMORY §Docker Build: full rebuild recipe
- R26 — canvas-executor.ts inmutable (execute-catpaw.ts sí se modifica, canvas-executor.ts no)
