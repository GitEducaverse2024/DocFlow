# Phase 120: Config CatBot UI - Research

**Researched:** 2026-04-08
**Domain:** Settings UI expansion + catbot_config schema extension + PromptAssembler integration
**Confidence:** HIGH

## Summary

Phase 120 expands the existing CatBot Settings UI to support four new capabilities: primary/secondary instructions (text areas), custom personality text (alongside the existing dropdown), editable permission checkboxes for both normal and sudo actions, and persistence of all config in the `catbot_config` key of the `settings` table. The existing infrastructure is well-suited: the settings API (`/api/settings`) already handles generic key-value storage, the `CatBotSettings` component already manages `catbot_config` with model/personality/allowed_actions, and `PromptAssembler` already has `instructions_primary` and `instructions_secondary` fields in its `PromptContext` type — they just need to be wired up.

The work is primarily UI expansion + config schema extension. No new database tables, no new API routes, no new services. The existing settings API and PromptAssembler integration points are already in place from Phase 119.

**Primary recommendation:** Extend the existing `catbot_config` JSON schema with new fields (`instructions_primary`, `instructions_secondary`, `personality_custom`), expand the `CatBotSettings` React component with new form fields, and wire the new config fields through `route.ts` into `PromptAssembler.build()`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONFIG-01 | UI con campos editables para instrucciones primarias (siempre inyectadas) e instrucciones secundarias (contexto adicional) | PromptAssembler ya tiene `instructions_primary`/`instructions_secondary` en PromptContext. Solo falta UI + wiring en route.ts |
| CONFIG-02 | Personalidad con campo de texto libre ademas del dropdown (friendly/technical/minimal) | CatBotSettings ya tiene dropdown. Anadir textarea `personality_custom` y que PromptAssembler lo inyecte |
| CONFIG-03 | Permisos normales y sudo editables como checkboxes agrupadas | CatBotSettings ya tiene checkboxes para `allowed_actions`. Anadir seccion sudo con `protected_actions` del `catbot_sudo` config |
| CONFIG-04 | Config ampliada persiste en catbot_config de settings table y se lee via PromptAssembler | Settings API ya soporta esto. Extender el JSON schema y asegurar que route.ts pasa los campos nuevos a PromptAssembler |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18 | 18.x | UI components | Ya en uso en settings/page.tsx |
| shadcn/ui | latest | Checkbox, Label, Card, Button, Textarea | Ya en uso en CatBotSettings y CatBotSecurity |
| next-intl | latest | i18n para todo texto visible | Convencion del proyecto: todo texto en espanol via claves i18n |
| Tailwind CSS 3 | 3.x | Styling con dark theme | Convencion del proyecto: bg-zinc-950, border-zinc-800, etc. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner/toast | latest | Feedback de guardado | Ya en uso en CatBotSettings |
| lucide-react | latest | Iconos (Cat, Shield, etc.) | Ya en uso |

### Alternatives Considered
None — this phase uses exclusively the existing stack. No new dependencies needed.

## Architecture Patterns

### Current CatBot Config Architecture
```
settings table (docflow.db)
  key: 'catbot_config'  → JSON: { model, personality, allowed_actions }
  key: 'catbot_sudo'    → JSON: { enabled, hash, duration_minutes, protected_actions }

Settings UI
  CatBotSettings component → reads/writes catbot_config via /api/settings
  CatBotSecurity component → reads/writes catbot_sudo via /api/catbot/sudo

route.ts (chat endpoint)
  Reads catbot_config → passes to PromptAssembler.build() and getToolsForLLM()
  Reads catbot_sudo → checks sudo session
```

### Target catbot_config Schema (Extended)
```typescript
interface CatBotConfig {
  // Existing fields
  model?: string;
  personality?: string;                  // dropdown: 'friendly' | 'technical' | 'minimal'
  allowed_actions?: string[];            // normal permission checkboxes

  // NEW fields (CONFIG-01)
  instructions_primary?: string;         // Always injected in prompt (P0-level)
  instructions_secondary?: string;       // Lower priority context (P2-level)

  // NEW field (CONFIG-02)
  personality_custom?: string;           // Free text personality override/addition
}
```

