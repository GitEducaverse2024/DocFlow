# Phase 80: Safe Delete Email Confirmation - Research

**Researched:** 2026-03-24
**Domain:** MCP server middleware, email confirmation flow, token-based HTTP endpoints
**Confidence:** HIGH

## Summary

Phase 80 adds an email confirmation gate to every DELETE operation in the Holded MCP server (`~/holded-mcp/src/`). Currently, 14 DELETE tools call `client.delete()` directly and irreversibly. The goal is to intercept all DELETE handlers so they: (1) generate a secure token, (2) send an HTML confirmation email with Confirm/Cancel links, (3) return a "pending confirmation" response to the MCP caller, and (4) only execute the real `client.delete()` when the user clicks Confirm via an HTTP endpoint.

The MCP server already runs Express on port 8766 with `/mcp` and `/health` endpoints. This means adding `/confirm/:token` and `/cancel/:token` GET routes is straightforward -- no new HTTP server needed. For email, `nodemailer` must be added as a dependency since the holded-mcp project has no email capability today. The Gmail credentials (app password or OAuth2) can be configured via environment variables, similar to how `HOLDED_API_KEY` is already consumed.

**Primary recommendation:** Create a `safe-delete` middleware layer with: (1) `src/utils/pending-deletes.ts` for in-memory token store with 24h TTL, (2) `src/utils/email-sender.ts` for nodemailer setup, (3) Express routes for `/confirm/:token` and `/cancel/:token` that serve HTML pages, and (4) a `requestDelete()` wrapper that all 14 DELETE tool handlers call instead of `client.delete()`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| nodemailer | ^6.9 | SMTP email sending | De facto Node.js email library, same as DocFlow uses |
| crypto (built-in) | Node 20+ | Token generation via `randomBytes` | No external dependency needed |
| express (existing) | ^4.21 | HTTP routes for confirm/cancel | Already in package.json |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/nodemailer | ^6.4 | TypeScript types | devDependency |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory Map for tokens | SQLite/file-based | Overkill for single-server; tokens lost on restart is acceptable (24h TTL, user retries) |
| nodemailer | Direct SMTP via net | nodemailer handles TLS, OAuth2, retries -- don't hand-roll |

**Installation:**
```bash
cd ~/holded-mcp && npm install nodemailer && npm install -D @types/nodemailer
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── index.ts                    # Add Express confirm/cancel routes
├── holded-client.ts            # Unchanged
├── utils/
│   ├── pending-deletes.ts      # NEW: Token store + requestDelete()
│   ├── email-sender.ts         # NEW: Nodemailer setup + sendConfirmationEmail()
│   ├── safe-delete-routes.ts   # NEW: Express GET /confirm/:token, /cancel/:token
│   ├── rate-limiter.ts         # Existing
│   ├── id-resolver.ts          # Existing
│   └── date-helpers.ts         # Existing
├── tools/                      # Each DELETE handler calls requestDelete() instead of client.delete()
│   ├── contacts.ts
│   ├── documents.ts
│   └── ...
└── __tests__/
    ├── pending-deletes.test.ts # NEW
    ├── email-sender.test.ts    # NEW
    └── safe-delete-routes.test.ts # NEW
```

### Pattern 1: Token-Based Confirmation Flow
**What:** Each DELETE tool handler calls `requestDelete()` which stores the pending operation and sends a confirmation email. The real deletion only happens when the user clicks the confirm link.
**When to use:** Every DELETE operation.
**Example:**
```typescript
// src/utils/pending-deletes.ts
import crypto from 'crypto';

interface PendingDelete {
  token: string;
  toolName: string;
  resourceType: string;
  resourceId: string;
  resourceLabel: string;          // Human-readable name for email
  deleteEndpoint: string;         // e.g., '/contacts/abc123'
  deleteModule?: HoldedModule;    // e.g., 'projects', 'team'
  deleteBody?: unknown;           // For DELETE calls that need a body
  createdAt: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'error';
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const pendingDeletes = new Map<string, PendingDelete>();

export function createPendingDelete(params: Omit<PendingDelete, 'token' | 'createdAt' | 'status'>): PendingDelete {
  const token = crypto.randomBytes(32).toString('hex'); // 64-char hex
  const entry: PendingDelete = {
    ...params,
    token,
    createdAt: Date.now(),
    status: 'pending',
  };
  pendingDeletes.set(token, entry);
  return entry;
}

export function getPendingDelete(token: string): PendingDelete | null {
  const entry = pendingDeletes.get(token);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    entry.status = 'expired';
    return entry;
  }
  return entry;
}

export function markConfirmed(token: string): void { /* ... */ }
export function markCancelled(token: string): void { /* ... */ }
export function markError(token: string): void { /* ... */ }

// Periodic cleanup of expired tokens (run every hour)
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of pendingDeletes) {
    if (now - entry.createdAt > TOKEN_TTL_MS * 2) {
      pendingDeletes.delete(token);
    }
  }
}, 60 * 60 * 1000);
```

