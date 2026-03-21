# i18n Fase 6 — Agentes + Workers + Skills

**Fecha:** 2026-03-20
**Estado:** COMPLETADA
**Build:** OK (clean)

## Alcance

Migración i18n de las secciones Agentes, Workers y Skills usando `next-intl` con `useTranslations()`.

## Archivos Modificados

### JSON de traducciones
| Archivo | Namespaces añadidos |
|---|---|
| `app/messages/es.json` | `agents`, `workers`, `skills`, `errorBoundary` |
| `app/messages/en.json` | `agents`, `workers`, `skills`, `errorBoundary` |

### Sección Agentes (8 archivos)
| Archivo | Descripción |
|---|---|
| `app/src/app/agents/page.tsx` | Lista con filtros de modo, búsqueda, departamentos |
| `app/src/app/agents/new/page.tsx` | Wizard 4 pasos (Identidad/Personalidad/Skills/Conexiones) |
| `app/src/app/agents/[id]/page.tsx` | Detalle con 5 tabs (Identidad/Conexiones/Skills/Chat/OpenClaw) |
| `app/src/app/agents/error.tsx` | Error boundary |
| `app/src/components/agents/catpaw-card.tsx` | Tarjeta de agente con tooltips y badges |
| `app/src/components/agents/agent-creator.tsx` | Creator 3 modos (Manual/From Skill/AI Generate) |
| `app/src/components/agents/agent-list-selector.tsx` | Selector radio con badge "Custom" y opción "No agent" |

### Sección Workers (2 archivos)
| Archivo | Descripción |
|---|---|
| `app/src/app/workers/page.tsx` | Aviso de migración a CatPaws processor |
| `app/src/app/workers/error.tsx` | Error boundary |

### Sección Skills (2 archivos)
| Archivo | Descripción |
|---|---|
| `app/src/app/skills/page.tsx` | CRUD completo: grid, filtros, sheet form, delete dialog, OpenClaw import |
| `app/src/app/skills/error.tsx` | Error boundary |

## Claves i18n por namespace

| Namespace | Claves aprox. | Cobertura |
|---|---|---|
| `agents` | ~120+ | Modos, tonos, wizard steps, detail tabs, creator, selector |
| `workers` | 6 | Título, migración, botones |
| `skills` | ~60+ | CRUD, categorías (6), sources (4), sheet, delete, OpenClaw, toasts |
| `errorBoundary` | 6 | Título, sección, retry, home, CatBot message |

## Patrones aplicados

- **Valores DB preservados**: `tone`, `mode`, `category` se almacenan como strings originales; display via `t('tones.${key}')`, `t('modes.${key}')`, `t('categories.${key}')`
- **ICU interpolation**: `{count}`, `{name}`, `{value}`, `{countdown}`, `{section}`, `{message}`
- **t.raw()**: Para arrays JSON (step labels del wizard)
- **Error boundaries unificados**: Mismo namespace `errorBoundary` con `{section}` interpolation
- **Categorías y sources**: Mapped desde keys DB a labels traducidos

## Criterios de aceptación

- [x] Build limpio (`npm run build`)
- [x] 3 secciones completamente en inglés con locale EN
- [x] Badge states traducidos (modos, categorías, sources)
- [x] CRUD form labels/placeholders traducidos
- [x] Empty states traducidos
- [x] Sin strings hardcodeados visibles
- [x] Reutilización de `common.*` donde aplica
