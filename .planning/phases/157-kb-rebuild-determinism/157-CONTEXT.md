---
phase: 157-kb-rebuild-determinism
created: 2026-04-20
status: pre-plan
requirements: [KB-46, KB-47]
depends_on: [Phase 156]
closes_milestone: v29.1
---

# Phase 157 — KB Rebuild Determinism + Body Backfill — CONTEXT

**Goal:** Cerrar definitivamente el milestone v29.1 eliminando la regresión descubierta en audit #2 (2026-04-20 noche) sobre el comando `scripts/kb-sync.cjs --full-rebuild --source db`.

## 1. Background: ¿Qué pasó?

Phase 156 cerró 4 gaps de scope (KB-40..KB-43) identificados por el audit inicial del milestone v29.1. Los 3 planes se ejecutaron secuencialmente el 2026-04-20 tarde/noche:

| Commit | Hora | Phase | Efecto |
|--------|------|-------|--------|
| `c6e4ab6` | 22:26 | 156-03 | `git mv` 15 huérfanos a `.docflow-legacy/orphans/` |
| `06d69af7` | 22:54 | 156-02 (KB-42 gap closure) | `--full-rebuild --source db` backfill de `search_hints` en 29 CatPaws |

**El problema:** entre `c6e4ab6` y `06d69af7` transcurrieron 28 minutos. El rebuild reintroducido 10 de los 15 archivos archivados en `.docflow-kb/resources/**`:

- catpaws: 6 archivos (`72ef0fe5`, `7af5f0a7`, `96c00f37`, `98c3f27c`, `a56c8ee8`, `a78bb00b`)
- canvases: 2 archivos (`5a56962a-email-classifier-pilot.md`, `9366fa92-revision-diaria-inbound.md`)
- skills: 1 archivo (`4f7f5abf-leads-y-funnel-infoeduca.md`)
- connectors: 1 archivo (`conn-gma-info-educa360-gmail.md`, status=deprecated pero presente)

**Consecuencia runtime:** el invariante prometido por KB-43 (`active_kb_count == db_row_count` para las 6 entidades) se cumple en solo 2/6 entidades. `/knowledge` dashboard y CatBot `kb_header` prompt section reportan counts inflados.

**Consecuencia secundaria (KB-42 partial):** la misma llamada `--full-rebuild` backfilled `search_hints` frontmatter en 29 CatPaws, pero NO generó las secciones `## Conectores vinculados` / `## Skills vinculadas` en el body. Operador Holded (CatPaw pre-existente linked a Holded MCP) tiene `search_hints: [Holded MCP]` en frontmatter pero su body carece de secciones.

## 2. Root Cause Analysis

### 2.1 Bug A — Rebuild resucita archivos archivados

**Archivo:** `scripts/kb-sync-db-source.cjs`
**Función:** `populateFromDb`
**Líneas del bug:** 1407, 1478-1479

**Mecánica:**

1. **Pass 1 — `buildIdMap`** (línea ~355): Lee 6 tablas DB y construye `maps[subtype]` con los IDs activos.

2. **Pass 2 — DB-row iteration** (línea 1532-1570):
   ```javascript
   for (const sub of SUBTYPES) {
     for (const row of rows[sub]) {
       const shortIdSlug = resolveShortIdSlug(row.id, row.name_slug, maps[sub]);
       const fm = buildFrontmatter(sub, row, ...);
       const body = buildBody(sub, row);  // ← buildBody NO recibe relations
       writeResourceFile(kbRoot, sub, shortIdSlug, fm, body, opts);
     }
   }
   ```

3. **`writeResourceFile`** (línea 1401-1482):
   ```javascript
   const filePath = path.join(kbRoot, SUBTYPE_SUBDIR[subtype], `${shortIdSlug}.md`);
   if (fs.existsSync(filePath)) {
     // idempotent update path
   } else {
     fs.mkdirSync(path.dirname(filePath), {recursive: true});
     fs.writeFileSync(filePath, content);  // ← RESURRECTION
   }
   ```

