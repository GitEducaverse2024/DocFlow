# Phase 121: User Profiles + Reasoning Protocol - Research

**Researched:** 2026-04-08
**Domain:** User profile management + adaptive reasoning protocol for CatBot
**Confidence:** HIGH

## Summary

Phase 121 implements two tightly coupled features: (1) automatic user profile creation and management per channel with directive injection into the prompt, and (2) an adaptive reasoning protocol that classifies request complexity and adjusts CatBot's behavior accordingly. Both features modify the same hot path in `route.ts` and depend on the same infrastructure from Phase 118 (catbot.db with `user_profiles` table and CRUD) and Phase 119 (PromptAssembler with budget-aware section composition).

The infrastructure is already in place: `catbot-db.ts` exports `upsertProfile()` and `getProfile()` with the exact schema needed (display_name, channel, personality_notes, communication_style, preferred_format, known_context as JSON, initial_directives). The PromptAssembler already supports priority-based sections with budget truncation. The main work is: (a) wiring profile loading/creation into route.ts pre-flight, (b) adding a profile section builder to PromptAssembler, (c) implementing post-conversation profile update from tool call patterns, and (d) injecting the reasoning protocol as a prompt section that classifies complexity.

**Primary recommendation:** Implement in 3 plans: (1) profile auto-creation + PromptAssembler injection, (2) post-conversation profile update from tool call patterns, (3) reasoning protocol as prompt section with complexity classification.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROFILE-01 | CatBot crea user_profile automaticamente la primera vez que interactua (web o Telegram) | catbot-db.ts already has upsertProfile() + getProfile(). Wire into route.ts pre-flight. |
| PROFILE-02 | Perfil incluye display_name, channel, personality_notes, communication_style, preferred_format, known_context, initial_directives | Schema already matches exactly in user_profiles table (Phase 118). |
| PROFILE-03 | initial_directives auto-generado se inyecta al inicio de cada conversacion | Add new section builder to PromptAssembler at P1 priority. |
| PROFILE-04 | CatBot actualiza perfil automaticamente al final de conversacion si detecto preferencias nuevas (de tool call patterns) | Post-conversation hook in route.ts analyzing allToolResults array. |
| PROFILE-05 | user_id usa formato consistente: "web:default" para web, "telegram:{chat_id}" para Telegram | conversation_log already uses this format. Telegram bot passes chatId. |
| REASON-01 | CatBot clasifica cada peticion en simple/medio/complejo | Reasoning protocol as prompt section injected by PromptAssembler. |
| REASON-02 | Simple (listar, consultar, navegar) = ejecutar directamente | Prompt instruction: pattern list for simple requests. |
| REASON-03 | Medio (crear, modificar, configurar) = proponer + confirmar + ejecutar | Prompt instruction: confirmation protocol for medium requests. |
| REASON-04 | Complejo (disenar pipeline, arquitectura multi-agente, resolver problema) = razonar + preguntar + proponer paso a paso | Prompt instruction: full analysis chain for complex requests. |
| REASON-05 | Si hay recipe en Capa 0 que matchea, el protocolo de razonamiento se salta | Placeholder for Phase 122 — the reasoning protocol must include the skip condition. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | catbot.db CRUD for user_profiles | Already used by catbot-db.ts, provides upsertProfile/getProfile |
| catbot-prompt-assembler.ts | (existing) | Inject profile section into prompt | Priority-based budget-aware assembly already working |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | (existing) | Unit tests for profile service + reasoning | Existing test pattern in __tests__/ |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tool call pattern analysis for profile updates | LLM call to extract preferences | Tool patterns are FREE (zero tokens), LLM extraction costs tokens per conversation. Research + PITFALLS.md explicitly recommends tool patterns (ANTI-PATTERN-3). |
| Prompt-based reasoning protocol | Separate classifier LLM call | Extra LLM call adds latency + cost. Embedding classification instructions in the prompt is sufficient since the LLM already processes the request. |

## Architecture Patterns

