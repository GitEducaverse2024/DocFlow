# Phase 106: Seeds + Documentacion + i18n - Research

**Researched:** 2026-04-01
**Domain:** Email template seeds, i18n, documentation
**Confidence:** HIGH

## Summary

This phase creates 4 email template seeds in `db.ts`, updates documentation files, ensures i18n keys are complete, and verifies clean builds. The template system is already fully implemented (types, renderer, editor UI, API, connector, skill). The only missing pieces are the actual seed templates beyond the basic one.

The TemplateStructure JSON format is well-defined with 3 sections (header/body/footer), each containing rows with columns that hold blocks (logo, image, video, text, instruction). The renderer applies inline CSS for email compatibility. Template categories already exist in i18n: `general`, `corporate`, `commercial`, `report`, `notification`.

**Primary recommendation:** Insert 4 new seed templates in `db.ts` following the exact pattern of `seed-template-basic`, using the established categories that the Maquetador skill already references.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEED-01 | Template "Corporativa Educa360" -- logo + banner header + instruction body + footer with signature and small logo | TemplateStructure supports logo blocks in header, instruction blocks in body, text+logo in footer. Category: `corporate` |
| SEED-02 | Template "Informe de Leads" -- violet header + instruction data table + DoCatFlow footer | Header renders with primaryColor background. instruction block for table data. Category: `report` |
| SEED-03 | Template "Respuesta Comercial" -- subtle logo + personalized body instruction + CTA meeting + footer | Multi-row body with instruction + text CTA block. Category: `commercial` |
| SEED-04 | Template "Notificacion Interna" -- minimalist, only instruction + basic footer | Empty header, single instruction body, simple text footer. Category: `notification` |
| TECH-01 | npm run build + Docker build pass without errors | Build: `cd app && npm run build`. Verify no TypeScript errors from seed changes |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.6.2 | SQLite database for template storage | Already used for all DB operations |
| next-intl | (existing) | i18n for es/en messages | Already integrated throughout the app |

### Supporting
No additional libraries needed. All template infrastructure already exists.

## Architecture Patterns

### TemplateStructure JSON Format (CRITICAL)

The exact TypeScript types that seed JSON must conform to:

```typescript
// Source: app/src/lib/types.ts lines 348-361
interface TemplateStructure {
  sections: {
    header: TemplateSection;  // { rows: TemplateRow[] }
    body: TemplateSection;
    footer: TemplateSection;
  };
  styles: {
    backgroundColor: string;  // e.g. '#ffffff'
    fontFamily: string;       // e.g. 'Arial, sans-serif'
    primaryColor: string;     // e.g. '#7C3AED' — used as header background
    textColor: string;        // e.g. '#333333'
    maxWidth: number;         // e.g. 600
  };
}

interface TemplateRow {
  id: string;           // unique within template, e.g. 'r1'
  columns: TemplateColumn[];
}

interface TemplateColumn {
  id: string;           // unique within template, e.g. 'c1'
  width: string;        // e.g. '100%', '50%'
  block: TemplateBlock;
}

interface TemplateBlock {
  type: 'logo' | 'image' | 'video' | 'text' | 'instruction';
  src?: string;         // for logo/image — URL
  alt?: string;         // for logo/image — alt text
  width?: number | string; // for logo/image — px or 'full'
  align?: 'left' | 'center' | 'right' | 'full';
  url?: string;         // for video — YouTube URL
  thumbnailUrl?: string; // for video
  content?: string;     // for text — markdown content
  text?: string;        // for instruction — the KEY that maps to variables
}
```

### Renderer Behavior (CRITICAL for designing seeds)

From `template-renderer.ts`:

1. **Header section** renders with `background-color: primaryColor` and `padding: 16px 24px`
2. **Body section** renders with `padding: 24px`
3. **Footer section** renders with `padding: 16px 24px`, `border-top: 1px solid #e4e4e7`, `background-color: #fafafa`
4. **instruction blocks**: When variables are provided, they render as normal text. When empty (preview), they show a gray dashed-border placeholder
5. **text blocks**: Support markdown (**bold**, *italic*, [links](url), - lists, \n for line breaks)
6. **logo/image blocks**: `align` maps to td align attribute. `width='full'` makes image 100% width
7. **Multi-column rows**: Rendered as nested table with equal width columns by default

### Existing Seed Template Pattern

