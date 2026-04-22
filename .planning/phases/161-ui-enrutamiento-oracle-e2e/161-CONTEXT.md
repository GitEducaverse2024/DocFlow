# Phase 161: UI Enrutamiento + Oracle End-to-End - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Cerrar v30.0 con parity manual + programático y verificación E2E contra el stack real de LiteLLM/Discovery.

**Entrega:**
1. Tab Enrutamiento del Centro de Modelos gana 3 controles condicionales por capability del modelo:
   - Dropdown "Inteligencia" (`off|low|medium|high`) visible solo si `supports_reasoning=1`
   - Input `max_tokens` con `placeholder=max_tokens_cap` y helper "máx {cap}"
   - Input `thinking_budget` opcional (provider anthropic con reasoning) con helper "≤ max_tokens"
2. Oracle CatBot 3/3 verificado contra LiteLLM real:
   - VER-01: "¿qué modelos soporto y cuáles piensan?" → `list_llm_models` devuelve capabilities no-null
   - VER-02: "cámbiame a Opus con thinking máximo" → CatBot pide sudo → `set_catbot_llm` OK
   - VER-03: siguiente request de CatBot loguea `reasoning_tokens > 0` (evidencia en JSONL)
3. Unit test VER-04: `resolveAlias('catbot')` devuelve config completa tras PATCH via updateAlias.

**Out of scope (explícito):**
- Parsing / rendering de `reasoning_content` en UI de chat → diferido a v30.1 (FUT-03, Phase 159)
- Rename upstream de LiteLLM aliases (`claude-opus` → `anthropic/claude-opus-4-6`) → diferido a v30.1
- Admin UI para editar capabilities del catálogo → deferred desde Phase 158
- `recommend_model_for_task` tool enhancements → deferido

</domain>

<decisions>
## Implementation Decisions

### 1. Layout UI (expand-row inline)

- **Mantener la grid 4-col actual** (`Alias | Modelo | Estado | Tier`) como fila principal.
- **Añadir chevron/expand-row** al final de cada fila; click revela panel inline de controles avanzados.
- **Visibilidad condicional por capability del modelo seleccionado** (resueltas server-side en `/api/aliases`):
  - `reasoning_effort` (Select: `off|low|medium|high`): visible solo si `capabilities.supports_reasoning === true`.
  - `max_tokens` (Input numérico): siempre visible; `placeholder={max_tokens_cap ?? 'sin definir'}`, helper "máx {cap}".
  - `thinking_budget` (Input numérico): visible si `supports_reasoning === true` AND (`provider === 'anthropic'` OR existe precedente — decision operativa durante planning). Helper "≤ max_tokens".
- **Rationale:** grid de 7 columnas rompe layout mobile (actual rompe a flex-col en `<md`); popover por row sacrifica descubribilidad; el patrón de expand-row ya existe en Proveedores accordion.
- **No rediseñar la fila principal** — zero regresión visual para el contenido actual.

### 2. Data source (single endpoint extendido)

- **Extender `GET /api/aliases`** para devolver objeto enriquecido por alias con capabilities del modelo actualmente asignado:
  ```ts
  {
    alias: string;
    model_key: string;
    description: string;
    is_active: number;
    reasoning_effort: 'off'|'low'|'medium'|'high'|null;
    max_tokens: number|null;
    thinking_budget: number|null;
    capabilities: { supports_reasoning: boolean|null; max_tokens_cap: number|null; is_local: boolean|null } | null;
  }
  ```
- **JOIN server-side** con `model_intelligence` on `model_aliases.model_key = model_intelligence.model_key`.
- **Graceful degradation:** si no existe row en `model_intelligence` para el `model_key`, `capabilities = null` (mismo patrón que Phase 158-02 `/api/models`, coerce con `toBoolOrNull`).
- **UI también necesita capabilities del TARGET model** al cambiar dropdown de modelo. Resolver via `/api/models` (ya enriquecido desde 158-02, flat root). Mapa client-side `models.reduce((m, x) => m.set(x.id, x), new Map())`.
- **Rationale:** fuente única para la UI, consistente con PATCH body. Evita que el cliente tenga que componer datos de 2 endpoints para el estado inicial. PATCH sigue exactamente igual (ya soporta body extendido desde Phase 159-03).

### 3. UX validación + save (híbrido atómico/dirty)

