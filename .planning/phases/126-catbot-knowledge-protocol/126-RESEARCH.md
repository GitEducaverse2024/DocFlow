# Phase 126: CatBot Knowledge Protocol - Research

**Researched:** 2026-04-09
**Domain:** CatBot prompt engineering + SQLite schema + tool registration
**Confidence:** HIGH

## Summary

Phase 126 implements the "Knowledge Protocol" -- a set of prompt instructions and a new tool that make CatBot aware of its own knowledge system, instructing it when to use each knowledge tool and automatically logging gaps when it cannot answer a question. The phase is entirely self-contained within existing patterns: a new PromptAssembler section (P1), a new SQLite table in catbot.db, a new tool registration in catbot-tools.ts, and a modification to the reasoning protocol text.

All five requirements (KPROTO-01 through KPROTO-05) are achievable with prompt-level changes and minimal code additions. No new API routes, no new UI components, no new dependencies. The most important design decision is that KPROTO-04 (auto-logging gaps) is implemented via **prompt instruction**, not via code -- CatBot is instructed to call `log_knowledge_gap` when `query_knowledge` returns 0 results, rather than hard-coding this behavior.

**Primary recommendation:** Implement in 2 plans: Plan 01 creates the knowledge_gaps table + log_knowledge_gap tool, Plan 02 adds the Knowledge Protocol P1 section to PromptAssembler and modifies the reasoning protocol.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| KPROTO-01 | PromptAssembler inyecta seccion P1 "Protocolo de Conocimiento" con instrucciones de cuando usar cada tool de knowledge | New `buildKnowledgeProtocol()` function in prompt-assembler.ts, added as P1 section |
| KPROTO-02 | Existe un tool log_knowledge_gap que registra en catbot.db cuando CatBot no puede responder | New tool definition in TOOLS[], new case in executeTool, always_allowed permission |
| KPROTO-03 | Tabla knowledge_gaps en catbot.db con campos: id, knowledge_path, query, context, reported_at, resolved, resolved_at | New CREATE TABLE in catbot-db.ts schema block, new CRUD functions |
| KPROTO-04 | Cuando query_knowledge devuelve 0 resultados, CatBot llama automaticamente a log_knowledge_gap | Prompt instruction in the P1 Knowledge Protocol section (not code) |
| KPROTO-05 | El reasoning protocol referencia el protocolo de conocimiento: antes de COMPLEJO, consultar knowledge primero | Modification to `buildReasoningProtocol()` text |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (project ver) | SQLite for knowledge_gaps table | Existing catbot.db pattern |
| vitest | (project ver) | Test framework | Existing test infrastructure |

### Supporting
No new libraries needed. All implementation uses existing project patterns.

## Architecture Patterns

### Pattern 1: catbot-db.ts Schema Extension
**What:** Add `knowledge_gaps` table to the existing schema block in catbot-db.ts
**When to use:** KPROTO-03
**Example:**
```typescript
// In catbot-db.ts schema block (after knowledge_learned table)
CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id TEXT PRIMARY KEY,
  knowledge_path TEXT,
  query TEXT NOT NULL,
  context TEXT,
  reported_at TEXT DEFAULT (datetime('now')),
  resolved INTEGER DEFAULT 0,
  resolved_at TEXT
);
```
Source: Pattern from existing tables in catbot-db.ts lines 34-102.

### Pattern 2: Tool Registration in catbot-tools.ts
**What:** Add `log_knowledge_gap` to TOOLS array + executeTool switch case
**When to use:** KPROTO-02
**Example:**
```typescript
// TOOLS array entry
{
  type: 'function',
  function: {
    name: 'log_knowledge_gap',
    description: 'Registra un gap de conocimiento cuando no pudiste responder algo. Usa esto automaticamente cuando query_knowledge devuelve 0 resultados y tampoco tienes la respuesta.',
    parameters: {
      type: 'object',
      properties: {
        knowledge_path: { type: 'string', description: 'Area estimada del gap (ej: catbrains, canvas, catflow)' },
        query: { type: 'string', description: 'La consulta que no tuvo resultados' },
        context: { type: 'string', description: 'Contexto adicional: que pregunto el usuario, que buscaste' },
      },
      required: ['query'],
    },
  },
},
```

