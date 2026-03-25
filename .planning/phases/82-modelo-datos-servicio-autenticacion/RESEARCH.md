# Phase 82 Research: Modelo de datos + Servicio de autenticacion

**Researched:** 2026-03-25
**Phase:** 82 — Modelo de datos + Servicio de autenticacion
**Requirements:** DATA-01..05, AUTH-01..04, API-01..08

---

## 1. Database Patterns (db.ts)

### Migration Pattern
All migrations use try/catch for ALTER TABLE (idempotent):
```typescript
try { db.exec('ALTER TABLE sources ADD COLUMN drive_file_id TEXT'); } catch { /* already exists */ }
```
Migrations go at the END of db.ts. New tables use `CREATE TABLE IF NOT EXISTS`.

### Connectors Table (db.ts:911-924)
```sql
CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  emoji TEXT DEFAULT '🔌', type TEXT NOT NULL, config TEXT,
  is_active INTEGER DEFAULT 1, test_status TEXT DEFAULT 'untested',
  last_tested TEXT, times_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
-- Migration: ALTER TABLE connectors ADD COLUMN gmail_subtype TEXT (line 1545)
```

### Sources Table (db.ts:42-58)
Columns: id, project_id (FK catbrains), type, name, description, file_path, file_type, file_size, url, youtube_id, content_text, status, extraction_log, created_at, order_index, process_mode, content_updated_at, is_pending_append.

Need to ADD: `drive_file_id TEXT`, `drive_sync_job_id TEXT`.

### Source type union (types.ts:30)
```typescript
type: 'file' | 'url' | 'youtube' | 'note'
```
Need to add `'google_drive'`.

---

## 2. Connector Type System (types.ts)

### Connector interface (types.ts:206-220)
```typescript
export interface Connector {
  id: string; name: string; description: string | null; emoji: string;
  type: 'n8n_webhook' | 'http_api' | 'mcp_server' | 'email' | 'gmail';
  gmail_subtype?: string | null;
  config: string | null; // JSON string
  is_active: number; test_status: 'untested' | 'ok' | 'failed';
  last_tested: string | null; times_used: number;
  created_at: string; updated_at: string;
}
```
Need to add `'google_drive'` to type union.

### GmailConfig pattern (types.ts:274-289)
```typescript
export interface GmailConfig {
  account_type: GmailAccountType; auth_mode: GmailAuthMode; user: string;
  from_name?: string; app_password_encrypted?: string;
  client_id?: string; client_id_encrypted?: string;
  client_secret_encrypted?: string; refresh_token_encrypted?: string;
}
```
Template for GoogleDriveConfig.

---

## 3. Crypto (crypto.ts)

- Algorithm: AES-256-GCM
- Format: `ivHex:authTagHex:ciphertextHex`
- Functions: `encrypt(plaintext): string`, `decrypt(encrypted): string`, `isEncrypted(value): boolean`
- Key: `crypto.scryptSync(process['env']['CONNECTOR_SECRET'], 'salt-docatflow', 32)`

---

## 4. API Route Patterns

### Generic CRUD (connectors/route.ts)
- `VALID_TYPES` array at line 8 — needs `'google_drive'`
- POST: Type-specific config building, encrypts sensitive fields, stores as JSON
- GET: Masks sensitive fields via `maskGmailConfig()` (need parallel `maskDriveConfig()`)
- SENSITIVE_FIELDS array at line 10-11

### Individual CRUD (connectors/[id]/route.ts)
- GET: Fetch + mask
- PATCH: Smart merge — checks `isEncrypted()` to avoid re-encrypting
- DELETE: Cascade via FK

### Test route (connectors/[id]/test/route.ts)
- Switch on `connector.type` (line 90-97 for Gmail)
- Updates `test_status` and `last_tested` in DB
- Returns `{ success, test_status, message, duration_ms }`

### Invoke route (connectors/[id]/invoke/route.ts)
- Currently Gmail-only (line 82-84) — needs Drive branch
- Logs to connector_logs, increments times_used

### Gmail OAuth2 routes
- `gmail/oauth2/auth-url/route.ts` — GET, creates OAuth2Client, generates auth URL
- `gmail/oauth2/exchange-code/route.ts` — POST, exchanges code for tokens, encrypts
- **IMPORTANT**: Gmail uses OOB redirect (`urn:ietf:wg:oauth:2.0:oob`) — Drive must use web callback instead

---

## 5. googleapis Usage

Already installed (`^171.4.0`). Import pattern:
```typescript
const { google } = require('googleapis');
// OAuth2:
const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);
// Service Account:
const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(saJson), scopes: [...] });
// Drive client:
const drive = google.drive({ version: 'v3', auth });
```

---

## 6. Key Decisions for Phase 82

1. **Route structure**: Use `google-drive/` (hyphenated) in URL paths, matching Next.js folder convention
2. **OAuth2 callback**: GET endpoint at `/api/connectors/google-drive/oauth2/callback` (web redirect, NOT OOB)
3. **Service Account JSON**: Encrypt entire JSON blob, store SA email in clear for display
4. **Config storage**: Single `config` TEXT column as JSON (same as Gmail)
5. **Browse endpoint**: New pattern (Gmail doesn't have it) — lazy-loads folder tree for picker
6. **No drive_subtype column needed**: Auth mode (service_account/oauth2) stored in config JSON

---

*Researched: 2026-03-25*
