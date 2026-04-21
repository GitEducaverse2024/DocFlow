# Phase 158: Model Catalog Capabilities + Alias Schema - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Extender la capa de metadata del stack de modelos. `model_intelligence` gana tres columnas nuevas (`is_local`, `supports_reasoning`, `max_tokens_cap`) seeded correctamente; `model_aliases` gana tres columnas nuevas (`reasoning_effort`, `max_tokens`, `thinking_budget`) con defaults NULL; `GET /api/models` enriquece su respuesta con JOIN a `model_intelligence`.

Pure data plumbing. Sin cambios de runtime LLM (eso es Phase 159), sin tools CatBot (Phase 160), sin UI (Phase 161). Si esta fase falla, ninguna capa posterior puede progresar.

</domain>

<decisions>
## Implementation Decisions

### Tier / local-vs-paid model

- **Nueva columna**: `is_local INTEGER DEFAULT 0` en `model_intelligence`
- **Criterio del seed**: `UPDATE model_intelligence SET is_local=1 WHERE provider='ollama'`
- **Columna `tier` existente NO se toca** — sigue siendo performance tier (Elite/Pro/Libre), ortogonal a is_local
- **Columna `cost_tier` existente NO se toca** — sigue siendo clasificación de coste
- Rationale: cero regresión, semántica clara (`is_local` = "corre en el servidor del usuario, sin coste externo"), fácil de poblar

### Capabilities schema

- **Columnas separadas** en `model_intelligence`:
  - `supports_reasoning INTEGER DEFAULT 0` (0/1)
  - `max_tokens_cap INTEGER` (nullable)
- **NO** extender la columna `capabilities TEXT` JSON existente
- **NO** añadir `thinking_budget_cap` separado — el cap efectivo del thinking va por alias en `model_aliases.thinking_budget`
- Rationale: CatBot tools hacen `SELECT supports_reasoning FROM model_intelligence` directo; type-safe; indexable si necesario

### Seed values (modelos con reasoning)

- `anthropic/claude-opus-4-6`: `supports_reasoning=1`, `max_tokens_cap=32000`
- `anthropic/claude-sonnet-4-6`: `supports_reasoning=1`, `max_tokens_cap=64000`
- `google/gemini-2.5-pro`: `supports_reasoning=1`, `max_tokens_cap=65536`
- Resto: `supports_reasoning=0`
- **max_tokens_cap seed** también para modelos sin reasoning (valores reales: GPT-4o=16384, Gemma local=8192, etc.) — investigar docs actuales durante planning
- **is_local=1**: todos los `provider='ollama'` (gemma3:4b, gemma3:12b, qwen3:8b, etc.)

### model_aliases schema

- **Nuevas columnas** (todas nullable, default NULL):
  - `reasoning_effort TEXT CHECK(reasoning_effort IN ('off','low','medium','high') OR reasoning_effort IS NULL)`
  - `max_tokens INTEGER`
  - `thinking_budget INTEGER`
- Defaults NULL preservan comportamiento actual byte-identical (back-compat total)

### Migration location

- **Inline en `app/src/lib/db.ts` bootstrap** (patrón establecido v8.0+)
- Cada ALTER va en su propio `try { db.exec('ALTER TABLE ... ADD COLUMN ...') } catch {}`
- Idempotente por swallow-error (columna ya existe → catch silencioso)
- **NO** crear `app/src/lib/db-migrations/` directory — consistencia > arquitectura especulativa

### Seed update strategy

- **UPDATE inline en bootstrap** (mismo bloque que los ALTER)
- `UPDATE model_intelligence SET supports_reasoning=1, max_tokens_cap=32000 WHERE model_key='anthropic/claude-opus-4-6'`
- Sin cláusula `WHERE supports_reasoning IS NULL` — idempotente por definición; si el user editó manualmente, el seed lo sobreescribe (aceptado: v30.0 considera el seed canónico)
- Seed ejecuta SIEMPRE en bootstrap, no condicional a tabla vacía

### API `/api/models` enrichment

- **Enriquecer endpoint existente** (`app/src/app/api/models/route.ts`)
- Current: `litellm.getAvailableModels()` → `{models: [...]}`
- New: JOIN con `SELECT model_key, supports_reasoning, max_tokens_cap, is_local, tier, cost_tier FROM model_intelligence`
- Shape: **flat root** — `{id, name, supports_reasoning, max_tokens_cap, is_local, tier, cost_tier, ...}`
- **Modelos en LiteLLM pero NO en `model_intelligence`**: incluir con defaults `null` (no filtrar)
- Back-compat: campos nuevos son adiciones — consumers existentes siguen funcionando sin cambios

### Test coverage (Vitest + tmpfile DB)

