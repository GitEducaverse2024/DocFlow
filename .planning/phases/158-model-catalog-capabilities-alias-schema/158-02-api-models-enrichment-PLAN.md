---
phase: 158-model-catalog-capabilities-alias-schema
plan: 02
type: execute
wave: 2
depends_on:
  - 158-01
files_modified:
  - app/src/lib/services/litellm.ts
  - app/src/app/api/models/route.ts
  - app/src/app/agents/new/page.tsx
  - app/src/app/agents/[id]/page.tsx
  - app/src/app/tasks/new/page.tsx
  - app/src/components/catbrains/config-panel.tsx
  - app/src/app/api/models/__tests__/route.test.ts
autonomous: true
requirements:
  - CAT-03
must_haves:
  truths:
    - "GET /api/models returns JSON with shape { models: Array<{ id, supports_reasoning, max_tokens_cap, is_local, tier, cost_tier, display_name, provider }> }"
    - "Modelos presentes en LiteLLM pero ausentes en model_intelligence aparecen con campos nuevos = null (no son filtrados)"
    - "Modelos presentes en model_intelligence pero ausentes en LiteLLM NO aparecen en la respuesta (la respuesta es driven por LiteLLM availability)"
    - "Consumers UI existentes (agents/new, agents/[id], tasks/new, catbrains/config-panel, sources/source-list) siguen funcionando: todos usan ahora `.id` como identificador de modelo"
    - "Tests de regresión existentes (alias-routing, telegram-callback, catbot-*) pasan verdes sin modificaciones"
    - "Docker rebuild produce un container con el endpoint enriquecido funcional"
  artifacts:
    - path: "app/src/app/api/models/route.ts"
      provides: "Enriched GET /api/models endpoint with JOIN model_intelligence"
      contains: "SELECT model_key"
    - path: "app/src/app/api/models/__tests__/route.test.ts"
      provides: "API shape tests + back-compat regression"
      min_lines: 100
    - path: "app/src/app/agents/new/page.tsx"
      provides: "Consumer updated to read {id} from model objects"
      contains: ".id"
    - path: "app/src/app/agents/[id]/page.tsx"
      provides: "Consumer updated to read {id} from model objects"
    - path: "app/src/app/tasks/new/page.tsx"
      provides: "Consumer updated to read {id} from model objects"
    - path: "app/src/components/catbrains/config-panel.tsx"
      provides: "Consumer updated to read {id} from model objects"
  key_links:
    - from: "app/src/app/api/models/route.ts"
      to: "better-sqlite3 prepared statement querying model_intelligence"
      via: "db.prepare('SELECT model_key, is_local, supports_reasoning, ... FROM model_intelligence').all()"
      pattern: "FROM model_intelligence"
    - from: "app/src/app/api/models/route.ts"
      to: "litellm.getAvailableModels()"
      via: "Existing LiteLLM HTTP call, merged by model_key === litellm id"
      pattern: "litellm.getAvailableModels"
    - from: "app/src/app/agents/new/page.tsx (and 3 other UI consumers)"
      to: "GET /api/models response shape"
      via: "fetch.then(data => data.models).map(m => m.id)"
      pattern: "\\.id"
---

<objective>
Enriquecer `GET /api/models` con los campos de capabilities derivados de `model_intelligence` (added en Plan 158-01) — JOIN por `model_key === litellm model id`. La response cambia de `{ models: string[] }` a `{ models: Array<object> }` con shape **flat root** (los campos nuevos están al root, no anidados). Actualizar los 4 consumers UI que dependen de `.includes('gemini-main')` y `list[0]` como string (agents/new, agents/[id], tasks/new, catbrains/config-panel) para leer `.id` del objeto — es el precio de zero-regresión end-to-end.

Purpose: Phase 160 necesita `list_llm_models` tool que devuelva capabilities para que CatBot recomiende; Phase 161 necesita UI que renderice el dropdown "Inteligencia" sólo para modelos con `supports_reasoning=true`. Ambas funcionalidades consumen esta API. Sin el enrichment, ambas fases se bloquean. Además, los consumers UI actuales — de 5 archivos — tratan la respuesta como `string[]` (4/5) o ya como `{id, model_name}` (1/5, `source-list.tsx`), lo cual significa que el switch a objetos requiere actualizar los 4 para preservar la promise de "cero regresión" de CONTEXT.md.

