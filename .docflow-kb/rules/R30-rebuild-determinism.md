---
id: rule-r30-rebuild-determinism
type: rule
subtype: safety
lang: es
title: "R30 — Rebuild determinístico: .docflow-legacy/orphans/ NO se resucita"
summary: "kb-sync --full-rebuild --source db excluye archivos en .docflow-legacy/orphans/ (archivado = frozen). Re-admisión opt-in: node scripts/kb-sync.cjs --restore --from-legacy <id>."
tags: [retention, lifecycle, kb-sync, rebuild, R30, safety, critical]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-157
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-157
source_of_truth: null
related:
  - { type: rule, id: rule-r29-docker-rebuild-execute-catpaw }
search_hints: ["rebuild determinism", "archive semantics", "restore from legacy", "orphans", "archivados", "resurrection", "loadArchivedIds", "--restore --from-legacy"]
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-157, change: "Created for Phase 157 KB-46 — codifies rebuild determinism + --restore opt-in" }
ttl: never
---

# R30 — Rebuild determinístico (Phase 157)

**Regla absoluta:** `node scripts/kb-sync.cjs --full-rebuild --source db` NO resucita archivos que vivan en `.docflow-legacy/orphans/<subtype>/`. Archivado es frozen hasta re-admisión explícita.

## Por qué

- Antes de Phase 157, el commit `06d69af7` demostró que un `--full-rebuild --source db` regeneraba archivos en `.docflow-kb/resources/` aunque una copia hubiera sido archivada a `.docflow-legacy/orphans/` por cleanup previo (Phase 156-03). Era una **regression silenciosa**: el operador creía que archivó un recurso, pero al siguiente rebuild volvía.
- La raíz era que `populateFromDb` iteraba DB rows sin consultar el estado de lifecycle del archivo destino. Phase 157 Plan 01 añadió `loadArchivedIds(kbRoot)` para indexar `.docflow-legacy/orphans/<subtype>/*.md` y un check O(1) en Pass-2 antes de escribir.

## Cómo aplicar

1. **Archivar un recurso** (hoy, post-Phase 156-03): `git mv .docflow-kb/resources/<subtype>/<id>.md .docflow-legacy/orphans/<subtype>/<id>.md`. El archivo sigue versionado en git (reversible), y fuera del ciclo automático de sync.
2. **Correr rebuild**: `node scripts/kb-sync.cjs --full-rebuild --source db` verá el archivo archivado y emitirá `WARN [archived-skip] <subtype>/<id>`, **sin escribir nada** en `resources/`. El PLAN summary muestra `skipped_archived: N`.
3. **Re-admitir un archivo archivado** (opt-in explícito):

   ```bash
   node scripts/kb-sync.cjs --restore --from-legacy <short-id-slug>
   # Ejemplo: --restore --from-legacy 72ef0fe5-redactor-informe-inbound
   ```

   Atómico via `fs.renameSync`. Tras esto, re-correr `--full-rebuild --source db` para re-indexar.

## Exit codes de `--restore`

| Código | Significado                                                                   |
| ------ | ----------------------------------------------------------------------------- |
| `0`    | archivo movido correctamente                                                  |
| `1`    | missing `--from-legacy <id>` (flag o valor ausente)                           |
| `2`    | id no encontrado en ningún subdir, o ambiguo (presente en >1 subdir)          |
| `3`    | destination conflict (archivo ya existe en `resources/`; `git rm` primero)    |

## Alternativa: `git mv` manual (history-preserving)

`--restore` usa `fs.renameSync` y rompe `git log --follow`. Si se quiere preservar historial:

```bash
git mv .docflow-legacy/orphans/<subtype>/<id>.md .docflow-kb/resources/<subtype>/<id>.md
node scripts/kb-sync.cjs --full-rebuild --source db
```

Mismo resultado, diferente ergonomía.

## Body-sections en rebuild (Phase 157-02)

`buildBody(subtype, row, relations)` renderiza `## Conectores vinculados` + `## Skills vinculadas` en CatPaws byte-equivalentes al runtime `syncResource('catpaw','update')`. Esto cierra el drift donde sólo los CatPaws editados post-despliegue tenían las secciones.

## Anti-ejemplo

```bash
# BAD — Asumir que el archivo en .docflow-legacy/orphans/ re-aparecerá tras rebuild
# (era cierto pre-Phase-157; ya NO)
mv .docflow-legacy/orphans/catpaws/foo.md /tmp/backup-foo.md  # (mental model wrong)
node scripts/kb-sync.cjs --full-rebuild --source db          # no resucita

# GOOD — Usar --restore opt-in
node scripts/kb-sync.cjs --restore --from-legacy foo
node scripts/kb-sync.cjs --full-rebuild --source db
```

## Relacionado

- `.docflow-kb/_manual.md` §Retention Policy > Rebuild Determinism (Phase 157).
- `scripts/kb-sync.cjs` función `cmdRestore` + dispatcher branch en `main()`.
- `scripts/kb-sync-db-source.cjs` función `loadArchivedIds` + Pass-2 exclude en `populateFromDb`.
- `.planning/phases/157-kb-rebuild-determinism/157-CONTEXT.md` — root cause analysis.
