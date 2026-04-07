# Phase 115: Tab Proveedores - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Gestionar API keys y endpoints de proveedores desde cards colapsables dentro del tab "Proveedores" del Centro de Modelos. Eliminar la sección duplicada de API Keys en la página principal de Settings. No incluye gestión de modelos individuales (Phase 116) ni enrutamiento (Phase 117).

</domain>

<decisions>
## Implementation Decisions

### Cards colapsadas
- Cards colapsadas por defecto: emoji proveedor + nombre + semáforo (verde/rojo) + conteo de modelos
- Comportamiento acordeón: solo una card expandida a la vez (al abrir una se cierra la anterior)
- Transición suave CSS (~200ms) al expandir/colapsar
- Orden fijo: OpenAI, Anthropic, Google, LiteLLM, Ollama (mismo orden que PROVIDER_META actual y query SQL)

### Edición inline
- Guardado con botón explícito (no auto-save)
- Al guardar una API key nueva, auto-ejecutar test de conectividad (Save → Test → Semáforo actualizado)
- Confirmación antes de eliminar una API key (inline confirm o dialog)

### Claude's Discretion
- Health API vs test endpoint: Claude decide cómo combinar Health API (semáforo automático, cacheado 30s) con el test endpoint manual para la mejor UX
- Resultado del botón Probar: Claude decide qué mostrar (status + modelos, solo conteo, etc.) según espacio en card
- Auto-refresh vs carga inicial: Claude decide si polling o solo fetch al montar + test manual
- Diseño de la card expandida: Claude decide qué partes del ProviderCard actual conservar/simplificar para el nuevo layout colapsable
- Migración: Claude decide approach más limpio para eliminar sección antigua (directo vs conservador)
- Ubicación de PROVIDER_META: Claude decide si moverlo a archivo compartido o al componente nuevo
- Limpieza adicional en page.tsx: Claude evalúa qué es seguro limpiar sin pisar fases futuras (ej: ModelPricingSettings se toca en Phase 116)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProviderCard` en `app/src/app/settings/page.tsx:39` (~230 líneas): componente completo con save key, edit endpoint, test, delete, show/hide key. Marcado con eslint-disable para reuso en Phase 115
- `PROVIDER_META` en `settings/page.tsx:30`: metadata de 5 proveedores (emoji, name, description, models, needsKey)
- `ProviderHealth` interface en `tab-resumen.tsx:13`: status, latency_ms, model_count, error
- `semaphoreColor()` en `tab-resumen.tsx:49`: mapea status a colores Tailwind (emerald/amber/red)
- `relativeTime()` en `tab-resumen.tsx:39`: formatea "hace X min"
- `Card`, `Badge`, `Button`, `Input` de shadcn/ui

### Established Patterns
- Dark theme: bg-zinc-900, border-zinc-800, text-zinc-50, accent violet-500
- Data fetching: useState + useEffect + fetch (no SWR/React Query)
- Toasts: sonner para success/error
- i18n: next-intl con useTranslations('settings.modelCenter')
- Index-based tabs en ModelCenterShell (proveedores = index 1)

### Integration Points
- `ModelCenterShell` importa `TabProveedoresPlaceholder` → reemplazar por nuevo `TabProveedores`
- API routes existentes: GET `/api/settings/api-keys`, PATCH/DELETE `/api/settings/api-keys/[provider]`, POST `.../test`
- Health API: GET `/api/models/health` → ProviderHealth[] con status por proveedor
- Settings page.tsx: eliminar sección "API Keys" (~líneas con ProviderCard render loop)

</code_context>

<specifics>
## Specific Ideas

- El requirement pide "sin scroll infinito" — las cards colapsadas resuelven esto al mantener una vista compacta
- STATE.md nota: "Kept ProviderCard and ModelPricingSettings in page.tsx with eslint-disable for Phase 115 reuse" — la intención fue facilitar esta migración
- PROV-04 y MODELOS-06 (Phase 116) ambos limpian secciones de Settings — coordinar para no pisar

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 115-tab-proveedores*
*Context gathered: 2026-04-07*
