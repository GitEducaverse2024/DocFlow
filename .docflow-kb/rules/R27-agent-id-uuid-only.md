---
id: rule-r27-agent-id-uuid-only
type: rule
subtype: safety
lang: es
title: "R27 — agentId en canvas: solo UUIDs, nunca slugs"
summary: "Los nodos CatPaw en canvas referencian al agente por UUID real de la tabla cat_paws; inventar slugs tipo 'operador-holded' rompe el dispatcher"
tags: [canvas, catpaw, R27, safety, critical]
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

# R27 — agentId en canvas: solo UUIDs

**Regla absoluta:** el campo `agentId` de un nodo CatPaw en canvas MUST ser el UUID real del row en la tabla `cat_paws` (ej: `53f19c51-...`). JAMÁS inventar slugs legibles (ej: `operador-holded`, `consultor-crm`).

## Por qué

- `canvas-executor.ts` hace `SELECT * FROM cat_paws WHERE id = :agentId`. Slug = no match = canvas rompe con "CatPaw not found" en runtime.
- Phase 150 + 153 pueblan `.docflow-kb/resources/catpaws/` usando el UUID como id; romper esta convención desincroniza el KB.
- Los UUIDs están en `list_cat_paws` y en `.docflow-kb/resources/catpaws/*.md` frontmatter `id:`. Nunca hace falta inventarlos.

## Cómo aplicar

1. Antes de construir un canvas que referencie un CatPaw: `list_cat_paws()` o `search_kb({type:"resource", subtype:"catpaw"})`.
2. Copiar el UUID exacto (36 chars) al campo `agentId` del nodo.
3. Si el CatPaw necesario no existe: `create_cat_paw(...)`, capturar el `id` del response, usarlo.

## Anti-ejemplo (NO hacer)
```json
{ "type": "catpaw", "agentId": "operador-holded", "instructions": "..." }
```
Right:
```json
{ "type": "catpaw", "agentId": "53f19c51-aaaa-bbbb-cccc-dddddddddddd", "instructions": "..." }
```

## Relacionado

- R13 — Canonical field names
- R26 — canvas-executor.ts inmutable (depende de este contrato)
