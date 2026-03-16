---
gsd_state_version: 1.0
milestone: v12.0
milestone_name: WebSearch CatBrain
status: active
last_updated: "2026-03-16T17:59:30Z"
last_activity: 2026-03-16 — Completed 48-01 SearXNG Docker + seeds + env vars
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 3
  completed_plans: 3
---

# Project State

## Current Position

Phase: 48 — Infraestructura WebSearch (in progress)
Plan: 03
Status: Plans 48-01 and 48-02 complete, next is 48-03
Last activity: 2026-03-16 — Completed 48-01 SearXNG Docker + seeds + env vars

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-16)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.
**Current focus:** v12.0 WebSearch CatBrain — busqueda web reutilizable via SearXNG + Gemini + CatBrain especial

## Milestone History

### v1.0 — Fix RAG Chat + Mejoras de indexacion (COMPLETE)
- 2 phases, 14 requirements, all complete

### v2.0 — Sistema de Tareas Multi-Agente (COMPLETE)
- 6 phases, 48 requirements, all complete
- Data model, API CRUD, execution engine, task list, wizard, execution view

### v3.0 — Conectores + Dashboard de Operaciones (COMPLETE)
- 6 phases (9-14), 48 requirements, all complete

### v4.0 — Rebranding + CatBot + MCP Bridge + UX Polish (COMPLETE)
- 8 phases (15-22), 52 requirements, all complete

### v5.0 — Canvas Visual de Workflows (COMPLETE)
- 4 phases (23-26), 52 requirements, all complete

### v6.0 — Testing Inteligente + Performance + Estabilizacion (PARTIAL)
- 5 phases allocated (27-31), phase 27 complete (resilience foundations)
- Phases 28-31 superseded by v7.0 detailed spec

### v7.0 — Streaming + Testing + Logging + Notificaciones (COMPLETE)
- 6 phases (32-37), 53 requirements, all complete

### v8.0 — CatBot Diagnosticador + Base de Conocimiento (COMPLETE)
- 1 phase (38), 15 requirements, all complete

### v9.0 — CatBrains (COMPLETE)
- 3 phases (39-41), 23 requirements, all complete

### v10.0 — CatPaw: Unificacion de Agentes (COMPLETE)
- 6 phases (42-47), 50 requirements, all complete

### v11.0 — LinkedIn MCP Connector (COMPLETE)
- 1 phase (47), 7 requirements, all complete

## Decisions

- [48-02] Used withRetry actual API (maxAttempts/baseDelayMs) instead of plan shorthand (retries/delay)
- [48-02] Added 'websearch' to LogSource union for structured logging support
- [48-01] .env is gitignored; SEARXNG env vars documented locally but not committed
- [48-01] gemini-search LiteLLM alias documented as comment in .env (external config required)

## Accumulated Context

### v12.0 — Key patterns for WebSearch
- SearXNG: metabuscador open source, imagen Docker searxng/searxng:latest, puerto 8080
- SearXNG requiere settings.yml con `formats: [html, json]` para activar JSON API
- Gemini grounding: tools [{"googleSearch": {}}] en llamada LiteLLM, solo modelos Gemini
- Ollama Web Search API: endpoint externo https://ollama.com/api/web_search con API key
- CatBrain is_system: 1 para proteger de eliminacion accidental
- Endpoint /api/websearch/search orquesta multi-motor con fallback auto
- Phase 48: infrastructure only (Docker, seeds, health, env vars)
- Phase 49: CatBrain + API + service + Canvas/Tasks + UI + tests + docs

### Existing patterns (inherited)
- Sidebar items: Dashboard, CatBrains, CatPaw, Skills, Tareas, Canvas, Conectores, Notificaciones, [Testing], Configuracion, Estado del Sistema
- crypto.randomUUID NOT available in HTTP — use generateId() helper
- DB pattern: CREATE TABLE IF NOT EXISTS + ALTER TABLE try-catch
- process.env: use bracket notation process['env']['VAR']
- Colors: Primary mauve (#8B6D8B), accent violet-500/600, bg zinc-950
- withRetry for all external service calls
- In-memory TTL cache (Map-based)
- Servicio systemd en host: como Host Agent (3501), OpenClaw (18789), LinkedIn MCP (8765)
- Condicionalidad: tarjetas /system y footer dots solo si variable de entorno configurada
