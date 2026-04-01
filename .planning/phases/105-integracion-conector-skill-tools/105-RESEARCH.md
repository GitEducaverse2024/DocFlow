# Phase 105: Integracion - Conector + Skill + Tools - Research

**Researched:** 2026-04-01
**Domain:** CatPaw tool-calling, connector system, email templates, skill seeding
**Confidence:** HIGH

## Summary

This phase integrates email templates into the CatPaw tool-calling system so that canvas agents can autonomously: (1) list available templates, (2) retrieve template details with instruction blocks, and (3) render final HTML by filling instruction variables. The architecture follows well-established patterns already used for Gmail and Google Drive connectors in execute-catpaw.ts.

The codebase has a clear, repeatable pattern for connector-specific tools: a `catpaw-{type}-tools.ts` file defines OpenAI-format tool definitions and a dispatch map, a `catpaw-{type}-executor.ts` file handles execution, and `execute-catpaw.ts` wires them into the tool-calling loop. The email template API endpoints already exist (list, get by ID, render with variables) and just need to be wrapped as LLM-callable tools.

**Primary recommendation:** Follow the catpaw-gmail-tools/catpaw-gmail-executor pattern exactly. Create `catpaw-email-template-tools.ts` and `catpaw-email-template-executor.ts`, then wire into execute-catpaw.ts alongside the existing Gmail/Drive/MCP tool blocks.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js 14 | App Router | API routes at `/api/email-templates/` | Already serves template CRUD + render |
| better-sqlite3 | via db.ts | Direct DB queries for templates | Same pattern as all other tools |
| LiteLLM | proxy | Tool-calling loop in execute-catpaw.ts | Already handles multi-round tool calls |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| template-renderer.ts | internal | `renderTemplate(structure, variables)` | For INT-03 render tool |
| Playwright | e2e test | API spec tests | For INT-07 |

### No New Dependencies
This phase requires zero new npm packages. Everything builds on existing infrastructure.

## Architecture Patterns

### Pattern 1: Connector-Specific Tool Files (Gmail/Drive Pattern)

The project uses a 3-file pattern for each connector type that provides LLM tools:

```
app/src/lib/services/
  catpaw-{type}-tools.ts      # Tool definitions + dispatch map
  catpaw-{type}-executor.ts   # Tool execution logic
  execute-catpaw.ts           # Wires tools into the tool-calling loop
```

**How it works:**

1. `catpaw-{type}-tools.ts` exports:
   - `get{Type}ToolsForPaw(pawId, connectorInfos)` returning `{ tools: ToolDefinition[], dispatch: Map<string, DispatchInfo> }`
   - A `{Type}ToolDispatch` interface with `connectorId`, `connectorName`, `operation`

2. `catpaw-{type}-executor.ts` exports:
   - `execute{Type}ToolCall(pawId, dispatch, args)` returning `Promise<string>` (JSON stringified result for LLM)

3. `execute-catpaw.ts` integration point (around line 310-340):
   - Filters `linkedConnectors` by `connector_type`
   - Calls `get{Type}ToolsForPaw()` to get tool definitions
   - Pushes tools into `openAITools` array
   - Adds dispatch entries to a type-specific dispatch map
   - In the tool-calling loop (line 473+), checks dispatch maps to route calls

**Source:** `catpaw-gmail-tools.ts`, `catpaw-gmail-executor.ts`, `catpaw-drive-tools.ts`, `catpaw-drive-executor.ts`

### Pattern 2: Connector Type Registration

Adding a new connector type requires changes in these locations:

| File | What to change |
|------|----------------|
| `app/src/lib/types.ts` line 213 | Add `'email_template'` to Connector.type union |
| `app/src/lib/types.ts` line 228 | Add to CatBrainConnector.type if needed |
| `app/src/app/api/connectors/route.ts` line 8 | Add to `VALID_TYPES` array |
| `app/src/lib/services/catbrain-connector-executor.ts` line 22 | Add to ConnectorRow.type union |
| `app/src/lib/services/execute-catpaw.ts` | Add skip for `email_template` in connector pre-fetch loop + add tool-calling block |
| `app/src/lib/services/catbot-tools.ts` line 110 | Add to create_connector enum |

### Pattern 3: Skill Seeding in db.ts

Skills are seeded at the bottom of `db.ts` using `INSERT OR IGNORE` with fixed IDs:

