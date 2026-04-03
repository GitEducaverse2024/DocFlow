# CODING_RULES.md — DoCatFlow

Documento de referencia obligatorio para cualquier asistente IA antes de implementar codigo.
Ultima actualizacion: 2026-03-20.

---

## 1. Documentacion de referencia

| Documento | Ruta | Cuando consultarlo |
|-----------|------|-------------------|
| README.md | `~/docflow/README.md` | Antes de cualquier trabajo. Arquitectura, stack, API routes, modelo de datos, troubleshooting |
| CODING_RULES.md | `.planning/CODING_RULES.md` | Antes de escribir codigo. Convenciones, i18n, UI, checklist |
| CONNECTORS.md | `.planning/CONNECTORS.md` | Al tocar conectores, Gmail, email-service, OAuth2 |
| Progress de sesion | `.planning/Progress/progressSesionN.md` | Para contexto de decisiones recientes. Sesiones 1-23 disponibles |
| Progress i18n | `.planning/Progress/progressI18n-*.md` | Para detalle de migracion i18n por fase (Fases 3-9 + Resumen Final) |
| GUIA_USUARIO.md | `.planning/GUIA_USUARIO.md` | Guia de uso orientada al usuario final |

### Archivos de progreso de sesion

Cada `progressSesionN.md` documenta: que se hizo, por que, que archivos se tocaron, bugs encontrados y decisiones tomadas. Son utiles para:
- Entender el contexto detras de codigo que parece inusual
- Evitar reintroducir bugs ya corregidos
- Saber que features son recientes y podrian tener edge cases

---

## 2. Reglas fundamentales de codigo

### Variables de entorno

**Regla critica:** Usar `process['env']['VARIABLE']` (bracket notation), NO `process.env.VARIABLE`.
Webpack inline las variables con dot notation en build time. Bracket notation las preserva para runtime.

### API Routes

**Regla critica:** Toda API route que lea variables de entorno y NO tenga parametros dinamicos (`[id]`) debe exportar:
```typescript
export const dynamic = 'force-dynamic';
```
Sin esto, Next.js prerenderiza la ruta como estatica en build time y las variables de entorno no estaran disponibles.

### Base de datos

- **SQLite** con `better-sqlite3` en modo WAL
- Las migraciones se ejecutan en `app/src/lib/db.ts` al inicializar
- `file_path` en tabla `sources` se almacena como ruta absoluta completa (ej: `/app/data/projects/{id}/sources/folder/uuid.ext`), no relativa

### Red entre servicios

- Servicios en la misma red Docker Compose (Qdrant, Ollama): usar nombre de servicio (`docflow-ollama`, `docflow-qdrant`)
- Servicios fuera de la red Compose (LiteLLM, OpenClaw, n8n): usar IP del host o `host.docker.internal`
- `docker-compose.yml` declara `extra_hosts: host.docker.internal:host-gateway`

### Docker

- Base image: `node:20-slim` (Debian). **NO Alpine** — `better-sqlite3` necesita glibc
- `.dockerignore` DEBE excluir `node_modules`, `.next`, `.git` para evitar conflicto Node 22 (host) vs Node 20 (Docker)
- Build completo: `docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app`

### Imports y exports

- Componentes de pagina usan `export default function`
- API routes exportan funciones nombradas: `export async function GET()`, `export async function POST()`, etc.
- Componentes reutilizables usan `export function ComponentName()`

### Streaming

- Las respuestas de streaming (procesamiento, chat) usan SSE via `ReadableStream` + `TextEncoder`
- Helper en `app/src/lib/services/stream-utils.ts`

---

## 3. Reglas de i18n (OBLIGATORIO)

El sistema de internacionalizacion fue implementado completamente en el milestone i18n (sesion 20).

### Regla principal

**Todo string visible para el usuario debe pasar por `t()`.** No se permite texto hardcoded en archivos TSX excepto las excepciones listadas mas abajo.

### Stack i18n

- **Libreria:** `next-intl` v3.26.5
- **Idiomas soportados:** Espanol (`es`), Ingles (`en`). Default: `es`
- **Cookie de idioma:** `docatflow_locale`
- **Middleware:** `app/src/middleware.ts` — redirige a `/welcome` si no hay cookie de idioma
- **Configuracion:** `app/src/lib/i18n.ts` — `getRequestConfig` lee cookie y carga JSON

### Como usar

**En componentes cliente (Client Components):**
```typescript
import { useTranslations } from 'next-intl';
// o el alias:
import { useT } from '@/lib/use-t';

function MyComponent() {
  const t = useTranslations('namespace');
  return <p>{t('key')}</p>;
}
```

