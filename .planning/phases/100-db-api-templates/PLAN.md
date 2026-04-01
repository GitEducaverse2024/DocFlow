# Phase 100: DB + API Templates

## Goal
Existe tabla email_templates con CRUD completo y API de renderizado. Se puede crear, editar, listar y borrar templates via API.

## Requirements
DB-01, DB-02, DB-03, API-01, API-02, API-03, API-04, API-05, API-06, API-07

---

## Plan 01 — Modelo de datos, CRUD y renderizado

### Task 1: Tablas en db.ts
**File:** `app/src/lib/db.ts` (MODIFY — añadir al final de las CREATE TABLE)

```sql
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  structure TEXT NOT NULL DEFAULT '{}',
  html_preview TEXT,
  drive_folder_id TEXT,
  is_active INTEGER DEFAULT 1,
  times_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS template_assets (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  drive_file_id TEXT,
  drive_url TEXT,
  local_path TEXT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**JSON structure** (forward-compatible con filas/columnas de Phase 102):
```json
{
  "sections": {
    "header": {
      "rows": [
        {
          "id": "row-1",
          "columns": [
            {
              "id": "col-1",
              "width": "100%",
              "block": {"type": "logo", "src": "url", "alt": "Logo", "width": 200, "align": "left"}
            }
          ]
        }
      ]
    },
    "body": {
      "rows": [
        {
          "id": "row-2",
          "columns": [
            {
              "id": "col-2",
              "width": "100%",
              "block": {"type": "instruction", "text": "Saludo personalizado"}
            }
          ]
        }
      ]
    },
    "footer": {
      "rows": [
        {
          "id": "row-3",
          "columns": [
            {
              "id": "col-3",
              "width": "100%",
              "block": {"type": "text", "content": "Equipo Educa360"}
            }
          ]
        }
      ]
    }
  },
  "styles": {
    "backgroundColor": "#ffffff",
    "fontFamily": "Arial, sans-serif",
    "primaryColor": "#7C3AED",
    "textColor": "#333333",
    "maxWidth": 600
  }
}
```

**Tipos de bloque** (type field):
- `logo` — {src, alt, width, align: left|center|right}
- `image` — {src, alt, width, align: left|center|full}
- `video` — {url, thumbnailUrl} (YouTube URL → thumbnail)
- `text` — {content} (markdown-light: **bold**, *italic*, [link](url), lists)
- `instruction` — {text} (placeholder para el LLM)

### Task 2: Seed template basico
**File:** `app/src/lib/db.ts` (MODIFY — añadir seed)

Seed condicional (solo si no existe):
```typescript
const templateCount = db.prepare('SELECT COUNT(*) as c FROM email_templates').get();
if (templateCount.c === 0) {
  db.prepare(`INSERT INTO email_templates (id, name, description, category, structure, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`)
    .run('seed-template-basic', 'Plantilla Basica', 'Plantilla minimalista con instruccion de cuerpo y pie de firma', 'general', JSON.stringify({
      sections: {
        header: { rows: [] },
        body: { rows: [{ id: 'r1', columns: [{ id: 'c1', width: '100%', block: { type: 'instruction', text: 'Contenido principal del email' } }] }] },
        footer: { rows: [{ id: 'r2', columns: [{ id: 'c2', width: '100%', block: { type: 'text', content: 'Un saludo,\n\n**Equipo DoCatFlow**' } }] }] }
      },
      styles: { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', primaryColor: '#7C3AED', textColor: '#333333', maxWidth: 600 }
    }));
}
```

### Task 3: Tipos TypeScript
**File:** `app/src/lib/types.ts` (MODIFY — añadir interfaces)

```typescript
export interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  structure: string; // JSON string of TemplateStructure
  html_preview: string | null;
  drive_folder_id: string | null;
  is_active: number;
  times_used: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateBlock {
  type: 'logo' | 'image' | 'video' | 'text' | 'instruction';
  src?: string;
  alt?: string;
  width?: number | string;
  align?: 'left' | 'center' | 'right' | 'full';
  url?: string;
  thumbnailUrl?: string;
  content?: string;
  text?: string;
}

export interface TemplateColumn {
  id: string;
  width: string;
  block: TemplateBlock;
}

export interface TemplateRow {
  id: string;
  columns: TemplateColumn[];
}

export interface TemplateSection {
  rows: TemplateRow[];
}

export interface TemplateStructure {
  sections: {
    header: TemplateSection;
    body: TemplateSection;
    footer: TemplateSection;
  };
  styles: {
    backgroundColor: string;
    fontFamily: string;
    primaryColor: string;
    textColor: string;
    maxWidth: number;
  };
}

export interface TemplateAsset {
  id: string;
  template_id: string;
  filename: string;
  drive_file_id: string | null;
  drive_url: string | null;
  local_path: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  created_at: string;
}
```

### Task 4: API GET /api/email-templates (lista)
**File:** `app/src/app/api/email-templates/route.ts` (NEW)

```typescript
export const dynamic = 'force-dynamic';

// GET — lista templates con filtro por category y is_active
// Query params: ?category=commercial&active=1
// Devuelve array de templates (sin structure completa para ligereza, solo name/desc/category/times_used)

// POST — crear template
// Body: { name, description?, category?, structure? }
// Genera id con generateId()
// Devuelve el template creado con 201
```

### Task 5: API GET/PATCH/DELETE /api/email-templates/[id]
**File:** `app/src/app/api/email-templates/[id]/route.ts` (NEW)

```typescript
// GET — template completo con structure y assets
// JOIN con template_assets para incluir lista de assets

// PATCH — actualizar campos parciales
// Body puede incluir: name, description, category, structure, is_active

// DELETE — borrar template y sus assets (CASCADE)
```

### Task 6: API POST /api/email-templates/[id]/assets
**File:** `app/src/app/api/email-templates/[id]/assets/route.ts` (NEW)

```typescript
// POST — upload asset (imagen)
// Acepta multipart/form-data con file
// Guarda localmente en data/templates/{template-id}/{filename}
// Registra en template_assets
// Devuelve: { id, filename, local_path, url, mime_type }
// La URL es relativa: /api/email-templates/{id}/assets/{asset-id}

// GET — lista assets del template
```

**Nota:** El upload a Drive se hara en Phase 104. Por ahora, guardar localmente y servir via API.

### Task 7: API GET /api/email-templates/[id]/assets/[assetId]
**File:** `app/src/app/api/email-templates/[id]/assets/[assetId]/route.ts` (NEW)

```typescript
// GET — servir el asset (imagen) con content-type correcto
// Lee desde data/templates/{template-id}/{filename}
// Headers: Content-Type segun mime_type, Cache-Control
```

### Task 8: API POST /api/email-templates/[id]/render
**File:** `app/src/app/api/email-templates/[id]/render/route.ts` (NEW)

```typescript
// POST — renderizar HTML del template
// Body: { variables?: Record<string, string> }
// variables son pares instruction-id → contenido
// Genera HTML email-compatible:
//   - Table layout (600px max-width)
//   - Inline styles
//   - Logo/Image → <img src="url">
//   - Video → thumbnail con link a YouTube
//   - Text → markdown-to-html (simple: bold, italic, links, lists)
//   - Instruction sin variable → placeholder text visible
//   - Instruction con variable → contenido renderizado
// Devuelve: { html: string, text: string (plain-text fallback) }
```

**Funcion de renderizado** (crear como servicio reutilizable):
**File:** `app/src/lib/services/template-renderer.ts` (NEW)

```typescript
export function renderTemplate(
  structure: TemplateStructure,
  variables?: Record<string, string>
): { html: string; text: string } {
  // 1. Wrapper: table 600px, background color
  // 2. For each section (header, body, footer):
  //    For each row:
  //      <tr> with columns as <td> (width proportional)
  //      For each column → renderBlock()
  // 3. renderBlock():
  //    logo → <img align={align} width={width}>
  //    image → <img align={align} width={width}>
  //    video → <a href={youtube_url}><img src={thumbnail}></a>
  //    text → markdownToHtml(content) (simple parser: **b**, *i*, [link], - list)
  //    instruction → variables[id] || placeholder
  // 4. Plain-text fallback: strip HTML
}
```

### Task 9: Build + verificacion
- `npm run build` pasa sin errores
- Verificar via curl:
  - POST /api/email-templates crea template
  - GET /api/email-templates lista
  - GET /api/email-templates/{id} devuelve structure
  - PATCH actualiza
  - POST render genera HTML valido
  - DELETE borra

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `app/src/lib/db.ts` | MODIFY | Tablas email_templates + template_assets + seed |
| `app/src/lib/types.ts` | MODIFY | Interfaces EmailTemplate, TemplateStructure, etc. |
| `app/src/lib/services/template-renderer.ts` | NEW | Renderizado HTML email-compatible |
| `app/src/app/api/email-templates/route.ts` | NEW | GET lista + POST crear |
| `app/src/app/api/email-templates/[id]/route.ts` | NEW | GET detalle + PATCH + DELETE |
| `app/src/app/api/email-templates/[id]/assets/route.ts` | NEW | POST upload + GET lista |
| `app/src/app/api/email-templates/[id]/assets/[assetId]/route.ts` | NEW | GET servir asset |
| `app/src/app/api/email-templates/[id]/render/route.ts` | NEW | POST renderizar HTML |

---

## Verification Checklist

- [ ] Tabla email_templates existe en DB
- [ ] Tabla template_assets existe en DB
- [ ] Seed template basico creado automaticamente
- [ ] POST crea template con structure JSON
- [ ] GET lista templates con filtros
- [ ] GET /[id] devuelve template completo con assets
- [ ] PATCH actualiza campos parciales
- [ ] DELETE borra template + assets
- [ ] POST assets sube imagen y devuelve URL
- [ ] GET assets/[id] sirve la imagen
- [ ] POST render genera HTML valido con table layout
- [ ] npm run build sin errores
