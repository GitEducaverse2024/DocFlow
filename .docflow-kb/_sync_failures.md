---
id: sync-failures
type: audit
subtype: null
lang: es
title: Sync Failures Log
summary: Append-only log of Phase 153 hook failures for reconciliation.
tags: [ops]
audience: [developer]
status: active
created_at: 2026-04-23T13:01:53.094Z
created_by: kb-audit
version: 1.0.0
updated_at: 2026-04-23T13:01:53.094Z
updated_by: kb-audit
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-23, author: kb-audit, change: Initial creation by markStale hook }
ttl: never
---

# Sync Failures Log

Entries appended by Phase 153 hooks when `syncResource()` throws. Run
`node scripts/kb-sync.cjs --full-rebuild --source db` to reconcile.

| Timestamp | Reason | Entity | DB ID | KB Path | Error |
|-----------|--------|--------|-------|---------|-------|
| 2026-04-23T13:01:53.094Z | update-sync-failed | skills | skill-system-auditor-runs-v1 | resources/skills/skill-sy-auditor-de-runs.md | EACCES: permission denied, open '/docflow-kb/resources/skills/skill-sy-auditor-de-runs.md' |