**En Server Components / API routes:**
```typescript
import { getTranslations } from 'next-intl/server';

async function handler() {
  const t = await getTranslations('namespace');
  return t('key');
}
```

**Interpolacion (ICU):**
```typescript
t('message', { count: 5, name: 'Test' })
// JSON: "message": "Hay {count} items de {name}"
```

**Plurales (ICU):**
```typescript
// JSON: "items": "{count, plural, one {# item} other {# items}}"
t('items', { count: 3 })
```

**Acceso raw (arrays/objetos):**
```typescript
const months = t.raw('months') as string[];
const config = t.raw('steps.sources') as { next: string; prev: string };
```

**Helper functions fuera del componente:**
```typescript
function timeAgo(date: Date, t: ReturnType<typeof useTranslations>): string {
  // ...
  return t('timeAgo.minutes', { count: mins });
}
```

### Archivos JSON de traducciones

| Archivo | Contenido |
|---------|-----------|
| `app/messages/es.json` | Traducciones en espanol (idioma base) |
| `app/messages/en.json` | Traducciones en ingles |

**Regla de paridad:** Ambos archivos DEBEN tener exactamente las mismas claves. Al anadir una clave en `es.json`, anadirla tambien en `en.json` con la traduccion correspondiente.

### Namespaces existentes (26 total, 1,659 claves por idioma)

| Namespace | Claves | Uso |
|-----------|--------|-----|
| `_meta` | 3 | Metadata del sistema i18n |
| `agents` | 197 | CRUD agentes, editor, configuracion, plantillas |
| `canvas` | 192 | Editor visual, nodos, ejecucion, paneles |
| `catbot` | 37 | Asistente IA, chat, acciones |
| `catbrainConnectors` | 59 | Panel conectores dentro de CatBrain, CRUD, test |
| `catbrains` | 85 | Lista CatBrains, creacion, detalle |
| `chat` | 12 | Panel de chat |
| `common` | 26 | Textos comunes reutilizables (save, cancel, delete, etc.) |
| `connectors` | 190 | Pagina conectores, tipos, Gmail wizard, OAuth2 |
| `dashboard` | 47 | Pagina principal, estadisticas, acciones rapidas |
| `errorBoundary` | 6 | Error boundaries unificados con `{section}` interpolado |
| `layout` | 20 | Layout principal, sidebar, breadcrumbs |
| `nav` | 14 | Navegacion principal |
| `pipeline` | 12 | Footer de pipeline, navegacion entre pasos |
| `process` | 79 | Panel procesamiento, streaming, modos, fuentes |
| `projectSettings` | 67 | Settings del CatBrain, estado, datos, zona peligrosa |
| `rag` | 88 | Panel RAG, indexacion, chunks, busqueda |
| `settings` | 106 | API keys, procesamiento, modelos, CatBot config |
| `skills` | 74 | Editor skills, importacion, OpenClaw |
| `sources` | 53 | Lista fuentes, drag-and-drop, filtros, nota editor |
| `system` | 52 | Health monitor, 4 servicios, diagnostico |
| `tasks` | 144 | Gestion tareas, pasos, ejecucion, historial |
| `testing` | 47 | Centro de calidad, resultados, historial, logs |
| `versionHistory` | 37 | Historial versiones, limpieza, previsualizacion |
| `welcome` | 6 | Selector de idioma |
| `workers` | 6 | CatPaw workers |

### Que NO se traduce (y por que)

| Categoria | Ejemplos | Razon |
|-----------|----------|-------|
| Nombres de servicios | OpenClaw, n8n, Qdrant, LiteLLM, SearXNG | Nombres propios de productos |
| Nombres de modelos LLM | gpt-4o, claude-sonnet-4-6, gemini-2.5-pro | Identificadores tecnicos |
| Nombres de providers | OpenAI, Anthropic, Google, Ollama | Marcas comerciales |
| Terminos tecnicos | OAuth2, SMTP, App Password, Client ID, MCP, Webhook, TLS, SSE, REST API | Estandares universales |
| Comandos bash | systemctl, docker ps, curl | Comandos del sistema |
| Log sources / levels | Processing, Chat, RAG, info, warn, error | Identificadores de sistema |
| Etiquetas de campos tecnicos | Webhook URL, Headers (JSON), SMTP Host, SMTP Port | Campos de configuracion |
| System prompts | Contenido de prompts enviados a LLMs | Deben permanecer en ingles para mejor rendimiento |
| Welcome page | Texto bilingue en selector de idioma | Muestra ambos idiomas simultaneamente |
| ErrorBoundary (class) | Fallback generico en React.Component | Class component no puede usar hooks |

