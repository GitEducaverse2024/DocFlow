# Phase 125: Knowledge Tree Hardening - Research

**Researched:** 2026-04-08
**Domain:** Knowledge tree JSON validation, test automation, zod schemas
**Confidence:** HIGH

## Summary

Phase 125 hardens the existing knowledge tree infrastructure (7 JSON files + _index.json in `app/data/knowledge/`) by adding timestamps, cross-validation tests, a template, and schema enforcement. The codebase already has a solid foundation: `knowledge-tree.ts` with zod schemas, `knowledge-tree.test.ts` with vitest tests, and all 7 area JSONs passing validation.

The primary gap is **tool coverage**: 23 tools in `catbot-tools.ts` TOOLS[] are missing from knowledge JSONs, and 2 tools in JSONs (`list_connectors`, `mcp_bridge`) do not exist in TOOLS[]. Sources paths currently all resolve correctly, but the test only checks file extension, not actual existence.

**Primary recommendation:** Add `updated_at` to schema + JSONs, write two new test files (tool sync + source existence), create `_template.json`, update `_index.json` with per-area `updated_at`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| KTREE-01 | Cada knowledge JSON tiene campo updated_at (ISO date) validado por zod como obligatorio | Schema modification in knowledge-tree.ts + update all 7 JSONs + _index.json |
| KTREE-02 | Test que verifica TOOLS[] <-> knowledge JSON tools[] bidireccional | New test file; current gap: 23 TS-only + 2 JSON-only tools identified |
| KTREE-03 | Test que verifica sources[] paths existen como archivos reales | New test or extend existing; current test only checks extension regex |
| KTREE-04 | _template.json con schema documentado e instrucciones | New file in data/knowledge/ |
| KTREE-05 | _index.json areas[].updated_at sincronizado con JSONs individuales | Extend KnowledgeIndexSchema + update _index.json |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | (already installed) | Schema validation for knowledge JSONs | Already used in knowledge-tree.ts |
| vitest | (already installed) | Test runner | Already configured in vitest.config.ts |
| fs/path | Node built-in | File existence checks | Standard Node.js |

### Supporting
No additional libraries needed. Everything required is already in the project.

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Current Knowledge Tree Structure
```
app/data/knowledge/
  _index.json          # Index with areas[] array
  catboard.json        # 7 area files
  catbrains.json
  catpaw.json
  catflow.json
  canvas.json
  catpower.json
  settings.json
```

### Current Schema (knowledge-tree.ts)
```
KnowledgeEntrySchema: id, name, path, description, endpoints[], tools[], concepts[], howto[], dont[], common_errors[], success_cases[], sources[]
KnowledgeIndexSchema: version, updated, areas[{id, file, name, description}]
```

### Pattern 1: Add updated_at to schemas
**What:** Extend both zod schemas with `updated_at` as required ISO date string
**When to use:** KTREE-01 + KTREE-05

KnowledgeEntrySchema gets `updated_at: z.string()` (ISO date format).
KnowledgeIndexSchema areas[] objects get `updated_at: z.string()`.

Both schemas use `.parse()` which will throw on missing fields, so adding required fields ensures tests catch missing timestamps.

### Pattern 2: Bidirectional tool sync test
**What:** Parse TOOLS array names from catbot-tools.ts, compare with tools[] from all JSONs
**When to use:** KTREE-02

The test should:
1. Import or parse all tool names from TOOLS[] in catbot-tools.ts
2. Collect all tools[] from all knowledge JSONs
3. Assert every TS tool appears in at least one JSON
4. Assert every JSON tool exists in TOOLS[]

Best approach: Import the TOOLS array directly if exported, or read the file and parse tool names via regex. Currently TOOLS is `const TOOLS` (not exported), so either export it or parse with regex.

**Recommendation:** Export TOOLS from catbot-tools.ts (simple one-word change) for cleaner test access.

### Pattern 3: Source existence test
**What:** Verify every path in sources[] resolves to an actual file
**When to use:** KTREE-03

Current test at line 141-151 only checks regex pattern (`\.(md|json|txt)$`), NOT actual file existence. The new test must use `fs.existsSync()` with proper path resolution (sources are relative to project root).

### Anti-Patterns to Avoid
- **Hardcoding tool lists in tests:** The test must dynamically read both sources (TOOLS[] and JSONs), not maintain a hardcoded expected list
- **Skipping _template.json from validation:** The template should NOT be included in schema validation tests since it has placeholder values

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date formatting | Custom date strings | `new Date().toISOString().split('T')[0]` | Consistent ISO format |
| File existence check | Custom glob walkers | `fs.existsSync()` | Simple, synchronous, sufficient |
| Tool name extraction | Complex AST parsing | Regex on catbot-tools.ts OR export TOOLS | Either approach works; export is cleaner |

