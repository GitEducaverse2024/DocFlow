# DocFlow - Guia Completa de Desarrollo

> Plataforma local de inteligencia documental con IA. Permite crear proyectos, subir fuentes heterogeneas, procesarlas con agentes LLM, indexar en base vectorial (RAG) y chatear con la documentacion.

---

## Indice

1. [Requisitos del sistema](#1-requisitos-del-sistema)
2. [Estructura del proyecto](#2-estructura-del-proyecto)
3. [Paso 1: Inicializar proyecto Next.js](#3-paso-1-inicializar-proyecto-nextjs)
4. [Paso 2: Instalar dependencias](#4-paso-2-instalar-dependencias)
5. [Paso 3: Configuracion base](#5-paso-3-configuracion-base)
6. [Paso 4: Componentes UI (shadcn)](#6-paso-4-componentes-ui-shadcn)
7. [Paso 5: Base de datos SQLite](#7-paso-5-base-de-datos-sqlite)
8. [Paso 6: Tipos TypeScript](#8-paso-6-tipos-typescript)
9. [Paso 7: Servicios backend](#9-paso-7-servicios-backend)
10. [Paso 8: API Routes](#10-paso-8-api-routes)
11. [Paso 9: Componentes de la aplicacion](#11-paso-9-componentes-de-la-aplicacion)
12. [Paso 10: Paginas](#12-paso-10-paginas)
13. [Paso 11: RAG Worker (proceso aislado)](#13-paso-11-rag-worker-proceso-aislado)
14. [Paso 12: Docker y despliegue](#14-paso-12-docker-y-despliegue)
15. [Bugs conocidos y soluciones](#15-bugs-conocidos-y-soluciones)
16. [Arquitectura y flujo de datos](#16-arquitectura-y-flujo-de-datos)

---

## 1. Requisitos del sistema

```
- Node.js 20+
- Docker y Docker Compose
- GPU NVIDIA con drivers (para Ollama) - opcional pero recomendado
- nvidia-container-toolkit (para GPU en Docker)
- 8GB+ RAM del sistema
- Servicios externos opcionales:
  - LiteLLM (gateway LLM) en puerto 4000
  - OpenClaw (agentes) en puerto 18789
  - n8n (webhooks) en puerto 5678
```

---

## 2. Estructura del proyecto

```
docflow/
├── app/                          # Aplicacion Next.js
│   ├── src/
│   │   ├── app/                  # App Router (paginas + API)
│   │   │   ├── layout.tsx        # Layout raiz
│   │   │   ├── page.tsx          # Dashboard
│   │   │   ├── globals.css       # Estilos globales
│   │   │   ├── fonts/            # Fuentes Geist
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx      # Lista de proyectos
│   │   │   │   ├── new/page.tsx  # Crear proyecto
│   │   │   │   └── [id]/page.tsx # Detalle proyecto (pipeline)
│   │   │   ├── system/page.tsx   # Monitor de servicios
│   │   │   └── api/
│   │   │       ├── health/route.ts
│   │   │       ├── agents/route.ts
│   │   │       ├── agents/create/route.ts
│   │   │       └── projects/
│   │   │           ├── route.ts
│   │   │           └── [id]/
│   │   │               ├── route.ts
│   │   │               ├── sources/route.ts
│   │   │               ├── sources/[sid]/route.ts
│   │   │               ├── sources/reorder/route.ts
│   │   │               ├── process/route.ts
│   │   │               ├── process/status/route.ts
│   │   │               ├── process/history/route.ts
│   │   │               ├── process/callback/route.ts
│   │   │               ├── process/[vid]/output/route.ts
│   │   │               ├── rag/route.ts
│   │   │               ├── rag/create/route.ts
│   │   │               ├── rag/status/route.ts
│   │   │               ├── rag/info/route.ts
│   │   │               ├── rag/query/route.ts
│   │   │               ├── chat/route.ts
│   │   │               └── bot/create/route.ts
│   │   ├── components/
│   │   │   ├── ui/               # shadcn/ui (22 componentes)
│   │   │   ├── layout/sidebar.tsx
│   │   │   ├── sources/          # 7 componentes de fuentes
│   │   │   ├── process/          # process-panel, version-history
│   │   │   ├── rag/rag-panel.tsx
│   │   │   ├── chat/chat-panel.tsx
│   │   │   ├── projects/         # pipeline-nav, connection-status-bar
│   │   │   └── system/           # health panels y diagnosticos
│   │   ├── lib/
│   │   │   ├── db.ts             # SQLite con better-sqlite3
│   │   │   ├── types.ts          # Interfaces TypeScript
│   │   │   ├── utils.ts          # Utilidad cn()
│   │   │   └── services/
│   │   │       ├── qdrant.ts     # Cliente Qdrant
│   │   │       ├── litellm.ts    # Cliente LiteLLM
│   │   │       ├── ollama.ts     # Cliente Ollama (embeddings)
│   │   │       ├── rag.ts        # Orquestador RAG
│   │   │       └── rag-jobs.ts   # Tracker de jobs en memoria
│   │   └── hooks/
│   │       └── use-system-health.ts
│   ├── scripts/
│   │   └── rag-worker.mjs        # Worker RAG (proceso separado)
│   ├── public/                    # Assets estaticos
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── tsconfig.json
│   ├── components.json           # Config shadcn
│   └── .eslintrc.json
├── docker-compose.yml
├── .env
└── qdrant-data/                  # Persistencia Qdrant
```

---

## 3. Paso 1: Inicializar proyecto Next.js

```bash
mkdir docflow && cd docflow
mkdir app && cd app

npx create-next-app@14.2.35 . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"
```

### next.config.js

**CRITICO**: Debe tener `output: 'standalone'` para Docker:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

module.exports = nextConfig;
```

---

## 4. Paso 2: Instalar dependencias

```bash
# UI y componentes
npm install shadcn@4.0.2 class-variance-authority@0.7.1 clsx@2.1.1 tailwind-merge@3.5.0
npm install tailwindcss-animate@1.0.7 @tailwindcss/typography@0.5.19
npm install lucide-react@0.577.0 sonner@2.0.7 next-themes@0.4.6
npm install @base-ui/react@1.2.0

# Drag & drop
npm install @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2

# Base de datos
npm install better-sqlite3@12.6.2
npm install -D @types/better-sqlite3@7.6.13

# Utilidades
npm install uuid@13.0.0 react-dropzone@15.0.0 react-markdown@10.1.0 remark-gfm@4.0.1
npm install -D @types/uuid@10.0.0
```

---

## 5. Paso 3: Configuracion base

### tailwind.config.ts

```typescript
import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;

export default config;
```

### components.json (shadcn/ui)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### Instalar componentes shadcn/ui

```bash
npx shadcn@latest add button card input label textarea select badge dialog \
  sheet tabs separator scroll-area slider checkbox radio-group dropdown-menu \
  tooltip skeleton sonner
```

### globals.css - Tema oscuro zinc

El `globals.css` debe incluir las variables CSS para el tema oscuro basado en zinc. El tema claro puede ser el por defecto de shadcn, pero el tema oscuro usa colores zinc:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    /* ... colores claros estandar de shadcn ... */
    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
}
```

### src/lib/utils.ts

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 6. Paso 4: Componentes UI adicionales

Ademas de los componentes shadcn estandar, crear estos componentes custom:

### src/components/ui/error-boundary.tsx

```typescript
"use client";
import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return <div className="p-4 text-red-500">Error al cargar componente</div>;
    }
    return this.props.children;
  }
}
```

### src/components/ui/help-text.tsx

Tooltip de ayuda con icono `?` para formularios.

### src/components/ui/section-info.tsx

Componente informativo para secciones vacias.

---

## 7. Paso 5: Base de datos SQLite

### src/lib/db.ts

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process['env']['DATABASE_PATH'] || path.join(process.cwd(), 'data', 'docflow.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    purpose TEXT,
    tech_stack TEXT,
    status TEXT DEFAULT 'draft',
    agent_id TEXT,
    current_version INTEGER DEFAULT 0,
    rag_enabled INTEGER DEFAULT 0,
    rag_collection TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    file_path TEXT,
    file_type TEXT,
    file_size INTEGER,
    url TEXT,
    youtube_id TEXT,
    content_text TEXT,
    status TEXT DEFAULT 'pending',
    extraction_log TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    order_index INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS processing_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    agent_id TEXT,
    status TEXT DEFAULT 'queued',
    input_sources TEXT,
    output_path TEXT,
    output_format TEXT DEFAULT 'md',
    tokens_used INTEGER,
    duration_seconds INTEGER,
    error_log TEXT,
    instructions TEXT,
    started_at TEXT,
    completed_at TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS custom_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🤖',
    model TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Columnas adicionales (migraciones seguras)
try { db.exec('ALTER TABLE projects ADD COLUMN bot_created INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE projects ADD COLUMN bot_agent_id TEXT'); } catch {}

export default db;
```

### BUG CRITICO: datetime('now') en produccion

**Webpack minifica `'now'` a `"now"` en el build de produccion.** SQLite interpreta `"now"` como nombre de columna, no como string.

**Solucion**: En TODAS las queries SQL en API routes, usar parametros `?` con `new Date().toISOString()`:

```typescript
// MAL (crashea en produccion):
db.prepare(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`).run(id);

// BIEN:
db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
```

**Esto aplica a TODOS los INSERT/UPDATE en API routes.** Los `CREATE TABLE` con `DEFAULT (datetime('now'))` funcionan porque SQLite los ejecuta internamente, no pasan por webpack.

Tambien, **nunca usar comillas dobles para valores string en SQL**:
```typescript
// MAL (webpack convierte 'processing' a "processing"):
db.prepare(`UPDATE projects SET status = "processing"`);

// BIEN:
db.prepare(`UPDATE projects SET status = ? WHERE id = ?`).run('processing', id);
```

---

## 8. Paso 6: Tipos TypeScript

### src/lib/types.ts

```typescript
export interface Project {
  id: string;
  name: string;
  description: string | null;
  purpose: string | null;
  tech_stack: string | null;
  status: 'draft' | 'sources_added' | 'processing' | 'processed' | 'rag_indexed';
  agent_id: string | null;
  current_version: number;
  rag_enabled: number;
  rag_collection: string | null;
  bot_created?: number;
  bot_agent_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  project_id: string;
  type: 'file' | 'url' | 'youtube' | 'note';
  name: string;
  description: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  url: string | null;
  youtube_id: string | null;
  content_text: string | null;
  status: 'pending' | 'ready' | 'error' | 'extracting';
  extraction_log: string | null;
  created_at: string;
  order_index: number;
}

export interface ProcessingRun {
  id: string;
  project_id: string;
  version: number;
  agent_id: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  input_sources: string | null;
  output_path: string | null;
  output_format: string;
  tokens_used: number | null;
  duration_seconds: number | null;
  error_log: string | null;
  instructions: string | null;
  started_at: string | null;
  completed_at: string | null;
}
```

---

## 9. Paso 7: Servicios backend

### src/lib/services/qdrant.ts

Cliente HTTP para Qdrant (vector database):
- `healthCheck()` - GET /collections
- `createCollection(name, vectorSize)` - PUT /collections/{name}
- `deleteCollection(name)` - DELETE /collections/{name}
- `getCollectionInfo(name)` - GET /collections/{name}
- `upsertPoints(name, points)` - PUT /collections/{name}/points
- `search(name, vector, limit)` - POST /collections/{name}/points/search

URL por defecto: `process.env.QDRANT_URL || 'http://192.168.1.49:6333'`

### src/lib/services/litellm.ts

Cliente HTTP para LiteLLM (gateway LLM):
- `healthCheck()` - GET /v1/models
- `getEmbeddings(texts, model)` - POST /v1/embeddings (legacy, reemplazado por Ollama)
- `getVectorSize(model)` - Retorna dimensiones segun modelo

URL: `process.env.LITELLM_URL`, API Key: `process.env.LITELLM_API_KEY`

### src/lib/services/ollama.ts

Cliente HTTP para Ollama (embeddings locales):

```typescript
const OLLAMA_URL = process['env']['OLLAMA_URL'] || 'http://docflow-ollama:11434';

const DIMS_TO_MODEL: Record<number, string> = {
  768: 'nomic-embed-text',
  1024: 'mxbai-embed-large',
  384: 'all-minilm',
};

export const ollama = {
  async healthCheck() {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  },

  async getEmbedding(text: string, model: string = 'nomic-embed-text'): Promise<number[]> {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
    });
    const data = await res.json();
    return data.embeddings?.[0] || data.embedding;
  },

  guessModelFromVectorSize(vectorSize: number): string {
    return DIMS_TO_MODEL[vectorSize] || 'nomic-embed-text';
  },
};
```

### src/lib/services/rag.ts

Orquestador RAG (chunking + indexacion). **Nota**: La indexacion real la hace el worker separado (`scripts/rag-worker.mjs`), pero este servicio contiene la logica de chunking reutilizable.

**BUG CRITICO en chunkText**: El loop de chunking con overlap puede retroceder y generar un loop infinito si el breakpoint esta muy cerca del inicio del chunk. Fix obligatorio:

```typescript
chunkText(text: string, chunkSize: number, chunkOverlap: number): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + chunkSize, text.length);
    if (end < text.length) {
      let breakPoint = text.lastIndexOf('\n\n', end);
      if (breakPoint <= i) breakPoint = text.lastIndexOf('\n', end);
      if (breakPoint <= i) breakPoint = text.lastIndexOf('. ', end);
      if (breakPoint <= i) breakPoint = text.lastIndexOf(' ', end);
      if (breakPoint > i) end = breakPoint + 1;
    }
    const chunk = text.slice(i, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    // SIEMPRE avanzar - NUNCA retroceder
    const nextI = end - chunkOverlap;
    i = nextI > i ? nextI : end;
    if (chunks.length > 5000) break; // safety limit
  }
  return chunks;
}
```

### src/lib/services/rag-jobs.ts

Tracker en memoria para jobs de indexacion RAG:

```typescript
export interface RagJob {
  id: string;
  projectId: string;
  status: 'running' | 'completed' | 'error';
  progress: string;
  startedAt: number;
  completedAt?: number;
  error?: string;
  chunksCount?: number;
}

// Map<projectId, RagJob>
```

Metodos: `create()`, `get()`, `updateProgress()`, `complete()`, `fail()`, `remove()`

---

## 10. Paso 8: API Routes

### Patron general

Todas las API routes siguen este patron:
- `export const dynamic = 'force-dynamic'` cuando sea necesario
- Try/catch con NextResponse.json
- Usar `new Date().toISOString()` en vez de `datetime('now')` en SQL
- Usar parametros `?` en SQL en vez de strings embebidos

### GET /api/health

Health check de todos los servicios (DocFlow DB, OpenClaw, n8n, Qdrant, LiteLLM, Ollama). Retorna status, latencia, modelos disponibles.

### CRUD Proyectos

- `GET /api/projects` - Lista con conteos de fuentes y versiones
- `POST /api/projects` - Crea con uuid, name, description, purpose, tech_stack
- `GET /api/projects/[id]` - Detalle
- `PATCH /api/projects/[id]` - Actualiza campos (agent_id, status, etc)
- `DELETE /api/projects/[id]` - Borra proyecto, fuentes y runs

### Fuentes

- `GET /api/projects/[id]/sources` - Lista ordenada por order_index
- `POST /api/projects/[id]/sources` - Sube archivo (FormData) o crea URL/YouTube/nota
- `PATCH /api/projects/[id]/sources/[sid]` - Actualiza
- `DELETE /api/projects/[id]/sources/[sid]` - Borra
- `POST /api/projects/[id]/sources/reorder` - Reordena (recibe array de IDs)

### Procesamiento

- `POST /api/projects/[id]/process` - Inicia procesamiento:
  1. Recoge content_text de todas las fuentes
  2. Envia a LiteLLM via /v1/chat/completions con instrucciones
  3. Guarda resultado como output.md en data/projects/{id}/processed/v{version}/
  4. Registra en processing_runs
- `GET /api/projects/[id]/process/status` - Ultimo run del proyecto
- `GET /api/projects/[id]/process/history` - Todos los runs
- `GET /api/projects/[id]/process/[vid]/output` - Lee output.md de una version

### RAG (indexacion vectorial)

- `POST /api/projects/[id]/rag/create` - **Critico: no ejecuta RAG inline**
  1. Valida proyecto (debe estar 'processed')
  2. Crea job en ragJobs (in-memory)
  3. Escribe status file en /tmp
  4. **Spawna `node scripts/rag-worker.mjs` como proceso hijo**
  5. Polling del status file cada 1s para actualizar ragJobs
  6. Retorna inmediatamente con `{ jobId, status: 'running' }`
- `GET /api/projects/[id]/rag/status` - Lee estado del job desde ragJobs
- `GET /api/projects/[id]/rag/info` - Info de la coleccion Qdrant
- `POST /api/projects/[id]/rag/query` - Busqueda semantica con Ollama + Qdrant
- `DELETE /api/projects/[id]/rag` - Borra coleccion

### Chat

- `POST /api/projects/[id]/chat` - Chat RAG:
  1. Genera embedding del mensaje con Ollama
  2. Busca en Qdrant los 5 chunks mas relevantes
  3. Construye prompt con contexto
  4. Envia a LiteLLM para generar respuesta
  5. Retorna respuesta + fuentes

### Agentes

- `GET /api/agents` - Merge de agentes OpenClaw + env fallback + custom_agents SQLite
- `POST /api/agents/create` - Crea agente custom en SQLite
- `POST /api/projects/[id]/bot/create` - Crea workspace OpenClaw con SOUL.md, AGENTS.md, etc.

---

## 11. Paso 9: Componentes de la aplicacion

### Layout: src/components/layout/sidebar.tsx

Sidebar izquierdo fijo con:
- Logo DocFlow
- Links: Dashboard, Proyectos, Configuracion
- Indicadores de salud de servicios (circulitos verde/rojo)

### Pipeline: src/components/projects/pipeline-nav.tsx

Navegacion horizontal de pasos del proyecto:
1. Fuentes (Files icon)
2. Procesar (Cpu icon)
3. Historial (Clock icon)
4. RAG (Database icon)
5. Chat (MessageCircle icon)

Cada paso tiene estado: `active | completed | pending | locked`

### Sources: src/components/sources/

- **source-manager.tsx** - Contenedor principal, tabs para tipo de fuente
- **file-upload-zone.tsx** - Drag-and-drop con react-dropzone
- **url-input.tsx** - Input para URLs
- **youtube-input.tsx** - Input para YouTube
- **note-editor.tsx** - Editor Markdown
- **source-list.tsx** - Lista sorteable con dnd-kit
- **source-item.tsx** - Item individual con acciones

### Process: src/components/process/

- **process-panel.tsx** - Panel principal:
  - Selector de agente (Dialog con lista de agentes)
  - Creacion de agentes custom inline
  - Boton de procesar
  - Log de progreso simulado (timer-based)
  - Preview del documento generado (Dialog ancho 95vw)

- **version-history.tsx** - Lista de versiones procesadas con preview

### RAG: src/components/rag/rag-panel.tsx

Dos vistas:
1. **Sin indexar**: Formulario de configuracion (nombre coleccion, modelo Ollama, chunk size, overlap) + boton indexar
2. **Indexado**: Stats (vectores, coleccion), botones re-indexar/eliminar, panel de consulta semantica, codigo de integracion MCP

Polling cada 2s al endpoint `/rag/status` durante indexacion. Log de progreso real del servidor.

### Chat: src/components/chat/chat-panel.tsx

Interfaz de chat con:
- Lista de mensajes (usuario + bot)
- Input con envio por Enter
- Muestra fuentes usadas en cada respuesta

### System: src/components/system/

- **system-health-panel.tsx** - Dashboard de salud de todos los servicios
- **service-card.tsx** - Card por servicio (status, latencia, detalles)
- **diagnostic-sheet.tsx** - Panel lateral con diagnosticos detallados

---

## 12. Paso 10: Paginas

### src/app/layout.tsx

Layout raiz con:
- ThemeProvider (dark mode forzado)
- Sidebar
- Toaster (sonner)
- Fuentes Geist

### src/app/page.tsx (Dashboard)

Vista general con:
- Conteo de proyectos
- Proyectos recientes
- Estado de servicios resumido

### src/app/projects/page.tsx

Lista de proyectos con badges de status y acciones.

### src/app/projects/new/page.tsx

Wizard de creacion: nombre, descripcion, proposito, tech stack.

### src/app/projects/[id]/page.tsx

**Pagina principal del proyecto** con:
- Breadcrumb
- Header (nombre, status badge, botones configurar/eliminar)
- PipelineNav (5 pasos)
- Contenido condicional segun paso activo

**Auto-avance de pasos**: useEffect en `refreshTrigger` recalcula estados y avanza al siguiente paso pendiente cuando el actual se completa.

### src/app/system/page.tsx

Panel de monitorizacion de servicios.

---

## 13. Paso 11: RAG Worker (proceso aislado)

### scripts/rag-worker.mjs

**Por que un proceso separado**: El servidor Next.js standalone consume mucha memoria base (~1.5GB+). Ejecutar chunking + embeddings + upsert dentro del mismo proceso causa OOM y mata el servidor. El worker corre en un proceso Node.js separado con su propio limite de memoria.

**Caracteristicas**:
- Sin dependencias npm - usa solo APIs nativas de Node.js 20 (fetch, fs, crypto)
- Recibe parametros via JSON en argv[2]
- Comunica progreso via archivo JSON en /tmp
- Auto-descarga modelo de Ollama si no existe (`/api/pull`)
- Detecta dimensiones del vector automaticamente
- Procesa 1 chunk a la vez para minimizar memoria
- Safety limit de 5000 chunks

**Flujo**:
1. Lee args (projectId, version, collectionName, model, statusFile, etc.)
2. Verifica Ollama y disponibilidad del modelo
3. Lee documento markdown procesado
4. Chunking con overlap (fix anti-loop infinito)
5. Detecta vector size con embedding de prueba
6. Crea/recrea coleccion Qdrant
7. Loop: embed chunk -> upsert a Qdrant (1 a 1)
8. Escribe status final (completed/error)

---

## 14. Paso 12: Docker y despliegue

### Dockerfile

```dockerfile
FROM node:20-slim AS base

FROM base AS deps
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Worker RAG (proceso separado)
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
RUN mkdir -p /tmp && chown nextjs:nodejs /tmp

USER nextjs
EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
ENV NODE_OPTIONS="--max-old-space-size=4096"

CMD ["node", "server.js"]
```

**CRITICO**: `python3 make g++` son necesarios para compilar `better-sqlite3` (modulo nativo).

### docker-compose.yml

```yaml
version: '3.8'

services:
  docflow:
    build: ./app
    container_name: docflow-app
    ports:
      - "3500:3000"
    volumes:
      - ~/docflow-data:/app/data
      - ~/.openclaw:/app/openclaw
    env_file: .env
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      - qdrant
      - ollama
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:latest
    container_name: docflow-qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - ./qdrant-data:/qdrant/storage
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    container_name: docflow-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    restart: unless-stopped

volumes:
  ollama-data:
```

### .env

```bash
# DocFlow
DATABASE_PATH=/app/data/docflow.db
PROJECTS_PATH=/app/data/projects

# Servicios externos
OPENCLAW_URL=http://192.168.1.49:18789
N8N_WEBHOOK_URL=http://192.168.1.49:5678
N8N_PROCESS_WEBHOOK_PATH=/webhook/docflow-process
QDRANT_URL=http://192.168.1.49:6333
LITELLM_URL=http://192.168.1.49:4000
LITELLM_API_KEY=sk-antigravity-gateway

# Ollama (embeddings locales)
OLLAMA_URL=http://docflow-ollama:11434
EMBEDDING_MODEL=nomic-embed-text

# Agentes fallback
OPENCLAW_AGENTS=[{"id":"main","name":"Main","emoji":"🦞","model":"gemini-main","description":"Agente general"}]

# Ruta workspace bots
OPENCLAW_WORKSPACE_PATH=/home/deskmath/.openclaw
```

### .dockerignore

```
node_modules
.next
.git
```

### Comandos de despliegue

```bash
# Build y deploy completo
cd docflow
docker compose build --no-cache docflow && docker compose up -d

# Solo rebuild de la app (rapido)
cd docflow/app && npm run build && cd .. && \
docker compose build --no-cache docflow && docker compose up -d docflow

# Ver logs
docker compose logs -f docflow

# Alias recomendado (agregar a .bashrc):
alias dfdeploy='cd ~/docflow && docker compose build --no-cache docflow && docker compose up -d && echo "LISTO"'
```

---

## 15. Bugs conocidos y soluciones

### Bug 1: datetime('now') en produccion

**Sintoma**: `no such column: "now"` en cualquier operacion SQL.
**Causa**: Webpack minifica `'now'` a `"now"`. SQLite interpreta `"now"` como columna.
**Solucion**: Usar parametros `?` con `new Date().toISOString()` en TODOS los INSERT/UPDATE.

### Bug 2: Loop infinito en chunkText

**Sintoma**: OOM en el worker RAG incluso con documentos pequenos (~10KB).
**Causa**: Cuando `lastIndexOf` encuentra un breakpoint cerca del inicio del chunk, `end - overlap` retrocede, creando un loop infinito que genera millones de chunks.
**Solucion**: `const nextI = end - overlap; i = nextI > i ? nextI : end;` + safety limit de 5000 chunks.

### Bug 3: OOM al ejecutar RAG dentro de Next.js

**Sintoma**: `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`. El servidor se cae completamente.
**Causa**: El proceso Next.js standalone ya consume ~1.5-2GB. Cargar y ejecutar el pipeline RAG (embeddings + qdrant) dentro del mismo proceso supera el limite de heap.
**Solucion**: Ejecutar RAG en proceso hijo separado (`child_process.spawn` + `scripts/rag-worker.mjs`). El worker usa solo APIs nativas sin npm deps, corriendo en su propio proceso Node.js con limite de memoria independiente. Si el worker crashea, el servidor sigue vivo.

### Bug 4: Modelo de embeddings no disponible

**Sintoma**: `Invalid model name passed in model=text-embedding-3-small`.
**Causa**: LiteLLM no tenia modelos de embeddings configurados.
**Solucion**: Migrar a Ollama local para embeddings. El worker auto-descarga el modelo (`nomic-embed-text`, `mxbai-embed-large`, etc.).

### Bug 5: Permisos en bot/create

**Sintoma**: `EACCES: permission denied, mkdir` al crear bot.
**Causa**: El volumen `~/.openclaw` no tiene permisos de escritura para el usuario `nextjs` del contenedor.
**Solucion**: Fallback a `/app/data/bots/` si no puede escribir en el path de OpenClaw.

### Bug 6: Modelo de chat inexistente

**Sintoma**: `Failed to generate chat response` 500 en /chat.
**Causa**: Modelo hardcodeado (`gemini-3.1-pro-preview`) no existia en LiteLLM.
**Solucion**: Usar `process.env.CHAT_MODEL || 'gemini-main'` (configurable).

### Bug 7: Select onValueChange type error

**Sintoma**: Error TypeScript en shadcn Select.
**Causa**: `onValueChange` puede recibir `undefined`.
**Solucion**: `onValueChange={(v) => setState(v || 'default')}`.

---

## 16. Arquitectura y flujo de datos

```
                    ┌─────────────────────────────────┐
                    │         Browser (React)           │
                    │  Dashboard | Proyectos | Sistema  │
                    └────────────┬────────────────────┘
                                 │ HTTP
                    ┌────────────▼────────────────────┐
                    │      Next.js App (Docker)        │
                    │      Puerto 3500 → 3000          │
                    │                                   │
                    │  ┌─────────┐  ┌──────────────┐  │
                    │  │ SQLite  │  │  API Routes   │  │
                    │  │ (data/) │  │  (26 routes)  │  │
                    │  └─────────┘  └──────┬───────┘  │
                    └──────────────────────┼──────────┘
                                           │
                    ┌──────────────────────┼──────────────────┐
                    │                      │                   │
          ┌─────────▼──────┐   ┌──────────▼────┐   ┌────────▼────────┐
          │    Ollama       │   │    Qdrant      │   │    LiteLLM      │
          │  (embeddings)   │   │  (vectores)    │   │  (LLM gateway)  │
          │  Puerto 11434   │   │  Puerto 6333   │   │  Puerto 4000    │
          │  GPU local      │   │                │   │                  │
          └────────────────┘   └────────────────┘   └──────────────────┘
                                                              │
                                                    ┌─────────▼─────────┐
                                                    │  LLMs (Gemini,    │
                                                    │  Claude, GPT...)  │
                                                    └───────────────────┘

  Flujo RAG (proceso aislado):
  ┌──────────────┐     spawn      ┌──────────────────┐
  │ API Route    │ ──────────────▶│ rag-worker.mjs   │
  │ /rag/create  │    (child)     │ (proceso Node.js │
  │              │◀─── /tmp ─────│  separado, 1GB)  │
  │ poll status  │  status.json   └──────┬───────────┘
  └──────────────┘                       │
                                ┌────────┼────────┐
                                │        │        │
                            Ollama    Qdrant   filesystem
                           (embed)   (upsert) (read .md)
```

### Flujo completo de un proyecto:

1. **Crear proyecto** → POST /api/projects → SQLite
2. **Subir fuentes** → POST /api/projects/{id}/sources (archivos, URLs, YouTube, notas)
3. **Seleccionar agente** → PATCH /api/projects/{id} (agent_id)
4. **Procesar** → POST /api/projects/{id}/process:
   - Lee content_text de fuentes
   - Envia a LiteLLM (chat/completions)
   - Guarda output.md en data/projects/{id}/processed/v{N}/
5. **Indexar RAG** → POST /api/projects/{id}/rag/create:
   - Spawna rag-worker.mjs
   - Worker: lee .md → chunking → Ollama embeddings → Qdrant upsert
   - Frontend hace polling cada 2s
6. **Chatear** → POST /api/projects/{id}/chat:
   - Ollama embedding del mensaje
   - Busqueda Qdrant top-5
   - LiteLLM genera respuesta con contexto
7. **Bot** → POST /api/projects/{id}/bot/create:
   - Crea workspace con SOUL.md, AGENTS.md, IDENTITY.md, USER.md

---

## Modelos de embeddings disponibles (Ollama)

| Modelo | Dimensiones | Tamano | Uso |
|--------|-------------|--------|-----|
| nomic-embed-text | 768 | ~270MB | Rapido, buena calidad general |
| mxbai-embed-large | 1024 | ~670MB | Alta precision |
| snowflake-arctic-embed | 1024 | ~670MB | Alternativa precisa |
| all-minilm | 384 | ~46MB | Ultra ligero |

El modelo se descarga automaticamente en la primera indexacion.

---

## Checklist de verificacion post-despliegue

- [ ] `docker compose ps` muestra 3 contenedores healthy
- [ ] `http://IP:3500` carga el dashboard
- [ ] `http://IP:3500/system` muestra Qdrant y Ollama conectados
- [ ] Crear proyecto + subir fuente funciona
- [ ] Procesar con agente genera output.md
- [ ] Indexar RAG descarga modelo y completa sin OOM
- [ ] Chat responde con contexto del proyecto
- [ ] Los logs no muestran errores: `docker compose logs -f docflow`
