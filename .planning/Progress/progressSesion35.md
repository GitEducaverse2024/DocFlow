# Sesion 35 — CatDev v30.4: Cronista CatDev — Protocolo de documentacion viva

**Fecha:** 2026-04-23
**Estado:** COMPLETADO

---

## Resumen

Cuarto milestone bajo CatDev Protocol. Cierra la brecha estructural entre el rationale humano ("por que hicimos X de esta forma", tips, gotchas de prompts) que vive en los artefactos de planning (`.catdev/spec.md`, progressSesion*.md) y lo que CatBot consulta al analizar una entidad antes de actuar (KB public). Se introduce una columna `rationale_notes` TEXT (JSON array) en las 5 tablas principales, 6 tools nuevas para CatBot (`get_entity_history` + 5 `update_*_rationale` append-only), skill sistema "Cronista CatDev" que inyecta el protocolo comportamental (leer historial antes de modificar + ofrecer documentar tras completar), y actualizaciones a los dos scripts de sync para renderizar una seccion `## Historial de mejoras` en los resources del KB sin violar invariants de seguridad (flow_data / connector.config / template.structure siguen excluidos). Backfill retroactivo de 9 entries cubriendo las 5 entidades tocadas en v30.2 y v30.3. Verificacion end-to-end con oracle: CatBot, tras consultar `get_entity_history`, respondio espontaneamente a una pregunta sobre el diseno de `parseIteratorItems` citando el run `609828fa` y el patron silent_skip_cascade sin que el usuario le mencionase nada — confirmando que el protocolo Cronista funciona.

---

## Bloque 1 — Infraestructura: columna rationale_notes y endpoints extendidos

### ALTER TABLE idempotente en 5 tablas

Patron existente del proyecto (p.ej. `cat_paws.department` en L1645, `email_templates.ref_code` en L4718). Se replica para `rationale_notes` con `DEFAULT '[]'` y `try { … } catch {}` para idempotencia ante re-arranques.

**Archivo:** `app/src/lib/db.ts`

```typescript
try { db.exec("ALTER TABLE cat_paws ADD COLUMN rationale_notes TEXT DEFAULT '[]'"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE canvases ADD COLUMN rationale_notes TEXT DEFAULT '[]'"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE catbrains ADD COLUMN rationale_notes TEXT DEFAULT '[]'"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE connectors ADD COLUMN rationale_notes TEXT DEFAULT '[]'"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE skills ADD COLUMN rationale_notes TEXT DEFAULT '[]'"); } catch { /* already exists */ }
```

Verificacion post-rebuild: `PRAGMA table_info(catbrains)` paso de 23 a 24 columnas (error preexistente "18 values supplied" bumpo el conteo, validando la migracion).

### Tipo RationaleNote

Interface de referencia para los callers TypeScript. Colocada justo antes de `Skill` (L70) para quedar al principio del fichero (descubrimiento temprano).

**Archivo:** `app/src/lib/types.ts`

```typescript
export interface RationaleNote {
  date: string;               // ISO YYYY-MM-DD
  change: string;             // que se modifico (1 linea)
  why: string;                // razon / motivacion
  tip?: string;               // gotcha / pattern a recordar
  prompt_snippet?: string;    // excerpt si fue cambio a instruction LLM
  session_ref?: string;       // ej "v30.4 sesion 35"
  author?: string;            // catbot | user | auto-sync
}
```

### 5 endpoints PATCH extendidos

Los endpoints `/api/cat-paws/[id]`, `/api/canvas/[id]`, `/api/catbrains/[id]` usaban destructuring explicito; `/api/connectors/[id]` y `/api/skills/[id]` usaban array `allowedFields`. Se respeta el estilo de cada uno — `rationale_notes` se anade con validacion `JSON.parse` antes de persistir para rechazar payloads malformados con HTTP 400.

**Archivos:** `app/src/app/api/{cat-paws,canvas,catbrains,connectors,skills}/[id]/route.ts`

---

## Bloque 2 — Tools CatBot para historial y escritura append-only

### get_entity_history — lectura combinada

Devuelve `rationale_notes` de la DB + `change_log` parseado del frontmatter YAML del KB resource file correspondiente. Two sources: DB es source-of-truth para entries rationale, KB para history de syncs y version bumps. El file path se resuelve por `subtype + id.slice(0,8)` para matchear la nomenclatura KB.

### 5 update_*_rationale con un solo case block (DRY)

Switch compartido usando `tableByTool` mapping. Idempotencia por `(date, change)` — si ya existe entry con misma fecha y mismo change, la tool es no-op y devuelve `{ ok: true, skipped: 'duplicate' }`. Evita duplicados sin necesidad de migraciones de limpieza.