## Common Pitfalls

### Pitfall 1: Cache invalidation after schema change
**What goes wrong:** knowledge-tree.ts has module-level caches (`indexCache`, `areaCache`). After adding `updated_at`, cached objects may not reflect new schema.
**How to avoid:** Caches are cold on test start (vitest runs fresh), so not an issue for tests. For runtime, cache is populated from disk which already has updated_at.

### Pitfall 2: _template.json breaking schema validation tests
**What goes wrong:** Existing test iterates all JSON files in knowledge dir and validates schema. Adding _template.json with placeholder values would fail validation.
**How to avoid:** Either (a) make _template.json pass schema validation with valid placeholder values, or (b) exclude _template.json from the validation test by name. Option (a) is preferred since it validates the template itself is valid.

### Pitfall 3: Ghost tools in knowledge JSONs
**What goes wrong:** `list_connectors` and `mcp_bridge` appear in catpower.json tools[] but don't exist in TOOLS[]. The bidirectional test (KTREE-02) will fail immediately.
**How to avoid:** Must fix the JSONs (remove phantom tools or add missing tool definitions) BEFORE or AS PART OF this phase. This is actual data cleanup, not a test issue.

### Pitfall 4: Tool coverage gap is large
**What goes wrong:** 23 tools in TOOLS[] are not in any JSON. Fixing all at once is tedious and error-prone.
**How to avoid:** Assign each missing tool to the correct knowledge area JSON systematically. Group by domain:
- canvas_*: canvas.json
- *_email_*: catpower.json  
- get_dashboard, get_system_status: catboard.json
- create_task, list_tasks: catflow.json
- query_knowledge, explain_feature, save_learned_entry: settings.json (or a new catbot.json)
- etc.

### Pitfall 5: Sources paths are relative to project root
**What goes wrong:** Sources like `.planning/PROJECT.md` are relative to project root, but tests run from `app/` directory (vitest cwd).
**How to avoid:** In the test, resolve paths relative to `process.cwd()` parent (since knowledge-tree.ts uses `process.cwd()` which is `app/`). Or resolve relative to the git root. Check what `process.cwd()` returns in vitest context.

## Code Examples

### Adding updated_at to KnowledgeEntrySchema
```typescript
// In knowledge-tree.ts
export const KnowledgeEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  description: z.string(),
  endpoints: z.array(z.string()),
  tools: z.array(z.string()),
  concepts: z.array(z.string()),
  howto: z.array(z.string()),
  dont: z.array(z.string()),
  common_errors: z.array(CommonErrorSchema),
  success_cases: z.array(z.string()),
  sources: z.array(z.string()),
  updated_at: z.string(),  // ISO date, e.g. "2026-04-08"
});
```

### Adding updated_at to KnowledgeIndexSchema areas
```typescript
export const KnowledgeIndexSchema = z.object({
  version: z.string(),
  updated: z.string(),
  areas: z.array(z.object({
    id: z.string(),
    file: z.string(),
    name: z.string(),
    description: z.string(),
    updated_at: z.string(),  // Synced from individual JSON
  })),
});
```

### Bidirectional tool sync test pattern
```typescript
// src/lib/__tests__/knowledge-tools-sync.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const KNOWLEDGE_DIR = path.join(process.cwd(), 'data', 'knowledge');

describe('Knowledge Tree <-> TOOLS sync', () => {
  it('every tool in TOOLS[] appears in at least one knowledge JSON', () => {
    // Read tool names from catbot-tools.ts
    const toolsFile = fs.readFileSync(
      path.join(process.cwd(), 'src', 'lib', 'services', 'catbot-tools.ts'), 'utf-8'
    );
    const tsTools = [...toolsFile.matchAll(/name: '([^']+)'/g)].map(m => m[1]);
    
    // Collect JSON tools
    const jsonTools = new Set<string>();
    const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f !== '_index.json' && f !== '_template.json');
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, file), 'utf-8'));
      (data.tools || []).forEach((t: string) => jsonTools.add(t));
    }
    
    const missing = tsTools.filter(t => !jsonTools.has(t));
    expect(missing, `Tools in TOOLS[] but not in any knowledge JSON: ${missing.join(', ')}`).toEqual([]);
  });

  it('every tool in knowledge JSONs exists in TOOLS[]', () => {
    // Similar reverse check
  });
});
```

