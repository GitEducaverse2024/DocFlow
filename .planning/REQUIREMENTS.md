# Requirements: DocFlow — Milestone v30.0 LLM Self-Service para CatBot

**Defined:** 2026-04-21
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base that users can query via natural language chat.
**Milestone Goal:** CatBot puede consultar qué modelos LLM hay disponibles, qué capacidades tienen (extended thinking, max tokens, tier free/paid), recomendar el mejor para una tarea, y cambiar su propio LLM bajo instrucción del usuario con sudo. El control manual (UI Enrutamiento) y programático (tools) usan la misma infraestructura.

**Previous milestone (v29.1):** archived to `.planning/milestones/v29.0-REQUIREMENTS.md`.

## v30.0 Requirements

### Catálogo de modelos (CAT)

- [ ] **CAT-01**: El sistema expone `supports_reasoning` (bool), `max_tokens_cap` (int), `tier` (paid/local) por cada modelo en `model_intelligence`
- [ ] **CAT-02**: Seed marca Claude Opus/Sonnet 4.6 + Gemini 2.5 Pro como `supports_reasoning=true`; Ollama/Gemma marca `tier=local`
- [ ] **CAT-03**: Endpoint `GET /api/models` devuelve capabilities + tier en cada entry

### Config per-alias (CFG)

- [ ] **CFG-01**: `model_aliases` acepta `reasoning_effort` (`off|low|medium|high`), `max_tokens` (int), `thinking_budget` (int)
- [ ] **CFG-02**: `PATCH /api/alias-routing` valida y persiste los tres campos nuevos
- [ ] **CFG-03**: `resolveAlias(alias)` devuelve objeto `{model, reasoning_effort, max_tokens, thinking_budget}`

### Passthrough backend (PASS)

- [ ] **PASS-01**: `streamLiteLLM` acepta `reasoning_effort` y lo envía al body de `/v1/chat/completions`
- [ ] **PASS-02**: `streamLiteLLM` acepta `thinking: {budget_tokens}` y lo envía al body (max potential)
- [ ] **PASS-03**: `max_tokens` efectivo se toma del alias config si está definido, con fallback a default
- [ ] **PASS-04**: CatBot chat route pasa al `streamLiteLLM` los params resueltos por `resolveAlias('catbot')`

### CatBot tools (TOOL)

- [ ] **TOOL-01**: CatBot tool `list_llm_models` devuelve lista de modelos con capabilities y tier
- [ ] **TOOL-02**: CatBot tool `get_catbot_llm` devuelve config actual del alias `catbot`
- [ ] **TOOL-03**: CatBot tool `set_catbot_llm({model, reasoning_effort?, max_tokens?, thinking_budget?})` cambia config, requiere sudo activo, valida capabilities del modelo target
- [ ] **TOOL-04**: Skill KB "Operador de Modelos" instruye a CatBot a recomendar modelo según tarea (free/paid, razonamiento sí/no)

### UI manual (UI)

- [ ] **UI-01**: Tab Enrutamiento muestra dropdown "Inteligencia" (off/low/medium/high) solo para modelos con `supports_reasoning=true`
- [ ] **UI-02**: Tab Enrutamiento muestra input `max_tokens` con cap del modelo seleccionado (placeholder=cap, validación ≤cap)
- [ ] **UI-03**: Tab Enrutamiento muestra input opcional `thinking_budget` para modelos con thinking (≤max_tokens)

### Verificación end-to-end (VER)

- [ ] **VER-01**: Oracle 1 — "¿qué modelos soporto y cuáles piensan?" → CatBot enumera con capabilities (llama `list_llm_models`)
- [ ] **VER-02**: Oracle 2 — "cámbiame a Opus con thinking al máximo" → CatBot pide sudo, ejecuta `set_catbot_llm` con `reasoning_effort=high` o `thinking_budget=32000`
- [ ] **VER-03**: Oracle 3 — siguiente request de CatBot usa reasoning (response incluye `reasoning_content` no-null + metric `reasoning_tokens>0`)
- [ ] **VER-04**: Test unitario: `resolveAlias('catbot')` devuelve config completa tras PATCH via UI

## v2 Requirements (deferidos)

### Reasoning en todos los alias no-CatBot (v30.1)

- **FUT-01**: Aliases `chat-rag`, `canvas-agent`, `canvas-writer` aprovechan `reasoning_effort` cuando aplique
- **FUT-02**: UI para editar reasoning en estos alias

### UI para reasoning_content

- **FUT-03**: Chat CatBot muestra sección colapsable "pensando..." con el `reasoning_content` del LLM
- **FUT-04**: Logs de reasoning tokens visibles en dashboard

## Out of Scope

| Feature | Razón |
|---------|-------|
| Cambio de API keys de proveedores desde CatBot | Seguridad — API keys solo via Settings UI con sudo del navegador |
| Thinking budget dinámico por request (auto-escala con complejidad) | Premature optimization — tier fijo por alias es suficiente para v30.0 |
| Costing forecast del thinking (cuánto costaría Opus+high) | v30.1 cuando tengamos 30 días de datos reales |
| Reasoning en LLMs Ollama/local | Gemma no soporta reasoning nativo; no hay gateway passthrough útil |
| Persistir reasoning_content en catbot.db | v30.1 si hay demanda — por ahora solo log |
| A/B testing entre modelos | No hay uso de este patrón en DocFlow, fuera de alcance |
| CatBot cambia modelos de OTROS alias (chat-rag, canvas) | v30.0 solo self-service para el propio alias `catbot` |

## Traceability

Empty — se rellena al crear ROADMAP.md.

**Coverage:**
- v30.0 requirements: 21 total
- Mapped to phases: 0 (pendiente roadmap)
- Unmapped: 21 ⚠️

---
*Requirements defined: 2026-04-21*
*Last updated: 2026-04-21 after initial definition*
