# Migration log — Plan 151-01 (static .md migration)

**Plan:** 151-01
**Fecha:** 2026-04-20
**Alcance:** Migrar catálogos y reglas de `.planning/knowledge/*.md` al KB estructurado `.docflow-kb/`.

> NOTA: Este log vive FUERA de `.docflow-kb/` a propósito. `scripts/validate-kb.cjs`
> recorre todos los `.md` bajo `.docflow-kb/` (incluidos dotfiles) y exige
> frontmatter válido. Los logs de proceso viven en el directorio de la fase para
> no contaminar el KB (invariante KB-14).

## Files migrated (source → destination)

| Source | Destination(s) | Rule/incident count |
|--------|----------------|---------------------|
| `.planning/knowledge/canvas-nodes-catalog.md` | `domain/concepts/canvas-node.md`, `domain/taxonomies/node-roles.md`, `domain/taxonomies/canvas-modes.md`, `rules/R01..R25` (25) | 25 rules + 3 taxonomy/concept atoms |
| `.planning/knowledge/incidents-log.md` | `incidents/INC-01..INC-10` (10) | 10 incidents |
| `.planning/knowledge/proceso-catflow-revision-inbound.md` | `protocols/catflow-inbound-review.md` | 1 protocol |
| `.planning/knowledge/connector-logs-redaction-policy.md` | `protocols/connector-logs-redaction.md` | 1 protocol |
| `.planning/knowledge/holded-mcp-api.md` | `domain/architecture/holded-mcp-api.md` | 1 architecture doc |
| `.planning/knowledge/mejoras-sistema-modelos.md` | (legacy redirect only — v25.1 post-mortem, out of scope for KB; Phase 155 will move to `.docflow-legacy/`) | 0 (redirect only) |

**Total nuevos átomos:** 40 archivos `.md` bajo `.docflow-kb/` (25 rules + 10 incidents + 2 protocols + 1 concept + 2 taxonomies + 1 architecture + 1 inbound protocol = 40 migrados vs. 6 fuentes).

## Redirect stub used in originals

Every original gets this inserted at the TOP of the file (ABOVE existing content):

    > **⚠️ MOVED to `.docflow-kb/<new path>`** during Phase 151 (2026-04-20).
    > The content below is preserved for reference only — new edits MUST happen in the KB, not here.
    > Eliminación física de este archivo: Phase 155 (cleanup final).

Para `mejoras-sistema-modelos.md` (legacy, no migrado) el stub es diferente:

    > **📦 LEGACY — NO migrated to KB.** Este archivo es el post-mortem del milestone v25.1 (cerrado).
    > Será movido a `.docflow-legacy/milestone-retrospectives/` en Phase 155 (cleanup final).
    > NO editar. NO consumir desde CatBot. Consultar sólo como referencia histórica.

## Taxonomy extension

`.docflow-kb/_schema/tag-taxonomy.json` ampliado de 6 a 32 rule codes:

    R01..R25, SE01..SE03, DA01..DA04

Motivo: `validate-kb.cjs` rechaza cualquier tag no listado en la taxonomy. Los
files de la Task 2 usan los tags R03..R25 que antes no existían.
