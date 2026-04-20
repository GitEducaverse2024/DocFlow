---
phase: 156
plan: 03
artifact: orphan-audit
status: draft
created: 2026-04-20
generated_by: execute-plan-156-03 task-1
audit_script: /tmp/audit_orphans3.cjs (better-sqlite3 via app/node_modules; source_of_truth[].id matcher)
db_snapshot: /home/deskmath/docflow-data/docflow.db
---

# Phase 156-03 Orphan Audit

> Canonical audit of `.docflow-kb/resources/<entity>/*.md` files against the live production DB
> (`/home/deskmath/docflow-data/docflow.db`) at execution time (2026-04-20). Used as input for
> Task 2 (archive) and Task 3 (retention policy).

## §1 DB Row Counts

Source: live SQLite DB. None of the six entity tables have a `deleted_at` column, so `total` == `active`.

| Table             | Rows |
| ----------------- | ---: |
| `cat_paws`        |   38 |
| `skills`          |   43 |
| `canvases`        |    1 |
| `email_templates` |   15 |
| `connectors`      |   12 |
| `catbrains`       |    3 |
| **Total**         |  112 |

## §2 KB File Counts (pre-cleanup)

| KB folder                      | Total | `status: active` | `status: deprecated` |
| ------------------------------ | ----: | ---------------: | -------------------: |
| `resources/catpaws/`           |    46 |               44 |                    2 |
| `resources/skills/`            |    44 |               44 |                    0 |
| `resources/canvases/`          |     3 |                3 |                    0 |
| `resources/email-templates/`   |    17 |               16 |                    1 |
| `resources/connectors/`        |    14 |               12 |                    2 |
| `resources/catbrains/`         |     4 |                3 |                    1 |
| **Total**                      |   128 |              122 |                    6 |

## §3 Orphan List (verbatim)

Definition: A KB file is an orphan when its `source_of_truth[0].id` frontmatter value does NOT
exist as a row id in the corresponding DB table. This is the canonical matching rule per Phase
149/150/153 contract — NOT the filename UUID-prefix, which may drift.

### §3.1 catpaws (8 orphans — 6 active + 2 deprecated)

| File                                                    | Status     | Version | source_of_truth.id                      | Title                     |
| ------------------------------------------------------- | ---------- | ------: | --------------------------------------- | ------------------------- |
| `72ef0fe5-redactor-informe-inbound.md`                  | active     |   1.0.0 | 72ef0fe5-9132-4a08-bc4d-37e8bbb2e6bc    | Redactor Informe Inbound  |
| `7af5f0a7-lector-inbound.md`                            | active     |   1.0.0 | 7af5f0a7-24ed-4ada-814a-d5177c779724    | Lector Inbound            |
| `96c00f37-clasificador-inbound.md`                      | active     |   1.0.0 | 96c00f37-389c-4a1d-8a0d-b59a4a111c89    | Clasificador Inbound      |
| `98c3f27c-procesador-inbound.md`                        | active     |   1.0.0 | 98c3f27c-5b95-4723-9a0b-f0b78608e51d    | Procesador Inbound        |
| `9eb067d6-tester.md`                                    | deprecated |   2.0.0 | 9eb067d6-6bed-467a-afee-f54636260b6f    | Tester                    |
| `a56c8ee8-ejecutor-inbound.md`                          | active     |   1.0.0 | a56c8ee8-93b2-4f22-8934-218a4b23551d    | Ejecutor Inbound          |
| `a78bb00b-maquetador-inbound.md`                        | active     |   1.0.0 | a78bb00b-889d-42bf-8d8b-a0566320a0c8    | Maquetador Inbound        |
| `a88166cd-controlador-de-fichajes.md`                   | deprecated |   2.0.0 | a88166cd-7d65-46ec-83c6-141cbea9b93e    | Controlador de Fichajes   |

### §3.2 skills (1 orphan — 1 active)

| File                                              | Status | Version | source_of_truth.id                   | Title                    |
| ------------------------------------------------- | ------ | ------: | ------------------------------------ | ------------------------ |
| `4f7f5abf-leads-y-funnel-infoeduca.md`            | active |   1.0.0 | 4f7f5abf-d7b5-4140-bb2f-fc7d03d2d385 | Leads y Funnel InfoEduca |