### Pattern 2: Tool Handler Wrapper (requestDelete)
**What:** A function that replaces direct `client.delete()` calls in all 14 DELETE tools.
**When to use:** In every DELETE tool's handler.
**Example:**
```typescript
// Called from tool handlers instead of client.delete()
export async function requestDelete(
  client: HoldedClient,
  params: {
    toolName: string;
    resourceType: string;
    resourceId: string;
    resourceLabel: string;
    deleteEndpoint: string;
    deleteModule?: HoldedModule;
    deleteBody?: unknown;
  }
): Promise<{ status: 'pending_confirmation'; message: string; token: string }> {
  const entry = createPendingDelete(params);

  const baseUrl = getBaseUrl(); // from env: SAFE_DELETE_BASE_URL
  const confirmUrl = `${baseUrl}/confirm/${entry.token}`;
  const cancelUrl = `${baseUrl}/cancel/${entry.token}`;

  const emailResult = await sendConfirmationEmail({
    resourceType: params.resourceType,
    resourceLabel: params.resourceLabel,
    confirmUrl,
    cancelUrl,
  });

  if (!emailResult.ok) {
    // SDEL-05: If email fails, cancel the token and return error
    markError(entry.token);
    throw new Error(`Delete confirmation email failed: ${emailResult.error}. Operation cancelled.`);
  }

  return {
    status: 'pending_confirmation',
    message: `Se ha enviado un email de confirmacion para eliminar ${params.resourceType} "${params.resourceLabel}". El enlace expira en 24 horas.`,
    token: entry.token,
  };
}
```

### Pattern 3: Express Confirm/Cancel Routes
**What:** HTTP GET endpoints that handle the email link clicks, serve HTML response pages.
**When to use:** Added to the existing Express app in index.ts.
**Example:**
```typescript
// src/utils/safe-delete-routes.ts
import { Router } from 'express';

export function createSafeDeleteRouter(client: HoldedClient): Router {
  const router = Router();

  router.get('/confirm/:token', async (req, res) => {
    const entry = getPendingDelete(req.params.token);
    if (!entry) return res.status(404).send(htmlPage('Token no encontrado', 'error'));
    if (entry.status === 'expired') return res.status(410).send(htmlPage('Token expirado', 'error'));
    if (entry.status !== 'pending') return res.status(409).send(htmlPage('Token ya utilizado', 'error'));

    try {
      await client.delete(entry.deleteEndpoint, entry.deleteBody, entry.deleteModule);
      markConfirmed(entry.token);
      res.send(htmlPage(`${entry.resourceType} "${entry.resourceLabel}" eliminado correctamente`, 'success'));
    } catch (err) {
      markError(entry.token);
      res.status(500).send(htmlPage(`Error al eliminar: ${err}`, 'error'));
    }
  });

  router.get('/cancel/:token', async (req, res) => {
    const entry = getPendingDelete(req.params.token);
    if (!entry) return res.status(404).send(htmlPage('Token no encontrado', 'error'));
    if (entry.status !== 'pending') return res.status(409).send(htmlPage('Token ya utilizado', 'error'));
    markCancelled(entry.token);
    res.send(htmlPage(`Eliminacion de ${entry.resourceType} "${entry.resourceLabel}" cancelada`, 'cancelled'));
  });

  return router;
}
```