- Test 1 (migration): crear DB tmp, ejecutar bootstrap de `db.ts`, verificar via `PRAGMA table_info(model_intelligence)` y `PRAGMA table_info(model_aliases)` que las 6 columnas nuevas existen con tipos correctos
- Test 2 (seed): `SELECT model_key, supports_reasoning, max_tokens_cap, is_local FROM model_intelligence` devuelve valores esperados para Opus/Sonnet/Gemini/Ollama
- Test 3 (API shape): mock de `litellm.getAvailableModels()` + seed de `model_intelligence` → `GET /api/models` devuelve JSON con los campos nuevos en el root; modelos sin fila en model_intelligence tienen campos nuevos como `null`
- Test 4 (back-compat regression): consumers existentes (`litellm.getAvailableModels()` tal cual) no rompen

### Claude's Discretion

- **Valores exactos de `max_tokens_cap`** para modelos no mencionados arriba (GPT-4o-mini, Gemini 2.5 Flash, Qwen 3, Llama 3.3, Mistral 7B) — investigar docs durante el planning
- Orden de las ALTER (agrupación por tabla vs intercaladas)
- Naming del test file (e.g. `db-migrations-v30.test.ts` vs `model-intelligence-capabilities.test.ts`)
- Error message exacto si el CHECK constraint de `reasoning_effort` falla

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`app/src/lib/db.ts`** — Bootstrap único, 4800+ líneas, todos los CREATE TABLE IF NOT EXISTS + ALTER TABLE patterns ahí. Líneas 4798-4828 definen `model_intelligence` + `model_aliases` actuales.
- **`app/src/lib/services/litellm.ts`** — `getAvailableModels()` con cache 60s (v8.0). El endpoint `/api/models` ya lo consume — extender el merge, no reescribir.
- **`app/src/app/api/models/route.ts`** — Route GET actual, 53 líneas. Añadir JOIN con `model_intelligence` via `better-sqlite3` import de `db.ts`.
- **Vitest test infra** — Patrón `Database(':memory:')` o tmpfile ya usado en Phase 150+ (ver `app/src/lib/services/__tests__/`).

### Established Patterns

- **ALTER TABLE idempotente**: `try { db.exec('ALTER ...') } catch {}` — repetido ~60 veces en db.ts para columnas añadidas entre v5.0 y v28.0.
- **Seed inline**: UPDATE/INSERT ejecuta en cada startup, por diseño idempotente. Ejemplos existentes en db.ts para skills, CatPaws, cat-brains.
- **API enrichment**: `/api/system` + `/api/health` hacen JOINs DB + servicios externos. Patrón: `const dbRows = db.prepare(...).all()` + merge con respuesta external.
- **Back-compat additive**: v7.0 streaming, v8.0 model validation, v10.0 CatPaw unification — todos añadieron campos sin romper consumers. Test regression es la defensa.

### Integration Points

- **`db.ts` ~line 4816 (end of model_intelligence CREATE)**: insertar bloque de 3 ALTERs para `is_local`, `supports_reasoning`, `max_tokens_cap`
- **`db.ts` ~line 4828 (end of model_aliases CREATE)**: insertar bloque de 3 ALTERs para `reasoning_effort`, `max_tokens`, `thinking_budget`
- **`db.ts` post-ALTER block**: UPDATEs del seed para modelos con reasoning + is_local
- **`app/src/app/api/models/route.ts:48`**: después del `litellm.getAvailableModels()`, merge con `SELECT FROM model_intelligence`
- **`app/src/lib/services/__tests__/`**: crear `db-migrations-v30.test.ts` (o similar) para tests migration + seed + API

</code_context>

<specifics>
## Specific Ideas

- **`is_local` encima de `tier`/`cost_tier`** — user prefiere semántica booleana clara ("corre local sí/no") sobre sistemas con más categorías cuando no hay necesidad real
- **Cero regresión como requisito duro** — consumers existentes (`task-executor`, `chat-rag`, `canvas-executor`) deben seguir funcionando con el seed y los ALTER aplicados. El back-compat test es OBLIGATORIO, no nice-to-have
- **Investigar docs actuales para max_tokens_cap** — valores reales del 2026-04, no asumidos. Durante el planning usar WebFetch/context7 para validar
- **Docker rebuild requerido** tras este phase — `db.ts` bootstrap corre al startup del container, así que `docker compose build --no-cache && docker compose up -d` en el close del phase (patrón memoria `feedback_docker_restart.md`)

</specifics>

<deferred>
## Deferred Ideas

- **CatBot `set_model_capability` tool** (para que CatBot marque capabilities de modelos desconocidos) — Phase 160+ si hay demanda
- **Admin UI para editar capabilities del catálogo** — v30.1 si hay demanda
- **`thinking_budget_cap` por modelo** (límite máximo de thinking budget declarado en catálogo, no solo por alias) — v30.1 si la UI lo pide
- **Cache TTL para `/api/models` enriquecido** — si el endpoint se vuelve lento, añadir cache a nivel del merge. Phase 158 MVP sin cache explícito (ya hay cache 60s en `litellm.getAvailableModels()`)
- **Migración de `tier` Elite/Pro/Libre → taxonomía estandarizada** — v30.1+ si se decide unificar semántica (hoy es performance tier, no es urgente)

</deferred>

---

*Phase: 158-model-catalog-capabilities-alias-schema*
*Context gathered: 2026-04-21*
