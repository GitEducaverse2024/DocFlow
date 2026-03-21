# i18n Fase 7 — Tareas + Canvas

**Fecha:** 2026-03-20
**Estado:** COMPLETADA
**Build:** OK (clean)

## Alcance

Migracion i18n de las secciones Tareas y Canvas usando `next-intl` con `useTranslations()`.

## Archivos Modificados

### JSON de traducciones
| Archivo | Namespaces extendidos |
|---|---|
| `app/messages/es.json` | `tasks` (~100+ keys), `canvas` (~150+ keys) |
| `app/messages/en.json` | `tasks` (~100+ keys), `canvas` (~150+ keys) |

### Seccion Tareas (4 archivos)
| Archivo | Descripcion |
|---|---|
| `app/src/app/tasks/page.tsx` | Lista con filtros, tarjetas, delete, templates |
| `app/src/app/tasks/new/page.tsx` | Wizard 4 pasos (Objetivo/CatBrains/Pipeline/Revisar), SortableStepCard, AddStepButton |
| `app/src/app/tasks/[id]/page.tsx` | Detalle con pipeline, checkpoint UI, output dialog, progress bar |
| `app/src/app/tasks/error.tsx` | Error boundary (migrado a namespace `errorBoundary`) |

### Seccion Canvas (12 archivos)
| Archivo | Descripcion |
|---|---|
| `app/src/app/canvas/page.tsx` | Lista con filtros, empty states, templates |
| `app/src/app/canvas/error.tsx` | Error boundary (migrado a namespace `errorBoundary`) |
| `app/src/components/canvas/canvas-toolbar.tsx` | Barra: save status, undo/redo, execute/cancel, auto-layout |
| `app/src/components/canvas/canvas-card.tsx` | Tarjeta con mode badge, node count, timeAgo |
| `app/src/components/canvas/canvas-wizard.tsx` | Wizard 2 pasos (modo + detalles), 4 mode cards |
| `app/src/components/canvas/canvas-editor.tsx` | Editor principal: getDefaultNodeData, checkpoint dialog |
| `app/src/components/canvas/node-palette.tsx` | Paleta de 8 tipos de nodo con tooltips |
| `app/src/components/canvas/node-config-panel.tsx` | Panel de config por tipo (~60+ labels/placeholders) |
| `app/src/components/canvas/execution-result.tsx` | Resultado de ejecucion: stats, acciones, status |
| `app/src/components/canvas/nodes/start-node.tsx` | Nodo Inicio |
| `app/src/components/canvas/nodes/agent-node.tsx` | Nodo Agente |
| `app/src/components/canvas/nodes/catbrain-node.tsx` | Nodo CatBrain (RAG status, conectores) |
| `app/src/components/canvas/nodes/connector-node.tsx` | Nodo Conector |
| `app/src/components/canvas/nodes/checkpoint-node.tsx` | Nodo Checkpoint (aprobacion) |
| `app/src/components/canvas/nodes/merge-node.tsx` | Nodo Merge (entradas dinamicas) |
| `app/src/components/canvas/nodes/condition-node.tsx` | Nodo Condicion (Si/No) |
| `app/src/components/canvas/nodes/output-node.tsx` | Nodo Salida (formato, resultado) |

## Claves i18n por namespace

| Namespace | Claves aprox. | Cobertura |
|---|---|---|
| `tasks` | ~100+ | status, stepStatus, stepTypes, timeAgo, filters, list, templates, detail (pipeline, checkpoint, output, progress), wizard (4 steps), toasts |
| `canvas` | ~150+ | modes, filters, list, templates, wizard (2 steps, 4 modes), toolbar, nodes (8 tipos), nodeDefaults (8 tipos), nodeConfig (8 formularios), palette (8 + tooltips), checkpoint dialog, execution (stats, actions), toasts |
| `errorBoundary` | reutilizado | tasks/error.tsx y canvas/error.tsx migrados al patron unificado de Fase 6 |

## Patrones aplicados

- **STATUS_CONFIG -> STATUS_CLASSES**: Labels removidos de constantes, display via `t('status.${key}')` / `t('stepStatus.${key}')`
- **Variable shadowing**: `.filter(t =>` renombrado a `.filter(tk =>`, `.map(t =>` a `.map(s =>` para evitar conflicto con funcion `t()`
- **t.raw()**: Para arrays JSON (wizard step labels)
- **ICU interpolation**: `{count}`, `{name}`, `{index}`, `{max}`, `{completed}`, `{total}`, `{elapsed}`, `{time}`, `{status}`, `{section}`, `{message}`
- **ICU plural**: `{count, plural, one {paso} other {pasos}}` en step4.pipeline
- **Prop drilling t**: `SortableStepCard` y `AddStepButton` reciben `t` como prop ya que no pueden llamar hooks directamente
- **getDefaultNodeData(t)**: Funcion movida para recibir `t` como parametro
- **Error boundaries unificados**: Mismo namespace `errorBoundary` con `{section}` interpolation (patron de Fase 6)
- **MODE_CARDS restructurado**: Labels movidos a keys traducibles, resueltos en render time

## Criterios de aceptacion

- [x] Build limpio (`npm run build`)
- [x] Seccion Tareas completamente i18n (lista + wizard 4 pasos + detalle + error)
- [x] Seccion Canvas completamente i18n (lista + wizard + editor + toolbar + 8 nodos + config panel + palette + execution)
- [x] Status badges traducidos (task status, step status, canvas modes)
- [x] CRUD form labels/placeholders traducidos
- [x] Empty states traducidos
- [x] Sin strings hardcodeados visibles en ES
- [x] Reutilizacion de `errorBoundary.*` donde aplica
- [x] ~16 archivos migrados en total
