# Sesion 15 — Phase 38: CatBot Diagnosticador + Base de Conocimiento (v8.0)

**Fecha:** 2026-03-14
**Milestone:** v8.0 CatBot Diagnosticador + Base de Conocimiento
**Estado:** COMPLETADO

---

## Resumen

Esta sesion implementa Phase 38, que transforma CatBot de un asistente reactivo a un diagnosticador proactivo de errores. Se implementaron 3 bloques principales mas una correccion de bug critico, totalizando 15 requisitos en 4 archivos nuevos y 6 modificados.

---

## Bug corregido

### BUG-38-01: "invalid model ID" en tareas y proyectos

**Problema:** Al ejecutar tareas multi-agente o procesar proyectos, si el modelo configurado en el agente no existia en LiteLLM routing.yaml, se obtenia un error 400 "invalid model ID" de OpenAI.

**Solucion:**
- Creada funcion `getAvailableModels()` en `litellm.ts` que consulta `GET /v1/models` y cachea 60s
- Creada funcion `resolveModel()` que valida el modelo y hace fallback: modelo solicitado → modelo por defecto (gemini-main) → primer modelo disponible
- El task executor (`task-executor.ts`) ahora llama `litellm.resolveModel()` antes de cada llamada LLM
- Creado endpoint `GET /api/models` para exponer la lista al frontend

---

## Bloque 1: Interceptor Global de Errores (ERR-01..06)

### Que hace
Captura automaticamente todos los errores HTTP (status >= 400) y errores JavaScript no capturados a nivel global, y abre CatBot con el contexto del error pre-cargado en el input.

### Archivos creados/modificados
- `src/lib/error-formatter.ts` — Utilidades: `formatErrorForCatBot()`, `detectService()`, `pushErrorToHistory()`, `getErrorHistory()`
- `src/hooks/use-error-interceptor.ts` — Hook que hace monkey-patch de `window.fetch` + escucha `window.onerror` y `onunhandledrejection`
- `src/components/system/error-interceptor-provider.tsx` — Wrapper client component para el hook
- `src/app/layout.tsx` — Monta `ErrorInterceptorProvider` como dynamic import (SSR: false)
- `src/components/catbot/catbot-panel.tsx` — Escucha evento `catbot:error`, auto-abre panel, pre-carga input, badge rojo animado

### Detalles tecnicos
- **Exclusiones de polling:** `/api/system`, `/api/health`, `/api/notifications/count`, `/api/testing/status`, `/api/canvas/runs/` — evita que errores de endpoints de polling abran CatBot spam
- **Deteccion de servicio:** Mapa de patrones URL → nombre de servicio (Qdrant, LiteLLM, Ollama, n8n, OpenClaw, DoCatFlow API)
- **Historial:** Ultimos 10 errores en localStorage + SQLite (via XMLHttpRequest para evitar loop con el interceptor de fetch)
- **Badge:** Circulo rojo con icono AlertCircle + animate-bounce cuando hay error sin atender; desaparece al enviar el mensaje

---

## Bloque 2: CatBot con Conocimiento de Documentacion (DOC-01..04)

### Que hace
Permite a CatBot buscar en la documentacion interna del proyecto (archivos .md de progress, planning, README) para dar respuestas contextualizadas sobre el estado del proyecto, decisiones tecnicas, y errores conocidos.

### Archivos creados/modificados
- `src/app/api/catbot/search-docs/route.ts` — Endpoint `GET /api/catbot/search-docs?q=...`
- `src/lib/services/catbot-tools.ts` — Nuevas tools: `search_documentation` y `read_error_history`
- `src/app/api/catbot/chat/route.ts` — System prompt ampliado con seccion de base de conocimiento

### Algoritmo de busqueda
1. Recopila archivos .md de `/app/.planning/`, `/app/.planning/Progress/`, `/app/README.md`
2. Lee cada archivo con cache TTL 5 min (invalidado si mtime cambia)
3. Divide en chunks de ~500 caracteres por parrafos o headings
4. Filtra chunks que contengan palabras de la query (case-insensitive)
5. Puntua por numero de palabras coincidentes
6. Devuelve top 5 resultados con `{ file, chunk, score }`