### Recommended Project Structure
```
app/src/lib/
  catbot-db.ts                         # EXISTING: already has upsertProfile/getProfile
  services/
    catbot-prompt-assembler.ts         # MODIFY: add buildUserProfileSection()
    catbot-user-profile.ts             # NEW: UserProfileService (orchestration layer)

app/src/app/api/catbot/
  chat/route.ts                        # MODIFY: pre-flight profile load, post-conversation update
```

### Pattern 1: Pre-flight Profile Load + Auto-Create
**What:** At the start of every chat request, load or create the user profile. Pass it to PromptAssembler.
**When to use:** Every POST /api/catbot/chat request.
**Example:**
```typescript
// In route.ts, before buildPrompt():
const userId = channel === 'telegram' ? `telegram:${body.chat_id || 'unknown'}` : 'web:default';
let profile = getProfile(userId);
if (!profile) {
  upsertProfile({ id: userId, channel: channel || 'web' });
  profile = getProfile(userId)!;
}

const systemPrompt = buildPrompt({
  page: context?.page,
  channel: effectiveChannel,
  hasSudo: !!sudoActive,
  catbotConfig,
  userProfile: profile,  // NEW field in PromptContext
});
```

### Pattern 2: Post-Conversation Profile Update from Tool Calls
**What:** After the tool-calling loop completes, analyze which tools were called and extract user preferences.
**When to use:** After every conversation that includes tool calls.
**Example:**
```typescript
// After the tool-calling loop in route.ts:
const toolNames = allToolResults.map(r => r.name);
const profileUpdates = extractPreferencesFromTools(toolNames, allToolResults);
if (profileUpdates && Object.keys(profileUpdates).length > 0) {
  upsertProfile({ id: userId, ...profileUpdates });
}
```

**Tool pattern analysis rules (zero-cost extraction):**
- User frequently uses `list_cat_paws` + `canvas_*` tools = known_context: prefers visual workflows
- User uses `send_email` with specific connector = known_context: preferred email connector
- User always navigates to specific pages = known_context: frequent pages
- User uses `bash_execute` frequently = communication_style: technical
- User calls `explain_feature` often = communication_style: learning mode

### Pattern 3: Reasoning Protocol as Prompt Section
**What:** Inject complexity classification instructions into the system prompt as a P1 section.
**When to use:** Always (part of prompt assembly).
**Example:**
```typescript
function buildReasoningProtocol(): string {
  return `## Protocolo de Razonamiento Adaptativo

Antes de responder, clasifica la peticion del usuario:

### Nivel SIMPLE (ejecutar directamente, sin preguntas)
Detectores: listar, consultar, mostrar, navegar, explicar, cuantos hay, que es
Accion: Ejecuta directamente con la tool correspondiente. No preguntes, no propongas.

### Nivel MEDIO (proponer, confirmar, ejecutar)
Detectores: crear, modificar, configurar, cambiar, actualizar, enviar email
Accion: Propone la configuracion con valores razonables. Espera confirmacion. Ejecuta.
Maximo 1 pregunta de clarificacion si hay ambiguedad critica.

### Nivel COMPLEJO (razonar, preguntar, analizar, proponer paso a paso)
Detectores: disenar pipeline, arquitectura multi-agente, resolver problema complejo, migrar, optimizar, diagnosticar error encadenado
Accion: Razona el enfoque. Haz 1-2 preguntas sobre lo mas importante. Analiza inventario existente. Propone solucion paso a paso. Confirma antes de ejecutar.

### Capa 0 — Fast Path (cuando existan recipes)
Si tienes una recipe memorizada que coincide con la peticion, ejecutala directamente sin pasar por clasificacion.

### Reglas generales
- Default a ACCION, no a preguntas. Si puedes inferir valores razonables, hazlo.
- Maximo 1 pregunta de clarificacion por turno en nivel MEDIO.
- Nunca anuncies tu clasificacion ("clasificando como MEDIO..."). Solo actua segun el nivel.
- Si el usuario dice "solo hazlo" o "como tu veas", baja un nivel de razonamiento.`;
}
```

