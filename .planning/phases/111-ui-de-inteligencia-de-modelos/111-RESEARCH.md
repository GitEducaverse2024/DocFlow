# Phase 111: UI de Inteligencia de Modelos - Research

**Researched:** 2026-04-04
**Domain:** Next.js 14 UI + internal REST APIs (MID CRUD + Discovery + Alias routing) + shadcn/ui
**Confidence:** HIGH (fully internal stack, all dependencies already in codebase)

## Summary

Phase 111 is 100% client-facing UI work on top of infrastructure already built in phases 107-110. No new libraries are needed: the MID CRUD API (`/api/mid`, `/api/mid/[id]`), Discovery API (`/api/discovery/models`), MID sync endpoint (`/api/mid/sync`), and the `alias-routing` service all exist. The **only** missing backend piece is a thin REST wrapper around `getAllAliases()` / `updateAlias()` (today only callable via the CatBot `update_alias_routing` tool with sudo gating).

The UI must live inside the existing `app/src/app/settings/page.tsx` as a new `<section>` following the established pattern (Cpu/Settings icon + `<h2>` + Card grid). Discovery data arrives via `/api/discovery/models` which already returns JSON with `models[]`, `providers[]`, `cached_at`, `is_stale`. MID entries arrive via `/api/mid` as a flat array grouped by tier (Elite/Pro/Libre).

UI-07 (badges in agents view + canvas nodes) requires edits to existing files: `components/agents/catpaw-card.tsx` (already shows mode badges — add tier badge) and `components/canvas/nodes/agent-node.tsx` (already shows `model` chip — enhance with tier + cost). The canvas-side `model_suggestion` field is already emitted by `canvas_get` in CatBot tools (Phase 110 decision), so UI can consume it directly when opening canvas with CatBot context.