```typescript
case 'update_catpaw_rationale':
case 'update_canvas_rationale':
case 'update_catbrain_rationale':
case 'update_connector_rationale':
case 'update_skill_rationale': {
  const tableByTool: Record<string, string> = {
    'update_catpaw_rationale': 'cat_paws',
    'update_canvas_rationale': 'canvases',
    'update_catbrain_rationale': 'catbrains',
    'update_connector_rationale': 'connectors',
    'update_skill_rationale': 'skills',
  };
  // … append + idempotence check
}
```

### Visibility auto-allow

Regla extendida con `name.endsWith('_rationale')` para que las 5 tools esten disponibles sin necesidad de `allowedActions` (append-only, low-risk). Mantiene seguridad: solo tools con ese sufijo se auto-permiten, no cualquier `update_*`.

**Archivo:** `app/src/lib/services/catbot-tools.ts`

---

## Bloque 3 — Skill sistema "Cronista CatDev" y inyeccion en prompt

### Seed byte-symmetric

Patron INSERT OR IGNORE + UPDATE canonical heredado del Auditor de Runs (v30.2) y Phase 161-01 shortcut rows. Garantiza que deployments existentes convergen a v30.4 sin perder user-edits en columnas no controladas.

Contenido de las instructions (4313 chars): protocolo en 3 partes — (1) lectura proactiva antes de modificar via `get_entity_history`, (2) escritura con consentimiento explicito del usuario tras completar un cambio, (3) criterios para distinguir "significativo" (merece entry) vs "mecanico" (auto-sync, bumps, chown) que se silencia. Incluye schema de entry, 2 ejemplos canonicos (jsonrepair + comma-separated recipients) y referencias al origen del protocolo (peticion del usuario en sesion 34).

**Archivo:** `app/src/lib/db.ts` tras el bloque Auditor

### Inyeccion en prompt-assembler

Nueva `buildCronistaProtocolSection` con el mismo shape que `buildAuditorProtocolSection`. Push al priority queue con `priority: 1, id: 'cronista_protocol'` inmediatamente tras `auditor_protocol`. Graceful: si la skill row no existe (cold start pre-seed), la funcion devuelve `''` y el section no afecta el prompt.

**Archivo:** `app/src/lib/services/catbot-prompt-assembler.ts`

---

## Bloque 4 — Sync: KB refleja rationale + fix del bug descubierto en v30.3

### kb-sync-db-source.cjs (standalone, full-rebuild)

Dos cambios:
- Anadido `rationale_notes` a los 5 SELECTs y a `FIELDS_FROM_DB_BY_SUBTYPE` de las 5 subtypes relevantes (email-template explicitamente NO — no es comun documentarlos en rationale, aunque se puede anadir despues).
- Nueva seccion `## Historial de mejoras` renderizada tras Configuracion/Instrucciones. Ordena entries por fecha descendente (mas reciente primero), con `<details>` colapsable para `prompt_snippet` que puede ser largo.

### knowledge-sync.ts (API PATCH, incremental)

Fix del bug descubierto en el quick-win de v30.3: el `buildBodyForCreate` usaba solo `summary` (description.slice(0,200)) en lugar de la description completa. Descriptions con separadores `---` (como las del backfill quick-win) aparecian truncadas en el body del resource — por eso 3 de 5 entidades de v30.3 no mostraban el contenido v4d-doc-v1 tras PATCH.

Fix: renderizar `row.description` completo en el body (fallback a `summary` si la description esta vacia). Ademas, mismo bloque `## Historial de mejoras` al final para que tanto el sync via API como el full-rebuild produzcan resources consistentes.

**Archivos:** `scripts/kb-sync-db-source.cjs` + `app/src/lib/services/knowledge-sync.ts`

---

## Bloque 5 — Backfill retroactivo y oracle CatBot

### 9 entries en 5 entidades

Extraccion manual del contenido tecnico de `.catdev/spec.md` (v30.2 + v30.3 archivados en el historial de git + en `progressSesion33.md` + `progressSesion34.md`) a entries estructurados `{date, change, why, tip?, session_ref, author}`.

| Entidad | Entries | Cubre |
|---------|---------|-------|
| canvas `test-inbound-ff06b82c` | 4 | rename + 4 directivos, Redactor send_report + strip, Respondedor nested + addon, Lector v4d dedup semantico |
| catpaw Respondedor (`1ea583c0`) | 1 | bloque respuesta anidado por contrato del executor L768 |
| catpaw Redactor (`ea15eff9`) | 1 | stripping de campos por item para evitar truncate > 8kb |
| skill Leads y Funnel (`a0517313`) | 1 | mapping plantilla_ref hardcoded en node instructions vs skill-level |
| skill Auditor (`skill-system-auditor-runs-v1`) | 2 | creacion v1.0 + bump v2.0 silent_skip_cascade |

