# Phase 66: Storage Node - Research

**Researched:** 2026-03-22
**Domain:** Canvas node system (React Flow + server-side executor + file I/O)
**Confidence:** HIGH

## Summary

The Storage Node adds data persistence to the DoCatFlow canvas editor. It allows flow results to be saved to local files or sent to external connectors, optionally formatted by LLM before saving. The node has a single input handle and a single output handle (continuation -- passes content to the next node). Unlike the scheduler or condition nodes, it does NOT branch; it is a simple pass-through node that performs a side effect (writing a file or calling a connector).

The implementation follows well-established patterns already in the codebase. The connector-node serves as the direct template for a single-input/single-output node with connector integration. The executor's existing `callLLM` function handles the LLM formatting requirement (STOR-05). File writing uses the same `fs.mkdirSync` + `fs.writeFileSync` pattern found throughout the catbrain source upload routes. The PROJECTS_PATH environment variable pattern (`process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects')`) is used consistently across 9+ API routes.

**Primary recommendation:** Follow the connector-node pattern for the component (single source handle, teal color scheme), add a `case 'storage'` block in `dispatchNode` that handles local file writing, connector invocation, and optional LLM formatting, then register in all standard locations (NODE_TYPES, palette, config panel, i18n).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STOR-01 | storage node type registered in canvas-editor NODE_TYPES and visible in palette | NODE_TYPES map (line 46), PALETTE_ITEMS array (line 16), MODE_ALLOWED_TYPES (line 29) in existing files |
| STOR-02 | StorageNode component with teal-600 colors, input handle, single output handle (continuation) | Connector-node.tsx is the template -- single input + single output handle pattern |
| STOR-03 | Config panel supports storage_mode: local, connector, both | node-config-panel.tsx formRenderers pattern (line 561); add `renderStorageForm` |
| STOR-04 | Filename template with variable substitution ({date}, {time}, {run_id}, {title}) | String replacement in executor, template stored in node data |
| STOR-05 | If use_llm_format enabled, calls LLM with format_instructions before saving | `callLLM` helper already exists in canvas-executor.ts (line 87) |
| STOR-06 | Local mode writes file to PROJECTS_PATH/storage/{subdir}/{filename} | Pattern from catbrain sources: `process['env']['PROJECTS_PATH']`, `fs.mkdirSync`, `fs.writeFileSync` |
| STOR-07 | Connector mode invokes configured connector with content and filename | Existing connector dispatch pattern in canvas-executor.ts case 'connector' (line 429) |
| STOR-08 | Output passes saved content to next node in flow | Return `{ output: content }` from dispatchNode -- content passes through |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xyflow/react | (in use) | React Flow canvas + Handle components | Already used for all canvas nodes |
| next-intl | (in use) | i18n for node labels, config panel | Already used across all components |
| better-sqlite3 | (in use) | Connector lookup, canvas_runs | Already used for all DB operations |
| lucide-react | (in use) | Node icons (HardDrive or Database for storage) | Already used for all node icons |
| fs (Node built-in) | N/A | File system write operations | Used throughout catbrain API routes |
| path (Node built-in) | N/A | Path construction for storage directory | Used throughout catbrain API routes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | (in use) | Toast notifications on write errors | Already imported in canvas-editor |

## Architecture Patterns

### Recommended File Structure
```
app/src/
  components/canvas/
    nodes/
      storage-node.tsx              # STOR-01, STOR-02
    node-palette.tsx                # STOR-01 (add entry)
    node-config-panel.tsx           # STOR-03 (add renderStorageForm)
    canvas-editor.tsx               # STOR-01 (add to NODE_TYPES, NODE_DIMENSIONS, getDefaultNodeData, getMiniMapNodeColor)
  lib/services/
    canvas-executor.ts              # STOR-04, STOR-05, STOR-06, STOR-07, STOR-08 (add case 'storage')
  messages/
    es.json                         # i18n keys for storage node
    en.json                         # i18n keys for storage node