**Primary recommendation:** Build a single `<ModelIntelligenceSection>` component in `settings/page.tsx` with 3 collapsible sub-panels (Inventario / Fichas MID / Routing). Add one new API route `app/api/alias-routing/route.ts` (GET list, PATCH update) protected by same conventions as existing settings routes. Reuse `Card`, `Badge`, `Dialog`, `Select`, `Tabs` from `components/ui/` — everything needed is already installed.

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md file exists for this phase — user skipped `/gsd:discuss-phase`. All technical decisions are at Claude's discretion, constrained by:
- Existing phase 107-110 APIs and services (treat as locked contract)
- Project conventions in `.claude/skills/docatflow-conventions.md`
- Requirements UI-01 through UI-07 as written in REQUIREMENTS.md
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | Seccion "Modelos" en Settings con vista de inventario activo (Discovery real-time) | `/api/discovery/models` returns `ModelInventory` with `models[]`, `providers[]`, `cached_at`, `is_stale`. Add POST `/api/discovery/refresh` to force refresh. |
| UI-02 | Vista MID como cards legibles (capacidades, tier, mejor uso) | `/api/mid?status=active` returns `MidEntry[]` with parsed `capabilities: string[]`, `scores: {}`, `tier`, `best_use`. Group by tier into 3 columns. |
| UI-03 | Editor de capacidades de modelo desde Settings (editar scores, descripcion, tier) | `PATCH /api/mid/[id]` accepts `{display_name, tier, best_use, capabilities, cost_tier, cost_notes, scores, status}`. Use Dialog + form with array editor for `capabilities` and 5 sliders for `scores` (reasoning/coding/creativity/speed/multilingual). |
| UI-04 | Tabla routing aliases: modelo por alias, cambio via dropdown inmediato | Needs NEW endpoint `GET /api/alias-routing` + `PATCH /api/alias-routing` wrapping `alias-routing.ts` service. 8 aliases: chat-rag, process-docs, agent-task, catbot, generate-content, embed, canvas-agent, canvas-format. |
| UI-05 | Tier y coste visible junto a cada modelo en tabla de routing | Join alias rows with MID `tier` + `cost_notes` fields. Embed Badge next to model_key select. |
| UI-06 | UX para sugerencias de CatBot (recomendacion + justificacion + Aplicar/Ignorar) | CatBot already emits recommendations via `recommend_model_for_task` tool. Expose a "Sugerencias recientes" panel fed from a lightweight event/log table OR show recommendations inline in CatBot panel with action buttons. Recommendation: inline in CatBot response with `[Aplicar]` calling `update_alias_routing`. |
| UI-07 | Badge de modelo + tier en vista de agentes y nodos canvas | Edit `components/agents/catpaw-card.tsx` (add tier badge next to mode badge) + `components/canvas/nodes/agent-node.tsx` (add tier chip next to existing model chip). Lookup tier via MID cached map keyed by `model_key`. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 14 (App Router) | Settings page + API routes | Project baseline |
| React | 18 | Client components | Project baseline |
| shadcn/ui | (local) | Card, Badge, Dialog, Select, Tabs, Slider, Switch | Already used across settings page |
| Tailwind CSS | 3 | Styling (dark theme zinc-950/zinc-900) | Project convention |
| next-intl | (latest) | i18n via `useTranslations('settings')` | Project convention |
| lucide-react | (latest) | Icons (Cpu, Brain, Zap, DollarSign) | Already imported in settings/page.tsx |
| sonner | (latest) | Toast notifications | Already used for save feedback |
| better-sqlite3 | latest | DB reads via existing `mid.ts` / `alias-routing.ts` | Phase 108/109 foundation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@/components/ui/slider` | local | Score editing (0-10 scale) | UI-03 score editor (5 dimensions) |
| `@/components/ui/tabs` | local | Optional: tabbed view inside Models section | If collapse approach too dense |
| `@/components/ui/select` | local | Dropdown for alias model change | UI-04 routing table |

### No New Dependencies
Phase 111 requires **zero** new npm installs. All UI primitives exist. All backend services exist (only 1 thin REST wrapper needed).

## Architecture Patterns

### Recommended File Structure
```
app/src/app/
├── api/
│   ├── alias-routing/
│   │   └── route.ts           # NEW: GET list + PATCH update
│   └── discovery/
│       └── refresh/
│           └── route.ts        # EXISTS: force-refresh Discovery
├── settings/
│   └── page.tsx               # EDIT: add <ModelIntelligenceSection />
└── components/
    ├── settings/              # NEW subfolder (none exists today)
    │   ├── model-intelligence-section.tsx   # Wrapper
    │   ├── discovery-inventory-panel.tsx    # UI-01
    │   ├── mid-cards-grid.tsx               # UI-02
    │   ├── mid-edit-dialog.tsx              # UI-03
    │   └── alias-routing-table.tsx          # UI-04 + UI-05
    ├── agents/
    │   └── catpaw-card.tsx                  # EDIT: add tier badge (UI-07)
    └── canvas/nodes/
        └── agent-node.tsx                   # EDIT: enhance model chip (UI-07)
```

### Pattern 1: Settings Section Structure (EXISTING convention)
Follow pattern from `ProcessingSettings`, `CatBotSettings`, `TelegramSettings` in `settings/page.tsx`:

```tsx
// Source: app/src/app/settings/page.tsx (existing patterns)
function ModelIntelligenceSection() {
  const t = useTranslations('settings');
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="w-5 h-5 text-violet-400" />
        <h2 className="text-xl font-semibold text-zinc-50">{t('modelIntelligence.title')}</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-6">{t('modelIntelligence.description')}</p>
      <div className="space-y-6">
        <DiscoveryInventoryPanel />
        <MidCardsGrid />
        <AliasRoutingTable />
      </div>
    </section>
  );
}
```

### Pattern 2: API Route (EXISTING convention)
All API routes must follow the project pattern — match `api/mid/route.ts`:

```tsx
// Source: app/src/app/api/mid/route.ts (reference implementation)
import { NextRequest, NextResponse } from 'next/server';
import { getAllAliases, updateAlias } from '@/lib/services/alias-routing';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';  // MANDATORY per CLAUDE.md