### Como anadir un nuevo idioma

1. Copiar archivo base: `cp app/messages/es.json app/messages/fr.json`
2. Traducir todos los valores del nuevo JSON (mantener claves identicas)
3. Anadir codigo al array `SUPPORTED_LOCALES` en `app/src/lib/i18n.ts`
4. Anadir opcion al selector en `app/src/app/welcome/page.tsx` (array `LANGUAGES`) y en `app/src/components/layout/sidebar.tsx`
5. Verificar: `cd app && npm run build`

---

## 4. Convenciones de UI

### Terminologia interna

| Nombre en codigo | Que es |
|-----------------|--------|
| **CatBrain** | Base de conocimiento. Contiene fuentes, procesamiento, RAG y chat |
| **CatPaw** | Worker/agente de procesamiento. Antes se llamaba "Worker" o "Agent" (renombrado v9.0) |
| **CatBot** | Asistente IA flotante con herramientas y modo sudo |
| **Docs Worker** | Worker especializado en documentacion (tipo legacy) |

Usar siempre estos nombres en la UI, no los genericos.

### Colores y estilos

- **Dark mode por defecto** — toda la UI usa fondo zinc-900/950, texto zinc-50/100/300/400
- **Acento principal:** gradiente violeta `from-violet-600 to-purple-700` (botones primarios, badges activos)
- **Acento exito:** esmeralda `emerald-500/600` (badges de exito, test ok)
- **Acento peligro:** rojo `red-500/600` (eliminar, errores, zonas de peligro)
- **Acento informacion:** azul `blue-500/600` (links, info badges)
- **Bordes:** `border-zinc-700/800`
- **Cards:** `bg-zinc-900/50 border border-zinc-800 rounded-lg`

### Estados visuales

| Estado | Color | Badge |
|--------|-------|-------|
| Activo/Conectado | `emerald-500` | Pulso verde |
| Procesando | `amber-500` | Spinner `Loader2 animate-spin` |
| Error | `red-500` | Icono `AlertTriangle` |
| Pendiente | `violet-500` | Badge pulsante |
| Desconectado | `zinc-500` | Gris |

### Componentes UI

- **Base:** shadcn/ui (`@/components/ui/`)
- **Iconos:** Lucide React (`lucide-react`)
- **Toasts:** Sonner (`toast.success()`, `toast.error()`, `toast.info()`)

### Animaciones disponibles (Tailwind)

- `animate-fade-in` — entrada suave
- `animate-spin` — rotacion continua (spinners)
- `animate-pulse` — pulso (badges de estado)

---

## 5. Estructura de archivos

```
~/docflow/
├── docker-compose.yml
├── .env / .env.example
├── README.md
├── .planning/                      # Documentacion del proyecto
│   ├── CODING_RULES.md             # Este archivo
│   ├── CONNECTORS.md               # Documentacion de conectores
│   ├── GUIA_USUARIO.md
│   └── Progress/                   # Logs de sesion e i18n
│       ├── progressSesion{1-23}.md
│       └── progressI18n-*.md
├── app/                            # Aplicacion Next.js
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   ├── next.config.mjs
│   ├── messages/                   # Traducciones i18n
│   │   ├── es.json                 # Espanol (1,659 claves)
│   │   └── en.json                 # Ingles (1,659 claves)
│   ├── scripts/
│   │   └── rag-worker.mjs
│   └── src/
│       ├── middleware.ts            # Redirige a /welcome si no hay cookie locale
│       ├── app/                    # Pages (App Router)
│       │   ├── page.tsx            # Dashboard
│       │   ├── welcome/            # Selector de idioma (bilingue)
│       │   ├── catbrains/          # CatBrains CRUD + detalle
│       │   ├── agents/             # CatPaw CRUD
│       │   ├── workers/            # Workers (legacy alias)
│       │   ├── skills/             # Skills
│       │   ├── tasks/              # Tasks
│       │   ├── canvas/             # Workflows visuales
│       │   ├── connectors/         # Conectores + Gmail
│       │   ├── settings/           # Configuracion
│       │   ├── system/             # Panel de estado
│       │   ├── notifications/
│       │   ├── testing/            # Testing dashboard
│       │   └── api/                # Route Handlers
│       │       ├── catbrains/      # CRUD + sources + process + RAG + chat + connectors
│       │       ├── connectors/     # Gmail test/send/oauth2
│       │       ├── catbot/         # Chat + sudo + docs
│       │       ├── models/         # LLM + embedding models
│       │       ├── mcp/            # Endpoints MCP
│       │       ├── health/
│       │       └── ...
│       ├── components/
│       │   ├── ui/                 # shadcn/ui + custom
│       │   ├── layout/             # Sidebar, breadcrumbs
│       │   ├── catbrains/          # Componentes CatBrain
│       │   ├── sources/            # source-list, source-manager, file-upload-zone, note-editor
│       │   ├── process/            # process-panel, version-history
│       │   ├── rag/                # rag-panel
│       │   ├── chat/               # chat-panel
│       │   ├── connectors/         # gmail-wizard
│       │   ├── projects/           # pipeline-nav, pipeline-footer, project-settings-sheet
│       │   ├── system/             # system-health-panel, service-card, diagnostic-*
│       │   └── testing/            # 7 componentes de testing
│       ├── lib/
│       │   ├── db.ts               # SQLite schema + migrations
│       │   ├── i18n.ts             # Configuracion next-intl
│       │   ├── use-t.ts            # Alias: useT = useTranslations
│       │   ├── types.ts            # Interfaces TypeScript
│       │   ├── logger.ts           # Logger estructurado
│       │   ├── sudo.ts             # Sesiones sudo
│       │   └── services/           # Clientes de servicios
│       │       ├── email-service.ts
│       │       ├── content-extractor.ts
│       │       ├── catbrain-connector-executor.ts
│       │       ├── ollama.ts / qdrant.ts / litellm.ts
│       │       ├── stream-utils.ts
│       │       └── ...
│       └── hooks/
│           ├── use-error-interceptor.ts
│           └── use-system-health.ts
├── scripts/
│   ├── host-agent.mjs
│   ├── setup-host-agent.sh
│   └── gateway-watcher.sh
└── qdrant-data/
```

