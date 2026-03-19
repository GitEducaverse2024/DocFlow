# DoCatFlow - Sesion 8: Milestone v4.0 Completo (Rebranding + CatBot + MCP Bridge + UX Polish)

> Funcionalidades implementadas sobre la base documentada en `progressSesion7.md`. Esta sesion completa las 8 fases del milestone v4.0: rebranding visual, welcome screen, CatBot (backend + frontend + config), MCP Bridge (backend + UI), y UX polish global.

---

## Indice

1. [Resumen de cambios](#1-resumen-de-cambios)
2. [Phase 15: Rebranding Visual](#2-phase-15-rebranding-visual)
3. [Phase 16: Welcome + Onboarding](#3-phase-16-welcome--onboarding)
4. [Phase 17: CatBot Backend](#4-phase-17-catbot-backend)
5. [Phase 18: CatBot Frontend](#5-phase-18-catbot-frontend)
6. [Phase 19: CatBot Configuracion](#6-phase-19-catbot-configuracion)
7. [Phase 20: MCP Bridge Backend](#7-phase-20-mcp-bridge-backend)
8. [Phase 21: MCP Bridge UI](#8-phase-21-mcp-bridge-ui)
9. [Phase 22: UX Polish Global](#9-phase-22-ux-polish-global)
10. [Errores encontrados y corregidos](#10-errores-encontrados-y-corregidos)
11. [Archivos nuevos y modificados](#11-archivos-nuevos-y-modificados)
12. [Deploy y verificacion](#12-deploy-y-verificacion)

---

## 1. Resumen de cambios

### Milestone v4.0 completo: 8 fases, 52 requisitos

| Fase | Que se construyo | Requisitos |
|------|-----------------|------------|
| 15 | Rebranding Visual (logo, colores, nombre, gradientes) | BRAND-01..07 (7) |
| 16 | Welcome screen + empty state | WELCOME-01..03 (3) |
| 17 | CatBot Backend (API + 11 tools + tool-calling loop) | CATBOT-01..14 (14) |
| 18 | CatBot Frontend (panel flotante + sugerencias) | CATUI-01..08 (8) |
| 19 | CatBot Configuracion (modelo, personalidad, acciones) | CATCFG-01..04 (4) |
| 20 | MCP Bridge Backend (endpoint MCP Streamable HTTP) | MCP-01..05 (5) |
| 21 | MCP Bridge UI (panel MCP en RAG + botones conexion) | MCPUI-01..03 (3) |
| 22 | UX Polish (breadcrumbs, page-header, footer, animaciones, responsive) | UX-01..08 (8) |
| **Total** | | **52/52** |

### Transformacion principal

DocFlow se convierte en **DoCatFlow** — una plataforma con identidad visual propia (gato con gafas VR), asistente IA integrado (CatBot), y conectividad MCP para que agentes externos consulten la base de conocimiento de cada proyecto.

---

## 2. Phase 15: Rebranding Visual

### Identidad visual

| Elemento | Valor |
|----------|-------|
| Nombre | Do**Cat**Flow ("Cat" en mauve) |
| Logo | `app/Images/logo.jpg` (gato violeta con gafas VR) |
| Color primario | Mauve `#8B6D8B` |
| Acento | Violet-500/600 |
| Fondo | zinc-950 |
| Tipografia | Inter (400, 500, 600, 700) |
| Version | v1.0 (mostrada en sidebar) |

### Cambios en sidebar (`app/src/components/layout/sidebar.tsx`)

- Logo circular 32px con `next/image` importando `@/../Images/logo.jpg`
- Nombre estilizado: `Do` + `<span style={{ color: '#8B6D8B' }}>Cat</span>` + `Flow`
- Version `v1.0` bajo el nombre
- Active nav links: `bg-gradient-to-r from-violet-600/20 to-purple-600/10 border-l-2 border-violet-500 text-violet-400`

### Metadata actualizada (`app/src/app/layout.tsx`)

```typescript
export const metadata: Metadata = {
  title: "DoCatFlow",
  description: "Intelligent Workflow & Cat-Driven Solutions",
};
```

### Gradientes en botones

Patron aplicado globalmente en ~22 archivos:
```
bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white
```

Reemplaza los antiguos `bg-violet-600 hover:bg-violet-500` y `bg-violet-500 hover:bg-violet-400`.

### Rename DocFlow -> DoCatFlow

Archivos donde se renombro "DocFlow" a "DoCatFlow" en textos visibles al usuario:
- `app/src/app/page.tsx` — "Panel de operaciones de DoCatFlow"
- `app/src/app/settings/page.tsx` — "conexiones de DoCatFlow"
- `app/src/app/agents/page.tsx` — "personalizados de DoCatFlow"
- `app/src/components/sources/youtube-input.tsx` — "DoCatFlow no transcribe"
- `app/src/components/system/system-health-panel.tsx` — "DoCatFlow Core"
- `app/src/components/system/service-card.tsx` — "Webhook DoCatFlow"
- `app/src/app/api/agents/create/route.ts` — 5 ocurrencias (workspace files)
- `app/src/app/api/projects/[id]/bot/create/route.ts` — 3 ocurrencias
- `app/src/lib/db.ts` — skills seed author
- `app/src/components/system/diagnostic-content.ts` — webhook description

**No se renombraron**: nombres de infraestructura (`docflow-ollama`, `docflow.db`, `docflow-process`).

---

## 3. Phase 16: Welcome + Onboarding

### Welcome screen (`app/src/app/page.tsx`)

Pantalla condicional cuando no hay proyectos (`summary.projects === 0`):

- Logo grande (120px circular)
- Nombre estilizado "DoCatFlow" con mauve
- Tagline: "Intelligent Workflow & Cat-Driven Solutions"
- Boton "Empezar" que navega a `/projects/new`
- 5 items de capacidades: Proyectos, Agentes, Tareas, Conectores, RAG

Imports agregados: `Image`, `Sparkles`, `MessageSquare`, `FileText`, `ClipboardList`, `logoImg`.

---

## 4. Phase 17: CatBot Backend

### Servicio de tools (`app/src/lib/services/catbot-tools.ts`)

~309 lineas. Define 11 herramientas que el LLM puede invocar:

| Tool | Tipo | Que hace |
|------|------|---------|
| `create_project` | Escritura | INSERT en projects (status: draft) |
| `list_projects` | Lectura | SELECT top 10 por updated_at |
| `create_agent` | Escritura | INSERT en custom_agents |
| `list_agents` | Lectura | SELECT top 10 custom_agents |
| `create_task` | Escritura | INSERT en tasks (status: draft) |
| `list_tasks` | Lectura | SELECT top 10 tasks |
| `create_connector` | Escritura | INSERT en connectors |
| `get_system_status` | Lectura | Fetch /api/health |
| `get_dashboard` | Lectura | Fetch /api/dashboard/summary |
| `navigate_to` | UI | Genera boton de navegacion |
| `explain_feature` | Texto | Devuelve explicacion de FEATURE_KNOWLEDGE |

#### FEATURE_KNOWLEDGE

Base de conocimiento estatica con explicaciones para: proyectos, agentes, tareas, conectores, rag, workers, skills, dashboard, mcp, openclaw + default.

#### Filtrado de tools por config

```typescript
export function getToolsForLLM(allowedActions?: string[]): CatBotTool[] {
  if (!allowedActions) return TOOLS; // Todas habilitadas por defecto
  // Siempre permite: navigate_to, explain_feature, list_*, get_*
  // Solo filtra las acciones de creacion segun allowedActions
}
```

### API endpoint (`app/src/app/api/catbot/chat/route.ts`)

~195 lineas. POST endpoint con tool-calling loop.

#### System prompt

```typescript
function buildSystemPrompt(context): string {
  // Personalidad: gato con gafas VR, amigable, en espanol
  // Conocimiento: 9 secciones de DoCatFlow explicadas
  // Contexto: pagina actual, nombre proyecto, estadisticas (proyectos/agentes/tareas)
  // Instrucciones: cuando usar cada tool
}
```

#### Tool-calling loop (max 3 iteraciones)

```
1. Enviar mensajes + system prompt + tools al LLM (LiteLLM proxy)
2. Si response tiene tool_calls:
   a. Ejecutar cada tool via executeTool()
   b. Agregar resultado como mensaje role:tool
   c. Volver a paso 1
3. Si no hay tool_calls: response final
```

#### Configuracion

Lee `catbot_config` de la tabla settings:
- `model`: modelo LLM (default: gemini-main)
- `personality`: personalidad (friendly/technical/minimal)
- `allowed_actions`: array de acciones permitidas

#### Usage logging

Cada interaccion se logea como evento `chat` con source `catbot` en metadata.

---

## 5. Phase 18: CatBot Frontend

### Componente flotante (`app/src/components/catbot/catbot-panel.tsx`)

~322 lineas. Tres estados visuales:

#### 1. Floating button (cerrado)

- Fixed bottom-right (bottom-6 right-6 z-50)
- Avatar circular 56px con logo
- Anillo violet-500/50, efecto hover scale-110
- Punto verde emerald-500 (status dot)

#### 2. Minimized

- Barra compacta con logo 24px + "CatBot" + badge de mensajes

#### 3. Full panel (abierto)

- 420x600px max-h-80vh
- Animacion slide-in-from-bottom-4
- Header: logo + "CatBot" + nombre modelo + botones (limpiar/minimizar/cerrar)
- Area de mensajes scrolleable
- Sugerencias contextuales (solo si no hay mensajes)
- Input con boton enviar (gradiente violet)

#### Sugerencias por pagina

```typescript
const PAGE_SUGGESTIONS: Record<string, string[]> = {
  '/':           ['Que puedo hacer?', 'Crear proyecto', 'Estado del sistema'],
  '/projects':   ['Crear proyecto', 'Como funciona el RAG?', 'Procesar fuentes'],
  '/agents':     ['Crear agente', 'Que es OpenClaw?', 'Importar skill'],
  '/tasks':      ['Crear tarea', 'Como funciona el pipeline?', 'Usar plantilla'],
  '/connectors': ['Crear conector n8n', 'Que es MCP?', 'Test conector'],
  '/settings':   ['Configurar API key', 'Cambiar modelo'],
  '/workers':    ['Que son los Workers?', 'Crear worker'],
  '/skills':     ['Que son las Skills?', 'Crear skill'],
};
```

#### Persistencia

- localStorage key: `docatflow_catbot_messages`
- Max 50 mensajes guardados
- Se cargan al montar, se guardan al cambiar

#### Renderizado de respuestas

- Mensajes usuario: burbuja violet-600/20 alineada a derecha
- Mensajes asistente: burbuja zinc-800 alineada a izquierda con emoji gato
- Tool calls: cards compactas con nombre de tool + checkmark si exitoso
- Action buttons: botones clickeables que navegan con `router.push()`

#### Integracion en layout

```typescript
// app/src/app/layout.tsx
const CatBotPanel = dynamic(
  () => import("@/components/catbot/catbot-panel").then(m => ({ default: m.CatBotPanel })),
  { ssr: false }
);
// Renderizado dentro del body, despues del Toaster
```

---

## 6. Phase 19: CatBot Configuracion

### Seccion en Settings (`app/src/app/settings/page.tsx`)

Componente `CatBotSettings` agregado entre "Costes de modelos" y "Embeddings":

| Campo | Tipo | Opciones |
|-------|------|----------|
| Modelo | Input texto | Libre (default: gemini-main) |
| Personalidad | Select | Amigable / Tecnico / Minimalista |
| Acciones permitidas | Checkboxes | Crear proyectos, Crear agentes, Crear tareas, Crear conectores |
| Eliminar recursos | Checkbox disabled | Deshabilitado (seguridad) |

#### Guardado

```typescript
// POST /api/settings con key 'catbot_config'
{
  model: "gemini-main",
  personality: "friendly",
  allowed_actions: ["create_projects", "create_agents", "create_tasks", "create_connectors"]
}
```

#### Boton "Limpiar historial"

Elimina `docatflow_catbot_messages` de localStorage.

---

## 7. Phase 20: MCP Bridge Backend

### Endpoint MCP (`app/src/app/api/mcp/[projectId]/route.ts`)

~270 lineas. Implementa MCP Streamable HTTP (JSON-RPC 2.0).

#### POST — Protocolo MCP

Metodos soportados:

| Metodo | Que hace |
|--------|---------|
| `initialize` | Devuelve serverInfo + capabilities (tools) |
| `tools/list` | Lista las 3 tools disponibles |
| `tools/call` | Ejecuta una tool con argumentos |
| `ping` | Health check |
| `notifications/initialized` | ACK de inicializacion |

#### 3 Tools MCP

| Tool | Input | Output |
|------|-------|--------|
| `search_knowledge` | `query` (string), `limit` (number, max 20) | Resultados RAG con score, source, content, metadata |
| `get_project_info` | — | Nombre, proposito, stack, status, fuentes, version |
| `get_document` | `version` (number, opcional) | Contenido completo del output procesado |

#### search_knowledge — Flujo

```
1. Validar RAG habilitado en proyecto
2. Determinar modelo de embeddings (DB o guess por vector size)
3. Generar embedding del query via ollama.getEmbedding()
4. Buscar en Qdrant via qdrant.search()
5. Mapear resultados: score, source, content, metadata
```

#### get_document — Fallback

```
1. Buscar processing_run completado para la version solicitada
2. Leer output_path del filesystem
3. Si falla, intentar ruta alternativa: data/projects/{id}/output_v{N}.md
```

#### GET — Discovery endpoint

Devuelve metadata del servidor MCP:
```json
{
  "name": "DoCatFlow — {project.name}",
  "description": "{project.purpose}",
  "version": "1.0.0",
  "protocol": "2024-11-05",
  "endpoint": "{baseUrl}/api/mcp/{projectId}",
  "tools": [{ "name": "...", "description": "..." }],
  "rag_enabled": true,
  "rag_collection": "..."
}
```

#### Auto-activacion (MCP-05)

El endpoint funciona automaticamente cuando el proyecto tiene RAG habilitado. No requiere flag adicional — la comprobacion es dinamica: `if (!project.rag_enabled)` devuelve error en search_knowledge.

---

## 8. Phase 21: MCP Bridge UI

### Panel MCP en RAG (`app/src/components/rag/rag-panel.tsx`)

Se reemplazo la card antigua "Integracion MCP" (que mostraba Qdrant directo) con un panel completo de MCP Bridge:

#### Contenido del panel

1. **Header**: Icono Globe + "MCP Bridge" + Badge "Activo" verde
2. **Endpoint URL**: `/api/mcp/{project.id}` copiable con boton
3. **Tools disponibles**: 3 items (search_knowledge, get_project_info, get_document) con iconos y descripcion
4. **Conectar desde**: Grid 2x2 con 4 botones de conexion

#### Botones de conexion

| Boton | Icono | Color | Que copia |
|-------|-------|-------|-----------|
| OpenClaw | Bot | violet | Config para openclaw.json shttp_servers |
| OpenHands | Terminal | blue | Config para .openhands/config.toml |
| n8n | Plug | amber | URL + protocolo para MCP Client node |
| curl / HTTP | Globe | emerald | Comando curl para tools/list |

Cada boton copia al clipboard la configuracion lista para pegar.

#### Imports nuevos en rag-panel.tsx

`Globe`, `Plug`, `Terminal` de lucide-react.

#### Eliminado

- Funcion `copyIntegrationCode` (ya no se usa)
- Code block antiguo con Qdrant URL directa

---

## 9. Phase 22: UX Polish Global

### 3 componentes de layout nuevos

#### Breadcrumb (`app/src/components/layout/breadcrumb.tsx`)

- Auto-genera migas de pan desde `usePathname()`
- Icono Home como primer elemento
- Separadores ChevronRight
- Ultimo segmento en zinc-300 (no clickeable)
- Labels amigables via `ROUTE_LABELS` map
- No se muestra en `/` (dashboard)

#### PageHeader (`app/src/components/layout/page-header.tsx`)

```typescript
interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}
```

- Incluye `<Breadcrumb />` automaticamente
- Titulo h1 2xl bold + descripcion sm zinc-400
- Icono violet-400 a la izquierda
- Area de accion (botones) a la derecha

#### Footer (`app/src/components/layout/footer.tsx`)

- Barra fija inferior con `border-t border-zinc-800`
- Izquierda: "DoCatFlow v1.0"
- Derecha: 4 puntos de servicio (OpenClaw, n8n, Qdrant, LiteLLM)
- Colores: emerald (connected), red (disconnected), zinc-600 (checking)
- Usa `useSystemHealth()` hook existente

### Animaciones CSS (`app/src/app/globals.css`)

3 animaciones nuevas:

```css
.animate-fade-in   /* opacity 0→1, 0.3s ease-out */
.animate-slide-up  /* translateY(8px)→0 + opacity, 0.3s ease-out */
.animate-shimmer   /* background gradient sweep, 1.5s infinite */
```

### Layout actualizado (`app/src/app/layout.tsx`)

```tsx
<Sidebar />
<div className="flex-1 flex flex-col overflow-hidden">
  <main className="flex-1 overflow-y-auto animate-fade-in">
    {children}
  </main>
  <Footer />
</div>
```

### Sidebar responsive (`app/src/components/layout/sidebar.tsx`)

- **Desktop** (lg+): sidebar visible fijo `hidden lg:flex w-64`
- **Mobile** (<lg): sidebar oculto, hamburger button fixed top-left
- Overlay negro semitransparente al abrir
- Animacion slide transform `translate-x-0` / `-translate-x-full`
- Auto-cierra al cambiar de ruta (`useEffect` con pathname)
- Imports nuevos: `useState`, `useEffect`, `Menu`, `X`

### PageHeader aplicado en 6 paginas

| Pagina | Icono | Titulo |
|--------|-------|--------|
| `/agents` | Bot | Agentes |
| `/tasks` | ClipboardList | Tareas |
| `/workers` | FileOutput | Docs Workers |
| `/skills` | Sparkles | Skills |
| `/settings` | Settings | Configuracion |
| `/connectors` | Plug | Conectores |

Todas con `animate-slide-up` en el container principal.

---

## 10. Errores encontrados y corregidos

### Error 1: Import `Settings` no usado en catbot-panel.tsx

```
Build error: 'Settings' is declared but its value is never read
```
**Fix**: Eliminado `Settings` de imports de lucide-react.

### Error 2: `setModel` no usado en catbot-panel.tsx

```
Build error: 'setModel' is assigned a value but never used
```
**Fix**: Cambiado `const [model, setModel] = useState(...)` a `const [model] = useState(...)`.

### Error 3: Type unknown en catbot-panel.tsx linea 243

```
Type error: Type 'unknown' is not assignable to type 'ReactNode'
```
El patron `'id' in result && (<span>)` retorna `unknown`. **Fix**: Cambiado a ternario `? (<span>) : null`.

### Error 4: `copyIntegrationCode` no usado en rag-panel.tsx

```
Error: 'copyIntegrationCode' is assigned a value but never used
```
**Fix**: Eliminada la funcion (reemplazada por botones de conexion MCP).

### Error 5: Type null en mcpError en mcp route.ts

```
Type error: Argument of type 'null' is not assignable to parameter of type 'string | number | undefined'
```
**Fix**: Cambiado `mcpError(null, ...)` a `mcpError(undefined, ...)`.

---

## 11. Archivos nuevos y modificados

### Archivos nuevos

| Archivo | Lineas | Descripcion |
|---------|--------|-------------|
| `app/src/lib/services/catbot-tools.ts` | ~309 | 11 tool definitions + executeTool + FEATURE_KNOWLEDGE |
| `app/src/app/api/catbot/chat/route.ts` | ~195 | POST endpoint con tool-calling loop via LiteLLM |
| `app/src/components/catbot/catbot-panel.tsx` | ~322 | Panel flotante CatBot (3 estados) |
| `app/src/app/api/mcp/[projectId]/route.ts` | ~270 | MCP Streamable HTTP endpoint (POST + GET) |
| `app/src/components/layout/breadcrumb.tsx` | ~50 | Auto-breadcrumb desde pathname |
| `app/src/components/layout/page-header.tsx` | ~30 | Titulo + descripcion + accion reutilizable |
| `app/src/components/layout/footer.tsx` | ~32 | Footer con version + service status dots |

### Archivos modificados

| Archivo | Cambios principales |
|---------|--------------------|
| `app/src/app/layout.tsx` | +CatBotPanel dynamic import, +Footer, metadata "DoCatFlow", wrapper div flex-col |
| `app/src/components/layout/sidebar.tsx` | Logo circular, nombre estilizado, responsive hamburger, import logo.jpg |
| `app/src/app/page.tsx` | Welcome screen condicional, rename "DoCatFlow" |
| `app/src/app/globals.css` | +3 animaciones (fade-in, slide-up, shimmer) |
| `app/src/components/rag/rag-panel.tsx` | +MCP Bridge panel, -copyIntegrationCode, +Globe/Plug/Terminal imports |
| `app/src/app/agents/page.tsx` | +PageHeader, +animate-slide-up, rename "DoCatFlow" |
| `app/src/app/tasks/page.tsx` | +PageHeader, +animate-slide-up |
| `app/src/app/workers/page.tsx` | +PageHeader, +animate-slide-up |
| `app/src/app/skills/page.tsx` | +PageHeader, +animate-slide-up |
| `app/src/app/settings/page.tsx` | +PageHeader, +CatBotSettings component, +Settings/Cat icons |
| `app/src/app/connectors/page.tsx` | +PageHeader, +animate-slide-up |
| `app/src/app/api/agents/create/route.ts` | Rename DocFlow→DoCatFlow en workspace files |
| `app/src/app/api/projects/[id]/bot/create/route.ts` | Rename DocFlow→DoCatFlow en workspace files |
| `app/src/lib/db.ts` | Rename seed author "DoCatFlow" |
| `app/src/components/system/diagnostic-content.ts` | Rename "DoCatFlow" |
| `app/src/components/system/system-health-panel.tsx` | Rename "DoCatFlow Core" |
| `app/src/components/system/service-card.tsx` | Rename "Webhook DoCatFlow" |
| `app/src/components/sources/youtube-input.tsx` | Rename "DoCatFlow" |
| ~22 archivos .tsx | Gradientes en botones primarios |

### Archivos de planificacion actualizados

| Archivo | Cambios |
|---------|---------|
| `.planning/STATE.md` | status: complete, 8/8 phases, decisiones v4.0, context acumulado |

---

## 12. Deploy y verificacion

### Build local

```bash
cd ~/docflow/app && npm run build
# Resultado: Build exitoso (solo warnings de useEffect deps, no errores)
```

### Deploy Docker

```bash
docker compose build --no-cache && docker compose up -d && \
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && \
docker restart docflow-app
```

### Tests E2E para verificacion humana

#### Test 1: Rebranding
1. Verificar logo circular en sidebar
2. Verificar "DoCatFlow" con "Cat" en mauve
3. Verificar version v1.0 bajo el nombre
4. Verificar gradientes en botones de todas las paginas

#### Test 2: Welcome
1. Con 0 proyectos: verificar pantalla de bienvenida con logo grande
2. Con proyectos: verificar dashboard normal

#### Test 3: CatBot
1. Click en avatar flotante bottom-right -> abre panel
2. Verificar sugerencias contextuales en pagina actual
3. Escribir "Crear proyecto Test" -> verificar tool_call create_project
4. Verificar boton de navegacion en respuesta
5. Minimizar -> verificar barra compacta con conteo
6. Limpiar historial -> verificar que se borra

#### Test 4: CatBot Config
1. Ir a Settings -> seccion CatBot
2. Cambiar modelo -> guardar -> verificar persistencia
3. Desmarcar "Crear conectores" -> verificar que CatBot no puede crear conectores

#### Test 5: MCP Bridge
1. Proyecto con RAG indexado -> tab RAG -> panel MCP Bridge
2. Verificar endpoint URL copiable
3. Verificar 3 tools listadas
4. Click "curl / HTTP" -> verificar comando copiado
5. Ejecutar curl copiado contra el endpoint -> verificar respuesta tools/list

#### Test 6: MCP Bridge search
```bash
# Test de search_knowledge
curl -X POST http://localhost:3500/api/mcp/{PROJECT_ID} \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_knowledge","arguments":{"query":"arquitectura del proyecto"}}}'
```

#### Test 7: UX Polish
1. Verificar breadcrumbs en todas las paginas (excepto dashboard)
2. Verificar PageHeader consistente con icono + titulo + accion
3. Verificar footer con 4 puntos de servicio
4. Verificar animacion fade-in al cargar paginas
5. Reducir ventana a movil -> verificar hamburger menu
6. Click hamburger -> verificar sidebar slide-in con overlay
7. Navegar -> verificar que sidebar se cierra automaticamente