export async function GET() {
  try {
    const aliases = getAllAliases();
    return NextResponse.json({ aliases });
  } catch (e) {
    logger.error('alias-routing', 'Error listing aliases', { error: (e as Error).message });
    return NextResponse.json({ aliases: [], error: (e as Error).message }, { status: 200 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { alias, model_key } = await request.json();
    if (!alias || !model_key) {
      return NextResponse.json({ error: 'Missing alias or model_key' }, { status: 400 });
    }
    const updated = updateAlias(alias, model_key);
    return NextResponse.json({ updated });
  } catch (e) {
    logger.error('alias-routing', 'Error updating alias', { error: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}
```

### Pattern 3: MID Edit Dialog (UI-03)
Use controlled form with a Dialog (shadcn). Scores as sliders, capabilities as tag-style editor (add/remove chips), tier as Select.

### Pattern 4: Live Data Refresh
Discovery endpoint caches 5min by default. Add explicit "Refrescar" button calling `POST /api/discovery/refresh`. Display `cached_at` + `is_stale` badge.

### Anti-Patterns to Avoid
- **Don't create a separate `/settings/models` route** — keep as section inside `/settings` (consistent with all other settings)
- **Don't fetch MID inside canvas node render** — stale closures + N+1. Fetch once at editor level and pass through `data.tier` in node data.
- **Don't bypass `resolveAlias()`** — UI changes an alias; runtime resolution must still pass through service
- **Don't hardcode the 8 aliases in UI** — fetch from `/api/alias-routing` (future-proof if new aliases added)
- **Don't call internal services directly from client components** — always route via `/api/*`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Score editor (0-10) | Custom number input with +/- | `@/components/ui/slider` | Already used, accessibility built-in |
| Tag editor for capabilities | Custom chip array | `<Input>` + keydown on Enter to push to array + `<Badge>` list with X button | Simple 15-line pattern |
| Alias table with dropdowns | Custom `<table>` | shadcn Card grid or simple Tailwind table + `<Select>` per row | Matches existing settings style |
| Model validation (is_available) | Custom checks | Compare `alias.model_key` against `inventory.models.map(m => m.model_id)` | Already done inside `resolveAlias` + `get_model_landscape` |
| Dark theme cards | Custom styles | `bg-zinc-900 border-zinc-800 hover:border-violet-800/30` | Convention in `docatflow-conventions.md` |
| Toasts | Browser alerts | `sonner` (already imported) | Consistent UX |

**Key insight:** This phase has zero "hand-rolling" risk — every primitive already exists. The only temptation is to over-engineer UI-06 (CatBot suggestions UX). Keep it minimal: inline in CatBot response with Apply/Ignore buttons, no new notifications table.

## Common Pitfalls

### Pitfall 1: Forgetting `export const dynamic = 'force-dynamic'`
**What goes wrong:** New `/api/alias-routing` route renders at build time and returns stale data forever.
**Why it happens:** Next.js 14 App Router default-statics routes with no dynamic params.
**How to avoid:** Mandatory first line of every route file per `CLAUDE.md`.
**Warning signs:** API returns same data after DB change until `docker compose build --no-cache`.

### Pitfall 2: Model key mismatch between Discovery and MID
**What goes wrong:** MID has `anthropic/claude-opus-4` but Discovery lists `claude-opus-4-6` (no prefix). Routing table shows "unavailable" false-positives.
**Why it happens:** Different providers expose `model_id` differently; LiteLLM prepends `provider/` prefix.
**How to avoid:** Use prefix matching (already implemented in Phase 110 `isModelAvailable`). Reuse that helper in UI availability badges.
**Warning signs:** All models in routing table show red/unavailable even though Discovery is healthy.

### Pitfall 3: MID scores as JSON strings
**What goes wrong:** PATCH body with `scores: {reasoning: 9}` vs DB stored as `'{"reasoning":9}'` — confusion between parsed `MidEntry` and raw `MidRow`.
**Why it happens:** `mid.ts` handles parsing/stringifying in service layer; UI must send objects, API stringifies.
**How to avoid:** Client sends `capabilities: string[]` and `scores: Record<string, number>` — the existing `update()` in `mid.ts` handles JSON.stringify internally.
**Warning signs:** DB contains `[object Object]` or double-stringified JSON.

### Pitfall 4: i18n strings missing
**What goes wrong:** Build fails with next-intl warning; Spanish text falls back to key string.
**Why it happens:** Project convention: every string needs BOTH `es.json` and `en.json` entries under `settings.modelIntelligence.*`.
**How to avoid:** Add all keys to both `app/messages/es.json` and `app/messages/en.json` BEFORE writing components.
**Warning signs:** UI displays literal keys like `settings.modelIntelligence.title`.

### Pitfall 5: Over-updating canvas node data
**What goes wrong:** Adding `tier` to every canvas node's `data` field bloats the canvas JSON and causes re-renders.
**Why it happens:** React Flow re-renders on data reference change; injecting tier from fresh MID lookup changes ref every render.
**How to avoid:** Compute tier at render time via a memoized lookup map (`useMemo` built from MID fetched once at editor level) OR enrich only on `canvas_get` (server-side — Phase 110 already does this via `model_suggestion`).
**Warning signs:** Canvas editor feels laggy when many agent nodes present.

### Pitfall 6: Race condition on alias update + Discovery refresh
**What goes wrong:** User changes alias model; UI shows new model; runtime still resolves old model for 60s (litellm cache) or 5min (Discovery cache).
**Why it happens:** `resolveAlias` uses cached inventory.
**How to avoid:** After PATCH alias, show toast "El cambio tomará efecto en < 5 min (cache)". Optional: trigger Discovery refresh in same click.
**Warning signs:** User complains alias change "didn't work" immediately.

## Code Examples

### Fetching Discovery inventory with stale indicator
```tsx
// Source: /api/discovery/models/route.ts (existing)
interface ProviderStatus { provider: string; status: string; model_count: number; latency_ms: number | null; }
interface DiscoveredModel { id: string; name: string; provider: string; is_local: boolean; is_embedding: boolean; }
interface ModelInventory { models: DiscoveredModel[]; providers: ProviderStatus[]; cached_at: string; is_stale: boolean; }

function DiscoveryInventoryPanel() {
  const [inventory, setInventory] = useState<ModelInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const res = await fetch('/api/discovery/models');
    setInventory(await res.json());
    setLoading(false);
  };
  const refresh = async () => {
    setRefreshing(true);
    await fetch('/api/discovery/refresh', { method: 'POST' });
    await load();
    setRefreshing(false);
    toast.success('Inventario refrescado');
  };

  useEffect(() => { load(); }, []);
  // ...render providers[] chips + models[] grouped by provider
}
```

### MID Card grouped by tier (UI-02)
```tsx
// Source: pattern derived from /api/mid + project dark theme convention
const TIER_STYLES = {
  Elite: 'bg-gradient-to-r from-violet-600/20 to-purple-700/20 border-violet-500/40 text-violet-300',
  Pro:   'bg-emerald-600/20 border-emerald-500/40 text-emerald-300',
  Libre: 'bg-zinc-700/30 border-zinc-600/40 text-zinc-300',
};

function MidCard({ m, onEdit }: { m: MidEntry; onEdit: () => void }) {
  return (
    <Card className="bg-zinc-900/80 border-zinc-800 hover:border-violet-800/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-zinc-100">{m.display_name}</h3>
          <Badge className={TIER_STYLES[m.tier as keyof typeof TIER_STYLES]}>{m.tier}</Badge>
        </div>
        <p className="text-xs text-zinc-400 mb-3">{m.best_use}</p>
        <div className="flex flex-wrap gap-1 mb-2">
          {m.capabilities.map(c => (
            <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
          ))}
        </div>
        {m.cost_notes && <p className="text-[11px] text-zinc-500">{m.cost_notes}</p>}
        <Button size="sm" variant="ghost" onClick={onEdit} className="mt-2">Editar</Button>
      </CardContent>
    </Card>
  );
}
```

### Routing table with Select (UI-04 + UI-05)
```tsx
// Source: combines alias-routing service + shadcn Select
function AliasRoutingTable({ midModels, aliases, onChange }: {
  midModels: MidEntry[]; aliases: AliasRow[]; onChange: (alias: string, model: string) => Promise<void>;
}) {
  const tierByModelKey = useMemo(
    () => Object.fromEntries(midModels.map(m => [m.model_key, { tier: m.tier, cost: m.cost_notes }])),
    [midModels]
  );
  return (
    <div className="space-y-2">
      {aliases.map(a => {
        const info = tierByModelKey[a.model_key];
        return (
          <div key={a.alias} className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
            <div className="w-40">
              <div className="text-sm font-mono text-zinc-200">{a.alias}</div>
              <div className="text-xs text-zinc-500">{a.description}</div>
            </div>
            <Select value={a.model_key} onValueChange={(v) => onChange(a.alias, v)}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {midModels.map(m => (
                  <SelectItem key={m.model_key} value={m.model_key}>
                    {m.display_name} <span className="text-xs text-zinc-500 ml-2">[{m.tier}]</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {info && <Badge className={TIER_STYLES[info.tier as keyof typeof TIER_STYLES]}>{info.tier}</Badge>}
            {info?.cost && <span className="text-xs text-zinc-500">{info.cost}</span>}
          </div>
        );
      })}
    </div>
  );
}
```

### Agent card tier badge (UI-07)
```tsx
// Source: app/src/components/agents/catpaw-card.tsx (edit existing)
// Current: mode badge only. Add tier badge next to it.
// Need: fetch MID once in parent list (catpaw-list), pass tierByModelKey map as prop, OR
//       fetch within card with SWR-style cache.
// Preferred: parent fetches /api/mid once, builds Map, passes as prop to all cards.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded model list in Settings dropdown | Live Discovery + MID tier grouping | Phase 107-108 | User sees what's actually available |
| Swap model in code | Alias routing PATCH via UI | Phase 111 (this) | No code edits needed to change models |
| User edits `.env` for CHAT_MODEL | Alias table + resolveAlias fallback | Phase 109 | Env is now fallback-of-last-resort |

**Deprecated/outdated:**
- `PROVIDER_MODELS` static list in `api/settings/models/route.ts`: still used but Discovery endpoint supersedes it. Phase 111 does NOT need to fix this — out of scope.

## Open Questions

1. **Should UI-06 suggestions have their own panel or be inline in CatBot chat?**
   - What we know: `recommend_model_for_task` is a CatBot tool; it returns recommendation + justification in CatBot response.
   - What's unclear: user expectation — dedicated "Sugerencias" section in Settings, or inline action buttons in CatBot chat response messages.
   - Recommendation: **Inline action buttons in CatBot chat response** (when tool response contains `recommended_model` + alias target). Lowest friction, zero new infrastructure. Settings can show "últimas 5 sugerencias" log if needed later.

2. **Should tier badges in canvas nodes use live MID lookup or embed at `canvas_get` time?**
   - What we know: Phase 110 already adds `model_suggestion` server-side in `canvas_get`.
   - What's unclear: when user opens canvas WITHOUT CatBot, is tier visible?
   - Recommendation: Client-side memoized lookup via single MID fetch at canvas-editor mount. No schema changes.

3. **Can we delete a MID entry from UI?**
   - What we know: `DELETE /api/mid/[id]` sets `status='retired'` (soft delete).
   - What's unclear: UX — trash icon or "Retirar" button?
   - Recommendation: `Switch` for "Activo/Inactivo" status + "Retirar" destructive button in edit dialog footer.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `app/vitest.config.ts` (verify at Wave 0) |
| Quick run command | `cd app && npx vitest run src/app/api/alias-routing --reporter=basic` |
| Full suite command | `cd app && npm run test:unit` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-01 | Discovery inventory renders with stale indicator | manual-only | Browser at /settings | ❌ (UI, no test) |
| UI-02 | MID cards render grouped by tier | manual-only | Browser | ❌ |
| UI-03 | PATCH /api/mid/[id] accepts capabilities + scores | unit | `npx vitest run src/lib/services/__tests__/mid.test.ts` | ✅ EXISTS (extend) |
| UI-04 | GET /api/alias-routing returns 8 aliases; PATCH updates model_key | unit | `npx vitest run src/app/api/alias-routing` | ❌ Wave 0 |
| UI-04 | updateAlias() rejects empty model_key | unit | `npx vitest run src/lib/services/__tests__/alias-routing.test.ts` | ✅ EXISTS |
| UI-05 | Routing table joins MID tier + cost | manual-only | Browser | ❌ |
| UI-06 | CatBot recommendation Apply button calls update_alias_routing | manual-only | CatBot chat | ❌ |
| UI-07 | CatPaw card shows tier badge when model has MID entry | unit (component) | `npx vitest run src/components/agents/__tests__/catpaw-card.test.tsx` | ❌ Wave 0 |
| UI-07 | Agent node shows tier chip | manual-only | Canvas editor | ❌ |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run src/app/api/alias-routing src/lib/services/__tests__/mid.test.ts src/lib/services/__tests__/alias-routing.test.ts --reporter=basic`
- **Per wave merge:** `cd app && npm run test:unit`
- **Phase gate:** Full suite green + manual smoke of Settings → Modelos section (edit MID, change alias, verify canvas badge renders)

### Wave 0 Gaps
- [ ] `app/src/app/api/alias-routing/__tests__/route.test.ts` — covers UI-04 API contract (GET list, PATCH update, error cases)
- [ ] `app/src/components/settings/__tests__/alias-routing-table.test.tsx` — covers UI-04/UI-05 render + onChange
- [ ] `app/messages/es.json` + `app/messages/en.json` — add `settings.modelIntelligence.*` namespace BEFORE implementation (build will fail otherwise)
- [ ] Verify `vitest.config.ts` has jsdom env configured for component tests (may need `@testing-library/react` install — check package.json first)
- [ ] Extend `src/lib/services/__tests__/mid.test.ts` — verify UI-03 field validation (scores object, capabilities array)

## Sources

### Primary (HIGH confidence)
- `/home/deskmath/docflow/app/src/app/api/mid/route.ts` — MID CRUD API contract
- `/home/deskmath/docflow/app/src/app/api/mid/[id]/route.ts` — PATCH editable fields whitelist
- `/home/deskmath/docflow/app/src/app/api/discovery/models/route.ts` — Discovery endpoint
- `/home/deskmath/docflow/app/src/lib/services/mid.ts` — MidEntry types + update() behavior
- `/home/deskmath/docflow/app/src/lib/services/alias-routing.ts` — 8 aliases + resolveAlias + updateAlias
- `/home/deskmath/docflow/app/src/lib/services/catbot-tools.ts` (lines 2233-2400) — `get_model_landscape`, `recommend_model_for_task`, `update_alias_routing` contracts
- `/home/deskmath/docflow/app/src/app/settings/page.tsx` — existing Settings structure + section pattern
- `/home/deskmath/docflow/app/src/components/canvas/nodes/agent-node.tsx` — existing model chip rendering
- `/home/deskmath/docflow/app/src/components/agents/catpaw-card.tsx` — existing badge patterns
- `/home/deskmath/docflow/.claude/skills/docatflow-conventions.md` — project conventions (dark theme, i18n, dynamic force, bracket env)
- `/home/deskmath/docflow/.planning/STATE.md` — Phase 110 decisions (model_suggestion in canvas_get, manage_models permission)

### Secondary (MEDIUM confidence)
- None (everything was verified against actual source files)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in codebase, verified in package.json
- Architecture: HIGH — follows established Settings section pattern with 5+ precedents
- Pitfalls: HIGH — derived from project conventions doc + Phase 109/110 decisions in STATE.md
- API contracts: HIGH — direct file reads of route.ts and service implementations

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable internal APIs, low external dependency churn risk)