Output: `route.ts` enriquecida, 4 consumers UI actualizados, test Vitest con API shape + back-compat + null-for-missing, Docker rebuild + restart verificado (patrón feedback_docker_restart.md).
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/158-model-catalog-capabilities-alias-schema/158-CONTEXT.md
@.planning/phases/158-model-catalog-capabilities-alias-schema/158-01-SUMMARY.md
@app/src/app/api/models/route.ts
@app/src/lib/services/litellm.ts
@app/src/app/agents/new/page.tsx
@app/src/app/agents/[id]/page.tsx
@app/src/app/tasks/new/page.tsx
@app/src/components/sources/source-list.tsx
@app/src/components/catbrains/config-panel.tsx

<interfaces>
<!-- Current /api/models response shape (string[]). CHANGE TO flat objects. -->

```typescript
// BEFORE (today):
// GET /api/models → { models: string[] }  (e.g., ["gemini-main", "claude-opus", "ollama/gemma3:4b"])

// AFTER (Plan 158-02):
// GET /api/models → { models: ModelInfo[] }
type ModelInfo = {
  id: string;                    // litellm model id (== model_key when available)
  display_name: string | null;   // from model_intelligence.display_name; null if absent
  provider: string | null;       // from model_intelligence.provider
  tier: string | null;           // performance tier: Elite/Pro/Libre
  cost_tier: string | null;      // premium/high/medium/low/free
  supports_reasoning: boolean | null;  // from model_intelligence.supports_reasoning (0/1 → boolean); null if row absent
  max_tokens_cap: number | null;       // from model_intelligence.max_tokens_cap
  is_local: boolean | null;            // from model_intelligence.is_local (0/1 → boolean); null if row absent
};
```

<!-- Current litellm.getAvailableModels() signature — unchanged, still returns string[] (we JOIN in route.ts). -->

```typescript
// app/src/lib/services/litellm.ts
async getAvailableModels(): Promise<string[]>   // list of litellm model ids
```

<!-- UI consumer patterns (read carefully — each expects different shape):

1. agents/new/page.tsx:222-230   → `list.includes('gemini-main')` and `list[0]`       → needs `.id` extraction
2. agents/[id]/page.tsx:264-270  → `setAvailableModels(list)`                         → needs `.id` extraction in display
3. tasks/new/page.tsx:254        → (does not index into list, check at line 254+)     → light touch
4. sources/source-list.tsx:118   → `(data.models || []).map(m => m.id || m.model_name)` → ALREADY compatible (no change needed)
5. catbrains/config-panel.tsx:29 → `setModels(list)`                                  → needs `.id` extraction in display
-->

<!-- Test pattern — API route tests that mock litellm + db (see alias-routing.test.ts pattern for mocking). -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Enriquecer GET /api/models con JOIN model_intelligence</name>
  <files>app/src/app/api/models/route.ts</files>
  <behavior>
    - Test 1: Mock `litellm.getAvailableModels()` para devolver `['gemini-main', 'ollama/gemma3:4b', 'unknown-model']`. Seed `model_intelligence` con rows para `gemini-main` (tier=Elite, is_local=0, supports_reasoning=0, max_tokens_cap=32768) y `ollama/gemma3:4b` (tier=Libre, is_local=1, supports_reasoning=0, max_tokens_cap=8192). GET /api/models devuelve `{ models: [...] }` donde:
        - Primer item: `{ id:'gemini-main', display_name:'...', provider:'google', tier:'Elite', cost_tier:'high', supports_reasoning:false, max_tokens_cap:32768, is_local:false }`
        - Segundo item: `{ id:'ollama/gemma3:4b', ..., is_local:true }`
        - Tercer item: `{ id:'unknown-model', display_name:null, provider:null, tier:null, cost_tier:null, supports_reasoning:null, max_tokens_cap:null, is_local:null }` (row ausente en model_intelligence → null para todos los campos enriched).
    - Test 2: `GET /api/models?type=embedding` sigue devolviendo `{ installed, suggestions }` sin cambios (embeddings rama no enriched — fuera de scope).
    - Test 3: Si `litellm.getAvailableModels()` devuelve `[]` (LiteLLM down), la respuesta es `{ models: [] }` — no rompe.
    - Test 4: Si la query a `model_intelligence` falla (e.g. tabla no existe — muy raro pero posible en cold start pre-158-01), el endpoint sigue devolviendo la lista de LiteLLM con todos los campos enriched = null (fallback degradado).
    - Test 5 (regresión — shape contract): cada item de `data.models` tiene `typeof item.id === 'string'` — NUNCA es un primitivo string suelto. La shape root es object siempre.
  </behavior>
  <action>
