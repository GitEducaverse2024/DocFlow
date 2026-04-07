# Phase 116: Tab Modelos - Research

**Researched:** 2026-04-07
**Domain:** React UI (Next.js 14 App Router) + MID service + alias-routing integration
**Confidence:** HIGH

## Summary

Phase 116 replaces the placeholder `TabModelosPlaceholder` component inside the existing `ModelCenterShell` (tab index 2) with a full MID cards view that groups models by tier, supports filtering, shows "en uso" badges, surfaces unclassified models, and enables inline cost editing. Additionally, two legacy sections from the old Settings page must be removed: the `ModelPricingSettings` function (separate cost table) and the Embeddings placeholder section.

The existing codebase already provides all backend infrastructure needed: the `MidService` (`src/lib/services/mid.ts`) with full CRUD, the `/api/mid` and `/api/mid/[id]` API routes, the `MidCardsGrid` component (grouping by tier with counts), the `MidEditDialog` (full edit form including cost_notes), and the `alias-routing` service with `getAllAliases()`. The `auto_created` field on MID entries distinguishes Discovery-synced models (auto_created=1) from manually seeded ones (auto_created=0), which is the basis for the "Sin clasificar" section.

**Primary recommendation:** Reuse and enhance the existing `MidCardsGrid` pattern (tier grouping, card layout) within a new `TabModelos` component. Add filter bar, "en uso" badge via alias cross-reference, inline cost editing, and "Sin clasificar" section for auto_created models without proper classification.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MODELOS-01 | MID cards agrupadas por tier (Elite, Pro, Libre) con conteo | Existing `MidCardsGrid` already groups by tier with count badge. Reuse pattern in new `TabModelos`. |
| MODELOS-02 | Filtros: por tier, "solo en uso" (asignados a alias), por proveedor | `getAllAliases()` returns alias->model_key mappings. Cross-reference with MID `model_key` to determine "en uso". Provider available on MidEntry. |
| MODELOS-03 | Badge "en uso" en card mostrando que aliases usan este modelo | Join MID entries with alias data: alias.model_key matches MID model_key. Show alias names in badge. |
| MODELOS-04 | Seccion "Sin clasificar" para modelos auto-detectados por Discovery sin ficha MID | `auto_created=1` plus `best_use` containing "Auto-detectado" or tier not manually set. Sync creates entries with `best_use: 'Auto-detectado -- pendiente de clasificacion manual'`. |
| MODELOS-05 | Edicion inline de costes dentro de la ficha MID (eliminar tabla Costes separada) | MID already has `cost_tier` and `cost_notes` fields. `MidEditDialog` already edits `cost_notes`. Make cost editable inline on the card (no dialog needed for just cost). Remove `ModelPricingSettings` function from page.tsx. |
| MODELOS-06 | Eliminar seccion "Embeddings" placeholder | Remove the embeddings section JSX and i18n keys from settings page. The old section is already replaced by ModelCenterShell. |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 14 | App Router, API routes | Project framework |
| React | 18 | UI components | Project framework |
| shadcn/ui | latest | Card, Badge, Button, Input, Select, Dialog | Project UI library |
| next-intl | latest | i18n translations | Project i18n |
| lucide-react | latest | Icons | Project icon library |
| sonner | latest | Toast notifications | Project toast library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwindcss | 3 | Styling | All UI |

### No New Dependencies Required
This phase uses only existing project libraries. No npm installs needed.

## Architecture Patterns

### Recommended Component Structure
```
src/components/settings/model-center/
  tab-modelos.tsx          # NEW: Main tab component (replaces placeholder)
  tab-modelos-filters.tsx  # NEW: Filter bar (tier, provider, "en uso")
  mid-card-enhanced.tsx    # NEW: Enhanced card with inline cost edit + "en uso" badge
```

### Pattern 1: Data Fetching with Alias Cross-Reference
**What:** Fetch MID entries and aliases in parallel, then cross-reference client-side.
**When to use:** On TabModelos mount.
**Example:**
```typescript
// Fetch both datasets in parallel
const [midRes, aliasRes] = await Promise.all([
  fetch('/api/mid'),
  fetch('/api/aliases'),  // or inline from existing route
])
const { models } = await midRes.json()
const { aliases } = await aliasRes.json()

// Build "en uso" map: model_key -> alias names
const usageMap = new Map<string, string[]>()
for (const alias of aliases) {
  const existing = usageMap.get(alias.model_key) || []
  existing.push(alias.alias)
  usageMap.set(alias.model_key, existing)
}
```