Note: the remaining 43 skill `.md` files (including the `<8-char-slug>-<name>.md` seed files)
ARE legitimately tracked because their `source_of_truth[0].id` matches a live skills row id (e.g.,
`academic-researcher`, `executive-briefing`, `skill-system-catpaw-protocol-v1`). They are NOT
orphans. This corrects RESEARCH §E's "21 active orphans in skills" over-count, which used a
filename-prefix heuristic instead of `source_of_truth.id`.

### §3.3 canvases (2 orphans — 2 active)

| File                                         | Status | Version | source_of_truth.id                   | Title                     |
| -------------------------------------------- | ------ | ------: | ------------------------------------ | ------------------------- |
| `5a56962a-email-classifier-pilot.md`         | active |   1.0.0 | 5a56962a-6ea5-4e19-8a3a-9220d9f14f23 | Email Classifier Pilot    |
| `9366fa92-revision-diaria-inbound.md`        | active |   1.0.0 | 9366fa92-99c6-4ec9-8cf8-7c627ccd1d97 | Revisión Diaria Inbound   |

Note: `test-inb-test-inbound-fase-5-full-pipeline.md` is NOT an orphan — its `source_of_truth.id`
(the singular canvas DB row) is still present.

### §3.4 email-templates (1 orphan — 1 deprecated)

| File                                              | Status     | Version | source_of_truth.id                   | Title                        |
| ------------------------------------------------- | ---------- | ------: | ------------------------------------ | ---------------------------- |
| `720870b0-recordatorio-fichaje-semanal.md`        | deprecated |   2.0.0 | 720870b0-cabe-4d62-bfd7-c9a4a1b2244b | Recordatorio Fichaje Semanal |

### §3.5 connectors (2 orphans — 2 deprecated)

| File                                              | Status     | Version | source_of_truth.id                | Title                  |
| ------------------------------------------------- | ---------- | ------: | --------------------------------- | ---------------------- |
| `755315db-test-slack-webhook.md`                  | deprecated |   2.0.0 | 755315db-cd8f-4ff9-ae68-15f083dc06a3 | Test Slack Webhook    |
| `conn-gma-info-educa360-gmail.md`                 | deprecated |   1.0.0 | conn-gmail-info-educa360          | Info Educa360 (Gmail)  |

### §3.6 catbrains (1 orphan — 1 deprecated)

| File                                                 | Status     | Version | source_of_truth.id                   | Title                        |
| ---------------------------------------------------- | ---------- | ------: | ------------------------------------ | ---------------------------- |
| `a91ed58a-conocimiento-fichajes-holded.md`           | deprecated |   2.0.0 | a91ed58a-3790-4060-b6f9-e13f0c1ece3b | Conocimiento Fichajes Holded |

### §3.7 Totals

- **15 total orphans** (9 active + 6 deprecated + 0 other)

## §4 Expected Post-Cleanup State (per-entity invariant)

For every entity `(e, t)` in the table below, after Task 2 completes the invariant MUST hold:

```
# active KB files with a matching DB row
count(.docflow-kb/resources/<e>/*.md where source_of_truth[0].id ∈ DB.<t>.id)
==
# DB rows
SELECT COUNT(*) FROM <t>
```

| Entity           | DB table         | DB rows | KB active post-cleanup (expected) |
| ---------------- | ---------------- | ------: | --------------------------------: |
| catpaws          | cat_paws         |      38 |                                38 |
| skills           | skills           |      43 |                                43 |
| canvases         | canvases         |       1 |                                 1 |
| email-templates  | email_templates  |      15 |                                15 |
| connectors       | connectors       |      12 |                                12 |
| catbrains        | catbrains        |       3 |                                 3 |

Inverse check (orphans remaining): expected zero after Task 2.

> **Reverse-direction gap (OUT OF SCOPE for Plan 03):** there may be DB rows WITHOUT a matching
> KB file. This audit does not quantify that direction because: (a) scope of KB-43 is orphan
> removal, not regeneration; (b) Phase 153 hooks created the KB files that do exist, and any
> remaining DB-only rows are pre-hook legacy that require a separate `kb-sync --full-rebuild
> --source=db` pass. Deferred to a future gap-closure plan (trackable as KB-44 if needed).

## §5 Deltas vs RESEARCH §E Snapshot (2026-04-20)