### Rutas de archivos
- Docker: `/app/.planning/`, `/app/.planning/Progress/`, `/app/README.md`
- Local (desarrollo): resolucion relativa desde `process.cwd()`

---

## Bloque 3: Diagnostico Inteligente de Errores (DIAG-01..03)

### Que hace
CatBot reconoce automaticamente patrones de error comunes y proporciona soluciones directas sin necesidad de herramientas externas.

### Tabla de troubleshooting (9 patrones)
| Error | Servicio | Solucion rapida |
|-------|----------|----------------|
| invalid model ID | LiteLLM | Editar agente, seleccionar modelo valido |
| Qdrant connection refused | Qdrant | docker compose up -d docflow-qdrant |
| Ollama connection refused | Ollama | docker compose up -d docflow-ollama |
| LiteLLM timeout / 502 | LiteLLM | Verificar API key del provider |
| collection does not exist | Qdrant | Re-procesar en pestana RAG |
| spawn pdftotext ENOENT | poppler | Verificar Dockerfile |
| ECONNREFUSED :3501 | Host Agent | systemctl --user restart docatflow-host-agent |
| OpenClaw RPC probe: failed | OpenClaw | systemctl --user restart openclaw-gateway |
| Cannot read properties of null (canvas) | Canvas | Recargar pagina o crear canvas nuevo |

### Protocolo de diagnostico
1. Mensaje empieza con "🔴 Error detectado" → buscar en tabla de troubleshooting
2. Si coincide → solucion directa
3. Si no coincide → usar `search_documentation` para contexto
4. Si tampoco encuentra → diagnostico generico por servicio/status code

### Historial de errores
- Endpoint `GET/POST /api/catbot/error-history`
- Persistido en tabla `settings` bajo clave `catbot_error_history`
- Tool `read_error_history` accesible por CatBot para ver errores recurrentes

---

## Archivos creados (4)

| Archivo | Proposito |
|---------|-----------|
| `src/lib/error-formatter.ts` | Formateo de errores, deteccion de servicios, historial |
| `src/hooks/use-error-interceptor.ts` | Monkey-patch de fetch + captura de errores JS |
| `src/components/system/error-interceptor-provider.tsx` | Wrapper client para el hook |
| `src/app/api/catbot/search-docs/route.ts` | Busqueda en documentacion .md |
| `src/app/api/catbot/error-history/route.ts` | Historial de errores (GET/POST) |
| `src/app/api/models/route.ts` | Lista de modelos disponibles en LiteLLM |

## Archivos modificados (6)

| Archivo | Cambios |
|---------|---------|
| `src/lib/services/litellm.ts` | +getAvailableModels(), +resolveModel(), import cache |
| `src/lib/services/task-executor.ts` | +import litellm, +resolveModel() antes de callLLM |
| `src/lib/services/catbot-tools.ts` | +2 tools (search_documentation, read_error_history), +2 executeTool cases |
| `src/app/api/catbot/chat/route.ts` | System prompt ampliado: base de conocimiento + troubleshooting + protocolo diagnostico |
| `src/components/catbot/catbot-panel.tsx` | +import AlertCircle/error-formatter, +useEffect catbot:error, +badge rojo, +hasUnreadError state |
| `src/app/layout.tsx` | +dynamic import ErrorInterceptorProvider |

---

## Metricas

- **Requisitos:** 15 (ERR-01..06, DOC-01..04, DIAG-01..03, BUG-38-01, MDL-01)
- **Archivos nuevos:** 6
- **Archivos modificados:** 6
- **Build:** OK (npm run build sin errores)

---

## Decisiones tecnicas

| Decision | Razon |
|----------|-------|
| Fetch monkey-patch en vez de wrapper | Captura todos los fetch sin modificar cada componente |
| XMLHttpRequest para POST error-history | Evita loop recursivo con el interceptor de fetch |
| Busqueda de texto en vez de RAG vectorial | Suficiente para ~15 archivos .md, sin dependencias externas |
| Error history en tabla settings | Reutiliza key-value store existente, no requiere nueva tabla |
| Cache de modelos 60s | Balance entre frescura y rendimiento |
| ErrorInterceptorProvider como dynamic import | Mantiene layout.tsx como Server Component |
| Troubleshooting como seccion estatica en system prompt | No cambia dinamicamente, evita complejidad |