### Anti-Patterns to Avoid
- **Visible reasoning classification:** Never show the user "Clasificando como COMPLEJO...". Keep internal (Pitfall 8).
- **Over-asking:** Never ask more than 1 clarification per turn for MEDIO, 2 for COMPLEJO. Default to action with sensible defaults (Pitfall 8).
- **LLM call for profile extraction:** Use tool call patterns (zero cost), never an additional LLM call per conversation (Anti-Pattern 3).
- **Missing user_id on Telegram:** Telegram bot currently does NOT pass chat_id to the chat API body. Must add it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| User profile CRUD | Custom SQL functions | Existing `upsertProfile()`/`getProfile()` from catbot-db.ts | Already tested with 22 unit tests, COALESCE-based partial update |
| Prompt section management | Manual string concatenation | PromptAssembler priority-based sections | Budget-aware, graceful degradation, already handles P0-P3 |
| User ID derivation | Custom channel detection | Route.ts already receives `channel` param from both web and Telegram | Telegram passes `channel: 'telegram'` explicitly |

## Common Pitfalls

### Pitfall 1: Telegram chat_id Not Available in route.ts
**What goes wrong:** The Telegram bot calls `/api/catbot/chat` but does NOT include `chat_id` in the request body. The route has no way to construct `telegram:{chat_id}` for the user profile.
**Why it happens:** The Telegram bot was built before user profiles existed. It passes `channel: 'telegram'` but not the chat_id.
**How to avoid:** Add `chat_id` (or `telegram_chat_id`) to the Telegram bot's request body in `handleCatBotMessage()`. Route.ts reads it to construct user_id.
**Warning signs:** All Telegram users share the same profile because user_id falls back to `telegram:unknown`.

### Pitfall 2: Reasoning Protocol Over-Classifying as Complex
**What goes wrong:** Too many requests classified as COMPLEJO, causing CatBot to ask excessive questions before acting.
**Why it happens:** Classification based on task TYPE rather than number of unknown parameters. "Create a CatPaw" has sensible defaults = MEDIO, not COMPLEJO.
**How to avoid:** Classification rules based on ambiguity (how many unknowns), not task nature. Default to action with sensible defaults. Limit to 1 question per turn for MEDIO.
**Warning signs:** Users responding "just do it" or "como tu veas". Avg turns-to-action > 3.

### Pitfall 3: Profile Directives Eating Token Budget
**What goes wrong:** As `initial_directives` and `known_context` grow, they eat into the token budget, pushing out important P2/P3 sections.
**Why it happens:** Profile data grows unbounded as CatBot learns more about the user.
**How to avoid:** Cap profile section at P1 priority with max 500 chars for directives + 500 chars for known_context. Truncate gracefully. Place reasoning protocol at P1 as well.
**Warning signs:** P3 sections (troubleshooting, email protocol) never appearing in assembled prompt.

### Pitfall 4: upsertProfile Increments interaction_count on Profile Update
**What goes wrong:** The existing `upsertProfile()` always increments `interaction_count` when updating. A post-conversation profile update would double-count: once for the pre-flight load (which creates if missing) and once for the post-conversation update.
**Why it happens:** `upsertProfile()` does `interaction_count = interaction_count + 1` on every UPDATE call.
**How to avoid:** Either: (a) only call upsertProfile once (at conversation end, not beginning), or (b) add a separate `incrementInteraction()` function that only bumps the counter, separate from `updateProfilePreferences()`.
**Warning signs:** interaction_count showing 2x the actual conversation count.

### Pitfall 5: Conversation Saving Not Passing user_id
**What goes wrong:** The current conversations API POST always saves with `userId: 'web:default'`. For Telegram conversations, user_id should be `telegram:{chat_id}`.
**How to avoid:** The chat route.ts must pass the correct userId when saving conversations (already exists in Phase 118 API, just not wired from route.ts).

## Code Examples

### Extending PromptContext for User Profile
```typescript
// In catbot-prompt-assembler.ts, extend PromptContext:
export interface PromptContext {
  page?: string;
  channel?: 'web' | 'telegram';
  hasSudo: boolean;
  catbotConfig: { /* existing */ };
  userProfile?: {
    display_name: string | null;
    initial_directives: string | null;
    known_context: string; // JSON
    communication_style: string | null;
    preferred_format: string | null;
  };
}
```