Reescribir `app/src/app/api/models/route.ts` para hacer el JOIN. Mantener la rama `type=embedding` intacta. Ampliar la rama default (LiteLLM chat models).

**Implementación:**

```typescript
import { NextResponse } from 'next/server';
import { litellm } from '@/lib/services/litellm';
import { ollama } from '@/lib/services/ollama';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Well-known embedding models that can be pulled (unchanged from v8.0)
const SUGGESTED_MODELS = [
  { name: 'qwen3-embedding:0.6b', description: '#1 MTEB multilingual, 1024 dims, 32K ctx, MRL', size_mb: 639 },
  { name: 'qwen3-embedding:4b', description: 'Alta calidad multilingual, 2560 dims, MRL', size_mb: 2500 },
  { name: 'bge-m3', description: 'Hybrid search (dense+sparse), 1024 dims', size_mb: 1200 },
  { name: 'snowflake-arctic-embed2', description: 'Rapido multilingual, 1024 dims, MRL', size_mb: 1200 },
  { name: 'nomic-embed-text', description: 'Rapido EN, 768 dims', size_mb: 274 },
  { name: 'mxbai-embed-large', description: 'Preciso EN, 1024 dims', size_mb: 670 },
  { name: 'all-minilm', description: 'Ultra-ligero EN, 384 dims', size_mb: 46 },
];

// Phase 158: shape enriched from model_intelligence JOIN
type ModelRow = {
  model_key: string;
  display_name: string | null;
  provider: string | null;
  tier: string | null;
  cost_tier: string | null;
  supports_reasoning: number | null;  // SQLite returns INTEGER; we coerce to boolean in response
  max_tokens_cap: number | null;
  is_local: number | null;
};

type ModelInfo = {
  id: string;
  display_name: string | null;
  provider: string | null;
  tier: string | null;
  cost_tier: string | null;
  supports_reasoning: boolean | null;
  max_tokens_cap: number | null;
  is_local: boolean | null;
};

function toBoolOrNull(v: number | null | undefined): boolean | null {
  if (v === null || v === undefined) return null;
  return v === 1;
}

function loadIntelligenceMap(): Map<string, ModelRow> {
  try {
    const rows = db.prepare(
      `SELECT model_key, display_name, provider, tier, cost_tier,
              supports_reasoning, max_tokens_cap, is_local
       FROM model_intelligence`
    ).all() as ModelRow[];
    const map = new Map<string, ModelRow>();
    for (const r of rows) map.set(r.model_key, r);
    return map;
  } catch (err) {
    logger.warn('api/models', 'model_intelligence query failed; falling back to null-enriched shape', { error: (err as Error).message });
    return new Map();
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  try {
    if (type === 'embedding') {
      // Unchanged from v8.0
      const embeddingModels = await ollama.listEmbeddingModels();
      const installed = embeddingModels.map(m => ({
        name: m.name,
        full_name: m.full_name,
        size_mb: m.size_mb,
        family: m.family,
        parameter_size: m.parameter_size,
        supports_mrl: m.supports_mrl,
        mrl_dims: m.mrl_dims,
        native_dims: m.native_dims,
      }));
      const installedNames = installed.map(m => m.name);
      const suggestions = SUGGESTED_MODELS
        .filter(s => !installedNames.includes(s.name.split(':')[0]))
        .map(s => ({ ...s, installed: false }));
      return NextResponse.json({ installed, suggestions });
    }

    // Default: LiteLLM chat models, enriched with model_intelligence
    const litellmIds = await litellm.getAvailableModels();
    const intelligenceMap = loadIntelligenceMap();

    const models: ModelInfo[] = litellmIds.map((id: string) => {
      const row = intelligenceMap.get(id);
      return {
        id,
        display_name: row?.display_name ?? null,
        provider: row?.provider ?? null,
        tier: row?.tier ?? null,
        cost_tier: row?.cost_tier ?? null,
        supports_reasoning: toBoolOrNull(row?.supports_reasoning ?? null),
        max_tokens_cap: row?.max_tokens_cap ?? null,
        is_local: toBoolOrNull(row?.is_local ?? null),
      };
    });

    return NextResponse.json({ models });
  } catch (err) {
    logger.error('api/models', 'unhandled error; returning empty payload', { error: (err as Error).message });
    return NextResponse.json({ models: [], installed: [], suggestions: [] });
  }
}
```

