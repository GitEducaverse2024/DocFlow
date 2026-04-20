import fs from 'node:fs';
import path from 'node:path';

/**
 * Creates a 7-entry fixture Knowledge Base under `<tmpDir>/.docflow-kb/` suitable
 * for unit tests of `kb-index-cache.ts` and for integration tests of KB-related
 * tools (Plans 152-02 and 152-03 will import this helper).
 *
 * Layout:
 *   .docflow-kb/
 *     _header.md
 *     _index.json
 *     resources/
 *       catpaws/aaa11111-test-catpaw.md         → cat_paws:aaa11111-1111-1111-1111-111111111111
 *       connectors/bbb22222-test-connector.md   → connectors:bbb22222-2222-2222-2222-222222222222
 *       skills/test-skill-writer.md             → skills:writer-skill
 *       catbrains/ccc33333-test-catbrain.md     → catbrains:ccc33333-3333-3333-3333-333333333333
 *       email-templates/tpl-test-welcome.md     → email_templates:tpl-welcome
 *       canvases/ddd44444-test-canvas.md        → canvases:ddd44444-4444-4444-4444-444444444444
 *     rules/
 *       R10-preserve-fields.md                  (no source_of_truth — rules are hand-authored)
 *
 * Each resource file contains valid YAML frontmatter with `source_of_truth`
 * so that `resolveKbEntry(table, id)` can map DB rows to KB paths.
 */