### Pattern 3: Permission Gate (always_allowed)
**What:** `log_knowledge_gap` must be always_allowed (like `query_knowledge`)
**When to use:** KPROTO-02 permission setup
**How:** Add `name === 'log_knowledge_gap'` to the always_allowed condition in `getToolsForLLM()` at line 987. The tool logs internal system data, not user-facing write operations, so it should not be permission-gated.

### Pattern 4: PromptAssembler P1 Section
**What:** New `buildKnowledgeProtocol()` function returning protocol text
**When to use:** KPROTO-01, KPROTO-04
**Example structure:**
```typescript
function buildKnowledgeProtocol(): string {
  return `## Protocolo de Conocimiento

Tienes un sistema de conocimiento estructurado. Usalo estrategicamente:

### Herramientas de conocimiento
- **query_knowledge**: Consulta el arbol de conocimiento por area o texto libre. Usa esto ANTES de responder preguntas sobre funcionalidades de DoCatFlow.
- **search_documentation**: Busca en archivos .md del proyecto. Usa esto para preguntas tecnicas, decisiones de desarrollo o estado de features.
- **save_learned_entry**: Guarda aprendizajes reutilizables cuando resuelvas problemas. Pasa por staging.
- **log_knowledge_gap**: Registra cuando NO puedes responder algo. OBLIGATORIO usarla cuando query_knowledge devuelve 0 resultados y tu tampoco tienes la respuesta.

### Cuando usar cada tool
1. Usuario pregunta sobre funcionalidad de DoCatFlow → query_knowledge primero
2. query_knowledge devuelve 0 resultados → intenta search_documentation
3. Ambos devuelven 0 resultados → llama log_knowledge_gap con la query y contexto, luego responde honestamente que no tienes esa informacion
4. Resolviste un problema con exito → save_learned_entry si la solucion es reutilizable

### Regla de gap obligatorio
Si query_knowledge devuelve un mensaje de "No se encontraron resultados" Y tu tampoco tienes la informacion para responder, DEBES llamar log_knowledge_gap ANTES de dar tu respuesta al usuario. Incluye:
- knowledge_path: area estimada (catbrains, canvas, catflow, etc.)
- query: la consulta original que fallo
- context: breve descripcion de que pregunto el usuario`;
}
```

### Pattern 5: Reasoning Protocol Modification
**What:** Add knowledge consultation step before COMPLEJO classification
**When to use:** KPROTO-05
**Where:** `buildReasoningProtocol()` function in catbot-prompt-assembler.ts (line 572)
**Change:** Add a line in the COMPLEJO section: "Antes de clasificar como COMPLEJO, consulta query_knowledge para verificar si ya tienes informacion relevante que simplifique el problema."

### Anti-Patterns to Avoid
- **Hard-coding gap logging in executeTool:** KPROTO-04 specifies "instruccion en prompt, no codigo". Do NOT add code to auto-call log_knowledge_gap when query_knowledge returns empty -- this is a prompt instruction.
- **Making log_knowledge_gap permission-gated:** It's internal telemetry, not a user-facing write. Must be always_allowed.
- **Adding log_knowledge_gap to knowledge JSONs tools[]:** It IS a CatBot tool so it MUST appear in at least one knowledge JSON per KTREE-02 bidirectional sync test. Add it to the most relevant JSON (settings.json or create a "catbot" area -- but simpler to add to an existing area like settings since CatBot config lives there).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | crypto.randomUUID() | generateId() from utils | Project convention (line 897 in catbot-tools.ts) |
| DB schema migration | Manual ALTER TABLE | CREATE TABLE IF NOT EXISTS | Existing pattern in catbot-db.ts |
| Permission gating | Custom check | Existing getToolsForLLM pattern | Consistency with 50+ existing tools |

