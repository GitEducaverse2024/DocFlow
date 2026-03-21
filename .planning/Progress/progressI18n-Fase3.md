# i18n Fase 3 — Layout Global

**Fecha:** 2026-03-20
**Estado:** Completado, build limpio

## Claves JSON añadidas

### Namespace `nav` (nuevas)
- `catbrains`: "CatBrains" / "CatBrains"
- `catpaw`: "CatPaw" / "CatPaw"
- `notifications`: "Notificaciones" / "Notifications"

### Namespace `layout` (nuevo completo)
- `version`: "v1.0"
- `openMenu` / `closeMenu`: labels de aria para hamburger mobile
- `servicesCount`: "{connected}/{total} servicios/services" (interpolacion next-intl)
- `serviceStatus.connected/checking/disconnected/error`: estados de servicio traducidos
- `breadcrumb.*`: 12 claves de ruta (catbrains, projects, agents, workers, skills, tasks, canvas, connectors, notifications, testing, settings, system)

**Claves preexistentes preservadas:** Todas (common, nav originales, welcome)

## Cambios por componente

### sidebar.tsx
- Import `useTranslations` de next-intl
- Dos hooks: `useTranslations('nav')` para labels de navegacion, `useTranslations('layout')` para version/servicios/aria
- `navItems` movido dentro del componente, usa `labelKey` en vez de `label` hardcodeado
- Tooltips de servicios usan `tLayout('serviceStatus.X')` con helper `statusKey()`
- Texto servicios usa interpolacion: `tLayout('servicesCount', { connected, total: 4 })`
- Aria-labels de botones mobile/close traducidos
- Version "v1.0" desde JSON
- Toggle ES/EN sin cambios (funciona igual)

### footer.tsx
- Import `useTranslations` de next-intl
- Version "v1.0" reemplazada por `t('version')`
- Nombres de servicio (OpenClaw, n8n, etc.) se mantienen como nombres propios sin traduccion

### breadcrumb.tsx
- Import `useTranslations` de next-intl
- `ROUTE_LABELS` estatico reemplazado por mapa dinamico construido con `t()` en cada render
- `ROUTE_KEYS` array constante fuera del componente para evitar recreacion
- Fallback a `decodeURIComponent(seg)` para segmentos sin clave (IDs, slugs)

### page-header.tsx
- Sin cambios. Recibe title/description como props desde paginas padre
- Listo para recibir props traducidas en fases posteriores de i18n

## Decisiones de implementacion

1. **Dos hooks en sidebar**: `useTranslations('nav')` + `useTranslations('layout')` en vez de un solo `useTranslations()` generico, para mantener namespaces claros
2. **Nombres de servicio sin traducir**: OpenClaw, n8n, Qdrant, LiteLLM, LinkedIn MCP, SearXNG son nombres propios — no se traducen
3. **statusKey() helper**: Convierte el status string del health check a una clave valida del JSON, con fallback a 'disconnected'
4. **ROUTE_KEYS como const array**: Definido fuera del componente para referencia estable, iterado dentro para construir el mapa con t()

## Build
```
npm run build — OK, 0 errores
Middleware: 26.6 kB
/welcome: 1.85 kB
Todas las rutas compiladas correctamente
```