**Reglas duras:**
1. **Shape = flat root** (locked por CONTEXT.md — NO anidar bajo `capabilities: {...}` como sugería el ROADMAP).
2. **Campos nuevos como null** (no omitidos) cuando el model_key no está en `model_intelligence`. Esto permite al cliente distinguir "desconocido" vs "explícitamente false".
3. **Boolean coercion**: SQLite devuelve INTEGER 0/1 para `supports_reasoning` e `is_local`; el JSON response debe serializar como `true/false/null` (no 0/1) — helper `toBoolOrNull`.
4. **Modelos sin fila en model_intelligence NO se filtran** (CONTEXT.md lock). Siguen apareciendo con campos null.
5. **Modelos presentes en model_intelligence pero NO en LiteLLM no aparecen** (la lista es driven por LiteLLM availability — mantiene comportamiento actual).
6. **Cache TTL**: NO añadir cache al merge — CONTEXT.md es explícito ("Phase 158 MVP sin cache explícito; ya hay cache 60s en litellm.getAvailableModels()"). Sí dejar comentario TODO para Phase 158+ si el endpoint se vuelve lento.
7. **NO `type` annotation nested (capabilities: {...})** — flat root. Si en Phase 161 la UI pide estructura anidada, ella misma la re-agrupa; la API queda plana.
8. Import correcto: `import db from '@/lib/db'` (default export — ver patrón en alias-routing.test.ts mock).
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/app/api/models/__tests__/route.test.ts</automated>
  </verify>
  <done>
    - `route.ts` reescrito con JOIN, boolean coercion, null-for-missing, shape flat root.
    - La rama `type=embedding` intacta byte-identical.
    - Tests del Task 3 en `route.test.ts` pasan para esta lógica.
    - `cd app && npm run lint` exit 0.
  </done>
</task>

<task type="auto">
  <name>Task 2: Actualizar 4 consumers UI para leer .id del objeto</name>
  <files>app/src/app/agents/new/page.tsx, app/src/app/agents/[id]/page.tsx, app/src/app/tasks/new/page.tsx, app/src/components/catbrains/config-panel.tsx</files>
  <action>
Cada consumer hoy asume `data.models: string[]`. Tras Task 1, `data.models: Array<{id: string, ...}>`. El mínimo cambio quirúrgico para preservar back-compat total:

**1. `app/src/app/agents/new/page.tsx` (líneas 222-230):**

BEFORE:
```typescript
fetch('/api/models')
  .then(res => res.json())
  .then(data => {
    const list = Array.isArray(data.models) ? data.models : [];
    setAvailableModels(list);
    if (!model) {
      const defaultModel = list.includes('gemini-main') ? 'gemini-main' : list[0] || '';
      setModel(defaultModel);
    }
  })
```

AFTER:
```typescript
fetch('/api/models')
  .then(res => res.json())
  .then(data => {
    // Phase 158 (v30.0): /api/models now returns Array<{id, ...}>. Extract ids for back-compat.
    const items = Array.isArray(data.models) ? data.models : [];
    const list: string[] = items.map((m: { id?: string }) => m?.id ?? '').filter(Boolean);
    setAvailableModels(list);
    if (!model) {
      const defaultModel = list.includes('gemini-main') ? 'gemini-main' : list[0] || '';
      setModel(defaultModel);
    }
  })
```

**2. `app/src/app/agents/[id]/page.tsx` (líneas 264-272):**

BEFORE:
```typescript
fetch('/api/models')
  .then(res => res.json())
  .then(data => {
    const list = Array.isArray(data.models) ? data.models : [];
    setAvailableModels(list);
  })
  .catch(() => setAvailableModels([]))
  .finally(() => setModelsLoading(false));
```

AFTER:
```typescript
fetch('/api/models')
  .then(res => res.json())
  .then(data => {
    // Phase 158 (v30.0): /api/models now returns Array<{id, ...}>. Extract ids for back-compat.
    const items = Array.isArray(data.models) ? data.models : [];
    const list: string[] = items.map((m: { id?: string }) => m?.id ?? '').filter(Boolean);
    setAvailableModels(list);
  })
  .catch(() => setAvailableModels([]))
  .finally(() => setModelsLoading(false));
```