### Pattern 4: Refactored DELETE Tool Handler
**What:** How each tool file changes to use requestDelete.
**Example (contacts.ts):**
```typescript
// BEFORE:
handler: withValidation(contactIdSchema, async (args) => {
  return client.delete(`/contacts/${args.contactId}`);
}),

// AFTER:
handler: withValidation(contactIdSchema, async (args) => {
  // Fetch contact name for human-readable email
  const contact = await client.get<{ name?: string }>(`/contacts/${args.contactId}`);
  return requestDelete(client, {
    toolName: 'delete_contact',
    resourceType: 'Contacto',
    resourceId: args.contactId,
    resourceLabel: contact?.name || args.contactId,
    deleteEndpoint: `/contacts/${args.contactId}`,
  });
}),
```

### Anti-Patterns to Avoid
- **Storing tokens in a file or DB for a single-server MCP:** Overkill complexity. In-memory Map is sufficient; lost tokens on restart just mean the user retries the delete.
- **Using POST for confirm/cancel URLs:** Email clients don't support POST links. Must be GET endpoints.
- **Sending the delete API key in the email link:** Never expose credentials in URLs. The server already has the API key; tokens reference the pending operation server-side.
- **Making requestDelete async-fire-and-forget for email:** The email send MUST be awaited. If it fails, the token must be cancelled immediately (SDEL-05).

## Complete DELETE Tool Inventory

All 14 DELETE tools that must be converted to use `requestDelete()`:

| # | Tool Name | File | Endpoint | Module | Resource Type |
|---|-----------|------|----------|--------|---------------|
| 1 | `delete_contact` | contacts.ts | `/contacts/{id}` | invoicing | Contacto |
| 2 | `delete_document` | documents.ts | `/documents/{type}/{id}` | invoicing | Documento |
| 3 | `delete_product` | products.ts | `/products/{id}` | invoicing | Producto |
| 4 | `delete_payment` | payments.ts | `/payments/{id}` | invoicing | Pago |
| 5 | `delete_service` | services.ts | `/services/{id}` | invoicing | Servicio |
| 6 | `delete_contact_group` | contact-groups.ts | `/contactgroups/{id}` | invoicing | Grupo de contactos |
| 7 | `delete_sales_channel` | sales-channels.ts | `/saleschannels/{id}` | invoicing | Canal de ventas |
| 8 | `delete_warehouse` | warehouses.ts | `/warehouses/{id}` | invoicing | Almacen |
| 9 | `delete_numbering_serie` | numbering-series.ts | `/numberseries/{type}/{id}` | invoicing | Serie de numeracion |
| 10 | `delete_expenses_account` | expenses-accounts.ts | `/expensesaccounts/{id}` | invoicing | Cuenta de gastos |
| 11 | `holded_delete_project` | projects.ts | `/projects/{id}` | projects | Proyecto |
| 12 | `holded_delete_project_task` | project-tasks.ts | `/tasks/{id}` | projects | Tarea de proyecto |
| 13 | `holded_delete_time_entry` | time-tracking.ts | `/projects/{pid}/times/{tid}` | projects | Registro de tiempo |
| 14 | `holded_delete_timesheet` | employee-timesheets.ts | `/employees/times/{id}` | team | Fichaje de empleado |

### Resource Label Resolution

For a good email, we need a human-readable label. Strategy per tool:

| Tool | Label Source | Fallback |
|------|-------------|----------|
| delete_contact | `GET /contacts/{id}` -> `name` | contactId |
| delete_document | `GET /documents/{type}/{id}` -> doc number/ref | documentId |
| delete_product | `GET /products/{id}` -> `name` | productId |
| delete_payment | paymentId (no simple name) | paymentId |
| delete_service | `GET /services/{id}` -> `name` | serviceId |
| delete_contact_group | `GET /contactgroups/{id}` -> `name` | groupId |
| delete_sales_channel | channelId | channelId |
| delete_warehouse | warehouseId | warehouseId |
| delete_numbering_serie | serieId | serieId |
| delete_expenses_account | accountId | accountId |
| holded_delete_project | `GET /projects/{id}` -> `name` | projectId |
| holded_delete_project_task | `GET /tasks/{id}` -> `name` | taskId |
| holded_delete_time_entry | timeTrackingId (+ projectId context) | timeTrackingId |
| holded_delete_timesheet | timeId | timeId |

