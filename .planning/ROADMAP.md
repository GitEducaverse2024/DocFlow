# Roadmap: DoCatFlow v11.0 — LinkedIn MCP Connector

**Milestone:** v11.0
**Phases:** 1 (phase 47, single-phase milestone)
**Requirements:** 7 total
**Coverage:** 7/7
**Started:** 2026-03-15

---

## Phases

- [x] **Phase 47: LinkedIn MCP Connector** - Scripts de instalacion, rate limiter, seed BD, health monitoring, CatBot awareness (completed 2026-03-15)

---

## Phase Details

### Phase 47: LinkedIn MCP Connector
**Goal**: El LinkedIn MCP Connector esta integrado como servicio nativo de DoCatFlow — con scripts de instalacion, rate limiting, seed en BD, health check, monitoring en /system y footer, y CatBot informado de su existencia.
**Depends on**: v10.0 complete (infraestructura base)
**Requirements**: LI-MCP-01, LI-MCP-02, LI-MCP-03, LI-MCP-04, LI-MCP-05, LI-MCP-06, LI-HOTFIX-01
**Success Criteria** (what must be TRUE when phase completes):
  1. `scripts/linkedin-mcp/` contiene setup.sh, servicio systemd, rate_limiter.py, README.md — setup.sh aplica rebrand completo
  2. rate_limiter.py tiene limites para 7 tools con delay aleatorio 5-12s y estado persistido en JSON
  3. db.ts tiene seed `seed-linkedin-mcp` en tabla connectors con tipo mcp_server y 6 tools descritas
  4. `/api/health` incluye `linkedin_mcp` con status/latency/configured
  5. `/system` muestra tarjeta LinkedIn MCP cuando LINKEDIN_MCP_URL esta configurado
  6. Footer tiene dot de LinkedIn MCP
  7. CatBot conoce LinkedIn MCP via FEATURE_KNOWLEDGE y system prompt condicional
  8. `npm run build` pasa sin errores
**Plans**: 1 plan
Plans:
- [x] 47-01-PLAN.md — Hotfix + scripts + seed + health + monitoring + CatBot

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 47. LinkedIn MCP Connector | 1/1 | Complete | 2026-03-15 |

---

## Dependency Chain

```
Phase 47 (LinkedIn MCP Connector) — standalone, no dependencies
```

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| LI-MCP-01 | 47 |
| LI-MCP-02 | 47 |
| LI-MCP-03 | 47 |
| LI-MCP-04 | 47 |
| LI-MCP-05 | 47 |
| LI-MCP-06 | 47 |
| LI-HOTFIX-01 | 47 |

**Mapped: 7/7 — 100% coverage**

---

## Technical Notes (for plan-phase)

### Key patterns
- Servicio systemd del usuario (como openclaw-gateway, docatflow-host-agent)
- Puerto 8765, transport streamable-http, endpoint /mcp
- Rate limiter Python standalone, estado en ~/.docatflow-linkedin-mcp/rate_state.json
- Conector tipo mcp_server en tabla connectors (seed INSERT OR IGNORE)
- Health check via POST JSON-RPC initialize
- Variable LINKEDIN_MCP_URL con bracket notation

### Critical constraints
- All env vars: `process['env']['VARIABLE']` bracket notation
- All UI text in Spanish
- All API routes: `export const dynamic = 'force-dynamic'`
- Colors: Primary mauve (#8B6D8B), accent violet-500/600, bg zinc-950
- Footer dot condicional: solo si LINKEDIN_MCP_URL configurado

---
*Roadmap created: 2026-03-15*
*Milestone: v11.0 — LinkedIn MCP Connector*