**3. `app/src/app/tasks/new/page.tsx` (alrededor de línea 254 — verificar contexto exacto al editar):**

Leer el archivo primero, identificar el handler que consume `/api/models`. Típicamente sigue el patrón:
```typescript
fetch('/api/models') → setAvailableModels(data.models)
```
Aplicar el mismo mapping `.map(m => m?.id ?? '').filter(Boolean)` si existe tal assignment. Si `tasks/new/page.tsx` NO guarda la lista en state (solo verifica disponibilidad), aplicar el mismo mapping al punto donde se lee `.length` o `.includes`.

**4. `app/src/components/catbrains/config-panel.tsx` (líneas 29-35):**

BEFORE:
```typescript
fetch('/api/models')
  .then(res => res.json())
  .then(data => {
    const list = Array.isArray(data.models) ? data.models : [];
    setModels(list);
  })
  .catch(() => setModels([]));
```

AFTER:
```typescript
fetch('/api/models')
  .then(res => res.json())
  .then(data => {
    // Phase 158 (v30.0): /api/models now returns Array<{id, ...}>. Extract ids for back-compat.
    const items = Array.isArray(data.models) ? data.models : [];
    const list: string[] = items.map((m: { id?: string }) => m?.id ?? '').filter(Boolean);
    setModels(list);
  })
  .catch(() => setModels([]));
```

**5. `app/src/components/sources/source-list.tsx` (línea 118-122):** 

NO tocar — ya es compatible. El código existente `(data.models || []).map((m: { id?: string; model_name?: string }) => m.id || m.model_name || '').filter(Boolean)` lee `.id` correctamente.

**Reglas duras:**
1. El cambio es puramente defensivo — cada consumer extrae `.id` con fallback a empty string y filtra boolean-falsy. Funciona contra ambas shapes (array de strings O array de objetos) durante el rollout — si LiteLLM mock devolviera el viejo shape por error, `m?.id` sería `undefined` y el mapping daría `['','',...]` → filtrado fuera.
2. **NO añadir nuevos tipos a `setAvailableModels` / `setModels`** — mantienen signatura `(list: string[]) => void` para cero ripple-effect en los componentes que consumen estos states (dropdowns, selects).
3. NO tocar el rendering ni el resto de los archivos. Solo el handler del `.then(data => ...)`.
4. NO tocar `source-list.tsx` — ya compatible.
5. Comentario inline en cada consumer: `// Phase 158 (v30.0): /api/models now returns Array<{id, ...}>. Extract ids for back-compat.` — facilita grep y entendimiento del upgrade.

**Verificar antes de editar**: Leer cada archivo primero con Read tool para confirmar la ubicación exacta (las líneas pueden haber shift-ado si otros plans aún pendientes tocaron estos archivos). Si el patrón cambia significativamente, adapta la edición conservando el principio: mapear objects → ids.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run lint &amp;&amp; npm run build</automated>
  </verify>
  <done>
    - 4 archivos editados con el patrón `items.map((m: { id?: string }) => m?.id ?? '').filter(Boolean)`.
    - `source-list.tsx` NO editado (ya compatible).
    - `npm run lint` exit 0 (sin unused imports — feedback_unused_imports_build.md).
    - `npm run build` exit 0 (sin type errors de TS).
    - Comentario `// Phase 158 (v30.0)` presente en los 4 sitios.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Test Vitest — API shape + back-compat regression</name>
  <files>app/src/app/api/models/__tests__/route.test.ts</files>
  <behavior>
    - Describe "GET /api/models — shape flat root":
      - Test 1: Mock litellm devuelve `['gemini-main', 'ollama/gemma3:4b']` + seed intelligence con sus filas → response tiene `data.models[0] = { id:'gemini-main', supports_reasoning:false, max_tokens_cap:32768, is_local:false, tier:'Elite', cost_tier:'high', display_name:'...', provider:'google' }` (fields en root, boolean not 0/1).
      - Test 2: Mock litellm devuelve `['unknown-model']` (no en model_intelligence) → `data.models[0] = { id:'unknown-model', supports_reasoning:null, max_tokens_cap:null, is_local:null, tier:null, cost_tier:null, display_name:null, provider:null }`.
      - Test 3: Mock litellm devuelve `[]` → `data.models = []` (no throw, no null).
      - Test 4: Response SIEMPRE tiene shape `{ models: Array<object> }` con `typeof models[i].id === 'string'` para todo i. Nunca strings sueltos en el root.
    - Describe "GET /api/models — back-compat regression":
      - Test 5: Los 5 consumers UI pueden extraer ids con el patrón `items.map(m => m?.id).filter(Boolean)` y obtienen un `string[]` equivalente al pre-158 list — funcional (incluye `'gemini-main'` si está disponible).
      - Test 6: `source-list.tsx` pattern funciona: `(data.models || []).map(m => m.id || m.model_name || '').filter(Boolean)` devuelve la lista esperada.
      - Test 7: `type=embedding` no afectado — devuelve `{ installed, suggestions }` sin `models`.
    - Describe "GET /api/models — fallback degradado":
      - Test 8: Si `db.prepare().all()` lanza (e.g. tabla no existe pre-158-01), el endpoint devuelve `{ models: [...] }` con TODOS los items con campos enriched = null (warn logged pero no throw).
      - Test 9: Si `litellm.getAvailableModels()` lanza, catch top-level devuelve `{ models: [], installed: [], suggestions: [] }` (legacy fallback mantenido).
  </behavior>
  <action>
