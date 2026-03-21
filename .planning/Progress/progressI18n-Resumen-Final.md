# i18n Milestone — Resumen Final

**Fecha:** 2026-03-20
**Estado:** COMPLETADO
**Build:** OK (clean)

## Estadísticas Globales

| Métrica | Valor |
|---|---|
| **Total claves por idioma** | 1,659 |
| **Idiomas soportados** | Español (es), English (en) |
| **Namespaces creados** | 25 |
| **Archivos TSX migrados** | ~30+ (Fases 1-9) |
| **Build final** | Limpio, sin errores |

## Namespaces — Detalle y Conteo

| Namespace | Claves | Descripción |
|---|---|---|
| `agents` | 197 | CRUD agentes, editor, configuración, plantillas |
| `canvas` | 192 | Editor visual, nodos, ejecución, paneles |
| `connectors` | 190 | Página conectores, tipos, Gmail wizard, OAuth2 |
| `tasks` | 144 | Gestión tareas, pasos, ejecución, historial |
| `settings` | 106 | API keys, procesamiento, modelos, CatBot config |
| `rag` | 88 | Panel RAG, indexación, chunks, búsqueda |
| `catbrains` | 85 | Lista CatBrains, creación, detalle |
| `process` | 79 | Panel procesamiento, streaming, modos, fuentes |
| `skills` | 74 | Editor skills, importación, OpenClaw |
| `projectSettings` | 67 | Settings del CatBrain, estado, datos, zona peligrosa |
| `catbrainConnectors` | 59 | Panel conectores dentro de CatBrain, CRUD, test |
| `sources` | 53 | Lista fuentes, drag-and-drop, filtros, nota editor |
| `system` | 52 | Health monitor, 4 servicios, diagnóstico |
| `dashboard` | 47 | Página principal, estadísticas, acciones rápidas |
| `testing` | 47 | Centro de calidad, resultados, historial, logs |
| `catbot` | 37 | Asistente IA, chat, acciones |
| `versionHistory` | 37 | Historial versiones, limpieza, previsualización |
| `common` | 26 | Textos comunes reutilizables |
| `layout` | 20 | Layout principal, sidebar, breadcrumbs |
| `nav` | 14 | Navegación principal |
| `chat` | 12 | Panel de chat |
| `pipeline` | 12 | Footer de pipeline, navegación entre pasos |
| `welcome` | 6 | Selector de idioma |
| `workers` | 6 | CatPaw workers |
| `errorBoundary` | 6 | Error boundaries unificados |
| `_meta` | 3 | Metadata del sistema i18n |

## Archivos Migrados por Fase

### Fase 1 — Infraestructura
- `middleware.ts`, `src/lib/i18n.ts`, `next.config.mjs`
- `messages/es.json`, `messages/en.json` (creados)

### Fase 2 — Layout + Sidebar + Nav
- `src/app/layout.tsx`, `src/components/layout/sidebar.tsx`

### Fase 3 — Dashboard
- `src/app/page.tsx`

### Fase 4 — CatBrains + Chat
- `src/app/catbrains/page.tsx`, `src/app/catbrains/new/page.tsx`
- `src/app/catbrains/[id]/page.tsx`, `src/components/chat/chat-panel.tsx`

### Fase 5 — Agents + Skills + Workers
- `src/app/agents/page.tsx`, `src/app/skills/page.tsx`
- `src/app/workers/page.tsx`

### Fase 6 — RAG
- `src/components/rag/rag-panel.tsx`

### Fase 7 — Tasks + Canvas
- `src/app/tasks/page.tsx`, `src/app/tasks/new/page.tsx`
- `src/app/tasks/[id]/page.tsx`, `src/app/canvas/page.tsx`
- `src/app/canvas/[id]/page.tsx` + componentes canvas

### Fase 8 — Conectores + Settings + System + Testing
- `src/app/connectors/page.tsx`, `src/app/connectors/error.tsx`
- `src/components/connectors/gmail-wizard.tsx`
- `src/app/settings/page.tsx`, `src/app/settings/error.tsx`
- `src/components/system/system-health-panel.tsx`
- `src/components/system/service-card.tsx`
- `src/components/system/diagnostic-sheet.tsx`
- `src/components/system/diagnostic-content.ts`
- `src/app/testing/page.tsx` + 7 componentes testing

### Fase 9 — Revisión y Limpieza Final
- `src/app/catbrains/error.tsx` (migrado a patrón unificado errorBoundary)
- `src/components/process/process-panel.tsx` (~77 strings)
- `src/components/process/version-history.tsx` (~37 strings)
- `src/components/catbrains/connectors-panel.tsx` (~59 strings)
- `src/components/projects/project-settings-sheet.tsx` (~67 strings)
- `src/components/sources/source-list.tsx` (~30 strings)
- `src/components/sources/source-manager.tsx` (~12 strings)
- `src/components/sources/note-editor.tsx` (~6 strings)
- `src/components/projects/pipeline-footer.tsx` (~12 strings)

## Strings Deliberadamente NO Traducidos

| Categoría | Ejemplos | Razón |
|---|---|---|
| Nombres de servicios | OpenClaw, n8n, Qdrant, LiteLLM, SearXNG, LinkedIn MCP | Nombres propios de productos |
| Nombres de modelos LLM | gpt-4o, claude-sonnet-4-6, gemini-2.5-pro, gemini-main | Identificadores técnicos |
| Nombres de providers | OpenAI, Anthropic, Google, Ollama | Marcas comerciales |
| Términos técnicos | OAuth2, SMTP, App Password, Client ID, MCP, Webhook, TLS, SSE, REST API | Estándares técnicos universales |
| Comandos bash | systemctl, docker ps, curl, ss | Comandos del sistema |
| Log sources | Processing, Chat, RAG, CatBot, Tasks, Canvas | Identificadores de sistema |
| Niveles de log | info, warn, error | Estándares universales |
| Etiquetas de campos técnicos | Webhook URL, Headers (JSON), SMTP Host, SMTP Port, Server URL | Campos de configuración técnica |
| System prompts | Contenido de prompts enviados a LLMs | Deben permanecer en inglés para mejor rendimiento |
| Welcome page | Texto bilíngüe en selector de idioma | Intencionalmente muestra ambos idiomas simultáneamente |
| ErrorBoundary (class) | Fallback genérico en React.Component | Class component no puede usar hooks |

## Instrucciones para Añadir un Nuevo Idioma

1. **Copiar archivo base:**
   ```bash
   cp app/messages/es.json app/messages/fr.json  # o el código ISO correspondiente
   ```

2. **Traducir todos los valores** del nuevo archivo JSON (mantener las claves idénticas)

3. **Añadir el código al array `SUPPORTED_LOCALES`:**
   ```typescript
   // src/lib/i18n.ts
   export const SUPPORTED_LOCALES = ['es', 'en', 'fr'];
   ```

4. **Añadir la opción al selector de idioma:**
   - `src/app/welcome/page.tsx` — Añadir entrada al array `LANGUAGES`
   - `src/components/layout/sidebar.tsx` — Añadir opción al selector de idioma del sidebar

5. **Verificar:**
   ```bash
   cd app && npm run build
   ```

## Estado Final

- Build limpio sin errores
- 1,659 claves i18n por idioma
- 25 namespaces organizados semánticamente
- Español (es) e Inglés (en) con cobertura completa
- JSONs perfectamente sincronizados (0 diferencias estructurales)
- Sin texto español detectado en en.json
- Milestone i18n **COMPLETADO**
