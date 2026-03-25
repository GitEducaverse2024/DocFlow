# Google Drive API Integration Research

**Project:** DoCatFlow v19.0
**Researched:** 2026-03-25
**Confidence:** HIGH (official Google docs + existing codebase patterns)

---

## 1. googleapis Package (Already Installed)

`googleapis` is already a dependency (used by Gmail connector OAuth2). Drive v3 API available via `google.drive({ version: 'v3', auth })`.

### Core Operations
- **List files**: `drive.files.list({ q: "'folderId' in parents and trashed = false", fields: '...' })`
- **Download binary**: `drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })`
- **Upload file**: `drive.files.create({ requestBody: { name, parents }, media: { mimeType, body } })`
- **Create folder**: `drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents } })`
- **Export Google Docs**: `drive.files.export({ fileId, mimeType: 'application/pdf' }, { responseType: 'stream' })`

## 2. Authentication

### Service Account (Primary)
- Create SA in GCP Console, download JSON key
- Share Drive folders with SA email
- `new google.auth.GoogleAuth({ credentials: JSON.parse(saJson), scopes: [...] })`
- No token refresh needed — JWT auto-refreshes
- **Gotcha**: SA can only see files explicitly shared with its email

### OAuth2 (Secondary)
- **OOB is DEAD** since October 2022 — `urn:ietf:wg:oauth:2.0:oob` no longer works
- **Replacement**: Web callback redirect to `/api/connectors/google-drive/oauth2/callback`
- Since DocFlow runs on known local IP (e.g. `http://192.168.1.49:3500`), standard web OAuth flow works
- Create "Web Application" OAuth client in GCP Console with redirect URI
- Alternative: Loopback redirect (`http://127.0.0.1:<port>`) for "Desktop" client type

### Scopes
| Scope | Use |
|-------|-----|
| `drive` | Full read/write (needed for upload) |
| `drive.readonly` | Read-only (sufficient for RAG indexing only) |

## 3. Incremental Sync (changes.list API)

### Flow
1. `changes.getStartPageToken()` → save token in SQLite
2. Poll `changes.list({ pageToken })` at configured interval
3. If `newStartPageToken` in response → save it, poll complete
4. If `nextPageToken` → more pages in this batch, continue

### Key Details
- Changes are **account-wide**, not per-folder — filter by `change.file.parents`
- Returns `removed` flag + `file.trashed` for deletions
- Store `pageToken` in `drive_sync_jobs.last_page_token` (survives restarts)
- Recommended: poll every 5-15 min for background sync

## 4. Google Workspace File Export

Native Google files (`application/vnd.google-apps.*`) cannot be downloaded — must be exported.

| Source | Export to | mimeType |
|--------|----------|----------|
| Google Doc | PDF | `application/pdf` |
| Google Doc | Plain Text | `text/plain` |
| Google Doc | DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Google Sheet | XLSX | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| Google Sheet | CSV | `text/csv` (first sheet only) |
| Google Slides | PPTX | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |

**Strategy for RAG**: Export to plain text for content extraction, PDF as fallback. Max export size: 10 MB.

## 5. Rate Limits

| Limit | Value |
|-------|-------|
| Per-project | 20,000 req / 100 seconds |
| Per-user/SA | 2,400 req / 60 seconds |
| Write ops | 3 req/second sustained |
| Daily upload | 750 GB / day |

For DocFlow: polling = ~1 req/poll (negligible). Bulk sync 1000 files = ~25s API time. Use exponential backoff on 403/429/500/503.

## 6. Existing Codebase Patterns to Reuse

### From Gmail Connector
- **Wizard**: 4-step Dialog in `gmail-wizard.tsx` → replicate for Drive
- **Crypto**: AES-256-GCM `encrypt()`/`decrypt()` from `crypto.ts`
- **Type config**: `TYPE_CONFIG` record in `connectors/page.tsx`
- **API routes**: CRUD + test + OAuth2 auth-url/exchange-code pattern
- **Anti-spam singleton**: `Map<string, number>` in `catbrain-connector-executor.ts` → template for polling

### From Connector Infrastructure
- **Canvas executor**: Switch on `connector.type` in `canvas-executor.ts` (line 515+)
- **CatBrain executor**: Switch on `connector.type` in `catbrain-connector-executor.ts` (line 116+)
- **Task executor**: Before/after connector hooks in `task-executor.ts`
- **Test endpoint**: Switch case in `/api/connectors/[id]/test/route.ts`
- **Invoke endpoint**: Type dispatch in `/api/connectors/[id]/invoke/route.ts`
- **Footer dots**: Conditional spread in `footer.tsx`
- **System page**: Conditional cards in `system-health-panel.tsx`
- **CatBot tools**: Conditional array entries in `catbot-tools.ts`

### From Source Pipeline
- **extractContent()**: Dispatches by file type in `content-extractor.ts` — supports PDF, DOCX, PPTX, XLSX, EPUB, RTF
- **RAG worker**: `rag-worker.mjs` handles chunking + embeddings
- **Source creation**: POST `/api/catbrains/[id]/sources/route.ts` with deduplication

## 7. Spec Adjustments Needed

1. **OAuth2 OOB → Web callback**: Replace OOB flow with redirect to `/api/connectors/google-drive/oauth2/callback`
2. **Connector type name**: Use `'google_drive'` (matches spec, underscore convention like existing types)
3. **No new dependencies**: `googleapis` already installed, no `nodemailer` or other packages needed
4. **changes.list scope**: Filter by parent folder IDs since changes are account-wide

---
*Researched: 2026-03-25*