```typescript
const skillCount = (db.prepare("SELECT COUNT(*) as count FROM skills WHERE id = 'my-skill-id'").get() as { count: number }).count;
if (skillCount === 0) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO skills (id, name, description, category, tags, instructions, output_template, constraints, source, version, is_featured, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'built-in', '1.0', 1, ?, ?)`).run(
    'my-skill-id',
    'Skill Name',
    'Description',
    'strategy',
    '["tag1","tag2"]',
    'Full instruction text...',
    null, // output_template (optional)
    null, // constraints (optional)
    now, now
  );
}
```

**Source:** db.ts lines 4293-4370 (Arquitecto de Agentes skill seed pattern)

### Pattern 4: Connector Seeding in db.ts

Connectors are seeded with fixed IDs like `'seed-linkedin-mcp'`, `'seed-holded-mcp'`:

```typescript
const exists = (db.prepare(
  "SELECT COUNT(*) as c FROM connectors WHERE id = 'seed-email-template'"
).get() as { c: number }).c;

if (exists === 0) {
  db.prepare(`
    INSERT OR IGNORE INTO connectors (id, name, type, config, description, emoji, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    'seed-email-template',
    'Email Templates',
    'email_template',
    JSON.stringify({ /* config */ }),
    'Description',
    'emoji',
    now, now
  );
}
```

**Source:** db.ts lines 1313-1455

### Pattern 5: Canvas Connector Node Execution

Canvas nodes of type `'connector'` are handled in `canvas-executor.ts` with a switch on `connector.type`:

```typescript
case 'connector': {
  const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND is_active = 1').get(connectorId);
  
  if ((connector.type as string) === 'gmail') { /* gmail logic */ }
  if ((connector.type as string) === 'google_drive') { /* drive logic */ }
  if ((connector.type as string) === 'mcp_server') { /* mcp logic */ }
  // ... etc
}
```

For email_template, the canvas connector node would NOT send emails directly -- it would render the template and pass HTML to the next node (which could be a gmail connector node to actually send).

### Recommended New Files Structure
```
app/src/lib/services/
  catpaw-email-template-tools.ts     # NEW: 3 tool definitions
  catpaw-email-template-executor.ts  # NEW: executes via direct DB + renderTemplate()
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Template rendering | Custom HTML builder | `renderTemplate()` from `template-renderer.ts` | Already handles sections, blocks, variables, styles |
| Template variable injection | String replacement | `renderTemplate(structure, variables)` with instruction block `text` as key | The renderer already matches `block.text` keys to variables map |
| Tool definition format | Custom format | OpenAI function-calling format `{ type: 'function', function: { name, description, parameters } }` | LiteLLM expects this exact format |
| Email sending from canvas | Build into template connector | Keep as separate gmail connector node downstream | Separation of concerns: render vs. send |

**Key insight:** The `renderTemplate()` function already does variable substitution via instruction blocks. The `variables` parameter is a `Record<string, string>` where keys match `block.text` values of `type: 'instruction'` blocks. The tools just need to expose this to the LLM.

## Common Pitfalls

### Pitfall 1: Template Variables Key Mismatch
**What goes wrong:** The LLM sends variable keys that don't match the instruction block `text` values exactly.
**Why it happens:** Instruction blocks have specific `text` like "Contenido principal del email" and the LLM might use different keys.
**How to avoid:** In the `get_email_template` tool response, explicitly list instruction blocks with their exact `text` values as "variable keys". In the `render_email_template` tool description, specify that variable keys MUST match the instruction block text exactly.
**Warning signs:** Rendered HTML shows placeholder boxes instead of filled content.

### Pitfall 2: Connector Type Not Added Everywhere
**What goes wrong:** API returns 400 "invalid type" when creating the connector.
**Why it happens:** `VALID_TYPES` array in multiple API route files needs updating.
**How to avoid:** Update ALL locations listed in Pattern 2 above.
**Warning signs:** Test for connector creation fails with validation error.

### Pitfall 3: execute-catpaw.ts Connector Skip Logic
**What goes wrong:** The email_template connector gets executed in the "pre-fetch" connector loop (lines 115-250) as a generic HTTP call, failing because it has no URL.
**Why it happens:** `execute-catpaw.ts` has two phases: (1) pre-fetch connectors for context, (2) tool-calling. Tool-based connectors like Gmail and Drive are skipped in phase 1 (line 121: `if (['google_drive', 'gmail'].includes(conn.connector_type)) continue;`).
**How to avoid:** Add `'email_template'` to the skip array on line 121 of execute-catpaw.ts.
**Warning signs:** Error "fetch failed" or "url undefined" during CatPaw execution.

### Pitfall 4: Skill Not Linked to CatPaw
**What goes wrong:** The "Maquetador de Email" skill exists but agents don't use it.
**Why it happens:** Skills need to be explicitly linked via `cat_paw_skills` relation table.
**How to avoid:** The skill seed is just data. Users link it via the UI or CatBot's `link_skill_to_catpaw` tool. Document this in the skill description.

## Code Examples

### Tool Definitions (catpaw-email-template-tools.ts)

```typescript
// Source: Following catpaw-gmail-tools.ts pattern exactly

interface EmailTemplateConnectorInfo {
  connectorId: string;
  connectorName: string;
}

export interface EmailTemplateToolDispatch {
  connectorId: string;
  connectorName: string;
  operation: string; // 'list_templates' | 'get_template' | 'render_template'
}

export function getEmailTemplateToolsForPaw(
  pawId: string,
  connectors: EmailTemplateConnectorInfo[]
): { tools: ToolDefinition[]; dispatch: Map<string, EmailTemplateToolDispatch> } {
  const tools: ToolDefinition[] = [];
  const dispatch = new Map<string, EmailTemplateToolDispatch>();

  // Only one set of tools regardless of how many email_template connectors
  // (unlike Gmail/Drive which may have multiple accounts)
  const conn = connectors[0];

  tools.push({
    type: 'function',
    function: {
      name: 'list_email_templates',
      description: 'Lista las plantillas de email disponibles con su nombre, descripcion y categoria.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filtrar por categoria (opcional)' },
        },
      },
    },
  });
  dispatch.set('list_email_templates', {
    connectorId: conn.connectorId,
    connectorName: conn.connectorName,
    operation: 'list_templates',
  });

  tools.push({
    type: 'function',
    function: {
      name: 'get_email_template',
      description: 'Obtiene la estructura completa de una plantilla: bloques, instrucciones (variables a rellenar), estilos. Las instrucciones tienen un campo "text" que es la clave a usar como variable en render.',
      parameters: {
        type: 'object',
        properties: {
          template_id: { type: 'string', description: 'ID de la plantilla' },
        },
        required: ['template_id'],
      },
    },
  });
  dispatch.set('get_email_template', {
    connectorId: conn.connectorId,
    connectorName: conn.connectorName,
    operation: 'get_template',
  });

  tools.push({
    type: 'function',
    function: {
      name: 'render_email_template',
      description: 'Renderiza una plantilla con variables rellenadas. Las claves de variables DEBEN coincidir exactamente con el campo "text" de los bloques instruction. Devuelve HTML final listo para enviar.',
      parameters: {
        type: 'object',
        properties: {
          template_id: { type: 'string', description: 'ID de la plantilla' },
          variables: {
            type: 'object',
            description: 'Mapa de variables: { "texto exacto del bloque instruction": "contenido a insertar" }',
          },
        },
        required: ['template_id', 'variables'],
      },
    },
  });
  dispatch.set('render_email_template', {
    connectorId: conn.connectorId,
    connectorName: conn.connectorName,
    operation: 'render_template',
  });

  return { tools, dispatch };
}
```

### Tool Executor (catpaw-email-template-executor.ts)

```typescript
// Source: Following catpaw-gmail-executor.ts pattern