```typescript
// Source: app/src/lib/db.ts lines 4438-4461
// Pattern: check count, INSERT if empty, try/catch
try {
  const tplCount = (db.prepare('SELECT COUNT(*) as c FROM email_templates').get() as { c: number }).c;
  if (tplCount === 0) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO email_templates (id, name, description, category, structure, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      'seed-template-basic',       // id — fixed string with 'seed-' prefix
      'Plantilla Basica',          // name
      'Description text...',       // description
      'general',                   // category
      JSON.stringify({...}),       // structure — TemplateStructure JSON
      now, now                     // created_at, updated_at
    );
  }
} catch (e) { logger.error('system', 'Template seed error', { error: (e as Error).message }); }
```

**IMPORTANT:** The current seed uses `tplCount === 0` guard, meaning it only seeds when the table is empty. For adding 4 new seeds, use `INSERT OR IGNORE` with fixed IDs (like canvas template seeds do) so they are idempotent even if the basic seed already exists.

### Template Categories (already defined in i18n)

| Category Value | ES Label | EN Label | Use For |
|---------------|----------|----------|---------|
| `general` | General | General | Basic/simple templates |
| `corporate` | Corporativa | Corporate | Brand identity templates (SEED-01) |
| `commercial` | Comercial | Commercial | Sales/response templates (SEED-03) |
| `report` | Informe | Report | Data/leads reports (SEED-02) |
| `notification` | Notificacion | Notification | Internal alerts (SEED-04) |

### Maquetador Skill Category Mapping

The Maquetador de Email skill (already seeded) instructs the LLM to select templates by category:
- Email comercial/ventas -> `comercial` (maps to `commercial`)
- Informes/resumenes -> `informe` (maps to `report`)
- Notificaciones/alertas -> `notificacion` (maps to `notification`)
- Comunicacion general -> `general` o `corporativa` (maps to `general`/`corporate`)

**NOTE:** The skill references Spanish category names but the DB stores the English key values. This mismatch needs checking. Looking at the tools file, the filter description says: `"comercial", "informe", "notificacion", "general"` but the i18n uses `corporate`, `commercial`, `report`, `notification`. The DB `category` column stores whatever string is passed. The existing seed uses `'general'`. The categories in i18n metadata use English keys. **Use the English keys** (`corporate`, `commercial`, `report`, `notification`) as category values in the DB — these match the i18n keys.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Template rendering | Custom HTML generation | `renderTemplate()` from template-renderer.ts | Handles all block types, inline CSS, email-safe HTML |
| Idempotent seeding | Manual existence checks | `INSERT OR IGNORE` with fixed IDs | Pattern already used for canvas templates |
| Category values | New category strings | Existing categories from i18n metadata | Already defined and translated |

## Common Pitfalls

### Pitfall 1: Invalid TemplateStructure JSON
**What goes wrong:** Seed JSON doesn't match TemplateStructure type, causing runtime errors when rendering
**Why it happens:** Missing required fields (sections must have header/body/footer, styles must have all 5 fields)
**How to avoid:** Always include all 3 sections (even if rows is empty `[]`) and all 5 style properties
**Warning signs:** Template renders as blank or throws in preview

### Pitfall 2: Instruction text key mismatch
**What goes wrong:** The `text` field in instruction blocks is used as the variable KEY for rendering. If the Maquetador skill generates variables with different keys, rendering shows placeholders
**Why it happens:** instruction block.text must be a clear, descriptive key that the LLM will use
**How to avoid:** Use descriptive Spanish keys like "Contenido principal del email", "Tabla de datos de leads", etc.

### Pitfall 3: Seed guard blocks new seeds
**What goes wrong:** Current seed uses `tplCount === 0` — if basic seed already exists, new seeds never get inserted
**How to avoid:** Use `INSERT OR IGNORE` per template with fixed IDs, independent of count check. Or add new seeds after the existing block with their own individual existence checks.

### Pitfall 4: Logo/image src URLs in seeds
**What goes wrong:** Seeds reference external URLs for logos that may become unavailable
**How to avoid:** Use placeholder URLs or data URIs. Since these are seeds for a specific deployment (Educa360), use stable URLs or leave logo blocks with empty src (they render as empty)

### Pitfall 5: Missing row/column IDs
**What goes wrong:** Each TemplateRow needs unique `id` and each TemplateColumn needs unique `id`
**Why it happens:** IDs are required by the drag-and-drop editor
**How to avoid:** Use sequential IDs per template: `r1`, `r2`, ... and `c1`, `c2`, ...

## Code Examples

### SEED-01: Corporativa Educa360 (category: corporate)