Crear `app/src/app/api/models/__tests__/route.test.ts` siguiendo el patrón de mocking de `alias-routing.test.ts` (vi.mock para dependencias).

**Estructura:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ---- Mocks ----

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetAvailableModels = vi.fn();
vi.mock('@/lib/services/litellm', () => ({
  litellm: {
    getAvailableModels: (...args: unknown[]) => mockGetAvailableModels(...args),
  },
}));

vi.mock('@/lib/services/ollama', () => ({
  ollama: { listEmbeddingModels: vi.fn().mockResolvedValue([]) },
}));

const mockDbAll = vi.fn();
const mockDbPrepare = vi.fn().mockImplementation(() => ({
  all: (...args: unknown[]) => mockDbAll(...args),
}));
vi.mock('@/lib/db', () => ({
  default: { prepare: (...args: unknown[]) => mockDbPrepare(...args) },
}));

// Fixtures
const GEMINI_MAIN_ROW = {
  model_key: 'gemini-main',
  display_name: 'Gemini Main',
  provider: 'google',
  tier: 'Elite',
  cost_tier: 'high',
  supports_reasoning: 1,
  max_tokens_cap: 32768,
  is_local: 0,
};
const GEMMA_LOCAL_ROW = {
  model_key: 'ollama/gemma3:4b',
  display_name: 'Gemma 3 4B',
  provider: 'ollama',
  tier: 'Libre',
  cost_tier: 'free',
  supports_reasoning: 0,
  max_tokens_cap: 8192,
  is_local: 1,
};

function makeReq(url = 'http://localhost/api/models') {
  return new Request(url);
}

