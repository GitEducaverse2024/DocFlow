# Phase 127: Knowledge Admin Dashboard - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Sección "Conocimiento de CatBot" en Settings con 3 tabs: Learned Entries, Knowledge Gaps, Knowledge Tree. Permite al admin visualizar y gestionar el sistema de conocimiento de CatBot (datos ya existentes de Phases 124+126). Solo lectura y curación — edición visual del knowledge tree es FUTURE-01.

</domain>

<decisions>
## Implementation Decisions

### Tab layout y navegación
- Posición: después de CatBotSettings, antes de CatBotSecurity
- Componente dedicado en archivo propio (settings page ya tiene ~1300 líneas)
- Import como `<CatBotKnowledge />` en settings/page.tsx

### Claude's Discretion: Tab style
- Claude elige entre tabs horizontales (shadcn Tabs), accordion, u otro approach
- Considerar consistencia con el resto de Settings

### Learned Entries workflow
- Tabla con acciones inline: columnas contenido, área, fecha, botones validar/rechazar por fila
- Sin sudo — Settings es admin-only, validar/rechazar es operación de curaduría normal
- Métricas calculadas en backend con SQL aggregates (patrón getCatbotStats)

### Claude's Discretion: Learned Entries detalles
- Bulk actions (checkboxes) vs solo individual — Claude decide según complejidad
- Rechazar: delete directo con undo toast vs diálogo confirmación — Claude decide
- Organización staging vs validadas (sub-secciones vs filtro toggle) — Claude decide

### Knowledge Tree visual
- Indicador de completitud: Claude decide entre porcentaje (campos poblados) o semáforo

### Claude's Discretion: Knowledge Tree
- Layout (grid cards vs tabla) — Claude decide lo más visual e informativo
- Solo lectura vs click para detalle — Claude decide el alcance apropiado
- Mostrar: nombre área, conteos (tools, concepts, howto), updated_at, completitud

### API routes
- Métricas en backend con SQL aggregates
- Sin protección sudo para escrituras (validar, rechazar, resolver)

### Claude's Discretion: API routes
- Organización de rutas (por recurso vs consolidada) — Claude decide el patrón más consistente

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `catbot-db.ts`: CRUD para `knowledge_learned` (save, get, validate, delete, incrementAccess) y `knowledge_gaps` (save, get, resolve) + getCatbotStats()
- `knowledge-tree.ts`: `getAllKnowledgeAreas()`, `loadKnowledgeArea(id)` con KnowledgeEntry type (tools, concepts, howto, dont, common_errors, sources arrays)
- shadcn/ui: Card, Button, Badge, Input, Checkbox, Dialog, Textarea ya importados en settings
- Lucide icons ya en uso (Cat, Shield, Settings, etc.)

### Established Patterns
- Settings page: secciones como funciones React (`ProcessingSettings`, `CatBotSettings`, etc.) con `<section className="mb-10">`
- Fetch pattern: useEffect GET + handler PATCH, toast para feedback
- i18n: `useTranslations('settings')` con namespace por sección
- DB queries: catbot-db.ts exporta funciones tipadas, API routes las importan directamente

### Integration Points
- `settings/page.tsx` línea ~1322: insertar `<CatBotKnowledge />` después de `<CatBotSettings />`
- API routes en `app/api/catbot/knowledge/` (nuevo directorio)
- Traducciones en archivos i18n existentes bajo namespace `settings.knowledge`

</code_context>

<specifics>
## Specific Ideas

- El usuario quiere que este dashboard le dé visibilidad sobre qué aprende CatBot y qué no sabe resolver
- El propósito principal es curación: validar lo que CatBot aprende bien, rechazar lo que no, y ver qué huecos tiene
- El sistema de aprendizaje (Phase 124) y gap logging (Phase 126) ya funcionan internamente — este dashboard los hace visibles

</specifics>

<deferred>
## Deferred Ideas

- Knowledge tree editable desde UI — FUTURE-01 (v27+)
- Auto-validación de learned entries sin intervención admin — FUTURE-02

</deferred>

---

*Phase: 127-knowledge-admin-dashboard*
*Context gathered: 2026-04-09*