### Source existence test pattern
```typescript
// In knowledge-tree.test.ts or new file
it('all sources[] paths exist as real files', () => {
  const areas = getAllKnowledgeAreas();
  const projectRoot = path.resolve(process.cwd(), '..');  // app/ -> docflow/
  
  for (const area of areas) {
    for (const source of area.sources) {
      const fullPath = path.join(projectRoot, source);
      expect(fs.existsSync(fullPath), 
        `${area.id}: source "${source}" does not exist at ${fullPath}`
      ).toBe(true);
    }
  }
});
```

### _template.json structure
```json
{
  "id": "AREA_ID",
  "name": "Area Name",
  "path": "/route-path",
  "description": "Description of this knowledge area",
  "endpoints": [],
  "tools": [],
  "concepts": [],
  "howto": [],
  "dont": [],
  "common_errors": [],
  "success_cases": [],
  "sources": [],
  "updated_at": "2026-04-08"
}
```

## Current State Analysis

### Tool Coverage Gap (critical for KTREE-02)

**23 tools in TOOLS[] missing from knowledge JSONs:**
| Tool | Should go in |
|------|-------------|
| canvas_delete_edge, canvas_generate_iterator_end | canvas.json |
| create_connector | catpower.json |
| create_email_template, delete_email_template, get_email_template, list_email_templates, render_email_template, update_email_template | catpower.json |
| create_task, list_tasks | catflow.json |
| explain_feature, query_knowledge, read_error_history, save_learned_entry | settings.json |
| get_cat_paw, update_cat_paw, link_connector_to_catpaw, link_skill_to_catpaw | catpaw.json |
| get_dashboard, get_system_status | catboard.json |
| get_summary, list_my_summaries | settings.json |

**2 tools in JSONs NOT in TOOLS[]:**
| Tool | In JSON | Action |
|------|---------|--------|
| list_connectors | catpower.json | Remove from JSON (does not exist in TS) |
| mcp_bridge | catpower.json | Remove from JSON (does not exist in TS) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (installed, configured) |
| Config file | app/vitest.config.ts |
| Quick run command | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts` |
| Full suite command | `cd app && npm run test:unit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KTREE-01 | updated_at in schema + JSONs | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "updated_at"` | Partial (schema test exists, updated_at assertion needed) |
| KTREE-02 | TOOLS[] <-> JSON tools[] sync | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tools-sync.test.ts` | No - Wave 0 |
| KTREE-03 | sources[] exist as real files | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "sources"` | Partial (regex check exists, fs check needed) |
| KTREE-04 | _template.json exists + valid | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "template"` | No - Wave 0 |
| KTREE-05 | _index.json areas[].updated_at | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "index"` | Partial (index test exists, updated_at assertion needed) |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts`
- **Per wave merge:** `cd app && npm run test:unit`
- **Phase gate:** Full suite green before /gsd:verify-work

### Wave 0 Gaps
- [ ] `src/lib/__tests__/knowledge-tools-sync.test.ts` -- new file for KTREE-02
- [ ] Update existing `knowledge-tree.test.ts` with updated_at assertions, source existence checks, template validation

## Open Questions

1. **_template.json and schema validation**
   - What we know: Existing tests iterate ALL .json files in knowledge dir for schema validation
   - What's unclear: Should _template.json pass full validation or be excluded?
   - Recommendation: Make it pass validation with valid placeholder values (easier, self-documenting)

2. **process.cwd() in vitest for source path resolution**
   - What we know: vitest runs from app/ dir, sources are relative to project root (docflow/)
   - What's unclear: Exact cwd during vitest run
   - Recommendation: Use `path.resolve(process.cwd(), '..')` or detect via git root; verify in first test run

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `app/src/lib/knowledge-tree.ts` (zod schemas, loader functions)
- Direct code inspection: `app/src/lib/__tests__/knowledge-tree.test.ts` (existing tests)
- Direct code inspection: `app/src/lib/services/catbot-tools.ts` (TOOLS array, 57 tools)
- Direct file inspection: `app/data/knowledge/*.json` (7 area files + index)

### Secondary (MEDIUM confidence)
- Tool gap analysis via automated script (23 missing from JSON, 2 phantom in JSON)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and in use
- Architecture: HIGH - existing patterns are clear and well-structured
- Pitfalls: HIGH - identified through direct code analysis
- Tool gap: HIGH - computed programmatically from actual source files

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable infrastructure, no external dependencies)
