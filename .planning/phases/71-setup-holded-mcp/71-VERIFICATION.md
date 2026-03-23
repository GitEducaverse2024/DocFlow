---
phase: 71-setup-holded-mcp
verified: 2026-03-23T09:52:50Z
status: human_needed
score: 8/8 must-haves verified
re_verification: false
gaps:
  - truth: "Systemd service EnvironmentFile points to a real .env path"
    status: resolved
    reason: "Fixed: EnvironmentFile now points to %h/docflow/.env (commit ca311a4)"

  - truth: "HOLDED_MCP_URL is configured in the environment"
    status: resolved
    reason: "Fixed: HOLDED_MCP_URL=http://192.168.1.49:8766/mcp added to ~/docflow/.env (commit ca311a4)"
human_verification:
  - test: "Run bash scripts/holded-mcp/setup.sh and check that the service starts"
    expected: "systemctl --user status holded-mcp.service shows active (running)"
    why_human: "Runtime systemd service activation cannot be verified programmatically — REQUIREMENTS.md SETUP-03 has this as the only unchecked item"
  - test: "Open /system page and verify Holded MCP card appears and shows status"
    expected: "Card visible when HOLDED_MCP_URL is configured, shows status dot and latency"
    why_human: "UI rendering and health poll behavior require a running browser session"
  - test: "Open /connectors and verify seed-holded-mcp connector appears as inactive"
    expected: "Connector 'Holded MCP' visible with is_active=false toggle"
    why_human: "DB seed on first run is a one-time operation — verifiable only against a live DB or by inspection at runtime"
---

# Phase 71: Setup Holded MCP Verification Report

**Phase Goal:** Fork iamsamuelfraga/mcp-holded, rebrand to DoCatFlow, strip multi-tenant, add HTTP transport, create systemd service, integrate into DoCatFlow UI (health check, system panel, footer, CatBot knowledge).
**Verified:** 2026-03-23T09:52:50Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Repo exists at ~/holded-mcp/ rebranded as @docatflow/holded-mcp | VERIFIED | `package.json` name=`@docatflow/holded-mcp`, version=`1.0.0`, no attribution files |
| 2 | Multi-tenant modules removed, single API key from env | VERIFIED | `tenant-config.ts` and `tenant-context.ts` deleted; no tenant imports in non-test src files; `process['env']['HOLDED_API_KEY']` used directly |
| 3 | HTTP transport available on /mcp port 8766 with stdio fallback | VERIFIED | `src/index.ts` has `StreamableHTTPServerTransport` on `/mcp`, express on `0.0.0.0:8766`, stdio fallback when PORT not set |
| 4 | holded-client.ts has 150ms rate limiting, API key masking, module URLs | VERIFIED | `MIN_DELAY_MS=150`, `maskKey()`, `MODULE_BASE_URLS` record, `HoldedModule` type exported, `module?` param on all HTTP methods |
| 5 | Systemd service template and installer script exist | VERIFIED | `scripts/holded-mcp/holded-mcp.service` exists with correct structure; `scripts/holded-mcp/setup.sh` is executable with valid syntax; `scripts/holded-mcp/README.md` exists |
| 6 | Systemd service EnvironmentFile points to a real path | VERIFIED | Fixed: `EnvironmentFile=%h/docflow/.env` (commit ca311a4) |
| 7 | DoCatFlow UI integrations wired (seed, health check, panel, footer, CatBot) | VERIFIED | All 6 targeted files modified: `db.ts` seed, `use-system-health.ts` types, `health/route.ts` check, `system-health-panel.tsx` card, `footer.tsx` dot, `catbot-tools.ts` knowledge entry |
| 8 | HOLDED_MCP_URL configured in environment | VERIFIED | `HOLDED_MCP_URL=http://192.168.1.49:8766/mcp` added to `~/docflow/.env` (commit ca311a4) |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `~/holded-mcp/package.json` | name=@docatflow/holded-mcp, express dep | VERIFIED | name, version, express all correct; no author/repo fields |
| `~/holded-mcp/src/index.ts` | HTTP transport + stdio fallback | VERIFIED | StreamableHTTPServerTransport on /mcp; PORT-conditional logic; express |
| `~/holded-mcp/src/holded-client.ts` | Rate limit, key mask, module URLs | VERIFIED | All three features implemented; backward-compatible |
| `~/holded-mcp/dist/index.js` | Build artifact exists | VERIFIED | File exists; includes HTTP transport references |
| `scripts/holded-mcp/holded-mcp.service` | Systemd template with placeholders | PARTIAL | Placeholders {INSTALL_DIR}, {PORT} correct; ExecStart correct; EnvironmentFile path broken (points to non-existent app/.env) |
| `scripts/holded-mcp/setup.sh` | Executable, valid syntax, Node>=22 check | VERIFIED | Executable bit set; bash -n passes; Node>=22 check present; HOLDED_API_KEY check present |
| `scripts/holded-mcp/README.md` | Installation instructions | VERIFIED | Exists with requisitos, instalacion, gestion commands |
| `app/src/lib/db.ts` | Holded MCP connector seed | VERIFIED | seed-holded-mcp inserted with is_active=0, 6 tools, bracket notation env var |
| `app/src/hooks/use-system-health.ts` | HoldedMcpStatus interface + field in SystemHealth | VERIFIED | HoldedMcpStatus interface and holded_mcp? field both present |
| `app/src/app/api/health/route.ts` | Holded MCP health check | VERIFIED | holdedMcpUrl read, 8th element in Promise.allSettled, POST initialize, conditional spread in response |
| `app/src/components/system/system-health-panel.tsx` | Holded MCP card | VERIFIED | Card present, conditional on health.holded_mcp?.configured, shows status/latency/port 8766 |
| `app/src/components/layout/footer.tsx` | Holded MCP dot | VERIFIED | Spread conditional on health.holded_mcp?.configured |
| `app/src/lib/services/catbot-tools.ts` | 'holded' entry in FEATURE_KNOWLEDGE | VERIFIED | Entry present at line 278 with full description |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `index.ts` | express `/mcp` | `StreamableHTTPServerTransport` | WIRED | connect + handleRequest called |
| `index.ts` | `HoldedClient` | `process['env']['HOLDED_API_KEY']` | WIRED | Single key passed to constructor |
| `holded-client.ts` | Holded API | `MODULE_BASE_URLS[module]` | WIRED | Module param optional, defaults to BASE_URL |
| `health/route.ts` | Holded MCP service | `HOLDED_MCP_URL` env var | PARTIAL | Code wired correctly; env var not set in .env — health check will not fire |
| `system-health-panel.tsx` | `health.holded_mcp` | `use-system-health.ts` types | WIRED | Types defined, component references them |
| `footer.tsx` | `health.holded_mcp` | conditional spread | WIRED | Pattern matches LinkedIn MCP reference |
| `setup.sh` | `holded-mcp.service` | sed substitution | WIRED | sed replaces {INSTALL_DIR} and {PORT} correctly |
| `holded-mcp.service` | `~/docflow/.env` | `EnvironmentFile` | NOT_WIRED | Points to `%h/docflow/app/.env` which does not exist |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SETUP-01 | 71-01-PLAN.md | Fork + adapt repo | SATISFIED | Repo at ~/holded-mcp/, rebranded, multi-tenant removed, build passes |
| SETUP-02 | 71-02-PLAN.md | HTTP client rate limiting + retry | SATISFIED | 150ms delay, key masking, module URLs, HoldedModule exported |
| SETUP-03 | 71-03-PLAN.md | Systemd service + installer | PARTIAL | Service template and setup.sh exist; EnvironmentFile path broken; service not yet installed/running (expected — requires manual run) |
| SETUP-04 | 71-04-PLAN.md | Seed + health check + DoCatFlow UI | PARTIAL | All code integrated; HOLDED_MCP_URL missing from .env so UI integrations remain inactive |

