# i18n Fase 8 — Conectores + Settings + System + Testing

**Fecha:** 2026-03-20
**Estado:** COMPLETADA
**Build:** OK (clean)

## Alcance

Migración i18n de las 4 secciones restantes de la aplicación: Conectores, Settings, System y Testing. Última fase de migración de páginas del milestone i18n.

## Archivos Modificados

### JSON de traducciones
| Archivo | Namespaces extendidos |
|---|---|
| `app/messages/es.json` | `connectors` (~200+ keys), `settings` (~120+ keys), `system` (~80+ keys), `testing` (~50+ keys) |
| `app/messages/en.json` | `connectors` (~200+ keys), `settings` (~120+ keys), `system` (~80+ keys), `testing` (~50+ keys) |

### Sección Conectores (3 archivos)
| Archivo | Descripción |
|---|---|
| `app/src/app/connectors/page.tsx` | Lista con tipos, plantillas, CRUD sheet, logs dialog, test badges |
| `app/src/app/connectors/error.tsx` | Error boundary (migrado a namespace `errorBoundary`) |
| `app/src/components/connectors/gmail-wizard.tsx` | Wizard 4 pasos (Cuenta/Credenciales/Test/Listo), OAuth2, help modal |

### Sección Settings (2 archivos)
| Archivo | Descripción |
|---|---|
| `app/src/app/settings/page.tsx` | 6 sub-componentes: ProviderCard, ProcessingSettings, ModelPricingSettings, CatBotSecurity, CatBotSettings, SettingsPage |
| `app/src/app/settings/error.tsx` | Error boundary (migrado a namespace `errorBoundary`) |

### Sección System (4 archivos)
| Archivo | Descripción |
|---|---|
| `app/src/components/system/system-health-panel.tsx` | Panel principal con 4 servicios + LinkedIn MCP + SearXNG + Core |
| `app/src/components/system/service-card.tsx` | Tarjeta por servicio con estado, latencia, detalles específicos |
| `app/src/components/system/diagnostic-sheet.tsx` | Sheet de diagnóstico con pasos y comandos |
| `app/src/components/system/diagnostic-content.ts` | Datos estáticos reestructurados (solo codes, texto a JSON) |

### Sección Testing (8 archivos)
| Archivo | Descripción |
|---|---|
| `app/src/app/testing/page.tsx` | Página principal con tabs (Resultados/Historial/Logs) |
| `app/src/components/testing/test-summary-bar.tsx` | Barra resumen (Total/Pasaron/Fallaron/Omitidos) |
| `app/src/components/testing/test-section-list.tsx` | Lista de secciones con resultados expandibles |
| `app/src/components/testing/test-run-history.tsx` | Historial con tiempos relativos y estados |
| `app/src/components/testing/test-ai-generator.tsx` | Dialog generador de tests con IA |
| `app/src/components/testing/log-filters.tsx` | Filtros de logs (nivel, fuente, búsqueda) |
| `app/src/components/testing/log-viewer.tsx` | Visor de logs con metadata expandible |
| `app/src/components/testing/test-result-detail.tsx` | Detalle de error con screenshot y código |

## Claves i18n por namespace

| Namespace | Claves aprox. | Cobertura |
|---|---|---|
| `connectors` | ~200+ | tipos (5), campos de formulario, plantillas (3), subtypes, lista/tabla, test badges, sheet CRUD, logs dialog, toasts, Gmail wizard completo (4 pasos + help modal + OAuth2) |
| `settings` | ~120+ | API keys (badges, toasts, provider card), procesamiento (3 settings), costes modelos (tabla), CatBot security (sudo, acciones protegidas), CatBot asistente (personalidad, acciones), embeddings, conexiones, preferencias |
| `system` | ~80+ | estados de servicio, tarjetas (4 servicios), LinkedIn MCP, SearXNG, DoCatFlow Core, diagnóstico (sheet + contenido para 5 servicios) |
| `testing` | ~50+ | tabs, resumen, secciones, historial (tiempos relativos, estados), generador IA, filtros de logs, visor, detalle de errores |
| `errorBoundary` | reutilizado | connectors/error.tsx y settings/error.tsx migrados al patrón unificado |

## Patrones aplicados

- **TYPE_CONFIG restructurado**: `label`/`description` removidos, resueltos via `t('types.${type}.label')`
- **TypeField.labelKey**: Campos de formulario usan key para resolver label via `t('fields.${field.labelKey}')`
- **SUGGESTED_TEMPLATES**: `nameKey` en lugar de `name`/`description` hardcodeados
- **diagnostic-content.ts**: Reestructurado a solo `{ name, codes[] }`, texto servido desde JSON
- **Funciones helper con t**: `formatRelativeTime(dateStr, t)`, `getStatusConfig(status, t)` reciben `t` como parámetro (tipo: `ReturnType<typeof useTranslations>`)
- **labelKey pattern**: tabs, stats, protectedActions, catbot actions resuelven labels en render time
- **t.raw()**: Para arrays JSON (gmail steps, help steps/warnings, diagnostic steps)
- **ICU interpolation**: `{count}`, `{name}`, `{label}`, `{type}`, `{file}`
- **ICU plural**: `{count, plural, one {# configurado} other {# configurados}}`
- **Variable shadowing**: `.filter(t =>` → `.filter(tk =>)` en test-section-list.tsx
- **Error boundaries unificados**: Patrón `errorBoundary` namespace con `{section}` interpolation
- **Locale removal**: `'es-ES'` removido de `toLocaleString()` calls

## Strings deliberadamente NO traducidos

| Categoría | Ejemplos | Razón |
|---|---|---|
| Nombres de servicios | OpenClaw, n8n, Qdrant, LiteLLM, SearXNG, LinkedIn MCP | Nombres propios de productos |
| Nombres de modelos LLM | gpt-4o, claude-sonnet-4-6, gemini-2.5-pro | Identificadores técnicos |
| Nombres de providers | OpenAI, Anthropic, Google, Ollama | Marcas comerciales |
| Términos técnicos | OAuth2, SMTP, App Password, Client ID, MCP, Webhook, TLS | Estándares técnicos universales |
| Comandos bash | systemctl, docker ps, curl, ss | Comandos del sistema |
| Log sources | Processing, Chat, RAG, CatBot, Tasks, Canvas, etc. | Identificadores de sistema |
| Niveles de log | info, warn, error | Estándares universales |

## Criterios de aceptación

- [x] Build limpio (`npm run build`)
- [x] Sección Conectores completamente i18n (lista + wizard Gmail 4 pasos + help modal)
- [x] Sección Settings completamente i18n (6 sub-componentes)
- [x] Sección System completamente i18n (4 servicios + diagnóstico)
- [x] Sección Testing completamente i18n (resultados + historial + logs + generador IA)
- [x] Error boundaries migrados al patrón `errorBoundary` unificado
- [x] Nombres propios técnicos NO traducidos
- [x] Sin strings hardcodeados visibles en los archivos objetivo
- [x] ~17 archivos migrados en total
- [x] ~450+ claves i18n añadidas