### Pattern 1: Extend Existing Config — Don't Create New Storage
**What:** Add new fields to the existing `catbot_config` JSON in the settings table.
**When to use:** When the new data is configuration (not transactional) and the existing storage pattern works.
**Why:** The settings API already handles arbitrary JSON. PromptContext already has `instructions_primary`/`instructions_secondary` fields. Zero new API routes needed.

### Pattern 2: Grouped Permission Checkboxes
**What:** Display normal actions and sudo actions as two separate grouped checkbox sections.
**When to use:** When permissions have two distinct tiers with different security implications.
**Implementation:**
- Normal actions (`allowed_actions`): save to `catbot_config` — already implemented, just needs more action keys
- Sudo actions (`protected_actions`): save to `catbot_sudo` via existing `/api/catbot/sudo` endpoint with `update_config` action
- Both displayed in the same CatBot Settings section for unified UX

### Pattern 3: PromptAssembler Section Injection
**What:** Add new sections for instructions_primary (P0) and instructions_secondary (P2) and personality_custom in the PromptAssembler.
**When to use:** For user-configurable content that needs to be included in the system prompt.
**Example:**
```typescript
// In PromptAssembler build():

// P0: User primary instructions (always included)
if (ctx.catbotConfig.instructions_primary?.trim()) {
  sections.push({
    id: 'instructions_primary',
    priority: 0,
    content: `## Instrucciones del administrador\n${ctx.catbotConfig.instructions_primary}`,
  });
}

// P2: User secondary instructions (can be truncated)
if (ctx.catbotConfig.instructions_secondary?.trim()) {
  sections.push({
    id: 'instructions_secondary',
    priority: 2,
    content: `## Contexto adicional\n${ctx.catbotConfig.instructions_secondary}`,
  });
}