- **`reasoning_effort` (dropdown):** auto-save on select (acción atómica, 4 valores cerrados). Reusa `applyAliasChange` pattern actual con optimistic update + toast + revert on error. PATCH body: `{alias, model_key, reasoning_effort: value}`.
- **`max_tokens` / `thinking_budget` (inputs):**
  - Permitir cualquier entrada numérica (no hard-block en typing).
  - Helper text inline: `max_tokens` → "máx {max_tokens_cap}"; `thinking_budget` → "≤ max_tokens (actual: {max_tokens})".
  - Validación visual on-blur (border-red si supera cap o thinking > max_tokens); **NO** bloquea el botón Guardar (el backend 159-03 es el validador final).
  - **Botón "Guardar" explícito** al final del panel expandido, habilitado cuando la fila está dirty. PATCH body incluye ambos valores (y reasoning_effort actual para preservarlo). Empty input → `null` (semántica CFG-02j reset de Phase 159-03, `'unchanged'` si el usuario no tocó el campo).
- **Rationale:** auto-save en cada keystroke = PATCH storm y cascading validation errors confusos. Dirty + explicit save es conservador para config que afecta coste. El dropdown es excepción justificada (acción single-click, atómica, reversible).
- **Error handling:** toast con el `error` string que devuelve el validator 159-03 (mensajes ya son descriptivos: `"max_tokens (X) exceeds model cap (Y)"`, `"thinking_budget requires max_tokens to be set"`, etc.).

### 4. Namespace mismatch: seed shortcut rows en bootstrap

- **Blocker identificado en STATE.md:** LiteLLM expone shortcuts (`claude-opus`, `claude-sonnet`, `gemini-main`, `gemma-local`) mientras `model_intelligence.model_key` contiene FQN (`anthropic/claude-opus-4-6`). Hoy `/api/models` retorna `supports_reasoning=null` para todos en producción → VER-01 oracle fallaría.
- **Decisión:** añadir bloque de seed en `app/src/lib/db.ts` bootstrap (mismo bloque v30.0) que hace `INSERT OR IGNORE + UPDATE` para los shortcuts LiteLLM con capabilities copiadas de sus FQN equivalentes:
  - `claude-opus` ← capabilities de `anthropic/claude-opus-4-6` (supports_reasoning=1, max_tokens_cap=32000, is_local=0)
  - `claude-sonnet` ← capabilities de `anthropic/claude-sonnet-4-6` (supports_reasoning=1, max_tokens_cap=64000, is_local=0)
  - `gemini-main` ← capabilities de `google/gemini-2.5-pro` (supports_reasoning=1, max_tokens_cap=65536, is_local=0)
  - `gemma-local` ← capabilities de `ollama/gemma3:4b` o `ollama/gemma3:12b` (supports_reasoning=0, max_tokens_cap=8192, is_local=1)
  - Otros shortcuts (`claude-haiku`, `gpt-4o`, etc.) — planner investiga LiteLLM config durante planning.
- **Patrón idempotente:** `INSERT OR IGNORE INTO model_intelligence (model_key, provider, tier, ...) VALUES ...` seguido de `UPDATE model_intelligence SET supports_reasoning=..., max_tokens_cap=..., is_local=... WHERE model_key=...`. Mismo bloque try/catch que Phase 158-01 ALTER + seed.
- **Rationale:**
  - Seed es canónico (Phase 158 precedent) → sobreescribe ediciones manuales = aceptado.
  - Resolver layer (consultar `model_aliases` para mapear) añade complejidad persistente + bug surface.
  - Rename upstream requiere editar `litellm config.yaml` + re-verificar 14+ callers = scope creep.
  - Graceful degradation (badge "capabilities desconocidas") → VER-01 fallaría.
- **No reemplaza** a la decisión futura de unificar namespaces (v30.1); es tactical fix para desbloquear oracle.

### 5. Oracle 3/3 format (UAT manual + logger silencioso)

- **VER-01..03: sesión UAT manual contra stack real** (Docker `docflow-app` + LiteLLM gateway 4000 con API keys válidas):
  1. Abrir CatBot chat en UI → prompt literal: "¿qué modelos soporto y cuáles piensan?" → esperar respuesta que enumere modelos con capabilities (evidencia: CatBot invoca `list_llm_models`, respuesta no tiene `capabilities: null`).
  2. Activar sudo → prompt literal: "cámbiame a Opus con thinking máximo" → esperar confirmación → aceptar → CatBot invoca `set_catbot_llm` con `model='anthropic/claude-opus-4-6', reasoning_effort='high', max_tokens=32000, thinking_budget=16000` (o similar ≤ cap).
  3. Siguiente mensaje cualquiera al CatBot (ej. "¿cuántos meses tiene un año?") → verificar en logs JSONL (`/app/data/logs/docatflow-YYYY-MM-DD.log`) la presencia de `reasoning_tokens > 0` en la entrada de `catbot-chat`.