RESEARCH §E claimed "40 orphans = 34 active + 6 deprecated". This plan's re-audit found **15 orphans
(9 active + 6 deprecated)** — a **−25 orphan delta**. Root cause:

1. **RESEARCH §E used a filename-based heuristic** (8-char UUID prefix match against DB). That
   rule correctly flagged UUID-prefixed orphans but **over-counted** legacy seed skill files
   with slug-based filenames (e.g., `academic-investigador-academico.md`) because their filename
   prefix "academic" did not match any UUID in the DB — yet their frontmatter
   `source_of_truth[0].id: academic-researcher` DID match. Those 20+ seed skill files are NOT
   orphans; they are the correct canonical representations of slug-id DB rows.
2. **The deprecated count is identical** (6 in both audits) because the 6 deprecated files were
   soft-deleted by hook flows (Phase 153/155/156-01/02) which set `source_of_truth.id` correctly;
   both audits agree on these.
3. **Reconciled active orphans (9, not 34):** the canvas/catpaw Inbound pipeline files are the
   only legitimate active orphans — they are stale drafts from Phase 136-era workflows whose DB
   rows have since been deleted via legacy DELETE paths pre-Phase-153 hooks. The `4f7f5abf-leads-y-funnel-infoeduca.md`
   is a duplicate slug (the live DB row `a0517313-...` owns that skill now); and the two canvas
   files are pre-Phase-156-01 creations.

The plan's archive policy (move all orphans to `.docflow-legacy/orphans/<entity>/` via `git mv`)
remains correct regardless of the count delta. Task 2 adapts to 15 moves instead of 40.

## §6 Archive Plan (file → destination mapping)

Operation: `git mv <source> <destination>` (preserves history). Destination parent dirs created in
Task 2 via `mkdir -p`.

### catpaws (8 moves)

```
.docflow-kb/resources/catpaws/72ef0fe5-redactor-informe-inbound.md      → .docflow-legacy/orphans/catpaws/
.docflow-kb/resources/catpaws/7af5f0a7-lector-inbound.md                → .docflow-legacy/orphans/catpaws/
.docflow-kb/resources/catpaws/96c00f37-clasificador-inbound.md          → .docflow-legacy/orphans/catpaws/
.docflow-kb/resources/catpaws/98c3f27c-procesador-inbound.md            → .docflow-legacy/orphans/catpaws/
.docflow-kb/resources/catpaws/9eb067d6-tester.md                        → .docflow-legacy/orphans/catpaws/
.docflow-kb/resources/catpaws/a56c8ee8-ejecutor-inbound.md              → .docflow-legacy/orphans/catpaws/
.docflow-kb/resources/catpaws/a78bb00b-maquetador-inbound.md            → .docflow-legacy/orphans/catpaws/
.docflow-kb/resources/catpaws/a88166cd-controlador-de-fichajes.md       → .docflow-legacy/orphans/catpaws/
```

### skills (1 move)

```
.docflow-kb/resources/skills/4f7f5abf-leads-y-funnel-infoeduca.md       → .docflow-legacy/orphans/skills/
```

### canvases (2 moves)

```
.docflow-kb/resources/canvases/5a56962a-email-classifier-pilot.md       → .docflow-legacy/orphans/canvases/
.docflow-kb/resources/canvases/9366fa92-revision-diaria-inbound.md      → .docflow-legacy/orphans/canvases/
```

### email-templates (1 move)

```
.docflow-kb/resources/email-templates/720870b0-recordatorio-fichaje-semanal.md → .docflow-legacy/orphans/email-templates/
```

### connectors (2 moves)

```
.docflow-kb/resources/connectors/755315db-test-slack-webhook.md         → .docflow-legacy/orphans/connectors/
.docflow-kb/resources/connectors/conn-gma-info-educa360-gmail.md        → .docflow-legacy/orphans/connectors/
```

### catbrains (1 move)

```
.docflow-kb/resources/catbrains/a91ed58a-conocimiento-fichajes-holded.md → .docflow-legacy/orphans/catbrains/
```

### Total: 15 moves

Three of the deprecated orphan files (`a91ed58a-...`, `a88166cd-...`, `755315db-...`, `720870b0-...`)
are currently UNTRACKED in git at execution time (they appeared as `??` in `git status` and were
written by Phase 155 hooks after the last commit that included them). `git mv` still works on
untracked files — they simply get added-and-moved in a single operation instead of renamed.