```typescript
// Structure for: logo + banner header + instruction body + footer with signature and small logo
const seed01: TemplateStructure = {
  sections: {
    header: {
      rows: [
        { id: 'r1', columns: [{ id: 'c1', width: '100%', block: { type: 'logo', src: '', alt: 'Educa360', width: 180, align: 'center' } }] },
        { id: 'r2', columns: [{ id: 'c2', width: '100%', block: { type: 'image', src: '', alt: 'Banner', width: 'full', align: 'full' } }] }
      ]
    },
    body: {
      rows: [
        { id: 'r3', columns: [{ id: 'c3', width: '100%', block: { type: 'instruction', text: 'Contenido principal del email corporativo' } }] }
      ]
    },
    footer: {
      rows: [
        { id: 'r4', columns: [
          { id: 'c4', width: '70%', block: { type: 'text', content: '**Equipo Educa360**\ninfo@educa360.com\nwww.educa360.com' } },
          { id: 'c5', width: '30%', block: { type: 'logo', src: '', alt: 'Educa360', width: 60, align: 'right' } }
        ] }
      ]
    }
  },
  styles: { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', primaryColor: '#2563EB', textColor: '#333333', maxWidth: 600 }
};
```

### SEED-02: Informe de Leads (category: report)

```typescript
const seed02: TemplateStructure = {
  sections: {
    header: {
      rows: [
        { id: 'r1', columns: [{ id: 'c1', width: '100%', block: { type: 'text', content: '**Informe de Leads**', align: 'center' } }] }
      ]
    },
    body: {
      rows: [
        { id: 'r2', columns: [{ id: 'c2', width: '100%', block: { type: 'instruction', text: 'Tabla de datos de leads e informe ejecutivo' } }] }
      ]
    },
    footer: {
      rows: [
        { id: 'r3', columns: [{ id: 'c3', width: '100%', block: { type: 'text', content: 'Generado por **DoCatFlow** | Informe automatico' } }] }
      ]
    }
  },
  styles: { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', primaryColor: '#7C3AED', textColor: '#333333', maxWidth: 600 }
};
```

### SEED-03: Respuesta Comercial (category: commercial)

```typescript
const seed03: TemplateStructure = {
  sections: {
    header: {
      rows: [
        { id: 'r1', columns: [{ id: 'c1', width: '100%', block: { type: 'logo', src: '', alt: 'Logo', width: 120, align: 'left' } }] }
      ]
    },
    body: {
      rows: [
        { id: 'r2', columns: [{ id: 'c2', width: '100%', block: { type: 'instruction', text: 'Cuerpo personalizado de respuesta comercial' } }] },
        { id: 'r3', columns: [{ id: 'c3', width: '100%', block: { type: 'text', content: '**Reserva una reunion con nosotros:**\n[Agendar reunion](https://calendly.com)' } }] }
      ]
    },
    footer: {
      rows: [
        { id: 'r4', columns: [{ id: 'c4', width: '100%', block: { type: 'text', content: 'Un saludo,\n**Equipo Comercial**' } }] }
      ]
    }
  },
  styles: { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', primaryColor: '#059669', textColor: '#333333', maxWidth: 600 }
};
```

### SEED-04: Notificacion Interna (category: notification)

```typescript
const seed04: TemplateStructure = {
  sections: {
    header: { rows: [] },
    body: {
      rows: [
        { id: 'r1', columns: [{ id: 'c1', width: '100%', block: { type: 'instruction', text: 'Contenido de la notificacion interna' } }] }
      ]
    },
    footer: {
      rows: [
        { id: 'r2', columns: [{ id: 'c2', width: '100%', block: { type: 'text', content: '---\n*Notificacion automatica de DoCatFlow*' } }] }
      ]
    }
  },
  styles: { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', primaryColor: '#6B7280', textColor: '#333333', maxWidth: 600 }
};
```

### Seed Insertion Pattern (idempotent)

```typescript
// Use INSERT OR IGNORE per template for idempotency
const seedTemplates = [
  { id: 'seed-tpl-corporativa', name: '...', category: 'corporate', ... },
  { id: 'seed-tpl-informe-leads', name: '...', category: 'report', ... },
  { id: 'seed-tpl-respuesta-comercial', name: '...', category: 'commercial', ... },
  { id: 'seed-tpl-notificacion', name: '...', category: 'notification', ... },
];

const insertStmt = db.prepare(
  `INSERT OR IGNORE INTO email_templates (id, name, description, category, structure, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
);