**Optimization:** For resources where the GET is cheap, fetch the label. For others (payments, numbering series, etc.), use the ID. This avoids doubling API calls for low-value labels.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SMTP email sending | Raw net/tls socket connections | nodemailer | TLS negotiation, OAuth2 token refresh, connection pooling, MIME encoding |
| Secure random tokens | `Math.random()` or custom UUID | `crypto.randomBytes(32)` | Cryptographically secure, no collision risk |
| HTML email templates | String concatenation with escaping | Template literal with proper escaping function | XSS prevention in resource names |

## Common Pitfalls

### Pitfall 1: Email Links Must Be GET
**What goes wrong:** POST/PUT links in emails don't work -- email clients only follow GET hrefs.
**Why it happens:** Security-minded developers want POST for state-changing operations.
**How to avoid:** Use GET for `/confirm/:token` and `/cancel/:token`. The token itself is the authorization. One-time use prevents replay.
**Warning signs:** Links that don't work in Gmail/Outlook.

### Pitfall 2: Race Condition on Double-Click
**What goes wrong:** User clicks Confirm twice quickly, second click tries to delete an already-deleted resource.
**Why it happens:** No atomic status check + execute.
**How to avoid:** Check `entry.status === 'pending'` and immediately set to `'confirmed'` before calling `client.delete()`. Use synchronous Map operations (single-threaded Node.js guarantees this).
**Warning signs:** 409 Conflict or Holded API 404 errors on second click.

### Pitfall 3: Token Leaked via Referrer Header
**What goes wrong:** When user clicks confirm and the success page has external links, the token URL leaks via HTTP Referrer.
**Why it happens:** Default browser behavior sends full URL as referrer.
**How to avoid:** Add `<meta name="referrer" content="no-referrer">` to all HTML response pages. Also, tokens are one-time use so leaked tokens are useless.
**Warning signs:** Tokens appearing in third-party logs.

### Pitfall 4: Forgetting to Pass Module to client.delete()
**What goes wrong:** DELETE calls go to wrong Holded API base URL (invoicing instead of projects/team).
**Why it happens:** The `deleteModule` parameter is optional and easy to forget.
**How to avoid:** Store `deleteModule` in the PendingDelete entry and pass it through in the confirm handler.
**Warning signs:** Holded API 404 errors on confirm.

### Pitfall 5: Email Failure Leaves Orphan Token
**What goes wrong:** Token is created but email fails; user never receives confirmation link but MCP returns success.
**Why it happens:** Creating token and sending email are not atomic.
**How to avoid:** Always await email send. If it fails, mark token as 'error' and throw an error back to the MCP caller (SDEL-05).
**Warning signs:** Tokens in 'pending' state that never get confirmed.

### Pitfall 6: Env Vars Not Using Bracket Notation
**What goes wrong:** Next.js webpack inlining breaks env var access at build time.
**Why it happens:** Project convention requires `process['env']['VAR']` not `process.env.VAR`.
**How to avoid:** Follow project CLAUDE.md convention: always use bracket notation.
**Warning signs:** Undefined env vars in production despite being set.

## Environment Variables

New env vars needed for the holded-mcp service:

```bash
# Email configuration (direct nodemailer -- no DocFlow dependency)
SAFE_DELETE_SMTP_HOST=smtp-relay.gmail.com   # or smtp.gmail.com for personal
SAFE_DELETE_SMTP_PORT=465
SAFE_DELETE_SMTP_USER=your-email@domain.com
SAFE_DELETE_SMTP_PASS=xxxx-xxxx-xxxx-xxxx   # Gmail app password
SAFE_DELETE_SMTP_FROM_NAME=DoCatFlow

# Recipient for delete confirmations
SAFE_DELETE_NOTIFY_EMAIL=admin@domain.com

# Base URL for confirm/cancel links (must be reachable from email)
SAFE_DELETE_BASE_URL=http://192.168.1.49:8766

# Optional: Token TTL in hours (default: 24)
SAFE_DELETE_TOKEN_TTL_HOURS=24
```

**Key decision:** The holded-mcp server gets its OWN nodemailer config via env vars. It does NOT call DocFlow's email service API. This keeps the MCP server self-contained with no circular dependencies.

## Code Examples