```

### Pattern 1: Single-Handle Node Component (from connector-node.tsx)
**What:** Node with one input handle (left) and one output handle (right), no branching
**When to use:** Pass-through nodes that perform a side effect and forward content
**Example:**
```typescript
// Source: app/src/components/canvas/nodes/connector-node.tsx
// Single input + single output, orange color scheme
<Handle type="target" position={Position.Left}
  style={{ background: '#ea580c', width: 10, height: 10 }} />
// ... node body ...
<Handle type="source" position={Position.Right}
  style={{ background: '#ea580c', width: 10, height: 10 }} />
```

For storage, use teal-600 color scheme:
- Target handle: `background: '#0d9488'` (teal-600)
- Source handle: `background: '#0d9488'` (teal-600)
- Background: `bg-teal-950/80`
- Border: `border-teal-600` (default), `border-teal-400` (selected)
- Text: `text-teal-100` (label), `text-teal-400` (icon)

### Pattern 2: PROJECTS_PATH File Writing (from catbrain sources)
**What:** Writing files to the project data directory using env var with fallback
**When to use:** STOR-06 local mode file persistence
**Example:**
```typescript
// Source: app/src/app/api/catbrains/[id]/sources/route.ts lines 50-55
import fs from 'fs';
import path from 'path';

const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
const storageDir = path.join(projectsPath, 'storage', subdir);

if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

fs.writeFileSync(path.join(storageDir, filename), content, 'utf-8');
```

### Pattern 3: callLLM for Formatting (STOR-05)
**What:** Using the existing callLLM helper to format content before saving
**When to use:** When `use_llm_format` is enabled in node config
**Example:**
```typescript
// Source: canvas-executor.ts line 87
// callLLM(model, systemPrompt, userContent) already exists
const systemPrompt = `Formatea el siguiente contenido segun estas instrucciones: ${formatInstructions}. Responde SOLO con el contenido formateado.`;
const result = await callLLM(model, systemPrompt, predecessorOutput);
const formattedContent = result.output;
```

### Pattern 4: Connector Invocation (from case 'connector' in executor)
**What:** Loading a connector from DB and calling its URL with content
**When to use:** STOR-07 connector mode
**Example:**
```typescript
// Source: canvas-executor.ts lines 429-484
const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND is_active = 1').get(connectorId);
if (!connector) return { output: predecessorOutput };

const connConfig = connector.config ? JSON.parse(connector.config as string) : {};
const payload = {
  canvas_id: canvasId,
  run_id: runId,
  node_id: node.id,
  input: content,
  filename: resolvedFilename,
  metadata: {},
};

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), (connConfig.timeout || 30) * 1000);
await fetch(connConfig.url, {
  method: connConfig.method || 'POST',
  headers: { 'Content-Type': 'application/json', ...(connConfig.headers || {}) },
  body: JSON.stringify(payload),
  signal: controller.signal,
});
clearTimeout(timeout);
```

### Pattern 5: Filename Template Resolution (STOR-04)
**What:** Replacing template variables in filename with runtime values
**When to use:** Resolving `{date}`, `{time}`, `{run_id}`, `{title}` in filename templates
**Example:**
```typescript
// New helper function for canvas-executor.ts
function resolveFilenameTemplate(
  template: string,
  runId: string,
  canvasId: string
): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // 2026-03-22
  const time = now.toISOString().slice(11, 19).replace(/:/g, '-'); // 14-30-00

  // Get canvas name for {title}
  const canvas = db.prepare('SELECT name FROM canvases WHERE id = ?').get(canvasId) as
    | { name: string }
    | undefined;
  const title = (canvas?.name || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return template
    .replace(/\{date\}/g, date)
    .replace(/\{time\}/g, time)
    .replace(/\{run_id\}/g, runId)
    .replace(/\{title\}/g, title);
}
```

### Pattern 6: NODE_TYPES Registration
**What:** Adding a new node type to the canvas editor
**When to use:** Every new node type
**Changes needed in canvas-editor.tsx:**
```typescript
// 1. Import the component
import { StorageNode } from './nodes/storage-node';

