# DocFlow - Sesion 2: Configuracion de Proyecto, Agentes IA y Gestion de API Keys

> Funcionalidades implementadas sobre la base documentada en `progressWebapp.md`. Esta sesion agrega gestion de proyectos (configurar/eliminar), creacion de agentes IA personalizados con generacion automatica, y un sistema completo de gestion de API Keys multi-proveedor.

---

## Indice

1. [Resumen de cambios](#1-resumen-de-cambios)
2. [Configurar y Eliminar proyecto](#2-configurar-y-eliminar-proyecto)
3. [Agentes IA personalizados](#3-agentes-ia-personalizados)
4. [Gestion de API Keys multi-proveedor](#4-gestion-de-api-keys-multi-proveedor)
5. [Servicio LLM unificado](#5-servicio-llm-unificado)
6. [Sidebar y navegacion](#6-sidebar-y-navegacion)
7. [Docker y volumenes](#7-docker-y-volumenes)
8. [Bugs resueltos](#8-bugs-resueltos)
9. [Archivos nuevos y modificados](#9-archivos-nuevos-y-modificados)
10. [Estructura actualizada](#10-estructura-actualizada)

---

## 1. Resumen de cambios

### Funcionalidades nuevas
- **Panel de configuracion de proyecto** (Sheet lateral) con edicion de nombre, descripcion, proposito, tech stack, agente, modelo por defecto, zona de peligro
- **Eliminacion de proyecto** con dialogo de doble confirmacion estilo GitHub (confirmar + escribir nombre)
- **Creacion de agentes IA** reutilizable desde wizard, panel de procesamiento y configuracion
- **Generacion con IA** de personalidad (SOUL.md), instrucciones (AGENTS.md) e identidad (IDENTITY.md)
- **Pagina /settings** con gestion completa de API Keys para 5 proveedores LLM
- **Servicio LLM unificado** (`lib/services/llm.ts`) que abstrae OpenAI, Anthropic, Google, LiteLLM y Ollama
- **Selector de modelos agrupado** por proveedor en creacion de agentes
- **Registro automatico en OpenClaw** al crear agentes (workspace + openclaw.json)

### Cambios en DB
- Nueva tabla `api_keys` con seed de 5 proveedores
- Nueva columna `default_model` en `projects`

---

## 2. Configurar y Eliminar proyecto

### 2.1 Dialogo de eliminacion (delete-project-dialog.tsx)

Componente: `src/components/projects/delete-project-dialog.tsx`

Patron de doble confirmacion estilo GitHub:
1. **Paso 1**: Muestra advertencia con lista de lo que se eliminara (fuentes, versiones, coleccion RAG, archivos)
2. **Paso 2**: Pide escribir el nombre exacto del proyecto para confirmar

```typescript
// Flujo de eliminacion
const handleDelete = async () => {
  // DELETE /api/projects/{id}
  // El endpoint ahora hace limpieza completa:
  // 1. Elimina coleccion Qdrant (try-catch, no bloquea)
  // 2. Elimina carpeta del proyecto en disco
  // 3. Elimina archivos de bot/workspace
  // 4. DELETE FROM projects (CASCADE borra sources y processing_runs)
  // 5. Redirige a /projects
};
```

### 2.2 Panel de configuracion (project-settings-sheet.tsx)

Componente: `src/components/projects/project-settings-sheet.tsx`

Sheet lateral (shadcn Sheet) con secciones:

1. **Informacion basica**: Nombre, descripcion, proposito, tech stack (tags editables)
2. **Agente**: Muestra agente actual, boton para abrir dialogo de creacion
3. **Modelo por defecto**: Selector agrupado por proveedor (usa `/api/settings/models`)
4. **Estado del proyecto**: Badge de estado + boton reset a draft
5. **Datos del proyecto**: Grid con estadisticas (fuentes, versiones, RAG, fechas)
6. **Zona de peligro**: Eliminar proyecto, limpiar historial, eliminar RAG

### 2.3 Endpoints nuevos/modificados

**DELETE /api/projects/[id]** — Limpieza completa:
```typescript
// 1. Qdrant
await qdrant.deleteCollection(project.rag_collection);
// 2. Filesystem
fs.rmSync(projectDir, { recursive: true, force: true });
// 3. Bot files
fs.rmSync(botDir, { recursive: true, force: true });
// 4. SQLite (CASCADE)
db.prepare('DELETE FROM projects WHERE id = ?').run(id);
```

**DELETE /api/projects/[id]/process/clean** — Limpia historial de procesamiento:
- Borra todos los `processing_runs` del proyecto
- Resetea `current_version` a 0
- Elimina archivos de output

**GET /api/projects/[id]/stats** — Estadisticas del proyecto:
- sources_count, versions_count, rag_enabled, rag_collection, created_at, updated_at

### 2.4 Integracion en pagina de proyecto

En `src/app/projects/[id]/page.tsx`:
- Estado `showDeleteDialog` y `showSettingsSheet`
- Boton "Configurar" abre Sheet
- Boton "Eliminar" abre Dialog
- onProjectUpdated refresca datos

---

## 3. Agentes IA personalizados

### 3.1 Componente AgentCreator (agent-creator.tsx)

Componente: `src/components/agents/agent-creator.tsx`

Componente reutilizable que se usa en 3 ubicaciones:
1. **Wizard de proyecto** (`projects/new/page.tsx`) — paso 3
2. **Panel de procesamiento** (`process/process-panel.tsx`) — dentro del dialogo de agentes
3. **Sheet de configuracion** (`project-settings-sheet.tsx`) — seccion agente

**Props:**
```typescript
interface AgentCreatorProps {
  projectName: string;
  projectDescription?: string;
  projectPurpose?: string;
  projectTechStack?: string | string[] | null;
  models?: string[];           // legacy flat list (fallback)
  onAgentCreated: (agent: { id: string; name: string; emoji: string; model: string; description: string }) => void;
}
```

**Flujo:**
1. Se expande al hacer click
2. Carga modelos agrupados desde `/api/settings/models`
3. Usuario configura nombre, descripcion, selecciona modelo
4. **"Generar con IA"** → POST `/api/agents/generate`
5. Muestra preview: emoji, nombre, descripcion, preview de SOUL.md
6. Opciones: Regenerar, Editar manualmente, Crear
7. **"Crear agente"** → POST `/api/agents/create`

### 3.2 Selector de modelos agrupado

Los modelos se muestran agrupados por proveedor usando SelectGroup:

```typescript
// Formato del valor: "provider::model"
const handleModelChange = (value: string) => {
  const [provider, model] = value.includes('::') ? value.split('::') : ['litellm', value];
  setAgentModel(model);
  setAgentProvider(provider);
};
```

Ejemplo visual:
```
┌──────────────────────────┐
│ OpenAI                   │
│   gpt-4o                 │
│   gpt-4o-mini            │
│ Anthropic (Claude)       │
│   claude-sonnet-4-6      │
│   claude-opus-4-6        │
│ Google (Gemini)          │
│   gemini-2.5-pro         │
│   gemini-2.5-flash       │
│ LiteLLM (Gateway local)  │
│   gemini-main            │
│   ...                    │
│ Ollama (Local)           │
│   llama3:latest          │
│   ...                    │
└──────────────────────────┘
```

### 3.3 Generacion con IA (POST /api/agents/generate)

Endpoint: `src/app/api/agents/generate/route.ts`

Envia prompt al LLM seleccionado pidiendo JSON con:
- `name`: nombre mejorado (max 40 chars)
- `emoji`: emoji representativo
- `description`: 1-2 lineas
- `soul`: contenido SOUL.md (personalidad, primera persona, min 15 lineas)
- `agents`: contenido AGENTS.md (instrucciones operativas, pasos numerados)
- `identity`: contenido IDENTITY.md (nombre, rol, vibe)

Usa el servicio LLM unificado (`llm.chatCompletion()`) para llamar al proveedor correcto.

### 3.4 Creacion de agente (POST /api/agents/create)

Endpoint: `src/app/api/agents/create/route.ts`

**ID kebab-case:**
```typescript
function toKebabId(name: string): string {
  return name.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quitar acentos
    .replace(/[^a-z0-9\s-]/g, '')      // solo alfanumerico
    .replace(/\s+/g, '-')              // espacios a guiones
    .replace(/-+/g, '-')               // deduplicar guiones
    .replace(/^-|-$/g, '')             // trim guiones
    .substring(0, 30);
}
```

**Flujo:**
1. Guarda en SQLite (`custom_agents`)
2. Busca path escribible: `/app/openclaw` → env var → `data/bots` (fallback)
3. Crea workspace con SOUL.md, AGENTS.md, IDENTITY.md, USER.md
4. Registra en `openclaw.json` (array de agents)
5. Retorna ID, nombre, emoji, modelo + warning si no pudo registrar en OpenClaw

---

## 4. Gestion de API Keys multi-proveedor

### 4.1 Tabla api_keys en SQLite

Agregado en `src/lib/db.ts`:

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  provider TEXT UNIQUE NOT NULL,
  api_key TEXT,
  endpoint TEXT,
  is_active INTEGER DEFAULT 1,
  last_tested TEXT,
  test_status TEXT DEFAULT 'untested',
  created_at TEXT,
  updated_at TEXT
);
```

**Seed automatico** (INSERT OR IGNORE) con 5 proveedores:

| Provider | Endpoint por defecto | Requiere key |
|----------|---------------------|--------------|
| openai | https://api.openai.com/v1 | Si |
| anthropic | https://api.anthropic.com/v1 | Si |
| google | https://generativelanguage.googleapis.com/v1beta | Si |
| litellm | Desde env LITELLM_URL | Opcional |
| ollama | Desde env OLLAMA_URL | No |

### 4.2 Endpoints de API Keys

**GET /api/settings/api-keys** — Lista todos los proveedores:
- Keys enmascaradas: primeros 4 + `••••` + ultimos 4 caracteres
- Campo `has_key: boolean` para saber si hay key configurada
- Ordenados: openai → anthropic → google → litellm → ollama

**PATCH /api/settings/api-keys/[provider]** — Actualiza key y/o endpoint:
- Si cambia `api_key`, resetea `test_status` a 'untested'
- Acepta `api_key` y/o `endpoint`

**DELETE /api/settings/api-keys/[provider]** — Borra la API key:
- Pone `api_key = NULL` y `test_status = 'untested'`

**POST /api/settings/api-keys/[provider]/test** — Prueba la conexion:

Cada proveedor tiene su test especifico:

```typescript
// OpenAI: GET /v1/models (filtrar gpt-* y o*)
// Anthropic: POST /v1/messages (minimal) + GET /v1/models
// Google: GET models?key={key} (filtrar gemini*)
// LiteLLM: GET /v1/models (OpenAI-compatible)
// Ollama: GET /api/tags (sin auth)
```

Retorna: `{ status: 'ok' | 'failed', models: string[], error?: string }`

### 4.3 Endpoint de modelos agrupados

**GET /api/settings/models** — Modelos disponibles por proveedor:

```typescript
// Retorna: { provider: string; name: string; models: string[] }[]
// Solo providers activos (is_active = 1) con key configurada
// OpenAI/Anthropic/Google: lista estatica de modelos
// LiteLLM: fetch dinamico a /v1/models
// Ollama: fetch dinamico a /api/tags (filtra modelos de embeddings)
```

Modelos estaticos por proveedor:
```typescript
const PROVIDER_MODELS = {
  openai: ['gpt-4o', 'gpt-4o-mini'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
};
```

### 4.4 Pagina /settings

Pagina: `src/app/settings/page.tsx`

4 secciones (tabs horizontales):

1. **API Keys** (funcional):
   - Card por proveedor con icono, nombre, descripcion
   - Input de API key con toggle visibilidad (ojo)
   - Input de endpoint (editable)
   - Botones: Guardar, Probar conexion, Eliminar key
   - Badge de estado: untested (gris), ok (verde), failed (rojo)
   - Al probar: muestra lista de modelos encontrados

2. **Embeddings** (placeholder)
3. **Conexiones** (placeholder, link a /system)
4. **Preferencias** (placeholder)

### 4.5 Componente ProviderCard

Dentro de `settings/page.tsx`:

```typescript
// Estado por card:
const [key, setKey] = useState('');         // input de key
const [endpoint, setEndpoint] = useState('');
const [showKey, setShowKey] = useState(false);
const [testing, setTesting] = useState(false);
const [saving, setSaving] = useState(false);
const [testResult, setTestResult] = useState(null);

// Flujo de test:
// 1. PATCH /api/settings/api-keys/{provider} (guarda primero)
// 2. POST /api/settings/api-keys/{provider}/test
// 3. Muestra resultado con modelos o error
```

---

## 5. Servicio LLM unificado

### src/lib/services/llm.ts

Nuevo servicio que abstrae las llamadas a LLM de cualquier proveedor:

```typescript
interface ChatOptions {
  model: string;
  provider: string;        // 'openai' | 'anthropic' | 'google' | 'litellm' | 'ollama'
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
}

export const llm = {
  async chatCompletion(opts: ChatOptions): Promise<string> {
    // 1. Lee api_key row de SQLite segun opts.provider
    // 2. Despacha a funcion especifica del proveedor
    // 3. Retorna texto de respuesta
  }
};
```

**Implementaciones por proveedor:**

| Proveedor | Endpoint | Auth | Formato especial |
|-----------|----------|------|------------------|
| OpenAI | `{endpoint}/chat/completions` | `Bearer {key}` | Estandar OpenAI |
| Anthropic | `{endpoint}/messages` | `x-api-key: {key}`, `anthropic-version: 2023-06-01` | Separa system message, formato Anthropic |
| Google | `{endpoint}/models/{model}:generateContent?key={key}` | Key como query param | Convierte messages a `contents[]`, usa `systemInstruction` |
| LiteLLM | `{endpoint}/v1/chat/completions` | `Bearer {key}` (opcional) | Compatible OpenAI |
| Ollama | `{endpoint}/api/chat` | Sin auth | Formato Ollama, `stream: false` |

**Usado en:**
- `POST /api/agents/generate` — Generacion de personalidad de agente

---

## 6. Sidebar y navegacion

### Cambios en sidebar.tsx

```typescript
// ANTES:
const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Proyectos', icon: FolderKanban },
  { href: '/system', label: 'Configuración', icon: Settings },
];

// DESPUES:
const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Proyectos', icon: FolderKanban },
  { href: '/settings', label: 'Configuración', icon: Settings },
  { href: '/system', label: 'Estado del Sistema', icon: Activity },
];
```

- "Configuracion" ahora apunta a `/settings` (gestion de API keys)
- Nuevo enlace "Estado del Sistema" apunta a `/system` (monitor de servicios)
- Icono Activity (lucide) para estado del sistema

---

## 7. Docker y volumenes

### docker-compose.yml actualizado

```yaml
services:
  docflow:
    volumes:
      # ANTES (bug: ~ no se expande en docker-compose):
      # - ~/docflow-data:/app/data
      # - ~/.openclaw:/app/openclaw

      # DESPUES (rutas absolutas):
      - /home/deskmath/docflow-data:/app/data
      - /home/deskmath/.openclaw:/app/openclaw
```

### Logica de escritura de workspaces

Tanto `agents/create` como `bot/create` ahora siguen este orden de prioridad:

```typescript
// 1. /app/openclaw (mount Docker → ~/.openclaw en host)
// 2. process.env.OPENCLAW_WORKSPACE_PATH (env var)
// 3. process.cwd()/data/bots (fallback)

const candidates = [
  '/app/openclaw',
  process['env']['OPENCLAW_WORKSPACE_PATH'] || '',
].filter(Boolean);

for (const candidate of candidates) {
  try {
    // Test de escritura con archivo temporal
    fs.writeFileSync(path.join(candidate, '.write-test'), 'test');
    fs.unlinkSync(path.join(candidate, '.write-test'));
    openclawPath = candidate;
    break;
  } catch {
    // Siguiente candidato
  }
}

if (!openclawPath) {
  openclawPath = path.join(process.cwd(), 'data', 'bots'); // fallback
}
```

### Registro en openclaw.json

Ambos endpoints ahora registran el agente en `openclaw.json`:

```typescript
const openclawJsonPath = path.join(openclawPath, 'openclaw.json');
let config = { agents: [] };

if (fs.existsSync(openclawJsonPath)) {
  config = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf-8'));
}

if (!config.agents.find(a => a.id === agentId)) {
  config.agents.push({
    id: agentId,
    name: agentName,
    workspace: `workspace-${agentId}`,
    model: model,
    emoji: emoji,
  });
  fs.writeFileSync(openclawJsonPath, JSON.stringify(config, null, 2), 'utf-8');
}
```

---

## 8. Bugs resueltos

### Bug 8: SQL con comillas dobles en ORDER BY

**Archivo**: `src/app/api/settings/api-keys/route.ts`
**Sintoma**: El ORDER BY no ordenaba correctamente (o podia fallar en algunas versiones de SQLite).
**Causa**: `WHEN "openai"` con comillas dobles — SQLite interpreta comillas dobles como nombres de columna, no como strings.
**Solucion**: Cambiar a comillas simples dentro de string con comillas dobles:
```typescript
// ANTES:
db.prepare('SELECT * FROM api_keys ORDER BY CASE provider WHEN "openai" THEN 1 ...')
// DESPUES:
db.prepare("SELECT * FROM api_keys ORDER BY CASE provider WHEN 'openai' THEN 1 ...")
```

### Bug 9: Volumen OpenClaw no montado en Docker

**Archivo**: `docker-compose.yml`
**Sintoma**: `/app/openclaw` no existe dentro del contenedor.
**Causa**: `~/.openclaw:/app/openclaw` — el `~` no se expande en docker-compose.yml.
**Solucion**: Usar ruta absoluta `/home/deskmath/.openclaw:/app/openclaw`.

### Bug 10: Agente custom no aparece en OpenClaw

**Archivos**: `agents/create/route.ts`, `bot/create/route.ts`
**Sintoma**: Workspace creado en fallback (`data/bots/`) en vez de en `~/.openclaw/`.
**Causa**: (1) Volumen no montado (Bug 9). (2) El path hardcodeado del env var apuntaba a ruta del host, no del contenedor. (3) `bot/create` no intentaba registrar en `openclaw.json`.
**Solucion**:
- Priorizar `/app/openclaw` como primer candidato
- Test de escritura con fallback encadenado
- Agregar registro en `openclaw.json` a ambos endpoints

### Bug 11: UNIQUE constraint en seed de api_keys

**Archivo**: `src/lib/db.ts`
**Sintoma**: `SqliteError: UNIQUE constraint failed: api_keys.provider` durante `npm run build`.
**Causa**: Next.js ejecuta el modulo db.ts durante la recoleccion de paginas en build. Si la DB ya tiene los providers, el INSERT falla.
**Solucion**: Cambiar `INSERT INTO` a `INSERT OR IGNORE INTO`.

### Bug 12: Select onValueChange puede recibir null

**Archivo**: `src/components/agents/agent-creator.tsx`
**Sintoma**: Error TypeScript: `Type 'string | null' is not assignable to type 'string'`.
**Causa**: shadcn Select (basado en @base-ui/react) puede pasar `null` en `onValueChange`.
**Solucion**: `onValueChange={(v) => v && handleModelChange(v)}`.

### Bug 13: Imports no usados bloquean build

**Archivo**: `src/app/settings/page.tsx`
**Sintoma**: Build falla por ESLint `no-unused-vars` en CardHeader y CardTitle.
**Solucion**: Eliminar imports no usados.

---

## 9. Archivos nuevos y modificados

### Archivos nuevos

| Archivo | Descripcion |
|---------|-------------|
| `src/app/settings/page.tsx` | Pagina de configuracion con gestion de API Keys |
| `src/app/api/settings/api-keys/route.ts` | GET lista proveedores con keys enmascaradas |
| `src/app/api/settings/api-keys/[provider]/route.ts` | PATCH/DELETE para actualizar keys |
| `src/app/api/settings/api-keys/[provider]/test/route.ts` | POST test de conexion por proveedor |
| `src/app/api/settings/models/route.ts` | GET modelos agrupados por proveedor |
| `src/lib/services/llm.ts` | Servicio LLM unificado multi-proveedor |
| `src/components/projects/delete-project-dialog.tsx` | Dialogo eliminacion doble confirmacion |
| `src/components/projects/project-settings-sheet.tsx` | Sheet de configuracion de proyecto |
| `src/components/agents/agent-creator.tsx` | Componente reutilizable creacion de agentes |
| `src/app/api/projects/[id]/process/clean/route.ts` | DELETE limpia historial procesamiento |
| `src/app/api/projects/[id]/stats/route.ts` | GET estadisticas del proyecto |

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/lib/db.ts` | Tabla `api_keys`, columna `default_model`, `INSERT OR IGNORE` |
| `src/lib/types.ts` | `default_model` en interface Project |
| `src/app/projects/[id]/page.tsx` | Botones Configurar/Eliminar funcionales |
| `src/app/projects/new/page.tsx` | AgentCreator en wizard |
| `src/components/process/process-panel.tsx` | Reemplazo inline form por AgentCreator |
| `src/components/layout/sidebar.tsx` | /settings + Estado del Sistema |
| `src/app/api/agents/generate/route.ts` | Usa llm.chatCompletion() multi-proveedor |
| `src/app/api/agents/create/route.ts` | Logica OpenClaw mejorada con prioridad /app/openclaw |
| `src/app/api/projects/[id]/bot/create/route.ts` | Logica OpenClaw + registro openclaw.json |
| `src/app/api/projects/[id]/route.ts` | DELETE con limpieza completa, PATCH con default_model |
| `docker-compose.yml` | Rutas absolutas en volumenes |

---

## 10. Estructura actualizada

Archivos nuevos respecto a `progressWebapp.md`:

```
src/
├── app/
│   ├── settings/page.tsx                              # NUEVO
│   └── api/
│       ├── settings/
│       │   ├── api-keys/
│       │   │   ├── route.ts                           # NUEVO
│       │   │   └── [provider]/
│       │   │       ├── route.ts                       # NUEVO
│       │   │       └── test/route.ts                  # NUEVO
│       │   └── models/route.ts                        # NUEVO
│       └── projects/[id]/
│           ├── process/clean/route.ts                 # NUEVO
│           └── stats/route.ts                         # NUEVO
├── components/
│   ├── agents/agent-creator.tsx                       # NUEVO
│   └── projects/
│       ├── delete-project-dialog.tsx                  # NUEVO
│       └── project-settings-sheet.tsx                 # NUEVO
└── lib/
    └── services/llm.ts                                # NUEVO
```

### Conteo total de API Routes: 34

Nuevas rutas en esta sesion:
- GET /api/settings/api-keys
- PATCH /api/settings/api-keys/[provider]
- DELETE /api/settings/api-keys/[provider]
- POST /api/settings/api-keys/[provider]/test
- GET /api/settings/models
- DELETE /api/projects/[id]/process/clean
- GET /api/projects/[id]/stats

---

## Checklist de verificacion

- [ ] Build compila sin errores (`npm run build`)
- [ ] /settings muestra 5 proveedores con estado
- [ ] Se puede guardar y probar API key de cada proveedor
- [ ] Crear agente desde wizard muestra modelos agrupados
- [ ] "Generar con IA" produce SOUL.md, AGENTS.md, IDENTITY.md
- [ ] Agente creado aparece en OpenClaw (`~/.openclaw/openclaw.json`)
- [ ] "Configurar" en proyecto abre sheet con toda la info
- [ ] "Eliminar" en proyecto pide doble confirmacion y borra todo
- [ ] Sidebar muestra "Configuracion" → /settings y "Estado del Sistema" → /system
- [ ] Docker compose usa rutas absolutas para volumenes
- [ ] `docker compose build --no-cache && docker compose up -d` funciona
