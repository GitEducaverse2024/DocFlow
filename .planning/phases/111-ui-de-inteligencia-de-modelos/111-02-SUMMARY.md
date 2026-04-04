---
phase: 111-ui-de-inteligencia-de-modelos
plan: 02
subsystem: settings-ui
tags: [ui, settings, model-intelligence, mid, alias-routing, discovery]
requires:
  - 111-01 (tier-styles helper, alias-routing API, i18n keys)
  - Phase 107 (/api/discovery/models + /api/discovery/refresh)
  - Phase 108 (/api/mid, /api/mid/[id] PATCH)
provides:
  - Settings > Modelos section surfacing full LLM ecosystem UI
  - ModelIntelligenceSection component (composable wrapper)
  - 4 settings subcomponents (Discovery, MID cards, MID dialog, Alias table)
affects:
  - app/src/app/settings/page.tsx (new section inserted after ProcessingSettings)
tech-stack:
  added: []
  patterns:
    - shared MID fetch hoisted to wrapper section (single source of truth)
    - tier-styles helper shared across grid, dialog and routing table
    - tag editor pattern via Enter-to-add + Badge with X button
    - Select "__none__" sentinel mapped to null on save
key-files:
  created:
    - app/src/components/settings/discovery-inventory-panel.tsx
    - app/src/components/settings/mid-cards-grid.tsx
    - app/src/components/settings/mid-edit-dialog.tsx
    - app/src/components/settings/alias-routing-table.tsx
    - app/src/components/settings/model-intelligence-section.tsx
  modified:
    - app/src/app/settings/page.tsx
decisions:
  - ModelIntelligenceSection owns MID fetch and passes midModels to both MidCardsGrid and AliasRoutingTable (avoids double fetch + keeps routing badges in sync after edits)
  - Tier sentinel "__none__" in Select (empty strings are disallowed by Radix Select)
  - AliasRoutingTable shows "Sin ficha" amber badge when alias points to a model_key not in MID (graceful for orphan routing)
metrics:
  duration: 3min
  tasks: 3
  files_created: 5
  files_modified: 1
  completed: 2026-04-04
---

# Phase 111 Plan 02: UI de Inteligencia de Modelos (Settings) Summary

Built the Settings > Modelos surface with three subpanels (Discovery inventory, MID tier cards with edit dialog, alias routing table) covering UI-01 through UI-05, all wired live to existing Discovery/MID/alias-routing APIs.

## What Was Built

### UI-01 — Discovery Inventory Panel
`discovery-inventory-panel.tsx` (164 lines). Fetches `/api/discovery/models` on mount, renders provider chips (green when active) with model counts, lists models grouped by provider as font-mono badges. Refresh button calls `POST /api/discovery/refresh` then reloads; shows `cached_at` timestamp and amber "stale" badge when `is_stale` is true.

### UI-02 — MID Cards Grid
`mid-cards-grid.tsx` (112 lines). Groups `MidEntry[]` by tier (Elite/Pro/Libre, plus "Sin clasificar" catch-all), renders each as a 3-col responsive grid of cards showing display_name, model_key (mono), tier badge via `getTierStyle`, line-clamped best_use, first 6 capabilities as outline badges, cost_notes, and an "Editar" button invoking the parent `onEdit` callback.

### UI-03 — MID Edit Dialog
`mid-edit-dialog.tsx` (259 lines). Shadcn Dialog with full form: display_name Input, tier Select (Elite/Pro/Libre/—), cost_notes Input, best_use Textarea, capabilities tag editor (Enter adds, X removes), 5 score Sliders (reasoning/coding/creativity/speed/multilingual, 0-10 step 1) with live numeric readout, status Switch (active/retired). Save PATCHes `/api/mid/{id}` and fires `onSaved(updated)`; toasts on both outcomes.

### UI-04 + UI-05 — Alias Routing Table
`alias-routing-table.tsx` (150 lines). Fetches `/api/alias-routing` on mount, memoizes a `modelKey -> MidEntry` map from the shared `midModels` prop. Each row: alias (font-mono) + description on the left, Select with all MID models in the middle (options show `model_key (tier)`), tier badge + cost_notes on the right. Changes PATCH `/api/alias-routing` with `{alias, model_key}` and optimistically update local state; toasts confirm. Shows amber "Sin ficha" badge when current model_key is not in MID.

### Wrapper Section
`model-intelligence-section.tsx` (53 lines). Owns the MID fetch once and threads the array to both MidCardsGrid and AliasRoutingTable, with `onSaved` patching `midModels` locally so routing badges reflect tier changes immediately.

### Settings Page Wiring
`app/src/app/settings/page.tsx`: added import and rendered `<ModelIntelligenceSection />` after `<ProcessingSettings />` (before ModelPricingSettings / CatBotSettings) so it sits in a logical spot among model-related sections.

## Must-Have Truths — Verified

- [x] User sees a "Modelos" section in Settings with 3 subpanels (Discovery, MID cards, Alias routing)
- [x] Discovery panel lists active providers and models from /api/discovery/models with refresh button + stale badge
- [x] MID cards render grouped by tier (Elite/Pro/Libre) with capabilities, best_use, cost_notes
- [x] Editar button opens dialog with tier select, best_use textarea, capabilities tag editor, 5 sliders, status switch
- [x] Save calls PATCH /api/mid/[id]; toast confirms
- [x] Alias routing table lists aliases; each row has Select with all MID models
- [x] Changing Select calls PATCH /api/alias-routing; toast confirms
- [x] Each alias row shows tier badge + cost_notes of the currently-selected model

## Deviations from Plan

None. Plan executed exactly as written; all three component tasks compiled clean on first pass and the full `npm run build` succeeded with no TS errors or missing i18n keys.

## Commits

- `ab0b3b4` feat(111-02): add Discovery inventory panel and MID cards grid
- `ff0779d` feat(111-02): add MID edit dialog with sliders and tag editor
- `ab7b8f7` feat(111-02): add alias routing table and wire Model Intelligence into Settings

## Verification

- `cd app && npm run build` → succeeded; `/settings` route compiled to 21.8 kB (223 kB first-load JS)
- Per-file `tsc --noEmit` checks on all 5 created components: 0 errors
- All i18n keys under `settings.modelIntelligence.*` already defined in es.json (from Plan 01)
- Checkpoint auto-approved per `workflow.auto_advance: true`

## Self-Check: PASSED
All 5 created files exist on disk; settings/page.tsx modified with import + render; 3 commits present in git log.