### Pattern 2: Inline Cost Editing
**What:** Click-to-edit cost_notes directly on the card without opening full dialog.
**When to use:** For MODELOS-05 inline cost editing.
**Example:**
```typescript
// On the card, show cost_notes as text. On click, switch to Input.
// On blur/Enter, PATCH /api/mid/{id} with { cost_notes: newValue }
const [editing, setEditing] = useState(false)
const [value, setValue] = useState(model.cost_notes || '')

// Save handler
const save = async () => {
  await fetch(`/api/mid/${model.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cost_notes: value }),
  })
  setEditing(false)
}
```

### Pattern 3: "Sin clasificar" Detection
**What:** Identify auto-created models that haven't been manually classified.
**When to use:** For MODELOS-04 section.
**Logic:**
```typescript
// auto_created === 1 AND best_use starts with "Auto-detectado"
// These are Discovery-synced models without manual classification
const unclassified = models.filter(m => 
  m.auto_created === 1 && 
  (m.best_use?.startsWith('Auto-detectado') || !m.best_use)
)
```

### Pattern 4: Filter State Management
**What:** Multiple filter dimensions (tier, provider, en_uso) managed in component state.
**When to use:** For MODELOS-02 filter bar.
**Example:**
```typescript
const [filters, setFilters] = useState({
  tier: 'all',       // 'all' | 'Elite' | 'Pro' | 'Libre'
  provider: 'all',   // 'all' | 'anthropic' | 'google' | 'openai' | 'ollama'
  enUsoOnly: false,  // boolean - show only models assigned to aliases
})
```

### Anti-Patterns to Avoid
- **Don't duplicate MID types:** Import from existing `mid-cards-grid.tsx` MidEntry interface or create shared type
- **Don't fetch aliases on every filter change:** Fetch once on mount, filter client-side
- **Don't use Dialog for cost edit:** Requirement says "inline" -- use click-to-edit pattern
- **Don't break existing MidEditDialog:** Keep it for full model editing, just add inline cost shortcut on cards

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tier grouping | Custom grouping logic | Reuse pattern from `MidCardsGrid` | Already tested, same visual |
| Tier badge styles | Custom colors | `getTierStyle()` from `@/lib/ui/tier-styles` | Consistent across app |
| Toast notifications | Custom alerts | `sonner` toast | Project standard |
| i18n | Hardcoded strings | `useTranslations('settings.modelCenter.modelos')` | Project convention |

## Common Pitfalls

### Pitfall 1: Alias model_key format mismatch
**What goes wrong:** Aliases store `model_key` as LiteLLM-style keys (e.g., `gemini-main`) which may not match MID `model_key` (e.g., `google/gemini-2.5-pro`).
**Why it happens:** Aliases point to LiteLLM routing names, not provider/model format.
**How to avoid:** The "en uso" cross-reference must check if the alias `model_key` matches any MID entry's `model_key`. If alias keys use a different naming convention, the match rate will be low. Verify actual data in DB.
**Warning signs:** All models show as "not in use" even though aliases are configured.

### Pitfall 2: Forgetting to add i18n keys in both es.json and en.json
**What goes wrong:** Build warnings, missing translations.
**How to avoid:** Add all new keys under `settings.modelCenter.modelos` in both locale files.

### Pitfall 3: Stale data after inline edit
**What goes wrong:** Card shows old cost after saving.
**How to avoid:** Update local state optimistically after successful PATCH response.

### Pitfall 4: Not cleaning up old sections properly
**What goes wrong:** Old `ModelPricingSettings` or Embeddings section code remains referenced.
**How to avoid:** The `ModelPricingSettings` function in `page.tsx` is already marked with eslint-disable unused. For MODELOS-05, confirm it's truly not rendered before removing. The Embeddings section must be identified and removed.

### Pitfall 5: process.env usage
**What goes wrong:** Silent failure in production.
**How to avoid:** Always use `process['env']['X']` bracket notation per project convention.

## Code Examples

### Existing MID API endpoint (GET /api/mid)
```typescript
// Returns: { models: MidEntry[] }
// Supports ?status=all to include retired models
// Default: excludes retired, ordered by tier then display_name
```

### Existing Aliases API
```typescript
// getAllAliases() returns AliasRow[]
// AliasRow: { alias, model_key, description, is_active, created_at, updated_at }
// Need to check if there's an API route for this:
```

### Alias Route Check
The `/api/aliases` route needs to be verified -- if it doesn't exist, create a simple GET endpoint that calls `getAllAliases()`, or use an existing route.

### MID Update (PATCH /api/mid/[id])
```typescript
// Accepts: { cost_notes, cost_tier, tier, display_name, best_use, capabilities, scores, status }
// Returns: { updated: true }
// Used for inline cost editing
```

## Existing Components to Reuse/Enhance

### `MidCardsGrid` (src/components/settings/mid-cards-grid.tsx)
- Already groups by tier (Elite, Pro, Libre, Sin clasificar)
- Already shows tier badge with count
- Already renders 3-column grid of cards
- **Enhancement needed:** Add "en uso" badge, inline cost edit, filter support

### `MidEditDialog` (src/components/settings/mid-edit-dialog.tsx)
- Full edit form with tier, cost_notes, capabilities, scores, status
- **Keep as-is** for full editing. The new inline cost edit is a shortcut, not a replacement.

### `getTierStyle()` (src/lib/ui/tier-styles.ts)
- Returns Tailwind classes for tier badges (violet for Elite, emerald for Pro, zinc for Libre)

## Sections to Remove

### 1. ModelPricingSettings (page.tsx lines ~428-550)
- Separate pricing table stored in settings key `model_pricing`
- Already marked `eslint-disable @typescript-eslint/no-unused-vars`
- **Not currently rendered** in the main return JSX (ModelCenterShell replaced it)
- Safe to delete the function entirely

### 2. Embeddings Section
- i18n keys exist at `settings.embeddings` (title, description, comingSoon)
- Need to check if there's a rendered Embeddings section in page.tsx or if it was already removed
- The comment in page.tsx line 1673 says ModelCenterShell "replaces API Keys, Model Intelligence, Model Pricing, Embeddings"
- Likely already visually replaced but code/i18n cleanup may be needed

## API Routes Needed

### Verify: GET /api/aliases (or equivalent)
Need to confirm this route exists. If not, create:
```typescript
// GET /api/aliases -> { aliases: AliasRow[] }
import { getAllAliases } from '@/lib/services/alias-routing'
export const dynamic = 'force-dynamic'
export async function GET() {
  const aliases = getAllAliases()
  return NextResponse.json({ aliases })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate MID cards grid + Costs table + Embeddings section | Unified Tab Modelos inside Centro de Modelos | Phase 116 | Single location for all model management |
| Dialog-only editing | Inline cost edit + Dialog for full edit | Phase 116 | Faster cost updates |

## Open Questions

1. **Alias model_key format vs MID model_key format**
   - What we know: MID uses `provider/model` format (e.g., `anthropic/claude-opus-4`). Aliases use names like `gemini-main`.
   - What's unclear: How to match alias model_key to MID model_key for the "en uso" badge. May need to check both direct match and litellm-prefixed variants.
   - Recommendation: Query actual DB data during implementation. If no direct match, the "en uso" logic may need to check if the alias model_key is a litellm routing name that maps to a MID model_key.

2. **Aliases API route existence**
   - What we know: `getAllAliases()` exists in the service layer.
   - What's unclear: Whether there's already a GET /api/aliases route.
   - Recommendation: Check during implementation, create if missing.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | vitest.config.ts (project root) |
| Quick run command | `npx vitest run src/lib/services/__tests__/mid.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MODELOS-01 | MID cards grouped by tier with count | manual (UI) | N/A - visual rendering | N/A |
| MODELOS-02 | Filters work (tier, en uso, provider) | manual (UI) | N/A - client interaction | N/A |
| MODELOS-03 | "En uso" badge with alias names | manual (UI) | N/A - visual rendering | N/A |
| MODELOS-04 | Sin clasificar section for auto_created models | manual (UI) | N/A - visual rendering | N/A |
| MODELOS-05 | Inline cost editing works | manual (UI) | N/A - client interaction | N/A |
| MODELOS-06 | Old Costes table and Embeddings removed | manual (code review) | `grep -r "ModelPricingSettings\|embeddings.title" src/` | N/A |

### Sampling Rate
- **Per task commit:** `cd ~/docflow/app && npm run build` (ensures no compile errors)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** CatBot verification per CLAUDE.md protocol

### Wave 0 Gaps
None -- this phase is primarily UI work. Existing MID service tests cover backend. CatBot verification covers UAT.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `src/lib/services/mid.ts` -- full MID service with CRUD, sync, types
- Codebase inspection: `src/components/settings/mid-cards-grid.tsx` -- existing tier-grouped card grid
- Codebase inspection: `src/components/settings/mid-edit-dialog.tsx` -- existing edit dialog with cost_notes
- Codebase inspection: `src/lib/services/alias-routing.ts` -- getAllAliases(), AliasRow type
- Codebase inspection: `src/components/settings/model-center/model-center-shell.tsx` -- shell with tab index 2 for modelos
- Codebase inspection: `src/app/settings/page.tsx` -- ModelPricingSettings function to remove

### Secondary (MEDIUM confidence)
- i18n keys: `app/messages/es.json` -- existing modelCenter namespace structure

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, no new deps
- Architecture: HIGH - building on existing patterns (MidCardsGrid, MidEditDialog)
- Pitfalls: MEDIUM - alias model_key format matching needs runtime verification

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable, internal project)
