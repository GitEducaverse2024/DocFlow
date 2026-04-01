---
phase: 88-formulario-selector-departamento
plan: 01
subsystem: catpaw-form
tags: [department, selector, wizard, edit-form, i18n]
dependency_graph:
  requires: [87-01]
  provides: [department-selector, department-i18n-keys]
  affects: [89-PLAN, 90-PLAN]
tech_stack:
  added: []
  patterns: [shadcn-select-grouped, lucide-department-icons]
key_files:
  created: []
  modified:
    - app/src/lib/types/catpaw.ts
    - app/src/app/agents/new/page.tsx
    - app/src/app/agents/[id]/page.tsx
    - app/messages/es.json
    - app/messages/en.json
decisions:
  - "Used shadcn Select with SelectGroup + SelectSeparator for visual grouping"
  - "Kept department_tags field alongside new department for backward compatibility"
  - "Icons per department: Crown, Briefcase, Megaphone, TrendingUp, Wrench, Truck, Users, User, Grid3X3"
metrics:
  duration: "3m"
  completed: "2026-03-30"
---

# Phase 88 Plan 01: Department Selector in Forms

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Type + wizard + edit + i18n | f8a24cf | catpaw.ts, new/page.tsx, [id]/page.tsx, es.json, en.json |

## What Was Built

### CatPaw Type (`catpaw.ts`)
- Added `department: string` field to CatPaw interface

### Wizard (new/page.tsx)
- Department Select with 3 groups: Empresa (7 depts), Personal, Otros
- Each option shows lucide icon + department name
- Group colors: violet (Empresa), sky (Personal), zinc (Otros)
- Default: 'other', wired to POST body

### Edit Form ([id]/page.tsx)
- Same grouped Select component
- Initializes from `paw.department`
- Wired to PATCH body

### i18n (es.json + en.json)
- `agents.department.*` — 9 department names
- `agents.section.*` — group labels + count + empty
- `agents.form.*` — department, placeholder, required
- `agents.search.*` — noResults, noResultsHint
- `agents.badge.*` — department tooltip

## Verification
- TypeScript: passes
- Next.js build: passes
- All 5 requirements (FORM-01..05) satisfied
