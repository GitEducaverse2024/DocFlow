# Phase 71: Setup + Base del Servidor - Research

**Researched:** 2026-03-23
**Domain:** MCP server fork/adaptation, Holded ERP API integration, systemd service, DoCatFlow connector pattern
**Confidence:** HIGH

## Summary

Phase 71 establishes the Holded MCP server by forking `iamsamuelfraga/mcp-holded` (MIT, TypeScript, Node 22+, `@modelcontextprotocol/sdk`), adapting it to the DoCatFlow pattern established by the LinkedIn MCP connector (phase 47), and running it as a systemd user service on port 8766.

The base repo already provides 72 invoicing tools, a typed HTTP client with retry/backoff, rate limiting per tool, and multi-tenant support. It uses **stdio transport only** -- the critical adaptation is adding `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` so DoCatFlow can reach it over HTTP (like LinkedIn MCP on port 8765). The Holded API authenticates via a `key` header with an API key, base URL `https://api.holded.com/api/`, with different versioned modules (invoicing/v1, crm/v1, projects/v1, team/v1).

**Primary recommendation:** Clone the repo to `~/holded-mcp/`, strip multi-tenant complexity (single tenant via `HOLDED_API_KEY`), add streamable-http transport on port 8766, adapt the HTTP client to enforce 150ms minimum delay between requests and mask the API key in logs, then install as a systemd user service following the exact LinkedIn MCP pattern.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SETUP-01 | Fork y adaptacion del repo | Base repo analysis: structure, dependencies, transport gap identified |
| SETUP-02 | Cliente HTTP con rate limiting y retry | Existing holded-client.ts has retry+backoff; needs 150ms delay + log masking |
| SETUP-03 | Servicio systemd + script de instalacion | LinkedIn MCP pattern fully documented (setup.sh + .service template) |
| SETUP-04 | Seed conector + health check en DoCatFlow | LinkedIn connector seed, health route, footer, system panel all analyzed |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.0.0 | MCP server framework | Already used by base repo; provides StdioServerTransport + StreamableHTTPServerTransport |
| node-fetch | ^3.3.2 | HTTP client for Holded API | Already used by base repo |
| zod | ^4.3.6 | Input validation | Already used by base repo for tool schemas |
| typescript | (devDep) | Language | Base repo is 96% TypeScript |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| express | ^4.x | HTTP server for streamable-http transport | Needed to expose MCP over HTTP on port 8766 |
| form-data | ^4.0.5 | File uploads to Holded | Already in base repo deps |

### Not Needed (strip from fork)
| Library | Why Remove |
|---------|------------|
| husky | Git hooks not needed for internal fork |
| semantic-release | Not publishing to npm |
| eslint/prettier | Use project conventions instead |
| Multi-tenant utils | Single tenant only (one HOLDED_API_KEY) |

**Installation (in ~/holded-mcp/):**
```bash
npm install
npm run build
```

## Architecture Patterns

### Base Repo Structure (as-is)
```
src/
  index.ts              # MCP server entry, tool registration, stdio transport
  holded-client.ts      # HTTP client: auth, retry, backoff
  validation.ts         # Zod-based input validation
  tools/                # 13 tool modules (documents, contacts, products, etc.)
    contacts.ts
    documents.ts
    products.ts
    treasuries.ts
    expenses-accounts.ts
    numbering-series.ts
    sales-channels.ts
    payments.ts
    taxes.ts
    contact-groups.ts
    remittances.ts
    services.ts
    warehouses.ts
  utils/
    rate-limiter.ts     # Per-tool rate limiting
    tenant-config.ts    # Multi-tenant config (STRIP)
    tenant-context.ts   # Multi-tenant context (STRIP)
  __tests__/            # Vitest tests
```