const now = new Date().toISOString();
for (const tpl of seedTemplates) {
  insertStmt.run(tpl.id, tpl.name, tpl.description, tpl.category, JSON.stringify(tpl.structure), now, now);
}
```

## i18n Status

### Existing Keys (already complete)
The `catpower.templates` section in both `es.json` and `en.json` is already comprehensive with:
- UI labels (title, list, new, edit, save, back, empty states)
- Section names (header, body, footer)
- Block types (logo, image, video, text, instruction)
- Config labels (alignment, width, alt text, etc.)
- Preview controls
- Style labels
- Metadata (name, description, category)
- **Category values already translated:** general, corporate, commercial, report, notification

### Potential New Keys Needed
- Template seed names and descriptions are stored in DB, NOT in i18n (like skill seeds). No new i18n keys needed for the seeds themselves.
- If any new UI labels are needed for the template list page (e.g., filtering by category in the UI), those already exist under `catpower.templates.metadata.categories`.

### i18n Verification Checklist
- [ ] `catpower.templates.metadata.categories` has all 5 categories (general, corporate, commercial, report, notification) -- ALREADY EXISTS
- [ ] Both `es.json` and `en.json` have matching keys -- ALREADY MATCHING
- [ ] No missing translation keys that would cause build errors

## Documentation Updates Needed

### 1. GUIA_USUARIO.md
**Current state:** No mention of Email Templates module.
**Action:** Add a new subsection under "Modulos Principales" (after section 5 Conectores or as part of CatPower):
- Describe the Email Templates editor
- List template categories (corporativa, informe, comercial, notificacion, general)
- Explain instruction blocks (AI fills them at send time)
- Mention the Maquetador de Email skill
- List the 5 seed templates (basic + 4 new)

### 2. CONNECTORS.md
**Current state:** Lists 9 connectors. email_template connector NOT documented.
**Action:** Add entry #10 for "Plantillas Email Corporativas" connector:
- Type: email_template
- ID: seed-email-template
- Tools: list_email_templates, get_email_template, render_email_template
- Description of each tool's purpose

### 3. canvas-nodes.md
**Current state:** No specific mention of email_template connector in node documentation.
**Action:** No changes needed -- the email_template connector is used through Agent nodes with the Maquetador skill, which is already covered by the Agent node documentation. The connector node documentation already covers all connector types generically.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + Playwright |
| Config file | app/vitest.config.* (if exists) |
| Quick run command | `cd /home/deskmath/docflow/app && npm run test:unit` |
| Full suite command | `cd /home/deskmath/docflow/app && npm run build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEED-01 | Corporativa template seed valid JSON | manual-only | Verify via build success | N/A |
| SEED-02 | Informe template seed valid JSON | manual-only | Verify via build success | N/A |
| SEED-03 | Comercial template seed valid JSON | manual-only | Verify via build success | N/A |
| SEED-04 | Notificacion template seed valid JSON | manual-only | Verify via build success | N/A |
| TECH-01 | Build passes | smoke | `cd /home/deskmath/docflow/app && npm run build` | N/A |

### Sampling Rate
- **Per task commit:** `cd /home/deskmath/docflow/app && npx tsc --noEmit`
- **Per wave merge:** `cd /home/deskmath/docflow/app && npm run build`
- **Phase gate:** Full build green

### Wave 0 Gaps
None -- seed templates are data-only changes in db.ts. Build verification is the primary validation. No new test infrastructure needed.

## Open Questions

1. **Logo URLs for Educa360 seeds**
   - What we know: Seeds can include logo `src` URLs but Educa360 logos may not have stable public URLs
   - What's unclear: Whether to use actual Educa360 logo URLs or leave empty for user to configure
   - Recommendation: Leave `src: ''` (empty) for logo blocks. Users will upload their own logos via the template editor. The renderer safely handles empty src (renders nothing).

2. **Maquetador skill category name mismatch**
   - What we know: The skill instructions reference Spanish category names ("comercial", "informe") but the tool description also uses Spanish. The i18n metadata keys are English.
   - What's unclear: Whether the DB should store Spanish or English category values
   - Recommendation: Use English values (`corporate`, `commercial`, `report`, `notification`) to match the i18n metadata keys. The Maquetador skill prompt may need a minor tweak to match, but this is low priority since the LLM will adapt.

## Sources

### Primary (HIGH confidence)
- `app/src/lib/types.ts` lines 306-361 -- TemplateStructure, TemplateBlock, TemplateSection types
- `app/src/lib/services/template-renderer.ts` -- Full renderer logic, section styling
- `app/src/lib/db.ts` lines 4407-4526 -- Existing seed template, connector, and skill
- `app/messages/es.json` lines 895-993 -- catpower.templates i18n keys (ES)
- `app/messages/en.json` lines 895-993 -- catpower.templates i18n keys (EN)

### Secondary (MEDIUM confidence)
- `app/src/lib/services/catpaw-email-template-tools.ts` -- Tool definitions showing category filter
- `app/src/lib/services/catpaw-email-template-executor.ts` -- Executor SQL queries

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All infrastructure already exists, only data insertion needed
- Architecture: HIGH - Types and renderer are clearly defined in source code
- Pitfalls: HIGH - Identified from direct code analysis of renderer and seed patterns

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable -- template system unlikely to change)