import db from '@/lib/db';
import { renderTemplate } from '@/lib/services/template-renderer';
import type { EmailTemplate, TemplateStructure } from '@/lib/types';
import type { EmailTemplateToolDispatch } from './catpaw-email-template-tools';

export async function executeEmailTemplateToolCall(
  pawId: string,
  dispatch: EmailTemplateToolDispatch,
  args: Record<string, unknown>,
): Promise<string> {
  switch (dispatch.operation) {
    case 'list_templates': {
      const category = args.category as string | undefined;
      let query = 'SELECT id, name, description, category FROM email_templates WHERE is_active = 1';
      const params: unknown[] = [];
      if (category) { query += ' AND category = ?'; params.push(category); }
      query += ' ORDER BY updated_at DESC';
      const templates = db.prepare(query).all(...params);
      return JSON.stringify(templates);
    }

    case 'get_template': {
      const id = args.template_id as string;
      if (!id) return JSON.stringify({ error: 'template_id es requerido' });
      const template = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id) as EmailTemplate | undefined;
      if (!template) return JSON.stringify({ error: 'Template no encontrado' });

      const structure: TemplateStructure = JSON.parse(template.structure);
      // Extract instruction blocks for the LLM to know which variables to fill
      const instructions: string[] = [];
      for (const section of Object.values(structure.sections)) {
        for (const row of section.rows) {
          for (const col of row.columns) {
            if (col.block.type === 'instruction' && col.block.text) {
              instructions.push(col.block.text);
            }
          }
        }
      }

      return JSON.stringify({
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        instructions, // Variable keys the LLM must fill
        structure,
      });
    }

    case 'render_template': {
      const id = args.template_id as string;
      const variables = args.variables as Record<string, string> || {};
      if (!id) return JSON.stringify({ error: 'template_id es requerido' });

      const template = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id) as EmailTemplate | undefined;
      if (!template) return JSON.stringify({ error: 'Template no encontrado' });

      const structure: TemplateStructure = JSON.parse(template.structure);
      const { html, text } = renderTemplate(structure, variables);

      // Update times_used
      db.prepare('UPDATE email_templates SET times_used = times_used + 1, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), id);

      return JSON.stringify({ html, text, template_id: id, template_name: template.name });
    }

    default:
      return JSON.stringify({ error: `Operacion desconocida: ${dispatch.operation}` });
  }
}
```

### execute-catpaw.ts Integration Point

```typescript
// In the connector skip block (around line 121):
if (['google_drive', 'gmail', 'email_template'].includes(conn.connector_type)) {
  continue;
}