// Personality custom text modifies identity section
// Inject after the default personality block
```

### Anti-Patterns to Avoid
- **Creating a new API route for catbot config:** The `/api/settings` generic endpoint already handles this. Don't duplicate.
- **Storing instructions in catbot.db:** Config belongs in docflow.db settings table (it's platform config, not per-user intelligence data). catbot.db is for user profiles, memory, conversations.
- **Making personality_custom replace the dropdown:** The dropdown provides preset behavior. The custom text ADDS to whatever the dropdown selects. Both should coexist.
- **Merging CatBotSecurity into CatBotSettings:** They are separate concerns. CatBotSecurity manages the sudo password/sessions. CatBotSettings manages behavior config. Keep them as separate components but show sudo protected_actions in the permissions section for visibility.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Settings persistence | Custom API route | Existing `/api/settings` key-value store | Already tested, handles INSERT OR REPLACE |
| i18n strings | Hardcoded Spanish text | `useTranslations('settings')` with es.json/en.json keys | Project convention, build warnings if missing |
| Checkbox UI | Raw HTML inputs | shadcn `Checkbox` component | Already used in CatBotSettings for allowed_actions |
| Textarea UI | Raw HTML textarea | shadcn `Textarea` or styled textarea (same pattern as existing selects) | Consistent styling |
| Toast notifications | console.log or alert | `toast.success()`/`toast.error()` from sonner | Already in use throughout settings |

## Common Pitfalls

### Pitfall 1: instructions_primary Token Explosion
**What goes wrong:** User writes 5000 words of primary instructions. P0 priority means it's NEVER truncated. Eats entire token budget, pushes out knowledge tree and tools.
**Why it happens:** P0 sections bypass the budget system by design.
**How to avoid:** Add a character limit to the textarea (e.g., 2000 chars). Show a char counter. In PromptAssembler, if instructions_primary exceeds 2000 chars, truncate with "..." — defense in depth.
**Warning signs:** CatBot stops following its knowledge tree guidance or tool instructions.

### Pitfall 2: Config Not Reaching PromptAssembler
**What goes wrong:** New fields saved to catbot_config but not read in route.ts or not passed to PromptAssembler.
**Why it happens:** route.ts currently types catbotConfig as `{ model?: string; personality?: string; allowed_actions?: string[] }` — the new fields would be silently dropped by this type.
**How to avoid:** Update the type annotation in route.ts to include `instructions_primary`, `instructions_secondary`, `personality_custom`. Or better: import the type from PromptAssembler (PromptContext.catbotConfig already has instructions_primary/secondary).
**Warning signs:** Config saves successfully but CatBot behavior doesn't change.

### Pitfall 3: Sudo Permissions UI Writing to Wrong Key
**What goes wrong:** Sudo protected_actions saved to catbot_config instead of catbot_sudo, or vice versa.
**Why it happens:** Two different settings keys store permission-like data. Normal actions in catbot_config.allowed_actions, sudo actions in catbot_sudo.protected_actions.
**How to avoid:** Normal permission checkboxes save via `/api/settings` (catbot_config). Sudo permission checkboxes save via `/api/catbot/sudo` with `action: 'update_config'`. Keep the save handlers separate.
**Warning signs:** Changing sudo permissions doesn't affect sudo behavior, or resets the sudo password.

### Pitfall 4: Missing i18n Keys
**What goes wrong:** New UI text appears as raw keys like `settings.catbot.instructionsPrimary` instead of Spanish text.
**Why it happens:** Adding UI elements without updating both es.json and en.json.
**How to avoid:** Add ALL new i18n keys to both `app/messages/es.json` and `app/messages/en.json` before writing the component code.
**Warning signs:** Build warnings about missing translation keys.

### Pitfall 5: personality_custom Not Reflected in CatBot Behavior
**What goes wrong:** User writes custom personality text but CatBot keeps behaving the same.
**Why it happens:** The identity section in PromptAssembler is hardcoded with personality traits. Custom text needs to be explicitly injected into or after the identity section.
**How to avoid:** In PromptAssembler, add the personality_custom text as part of the P0 identity section, right after the default personality traits. Frame it as: "El administrador ha anadido las siguientes instrucciones de personalidad: {text}"
**Warning signs:** User writes "responde siempre en ingles" in personality_custom but CatBot keeps responding in Spanish.

## Code Examples

### Current CatBotSettings State Shape (to extend)
```typescript
// Current state in CatBotSettings component (settings/page.tsx line 386)
const [config, setConfig] = useState({
  model: 'gemini-main',
  personality: 'friendly',
  allowed_actions: ['create_projects', 'create_agents', 'create_tasks', 'create_connectors', 'navigate'],
});

// Target state — extend with:
const [config, setConfig] = useState({
  model: 'gemini-main',
  personality: 'friendly',
  personality_custom: '',           // NEW: CONFIG-02
  instructions_primary: '',         // NEW: CONFIG-01
  instructions_secondary: '',       // NEW: CONFIG-01
  allowed_actions: ['create_projects', 'create_agents', 'create_tasks', 'create_connectors', 'navigate'],
});
```

### PromptContext Already Has Fields (catbot-prompt-assembler.ts line 28-35)
```typescript
// Already defined in PromptContext.catbotConfig:
export interface PromptContext {
  catbotConfig: {
    model?: string;
    personality?: string;
    allowed_actions?: string[];
    instructions_primary?: string;     // Already exists!
    instructions_secondary?: string;   // Already exists!
  };
}
```

### route.ts Config Reading (line 65-68)
```typescript
// Current — needs type update to include new fields:
let catbotConfig: { model?: string; personality?: string; allowed_actions?: string[] } = {};
try {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'catbot_config'").get();
  if (row) catbotConfig = JSON.parse(row.value);
} catch {}
```

### Sudo Protected Actions (current defaults)
```typescript
// From catbot/sudo/route.ts — these are the default sudo-protected actions:
protected_actions: ['bash_execute', 'service_manage', 'file_operation', 'credential_manage', 'mcp_bridge']
```

### Normal Actions (current keys in UI)
```typescript
// From settings/page.tsx line 445:
const actionKeys = ['create_catbrains', 'create_agents', 'create_tasks', 'create_connectors', 'navigate'];
// Missing from UI but used in getToolsForLLM: 'manage_models', 'manage_canvas', 'send_emails', 'manage_templates'
```

### getToolsForLLM Permission Mapping
```typescript
// From catbot-tools.ts lines 879-910 — maps allowed_actions to tool access:
// 'create_catbrains' → create_catbrain tool
// 'create_agents' → create_cat_paw, update_cat_paw, link_* tools
// 'create_tasks' → create_task tool
// 'create_connectors' → create_connector tool
// 'manage_canvas' → canvas_* write tools
// 'send_emails' → send_email tool
// 'manage_templates' → create/update/delete_email_template tools
// 'manage_models' → update_alias_routing tool
// Empty array → all tools allowed
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded personality in buildSystemPrompt() | Personality dropdown in config | v25.0 | User can choose friendly/technical/minimal |
| All tools always available | Permission-gated by allowed_actions | v25.0 | Admin controls what CatBot can do |
| No custom instructions | PromptAssembler has fields ready | Phase 119 (2026-04-08) | Fields exist in type but not wired from UI |

