---
phase: "92"
plan: "01"
subsystem: "db-skills"
tags: [skills, seeds, db, content]
dependency_graph:
  requires: []
  provides: [SEED-01, SEED-02, SEED-03, SEED-04, SEED-05, DB-04]
  affects: [skills-directory, skill-execution]
tech_stack:
  added: []
  patterns: [conditional-seed-insertion, INSERT-OR-IGNORE]
key_files:
  modified:
    - app/src/lib/db.ts
decisions:
  - "Placed new seed block after is_featured ALTER TABLE migration to use the column directly"
  - "Used INSERT OR IGNORE for idempotent seed insertion"
  - "Changed original seed condition from sCount === 0 to sCount < 25 to allow additive seeding"
metrics:
  duration: "~10 minutes"
  completed: "2026-03-30"
---

# Phase 92 Plan 01: Insert 20 New Skill Seeds Summary

20 curated skill seeds with professional Spanish instructions (200+ words each), output templates, example I/O, and constraints, inserted conditionally into the skills table when fewer than 25 skills exist.

## What Was Done

### Task 1: Insert 20 new skill seeds into db.ts

**Changes to `app/src/lib/db.ts`:**

1. Changed original seed condition from `sCount === 0` to `sCount < 25` so the original 5 seeds also re-insert if missing.

2. Added a new seed block AFTER the `is_featured` ALTER TABLE migration (line ~1645) containing 20 new skills with `is_featured = 1`:

| # | ID | Name | Category |
|---|-----|------|----------|
| 1 | business-writing-formal | Redaccion Empresarial Formal | writing |
| 2 | proposal-writer | Redactor de Propuestas | writing |
| 3 | social-media-content | Contenido para Redes Sociales | writing |
| 4 | executive-briefing | Briefing Ejecutivo | writing |
| 5 | email-professional | Email Profesional | writing |
| 6 | deep-research | Investigacion Profunda | analysis |
| 7 | decision-framework | Marco de Decision | analysis |
| 8 | competitive-analysis | Analisis Competitivo | analysis |
| 9 | data-interpreter | Interprete de Datos | analysis |
| 10 | strategy-document | Documento de Estrategia | strategy |
| 11 | product-roadmap | Roadmap de Producto | strategy |
| 12 | okr-generator | Generador de OKRs | strategy |
| 13 | risk-assessment | Evaluacion de Riesgos | strategy |
| 14 | business-case | Business Case | strategy |
| 15 | code-reviewer | Revisor de Codigo | technical |
| 16 | api-documenter | Documentador de APIs | technical |
| 17 | technical-writer | Escritura Tecnica | technical |
| 18 | academic-researcher | Investigador Academico | technical |
| 19 | brand-voice | Voz de Marca | format |
| 20 | structured-output | Output Estructurado | format |

Each skill includes:
- **instructions**: 200+ words in Spanish, with role definition, step-by-step process, output format rules, special cases, and anti-patterns
- **output_template**: Structured Markdown template
- **example_input**: Realistic scenario
- **example_output**: Complete example following the template
- **constraints**: Quality guardrails
- **is_featured**: Set to 1 for all new seeds

## Verification

- `npx tsc --noEmit` -- passed with no errors
- `npm run build` -- passed successfully

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 05fd1ae | feat(92-01): add 20 new skill seeds to db.ts |

## Self-Check: PASSED