// After the Drive tools block (around line 340):
// Email Template tools
const emailTemplateConnectors = linkedConnectors.filter(c => c.connector_type === 'email_template');
if (emailTemplateConnectors.length > 0) {
  const etInfos = emailTemplateConnectors.map(c => ({
    connectorId: c.connector_id,
    connectorName: c.connector_name,
  }));
  const { tools: etTools, dispatch: etDispatchMap } = getEmailTemplateToolsForPaw(pawId, etInfos);
  openAITools.push(...etTools);
  etDispatchMap.forEach((info, name) => emailTemplateToolDispatch.set(name, info));

  systemParts.push(`\n--- EMAIL TEMPLATES ---\nTienes herramientas para trabajar con plantillas de email corporativas: list_email_templates, get_email_template, render_email_template. Usa get_email_template para ver las instrucciones (variables) que debes rellenar. Luego usa render_email_template con esas variables para generar el HTML final.\n--- FIN EMAIL TEMPLATES ---`);
}

// In the tool-calling loop (around line 478):
const etDispatch = emailTemplateToolDispatch.get(tc.function.name);
if (etDispatch) {
  result = await executeEmailTemplateToolCall(pawId, etDispatch, args);
}
```

### Skill Seed (Maquetador de Email)

```typescript
// In db.ts, after other skill seeds:
const maquetadorCount = (db.prepare(
  "SELECT COUNT(*) as count FROM skills WHERE id = 'maquetador-email'"
).get() as { count: number }).count;
if (maquetadorCount === 0) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO skills (id, name, description, category, tags, instructions, constraints, source, version, is_featured, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'built-in', '1.0', 1, ?, ?)`).run(
    'maquetador-email',
    'Maquetador de Email',
    'Skill para seleccionar y rellenar plantillas de email corporativas automaticamente segun contexto.',
    'strategy',
    '["email","template","maquetador","html"]',
    `Eres un maquetador de emails profesional...`, // Full instructions
    null,
    now, now
  );
}
```

### Connector Seed (email_template)

