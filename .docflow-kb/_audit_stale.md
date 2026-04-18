---
id: audit-stale-2026-04-18
type: audit
subtype: null
lang: es
title: Audit stale 2026-04-18
summary: Archivos elegibles para archivado/purga
tags: [ops]
audience: [developer]
status: active
created_at: 2026-04-18T15:31:38.056Z
created_by: kb-sync-cli
version: 1.0.0
updated_at: 2026-04-18T15:31:38.056Z
updated_by: kb-sync-cli
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-18, author: kb-sync-cli, change: Generado por --audit-stale }
ttl: never
eligible_for_purge: 0
warning_only: 0
warning_visible: false
---
# Audit de archivos stale — 2026-04-18

## Elegibles para archivado (180+ días sin acceso, deprecated)

| ID | Title | Deprecated since | Last access | Refs in-coming | Action |
|----|-------|------------------|-------------|----------------|--------|
| _(ninguno)_ | | | | | |

## Warning only (150+ días, aviso previo)

_(ninguno)_

---

**Para archivar los elegibles:**

    node scripts/kb-sync.cjs --archive --confirm