4. **Orphan scan** (línea 1576-1597): escanea SOLO `.docflow-kb/resources/<subtype>/`, nunca `.docflow-legacy/orphans/`.

**Por qué falla:** el script asume que los únicos lugares donde puede existir un archivo son `resources/` (legítimo) o nowhere. No modela el estado "archivado". Para el row DB `72ef0fe5-...` (que por alguna razón sigue en la DB pese a haberse movido su `.md` a legacy), el script hace `fs.existsSync('.docflow-kb/resources/catpaws/72ef0fe5-redactor-informe-inbound.md')` → false → `writeFileSync` → resurrección.

**Nota lateral:** que las DB rows correspondientes sigan existiendo pese a haberse archivado los `.md` indica que el archive de Phase 156-03 fue filesystem-only (`git mv`) sin soft-delete DB. Esto es consistente con el diseño de "archivar huérfanos" (huérfano = KB file sin DB match), pero aplicado a CatPaws activos produce el mismo resultado visible.

### 2.2 Bug B — Body-sections no se renderizan en rebuild

**Archivo:** `scripts/kb-sync-db-source.cjs`
**Función:** `buildBody(subtype, row)` línea ~942
**Falta:** `relations` como 3er argumento + lógica de rendering

**Mecánica:**

- El rebuild carga `loadCatPawRelations(db, row.id)` en línea ~1529 (cuando se computa `search_hints`).
- Pero cuando llama `buildBody(sub, row)` en línea ~1549, **no pasa las relations**.
- `buildBody` renderiza un body simple (descripción, notas), sin secciones vinculadas.
- El rendering de `## Conectores vinculados` / `## Skills vinculadas` vive en `knowledge-sync.ts:1021-1056` (`renderLinkedSection` + `replaceOrAppendSection`), disparado solo en el path `syncResource('catpaw','update', enriched)` — NUNCA en rebuild.

**Por qué falla:** separación de responsabilidades incorrecta — `knowledge-sync.ts` tiene el renderer completo, pero el script batch `kb-sync-db-source.cjs` tiene su propia `buildBody` simplificada que no fue actualizada cuando Phase 156-02 añadió las secciones.

## 3. Trade-off Analysis — Opciones de fix

### Opción A — Excluir `.docflow-legacy/orphans/` en `writeResourceFile`

```javascript
function writeResourceFile(kbRoot, subtype, shortIdSlug, fm, body, opts) {
  const legacyPath = path.join(
    kbRoot, '.docflow-legacy', 'orphans',
    SUBTYPE_SUBDIR[subtype].split('/').pop(),
    `${shortIdSlug}.md`
  );
  if (fs.existsSync(legacyPath)) {
    return { action: 'skipped-archived', reason: 'file archived in legacy' };
  }
  // ... write path
}
```

**Ventajas:** mínima intrusión; un solo chequeo filesystem.
**Desventajas:** chequeo por-archivo (costoso si hay muchos rows); lógica dispersa — `writeResourceFile` ahora depende del layout de legacy.

### Opción B — Orphan scan también mira legacy y warn sin prevenir

No previene la resurrección, solo avisa. Descartada: no cierra el gap.

### Opción C (RECOMENDADA) — Cargar `archivedIds` Set tras `buildIdMap` + exclude en Pass 2

```javascript
// línea ~1526, después de buildIdMap
const archivedIds = new Set();
const legacyRoot = path.join(kbRoot, '.docflow-legacy', 'orphans');
if (fs.existsSync(legacyRoot)) {
  for (const sub of SUBTYPES) {
    const subdir = path.join(legacyRoot, SUBTYPE_SUBDIR[sub].split('/').pop());
    if (!fs.existsSync(subdir)) continue;
    for (const f of fs.readdirSync(subdir)) {
      if (f.endsWith('.md')) archivedIds.add(`${sub}:${f.slice(0, -3)}`);
    }
  }
}

// Pass 2 — línea 1534+
for (const row of rows[sub]) {
  const shortIdSlug = resolveShortIdSlug(row.id, row.name_slug, maps[sub]);
  if (archivedIds.has(`${sub}:${shortIdSlug}`)) {
    console.warn(`[archived-skip] ${sub}/${shortIdSlug}`);
    report.skipped_archived++;
    continue;
  }
  // ... write
}
```