### Email HTML Template
```typescript
// src/utils/email-sender.ts
export function buildConfirmationEmailHtml(params: {
  resourceType: string;
  resourceLabel: string;
  confirmUrl: string;
  cancelUrl: string;
}): string {
  const { resourceType, resourceLabel, confirmUrl, cancelUrl } = params;
  // Escape HTML entities in user-provided strings
  const safeLabel = escapeHtml(resourceLabel);
  const safeType = escapeHtml(resourceType);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="referrer" content="no-referrer"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #dc2626;">Confirmacion de eliminacion</h2>
  <p>Se ha solicitado eliminar el siguiente recurso de Holded:</p>
  <table style="background: #f9fafb; border-radius: 8px; padding: 16px; width: 100%; margin: 16px 0;">
    <tr><td style="color: #6b7280; padding: 4px 8px;">Tipo:</td><td style="font-weight: 600;">${safeType}</td></tr>
    <tr><td style="color: #6b7280; padding: 4px 8px;">Nombre:</td><td style="font-weight: 600;">${safeLabel}</td></tr>
  </table>
  <p><strong>Esta accion es irreversible.</strong></p>
  <div style="margin: 24px 0;">
    <a href="${confirmUrl}" style="background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-right: 12px;">Confirmar eliminacion</a>
    <a href="${cancelUrl}" style="background: #6b7280; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Cancelar</a>
  </div>
  <p style="color: #9ca3af; font-size: 12px;">Este enlace expira en 24 horas. Si no solicitaste esta eliminacion, haz clic en Cancelar.</p>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

### HTML Response Pages
```typescript
// src/utils/safe-delete-routes.ts
function htmlPage(message: string, type: 'success' | 'cancelled' | 'error'): string {
  const colors = { success: '#16a34a', cancelled: '#6b7280', error: '#dc2626' };
  const icons = { success: '&#10004;', cancelled: '&#10060;', error: '&#9888;' };
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer">
<title>DoCatFlow - Eliminacion</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f9fafb;">
<div style="text-align: center; max-width: 500px; padding: 40px;">
  <div style="font-size: 48px; color: ${colors[type]};">${icons[type]}</div>
  <p style="font-size: 18px; color: #374151; margin-top: 16px;">${escapeHtml(message)}</p>
  <p style="color: #9ca3af; font-size: 14px;">Puedes cerrar esta ventana.</p>
</div></body></html>`;
}
```

### Nodemailer Setup
```typescript
// src/utils/email-sender.ts
import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  const host = process['env']['SAFE_DELETE_SMTP_HOST'] || 'smtp.gmail.com';
  const port = parseInt(process['env']['SAFE_DELETE_SMTP_PORT'] || '465');
  const user = process['env']['SAFE_DELETE_SMTP_USER'];
  const pass = process['env']['SAFE_DELETE_SMTP_PASS'];

  if (!user || !pass) {
    throw new Error('SAFE_DELETE_SMTP_USER and SAFE_DELETE_SMTP_PASS are required');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct DELETE in MCP tools | Confirmation-gated DELETE | Phase 80 | All 14 DELETE tools gain safety gate |
| No email in holded-mcp | Self-contained nodemailer | Phase 80 | New dependency, new env vars |

## Integration with index.ts

The existing Express setup in `index.ts` (lines 217-244) already has `app.use(express.json())` and listens on port 8766. Adding the safe-delete router:

```typescript
// In index.ts main() function, HTTP branch:
import { createSafeDeleteRouter } from './utils/safe-delete-routes.js';

// After app.use(express.json()):
app.use(createSafeDeleteRouter(client));
```

This adds:
- `GET /confirm/:token` -- executes DELETE on Holded and shows success page
- `GET /cancel/:token` -- marks token cancelled and shows cancellation page

Both return full HTML pages suitable for viewing in a browser after clicking an email link.

## Open Questions

1. **Network accessibility of confirm URLs**
   - What we know: Server runs on 192.168.1.49:8766 (LAN)
   - What's unclear: Is the server accessible from outside the LAN? (Gmail links clicked on phone, etc.)
   - Recommendation: Use `SAFE_DELETE_BASE_URL` env var so it can be set to a public URL or reverse proxy if needed. Default to `http://192.168.1.49:8766`.

2. **Which Gmail account to use for sending**
   - What we know: DocFlow has Gmail connectors with encrypted credentials in SQLite
   - What's unclear: Whether to reuse those credentials or set up separate ones
   - Recommendation: Use separate env vars (`SAFE_DELETE_SMTP_*`) to keep holded-mcp self-contained. The admin provides a Gmail app password directly.

3. **Stdio transport mode**
   - What we know: MCP server can run in stdio mode (no Express), which means no HTTP endpoints
   - What's unclear: Should safe-delete work in stdio mode?
   - Recommendation: In stdio mode, requestDelete should throw an error saying "Safe delete requires HTTP mode (PORT env var)". All current deployments use HTTP mode.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.15 |
| Config file | package.json scripts (vitest run) |
| Quick run command | `cd ~/holded-mcp && npx vitest run --reporter=verbose` |
| Full suite command | `cd ~/holded-mcp && npx vitest run --coverage` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SDEL-01 | DELETE tool triggers email with resource info | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/pending-deletes.test.ts -t "creates pending delete"` | Wave 0 |
| SDEL-02 | Confirm link executes real DELETE and shows success | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/safe-delete-routes.test.ts -t "confirm"` | Wave 0 |
| SDEL-03 | Cancel link preserves resource and shows cancellation | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/safe-delete-routes.test.ts -t "cancel"` | Wave 0 |
| SDEL-04 | Expired/used tokens show error page | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/pending-deletes.test.ts -t "expired"` | Wave 0 |
| SDEL-05 | Email failure cancels token and returns error | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/email-sender.test.ts -t "failure"` | Wave 0 |
| SDEL-06 | All 14 DELETE tools use requestDelete | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/contacts.test.ts` (+ all tool tests) | Existing (needs update) |
| SDEL-07 | HTML email contains resource type and name | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/email-sender.test.ts -t "html"` | Wave 0 |
| SDEL-08 | Confirm/cancel HTML pages render correctly | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/safe-delete-routes.test.ts -t "html"` | Wave 0 |
| SDEL-09 | Token is 64-char hex, cryptographically random | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/pending-deletes.test.ts -t "token format"` | Wave 0 |
| SDEL-10 | Double-click on confirm is safe (idempotent) | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/safe-delete-routes.test.ts -t "double click"` | Wave 0 |
| SDEL-11 | Env vars use bracket notation | unit | grep-based verification | Manual |
| SDEL-12 | requestDelete fetches resource label when possible | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/pending-deletes.test.ts -t "label"` | Wave 0 |
| SDEL-13 | Stdio mode rejects safe delete gracefully | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/pending-deletes.test.ts -t "stdio"` | Wave 0 |
| SDEL-14 | Periodic cleanup removes old tokens | unit | `cd ~/holded-mcp && npx vitest run src/__tests__/pending-deletes.test.ts -t "cleanup"` | Wave 0 |
| SDEL-15 | No direct client.delete() calls remain in tools | unit | grep-based verification | Manual |

### Sampling Rate
- **Per task commit:** `cd ~/holded-mcp && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd ~/holded-mcp && npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/pending-deletes.test.ts` -- covers SDEL-01, SDEL-04, SDEL-09, SDEL-12, SDEL-13, SDEL-14
- [ ] `src/__tests__/email-sender.test.ts` -- covers SDEL-05, SDEL-07
- [ ] `src/__tests__/safe-delete-routes.test.ts` -- covers SDEL-02, SDEL-03, SDEL-08, SDEL-10
- [ ] Install nodemailer: `npm install nodemailer && npm install -D @types/nodemailer`
- [ ] Update existing DELETE tool tests to expect `pending_confirmation` response instead of direct delete result

## Sources

### Primary (HIGH confidence)
- Holded MCP codebase at `/home/deskmath/holded-mcp/src/` -- all 14 DELETE tools verified by direct code inspection
- DocFlow email service at `/home/deskmath/docflow/app/src/lib/services/email-service.ts` -- nodemailer patterns verified
- Express app setup in `/home/deskmath/holded-mcp/src/index.ts` -- HTTP mode with port 8766 verified

### Secondary (MEDIUM confidence)
- nodemailer API patterns from DocFlow's existing implementation (same project ecosystem)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- nodemailer already used in DocFlow, Express already in holded-mcp
- Architecture: HIGH -- based on direct code inspection of all 14 DELETE tools and Express setup
- Pitfalls: HIGH -- based on known patterns for email confirmation flows
- DELETE tool inventory: HIGH -- exhaustive grep of all `client.delete()` calls verified

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain, unlikely to change)