### Adapted Structure (target for DoCatFlow)
```
~/holded-mcp/
  src/
    index.ts              # Simplified: single tenant, dual transport (stdio + HTTP)
    holded-client.ts      # Enhanced: 150ms delay, key masking in logs
    validation.ts         # Keep as-is
    tools/                # Keep existing 13 modules + add CRM/Projects/Team later (phases 72-75)
    utils/
      rate-limiter.ts     # Keep: per-tool rate limiting
  package.json            # Renamed @docatflow/holded-mcp v1.0.0
  tsconfig.json           # Keep
```

### Pattern 1: Tool Factory (existing)
**What:** Each tool module exports a `getXxxTools(client)` function returning an object of tool definitions.
**When to use:** All Holded tool modules follow this pattern.
**Example:**
```typescript
// Source: github.com/iamsamuelfraga/mcp-holded/src/tools/contacts.ts
export function getContactTools(client: HoldedClient) {
  return {
    list_contacts: {
      description: 'List all contacts with optional filters',
      inputSchema: { type: 'object', properties: { ... }, required: [] },
      readOnlyHint: true,
      handler: async (args) => { /* client.get('/contacts', params) */ }
    },
    // ...more tools
  };
}
```

### Pattern 2: Streamable HTTP Transport (adaptation needed)
**What:** Replace stdio-only with HTTP transport so DoCatFlow can reach the MCP server over the network.
**When to use:** Required for systemd service accessible by Docker containers.
**Example:**
```typescript
// Adaptation: add to index.ts
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

const app = express();
app.use(express.json());

app.all('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

const PORT = parseInt(process.env.PORT || '8766');
app.listen(PORT, '0.0.0.0', () => {
  console.error(`Holded MCP Server running on http://0.0.0.0:${PORT}/mcp`);
});
```

### Pattern 3: DoCatFlow Connector Seed (from LinkedIn MCP)
**What:** Conditional INSERT in db.ts to register the MCP connector.
**When to use:** On app startup, if connector doesn't exist yet.
**Example:**
```typescript
// Source: docflow/app/src/lib/db.ts lines 1304-1343
// Seed Holded MCP connector if not exists
try {
  const holdedConnectorExists = (db.prepare(
    "SELECT COUNT(*) as c FROM connectors WHERE id = 'seed-holded-mcp'"
  ).get() as { c: number }).c;

  if (holdedConnectorExists === 0) {
    const holdedMcpUrl = process['env']['HOLDED_MCP_URL'] || 'http://localhost:8766/mcp';
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO connectors (id, name, type, config, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      'seed-holded-mcp',
      'Holded MCP',
      'mcp_server',
      JSON.stringify({
        url: holdedMcpUrl,
        timeout: 30000,
        tools: [
          // Initial tools from invoicing module
          { name: 'list_contacts', description: 'Lista contactos de Holded con filtros opcionales' },
          { name: 'list_documents', description: 'Lista documentos (facturas, presupuestos, etc.)' },
          // ... more as modules are added in phases 72-75
        ],
      }),
      'Conector MCP para Holded ERP/CRM. Modulos: facturacion, CRM, proyectos, equipo.',
      now, now
    );
    logger.info('system', 'Seeded Holded MCP connector (seed-holded-mcp)');
  }
} catch (e) { logger.error('system', 'Seed Holded MCP connector error', { error: (e as Error).message }); }
```

### Anti-Patterns to Avoid
- **process.env.VARIABLE:** Use `process['env']['VARIABLE']` (DoCatFlow convention to bypass webpack inlining)
- **Keeping multi-tenant complexity:** Strip `tenant-config.ts`, `tenant-context.ts`, and tenant-related logic from `index.ts`. Single API key via `HOLDED_API_KEY`.
- **Hardcoding paths:** Use `os.homedir()` for `~/holded-mcp/` references in scripts
- **Logging the API key:** The `key` header MUST be masked in all request logs

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP server protocol | Custom JSON-RPC | `@modelcontextprotocol/sdk` Server + transports | Protocol complexity, spec compliance |
| HTTP retry with backoff | Custom retry loop | Existing `holded-client.ts` retry logic | Already handles 429, 5xx, exponential delays |
| Rate limiting | Custom counters | Existing `rate-limiter.ts` | Per-tool limits, window-based, already tested |
| Zod validation | Manual param checking | Existing `validation.ts` + `withValidation` | Type-safe, consistent error messages |
| systemd service template | Manual service file | Adapt LinkedIn MCP `.service` template | Proven pattern with correct user paths |

**Key insight:** The base repo already solves the hard problems (MCP protocol, API client, rate limiting, validation). The adaptation work is primarily: remove multi-tenant, add HTTP transport, enforce DoCatFlow conventions.

## Common Pitfalls

### Pitfall 1: Stdio-only Transport
**What goes wrong:** The base repo only supports stdio transport. DoCatFlow runs in Docker and needs HTTP access.
**Why it happens:** mcp-holded was designed for Claude Desktop (stdio), not network services.
**How to avoid:** Add `StreamableHTTPServerTransport` with express. Keep stdio as fallback for local testing.
**Warning signs:** Server starts but DoCatFlow cannot reach it.

### Pitfall 2: API Key in Logs
**What goes wrong:** The `key` header leaks into request/response logs.
**Why it happens:** Default HTTP client logging may include all headers.
**How to avoid:** Modify `holded-client.ts` to explicitly omit the `key` header from any logging. Truncate response bodies to 500 chars.
**Warning signs:** Grep logs for the actual API key value.

### Pitfall 3: Holded API Module Base URLs
**What goes wrong:** Using invoicing base URL for CRM/Projects/Team endpoints.
**Why it happens:** Base repo only covers invoicing (`/api/invoicing/v1/`). Other modules use different paths.
**How to avoid:** Make base URL configurable per module:
- Invoicing: `https://api.holded.com/api/invoicing/v1/`
- CRM: `https://api.holded.com/api/crm/v1/`
- Projects: `https://api.holded.com/api/projects/v1/`
- Team: `https://api.holded.com/api/team/v1/`
**Warning signs:** 404 errors when calling CRM endpoints.