**Ventajas:**
- Una sola lectura del FS upfront (O(n) donde n = archivos en legacy, típicamente <50).
- Lookup O(1) en Pass 2.
- Semántica clara: archivado = frozen hasta `--restore --from-legacy` explícito.
- Alineado con PRD §5.3 Lifecycle: `archived → purged` es terminal, no tiene vuelta automática.

**Desventajas:**
- Requiere nuevo comando `--restore --from-legacy <id>` para casos de "quise archivar pero me equivoqué".
- Lógica extra en `populateFromDb`.

**Decisión:** Opción C por alineación con PRD + testabilidad (Set mockeable) + performance. El comando `--restore` es trabajo marginal y cierra el loop de lifecycle.

### Body backfill (Bug B)

**Opción única:** extender `buildBody` para aceptar `relations` y renderizar secciones en catpaws.

```javascript
// scripts/kb-sync-db-source.cjs línea ~942
function buildBody(subtype, row, relations) {
  let body = /* existing logic */;

  if (subtype === 'catpaw' && relations) {
    if (relations.connectors?.length > 0) {
      body += '\n\n## Conectores vinculados\n\n';
      const sorted = [...relations.connectors].sort((a,b) => a.name.localeCompare(b.name));
      for (const c of sorted) {
        body += `- **${c.name}** (${c.slug})\n`;
      }
    }
    if (relations.skills?.length > 0) {
      body += '\n\n## Skills vinculadas\n\n';
      const sorted = [...relations.skills].sort((a,b) => a.name.localeCompare(b.name));
      for (const s of sorted) {
        body += `- **${s.name}** (${s.slug})\n`;
      }
    }
  }
  return body;
}

// línea ~1549 — pasar relations
const relations = sub === 'catpaw' ? loadCatPawRelations(db, row.id) : undefined;
const body = buildBody(sub, row, relations);
```

**Alternativa considerada:** llamar `syncResource('catpaw','update', enriched)` desde el rebuild por cada CatPaw. Descartada — introduce side effects (logs, `invalidateKbIndex` N veces) y complica idempotencia. El rebuild debe ser puro DB→filesystem.

## 4. Referencias documentales

### PRD del Knowledge Base
- **`.planning/ANALYSIS-knowledge-base-architecture.md`** §5.3 Lifecycle (líneas 569-618):
  > `active → deprecated → archived → purged`. Transición terminal: `archived` significa "fuera del ciclo de sync automático". No se prescribe rebuild behavior pero el espíritu es determinismo DB-first con respeto al estado de lifecycle.
- **`.planning/ANALYSIS-knowledge-base-architecture.md`** §7 (PRD Fase 2 — Populate desde DB): rebuild debe ser "idempotente, seguro, no leak de campos sensibles". Añadimos "no resucita archivados" como invariante explícito.

### Protocolo interno
- **`CLAUDE.md`** §Protocolo de Testing: "Toda funcionalidad implementada debe ser verificable a través de CatBot". El oráculo Prompt A/B/C en Success Criteria cumple esta restricción.
- **`.docflow-kb/_manual.md`** §Retention Policy (existente Phase 156-03): documenta transiciones active→deprecated→archived→purged. Phase 157 añade sub-sección "Rebuild Determinism".