---

## 6. Servicios y puertos

| Servicio | Puerto | Variable de entorno | Funcion |
|----------|--------|-------------------|---------|
| **DoCatFlow** | 3500 | — | Aplicacion principal (Next.js) |
| **Host Agent** | 3501 | `HOST_AGENT_URL` | Puente CatBot ↔ host (systemd) |
| **LiteLLM** | 4000 | `LITELLM_URL`, `LITELLM_API_KEY` | Proxy de modelos LLM |
| **n8n** | 5678 | `N8N_WEBHOOK_URL` | Automatizacion (opcional) |
| **Qdrant** | 6333 | `QDRANT_URL` | Base vectorial para RAG |
| **Ollama** | 11434 | `OLLAMA_URL` | Embeddings locales |
| **OpenClaw** | 18789 | `OPENCLAW_URL` | Agentes conversacionales (opcional) |

Otras variables relevantes:
- `DATABASE_PATH` — ruta SQLite (default `/app/data/docflow.db`)
- `PROJECTS_PATH` — directorio de CatBrains (default `/app/data/projects`)
- `CONNECTOR_SECRET` — clave AES-256-GCM para cifrado de credenciales
- `SERVER_HOSTNAME`, `DOCFLOW_USER` — para CatBot system prompt

---

## 7. Checklist pre-entrega

Antes de considerar cualquier implementacion como terminada, verificar:

- [ ] **i18n:** Todo string visible usa `t()`. Claves anadidas en AMBOS JSONs (es + en) con traducciones correctas
- [ ] **i18n namespace:** La clave nueva esta en el namespace correcto segun la tabla de la seccion 3
- [ ] **Build limpio:** `cd ~/docflow/app && npm run build` termina sin errores ni warnings
- [ ] **Variables de entorno:** Usan bracket notation `process['env']['VAR']`
- [ ] **API routes sin params dinamicos:** Exportan `dynamic = 'force-dynamic'` si leen env vars
- [ ] **Rutas de archivos en DB:** Se almacenan como rutas absolutas
- [ ] **Sin secrets hardcoded:** Credenciales, tokens y API keys van en `.env`
- [ ] **Terminologia correcta:** CatBrain (no "proyecto"), CatPaw (no "agente/worker"), CatBot (no "asistente")
- [ ] **Dark mode:** Los componentes nuevos siguen la paleta zinc + violeta
- [ ] **Toasts:** Mensajes de exito/error usan `toast.success(t(...))` / `toast.error(t(...))`
- [ ] **Sin regresiones:** La funcionalidad existente sigue operativa

### Si se toca Docker:
- [ ] Base image es `node:20-slim` (no Alpine)
- [ ] `.dockerignore` no fue modificado accidentalmente
- [ ] Build Docker completo funciona: `docker compose build --no-cache && docker compose up -d`