### Pitfall 4: Node Version Mismatch
**What goes wrong:** Build fails or runtime errors.
**Why it happens:** Base repo requires Node >= 22.14.0. Host (server-ia) runs Node 22.
**How to avoid:** Verify `node --version` in setup script. The host already has Node 22 so this should be fine.
**Warning signs:** Engine compatibility errors during `npm install`.

### Pitfall 5: EnvironmentFile Path
**What goes wrong:** Systemd service cannot read `HOLDED_API_KEY`.
**Why it happens:** Unlike LinkedIn MCP which sets environment directly, Holded needs the key from DoCatFlow's `.env`.
**How to avoid:** Use `EnvironmentFile=%h/docflow/app/.env` in the systemd service (or wherever the .env is on host). Verify the key exists.
**Warning signs:** Service starts but all API calls return auth errors.

### Pitfall 6: is_active Default for Connector Seed
**What goes wrong:** Connector auto-activates before the MCP server is running.
**Why it happens:** LinkedIn seed uses `is_active = 1`.
**How to avoid:** Set `is_active = 0` for Holded seed (requirements say "inactivo por defecto"). User activates manually after verifying the service.
**Warning signs:** Health check shows red for Holded MCP before it's even deployed.

## Code Examples

### Health Check Addition (health/route.ts)
```typescript
// Add after linkedinMcpUrl definition (line 67)
const holdedMcpUrl = process['env']['HOLDED_MCP_URL'];

// Add to Promise.allSettled array (after linkedinMcpCheck)
holdedMcpUrl
  ? checkService('holded_mcp', holdedMcpUrl, async () => {
      await fetch(holdedMcpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'docatflow-health', version: '1.0' }
          }
        }),
        signal: AbortSignal.timeout(3000),
      });
      return { configured: true };
    })
  : Promise.resolve({ status: 'fulfilled', value: null } as never),
```

### Footer Dot Addition (footer.tsx)
```typescript
// Add after linkedin_mcp spread
...(health.holded_mcp?.configured ? [{ name: 'Holded MCP', status: health.holded_mcp.status }] : []),
```