## Common Pitfalls

### Pitfall 1: Forgetting KTREE-02 bidirectional sync test
**What goes wrong:** Adding log_knowledge_gap tool to TOOLS[] but not to any knowledge JSON tools[] array
**Why it happens:** Phase 125 added a test that validates every tool in TOOLS[] appears in at least one knowledge JSON
**How to avoid:** After adding the tool, add 'log_knowledge_gap' to the tools[] array of a relevant knowledge JSON (settings.json is best candidate -- CatBot knowledge/config area)
**Warning signs:** `npm run test` fails on knowledge-tools-sync.test.ts

### Pitfall 2: Token budget explosion from P1 section
**What goes wrong:** Knowledge Protocol section is too long and pushes out other P1 sections on Libre tier (16K budget)
**Why it happens:** Libre models have aggressive budget, all P1 sections compete
**How to avoid:** Keep the protocol text concise (under 800 chars). Current P1 sections include: user_profile, reasoning_protocol, matched_recipe, page_knowledge, platform_overview, skills_protocols, canvas_protocols. Another P1 adds pressure.
**Warning signs:** Build the prompt with a Libre model config and check total length

### Pitfall 3: Not exporting CRUD functions from catbot-db.ts
**What goes wrong:** Functions are defined but not accessible for Phase 127 (Admin Dashboard)
**Why it happens:** Forgetting that Phase 127 will need getKnowledgeGaps(), resolveKnowledgeGap() etc.
**How to avoid:** Export all CRUD functions. Phase 127 will consume them for the Knowledge Gaps admin tab.

### Pitfall 4: resolved field as TEXT instead of INTEGER
**What goes wrong:** SQLite uses 0/1 for boolean, not true/false
**Why it happens:** Requirements say "resolved (boolean)" but SQLite has no boolean type
**How to avoid:** Use `resolved INTEGER DEFAULT 0` consistent with knowledge_learned.validated pattern

### Pitfall 5: Missing knowledge_path in log_knowledge_gap
**What goes wrong:** CatBot calls the tool without knowledge_path, making gap reports hard to categorize
**Why it happens:** knowledge_path is hard to infer when query_knowledge searched all areas
**How to avoid:** Make knowledge_path optional in tool schema (not required) but instruct in the prompt to estimate it when possible. The admin dashboard (Phase 127) can filter by area.

## Code Examples

### CRUD functions for knowledge_gaps
```typescript
// catbot-db.ts additions

export interface KnowledgeGapRow {
  id: string;
  knowledge_path: string | null;
  query: string;
  context: string | null;
  reported_at: string;
  resolved: number;
  resolved_at: string | null;
}

export function saveKnowledgeGap(gap: {
  knowledgePath?: string;
  query: string;
  context?: string;
}): string {
  const id = generateId();
  catbotDb.prepare(`
    INSERT INTO knowledge_gaps (id, knowledge_path, query, context)
    VALUES (?, ?, ?, ?)
  `).run(id, gap.knowledgePath ?? null, gap.query, gap.context ?? null);
  return id;
}

export function getKnowledgeGaps(opts?: {
  resolved?: boolean;
  knowledgePath?: string;
}): KnowledgeGapRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (opts?.resolved !== undefined) {
    conditions.push('resolved = ?');
    params.push(opts.resolved ? 1 : 0);
  }
  if (opts?.knowledgePath) {
    conditions.push('knowledge_path = ?');
    params.push(opts.knowledgePath);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return catbotDb.prepare(
    `SELECT * FROM knowledge_gaps ${where} ORDER BY reported_at DESC`
  ).all(...params) as KnowledgeGapRow[];
}

export function resolveKnowledgeGap(id: string): void {
  catbotDb.prepare(`
    UPDATE knowledge_gaps SET resolved = 1, resolved_at = datetime('now') WHERE id = ?
  `).run(id);
}
```