## Open Questions

1. **Should instructions_primary have a char limit enforced in UI?**
   - What we know: P0 sections bypass token budget. Unlimited text would eat the budget.
   - Recommendation: Enforce 2000 char limit in UI with counter. PromptAssembler truncates at 2500 as defense in depth.

2. **Should the missing normal action keys be exposed in the UI?**
   - What we know: `getToolsForLLM` supports `manage_models`, `manage_canvas`, `send_emails`, `manage_templates` but the UI only shows 5 action keys.
   - Recommendation: YES — expose all 9 action keys in the UI grouped by category. This fulfills CONFIG-03 ("checkboxes agrupadas editables").

3. **How should personality_custom interact with the dropdown?**
   - What we know: Dropdown sets base personality style. Custom text would be additional.
   - Recommendation: Custom text is ADDITIVE. If dropdown is "technical" and custom says "usa analogias de cocina", CatBot is technical but uses cooking analogies. Frame in prompt as "Personalidad base: {dropdown}. Instrucciones adicionales de personalidad: {custom}".

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (unit) + playwright (e2e) |
| Config file | app/vitest.config.ts (unit), app/e2e/ (e2e) |
| Quick run command | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` |
| Full suite command | `cd app && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONFIG-01 | instructions_primary/secondary injected in prompt | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | Exists (extend) |
| CONFIG-02 | personality_custom reflected in prompt | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | Exists (extend) |
| CONFIG-03 | Permission checkboxes visible and editable | e2e | `cd app && npx playwright test e2e/specs/settings.spec.ts` | Exists (extend) |
| CONFIG-04 | Config persists and loads correctly | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | Exists (extend) |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts`
- **Per wave merge:** `cd app && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. Extend `catbot-prompt-assembler.test.ts` with tests for instructions_primary, instructions_secondary, personality_custom injection. Extend `settings.spec.ts` POM with locators for new fields.

## Sources

### Primary (HIGH confidence)
- Direct code analysis: `app/src/app/settings/page.tsx` (CatBotSettings component, lines 384-525)
- Direct code analysis: `app/src/lib/services/catbot-prompt-assembler.ts` (PromptContext type, build function)
- Direct code analysis: `app/src/app/api/catbot/chat/route.ts` (config reading, lines 64-91)
- Direct code analysis: `app/src/lib/services/catbot-tools.ts` (getToolsForLLM permission mapping, lines 879-910)
- Direct code analysis: `app/src/app/api/catbot/sudo/route.ts` (sudo config CRUD)
- Direct code analysis: `app/src/app/api/settings/route.ts` (generic settings API)
- Phase 119 summaries: 119-01-SUMMARY.md, 119-02-SUMMARY.md

### Secondary (MEDIUM confidence)
- Architecture research: `.planning/research/ARCHITECTURE.md`
- Pitfalls research: `.planning/research/PITFALLS.md`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all components already in use, no new dependencies
- Architecture: HIGH - extending existing patterns, not creating new ones
- Pitfalls: HIGH - based on direct code analysis of existing config flow

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable domain, existing codebase)