### SystemHealth Type Addition (use-system-health.ts)
```typescript
export interface HoldedMcpStatus {
  status: 'connected' | 'disconnected' | 'error' | 'checking';
  url: string;
  latency_ms: number | null;
  error: string | null;
  configured: boolean;
}

// Add to SystemHealth interface
holded_mcp?: HoldedMcpStatus;
```

### Systemd Service Template
```ini
[Unit]
Description=DoCatFlow Holded MCP Service
After=network.target

[Service]
Type=simple
WorkingDirectory={INSTALL_DIR}
ExecStart=/usr/bin/node {INSTALL_DIR}/dist/index.js
Environment=HOME=%h
Environment=PORT={PORT}
EnvironmentFile=%h/docflow/app/.env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

### Setup Script Structure
```bash
#!/usr/bin/env bash
set -e

INSTALL_DIR="$HOME/holded-mcp"
SERVICE_NAME="holded-mcp"
PORT=8766
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== DoCatFlow Holded MCP -- Instalacion ==="

command -v node >/dev/null 2>&1 || { echo "ERROR: node no encontrado."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "ERROR: npm no encontrado."; exit 1; }

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
  echo "[1/4] Directorio existente -- reinstalando deps..."
  cd "$INSTALL_DIR" && npm install --quiet && npm run build
else
  echo "[1/4] Clonando repo..."
  git clone --depth=1 https://github.com/iamsamuelfraga/mcp-holded.git "$INSTALL_DIR" --quiet
  cd "$INSTALL_DIR"
  # Apply DoCatFlow adaptations (rebrand, strip multi-tenant, add HTTP transport)
  # ... (see PLAN for details)
  npm install --quiet && npm run build
fi

# Install systemd service
echo "[3/4] Instalando servicio systemd..."
mkdir -p "$HOME/.config/systemd/user"
sed \
  -e "s|{INSTALL_DIR}|$INSTALL_DIR|g" \
  -e "s|{PORT}|$PORT|g" \
  "$SCRIPT_DIR/holded-mcp.service" \
  > "$HOME/.config/systemd/user/${SERVICE_NAME}.service"

systemctl --user daemon-reload
systemctl --user enable "${SERVICE_NAME}.service"
systemctl --user start "${SERVICE_NAME}.service"

sleep 3
if systemctl --user is-active --quiet "${SERVICE_NAME}.service"; then
  echo "=== Instalacion completada ==="
  echo "Servicio: ${SERVICE_NAME}.service ACTIVO"
  echo "Puerto:   $PORT"
  IP=$(hostname -I | awk '{print $1}')
  echo "Anadir al .env: HOLDED_MCP_URL=http://${IP}:${PORT}/mcp"
else
  echo "ADVERTENCIA: El servicio no arranco."
  echo "journalctl --user -u ${SERVICE_NAME}.service -n 20"
fi
```

## Holded API Reference

### Authentication
- **Method:** API key in `key` header on every request
- **Header:** `key: YOUR_API_KEY`
- **Source:** Holded platform settings

### Base URLs by Module
| Module | Base URL | Status in mcp-holded |
|--------|----------|---------------------|
| Invoicing | `https://api.holded.com/api/invoicing/v1/` | Covered (13 tool files) |
| CRM | `https://api.holded.com/api/crm/v1/` | Not covered (phase 72) |
| Projects | `https://api.holded.com/api/projects/v1/` | Not covered (phase 73) |
| Team | `https://api.holded.com/api/team/v1/` | Not covered (phase 74) |

### Pagination
All list endpoints support `?page=N` query parameter.

### Response Format
JSON. No documented rate limits from Holded's side (the mcp-holded repo implements its own client-side rate limiting).