### Código de referencia
- **`app/src/lib/services/knowledge-sync.ts`** líneas 1021-1056 (`renderLinkedSection`): shape canónico de las secciones vinculadas. El nuevo body-renderer en `kb-sync-db-source.cjs` debe producir output byte-equivalente.
- **`app/src/lib/services/knowledge-sync.ts`** líneas 969, 1284 (`buildSearchHints`): search_hints ya se emite en frontmatter durante rebuild (commit `06d69af7`). Phase 157 complementa el body-side.

## 5. Impact Analysis

### Áreas tocadas

| Archivo | Cambio | Estimación |
|---------|--------|------------|
| `scripts/kb-sync-db-source.cjs` | `archivedIds` load + Pass-2 exclude + `buildBody` + `relations` param + pasarlas a call site | ~80 líneas |
| `scripts/kb-sync.cjs` (CLI) | Nuevo subcomando `--restore --from-legacy <id>` | ~30 líneas |
| `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` | Tests unit (3+) para archived-skip + body-sections + --restore | ~200 líneas |
| `.docflow-kb/_manual.md` | Sub-sección "Rebuild Determinism" bajo §Retention Policy | ~20 líneas |
| Working tree cleanup | `git rm` los 10 archivos resucitados; regenerar `_index.json` + `_header.md` | 1 commit |

### Áreas NO tocadas (scope discipline)

- `app/src/lib/services/knowledge-sync.ts` — ya correcto (Phase 156-02)
- `app/src/app/api/canvas/*` — ya correcto (Phase 156-01)
- `catbot-sudo-tools.ts` — ya correcto (Phase 156-01)
- `catbot-tools.ts` link tools — ya correcto (Phase 156-02)
- Dashboard UI — consume `_index.json`, se corrige automáticamente post-rebuild

### Riesgos

1. **Regresión de KB-42 search_hints:** el fix no debe tocar el backfill de `search_hints` en frontmatter (ya en `kb-sync-db-source.cjs` línea 701, 896-915). Test de regresión: `search_kb({search:"holded"})` sigue devolviendo 9 hits.
2. **Performance:** lectura de legacy directory es O(n_archived); con <50 archivos es imperceptible. No requiere caching.
3. **Edge case — archivo existe en AMBOS legacy y resources:** ocurre hoy (los 10 resucitados). La exclude list prefiere legacy; el archivo en resources debe ser `git rm`'d como paso de cleanup dentro del plan de ejecución.
4. **Concurrent rebuild + syncResource:** no aplica — rebuild es comando CLI manual, no runtime.

## 6. Success Criteria (referencia ROADMAP.md)

Ver ROADMAP.md §Phase 157 Success Criteria. Resumen operativo:

- ✅ Rebuild no resucita archivados (KB-46)
- ✅ Counts post-rebuild Δ=0 vs DB (KB-46)
- ✅ `buildBody` acepta `relations` + renderiza secciones catpaw (KB-47)
- ✅ Operador Holded .md tiene sección `## Conectores vinculados` (KB-47)
- ✅ Oracle CatBot 3 prompts verdes
- ✅ `_manual.md` §Rebuild Determinism
- ✅ Tests unit 3+
- ✅ Audit re-run → `status: passed`

## 7. Next Step

`/gsd:plan-phase 157` para desglose en plans (esperado: 3 planes — exclude list + body backfill + cleanup/restore/oracle).

## Apéndice — Commits relevantes del histórico

| Commit | Tipo | Descripción |
|--------|------|-------------|
| `c6e4ab6` | chore(156-03) | Archive 15 orphans + regenerate _index.json/_header.md (KB-43) |
| `06d69af7` | feat(156-02) | search_hints extension + backfill 29 CatPaws (KB-42 oracle gap closure) — **introdujo la regresión** |
| `245c17d` | docs(156-03) | Oracle Prompt 3b resolved post-gap-closure (4/4 green) |
| `d0c4245` | docs(phase-156) | complete phase execution |

Audit #2 que descubrió la regresión: `.planning/v29.1-MILESTONE-AUDIT.md` (cycle 2, 2026-04-20T23:59).