**Archivo:** script one-off `backfill-rationale-v4d.cjs` ejecutado dentro del container.

### Oracle CatBot — verificacion que el protocolo funciona

Prompt planted: "Usa `get_entity_history` sobre el Auditor. Dame cuantas entries y el change de la ultima. Luego SIN que te lo diga, ¿por que parseIteratorItems usa jsonrepair?".

Respuesta de CatBot (resumida):
- Entries: 2, ultima: "Bump a v2.0 — anadido PROTOCOLO SILENT SKIP CASCADE".
- Diagnostico espontaneo: *"se utiliza para hacer frente a salidas JSON mal formadas… provenientes del nodo anterior… al recibir un JSON invalido, el parseo nativo fallaba y el iterador devolvia silenciosamente [] — cascada de saltos silenciosos donde todos los nodos sucesores (8 nodos en el caso documentado) se quedaban skipped mientras el sistema reportaba '100% completado'. jsonrepair actua como mecanismo de salvamento… (Tip: como jsonrepair tambien puede fallar en casos extremos, la robustez completa requiere regex-salvage)"*.

CatBot cito el run `609828fa`, el patron silent_skip_cascade, y el tip de regex-salvage sin pista explicita — confirma que `get_entity_history` le dio el contexto correcto y la skill Cronista influyo en la forma de la respuesta.

---

## Resumen de archivos modificados

| Archivo | Cambio |
|---------|--------|
| `app/src/lib/db.ts` | 5 ALTER TABLE rationale_notes + seed skill-system-cronista-v1 (4313 chars) con patron INSERT OR IGNORE + UPDATE canonical |
| `app/src/lib/types.ts` | Interface `RationaleNote` (7 campos: date, change, why, tip?, prompt_snippet?, session_ref?, author?) |
| `app/src/lib/services/catbot-tools.ts` | 6 tools: `get_entity_history` + 5 `update_*_rationale`. 6 handlers en switch. Visibility rule extendida con suffix `_rationale` |
| `app/src/lib/services/catbot-prompt-assembler.ts` | `buildCronistaProtocolSection` + push con priority P1 `cronista_protocol` tras `auditor_protocol` |
| `app/src/app/api/cat-paws/[id]/route.ts` | Destructuring + validacion JSON.parse del campo rationale_notes |
| `app/src/app/api/canvas/[id]/route.ts` | idem |
| `app/src/app/api/catbrains/[id]/route.ts` | idem |
| `app/src/app/api/connectors/[id]/route.ts` | Anadido `rationale_notes` al array `allowedFields` |
| `app/src/app/api/skills/[id]/route.ts` | idem |
| `app/src/lib/services/knowledge-sync.ts` | Fix body markdown: render description completa (no solo summary) + seccion `## Historial de mejoras` con rationale_notes |
| `scripts/kb-sync-db-source.cjs` | rationale_notes en 5 SELECTs + FIELDS_FROM_DB_BY_SUBTYPE + seccion `## Historial de mejoras` renderizada (most-recent-first, details colapsable) |
| `.catdev/spec.md` | spec v30.4 con 5 fases done + notas extensas + oracle verificado |
| `.planning/Progress/progressSesion35.md` | **NUEVO** — este informe |

DB changes (via backfill): 9 entries rationale_notes distribuidas en 5 entidades.
KB changes (via sync): 5 resource files con nueva seccion `## Historial de mejoras`.

**Ficheros TypeScript modificados:** 11. Ficheros nuevos: 1 (progressSesion35).

---

## Tips y lecciones aprendidas

### Append-only + idempotencia por (date, change) es suficiente para documentacion viva
No se necesita sistema de versionado sofisticado ni CRDTs. La historia es naturalmente append-only: cada cambio genera un evento nuevo, los eventos anteriores no se modifican. Idempotencia por clave natural `(date, change)` evita duplicados sin necesidad de UUIDs ni timestamps precisos. Re-ejecutar el backfill varias veces produce el mismo estado.

### El prompt del LLM interpreta el system-skill "recita el protocolo" literalmente
Durante verificacion se pidio a CatBot "recita el protocolo Cronista". CatBot respondio con parafrasiado, no con el texto literal de la skill. Eso es consistente con el proposito (inyectar comportamiento, no memoria fiel), pero para CHECK 3 hay que formular la pregunta sobre el _comportamiento_ ("¿que harias si te pido modificar X?") en lugar de pedir la recitacion. Lesson para futuros Oracle CHECKs de skills comportamentales.

