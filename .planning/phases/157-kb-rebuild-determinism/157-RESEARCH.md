---
phase: 157-kb-rebuild-determinism
researched: 2026-04-20
domain: KB rebuild determinism + body-section rendering (kb-sync-db-source.cjs)
confidence: HIGH
requirements: [KB-46, KB-47]
---

# Phase 157 — KB Rebuild Determinism + Body Backfill — RESEARCH

**Researched:** 2026-04-20
**Domain:** Deterministic rebuild semantics for `scripts/kb-sync-db-source.cjs` + Markdown body rendering with linked relations (CommonJS script mirroring TS service `knowledge-sync.ts`).
**Confidence:** HIGH (all anchors verified by direct file read against current working tree; no secondary-source claims).

## Summary

La investigación confirma el diagnóstico de CONTEXT pero **corrige 3 imprecisiones críticas** que afectan directamente al plan:

1. **Ruta de `.docflow-legacy/`** es un **hermano** de `.docflow-kb/` (ambos bajo repo root), no un hijo. `path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans')` es lo correcto; la forma `path.join(kbRoot, '.docflow-legacy', ...)` de CONTEXT apuntaría a `.docflow-kb/.docflow-legacy/` que no existe.
2. **`loadCatPawRelations(db)`** retorna `Map<paw_id, Array<{id, subtype, name?, connector_type_raw?}>>` (array plano mixto) — **NO** `{connectors: [...], skills: [...]}`. El código existente (líneas 207-255) entrega los items como una lista única discriminada por `rel.subtype`; la extracción debe filtrar por subtype.
3. **Formato canónico de sección vinculada** (desde `knowledge-sync.ts:1021-1028`) es `- **<name>** (\`<id>\`)` donde `<id>` es la **UUID completa del connector/skill** (viene de `connectors.id` / `skills.id`), NO el slug. CONTEXT proponía `(seed-holded-mcp)` pero el formato real usa backticks + UUID. El placeholder vacío es `_(sin conectores vinculados)_` / `_(sin skills vinculadas)_`.

Con esas correcciones, la estrategia **Opción C** de CONTEXT (cargar `archivedIds` Set upfront + exclude en Pass 2) + extensión de `buildBody(subtype, row, relations)` es la correcta. Idempotencia se preserva reutilizando `stripVolatile` + `detectBumpLevel` existentes (líneas 1284-1365) sin modificarlos.

**Recomendación primaria:** implementar en 3 planes: (01) exclusion list + `--restore --from-legacy` CLI + cleanup de los 10 resucitados; (02) `buildBody` extension + byte-equivalent rendering con `renderLinkedSection`-CJS; (03) oracle CatBot 3 prompts + `_manual.md` §Rebuild Determinism + tests Nyquist wave-0.

## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Opción C — exclusion list** (CONTEXT §3): cargar `archivedIds: Set<string>` una vez tras `buildIdMap` y aplicar exclude O(1) en Pass 2. Fundamentos: alineación PRD §5.3 Lifecycle + testabilidad (Set mockeable) + performance O(n_archived) upfront vs O(n_rows × fs.existsSync).
2. **Comando nuevo `--restore --from-legacy <id>`** (CONTEXT §3): único vehículo opt-in para re-admitir un archivo archivado. Rebuild por sí solo NUNCA resucita.
3. **`buildBody` gana 3er parámetro `relations`** (CONTEXT §3 + ROADMAP §157 #3): opcional. Para `subtype === 'catpaw'`, renderiza secciones `## Conectores vinculados` + `## Skills vinculadas` byte-equivalentes a `renderLinkedSection`+`replaceOrAppendSection` de `knowledge-sync.ts`. Alternativa "re-llamar `syncResource('catpaw','update')` desde rebuild" descartada (side effects + logs + invalidateKbIndex N veces).
4. **Archivos no tocados** (CONTEXT §5): `app/src/lib/services/knowledge-sync.ts`, `app/src/app/api/canvas/*`, `catbot-sudo-tools.ts`, `catbot-tools.ts` link tools, Dashboard UI. Scope disciplina.
5. **Working tree cleanup inline en el plan** (CONTEXT §5 cell "Working tree cleanup"): los 10 archivos resucitados se eliminan con `git rm` + rebuild fixed (espera Δ=0 writes post-cleanup).

### Claude's Discretion

- **Nombre del campo en `report`** para contar archived-skips: RESEARCH recomienda `skipped_archived` (nuevo) en vez de reutilizar `skipped` (semántica actual: "missing id/name"). Mantiene observabilidad distinguible.
- **Función extraction de relations por subtype**: RESEARCH recomienda pequeño helper `splitRelationsBySubtype(relations: Array<...>) → {connectors, skills}` en el script, bien-aislado y unit-testable, en vez de reindexar dentro de `buildBody`.
- **Nombre del subcomando CLI**: `--restore --from-legacy <id>` (opción canónica). Alternativa descartada `--unarchive <id>` (semántica "archived" ≠ "archived en `_archived/YYYY-MM-DD`" del workflow 180d).
- **Lugar del test nuevo**: `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` (nuevo) siguiendo convención Phase 150 (`kb-sync-db-source.test.ts`). Fixture helper `createFixtureDb` del mismo fichero es reutilizable (export).
- **Formato de log archived-skip**: `WARN [archived-skip] ${sub}/${shortIdSlug}` (mirror semántico de `WARN orphan ${sub}/${f}` existente línea 1586).

### Deferred Ideas (OUT OF SCOPE)

- Cambios en `knowledge-sync.ts` (Phase 156-02 ya correcto).
- Añadir `archived-skip` lifecycle al schema de frontmatter (no hay archivo afectado: son los resucitados los que deben DESAPARECER, no ganar frontmatter nuevo).
- Rebuild que detecte conflicto legacy+resources y borre automáticamente el de resources (plan de cleanup lo hace manualmente; lógica de preferencia ya implícita en exclusion list).
- Mover `.docflow-legacy/` a `.docflow-kb/_legacy/` o similar (fuera de scope; convención Phase 155).
- `list_connectors` tool (KB-45 deferred a v29.2).
- Duplicate-mapping email-templates (KB-44 deferred a v29.2).
- Nyquist backfill de phases 149-156 (recommended by audit #2 pero fuera de scope 157).
- Full-text body search en `search_kb` (Phase 156 Decision "body full-text search NO es blocker").

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| **KB-46** | Rebuild determinism — `populateFromDb` carga `archivedIds: Set<string>` desde `.docflow-legacy/orphans/<subtype>/*.md`, aplica exclude en Pass 2 con log WARN; nuevo `--restore --from-legacy <id>` reverso; post-rebuild Δ=0 vs DB para 6 entidades | §"Code Inventory" línea 1499-1607 (populateFromDb), línea 1526 (buildIdMap) + §"Function Signature Proposals" §A, §C + §"Edge Cases" #1 (legacy+resources ambos) |
| **KB-47** | Body-section rendering — `buildBody(subtype, row, relations)` acepta 3er argumento opcional; para catpaws renderiza secciones `## Conectores vinculados` + `## Skills vinculadas` byte-equivalentes a `renderLinkedSection`; post-rebuild Operador Holded tiene ambas secciones | §"Code Inventory" línea 942-1017 (buildBody) + línea 207-255 (loadCatPawRelations) + §"Canonical Output Format (byte-equivalent)" |

## Standard Stack

### Core (ya presente, no instalar)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | ^12.6.2 | Sync SQLite driver | Ya usado en `kb-sync-db-source.cjs` via `_resolveBetterSqlite3` upward-walk (línea 54-86) |
| `vitest` | ^4.1.0 | Test runner | Ya configurado en `app/vitest.config.ts`, globs `src/**/*.test.ts` (convención Phase 149-01) |
| Node `fs` + `path` (core) | 20.x | Filesystem + path ops | Sin dependencias añadidas; todo el script es CJS bare-Node |

### Supporting (ya presente)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Inline YAML parser | — | Parse existing frontmatter for diff | Ya en `kb-sync-db-source.cjs:1028-…` (`parseYAML` copy-adapted de `scripts/kb-sync.cjs`). NO js-yaml — repo root sin `package.json`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `archivedIds` Set upfront | `fs.existsSync(legacyPath)` por-row en Pass 2 (CONTEXT §Opción A) | Upfront: O(1) lookup, testable (mock Set). Por-row: O(n_rows) FS calls, peor observabilidad, código disperso. Decisión: **Set upfront** (CONTEXT ya eligió). |
| Extender `writeResourceFile` con exclude-check | Exclude en `populateFromDb` Pass 2 antes de llamar writer | Extender writer: mezcla responsabilidades (writer debe ignorar semántica lifecycle). Exclude upstream: separation-of-concerns clara. Decisión: **exclude upstream**. |
| Duplicar `renderLinkedSection` en CJS | Import `knowledge-sync.ts` desde CJS via transpile | Imposible — script es vanilla Node, no hay build step. Duplicación aceptada (~8 líneas), convención establecida en Phase 156-02 Decision (knowledge-sync.ts mirror helpers). Decisión: **duplicar**. |
| Subcomando `--restore --from-legacy` | `--unarchive <id>` o `--revive <id>` | Semántica "archived" en KB ≠ workflow 180d `_archived/YYYY-MM-DD`. `from-legacy` es preciso (viene de `.docflow-legacy/orphans/`). Decisión: **`--restore --from-legacy <id>`**. |

**Installation:** Ninguna. Fase es pure-code + test extension sobre infra Phase 149-150 existente.

## Architecture Patterns

### Recommended Project Structure (sin cambios)

```
scripts/
├── kb-sync.cjs                    # CLI dispatcher (MODIFICAR: nuevo --restore)
└── kb-sync-db-source.cjs          # populateFromDb (MODIFICAR: archivedIds + buildBody)

app/src/lib/__tests__/
├── kb-sync-db-source.test.ts      # existente Phase 150 (fixture helper reusable)
└── kb-sync-rebuild-determinism.test.ts   # NUEVO Phase 157

.docflow-kb/
├── _manual.md                     # MODIFICAR: sub-sección "Rebuild Determinism"
└── resources/                     # CLEANUP: git rm 10 resucitados

.docflow-legacy/orphans/           # READ-ONLY para el script (nueva exclusion source)
├── catpaws/    (8 .md)
├── canvases/   (2 .md)
├── skills/     (1 .md)
├── connectors/ (2 .md)
├── email-templates/ (1 .md)
└── catbrains/  (1 .md)
```

### Pattern 1: Two-Pass Iteration with Exclusion Set (extends Phase 150 pattern)

**What:** Pass 1 enumera DB rows + construye `maps[subtype]`; Pass 1.5 (NUEVO) carga `archivedIds` desde legacy tree; Pass 2 itera rows y **skip** si `archivedIds.has(${sub}:${shortIdSlug})`. Orphan scan pass final sigue intacto pero ya no encontrará "resurrected" porque nunca se escribieron.

**When to use:** Cualquier operación DB→filesystem que deba honrar un estado externo "frozen" (archived, quarantined, blacklisted). Alineado con PRD §5.3 "archived es transición hacia purga, no hacia resurrección".

**Example:**
```javascript
// scripts/kb-sync-db-source.cjs — after line 1526 (buildIdMap)
// Source: new code; Context: .planning/ANALYSIS-knowledge-base-architecture.md §5.3
const archivedIds = loadArchivedIds(kbRoot);    // new helper
// ... Pass 2 loop (line 1534+):
for (const row of rows[sub]) {
  if (!row.id || !row.name) { report.skipped++; continue; }
  const shortIdSlug = maps[sub].get(row.id);
  if (archivedIds.has(`${sub}:${shortIdSlug}`)) {
    report.skipped_archived++;                  // NEW field
    if (verbose) console.warn(`WARN [archived-skip] ${sub}/${shortIdSlug}`);
    continue;
  }
  // ... existing buildFrontmatter + buildBody + writeResourceFile
}
```

### Pattern 2: Byte-Equivalent Duplication (CJS mirror of TS helper)

**What:** `renderLinkedSection` vive en TS (`knowledge-sync.ts:1021`); duplicarlo en CJS dentro del script respetando carácter-por-carácter (newlines, backticks, placeholder). Convención establecida en Phase 156-02 Decision: "Plan 156-02 mirror helpers en TS — Phase 157 extiende con mirror equivalente en CJS".

**When to use:** Cualquier función pura de formatting que deba producir output idéntico entre 2 call sites de lenguajes distintos (rebuild CJS + sync service TS).

**Example:**
```javascript
// scripts/kb-sync-db-source.cjs — new helper, CJS mirror of knowledge-sync.ts:1021-1028
// Source: app/src/lib/services/knowledge-sync.ts:1021-1028 (verified byte-equivalent)
function renderLinkedSectionCjs(items, emptyLabel) {
  if (items.length === 0) return `_(${emptyLabel})_`;
  return items.map((i) => `- **${i.name}** (\`${i.id}\`)`).join('\n');
}
```

### Pattern 3: Subtype Discrimination on Flat Relations Array

**What:** `loadCatPawRelations(db)` retorna `Map<pawId, Array<{id, subtype, name?, ...}>>` (una lista plana). Para pasar a `buildBody`, dividir por subtype.

**Example:**
```javascript
// scripts/kb-sync-db-source.cjs — new tiny helper
// Source: anchor en loadCatPawRelations() return shape línea 207-255
function splitRelationsBySubtype(relations) {
  const connectors = [];
  const skills = [];
  for (const r of relations || []) {
    if (r.subtype === 'connector' && r.name) connectors.push({ id: r.id, name: r.name });
    else if (r.subtype === 'skill' && r.name) skills.push({ id: r.id, name: r.name });
  }
  // Sort ASC por name (determinismo isNoopUpdate — Phase 156-02 Decision "Pitfall 3")
  connectors.sort((a, b) => a.name.localeCompare(b.name));
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { connectors, skills };
}
```

### Anti-Patterns to Avoid

- **Scan `fs.existsSync(legacyPath)` por row:** costoso (2× FS syscalls por row × 6 tablas × ~120 rows). Reemplazar con Set-lookup O(1).
- **Extender `writeResourceFile` con archive-check:** mezcla responsabilidades del writer con semántica lifecycle. Exclude debe vivir en `populateFromDb` (decisión de "qué procesar") no en writer (decisión de "cómo escribir").
- **Re-llamar `syncResource('catpaw','update', enriched)` desde rebuild:** side effects (log per CatPaw, `invalidateKbIndex` N veces, markStale noise). Rebuild es pure DB→FS. Preferir duplicación byte-equivalente.
- **Path `path.join(kbRoot, '.docflow-legacy', ...)`** (como sugirió CONTEXT): `.docflow-legacy` es **hermano** de `.docflow-kb`, no hijo. Usar `path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans')`.

## Code Inventory (verified against current working tree)

Todas las líneas verificadas en el working tree actual (`scripts/kb-sync-db-source.cjs` = 1641 líneas total):

| Anchor | File | Line(s) | Shape |
|--------|------|---------|-------|
| `SUBTYPES` (6-entity frozen array) | kb-sync-db-source.cjs | **103-110** | `['catpaw','connector','skill','catbrain','email-template','canvas']` |
| `SUBTYPE_SUBDIR` (subtype→folder) | kb-sync-db-source.cjs | **112-119** | `{catpaw:'resources/catpaws', connector:'resources/connectors', skill:'resources/skills', catbrain:'resources/catbrains', 'email-template':'resources/email-templates', canvas:'resources/canvases'}` |
| `SUBTYPE_TABLE` (subtype→DB table) | kb-sync-db-source.cjs | **121-128** | standard 6 mapping |
| `loadCatPawRelations(db)` | kb-sync-db-source.cjs | **207-255** | `Map<pawId, Array<{id, subtype:'connector'|'skill'|'catbrain', name?, connector_type_raw?}>>` **(NOT `{connectors,skills}` shape)** |
| `slugify(name)` | kb-sync-db-source.cjs | 297-307 | `(name) → kebab-case ≤50 chars` |
| `resolveShortIdSlug(fullId, slug, typeMap)` | kb-sync-db-source.cjs | **326-339** | `Map.values() collision → 8/12/16/full + numeric fallback` |
| `buildIdMap(db, subtypesFilter)` | kb-sync-db-source.cjs | **355-374** | `{rows: {subtype: row[]}, maps: {subtype: Map<id, shortIdSlug>}}` |
| `buildFrontmatter(subtype, row, kbRoot, maps, relations)` | kb-sync-db-source.cjs | **806-928** | includes `search_hints` line 896-916 (KB-42 closure) |
| `buildBody(subtype, row)` | kb-sync-db-source.cjs | **942-1017** | **SIGNATURE CHANGE** → `(subtype, row, relations)` |
| `stripVolatile(fm)` (idempotence) | kb-sync-db-source.cjs | 1284-1290 | VOLATILE_UPDATE_KEYS = `['updated_at','updated_by','change_log','sync_snapshot']` |
| `detectBumpLevel(curFm,newFm,curBody,newBody)` | kb-sync-db-source.cjs | **1324-1365** | returns `null` when stable-equal (drives `unchanged`) |
| `writeResourceFile(kbRoot, subtype, shortIdSlug, fm, body, opts)` | kb-sync-db-source.cjs | **1401-1482** | opts = `{dryRun, verbose}`, returns `{path, action, subtype, id, bump?}` |
| `populateFromDb(opts)` | kb-sync-db-source.cjs | **1499-1607** | `report = {created, updated, unchanged, orphans, skipped, files[]}` — **ADD** `skipped_archived` |
| `_internal` exports | kb-sync-db-source.cjs | 1613-1641 | **ADD** `loadArchivedIds`, `splitRelationsBySubtype`, `renderLinkedSectionCjs` (for tests) |
| — | | | |
| CLI `cmdFullRebuild(args, {kbRoot})` | kb-sync.cjs | **511-661** | `--source db` + `--dry-run` + `--verbose` + `--only <subtype>` |
| CLI `cmdAuditStale`, `cmdArchive`, `cmdPurge` | kb-sync.cjs | 667-851 | existing 4 commands |
| CLI `main()` dispatcher | kb-sync.cjs | **865-877** | **ADD** branch `if (args.includes('--restore')) return cmdRestore(args);` |
| Exit codes used today | kb-sync.cjs | — | **0** ok · **1** destructive-without-confirm or invalid dispatch · **2** invalid `--only` subtype · **3** DB load fail / module load fail |
| — | | | |
| Canonical render (TS) — mirror source | knowledge-sync.ts | **1021-1028** | `items.map(i => '- **' + i.name + '** (`' + i.id + '`)').join('\n')` + empty placeholder `'_(<emptyLabel>)_'` |
| Canonical catpaw body assembly (TS) | knowledge-sync.ts | 1058-1124 | informa placeholder text: `'sin conectores vinculados'` / `'sin skills vinculadas'` |
| Link-tool call site (provides shape ref) | catbot-tools.ts | **2144-2153** | `linked_connectors = SELECT c.id, c.name ... ORDER BY c.name ASC` — confirmando UUID completa |
| `invalidateKbIndex()` TTL control | kb-index-cache.ts | 192-195 | `INDEX_CACHE_TTL_MS = 60_000` (línea 42) — CLI rebuild externo requiere esperar 60s o restart Docker |

## Canonical Output Format (byte-equivalent with `renderLinkedSection`)

**CRITICAL:** el planner debe usar EXACTAMENTE este formato. Cualquier desviación rompe idempotencia con el path `syncResource('catpaw','update')` que ya se ejecuta runtime (Phase 156-02).

Verificado con `app/src/lib/services/knowledge-sync.ts:1021-1028` + `1114-1121`:

```markdown

## Conectores vinculados

- **Holded MCP** (`seed-holded-mcp`)
- **Gmail Info Educa** (`conn-gma-info-educa360-gmail`)

## Skills vinculadas

- **Deduplicación de leads** (`9c136bbb-dedup-skill`)

```

**Reglas exactas:**

- Items ordenados por `name` ASC (ya garantizado por `catbot-tools.ts:2148` ORDER BY c.name ASC — el rebuild DEBE replicar el sort).
- Formato item: `- **<name>** (\`<id>\`)` — asteriscos dobles, backticks alrededor del id, **UUID completa** (no slug) porque `knowledge-sync.ts:1108` lee `{id: string}` y el caller `catbot-tools.ts:2147-2149` pasa `c.id` (PK).
- Separador: `\n` entre items. Heading-body: `\n\n` (dos newlines tras `## Heading`).
- Array vacío: sección NO se omite — placeholder `_(sin conectores vinculados)_` / `_(sin skills vinculadas)_`. **Verificar ambiguity con CONTEXT:** CONTEXT dijo "si `relations.connectors?.length > 0` renderiza sección", lo cual omitiría. `knowledge-sync.ts:1114-1121` SIEMPRE renderiza header + placeholder. **Decisión: seguir knowledge-sync.ts (siempre render)** para byte-equivalencia absoluta; esto además simplifica oracle y tests.

**Consecuencia:** cualquier CatPaw sin connectors/skills linked tendrá las 2 secciones con placeholder. Eso ya es el comportamiento del path runtime para CatPaws creados/editados post-Phase-156; el rebuild debe coincidir.

## Function Signature Proposals

### §A — `loadArchivedIds(kbRoot) → Set<string>` (NUEVO helper en kb-sync-db-source.cjs)

```javascript
/**
 * Phase 157 KB-46 — scan .docflow-legacy/orphans/<subtype>/*.md and return
 * a Set of "<subtype>:<shortIdSlug>" keys to exclude from rebuild.
 *
 * Path: .docflow-legacy is a SIBLING of .docflow-kb (both under repo root),
 * so the legacy root is path.resolve(kbRoot, '..', '.docflow-legacy').
 *
 * Returns an empty Set if .docflow-legacy/orphans/ is missing or empty —
 * a missing legacy tree is a valid state (fresh repo, pre-Phase-156).
 *
 * @param {string} kbRoot  Absolute path to .docflow-kb/
 * @returns {Set<string>}  e.g. new Set(['catpaw:72ef0fe5-redactor-informe-inbound', ...])
 */
function loadArchivedIds(kbRoot) {
  const ids = new Set();
  const legacyRoot = path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans');
  if (!fs.existsSync(legacyRoot)) return ids;
  for (const sub of SUBTYPES) {
    // SUBTYPE_SUBDIR[sub] → 'resources/catpaws' → last segment 'catpaws'
    const subdirName = SUBTYPE_SUBDIR[sub].split('/').pop();
    const dir = path.join(legacyRoot, subdirName);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      ids.add(`${sub}:${f.slice(0, -3)}`);  // strip .md
    }
  }
  return ids;
}
```

**Used in:** `populateFromDb` after line 1526 (`buildIdMap`) and before Pass 2 loop.

### §B — `buildBody(subtype, row, relations)` (MODIFIED — 3rd param added)

```javascript
/**
 * @param {string} subtype                    One of SUBTYPES.
 * @param {object} row                        DB row.
 * @param {Array<{id,subtype,name?}>} [relations]  Phase 157 KB-47 — optional, only
 *                                            used for subtype='catpaw'. Caller
 *                                            passes `pawRels.get(row.id) || []`.
 *                                            Other subtypes ignore this arg for
 *                                            backwards-compat.
 * @returns {string}  Markdown body (no leading `---` frontmatter; just the body).
 */
function buildBody(subtype, row, relations) {
  // ... existing body assembly (Descripción, Configuración, System Prompt) ...

  // Phase 157 KB-47 — linked sections for catpaws, byte-equivalent to
  // knowledge-sync.ts:1114-1121 so syncResource('catpaw','update') + rebuild
  // produce identical bodies. Sort ASC by name (Phase 156-02 Pitfall 3).
  if (subtype === 'catpaw') {
    const { connectors, skills } = splitRelationsBySubtype(relations || []);
    lines.push('## Conectores vinculados');
    lines.push('');
    lines.push(renderLinkedSectionCjs(connectors, 'sin conectores vinculados'));
    lines.push('');
    lines.push('## Skills vinculadas');
    lines.push('');
    lines.push(renderLinkedSectionCjs(skills, 'sin skills vinculadas'));
    lines.push('');
  }

  lines.push('');   // existing trailing blank (line 1015-1016)
  return lines.join('\n');
}
```

**Call site change** (line 1549):
```javascript
// BEFORE:
const body = buildBody(sub, row);
// AFTER:
const body = buildBody(sub, row, relations);   // relations already computed line 1544-1546
```

### §C — `cmdRestore(args, {kbRoot})` (NUEVO CLI subcommand in kb-sync.cjs)

```javascript
/**
 * Phase 157 KB-46 — opt-in command to move a single file from
 * .docflow-legacy/orphans/<subtype>/ back into .docflow-kb/resources/<subtype>/
 * so the next --full-rebuild --source db will include it again.
 *
 * Usage:
 *   node scripts/kb-sync.cjs --restore --from-legacy <id>
 *
 * Where <id> is the short-id-slug (basename without .md), unambiguous across
 * subtypes since the script scans all 6 subdirs and expects exactly one match.
 *
 * Exit codes:
 *   0  ok
 *   1  destructive-without-confirm (N/A, this is opt-in, no --confirm needed)
 *        OR dispatch/flag error (no --from-legacy, or id missing)
 *   2  invalid args (ambiguous match across subtypes, or file not found)
 *   3  target already exists in resources/ (conflict: would overwrite)
 */
function cmdRestore(args, { kbRoot = KB_ROOT } = {}) {
  const fromIdx = args.indexOf('--from-legacy');
  if (fromIdx === -1 || !args[fromIdx + 1]) {
    console.error('ERROR: --restore requires --from-legacy <id>');
    console.error('Usage: node scripts/kb-sync.cjs --restore --from-legacy <id>');
    process.exit(1);
  }
  const targetId = args[fromIdx + 1];
  const legacyRoot = path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans');
  if (!fs.existsSync(legacyRoot)) {
    console.error(`ERROR: legacy root not found: ${legacyRoot}`);
    process.exit(2);
  }

  // Scan all 6 subdirs for a single match
  const matches = [];
  const SUBDIR_NAMES = ['catpaws','connectors','skills','catbrains','email-templates','canvases'];
  for (const name of SUBDIR_NAMES) {
    const dir = path.join(legacyRoot, name);
    if (!fs.existsSync(dir)) continue;
    const fpath = path.join(dir, `${targetId}.md`);
    if (fs.existsSync(fpath)) matches.push({ subdir: name, fpath });
  }
  if (matches.length === 0) {
    console.error(`ERROR: ${targetId}.md not found in .docflow-legacy/orphans/*/`);
    process.exit(2);
  }
  if (matches.length > 1) {
    console.error(`ERROR: ambiguous id — found in ${matches.length} subdirs: ${matches.map(m=>m.subdir).join(', ')}`);
    process.exit(2);
  }

  const [{ subdir, fpath }] = matches;
  const destDir = path.join(kbRoot, 'resources', subdir);
  const destPath = path.join(destDir, `${targetId}.md`);
  if (fs.existsSync(destPath)) {
    console.error(`ERROR: destination already exists (conflict): ${destPath}`);
    console.error('HINT: git rm that file first, then retry --restore.');
    process.exit(3);
  }

  fs.mkdirSync(destDir, { recursive: true });
  fs.renameSync(fpath, destPath);      // atomic move within same filesystem
  console.log(`RESTORED: .docflow-legacy/orphans/${subdir}/${targetId}.md → resources/${subdir}/${targetId}.md`);
  console.log('NEXT: run `node scripts/kb-sync.cjs --full-rebuild --source db` to re-index.');
}

// In main() dispatcher (line 871+):
if (args.includes('--restore')) return cmdRestore(args);
```

**Note:** `fs.renameSync` is atomic within the same filesystem. For git-history preservation the user can run `git mv` instead manually — document this in `_manual.md`. The CLI uses `rename` for simplicity; if the orphan directory was reached via `git mv` (Phase 156-03), the restore via `rename` still works but detaches from git history. **This is acceptable** — `--restore` is opt-in and the user is explicitly un-doing the archive.

### §D — CLI exit code table for `--restore`

| Exit | Condition | Example |
|------|-----------|---------|
| **0** | Success — file moved | `RESTORED: .docflow-legacy/orphans/catpaws/72ef0fe5-….md → resources/catpaws/…` |
| **1** | Missing `--from-legacy <id>` or no arg | `ERROR: --restore requires --from-legacy <id>` |
| **2** | `<id>.md` not found anywhere, or found in >1 subdir | `ERROR: 72ef0fe5-….md not found in .docflow-legacy/orphans/*/` |
| **3** | Destination already exists in `resources/` (conflict) | `ERROR: destination already exists (conflict): …` |

Matches existing kb-sync.cjs conventions (exit 0/1/2/3 already in use per Phase 150 KB-08).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parse `renderLinkedSection` output back into items for diff | Custom line-split + regex | `detectBumpLevel` body-diff on full text | `detectBumpLevel` ya compara body trimEnd byte-equivalent (línea 1329-1332); basta con que el rebuild produzca bytes idénticos al runtime path, y la idempotencia cae automática. |
| Re-derive `connectors[]` / `skills[]` from DB in a different place | Direct JOIN query duplicando `loadCatPawRelations` | Reuse `loadCatPawRelations(db)` + `splitRelationsBySubtype` helper | `loadCatPawRelations` ya enriquece con `.name` (línea 238, 251); RE-query solo añade roundtrips y drift-risk. |
| Custom idempotence (hash bytes) | `crypto.createHash(...)` per file | `stripVolatile` + `stableStringify` (existentes) + `detectBumpLevel(null)` | Phase 150 KB-09 ya contrata "segundo run = 0 writes"; replicar semántica es redundante. El body-diff actual es suficiente. |
| Git move con preservación historial desde CLI | `execSync('git mv ...')` en cmdRestore | `fs.renameSync` + documentar en _manual.md que `git mv` manual es preferible | `execSync('git')` introduce dep implícita (git ejecutable + estar en repo). `fs.renameSync` es portable; el usuario puede hacer `git mv` manualmente si quiere historial. |
| Ruta de legacy computada con `path.join(kbRoot,...)` (CONTEXT) | `path.join(kbRoot, '.docflow-legacy', 'orphans')` | `path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans')` | `.docflow-legacy/` es SIBLING de `.docflow-kb/`, verificado en working tree (`ls -d /home/deskmath/docflow/.docflow-{legacy,kb}`). CONTEXT equivoca. |
| Re-invocar `syncResource` desde rebuild para re-usar renderer | `await syncResource('catpaw','update', enriched, …)` N veces | Duplicar `renderLinkedSectionCjs` en el script | Side effects: `logger.warn`/`logger.info`, `invalidateKbIndex()` × N, `markStale` en fallo del lote, etc. Rebuild CLI es pure DB→FS; no debe mezclarse con runtime. CONTEXT §3 "Alternativa considerada, descartada". |

**Key insight:** La duplicación de 8 líneas (`renderLinkedSectionCjs`) es aceptable y contratada por Phase 156-02. La alternativa (TS→CJS bridge) no existe en esta arquitectura (script vanilla Node sin build).

## Common Pitfalls

### Pitfall 1: Path Layout Assumption (`.docflow-legacy` vs `.docflow-kb`)

**What goes wrong:** `path.join(kbRoot, '.docflow-legacy', 'orphans')` → ruta inexistente → `archivedIds` vacío → rebuild sigue resucitando.
**Why it happens:** CONTEXT §3 usa esa forma; intuitivamente parece hijo de kb pero es hermano.
**How to avoid:** Usar `path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans')`. Verify con `fs.existsSync(legacyRoot)` y test explícito que mueve archivo a sibling dir.
**Warning signs:** Test de "archived file present → no resurrection" pasa localmente pero producción sigue resucitando (test usaría wrong path).

### Pitfall 2: Relations Shape Mismatch

**What goes wrong:** CONTEXT propone `relations.connectors?.length > 0` assumiendo shape `{connectors:[], skills:[]}`. Real shape es `Array<{subtype,...}>`. `relations.connectors` es `undefined` → nunca renderiza sección.
**Why it happens:** `loadCatPawRelations` mezcla connectors/skills/catbrains en un solo array discriminado por `rel.subtype`.
**How to avoid:** Aplicar `splitRelationsBySubtype` antes de pasar a rendering. Test que assert shape real.
**Warning signs:** Rebuild corre sin error, archivos escritos, pero ninguno tiene sección "## Conectores vinculados".

### Pitfall 3: Empty-Sections Rendering vs Omitting

**What goes wrong:** CONTEXT dice "if relations.connectors?.length > 0" (omitir si vacío). `knowledge-sync.ts:1114-1121` SIEMPRE renderiza header + placeholder `_(sin conectores vinculados)_`. Si rebuild omite, los bytes difieren entre rebuild-creation y runtime-update del mismo CatPaw → `detectBumpLevel` detecta cambio → version bump fake → idempotencia se rompe.
**Why it happens:** Dos specs (CONTEXT vs knowledge-sync.ts) divergentes.
**How to avoid:** Seguir knowledge-sync.ts (siempre render con placeholder). Test de byte-equivalencia contra un CatPaw vacío.
**Warning signs:** Oracle Prompt A muestra sección vacía literal `_(sin conectores vinculados)_` en un CatPaw sin connectors — es el comportamiento **correcto**, no un bug.

### Pitfall 4: `report` Field Collision (skipped vs skipped_archived)

**What goes wrong:** Reutilizar `report.skipped` (hoy significa "missing id/name") para counting archived-skip rompe el test existente `createFixtureDb produces …` si los fixtures cambian.
**Why it happens:** Sobrecarga semántica del mismo field.
**How to avoid:** Añadir campo NUEVO `report.skipped_archived` (default 0). Mantener `report.skipped` intacto.
**Warning signs:** Test "idempotent second run" reporta `skipped > 0` donde antes era 0.

### Pitfall 5: Container Cache 60s TTL Desync

**What goes wrong:** CLI externo ejecuta `--full-rebuild --source db` → archivos actualizados en filesystem. Docker container lee vía `kb-index-cache` con TTL 60s; durante 60s devuelve el índice viejo.
**Why it happens:** Cache in-memory dentro del proceso Node; invalidate via API call requiere endpoint (no existe standalone "/api/kb/invalidate").
**How to avoid:** Para oracle CatBot post-rebuild: o esperar 60s, o `docker restart docflow-app` (ya mencionado en MEMORY). Aquí NO hace falta rebuild Docker porque solo cambia `.docflow-kb/**` (archivos montados via volume rw). Solo restart.
**Warning signs:** Oracle Prompt B reporta counts viejos immediately after rebuild.

### Pitfall 6: Resurrected Files in Both Legacy + Resources (current state)

**What goes wrong:** Hoy los 10 archivos resucitados existen en AMBOS `.docflow-kb/resources/**` y `.docflow-legacy/orphans/**`. Si ejecutamos el fix directamente: `archivedIds` los incluye → exclude en Pass 2 → rebuild NO los reescribe → PERO el archivo antiguo en `resources/` persiste en el working tree (no es "write" ni "update"). Además `orphan scan pass` (línea 1576-1597) los encontrará como orphan (su `shortIdSlug` no está en `maps[sub]` solo si el DB row no existe; si el DB row SÍ existe, `shortIdSlug ∈ knownShortIds` y NO son orphan). Lo correcto es `git rm` manual + run rebuild que debe producir 0 writes / 0 orphans ya.
**Why it happens:** CONTEXT §5 Risk #3 lo anticipa.
**How to avoid:** Plan de cleanup ejecuta `git rm` de los 10 resucitados como PASO EXPLÍCITO antes del rebuild verificatorio. Rebuild posterior debe producir `{created:0, updated:0, unchanged:N, skipped_archived:15, orphans:0}`.
**Warning signs:** Test de cleanup reporta `created > 0` (rebuild NO reescribió pero el archivo existente persiste — ahora discrepa con DB↔KB invariant).

### Pitfall 7: Idempotence Regression from New Body Sections

**What goes wrong:** Primera corrida tras deploy: rebuild procesa 29 CatPaws existentes con `search_hints` en frontmatter. Nuevo body tiene `## Conectores vinculados` + `## Skills vinculadas` (+ items). `detectBumpLevel` ve body-change → retorna `'patch'` (Phase 156-02 decision) → escribe con version bump. **Segunda corrida:** bytes idénticos → `detectBumpLevel` retorna `null` → 0 writes. Esto **es esperado** (primera corrida es backfill, segunda cierra idempotencia). Test debe verificar AMBOS.
**Why it happens:** Cambio de shape inevitable — cualquier extensión de body rompe estabilidad con bodies pre-existentes.
**How to avoid:** Documentar en SUMMARY que "Plan 157-02 hace backfill de 29 CatPaws en primera corrida; segunda corrida preserva idempotencia Phase 150 KB-09 (0 writes)". Test Nyquist: 1st pass `updated ≥ 29`, 2nd pass `updated === 0, unchanged ≥ 29`.
**Warning signs:** Tras deploy, `--full-rebuild --source db` reporta `0 created, 29 updated` — es correcto (backfill). Si la 3ra corrida también reporta updates, es bug (idempotencia rota).

### Pitfall 8: Search_hints Preservation (KB-42 regression)

**What goes wrong:** El fix modifica `buildBody` pero no `buildFrontmatter`. Sin embargo si el test fixture no tiene connectors/skills con `name`, `search_hints` sale undefined (línea 915 condicional `if (uniqueHints.length > 0)`). Rebuild en fixture vacío producirá archivos sin `search_hints`. Producción (con Operador Holded linked) debe preservar `search_hints: [Holded MCP]`.
**Why it happens:** `buildFrontmatter` línea 900-916 ya se ejecuta en Pass 2, NO se cambia. Test debe verificar invariant "search_hints post-fix unchanged vs pre-fix" en fixture con connector+name.
**How to avoid:** Test de regresión KB-42: pre-fix, fixture con catpaw-linked-holded, run rebuild, capture `search_hints`. Post-fix run, assert `search_hints` byte-equivalent.
**Warning signs:** `search_kb({search:"holded"})` devuelve menos hits después del fix (9 → menos).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `--full-rebuild` indiscriminado (pre-Phase 157) | `--full-rebuild` honra `.docflow-legacy/orphans/` exclusion list | Phase 157 (this one) | Alinea rebuild con lifecycle PRD §5.3; cierra regression audit #2 |
| `buildBody(subtype, row)` 2-arg | `buildBody(subtype, row, relations)` 3-arg | Phase 157 | Secciones vinculadas en todos los CatPaws post-rebuild (no solo runtime-updated post-Phase-156-02) |
| Sin mecanismo de "restaurar archivado" | `--restore --from-legacy <id>` opt-in | Phase 157 | Cierra el loop del lifecycle (archivado es reversible pero explícito) |

**Deprecated/outdated:**

- **Ejecutar `--full-rebuild --source db` después de archivar (pre-157):** resucitaba archivos. Post-157 es seguro.
- **Shape `{connectors:[], skills:[]}` sugerido por CONTEXT:** nunca fue el return shape real de `loadCatPawRelations`. Planner debe usar `splitRelationsBySubtype`.

## Validation Architecture

> Nyquist enabled per `.planning/config.json` (`workflow.nyquist_validation: true`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **vitest 4.1.0** |
| Config file | `app/vitest.config.ts` (globs `src/**/*.test.ts`; repo root sin package.json) |
| Quick run command | `cd app && npx vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` |
| Full suite command | `cd app && npm run test:unit` |
| Fixture helper reusable | `createFixtureDb(dbPath)` from `app/src/lib/__tests__/kb-sync-db-source.test.ts` (exported, Phase 150) |
| Script resolution | `DB_SOURCE_SRC = path.join(REPO_ROOT, 'scripts/kb-sync-db-source.cjs')` copiado a tmpRepo per-test |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **KB-46** | `archivedIds` Set loaded from legacy, exclude applied in Pass 2 | unit | `npx vitest run -t "archived file present prevents resurrection"` | ❌ Wave 0 |
| **KB-46** | `archivedIds` empty → normal rebuild behavior (backwards-compat) | unit | `npx vitest run -t "missing legacy tree → normal rebuild"` | ❌ Wave 0 |
| **KB-46** | `--restore --from-legacy <id>` moves file; subsequent rebuild includes it | integration | `npx vitest run -t "restore round-trip"` | ❌ Wave 0 |
| **KB-46** | `--restore` exit codes (1/2/3) for missing-arg / not-found / conflict | unit | `npx vitest run -t "restore exit codes"` | ❌ Wave 0 |
| **KB-47** | `buildBody('catpaw', row, [{subtype:'connector',id,name}])` includes `## Conectores vinculados` section byte-equivalent | unit | `npx vitest run -t "buildBody catpaw with connectors"` | ❌ Wave 0 |
| **KB-47** | `buildBody('catpaw', row, [])` renders sections with empty placeholder (byte-equivalent to knowledge-sync.ts) | unit | `npx vitest run -t "buildBody catpaw no relations renders placeholder"` | ❌ Wave 0 |
| **KB-47** | `buildBody('connector', row, relations)` ignores relations (backwards-compat) | unit | `npx vitest run -t "buildBody non-catpaw ignores relations"` | ❌ Wave 0 |
| **KB-46+KB-47** | Integration: fixture with 2 catpaws (1 active linked, 1 archived), run rebuild → active has sections, archived not written | integration | `npx vitest run -t "integration rebuild honors legacy + renders sections"` | ❌ Wave 0 |
| **KB-46+KB-47** | Idempotence: second rebuild on same DB+legacy = `updated:0, unchanged:N, skipped_archived:same` | integration | `npx vitest run -t "rebuild idempotence post-fix"` | ❌ Wave 0 |
| **Regression** | `search_hints` frontmatter unchanged after fix (KB-42 preservation) | unit | `npx vitest run -t "search_hints preservation"` | ❌ Wave 0 |
| **Oracle** | CatBot 3 prompts post-rebuild (Docker restart + POST /api/catbot/chat) | manual | N/A (oracle evidence in VERIFICATION) | manual-only (justified: end-to-end runtime validation per CLAUDE.md protocolo CatBot como Oráculo) |

### Sampling Rate

- **Per task commit:** `cd app && npx vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` (< 10 s for 10 unit tests with fixture setup).
- **Per wave merge:** `cd app && npx vitest run src/lib/__tests__/kb-sync-*.test.ts knowledge-sync*.test.ts` (validates no regression in kb-sync-db-source + kb-sync-cli + knowledge-sync + kb-hooks).
- **Phase gate:** `cd app && npm run test:unit` full green + CatBot oracle 3/3 prompts passed + working tree has 0 resurrected files + `_index.json.counts` matches DB row counts for 6 entities (Δ=0).

### Wave 0 Gaps

- [ ] `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` — nuevo archivo. Reutiliza `createFixtureDb` (import desde kb-sync-db-source.test.ts).
- [ ] Extensión de `createFixtureDb` (opcional): helper auxiliar `createFixtureLegacy(tmpRepo, {catpaws?:[], canvases?:[], ...})` que crea `.docflow-legacy/orphans/<subdir>/<id>.md` files vacíos. Puede vivir en el mismo test file (no exportar).
- [ ] (Sin framework install — vitest ya presente.)

*(If no gaps: N/A — hay 1 archivo nuevo a crear en Wave 0.)*

## Open Questions

1. **¿Debe `--restore` preservar git history via `git mv` o basta con `fs.rename`?**
   - What we know: `fs.renameSync` es atómico y no depende de git en runtime. `git mv` sería ideal para historial pero introduce dep + requiere repo git.
   - What's unclear: Si el operador valora historial o no.
   - Recommendation: usar `fs.renameSync` en CLI; documentar en `_manual.md` que `git mv` manual es la alternativa history-preserving. Usuarios que quieren historial pueden hacer `git mv .docflow-legacy/orphans/catpaws/X.md .docflow-kb/resources/catpaws/` en vez de usar `--restore`.

2. **¿El 11° archivo (`conn-gma-info-educa360-gmail.md`) con `status=deprecated` debe ser resucitado o mantenerse en legacy?**
   - What we know: está listado en CONTEXT como resucitado, pero AUDIT yaml dice "status=deprecated but present". DB row existe, pero Phase 156-03 lo archivó conscientemente (connector deprecated).
   - What's unclear: policy para connectors deprecated cuyo DB row aún existe (no fue DELETE).
   - Recommendation: el plan de cleanup `git rm` ese archivo del resources y deja el legacy como fuente; `archivedIds` lo incluye → rebuild no lo resucita. Si alguna vez el connector se reactiva (`is_active=1`), el operador hace `--restore --from-legacy conn-gma-info-educa360-gmail`. Alineado con Pitfall 6.

3. **¿Cleanup step debe ser task separado o parte del plan verificatorio?**
   - What we know: Los 10 archivos persisten en working tree y deben eliminarse.
   - What's unclear: si como primer task del Plan 01, o como cierre del Plan 03.
   - Recommendation: como primer task atomic commit del Plan 01 (ANTES del fix de código), para que el fix se verifique contra tree limpio. Alternativa: Plan 03 cleanup + re-run si se prefiere demostrar el fix primero.

4. **¿Necesita `_manual.md` sub-sección "Rebuild Determinism" bajo §Retention Policy (Phase 156-03) o una sección nueva separada?**
   - What we know: §Retention Policy ya documenta active→deprecated→archived→purged.
   - What's unclear: semántica — rebuild-no-resurrect es operacional (cómo se comporta CLI), no lifecycle (cómo transicionan estados).
   - Recommendation: sub-sección bajo §Retention Policy ("### Rebuild Determinism (Phase 157)") + cross-link al PRD §5.3. Mantiene cohesión.

## Sources

### Primary (HIGH confidence)

- **`scripts/kb-sync-db-source.cjs`** (1641 líneas, read integralmente + anchor lines):
  - `SUBTYPES` línea 103-110, `SUBTYPE_SUBDIR` línea 112-119, `SUBTYPE_TABLE` línea 121-128.
  - `loadCatPawRelations(db)` línea 207-255 — **return shape: `Map<pawId, Array<{id,subtype,name?,connector_type_raw?}>>`**.
  - `resolveShortIdSlug(fullId, slug, typeMap)` línea 326-339.
  - `buildIdMap(db, subtypesFilter)` línea 355-374.
  - `buildFrontmatter(subtype, row, kbRoot, maps, relations)` línea 806-928 incluye search_hints línea 896-916.
  - `buildBody(subtype, row)` línea 942-1017.
  - `stripVolatile` línea 1284-1290 + `detectBumpLevel` línea 1324-1365.
  - `writeResourceFile(kbRoot, subtype, shortIdSlug, fm, body, opts)` línea 1401-1482.
  - `populateFromDb(opts)` línea 1499-1607 + exports línea 1613-1641.
- **`scripts/kb-sync.cjs`** (879 líneas, CLI dispatcher):
  - `cmdFullRebuild` línea 508-661.
  - `main()` dispatcher línea 865-877, exit codes 0/1/2/3.
- **`app/src/lib/services/knowledge-sync.ts`** (1612 líneas):
  - `renderLinkedSection(items, emptyLabel)` línea 1021-1028 — canonical format `- **<name>** (\`<id>\`)`.
  - `replaceOrAppendSection` línea 1038-1056.
  - catpaw body assembly línea 1058-1124 (placeholder text `'sin conectores vinculados'` / `'sin skills vinculadas'`).
  - update path línea 1253-1291 con `linked_connectors`/`linked_skills` read.
- **`app/src/lib/services/catbot-tools.ts`** línea 2144-2200: SELECT queries forman la shape canónica `{id: connector.id, name: connector.name}` (UUID completa no slug) con ORDER BY name ASC.
- **`app/src/lib/services/kb-index-cache.ts`** línea 42, 192-195: `INDEX_CACHE_TTL_MS = 60_000` + `invalidateKbIndex()` sin endpoint externo.
- **`app/src/lib/__tests__/kb-sync-db-source.test.ts`**: `createFixtureDb` helper reusable línea 92-407; test patterns para idempotence (línea 984-1007), single-row change (línea 1009-1039), orphan WARN (línea 1041-1070), exit-code 2 (línea 965-982).
- **`.docflow-legacy/orphans/`** filesystem listing (directa `ls` verified): 15 archivos en 6 subdirs: `catpaws/` (8), `canvases/` (2), `skills/` (1), `connectors/` (2), `email-templates/` (1), `catbrains/` (1).
- **`.docflow-kb/resources/`** filesystem listing: confirma que los 10 resucitados (6 catpaws + 2 canvases + 1 skill + `conn-gma`) SÍ están presentes — matches audit #2 evidence.
- **`.planning/ANALYSIS-knowledge-base-architecture.md`** §5.3 líneas 540-618: lifecycle `active → deprecated → archived → purged`; "archivado" = fuera del ciclo automático.
- **`.planning/v29.1-MILESTONE-AUDIT.md`** audit cycle 2 YAML: evidencia runtime state.
- **`CLAUDE.md`** Protocolo CatBot como Oráculo (obligatorio).
- **`.planning/config.json`**: `workflow.nyquist_validation: true` — Validation Architecture section obligatoria.

### Secondary (MEDIUM confidence)

- Ninguna — toda la investigación se basa en lectura directa de código/docs del working tree. Sin WebSearch ni Context7 (la fase es 100% codebase-internal).

### Tertiary (LOW confidence)

- Ninguna.

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — `better-sqlite3` + `vitest` + Node core ya establecidos por Phase 149-150, verificado en `app/package.json` + `scripts/kb-sync-db-source.cjs:54-86`.
- **Architecture:** HIGH — Two-Pass pattern ya implementado línea 1499-1607; extensión con `archivedIds` Set es surgical y testeable. Anchors en archivos verified line-by-line.
- **Pitfalls:** HIGH — 8 pitfalls documentados con warning signs específicos (bytes idénticos, counts Δ, etc.) y todos anclados a código/tests existentes o a CONTEXT/AUDIT evidence. Pitfall 1 (legacy path) + Pitfall 2 (relations shape) son CORRECCIONES verificadas a CONTEXT.
- **Code signatures:** HIGH — Todas las function signatures propuestas están anchored a líneas actuales de `kb-sync-db-source.cjs` + `kb-sync.cjs` + `knowledge-sync.ts`.
- **Validation Architecture:** HIGH — vitest config ya presente, fixture helper ya exportado, patterns de test documentados por Phase 150 test suite.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 días — codebase estable, fase small-scope, sin dependencias externas)

**Reviewer note:** Las 3 correcciones a CONTEXT (sibling-path, relations-shape, render-placeholder) son críticas para el plan. El planner DEBE leer §"Canonical Output Format" + §"Function Signature Proposals" + §"Pitfalls 1-3" antes de escribir tasks.