- **Transcripts pegados en UAT** como evidencia (patrón `CLAUDE.md` "CatBot como Oráculo"). Prompts canónicos documentados en el UAT para reproducibilidad.
- **VER-03 mechanism: logger silencioso** — añadir logging en `app/src/app/api/catbot/chat/route.ts` que, al recibir la respuesta completa de LiteLLM, extrae `usage.completion_tokens_details.reasoning_tokens` (si presente) y lo loguea como `logger.info('catbot-chat', 'reasoning_usage', {reasoning_tokens, model, alias: 'catbot'})`. Esto:
  - **NO** modifica streaming behavior (Phase 159 FUT-03 intacto — reasoning_content no se renderiza).
  - **NO** parsea `reasoning_content` del delta (solo lee `usage.*` final de la respuesta).
  - Afecta ambos paths: streaming (lee trailer/final chunk) y non-streaming (lee `response.usage`).
  - Logger source `catbot-chat` (nuevo, no extender `LogSource` enum — patrón Phase 158-02).
- **VER-04: test unitario Vitest independiente** (no UAT manual):
  - File: `app/src/lib/services/__tests__/alias-routing-v30-integration.test.ts` (o similar, planner decide).
  - Scenario: seed DB tmp con alias `catbot` y modelo Opus con capabilities → llamar `updateAlias('catbot', 'anthropic/claude-opus-4-6', {reasoning_effort: 'high', max_tokens: 32000, thinking_budget: 16000})` → `await resolveAliasConfig('catbot')` → assert los 4 campos.
  - Complementar con test del mismo flow pero via HTTP PATCH (stub fetch) para parity con la ruta real UI.

### Claude's Discretion

- Icono exacto del chevron expand-row (ChevronDown / ChevronRight de lucide).
- Copy exacto de helpers (mantener tono conciso español).
- Naming del test file (sugerencia arriba es orientativa).
- Orden visual de los 3 controles dentro del panel expandido.
- Decisión de ocultar `thinking_budget` para Gemini 2.5 Pro (Anthropic-only thinking) o mostrarlo siempre que `supports_reasoning=1` — planner investiga si LiteLLM traduce thinking cross-provider.
- Valores exactos del seed shortcut para modelos no listados (claude-haiku, etc.) — investigar durante planning.
- Detalle de cómo el logger captura `reasoning_tokens` en el path streaming (parsing del final `[DONE]` chunk vs listener en el wrapper SSE).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`app/src/components/settings/model-center/tab-enrutamiento.tsx`** (358 líneas) — Grid 4-col con auto-save + optimistic update + AlertDialog para confirmación. Toda la lógica de PATCH vive en `applyModelChange` (L148-178). Extender in-place, no reescribir.
- **`app/src/app/api/aliases/route.ts`** (16 líneas) — GET minimal que llama `getAllAliases()`. Reescribir para JOIN + enrichment (flat shape consistente con `/api/models`).
- **`app/src/app/api/alias-routing/route.ts`** (130 líneas) — PATCH completo con validator Phase 159-03. **NO TOCAR** — ya soporta body extendido. UI solo necesita construir el body con campos correctos.
- **`app/src/lib/services/alias-routing.ts`** — `updateAlias(alias, key, opts?)` (L72) y `resolveAliasConfig(alias)` (L134). Consumers directos para VER-04 test.
- **`app/src/lib/db.ts`** — Bloque v30.0 schema + seed (Phase 158-01) ~L4816-4870. Añadir seed de shortcuts en el mismo bloque.
- **UI primitives ya disponibles** (`app/src/components/ui/`): `Input`, `Select`, `Label`, `Button`, `Badge`, `Tooltip`, `Collapsible`/accordion. Toda la infra shadcn lista.
- **`app/src/lib/logger.ts`** — Estructurado JSONL, source-based (`LogSource` no requiere extensión para `'catbot-chat'` per Phase 158-02 decision). Reusar.

### Established Patterns