### executeTool case for log_knowledge_gap
```typescript
case 'log_knowledge_gap': {
  const id = saveKnowledgeGap({
    knowledgePath: args.knowledge_path as string | undefined,
    query: args.query as string,
    context: args.context as string | undefined,
  });
  return { name, result: { logged: true, gap_id: id, message: 'Gap de conocimiento registrado. Un administrador lo revisara.' } };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic buildSystemPrompt() | PromptAssembler modular P0-P3 | Phase 119 | All new protocol sections use this pattern |
| FEATURE_KNOWLEDGE hardcoded | Knowledge tree JSON files | Phase 118 | query_knowledge reads from JSONs |
| No gap tracking | knowledge_gaps table | Phase 126 (this) | Enables admin visibility into knowledge holes |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | app/vitest.config.ts |
| Quick run command | `cd ~/docflow/app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` |
| Full suite command | `cd ~/docflow/app && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KPROTO-01 | PromptAssembler includes "Protocolo de Conocimiento" section | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | Exists (extend) |
| KPROTO-02 | log_knowledge_gap tool exists in TOOLS and executes correctly | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/catbot-knowledge-gap.test.ts -x` | Wave 0 |
| KPROTO-03 | knowledge_gaps table exists with correct schema | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/catbot-knowledge-gap.test.ts -x` | Wave 0 |
| KPROTO-04 | Prompt text instructs auto-calling log_knowledge_gap on 0 results | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | Exists (extend) |
| KPROTO-05 | Reasoning protocol references knowledge consultation before COMPLEJO | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | Exists (extend) |

### Sampling Rate
- **Per task commit:** `cd ~/docflow/app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts src/lib/__tests__/catbot-knowledge-gap.test.ts -x`
- **Per wave merge:** `cd ~/docflow/app && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/catbot-knowledge-gap.test.ts` -- covers KPROTO-02, KPROTO-03
- [ ] Extend `catbot-prompt-assembler.test.ts` -- covers KPROTO-01, KPROTO-04, KPROTO-05
- [ ] Run `knowledge-tools-sync.test.ts` after adding tool to verify bidirectional sync (KTREE-02)

## Open Questions

1. **Which knowledge JSON should include log_knowledge_gap in its tools[] array?**
   - What we know: KTREE-02 test requires every TOOLS[] entry to appear in at least one knowledge JSON
   - What's unclear: There's no "catbot" knowledge area JSON. Settings.json is closest since CatBot config lives there.
   - Recommendation: Add to settings.json tools[] array. It's the natural home for CatBot system-level tools.

2. **Should there be a dedup check on knowledge_gaps?**
   - What we know: If CatBot repeatedly fails on the same query, it could create duplicate gaps
   - What's unclear: Requirements don't mention dedup
   - Recommendation: Simple dedup by query text + knowledge_path within last 24h (same pattern as learned entry dedup). Not strictly required but sensible.

## Sources

### Primary (HIGH confidence)
- catbot-db.ts (lines 34-102) -- existing schema pattern for all 5 tables
- catbot-tools.ts (lines 58-895) -- TOOLS array, (lines 970-1010) permission gate, (lines 1232-1293) query_knowledge execution
- catbot-prompt-assembler.ts (lines 630-759) -- build() function, section registration pattern
- knowledge-tree.ts -- KnowledgeEntry schema, loadKnowledgeArea API

### Secondary (MEDIUM confidence)
- REQUIREMENTS.md lines 92-98 -- KPROTO requirements text (verbatim from project)
- Phase 125 decisions in STATE.md -- bidirectional sync test constraint

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all uses existing project patterns, no new libraries
- Architecture: HIGH -- every pattern has a direct precedent in the codebase
- Pitfalls: HIGH -- identified from actual test infrastructure (KTREE-02 sync) and budget system

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable internal patterns, no external dependencies)