### Known CRM Endpoints (for future phases)
- `GET /crm/v1/funnels` - List funnels (pipelines)
- `GET /crm/v1/funnels/{id}` - Get funnel with stages
- `GET /crm/v1/leads` - List leads
- `POST /crm/v1/leads` - Create lead
- `GET /crm/v1/events` - List events

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP stdio only | Streamable HTTP transport | MCP SDK 2024-11 | Enables network-accessible MCP servers |
| Single-tenant MCP | Multi-tenant support | mcp-holded v1.5.0 | We strip this -- single tenant is simpler |
| zod v3 | zod v4 (^4.3.6) | 2025 | Base repo already on v4, follow their lead |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (from base repo) + manual verification |
| Config file | `~/holded-mcp/vitest.config.ts` (from base repo) |
| Quick run command | `cd ~/holded-mcp && npm test` |
| Full suite command | `cd ~/holded-mcp && npm run test:coverage` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SETUP-01 | npm install + build succeeds | smoke | `cd ~/holded-mcp && npm run build` | N/A (build) |
| SETUP-02 | HTTP client retry + delay | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/holded-client.test.ts` | Likely exists in base repo |
| SETUP-03 | systemd service active | smoke | `systemctl --user is-active holded-mcp.service` | N/A (manual) |
| SETUP-04 | Connector appears in DB + health responds | integration | `curl -s http://localhost:3500/api/health \| jq '.holded_mcp'` | N/A (API test) |

### Sampling Rate
- **Per task commit:** `npm run build` in holded-mcp + `npm run build` in docflow/app
- **Per wave merge:** Full vitest suite + systemd status + health endpoint
- **Phase gate:** Service running + health green + connector seeded

### Wave 0 Gaps
- [ ] Verify base repo tests pass after stripping multi-tenant
- [ ] Add test for HTTP transport endpoint (`POST /mcp`)
- [ ] Add test for 150ms minimum delay enforcement

## Open Questions

1. **Holded API rate limits (server-side)**
   - What we know: No documented rate limits from Holded. The mcp-holded repo implements client-side limits (100/min default, stricter for writes).
   - What's unclear: Whether Holded enforces server-side rate limits. The client already handles 429 responses.
   - Recommendation: Keep the 150ms minimum delay as specified. If 429s appear, increase delay.

2. **EnvironmentFile path for .env**
   - What we know: The systemd service needs `HOLDED_API_KEY` from DoCatFlow's `.env`
   - What's unclear: Exact path of `.env` on host (likely `~/docflow/app/.env`)
   - Recommendation: Use `EnvironmentFile=%h/docflow/app/.env` and document in setup script output.

3. **StreamableHTTPServerTransport vs SSEServerTransport**
   - What we know: LinkedIn MCP uses `--transport streamable-http`. The MCP SDK provides both.
   - What's unclear: Whether the SDK's StreamableHTTPServerTransport needs express or has built-in HTTP.
   - Recommendation: Use same approach as LinkedIn MCP. If SDK provides built-in HTTP listener, prefer that over express. Otherwise, use express minimal setup.

## Sources

### Primary (HIGH confidence)
- [github.com/iamsamuelfraga/mcp-holded](https://github.com/iamsamuelfraga/mcp-holded) - Full repo analysis: package.json, src/index.ts, src/holded-client.ts, src/tools structure
- DoCatFlow codebase - health/route.ts, db.ts (LinkedIn seed), footer.tsx, use-system-health.ts, system-health-panel.tsx, catbot-tools.ts
- LinkedIn MCP setup files - scripts/linkedin-mcp/setup.sh, .service template

### Secondary (MEDIUM confidence)
- [developers.holded.com](https://developers.holded.com/) - API documentation portal (modules: invoicing, CRM, projects, team, accounting)
- [help.holded.com](https://help.holded.com/en/articles/6896051-how-to-build-and-use-the-holded-api) - API key generation guide

### Tertiary (LOW confidence)
- Holded API rate limits - no official documentation found; only client-side limits from mcp-holded repo

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - base repo analyzed, dependencies verified in package.json
- Architecture: HIGH - both base repo and DoCatFlow integration patterns fully analyzed from source
- Pitfalls: HIGH - identified from concrete code analysis (transport gap, API key logging, module URLs)
- Holded API details: MEDIUM - official docs portal confirmed but rate limits undocumented

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable domain, base repo MIT licensed)