- **Auto-save + optimistic + revert + toast** (tab-enrutamiento.tsx L148-178) → copy pattern para `reasoning_effort` dropdown.
- **ALTER + seed idempotente en bootstrap** (db.ts v30.0 block) → patrón para shortcut rows.
- **JOIN server-side con graceful null** (`/api/models` Phase 158-02) → patrón para `/api/aliases` extendido.
- **Vitest con `Database(':memory:')` o tmpfile DB** — tests Phase 159 (`stream-utils.test.ts`, `alias-routing.test.ts`) siguen este patrón.
- **`toBoolOrNull(v: number|null|undefined): boolean|null`** — helper repetido en `/api/models` y `list_llm_models` tool. Extraer a utility o copy-paste (decision planner).
- **Compound conditional spread en outgoing body** (`stream-utils.ts` Phase 159-02) → patrón para construir PATCH body con solo los campos que el usuario tocó.

### Integration Points

- **`app/src/app/api/aliases/route.ts`**: reescribir GET para incluir capabilities JOIN.
- **`app/src/components/settings/model-center/tab-enrutamiento.tsx`**: añadir panel expand-row + state dirty + handlers para 3 controles.
- **`app/messages/es.json` + `app/messages/en.json`**: i18n keys nuevas en `settings.modelCenter.enrutamiento.*` (inteligencia, maxTokens, thinkingBudget, guardar, helper texts).
- **`app/src/app/api/catbot/chat/route.ts`**: añadir 1 `logger.info` tras resolver respuesta LiteLLM (ambos paths streaming + non-streaming).
- **`app/src/lib/db.ts`**: añadir bloque de seed shortcuts al final del bloque v30.0 schema (post-158-01 UPDATE canónico).
- **`app/src/lib/services/__tests__/`**: crear test file VER-04 + extender test de `/api/aliases` para shape enriquecida + extender test de `catbot/chat/route.test.ts` para asserting del logger call.

</code_context>

<specifics>
## Specific Ideas

- **CLAUDE.md "CatBot como Oráculo" es hard requirement**, no nice-to-have: la evidencia de VER-01..03 tiene que ser transcripts CatBot reales, no mocks ni scripts. El logger silencioso es el mecanismo de captura, no el sustituto.
- **Docker rebuild obligatorio** tras este phase — `db.ts` bootstrap corre al startup, seed de shortcuts necesita `docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app` (memoria `feedback_docker_restart.md`).
- **Mensajes en español** en UI (memoria `feedback_language.md`).
- **`process['env']`** bracket notation si se lee cualquier env var (memoria `process.env`).
- **Cero regresión como filtro duro**: el tab Enrutamiento tiene que funcionar byte-idéntico para users que no abran ningún panel expand. El PATCH legacy `{alias, model_key}` sigue funcionando (Phase 159-03 validator lo preserva).
- **Playwright E2E opcional** — si resulta rápido añadir un spec que abre el tab, cambia alias, expande panel, cambia reasoning_effort y verifica que el valor persiste tras recarga, vale la pena. Si planner estima > 2 tasks incluirlo, deferir a v30.1.
- **Unit test de logger** (VER-03 infrastructure) — verificar que `logger.info('catbot-chat', 'reasoning_usage', ...)` se llama cuando la respuesta mockeada de LiteLLM incluye `usage.completion_tokens_details.reasoning_tokens`. Patrón `makeFetchMockCapture` (Phase 159-02) reutilizable.

</specifics>

<deferred>
## Deferred Ideas

- **Rendering de reasoning_content en UI de chat** (badge, tooltip, disclosure) → FUT-03, v30.1.
- **Rename upstream LiteLLM aliases (`claude-opus` → FQN)** → v30.1 coordinado con config.yaml del gateway.
- **Admin UI para editar capabilities** de `model_intelligence` desde el frontend → v30.1 si hay demanda (deferred desde Phase 158).
- **`recommend_model_for_task` enhancements** (razonamiento sobre capabilities, no solo tier) → v30.1.
- **Test E2E Playwright del tab completo** con cambio de modelo + expand + save + reload → v30.1 si no cabe en scope.
- **Metric/chart de `reasoning_tokens` en dashboard `/testing`** → v30.1 una vez el logger haya acumulado datos.
- **UI de reset per-field** (botón X para setear a null sin borrar el input) → v30.1 UX polish.
- **Auto-detect capabilities desde LiteLLM** (en vez de seed manual) → v30.1+ cuando LiteLLM exponga capabilities metadata estable.
- **Validación client-side más estricta** (block typing > cap) → solo si feedback post-release lo requiere.

</deferred>

---

*Phase: 161-ui-enrutamiento-oracle-e2e*
*Context gathered: 2026-04-22*