```typescript
// In db.ts, after other connector seeds:
const etConnectorExists = (db.prepare(
  "SELECT COUNT(*) as c FROM connectors WHERE id = 'seed-email-template'"
).get() as { c: number }).c;

if (etConnectorExists === 0) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO connectors (id, name, type, config, description, emoji, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    'seed-email-template',
    'Plantillas Email Corporativas',
    'email_template',
    JSON.stringify({ tools: ['list_email_templates', 'get_email_template', 'render_email_template'] }),
    'Conector para acceder a las plantillas de email de DoCatFlow. Permite listar, consultar y renderizar templates.',
    '\u{1F3A8}',
    now, now
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CatBrain connectors (catbrain_connectors table) | CatPaw connectors (cat_paw_connectors table) | CatPaw migration | Tools are defined per-CatPaw, not per-CatBrain |
| Generic connector execution in catbrain-connector-executor.ts | Type-specific tool files (catpaw-{type}-tools.ts) | Gmail/Drive phases | Each connector type has dedicated tool definitions and executor |
| Email HTML hand-built in connector executor | Template renderer with structured blocks | Phase 100/103 | `renderTemplate()` handles all HTML generation |

## Open Questions

1. **Canvas connector node for email_template**
   - What we know: Canvas `connector` nodes dispatch by `connector.type`. Adding `email_template` case to canvas-executor.ts would render HTML and pass it downstream.
   - What's unclear: Should the canvas connector node auto-render with empty variables (showing placeholders), or should it only work when preceded by a CatPaw that fills variables?
   - Recommendation: In canvas-executor.ts, if connector type is `email_template`, get the template, extract predecessor output as variables (try JSON.parse), render, and pass HTML forward. This lets a CatPaw node produce `{ "variable_key": "content" }` JSON that flows into the template connector node.

2. **Multiple email_template connectors per CatPaw**
   - What we know: Gmail/Drive support multiple connectors with name-prefixed tools.
   - What's unclear: Does it make sense to have multiple email_template connectors?
   - Recommendation: No -- unlike Gmail accounts, templates are global. Use single connector, no name prefixing needed. The tools always query the same `email_templates` table.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (e2e) |
| Config file | `app/playwright.config.ts` |
| Quick run command | `cd app && npx playwright test e2e/api/email-templates.api.spec.ts` |
| Full suite command | `cd app && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INT-01 | list_email_templates tool returns active templates | API e2e | `npx playwright test e2e/api/email-templates.api.spec.ts -g "list"` | No - Wave 0 |
| INT-02 | get_email_template returns structure + instructions | API e2e | `npx playwright test e2e/api/email-templates.api.spec.ts -g "get"` | No - Wave 0 |
| INT-03 | render_email_template produces valid HTML | API e2e | `npx playwright test e2e/api/email-templates.api.spec.ts -g "render"` | No - Wave 0 |
| INT-04 | email_template connector CRUD works | API e2e | `npx playwright test e2e/api/email-templates.api.spec.ts -g "connector"` | No - Wave 0 |
| INT-05 | Maquetador skill exists after seed | API e2e | `npx playwright test e2e/api/email-templates.api.spec.ts -g "skill"` | No - Wave 0 |
| INT-06 | execute-catpaw loads email_template tools | Integration | Manual: create CatPaw with connector, verify tools appear | Manual-only (requires LLM call) |
| INT-07 | Canvas sends email with template | E2E smoke | Manual: run canvas with catpaw->template->gmail nodes | Manual-only (requires LLM + Gmail) |

### Sampling Rate
- **Per task commit:** `cd app && npx playwright test e2e/api/email-templates.api.spec.ts --reporter=list`
- **Per wave merge:** `cd app && npx playwright test --reporter=list`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/e2e/api/email-templates.api.spec.ts` -- covers INT-01 through INT-05
- [ ] Existing `app/e2e/helpers/test-data.ts` should be reusable (TEST_PREFIX pattern)

## Sources

### Primary (HIGH confidence)
- `app/src/lib/services/catpaw-gmail-tools.ts` -- Gmail tool pattern (exact model to follow)
- `app/src/lib/services/catpaw-gmail-executor.ts` -- Gmail executor pattern
- `app/src/lib/services/catpaw-drive-tools.ts` -- Drive tool pattern (confirms multi-connector dispatch)
- `app/src/lib/services/execute-catpaw.ts` -- Tool-calling loop integration (lines 113-545)
- `app/src/lib/services/template-renderer.ts` -- renderTemplate() function (lines 114-149)
- `app/src/lib/services/canvas-executor.ts` -- Canvas connector node execution (lines 517-665)
- `app/src/app/api/email-templates/[id]/render/route.ts` -- Existing render API
- `app/src/app/api/email-templates/route.ts` -- Existing list/create API
- `app/src/lib/types.ts` -- Connector type unions (line 213)
- `app/src/lib/db.ts` -- Skill seeds (line 4293), connector seeds (line 1313), template seed (line 4438)
- `app/src/app/api/connectors/route.ts` -- VALID_TYPES array (line 8)

### Secondary (MEDIUM confidence)
- `app/src/lib/services/catbrain-connector-executor.ts` -- Legacy connector executor (may need type update)
- `app/src/lib/services/catbot-tools.ts` -- CatBot create_connector tool enum (line 110)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components already exist in the codebase
- Architecture: HIGH - Direct code inspection of 4 analogous connector implementations
- Pitfalls: HIGH - Based on actual code paths and real dispatch logic
- Code examples: HIGH - Derived from existing Gmail/Drive tool patterns in the same codebase

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable internal patterns)