describe('GET /api/models — Phase 158 enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbAll.mockReturnValue([]);
    mockGetAvailableModels.mockResolvedValue([]);
  });

  describe('shape flat root', () => {
    it('Test 1 — model en litellm + en model_intelligence tiene campos enriched', async () => {
      mockGetAvailableModels.mockResolvedValue(['gemini-main']);
      mockDbAll.mockReturnValue([GEMINI_MAIN_ROW]);

      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();

      expect(json.models).toHaveLength(1);
      expect(json.models[0]).toEqual({
        id: 'gemini-main',
        display_name: 'Gemini Main',
        provider: 'google',
        tier: 'Elite',
        cost_tier: 'high',
        supports_reasoning: true,     // coerced to boolean
        max_tokens_cap: 32768,
        is_local: false,              // coerced to boolean
      });
    });

    it('Test 2 — model en litellm pero NO en model_intelligence tiene campos enriched=null', async () => {
      mockGetAvailableModels.mockResolvedValue(['unknown-model']);
      mockDbAll.mockReturnValue([]);  // empty model_intelligence

      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();

      expect(json.models[0]).toEqual({
        id: 'unknown-model',
        display_name: null,
        provider: null,
        tier: null,
        cost_tier: null,
        supports_reasoning: null,
        max_tokens_cap: null,
        is_local: null,
      });
    });

    it('Test 3 — litellm vacío devuelve models=[]', async () => {
      mockGetAvailableModels.mockResolvedValue([]);
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();
      expect(json.models).toEqual([]);
    });

    it('Test 4 — todos los items del root tienen typeof id === string (nunca strings sueltos)', async () => {
      mockGetAvailableModels.mockResolvedValue(['a', 'b', 'c']);
      mockDbAll.mockReturnValue([]);
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();
      expect(json.models).toHaveLength(3);
      for (const m of json.models) {
        expect(typeof m).toBe('object');
        expect(typeof m.id).toBe('string');
      }
    });

    it('Test 4b — is_local y supports_reasoning coerced a boolean (no 0/1)', async () => {
      mockGetAvailableModels.mockResolvedValue(['gemini-main', 'ollama/gemma3:4b']);
      mockDbAll.mockReturnValue([GEMINI_MAIN_ROW, GEMMA_LOCAL_ROW]);
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();
      expect(json.models[0].is_local).toBe(false);
      expect(json.models[1].is_local).toBe(true);
      expect(typeof json.models[0].supports_reasoning).toBe('boolean');
      expect(typeof json.models[1].supports_reasoning).toBe('boolean');
    });
  });

  describe('back-compat regression', () => {
    it('Test 5 — consumer UI pattern (m.id) extrae ids en string[]', async () => {
      mockGetAvailableModels.mockResolvedValue(['gemini-main', 'claude-opus', 'ollama/gemma3:4b']);
      mockDbAll.mockReturnValue([GEMINI_MAIN_ROW, GEMMA_LOCAL_ROW]);
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();

      // Simular el patrón de agents/new/page.tsx, agents/[id]/page.tsx, catbrains/config-panel.tsx
      const list: string[] = json.models
        .map((m: { id?: string }) => m?.id ?? '')
        .filter(Boolean);

      expect(list).toEqual(['gemini-main', 'claude-opus', 'ollama/gemma3:4b']);
      expect(list.includes('gemini-main')).toBe(true);   // original agents/new logic preserved
      expect(list[0]).toBe('gemini-main');               // original list[0] fallback preserved
    });

    it('Test 6 — source-list pattern (m.id || m.model_name) sigue funcionando', async () => {
      mockGetAvailableModels.mockResolvedValue(['gemini-main']);
      mockDbAll.mockReturnValue([GEMINI_MAIN_ROW]);
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();

      const list = (json.models || [])
        .map((m: { id?: string; model_name?: string }) => m.id || m.model_name || '')
        .filter(Boolean);
      expect(list).toEqual(['gemini-main']);
    });

    it('Test 7 — rama type=embedding no afectada', async () => {
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq('http://localhost/api/models?type=embedding'));
      const json = await res.json();
      expect(json).toHaveProperty('installed');
      expect(json).toHaveProperty('suggestions');
      expect(json).not.toHaveProperty('models');
    });
  });

  describe('fallback degradado', () => {
    it('Test 8 — si db.prepare lanza, todos los items con enriched=null', async () => {
      mockGetAvailableModels.mockResolvedValue(['gemini-main']);
      mockDbPrepare.mockImplementationOnce(() => { throw new Error('no such table: model_intelligence'); });

      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();

      expect(json.models).toHaveLength(1);
      expect(json.models[0].id).toBe('gemini-main');
      expect(json.models[0].supports_reasoning).toBeNull();
      expect(json.models[0].max_tokens_cap).toBeNull();
    });

    it('Test 9 — si litellm lanza, catch top-level devuelve payload legacy', async () => {
      mockGetAvailableModels.mockRejectedValue(new Error('LiteLLM down'));
      const { GET } = await import('@/app/api/models/route');
      const res = await GET(makeReq());
      const json = await res.json();
      expect(json).toEqual({ models: [], installed: [], suggestions: [] });
    });
  });
});
```

**Reglas duras:**
1. Usar `vi.mock('@/lib/db')` con default export (patrón visto en alias-routing.test.ts líneas 28-32).
2. Mock `@/lib/services/litellm` y `@/lib/services/ollama` explícitamente.
3. NO importar `route.ts` estáticamente al top — hacer `await import('@/app/api/models/route')` dentro de cada test (patrón visto en alias-routing.test.ts líneas 100, 116) para que los mocks apliquen antes del import.
4. Cubrir los 9 tests listados — son los mínimos que satisfacen CAT-03 verification criteria + CONTEXT.md Tests 3 y 4.
5. NO necesita real DB — los mocks son suficientes (la validez real del JOIN se cubre con el test file de Plan 158-01 + el smoke test docker del verification section).
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/app/api/models/__tests__/route.test.ts</automated>
  </verify>
  <done>
    - Archivo creado con 3 describe blocks, 9+ tests, todos pasan.
    - Mocks correctos de litellm, ollama, db, logger.
    - Dynamic imports dentro de cada test para respetar vi.mock timing.
    - `npm run lint` exit 0.
  </done>
</task>

</tasks>

<verification>
## Phase-level verification (post-tasks, ejecutar en orden)

1. **Vitest — todos los tests del phase 158 (ambos plans):**
   ```bash
   cd app && npm run test:unit -- src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts src/app/api/models/__tests__/route.test.ts
   ```
   Esperado: tests de Plan 01 (~15) + tests de Plan 02 (~9) todos verdes.

2. **Regresión de unit tests existentes (sanity):**
   ```bash
   cd app && npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts src/lib/services/__tests__/mid.test.ts src/lib/services/__tests__/health.test.ts
   ```
   Esperado: todos verdes — las ALTERs son additive, los mocks existentes no dependen de schema real.

3. **Build + lint completo:**
   ```bash
   cd app && npm run lint && npm run build
   ```
   Esperado: exit 0. Cualquier error de tipo o unused import DEBE ser arreglado (feedback_unused_imports_build.md).

4. **Docker rebuild + restart (patrón feedback_docker_restart.md):**
   ```bash
   docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app
   ```
   Esperado: container levanta sin errores en logs (`docker logs docflow-app --tail 100 2>&1 | grep -iE "error|phase 158"`).

5. **Smoke test curl contra el container:**
   ```bash
   curl -s http://localhost:3500/api/models | python3 -c "
   import json, sys
   data = json.load(sys.stdin)
   models = data.get('models', [])
   print(f'Total models: {len(models)}')
   for m in models[:3]:
       print(f'  {m.get(\"id\")}: supports_reasoning={m.get(\"supports_reasoning\")}, max_tokens_cap={m.get(\"max_tokens_cap\")}, is_local={m.get(\"is_local\")}, tier={m.get(\"tier\")}')
   "
   ```
   Esperado:
   - `Total models: ` > 0 (asumiendo LiteLLM healthy).
   - Cada item tiene `id` (string) + los 7 campos enriched (booleano/int/string o null).
   - Al menos 1 modelo Ollama con `is_local=true`.
   - Si `anthropic/claude-opus-4-6` aparece en litellm Y en model_intelligence, `supports_reasoning=true` y `max_tokens_cap=32000`.

6. **Regresión UI (smoke manual, no automatizable):**
   - Abrir http://localhost:3500/agents/new — el select de model debe poblarse con ids (no objetos stringificados como `[object Object]`).
   - Abrir http://localhost:3500/tasks/new — idem.
   - Abrir http://localhost:3500 y crear un catbrain — el select de model en config-panel idem.
   - Si algún select muestra `[object Object]`, el consumer update falló — arreglar el `.id` extract antes de marcar done.
</verification>

<success_criteria>
Medibles:
- [ ] `curl http://localhost:3500/api/models` devuelve JSON con shape `{models: Array<{id, display_name, provider, tier, cost_tier, supports_reasoning, max_tokens_cap, is_local}>}` — CAT-03
- [ ] Modelos en litellm pero ausentes en model_intelligence aparecen con los 7 campos enriched = null (no filtrados).
- [ ] `typeof data.models[i].supports_reasoning` ∈ `{boolean, null}` (no 0/1) para todo i.
- [ ] `typeof data.models[i].is_local` ∈ `{boolean, null}` para todo i.
- [ ] Vitest `route.test.ts` con ~9 tests verdes.
- [ ] Regresión: `alias-routing.test.ts`, `mid.test.ts`, `health.test.ts` exit 0 (zero change).
- [ ] `npm run lint && npm run build` exit 0.
- [ ] Docker rebuild exit 0, container up healthy.
- [ ] Smoke UI: `/agents/new`, `/tasks/new`, `/catbrains` no muestran `[object Object]` en selects.
- [ ] 4 consumers UI (agents/new, agents/[id], tasks/new, catbrains/config-panel) tienen comentario `// Phase 158 (v30.0): /api/models now returns Array<{id, ...}>`.
</success_criteria>

<output>
After completion, create `.planning/phases/158-model-catalog-capabilities-alias-schema/158-02-SUMMARY.md`
</output>