**Note on SETUP-03 path discrepancy:** REQUIREMENTS.md references `scripts/setup-holded-mcp.sh` but the actual file is `scripts/holded-mcp/setup.sh`. The file exists and works; only the path in REQUIREMENTS.md differs from the plan's implementation. This is a documentation inconsistency, not a functional gap.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/holded-mcp/holded-mcp.service` | 11 | `EnvironmentFile=%h/docflow/app/.env` — path does not exist | Blocker | Service will fail to load `HOLDED_API_KEY` when installed; server will exit immediately at startup |
| `scripts/holded-mcp/setup.sh` | 29 | Clones raw upstream repo when `~/holded-mcp/` does not exist, applies no patches | Warning | Fresh install from scratch would produce unmodified upstream code, not the DoCatFlow-adapted version. Only safe if `~/holded-mcp/` already exists. |

---

### Human Verification Required

#### 1. Systemd Service Activation

**Test:** Run `bash scripts/holded-mcp/setup.sh` (after fixing EnvironmentFile path) and check service status
**Expected:** `systemctl --user status holded-mcp.service` shows `active (running)`; `journalctl --user -u holded-mcp -n 5` shows "[holded-mcp] Servidor HTTP activo en http://0.0.0.0:8766/mcp"
**Why human:** Runtime systemd service activation — REQUIREMENTS.md SETUP-03 has this as the one unchecked item

#### 2. Holded MCP Health Panel Card

**Test:** Add `HOLDED_MCP_URL=http://192.168.1.49:8766/mcp` to `~/docflow/.env`, restart the DoCatFlow app, open `/system`
**Expected:** A "Holded MCP" card appears showing status dot and latency; footer shows a Holded MCP status dot
**Why human:** UI rendering and live health poll require a running browser session with the MCP service active

#### 3. Connector Seed Visible in /connectors

**Test:** Open `/connectors` in DoCatFlow
**Expected:** "Holded MCP" connector appears as inactive (toggle off)
**Why human:** DB seed fires on first app start after the code change — only verifiable against a live DB

---

### Gaps Summary

Two functional gaps block full goal achievement:

**Gap 1 — Broken EnvironmentFile path in systemd service (Blocker)**

`scripts/holded-mcp/holded-mcp.service` has `EnvironmentFile=%h/docflow/app/.env`. The directory `~/docflow/app/` contains the Next.js source code but no `.env` file — the project's actual `.env` is at `~/docflow/.env` (root level, used by `docker-compose`). When `setup.sh` installs and starts the service, systemd will fail to load `HOLDED_API_KEY` and the server will exit at line 28 of `index.ts` ("HOLDED_API_KEY environment variable is required"). Fix: change `EnvironmentFile` to `%h/docflow/.env`.

**Gap 2 — HOLDED_MCP_URL not added to .env (Missing configuration)**

REQUIREMENTS.md SETUP-04 marks `[x] Variable HOLDED_MCP_URL en .env` as done, but the variable is absent from `~/docflow/.env`. `HOLDED_API_KEY` is present. Without `HOLDED_MCP_URL`, the health check in `api/health/route.ts` returns no holded_mcp field, the system panel card remains invisible, and the footer dot never appears. The code integration is complete — this is purely a missing environment variable. Fix: add `HOLDED_MCP_URL=http://<SERVER_IP>:8766/mcp` to `~/docflow/.env`.

These two gaps are independent. Gap 1 must be fixed before the service can run. Gap 2 must be fixed before the UI integration is visible.

---

_Verified: 2026-03-23T09:52:50Z_
_Verifier: Claude (gsd-verifier)_
