# DoCatFlow - Sesion 7: Conectores + Dashboard + Rebranding Planning (Milestones v3.0 + v4.0)

> Funcionalidades implementadas sobre la base documentada en `progressSesion6.md`. Esta sesion completa el milestone v3.0 (conectores, tracking de uso, dashboard de operaciones) e inicializa el milestone v4.0 (rebranding DoCatFlow, CatBot, MCP Bridge, pulido UX).

---

## Indice

1. [Resumen de cambios](#1-resumen-de-cambios)
2. [Metodologia y planificacion](#2-metodologia-y-planificacion)
3. [Phase 9: Data Model (Connectors, Logs, Usage)](#3-phase-9-data-model)
4. [Phase 10: Connectors API CRUD](#4-phase-10-connectors-api-crud)
5. [Phase 11: Connectors UI Page](#5-phase-11-connectors-ui-page)
6. [Phase 12: Pipeline Connector Integration](#6-phase-12-pipeline-connector-integration)
7. [Phase 13: Usage Tracking + Cost Settings](#7-phase-13-usage-tracking--cost-settings)
8. [Phase 14: Dashboard de Operaciones](#8-phase-14-dashboard-de-operaciones)
9. [Bugfix: tickFormatter recharts](#9-bugfix-tickformatter-recharts)
10. [Milestone v4.0: Planning](#10-milestone-v40-planning)
11. [Archivos nuevos y modificados](#11-archivos-nuevos-y-modificados)
12. [Commits de la sesion](#12-commits-de-la-sesion)
13. [Deploy y verificacion](#13-deploy-y-verificacion)

---

## 1. Resumen de cambios

### Milestone v3.0 completo: Conectores + Dashboard de Operaciones

Se implemento un sistema de conectores para integracion con servicios externos, tracking de uso con costes, y un dashboard de operaciones con graficos.

### 48 requisitos implementados en 6 fases

| Fase | Que se construyo | Requisitos | Duracion |
|------|-----------------|------------|----------|
| 9 | Modelo de datos (tablas + tipos) | 5/5 | 81s |
| 10 | API CRUD Conectores (8 endpoints) | 8/8 | 117s |
| 11 | UI Conectores (/connectors) | 7/7 | 169s |
| 12 | Integracion Pipeline + Acceso agente | 9/9 | 228s |
| 13 | Tracking de uso + costes modelos | 11/11 | manual |
| 14 | Dashboard de operaciones | 8/8 | manual |
| **Total** | | **48/48** | |

### Bugfix aplicado
- **tickFormatter en recharts**: `e.slice is not a function` — corregido con `String(v).slice(5)` y `Number(v)`

### Milestone v4.0 inicializado
- 8 fases (15-22), 52 requisitos definidos
- Rebranding DocFlow → DoCatFlow, CatBot IA, MCP Bridge, UX Polish

---

## 2. Metodologia y planificacion

### Workflow GSD ejecutado

```
/gsd:execute-phase 9   → Modelo de datos (ya completado)
/gsd:plan-phase 10     → Plan para API CRUD Conectores
/gsd:execute-phase 10  → Ejecuta via gsd-executor
/gsd:execute-phase 11  → Ejecuta via gsd-executor
/gsd:execute-phase 12  → Ejecuta via gsd-executor
Phase 13               → Ejecucion manual (executor hit rate limit)
Phase 14               → Ejecucion manual (recharts install + 6 APIs + dashboard page)
/gsd:new-milestone     → Define milestone v4.0
```

### Cadena de dependencias v3.0

```
Phase 9 (Data) → Phase 10 (API) → Phase 11 (UI)
                       ↓
Phase 9 (Data) → Phase 12 (Pipeline Integration)
                       ↓
Phase 9 (Data) → Phase 13 (Usage + Costs) → Phase 14 (Dashboard)
```

---

## 3. Phase 9: Data Model

### 4 tablas nuevas en SQLite

Archivo: `app/src/lib/db.ts`

#### Tabla `connectors`

```sql
CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT DEFAULT '🔌',
  type TEXT NOT NULL,  -- 'n8n_webhook' | 'http_api' | 'mcp_server' | 'email'
  config TEXT,         -- JSON con configuracion segun tipo
  is_active INTEGER DEFAULT 1,
  test_status TEXT DEFAULT 'untested',  -- 'untested' | 'ok' | 'failed'
  last_tested TEXT,
  times_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

#### Tabla `connector_logs`

```sql
CREATE TABLE IF NOT EXISTS connector_logs (
  id TEXT PRIMARY KEY,
  connector_id TEXT REFERENCES connectors(id) ON DELETE CASCADE,
  task_id TEXT,
  task_step_id TEXT,
  agent_id TEXT,
  request_payload TEXT,   -- truncado a 5000 chars
  response_payload TEXT,  -- truncado a 5000 chars
  status TEXT,            -- 'success' | 'failed' | 'timeout'
  duration_ms INTEGER,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

#### Tabla `usage_logs`

```sql
CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,  -- 'process' | 'chat' | 'rag_index' | 'agent_generate' | 'task_step' | 'connector_call'
  project_id TEXT,
  task_id TEXT,
  agent_id TEXT,
  model TEXT,
  provider TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  estimated_cost REAL DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success',
  metadata TEXT,  -- JSON
  created_at TEXT DEFAULT (datetime('now'))
);
```

#### Tabla `agent_connector_access`

```sql
CREATE TABLE IF NOT EXISTS agent_connector_access (
  agent_id TEXT NOT NULL,
  connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, connector_id)
);
```

#### Columna adicional en `task_steps`

```sql
ALTER TABLE task_steps ADD COLUMN connector_config TEXT;
-- JSON: [{connector_id, mode: 'before'|'after'|'both'}]
```

### Interfaces TypeScript

Archivo: `app/src/lib/types.ts`

```typescript
export interface Connector {
  id: string; name: string; description: string | null; emoji: string;
  type: 'n8n_webhook' | 'http_api' | 'mcp_server' | 'email';
  config: string | null; is_active: number;
  test_status: 'untested' | 'ok' | 'failed'; last_tested: string | null;
  times_used: number; created_at: string; updated_at: string;
}

export interface ConnectorLog { /* ... campos de la tabla ... */ }
export interface UsageLog { /* ... campos de la tabla ... */ }
export interface AgentConnectorAccess { agent_id: string; connector_id: string; }
```

### Model pricing seed

6 modelos con precios por defecto en settings (key: `model_pricing`):

| Modelo | Provider | Input ($/1M) | Output ($/1M) |
|--------|----------|-------------|---------------|
| gemini-main | google | 0 | 0 |
| claude-sonnet-4-6 | anthropic | 3 | 15 |
| claude-opus-4-6 | anthropic | 15 | 75 |
| gpt-4o | openai | 2.5 | 10 |
| gpt-4o-mini | openai | 0.15 | 0.60 |
| ollama | ollama | 0 | 0 |

---

## 4. Phase 10: Connectors API CRUD

### 8 endpoints creados

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/connectors` | Lista conectores con times_used y last_tested, ordenados por updated_at desc |
| POST | `/api/connectors` | Crea conector (max 20 validacion). Campos: name, type, config, emoji, description |
| GET | `/api/connectors/[id]` | Detalle del conector |
| PATCH | `/api/connectors/[id]` | Actualiza conector (dynamic SQL SET builder) |
| DELETE | `/api/connectors/[id]` | Elimina conector y sus logs (CASCADE) |
| POST | `/api/connectors/[id]/test` | Test segun tipo con AbortController 10s timeout |
| GET | `/api/connectors/[id]/logs` | Ultimas 50 invocaciones |
| GET | `/api/connectors/for-agent/[agentId]` | Conectores accesibles para un agente (JOIN agent_connector_access) |

### Test por tipo de conector

```typescript
// n8n_webhook y http_api: fetch real con timeout
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);
const response = await fetch(config.url, { signal: controller.signal, ... });

// mcp_server: verifica URL accesible
const response = await fetch(config.url, { method: 'GET', signal: controller.signal });

// email: valida estructura de config (no envia email real)
if (!config.smtp_host && !config.webhook_url) throw new Error('Config incompleta');
```

---

## 5. Phase 11: Connectors UI Page

### Sidebar actualizado

Archivo: `app/src/components/layout/sidebar.tsx`

- Nuevo import: `Plug` de lucide-react
- Nueva entrada: `{ href: '/connectors', label: 'Conectores', icon: Plug }` entre Tareas y Configuracion

### Pagina /connectors

Archivo: `app/src/app/connectors/page.tsx` (~893 lineas)

#### Secciones principales

1. **4 Cards de tipo de conector**

| Tipo | Icono | Color | Descripcion |
|------|-------|-------|-------------|
| n8n Webhook | Webhook | orange | Dispara workflows de n8n |
| HTTP API | Globe | blue | Llama a cualquier API REST |
| MCP Server | Server | violet | Conecta con servidores MCP |
| Email | Mail | emerald | Envia notificaciones por correo |

2. **Lista de conectores configurados**: tabla con nombre, tipo badge, estado (activo/inactivo toggle), test status badge, acciones (editar/test/logs/eliminar)

3. **Sheet lateral crear/editar**: formulario dinamico segun tipo seleccionado
   - n8n: URL, metodo, headers JSON, timeout
   - http_api: URL, metodo, headers JSON, body template
   - mcp_server: URL, nombre, tools JSON
   - email: SMTP host o webhook n8n URL

4. **Dialog de logs**: tabla scrolleable con ultimas 50 invocaciones (fecha, tarea, agente, status badge, duracion, payload expandible)

5. **3 Templates sugeridos para n8n**: email via n8n, Asana, Telegram — pre-rellenan la config al clickear

---

## 6. Phase 12: Pipeline Connector Integration

### Ejecucion de conectores en pipelines

Archivo: `app/src/lib/services/task-executor.ts`

Nueva funcion `executeConnectors()`:

```typescript
async function executeConnectors(
  connectors: ConnectorConfig[],
  mode: 'before' | 'after',
  payload: object,
  context: { task_id, step_id, agent_id }
): Promise<string[]> {
  const results: string[] = [];
  for (const conn of connectors) {
    if (conn.mode !== mode && conn.mode !== 'both') continue;
    const startTime = Date.now();
    try {
      const response = await fetch(connector.config.url, { ... });
      // Log en connector_logs
      db.prepare('INSERT INTO connector_logs ...').run(...);
      results.push(responseText);
    } catch (err) {
      // Log error pero NO bloquea la ejecucion (fault-tolerant)
      db.prepare('INSERT INTO connector_logs ...').run(..., 'failed', err.message);
    }
  }
  return results;
}
```

**Patron clave**: Los conectores son fault-tolerant. Si fallan, se loguean pero no interrumpen la ejecucion de la tarea.

### Acceso agente-conector

Archivo: `app/src/app/api/agents/[id]/route.ts`

- GET: retorna `connector_ids` array con los IDs de conectores accesibles
- PATCH: sincroniza `agent_connector_access` (DELETE all + INSERT nuevos)

### UI de conectores en agentes

Archivo: `app/src/app/agents/page.tsx`

- En el sheet de edicion de agente: seccion "Conectores disponibles" con checkboxes
- Cada checkbox muestra emoji + nombre + tipo badge del conector

### UI de conectores en wizard de tareas

Archivo: `app/src/app/tasks/new/page.tsx`

- En paso 3 (Pipeline), cada paso de tipo agente tiene seccion "Conectores (opcional)"
- Solo muestra conectores a los que el agente asignado tiene acceso
- Selector de modo: Antes / Despues / Ambos
- Config se resetea cuando cambia el agente del paso

---

## 7. Phase 13: Usage Tracking + Cost Settings

### Servicio usage-tracker

Archivo: `app/src/lib/services/usage-tracker.ts`

```typescript
interface UsageEvent {
  event_type: 'process' | 'chat' | 'rag_index' | 'agent_generate' | 'task_step' | 'connector_call';
  project_id?: string; task_id?: string; agent_id?: string;
  model?: string; provider?: string;
  input_tokens?: number; output_tokens?: number; total_tokens?: number;
  duration_ms?: number; status?: string; metadata?: Record<string, unknown>;
}

export function logUsage(event: UsageEvent): void {
  try {
    const inputTokens = event.input_tokens || 0;
    const outputTokens = event.output_tokens || 0;
    const totalTokens = event.total_tokens || (inputTokens + outputTokens);
    const estimatedCost = calculateCost(event.model, inputTokens, outputTokens);
    db.prepare('INSERT INTO usage_logs ...').run(...);
  } catch (err) {
    console.error('Error logging usage:', err);  // Non-blocking
  }
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = db.prepare("SELECT value FROM settings WHERE key = 'model_pricing'").get();
  // Parse JSON, find model, calculate: (input * input_price + output * output_price) / 1_000_000
}
```

### 6 endpoints instrumentados

| Endpoint | Event Type | Que se trackea |
|----------|-----------|----------------|
| POST /api/projects/{id}/process | `process` | tokens, modelo, duracion |
| Chat panel (projects/{id}) | `chat` | tokens, modelo, duracion |
| POST /api/projects/{id}/rag/create | `rag_index` | duracion, chunks count |
| POST /api/agents/generate | `agent_generate` | tokens, modelo, duracion |
| task-executor (cada paso) | `task_step` | tokens, modelo, duracion |
| task-executor (cada conector) | `connector_call` | duracion, status |

### Configuracion de costes en /settings

Archivo: `app/src/app/settings/page.tsx`

Nueva seccion "Costes de modelos" con:
- Tabla editable: modelo, provider, precio input ($/1M), precio output ($/1M)
- Botones: agregar fila, eliminar fila, guardar
- Guardado via POST /api/settings con key `model_pricing`

### API de settings

Archivo: `app/src/app/api/settings/route.ts`

```typescript
// GET /api/settings?key=model_pricing
export async function GET(request: Request) {
  const key = searchParams.get('key');
  const row = db.prepare('SELECT key, value, updated_at FROM settings WHERE key = ?').get(key);
  return NextResponse.json(row);
}

// POST /api/settings — upsert
export async function POST(request: Request) {
  const { key, value } = await request.json();
  db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, now);
  return NextResponse.json({ success: true });
}
```

---

## 8. Phase 14: Dashboard de Operaciones

### 6 API endpoints del dashboard

| Endpoint | Que retorna |
|----------|------------|
| GET /api/dashboard/summary | Conteos: proyectos, agentes, tareas, conectores, tokens_hoy, coste_mes, tareas_running |
| GET /api/dashboard/usage?days=7 | Tokens por dia desglosado por provider (pivot grouping), rellena dias faltantes |
| GET /api/dashboard/activity?limit=10 | Ultimos N eventos de usage_logs como feed de actividad |
| GET /api/dashboard/top-agents?limit=5 | Agentes mas usados por conteo (JOIN custom_agents) |
| GET /api/dashboard/top-models?limit=5 | Modelos mas usados por conteo |
| GET /api/dashboard/storage | Tamano recursivo de directorios de proyectos, colecciones Qdrant, modelos Ollama |

### Pagina / (Dashboard reescrita)

Archivo: `app/src/app/page.tsx`

#### Dependencia nueva: recharts

```bash
cd ~/docflow/app && npm install recharts
```

#### 7 cards de resumen (grid 4 columnas)

| Card | Icono | Color | Dato |
|------|-------|-------|------|
| Proyectos | FolderKanban | violet | Conteo |
| Agentes | Bot | blue | Conteo |
| Tareas | ClipboardList | emerald | Conteo |
| Conectores | Plug | orange | Conteo |
| Tokens hoy | Zap | amber | Formateado (1.2k, 45k, 1.2M) |
| Coste mes | DollarSign | rose | Formateado ($1.23) |
| Tareas activas | Activity | cyan | Conteo |

#### Grafico de tokens (recharts BarChart)

- Barras apiladas por provider: anthropic=violet, openai=emerald, google=yellow, ollama=blue
- Eje X: ultimos 7 dias (formato MM-DD)
- Eje Y: tokens formateados
- Tooltip con total por dia
- ResponsiveContainer para adaptarse al ancho

```tsx
<BarChart data={usage}>
  <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} />
  <YAxis tickFormatter={(v) => formatTokens(Number(v) || 0)} />
  <Tooltip />
  <Legend />
  <Bar dataKey="anthropic" stackId="a" fill="#8b5cf6" />
  <Bar dataKey="openai" stackId="a" fill="#10b981" />
  <Bar dataKey="google" stackId="a" fill="#eab308" />
  <Bar dataKey="ollama" stackId="a" fill="#3b82f6" />
</BarChart>
```

#### Actividad reciente (timeline)

- Ultimos 10 eventos como timeline vertical
- Cada evento: icono segun tipo, descripcion, modelo, tokens, tiempo relativo
- Iconos: process=FileText, chat=MessageSquare, rag_index=Database, agent_generate=Bot, task_step=Zap, connector_call=Plug

#### Top agentes y modelos (2 columnas)

- Top 5 agentes: nombre, conteo de llamadas, barra de progreso proporcional
- Top 5 modelos: nombre, provider badge, conteo, barra de progreso

#### Storage

- Tamano de datos de proyectos (formateado en KB/MB/GB)
- Colecciones Qdrant (conteo + tamano)
- Modelos Ollama (conteo + tamano)

#### Proyectos recientes + Tareas en curso

- Ultimos 3 proyectos con nombre, fuentes, fecha
- Tareas con status running/paused con barra de progreso

---

## 9. Bugfix: tickFormatter recharts

### Problema

`TypeError: e.slice is not a function` al renderizar el dashboard con datos de uso. El XAxis `tickFormatter` recibia valores que no eran strings desde recharts.

### Solucion

```typescript
// ANTES (fallaba si recharts pasaba numero u otro tipo)
tickFormatter={(v: string) => v.slice(5)}

// DESPUES (safe para cualquier tipo)
tickFormatter={(v) => String(v).slice(5)}

// Tambien en YAxis:
// ANTES
tickFormatter={formatTokens}
// DESPUES
tickFormatter={(v) => formatTokens(Number(v) || 0)}
```

Archivo afectado: `app/src/app/page.tsx`

---

## 10. Milestone v4.0: Planning

### Vision

DoCatFlow (antes DocFlow) se transforma en una plataforma con personalidad. Incluye:
- **Rebranding**: Logo del gato con gafas VR, colores mauve/violet, tipografia Inter
- **CatBot**: Asistente IA flotante con tool-calling para crear proyectos, agentes, tareas
- **MCP Bridge**: Cada proyecto RAG expuesto como servidor MCP para OpenClaw
- **UX Polish**: Animaciones, breadcrumbs, responsive, empty states, footer

### Identidad visual

| Elemento | Valor |
|----------|-------|
| Nombre | DoCatFlow (Cat en mauve) |
| Mascota | Gato violeta con gafas VR y traje |
| Logo | app/images/logo.jpg |
| Color primario | Mauve #8B6D8B |
| Acento | Violet-500/600 (existente) |
| Fondo | zinc-950 (existente) |

### 8 fases planificadas (15-22)

| Fase | Nombre | Requisitos |
|------|--------|-----------|
| 15 | Rebranding Visual | BRAND-01..07 (7) |
| 16 | Welcome + Onboarding | WELCOME-01..03 (3) |
| 17 | CatBot Backend | CATBOT-01..14 (14) |
| 18 | CatBot Frontend | CATUI-01..08 (8) |
| 19 | CatBot Configuracion | CATCFG-01..04 (4) |
| 20 | MCP Bridge Backend | MCP-01..05 (5) |
| 21 | MCP Bridge UI | MCPUI-01..03 (3) |
| 22 | UX Polish Global | UX-01..08 (8) |
| **Total** | | **52 requisitos** |

### Dependencias

```
Phase 15 (Rebranding) → Phase 16 (Welcome) ─┐
                                              ├→ Phase 22 (UX Polish)
Phase 17 (CatBot Backend) → Phase 18 (CatBot Frontend) → Phase 19 (CatBot Config)
                                              │
Phase 16 depends on CatBot ←─────────────────┘

Phase 20 (MCP Backend) → Phase 21 (MCP UI)
```

### CatBot — 13 tools

| Tool | Que hace |
|------|---------|
| create_project | Crea proyecto via POST /api/projects |
| list_projects | Lista proyectos |
| create_agent | Crea agente custom |
| list_agents | Lista agentes |
| create_task | Crea tarea |
| list_tasks | Lista tareas |
| create_connector | Crea conector |
| get_system_status | Estado de servicios |
| get_dashboard | Resumen de metricas |
| navigate_to | Navega a URL (client-side) |
| explain_feature | Explica funcionalidad |

### MCP Bridge — 3 tools por proyecto

| Tool MCP | Input | Output |
|----------|-------|--------|
| search_knowledge | query, limit | Chunks RAG con scores |
| get_project_info | — | Nombre, descripcion, fuentes, version |
| get_document | — | Documento procesado (output.md) |

### Artefactos creados

| Archivo | Descripcion |
|---------|-------------|
| `.planning/PROJECT.md` | Actualizado con v4.0 goals y constraints |
| `.planning/REQUIREMENTS.md` | 52 requisitos con IDs y trazabilidad |
| `.planning/ROADMAP.md` | 8 fases con dependencias y criterios de exito |
| `.planning/STATE.md` | Reset para v4.0, historial de v1.0-v3.0 |

---

## 11. Archivos nuevos y modificados

### Archivos nuevos (codigo v3.0)

| Archivo | Descripcion |
|---------|-------------|
| `app/src/app/api/connectors/route.ts` | GET lista + POST crear (max 20) |
| `app/src/app/api/connectors/[id]/route.ts` | GET/PATCH/DELETE conector |
| `app/src/app/api/connectors/[id]/test/route.ts` | POST test con AbortController 10s |
| `app/src/app/api/connectors/[id]/logs/route.ts` | GET ultimas 50 invocaciones |
| `app/src/app/api/connectors/for-agent/[agentId]/route.ts` | GET conectores por agente |
| `app/src/app/connectors/page.tsx` | Pagina /connectors completa (~893 lineas) |
| `app/src/lib/services/usage-tracker.ts` | logUsage() + calculateCost() |
| `app/src/app/api/settings/route.ts` | GET/POST settings (key-value) |
| `app/src/app/api/dashboard/summary/route.ts` | Conteos generales |
| `app/src/app/api/dashboard/usage/route.ts` | Tokens por dia/provider |
| `app/src/app/api/dashboard/activity/route.ts` | Feed de actividad |
| `app/src/app/api/dashboard/top-agents/route.ts` | Top agentes |
| `app/src/app/api/dashboard/top-models/route.ts` | Top modelos |
| `app/src/app/api/dashboard/storage/route.ts` | Uso de almacenamiento |

### Archivos modificados (codigo v3.0)

| Archivo | Cambios |
|---------|---------|
| `app/src/lib/db.ts` | +4 tablas + ALTER task_steps + seed pricing |
| `app/src/lib/types.ts` | +4 interfaces |
| `app/src/components/layout/sidebar.tsx` | +Plug import, +Conectores nav item |
| `app/src/lib/services/task-executor.ts` | +executeConnectors(), +logUsage imports |
| `app/src/app/api/agents/[id]/route.ts` | +connector_ids en GET, +sync en PATCH |
| `app/src/app/agents/page.tsx` | +seccion conectores en edit sheet |
| `app/src/app/tasks/new/page.tsx` | +selector conectores en wizard |
| `app/src/app/api/projects/[id]/rag/create/route.ts` | +logUsage rag_index |
| `app/src/app/api/agents/generate/route.ts` | +logUsage agent_generate |
| `app/src/app/settings/page.tsx` | +seccion "Costes de modelos" |
| `app/src/app/page.tsx` | Reescrita: dashboard con recharts + bugfix tickFormatter |
| `app/package.json` | +recharts dependency |

### Archivos de planificacion v4.0

| Archivo | Descripcion |
|---------|-------------|
| `.planning/PROJECT.md` | Actualizado con v4.0 milestone |
| `.planning/REQUIREMENTS.md` | 52 requisitos v4.0 |
| `.planning/ROADMAP.md` | 8 fases (15-22) |
| `.planning/STATE.md` | Reset para v4.0 |

---

## 12. Commits de la sesion

### v3.0 commits

| Commit | Descripcion |
|--------|-------------|
| `23b0ad8` | docs: initialize milestone v3.0 (6 phases, 48 requirements) |
| `bc6924e` | feat(09-01): create connectors, connector_logs, usage_logs, agent_connector_access tables |
| `f03dc3a` | feat(09-01): add connector_config column to task_steps |
| `c1277cd` | feat(09-01): seed default model pricing in settings |
| `42aa51e` | feat(09-01): add TypeScript interfaces |
| `cf566d3` | docs(09-01): complete Data Model plan |
| `c49f602` | feat(10-01): add GET/POST /api/connectors route |
| `6376b5b` | feat(10-01): add GET/PATCH/DELETE /api/connectors/[id] route |
| `7588f34` | feat(10-01): add POST /api/connectors/[id]/test route |
| `ce66d8c` | feat(10-01): add GET /api/connectors/[id]/logs route |
| `cdb7de0` | feat(10-01): add GET /api/connectors/for-agent/[agentId] route |
| `2fabf52` | docs(10-01): complete Connectors API CRUD plan |
| `9ef0d54` | feat(11-01): add Conectores entry to sidebar |
| `e16895e` | feat(11-01): create /connectors page with full CRUD UI |
| `aff58cf` | docs(11-01): complete Connectors UI Page plan |
| `705354d` | feat(12-01): add connector execution hooks to task-executor |
| `47800fd` | feat(12-01): add connector access management to agent API |
| `e12f454` | feat(12-01): add connector access UI to agents page |
| `b2b5ff9` | feat(12-01): add connector selection UI to task wizard |
| `0b55536` | docs(12-01): complete Pipeline Connector Integration plan |
| `8bebeb0` | feat(13-01): create usage-tracker service |
| `29aec31` | feat(13-01): instrument process endpoint (USAGE-01) |
| `b9e0b53` | feat(13-01): instrument chat endpoint (USAGE-02) |
| `d5329f7` | feat(13-01): add usage tracking and cost settings |

### Pendiente de commit

- Phase 14: Dashboard APIs + page rewrite + recharts
- Bugfix: tickFormatter recharts
- v4.0 planning: PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md
- progressSesion7.md

---

## 13. Deploy y verificacion

### Build local

```bash
cd ~/docflow/app && npm run build
```

Resultado: Build exitoso sin errores.

### Deploy Docker

```bash
docker compose build --no-cache && docker compose up -d && \
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && \
docker restart docflow-app
```

### Tests E2E para verificacion humana

#### Test 1: Conectores
1. Click "Conectores" en sidebar → navega a `/connectors`
2. Verificar 4 cards de tipo de conector
3. Crear conector n8n desde template sugerido
4. Editar conector → verificar campos dinamicos
5. Test conector → verificar badge ok/failed
6. Ver logs → verificar tabla scrolleable

#### Test 2: Pipeline con conectores
1. Crear agente → asignar acceso a conectores
2. Crear tarea con paso agente → seleccionar conector con modo "Antes"
3. Ejecutar tarea → verificar que conector se ejecuta antes del paso
4. Verificar log en connector_logs

#### Test 3: Dashboard
1. Navegar a `/` → verificar 7 cards de resumen
2. Verificar grafico de barras con datos de uso
3. Verificar actividad reciente (timeline)
4. Verificar top agentes y modelos
5. Verificar seccion de storage

#### Test 4: Settings - Costes
1. Navegar a `/settings` → seccion "Costes de modelos"
2. Verificar tabla con 6 modelos seed
3. Editar precio → guardar → recargar → verificar persistencia
4. Agregar modelo → guardar → verificar

#### Test 5: Dashboard bugfix
1. Generar datos de uso (chatear con un proyecto)
2. Navegar a `/` → verificar que el grafico de barras renderiza sin error
3. Verificar que el eje X muestra fechas (MM-DD) correctamente