// 2. Add to NODE_TYPES constant (line 46)
const NODE_TYPES = {
  // ...existing...
  storage: StorageNode,
} as const;

// 3. Add to NODE_DIMENSIONS (line 60)
storage: { width: 240, height: 110 },

// 4. Add to getDefaultNodeData (line 100)
case 'storage': return {
  label: t('nodeDefaults.storage'),
  storage_mode: 'local',
  filename_template: '{title}_{date}_{time}.md',
  subdir: '',
  connectorId: null,
  use_llm_format: false,
  format_instructions: '',
  format_model: '',
};

// 5. Add to getMiniMapNodeColor (line 123)
case 'storage': return '#0d9488'; // teal
```

### Anti-Patterns to Avoid
- **Using async file operations in the executor:** The executor runs in a synchronous-ish flow per node. Use `fs.writeFileSync` and `fs.mkdirSync`, consistent with all other file operations in the codebase.
- **Branching output handles:** The storage node is a pass-through. It should NOT have multiple output handles. Content flows in, gets saved as a side effect, and flows out unchanged (or LLM-formatted if enabled).
- **Storing file content in the database:** The storage node writes to the filesystem. Do NOT add new DB tables. The node's output (passed to the next node) is the content itself.
- **Sanitizing filenames with regex only:** Template variables like `{title}` could produce invalid filesystem characters. The `resolveFilenameTemplate` helper must sanitize the canvas name to filesystem-safe characters.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM formatting | Custom LLM client | Existing `callLLM` in canvas-executor.ts | Already handles LiteLLM auth, error handling, token counting |
| Connector invocation | New HTTP client | Copy pattern from `case 'connector'` in executor | Already handles timeout, abort, headers, error logging |
| File path construction | Manual string concat | `path.join` + `process['env']['PROJECTS_PATH']` pattern | Consistent with 9+ existing routes, handles OS path separators |
| Template variable resolution | Complex template engine | Simple string `.replace()` with 4 known variables | Only 4 variables needed; no need for handlebars/mustache |

**Key insight:** The storage node is essentially a connector-node with added local file writing capability. Nearly every piece of infrastructure already exists.

## Common Pitfalls

### Pitfall 1: NODE_TYPES Inside Component Body
**What goes wrong:** React remounts all nodes on every render if NODE_TYPES is recreated
**Why it happens:** Putting the constant inside the component function creates new object identity each render
**How to avoid:** NODE_TYPES is already a module-level constant (line 45 comment: "NEVER inside component body"). Add `storage: StorageNode` there.
**Warning signs:** All nodes flash/reset when clicking anything

### Pitfall 2: Missing `recursive: true` on mkdirSync
**What goes wrong:** File write fails when subdir contains nested paths like `reports/monthly`
**Why it happens:** `fs.mkdirSync` without `recursive: true` fails if parent dirs don't exist
**How to avoid:** Always use `fs.mkdirSync(dir, { recursive: true })` -- same as catbrain sources pattern
**Warning signs:** "ENOENT: no such file or directory" errors in executor

### Pitfall 3: Path Traversal in Filename Template
**What goes wrong:** User could craft a filename like `../../etc/passwd` or `{title}` resolves to something with `..`
**Why it happens:** No sanitization of user-provided filename or subdir
**How to avoid:** After resolving template variables, strip `..` and leading `/` from both filename and subdir. Use `path.basename()` on the final filename. Validate subdir segments don't contain `..`.
**Warning signs:** Files written outside the storage directory

### Pitfall 4: Connector Mode Without Connector Selected
**What goes wrong:** Node configured as `connector` or `both` mode but no connectorId set -- silent failure
**Why it happens:** Config panel allows saving without selecting a connector
**How to avoid:** In executor, if storage_mode includes connector and no connectorId, skip connector step silently (don't fail the node). Log a warning. The node should still succeed for local mode if mode is 'both'.
**Warning signs:** Node marked as failed when connector is not configured

### Pitfall 5: process.env Bracket Notation
**What goes wrong:** `process.env.PROJECTS_PATH` gets inlined by webpack at build time to `undefined`
**Why it happens:** Next.js webpack replaces `process.env.X` with build-time values
**How to avoid:** Always use `process['env']['PROJECTS_PATH']` (bracket notation) -- this is a critical project convention
**Warning signs:** File writes go to wrong directory or fail silently

### Pitfall 6: LLM Formatting Losing Original Content on Error
**What goes wrong:** If LLM call fails, content is lost
**Why it happens:** If `callLLM` throws and the error isn't caught, the entire node fails
**How to avoid:** Wrap LLM formatting in try/catch. On failure, log warning and fall back to saving unformatted content.
**Warning signs:** Storage node fails instead of gracefully degrading

## Code Examples

### Storage Node Component (STOR-02)
```typescript
// Pattern derived from connector-node.tsx with teal color scheme
"use client";
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { HardDrive, Check, X, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function StorageNode({ data, selected }: NodeProps) {
  const t = useTranslations('canvas');
  const nodeData = data as {
    label?: string;
    storage_mode?: 'local' | 'connector' | 'both';
    filename_template?: string;
    subdir?: string;
  };

  const execStatus = (data as Record<string, unknown>).executionStatus as string | undefined;
  const isRunning = execStatus === 'running';
  const isCompleted = execStatus === 'completed';
  const isFailed = execStatus === 'failed';
  const isWaiting = execStatus === 'waiting';
  const isSkipped = execStatus === 'skipped';

  const borderClass =
    isRunning   ? 'border-violet-400 animate-pulse shadow-violet-500/30 shadow-lg' :
    isCompleted ? 'border-emerald-400 shadow-emerald-500/20 shadow-md' :
    isFailed    ? 'border-red-400 shadow-red-500/20 shadow-md' :
    isWaiting   ? 'border-amber-400 animate-pulse shadow-amber-500/20 shadow-md' :
    isSkipped   ? 'border-zinc-600 opacity-50' :
    selected    ? 'border-teal-400' : 'border-teal-600';

  // Mode badge text
  const modeLabel = nodeData.storage_mode === 'both'
    ? t('nodes.storageBoth')
    : nodeData.storage_mode === 'connector'
      ? t('nodes.storageConnector')
      : t('nodes.storageLocal');

  return (
    <div className={`w-[220px] min-h-[80px] rounded-xl bg-teal-950/80 border-2 transition-colors relative ${borderClass} p-3`}>
      <Handle type="target" position={Position.Left}
        style={{ background: '#0d9488', width: 10, height: 10 }} />

      <div className="flex items-center gap-2 mb-2">
        <HardDrive className="w-4 h-4 text-teal-400 shrink-0" />
        <span className="text-sm font-semibold text-teal-100 truncate">
          {nodeData.label || t('nodes.storage')}
        </span>
      </div>

      {nodeData.filename_template && (
        <div className="text-xs text-zinc-400 truncate">{nodeData.filename_template}</div>
      )}

      <span className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-teal-800/60 text-teal-300`}>
        {modeLabel}
      </span>

      <Handle type="source" position={Position.Right}
        style={{ background: '#0d9488', width: 10, height: 10 }} />

      {execStatus && execStatus !== 'pending' && (
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs">
          {isRunning && <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />}
          {isCompleted && <Check className="w-4 h-4 text-emerald-400" />}
          {isFailed && <X className="w-4 h-4 text-red-400" />}
          {isWaiting && <Clock className="w-4 h-4 text-amber-400" />}
        </div>
      )}
    </div>
  );
}
```

### Storage Executor Logic (STOR-04, STOR-05, STOR-06, STOR-07, STOR-08)
```typescript
// In canvas-executor.ts dispatchNode switch, add before 'default':
case 'storage': {
  let content = predecessorOutput;

  // STOR-05: Optional LLM formatting
  if (data.use_llm_format && data.format_instructions) {
    try {
      const model = (data.format_model as string) || 'gemini-main';
      const systemPrompt = `Formatea el siguiente contenido segun estas instrucciones: ${data.format_instructions}. Responde SOLO con el contenido formateado, sin explicaciones adicionales.`;
      const llmResult = await callLLM(model, systemPrompt, content);
      content = llmResult.output;

      logUsage({
        event_type: 'canvas_execution',
        model,
        input_tokens: llmResult.input_tokens,
        output_tokens: llmResult.output_tokens,
        total_tokens: llmResult.tokens,
        duration_ms: llmResult.duration_ms,
        status: 'success',
        metadata: { canvas_id: canvasId, run_id: runId, node_id: node.id, node_type: 'storage', via: 'llm_format' },
      });
    } catch (err) {
      logger.error('canvas', 'Error LLM format en storage node, usando contenido sin formato', {
        error: (err as Error).message, nodeId: node.id,
      });
      // Fallback: use unformatted content
    }
  }

  // STOR-04: Resolve filename template
  const template = (data.filename_template as string) || '{title}_{date}.md';
  const resolvedFilename = resolveFilenameTemplate(template, runId, canvasId);

  const storageMode = (data.storage_mode as string) || 'local';

  // STOR-06: Local mode
  if (storageMode === 'local' || storageMode === 'both') {
    const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
    const subdir = sanitizeSubdir((data.subdir as string) || '');
    const storageDir = path.join(projectsPath, 'storage', subdir);

    fs.mkdirSync(storageDir, { recursive: true });
    const safeFilename = path.basename(resolvedFilename);
    fs.writeFileSync(path.join(storageDir, safeFilename), content, 'utf-8');

    logger.info('canvas', 'Storage node: archivo guardado', {
      canvasId, runId, nodeId: node.id, path: path.join(storageDir, safeFilename),
    });
  }

  // STOR-07: Connector mode
  if (storageMode === 'connector' || storageMode === 'both') {
    const connectorId = data.connectorId as string;
    if (connectorId) {
      const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND is_active = 1').get(connectorId) as
        | Record<string, unknown> | undefined;
      if (connector) {
        const connConfig = connector.config ? JSON.parse(connector.config as string) : {};
        const payload = {
          canvas_id: canvasId,
          run_id: runId,
          node_id: node.id,
          input: content,
          filename: resolvedFilename,
          metadata: {},
        };
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), (connConfig.timeout || 30) * 1000);
          await fetch(connConfig.url, {
            method: connConfig.method || 'POST',
            headers: { 'Content-Type': 'application/json', ...(connConfig.headers || {}) },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timeout);
        } catch (err) {
          logger.error('canvas', 'Error connector en storage node', {
            error: (err as Error).message, nodeId: node.id,
          });
        }
      }
    }
  }

  // STOR-08: Pass content to next node
  return { output: content };
}
```

### Config Panel Form (STOR-03)
```typescript
// In node-config-panel.tsx, add renderStorageForm
function renderStorageForm() {
  const storageMode = (data.storage_mode as string) || 'local';

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.storage.mode')}</label>
        <select
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
          value={storageMode}
          onChange={e => update({ storage_mode: e.target.value })}
        >
          <option value="local">{t('nodeConfig.storage.modeLocal')}</option>
          <option value="connector">{t('nodeConfig.storage.modeConnector')}</option>
          <option value="both">{t('nodeConfig.storage.modeBoth')}</option>
        </select>
      </div>

      {/* Filename template */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.storage.filenameTemplate')}</label>
        <input
          type="text"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
          placeholder="{title}_{date}_{time}.md"
          value={(data.filename_template as string) || ''}
          onChange={e => update({ filename_template: e.target.value })}
        />
        <p className="text-[10px] text-zinc-500 mt-1">
          {t('nodeConfig.storage.filenameHelp')}
        </p>
      </div>

      {/* Subdir (local mode) */}
      {(storageMode === 'local' || storageMode === 'both') && (
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.storage.subdir')}</label>
          <input
            type="text"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            placeholder="reports"
            value={(data.subdir as string) || ''}
            onChange={e => update({ subdir: e.target.value })}
          />
        </div>
      )}

      {/* Connector selector (connector mode) */}
      {(storageMode === 'connector' || storageMode === 'both') && (
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.storage.connector')}</label>
          <select ...>
            {/* Load connectors same as renderConnectorForm */}
          </select>
        </div>
      )}

      {/* LLM formatting toggle */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!(data.use_llm_format)}
          onChange={e => update({ use_llm_format: e.target.checked })}
        />
        <label className="text-sm text-zinc-300">{t('nodeConfig.storage.useLlmFormat')}</label>
      </div>

      {/* Format instructions (shown when LLM enabled) */}
      {data.use_llm_format && (
        <>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.storage.formatInstructions')}</label>
            <textarea
              rows={3}
              placeholder={t('nodeConfig.storage.formatPlaceholder')}
              value={(data.format_instructions as string) || ''}
              onChange={e => update({ format_instructions: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.storage.formatModel')}</label>
            <input
              type="text"
              placeholder="gemini-main"
              value={(data.format_model as string) || ''}
              onChange={e => update({ format_model: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}
```

### i18n Keys Needed
```json
{
  "canvas": {
    "nodeDefaults": {
      "storage": "Almacenamiento"
    },
    "nodes": {
      "storage": "Almacenamiento",
      "storageLocal": "Local",
      "storageConnector": "Conector",
      "storageBoth": "Local + Conector"
    },
    "nodeConfig": {
      "storage": {
        "mode": "Modo de almacenamiento",
        "modeLocal": "Archivo local",
        "modeConnector": "Conector externo",
        "modeBoth": "Local + Conector",
        "filenameTemplate": "Plantilla de nombre",
        "filenameHelp": "Variables: {date}, {time}, {run_id}, {title}",
        "subdir": "Subdirectorio",
        "connector": "Conector",
        "noConnector": "Sin conector",
        "useLlmFormat": "Formatear con LLM antes de guardar",
        "formatInstructions": "Instrucciones de formato",
        "formatPlaceholder": "Ej: Formatea como tabla markdown con columnas...",
        "formatModel": "Modelo (opcional)"
      }
    },
    "palette": {
      "storage": "Storage",
      "tooltips": {
        "storage": "Storage — guarda resultados en archivos o conectores"
      }
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No file persistence in canvas | Storage node for saving results | This phase | Enables workflow output archival and external integration |
| Connector-only external output | Local files + connectors + LLM formatting | This phase | More flexible output options |

## Open Questions

1. **Gmail Connector Support in Storage Mode**
   - What we know: The executor already handles Gmail connectors specially (line 439). Storage node connector mode uses the generic HTTP pattern.
   - What's unclear: Should the storage node support Gmail connectors (email as storage destination)?
   - Recommendation: NO -- keep it simple. Storage connector mode targets HTTP/webhook connectors. Gmail is a notification concern, not storage. If needed later, extend.

2. **File Overwrite vs Unique Names**
   - What we know: If two runs use the same filename template without `{run_id}` or `{time}`, they'll overwrite.
   - What's unclear: Should the node append a counter or always overwrite?
   - Recommendation: Overwrite by default. The `{run_id}` and `{time}` variables exist for uniqueness. Users who want unique files use those variables. This is simpler and more predictable.

3. **Connector List in Config Panel**
   - What we know: The connector config panel (renderConnectorForm) already fetches `/api/connectors` and shows a dropdown. Storage node needs the same.
   - What's unclear: Should it filter by connector type (only http_api and n8n_webhook)?
   - Recommendation: Show all connectors like the existing connector node does. Let the user choose. The executor will attempt the HTTP call regardless of type.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (in use) |
| Config file | app/vitest.config.ts |
| Quick run command | `cd app && npx vitest run --reporter=verbose` |
| Full suite command | `cd app && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STOR-01 | Storage in NODE_TYPES and palette | unit | `cd app && npx vitest run src/components/canvas/__tests__/storage-registration.test.ts` | No - Wave 0 |
| STOR-02 | StorageNode renders with teal colors and handles | unit | `cd app && npx vitest run src/components/canvas/nodes/__tests__/storage-node.test.ts` | No - Wave 0 |
| STOR-04 | Filename template resolves variables correctly | unit | `cd app && npx vitest run src/lib/services/__tests__/canvas-executor-storage.test.ts` | No - Wave 0 |
| STOR-05 | LLM formatting called when enabled | unit | `cd app && npx vitest run src/lib/services/__tests__/canvas-executor-storage.test.ts` | No - Wave 0 |
| STOR-06 | Local mode writes file to correct path | unit | `cd app && npx vitest run src/lib/services/__tests__/canvas-executor-storage.test.ts` | No - Wave 0 |
| STOR-07 | Connector mode invokes connector URL | unit | `cd app && npx vitest run src/lib/services/__tests__/canvas-executor-storage.test.ts` | No - Wave 0 |
| STOR-08 | Output passes content to next node | unit | `cd app && npx vitest run src/lib/services/__tests__/canvas-executor-storage.test.ts` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd app && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/src/lib/services/__tests__/canvas-executor-storage.test.ts` -- covers STOR-04, STOR-05, STOR-06, STOR-07, STOR-08
- [ ] `app/src/components/canvas/nodes/__tests__/storage-node.test.ts` -- covers STOR-02
- [ ] No test infrastructure setup needed -- vitest already configured

## Sources

### Primary (HIGH confidence)
- `app/src/components/canvas/canvas-editor.tsx` -- NODE_TYPES registration, getDefaultNodeData, NODE_DIMENSIONS, getMiniMapNodeColor patterns
- `app/src/components/canvas/nodes/connector-node.tsx` -- Single-handle node component pattern (template for storage node)
- `app/src/components/canvas/nodes/scheduler-node.tsx` -- Multi-handle node component pattern (reference, but storage uses single handle)
- `app/src/components/canvas/node-palette.tsx` -- PALETTE_ITEMS, MODE_ALLOWED_TYPES
- `app/src/components/canvas/node-config-panel.tsx` -- formRenderers pattern, NODE_TYPE_ICON, NODE_TYPE_LABEL_KEYS
- `app/src/lib/services/canvas-executor.ts` -- dispatchNode switch, callLLM helper, connector dispatch, getSkippedNodes
- `app/src/app/api/catbrains/[id]/sources/route.ts` -- PROJECTS_PATH + fs.mkdirSync + fs.writeFileSync pattern
- `app/src/lib/db.ts` -- canvas_runs schema (line 1003), connectors schema (line 932)
- `app/messages/es.json` -- Existing i18n key structure for canvas namespace
- `app/src/app/connectors/page.tsx` -- Connector types: n8n_webhook, http_api, mcp_server, email, gmail

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, patterns verified from source code
- Architecture: HIGH - Every pattern has a direct existing analogue in the codebase
- Pitfalls: HIGH - Derived from actual code analysis of executor and file writing patterns
- File writing: HIGH - PROJECTS_PATH pattern used identically across 9+ API routes

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable internal codebase)