### Profile Section Builder
```typescript
function buildUserProfileSection(ctx: PromptContext): string {
  if (!ctx.userProfile) return '';
  
  const parts: string[] = [];
  
  if (ctx.userProfile.initial_directives?.trim()) {
    parts.push(`## Directivas del usuario\n${ctx.userProfile.initial_directives.slice(0, 500)}`);
  }
  
  if (ctx.userProfile.known_context && ctx.userProfile.known_context !== '{}') {
    try {
      const context = JSON.parse(ctx.userProfile.known_context);
      if (Object.keys(context).length > 0) {
        const lines = Object.entries(context).map(([k, v]) => `- ${k}: ${v}`);
        parts.push(`## Contexto conocido del usuario\n${lines.join('\n').slice(0, 500)}`);
      }
    } catch { /* ignore malformed JSON */ }
  }
  
  if (ctx.userProfile.communication_style) {
    parts.push(`Estilo de comunicacion preferido: ${ctx.userProfile.communication_style}`);
  }
  
  return parts.join('\n\n');
}
```

### Tool Call Pattern Extraction
```typescript
interface ProfileUpdate {
  knownContext?: Record<string, unknown>;
  communicationStyle?: string;
  preferredFormat?: string;
}

function extractPreferencesFromTools(
  toolResults: Array<{ name: string; args: Record<string, unknown>; result: unknown }>
): ProfileUpdate | null {
  const updates: ProfileUpdate = {};
  const toolNames = toolResults.map(r => r.name);
  
  // Detect technical user (uses bash_execute, service_manage)
  if (toolNames.includes('bash_execute') || toolNames.includes('service_manage')) {
    updates.communicationStyle = 'technical';
  }
  
  // Detect preferred connector from send_email
  const emailCalls = toolResults.filter(r => r.name === 'send_email');
  if (emailCalls.length > 0) {
    const connectorId = emailCalls[0].args.connector_id;
    if (connectorId) {
      updates.knownContext = { ...updates.knownContext, preferred_email_connector: connectorId };
    }
  }
  
  // Detect canvas-heavy user
  const canvasCalls = toolResults.filter(r => r.name.startsWith('canvas_'));
  if (canvasCalls.length >= 2) {
    updates.knownContext = { ...updates.knownContext, uses_canvas_frequently: true };
  }
  
  return Object.keys(updates).length > 0 ? updates : null;
}
```

### Auto-Generate Initial Directives
```typescript
function generateInitialDirectives(profile: ProfileRow): string {
  const parts: string[] = [];
  
  if (profile.display_name) {
    parts.push(`El usuario se llama ${profile.display_name}.`);
  }
  
  if (profile.channel === 'web') {
    parts.push('Interactua desde la interfaz web de DoCatFlow.');
  } else if (profile.channel.startsWith('telegram')) {
    parts.push('Interactua desde Telegram — respuestas concisas.');
  }
  
  if (profile.communication_style) {
    parts.push(`Prefiere comunicacion ${profile.communication_style}.`);
  }
  
  if (profile.preferred_format) {
    parts.push(`Formato preferido: ${profile.preferred_format}.`);
  }
  
  // Add from known_context
  try {
    const ctx = JSON.parse(profile.known_context || '{}');
    if (ctx.uses_canvas_frequently) parts.push('Usuario habitual de Canvas.');
    if (ctx.preferred_email_connector) parts.push(`Usa conector de email: ${ctx.preferred_email_connector}.`);
  } catch { /* ignore */ }
  
  return parts.join(' ');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded buildSystemPrompt() | PromptAssembler with P0-P3 priority sections | Phase 119 (2026-04-08) | Profile section slots into existing assembly |
| No user profiles | user_profiles table in catbot.db with CRUD | Phase 118 (2026-04-08) | CRUD ready, just needs orchestration wiring |
| No conversation persistence | conversation_log in catbot.db + API | Phase 118 (2026-04-08) | Conversations saved server-side |
| Static CatBot personality | Config UI with instructions_primary/secondary, personality_custom | Phase 120 (2026-04-08) | User customization feeds into PromptAssembler |

## Open Questions

1. **How should Telegram chat_id be passed to route.ts?**
   - What we know: Telegram bot calls `/api/catbot/chat` with `channel: 'telegram'` but no chat_id
   - What's unclear: Best field name — `chat_id`, `telegram_chat_id`, or generic `user_id`
   - Recommendation: Add `user_id` field to the request body. Web sends nothing (defaults to `web:default`), Telegram sends `telegram:{chatId}`.

2. **Should initial_directives be auto-generated or manually editable?**
   - What we know: Requirements say "auto-generated paragraph" (PROFILE-03)
   - What's unclear: Whether user should also be able to edit it from Settings UI
   - Recommendation: Auto-generate on every conversation from profile fields. No UI edit for now (Phase 121 scope). Future: admin can edit via CatBot sudo.

3. **When to regenerate initial_directives?**
   - What we know: Directives should reflect accumulated knowledge
   - Recommendation: Regenerate after every profile update (cheap string operation). Store as computed field, not user-edited.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | app/vitest.config.ts |
| Quick run command | `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-db.test.ts --reporter=verbose` |
| Full suite command | `cd /home/deskmath/docflow/app && npx vitest run --reporter=verbose` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROFILE-01 | Auto-create profile on first interaction | unit | `npx vitest run src/lib/__tests__/catbot-user-profile.test.ts -t "auto-create"` | No — Wave 0 |
| PROFILE-02 | Profile schema fields match spec | unit | `npx vitest run src/lib/__tests__/catbot-db.test.ts -t "upsertProfile"` | Yes (existing) |
| PROFILE-03 | initial_directives injected in prompt | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "profile"` | No — Wave 0 |
| PROFILE-04 | Post-conversation profile update from tool patterns | unit | `npx vitest run src/lib/__tests__/catbot-user-profile.test.ts -t "extract"` | No — Wave 0 |
| PROFILE-05 | user_id format web:default / telegram:{chat_id} | unit | `npx vitest run src/lib/__tests__/catbot-user-profile.test.ts -t "userId"` | No — Wave 0 |
| REASON-01 | Reasoning protocol section present in assembled prompt | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "reasoning"` | No — Wave 0 |
| REASON-02-04 | Classification examples in prompt text | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "simple\|medio\|complejo"` | No — Wave 0 |
| REASON-05 | Capa 0 skip instruction present in prompt | unit | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "Capa 0"` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-user-profile.test.ts src/lib/__tests__/catbot-prompt-assembler.test.ts --reporter=verbose`
- **Per wave merge:** `cd /home/deskmath/docflow/app && npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/catbot-user-profile.test.ts` -- covers PROFILE-01, PROFILE-04, PROFILE-05
- [ ] Extended tests in `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` -- covers PROFILE-03, REASON-01 through REASON-05

## Sources

### Primary (HIGH confidence)
- Direct code analysis: `app/src/lib/catbot-db.ts` — user_profiles schema, upsertProfile(), getProfile()
- Direct code analysis: `app/src/lib/services/catbot-prompt-assembler.ts` — PromptContext interface, section builder pattern, P0-P3 priority system
- Direct code analysis: `app/src/app/api/catbot/chat/route.ts` — current chat flow, where to hook profile load and post-conversation update
- Direct code analysis: `app/src/lib/services/telegram-bot.ts` — handleCatBotMessage() request body (missing chat_id)
- Direct code analysis: `app/src/app/api/catbot/conversations/route.ts` — conversation save pattern

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` — Pitfall 8 (over-asking), Anti-Pattern 3 (LLM profile extraction)
- `.planning/research/ARCHITECTURE.md` — Target architecture patterns, UserProfileService design
- `.planning/research/FEATURES.md` — Feature dependency graph, reasoning protocol design

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — extending existing patterns (PromptAssembler sections, catbot-db CRUD)
- Pitfalls: HIGH — well-documented in project research, code analysis confirms gaps (missing chat_id)

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable — internal codebase, no external dependencies changing)
