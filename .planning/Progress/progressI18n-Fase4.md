# i18n Fase 4 — CatBot

**Fecha:** 2026-03-20
**Estado:** Completado, build limpio

## Inventario de strings por categoría

### Categoría A — UI strings (catbot-panel.tsx): 20 strings
- `title="Abrir CatBot"` → `t('ui.openCatBot')`
- Greeting con rich text: `t.rich('ui.greeting', { strong })`
- Context greeting con interpolación: `t.rich('ui.greetingContext', { page, highlight })`
- `"Modo sudo activo"` → `t('ui.sudoModeActive')`
- `"Pensando..."` → `t('ui.thinking')`
- `"Ejecutando {tool}..."` → `t('ui.executing', { tool })`
- 5 title attributes: deactivateSudo, activateSudo, clearHistory, minimize, close
- `"Autenticacion Sudo"` → `t('ui.sudoAuth')`
- `"Clave secreta..."` → `t('ui.secretKeyPlaceholder')`
- 2 placeholders: placeholder, placeholderSudo
- `"Accion protegida..."` → `t('ui.protectedAction')`
- `"Introducir clave"` → `t('ui.enterKey')`
- `"... [truncado en UI]"` → `t('ui.truncated')`
- Tool labels (5): terminal, service, file, credential, mcp → `t('tools.X')`

### Categoría B — Sugerencias por página: 8 rutas, 21 strings
- dashboard (3), catbrains (3), agents (3), tasks (3), connectors (3), settings (3), workers (2), skills (2)
- Almacenadas como arrays en JSON, accedidas via `t.raw('suggestions.key')`
- Lógica de routing preservada exactamente via `SUGGESTION_ROUTES` + `useMemo`

### Categoría C — System prompt (NO traducido)
- `buildSystemPrompt()` en chat/route.ts — 164 líneas de instrucciones para el LLM
- Se mantiene en español original como instrucción para el modelo, no es UI visible

### Categoría D — Mensajes hardcodeados: 6 strings
- `'Sin respuesta'` → `t('ui.noResponse')`
- `'Error de conexion. Verifica...'` → `t('ui.connectionError')`
- `'Modo sudo activado...'` → `t('ui.sudoActivated')`
- `'Clave incorrecta'` (fallback) → `t('ui.wrongKey')`
- `'Error de conexion'` (catch) → `t('ui.connectionErrorShort')`
- `'🐱 ¡Ups! Algo ha fallado...'` (server catch-all) → `getTranslations('catbot.ui')` server-side

## Claves JSON añadidas

### Namespace `catbot.ui` (26 claves)
openCatBot, greeting, greetingContext, sudoModeActive, thinking, executing,
deactivateSudo, activateSudo, clearHistory, minimize, close, sudoAuth,
secretKeyPlaceholder, placeholderSudo, placeholder, protectedAction, enterKey,
truncated, noResponse, connectionError, sudoActivated, wrongKey,
connectionErrorShort, serverError

### Namespace `catbot.tools` (5 claves)
terminal, service, file, credential, mcp

### Namespace `catbot.suggestions` (8 arrays)
dashboard, catbrains, agents, tasks, connectors, settings, workers, skills

## Cambios por archivo

### catbot-panel.tsx
- Import `useTranslations` de next-intl, `useMemo` de react
- Hook: `const t = useTranslations('catbot')`
- `PAGE_SUGGESTIONS` dict eliminado → `SUGGESTION_ROUTES` array constante + `useMemo` con `t.raw()`
- `getSuggestions()` función eliminada → lógica inline en useMemo
- `getToolStyle()` retorna `labelKey` en vez de `label` hardcodeado
- Greeting usa `t.rich()` para preservar `<strong>` y `<span>` con estilos
- Todos los `title=`, `placeholder=`, mensajes de estado migrados a `t()`

### chat/route.ts
- Import `getTranslations` de `next-intl/server`
- Catch-all error: usa `getTranslations('catbot.ui')` para obtener `serverError` en el idioma del usuario
- System prompt (`buildSystemPrompt`): NO modificado — es instrucción para el LLM

### Archivos NO modificados
- catbot-tools.ts — tool descriptions son para el LLM, no UI
- catbot-sudo-tools.ts — tool descriptions son para el LLM, no UI
- error-history/route.ts — mensajes de error internos del servidor
- search-docs/route.ts — sin strings visibles
- sudo/route.ts — mensajes de error del sistema sudo (separado del CatBot UI)
- use-sse-stream.ts — hook genérico sin strings

## Decisiones de implementación

1. **System prompt NO traducido**: Es instrucción para el LLM, no texto visible para el usuario
2. **Tool descriptions NO traducidas**: Son parte del schema de herramientas para el LLM
3. **Sugerencias como arrays en JSON**: Usando `t.raw()` de next-intl para obtener arrays directamente
4. **Rich text para greeting**: `t.rich()` con tags `<strong>` y `<highlight>` para preservar estilos inline
5. **getToolStyle labelKey**: Retorna clave de traducción en vez de string, resuelto en render con `t()`
6. **Server-side translations**: `getTranslations` de next-intl/server en el catch-all del API route
7. **Sudo API errors**: No traducidos aquí — vienen del endpoint sudo y se muestran raw en el panel

## Build
```
npm run build — OK, 0 errores
Middleware: 26.6 kB
Todas las rutas compiladas correctamente
```