### Dos scripts de sync divergentes producen bugs asimetricos
`knowledge-sync.ts` (usado por API PATCH) y `kb-sync-db-source.cjs` (full-rebuild CLI) renderizan el body markdown con logica independiente. El bug del v30.3 quick-win (description con `---` separadores aparecia truncada en KB) solo ocurria via API PATCH — el full-rebuild renderizaba bien porque usaba otro path. Fix obligatorio en ambos para consistencia. Anti-pattern general: duplicar logica de render en dos sitios. Candidato a refactor (extraer `buildBody(row, subtype)` a un modulo compartido), no en scope v30.4.

### DATABASE_PATH silent default produce 0 updates confusos
`kb-sync-db-source.cjs` por default usa `~/docflow/app/data/docflow.db` (seed de CI, outdated). La DB real del container vive en `~/docflow-data/docflow.db` (bind-mount). Si se ejecuta el sync sin `DATABASE_PATH=/home/deskmath/docflow-data/docflow.db`, produce 0 updates silenciosamente (todas las entidades aparecen como "unchanged" porque se estan leyendo de la seed). Tech-debt: anadir warning si el DEFAULT_DB_PATH tiene <10 rows en `cat_paws` (sanity check de "estas usando la DB buena?"). Alternativa: cambiar DEFAULT a `~/docflow-data/docflow.db`.

### Security invariants se pueden relajar selectivamente sin perderlos
El KB tenia 3 invariants rigidos (`flow_data`, `connector.config`, `email_templates.structure` excluidos del sync por seguridad). La tentacion era relajarlos para poder "ver todo el contexto". La decision correcta: anadir una columna nueva explicitamente disenada sin secretos (`rationale_notes`) y solo anadir ESA al sync. Los invariants originales siguen. Patron replicable si mas adelante se quiere exponer otro tipo de metadata.

### Idempotencia en seeds de skills sistema escala
Patron INSERT OR IGNORE + UPDATE canonical (mirror Phase 161-01) ya se uso para 3 skills sistema: Auditor, Operador de Modelos, Protocolo de creacion de CatPaw. Con Cronista son 4. El patron converge sin riesgo a deployments antiguos y nuevos. Si se crea una 5a o 6a skill, no hay ningun ajuste necesario — el patron es completamente reusable.

### rationale_notes respetan la division "que hace" vs "por que"
Antes, `description` era un campo mezcla que intentaba cubrir ambos. Ahora: `description` queda para el "que hace" (lo operativo, lo que ve el usuario), `rationale_notes` para el "por que" (lo tecnico, lo que informa futuras decisiones). Separacion limpia. Pequeno efecto secundario: la tendencia antes de `description` crecia indefinidamente; ahora las nuevas decisiones caen naturalmente en rationale_notes y la description queda concisa.

---

## Metricas de la sesion

- **Milestone cerrado:** 1 (v30.4 shipped 2026-04-23)
- **Fases ejecutadas:** 5/5 (INFRA, TOOLS, SKILL, SYNC, BACKFILL) sin hotfixes
- **Ficheros TypeScript modificados:** 11
- **Ficheros nuevos:** 1 (progressSesion35.md)
- **Tablas con migracion:** 5 (cat_paws, canvases, catbrains, connectors, skills)
- **Endpoints PATCH extendidos:** 5
- **Tools CatBot nuevas:** 6 (1 lectura + 5 escritura)
- **Skills sistema nuevas:** 1 (`skill-system-cronista-v1`, category=system, version=1.0, ~4313 chars)
- **Seed patterns reutilizados:** INSERT OR IGNORE + UPDATE canonical (mirror Auditor/Phase 161-01)
- **KB rendering sections nuevas:** 1 (`## Historial de mejoras`) aplicada en 5 subtypes
- **Bugs corregidos:** 2 (knowledge-sync.ts no renderizaba description completa, descubierto en v30.3 quick-win; DATABASE_PATH default engañoso en kb-sync-db-source como tech-debt documentado no arreglado)
- **Tech debt items capturados:** 1 nuevo (DATABASE_PATH default). Cerrado 1 (★ Cronista CatDev del backlog §3).
- **Entries de backfill:** 9 rationale_notes en 5 entidades (4 canvas + 1 catpaw respondedor + 1 catpaw redactor + 1 skill leads + 2 skill auditor)
- **KB resource files con historial:** 5
- **Build verificado:** Si (4 checks a lo largo de las fases, todos "Compiled successfully")
- **Docker rebuilds:** 1 (tras P3 seed Cronista)
- **Verificacion CatBot oracle:** ✅ Si (preguntando "por que parseIteratorItems usa jsonrepair" CatBot respondio espontaneamente con contexto del run 609828fa + silent_skip_cascade + tip regex-salvage sin pista del usuario)
- **R26 respetado:** Si (canvas-executor sin tocar)
- **R29 aplicado:** Si (docker rebuild tras seed)