export function createFixtureKb(tmpDir: string): { kbRoot: string } {
  const kbRoot = path.join(tmpDir, '.docflow-kb');
  const dirs = [
    'resources/catpaws',
    'resources/connectors',
    'resources/skills',
    'resources/catbrains',
    'resources/email-templates',
    'resources/canvases',
    'rules',
  ];
  for (const d of dirs) {
    fs.mkdirSync(path.join(kbRoot, d), { recursive: true });
  }

  fs.writeFileSync(
    path.join(kbRoot, '_header.md'),
    `# KB Header (test fixture)\n**Entradas totales:** 7\n\n## Resource counts\n- CatPaws activos: 1\n- Connectors activos: 1\n- Skills activos: 1\n- CatBrains activos: 1\n- Email templates activos: 1\n- Canvases activos: 1\n\n## Rules: 1\n`,
  );

  const index = {
    schema_version: '2.0',
    generated_at: '2026-04-20T00:00:00Z',
    entry_count: 7,
    entries: [
      {
        id: 'aaa11111-test-catpaw',
        path: 'resources/catpaws/aaa11111-test-catpaw.md',
        type: 'resource',
        subtype: 'catpaw',
        title: 'Test CatPaw',
        summary: 'Holded agent for tests',
        tags: ['catpaw', 'business'],
        audience: ['catbot', 'architect'],
        status: 'active',
        updated: '2026-04-20T00:00:00Z',
        search_hints: null,
      },
      {
        id: 'bbb22222-test-connector',
        path: 'resources/connectors/bbb22222-test-connector.md',
        type: 'resource',
        subtype: 'connector',
        title: 'Gmail Test',
        summary: 'Test gmail connector',
        tags: ['connector', 'gmail'],
        audience: ['catbot'],
        status: 'active',
        updated: '2026-04-19T00:00:00Z',
        search_hints: null,
      },
      {
        id: 'test-skill-writer',
        path: 'resources/skills/test-skill-writer.md',
        type: 'resource',
        subtype: 'skill',
        title: 'Test Writer Skill',
        summary: 'Writer skill for business content',
        tags: ['skill'],
        audience: ['catbot'],
        status: 'active',
        updated: '2026-04-18T00:00:00Z',
        search_hints: null,
      },
      {
        id: 'ccc33333-test-catbrain',
        path: 'resources/catbrains/ccc33333-test-catbrain.md',
        type: 'resource',
        subtype: 'catbrain',
        title: 'Test CatBrain',
        summary: 'RAG catbrain for tests',
        tags: ['catbrain'],
        audience: ['catbot'],
        status: 'active',
        updated: '2026-04-17T00:00:00Z',
        search_hints: null,
      },
      {
        id: 'tpl-test-welcome',
        path: 'resources/email-templates/tpl-test-welcome.md',
        type: 'resource',
        subtype: 'email-template',
        title: 'Welcome Template',
        summary: 'Welcome email template',
        tags: ['template', 'email'],
        audience: ['catbot'],
        status: 'active',
        updated: '2026-04-16T00:00:00Z',
        search_hints: null,
      },
      {
        id: 'ddd44444-test-canvas',
        path: 'resources/canvases/ddd44444-test-canvas.md',
        type: 'resource',
        subtype: 'canvas',
        title: 'Test Canvas',
        summary: 'Inbound canvas for tests',
        tags: ['canvas'],
        audience: ['catbot'],
        status: 'active',
        updated: '2026-04-15T00:00:00Z',
        search_hints: null,
      },
      {
        id: 'R10-preserve-fields',
        path: 'rules/R10-preserve-fields.md',
        type: 'rule',
        subtype: null,
        title: 'R10 Preserve Fields',
        summary: 'Always preserve JSON input fields',
        tags: ['rule', 'safety'],
        audience: ['catbot', 'architect'],
        status: 'active',
        updated: '2026-04-14T00:00:00Z',
        search_hints: null,
      },
    ],
    indexes: { by_type: {}, by_tag: {}, by_audience: {} },
  };
  fs.writeFileSync(
    path.join(kbRoot, '_index.json'),
    JSON.stringify(index, null, 2),
  );

  writeResource({
    kbRoot,
    relPath: 'resources/catpaws/aaa11111-test-catpaw.md',
    id: 'aaa11111-test-catpaw',
    subtype: 'catpaw',
    dbTable: 'cat_paws',
    dbId: 'aaa11111-1111-1111-1111-111111111111',
    tags: ['catpaw', 'business'],
    audience: ['catbot', 'architect'],
    status: 'active',
    title: 'Test CatPaw',
    summary: 'Holded agent for tests',
    related: [{ type: 'resource', id: 'bbb22222-test-connector' }],
  });
  writeResource({
    kbRoot,
    relPath: 'resources/connectors/bbb22222-test-connector.md',
    id: 'bbb22222-test-connector',
    subtype: 'connector',
    dbTable: 'connectors',
    dbId: 'bbb22222-2222-2222-2222-222222222222',
    tags: ['connector', 'gmail'],
    audience: ['catbot'],
    status: 'active',
    title: 'Gmail Test',
    summary: 'Test gmail connector',
  });
  writeResource({
    kbRoot,
    relPath: 'resources/skills/test-skill-writer.md',
    id: 'test-skill-writer',
    subtype: 'skill',
    dbTable: 'skills',
    dbId: 'writer-skill',
    tags: ['skill'],
    audience: ['catbot'],
    status: 'active',
    title: 'Test Writer Skill',
    summary: 'Writer skill for business content',
  });
  writeResource({
    kbRoot,
    relPath: 'resources/catbrains/ccc33333-test-catbrain.md',
    id: 'ccc33333-test-catbrain',
    subtype: 'catbrain',
    dbTable: 'catbrains',
    dbId: 'ccc33333-3333-3333-3333-333333333333',
    tags: ['catbrain'],
    audience: ['catbot'],
    status: 'active',
    title: 'Test CatBrain',
    summary: 'RAG catbrain for tests',
  });
  writeResource({
    kbRoot,
    relPath: 'resources/email-templates/tpl-test-welcome.md',
    id: 'tpl-test-welcome',
    subtype: 'email-template',
    dbTable: 'email_templates',
    dbId: 'tpl-welcome',
    tags: ['template', 'email'],
    audience: ['catbot'],
    status: 'active',
    title: 'Welcome Template',
    summary: 'Welcome email template',
  });
  writeResource({
    kbRoot,
    relPath: 'resources/canvases/ddd44444-test-canvas.md',
    id: 'ddd44444-test-canvas',
    subtype: 'canvas',
    dbTable: 'canvases',
    dbId: 'ddd44444-4444-4444-4444-444444444444',
    tags: ['canvas'],
    audience: ['catbot'],
    status: 'active',
    title: 'Test Canvas',
    summary: 'Inbound canvas for tests',
  });

  // Rule — no source_of_truth
  fs.writeFileSync(
    path.join(kbRoot, 'rules/R10-preserve-fields.md'),
    `---
id: R10-preserve-fields
type: rule
subtype: null
lang: es
title: R10 Preserve Fields
summary: Always preserve JSON input fields
tags: [rule, safety]
audience: [catbot, architect]
status: active
created_at: 2026-04-01T00:00:00Z
created_by: test
version: 1.0.0
updated_at: 2026-04-14T00:00:00Z
updated_by: test
ttl: never
---

## Descripción

Reglas de oro para preservar campos JSON entre nodos del canvas.
`,
  );

  return { kbRoot };
}

interface WriteResourceOpts {
  kbRoot: string;
  relPath: string;
  id: string;
  subtype: string;
  dbTable: string;
  dbId: string;
  tags: string[];
  audience: string[];
  status: string;
  title: string;
  summary: string;
  related?: Array<{ type: string; id: string }>;
}

function writeResource(opts: WriteResourceOpts): void {
  const relatedYaml = opts.related && opts.related.length > 0
    ? `related:\n${opts.related.map(r => `  - { type: ${r.type}, id: ${r.id} }`).join('\n')}\n`
    : '';
  const frontmatter = `---
id: ${opts.id}
type: resource
subtype: ${opts.subtype}
lang: es
title: ${opts.title}
summary: "${opts.summary}"
tags: [${opts.tags.join(', ')}]
audience: [${opts.audience.join(', ')}]
status: ${opts.status}
created_at: 2026-04-01T00:00:00Z
created_by: test
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: test
source_of_truth:
  - db: sqlite
    table: ${opts.dbTable}
    id: ${opts.dbId}
    fields_from_db: [name]
${relatedYaml}change_log:
  - { version: 1.0.0, date: 2026-04-01, author: test, change: fixture }
ttl: never
---

## Descripción

${opts.summary}
`;
  fs.writeFileSync(path.join(opts.kbRoot, opts.relPath), frontmatter);
}
