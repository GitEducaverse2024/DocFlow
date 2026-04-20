> **📦 LEGACY — NO migrated to KB.** Este archivo es el post-mortem del milestone v25.1 (cerrado).
> Será movido a `.docflow-legacy/milestone-retrospectives/` en Phase 155 (cleanup final).
> NO editar. NO consumir desde CatBot. Consultar sólo como referencia histórica.

---
# Paquete de Mejoras: Sistema de Modelos v25.1

> Post-mortem de Milestone v25.0 (Model Intelligence Orchestration)
> Fecha: 2026-04-07
> Objetivo: Simplificar, unificar y hacer robusto todo lo relacionado con modelos en Settings

---

## 1. Diagnóstico: Estado Actual

### Lo que hay hoy en Settings (orden de scroll)

| Sección | Qué muestra | Altura aprox. | Problema |
|---------|-------------|---------------|----------|
| API Keys | 5 cards de proveedor (key, endpoint, test) | ~3500px | Cada card ocupa mucho; test no se conecta con routing |
| Processing | maxTokens, truncate, metadata | ~350px | OK, pero desconectado del contexto de modelos |
| **Modelos** (MID) | Discovery (~140 badges) + MID cards (~17 tarjetas) + Routing table (8 filas) | ~3000px | Demasiado denso, sin indicador de salud, Discovery muestra TODO |
| Costes de Modelos | Tabla editable model/provider/precio | ~600px | Duplica info de cost_notes que ya está en MID |
| Embeddings | Placeholder "Coming Soon" | ~200px | No hace nada |
| CatBot | Modelo, personalidad, acciones | ~450px | Modelo de CatBot se configura aquí PERO se enruta vía alias |

**Total scroll para gestión de modelos: ~8000px+ (sin contar Telegram y Sudo)**

### Problemas de UX identificados

1. **Información fragmentada:** El usuario ve la misma info de modelos en 5 sitios distintos (API Keys muestra modelos disponibles, Discovery los lista, MID los clasifica, Routing los asigna, Costes los pricing)
2. **Sin semáforo de salud:** Puedes configurar un alias apuntando a un modelo muerto sin saberlo
3. **Discovery es ruido:** 140 badges de modelos que nunca vas a usar — solo ~15-20 son relevantes
4. **Costes duplicados:** `cost_notes` en MID + tabla de precios separada = dos fuentes de verdad
5. **Embeddings fantasma:** Placeholder vacío que ocupa espacio sin dar valor
6. **No hay flujo guiado:** El usuario novato no sabe por dónde empezar (¿keys primero? ¿routing? ¿MID?)

---

## 2. Propuesta de Rediseño: "Centro de Modelos"

### Concepto: Una sola sección con tabs

Reemplazar las 5 secciones dispersas por **una sola sección "Centro de Modelos"** con navegación por tabs:

```
┌──────────────────────────────────────────────────────────────┐
│  ⚙ Centro de Modelos                                        │
│  Gestiona proveedores, modelos y enrutamiento                │
│                                                              │
│  ┌─────────┬────────────┬──────────┬────────────┐           │
│  │ Resumen │ Proveedores│ Modelos  │ Enrutamiento│           │
│  └─────────┴────────────┴──────────┴────────────┘           │
└──────────────────────────────────────────────────────────────┘
```

### Tab 1: Resumen (Dashboard de Salud)

Vista semáforo — el usuario ve de un vistazo si todo funciona.

```
┌──────────────────────────────────────────────────────────┐
│  Salud del Sistema                    [🔄 Verificar]     │
│                                                          │
│  Proveedores                                             │
│  ┌──────────┬──────────┬───────────┬─────────┬────────┐ │
│  │🟢 Ollama │🟢 LiteLLM│🟢 Anthropic│🟢 Google│🔴 OpenAI│ │
│  │  4 mod.  │  11 mod. │  8 mod.   │ 28 mod. │ sin key │ │
│  └──────────┴──────────┴───────────┴─────────┴────────┘ │
│                                                          │
│  Enrutamiento                                            │
│  ┌────────────────┬─────────────────────┬──────────────┐ │
│  │ catbot         │ gemini-main         │ 🟢 directo   │ │
│  │ chat-rag       │ claude-sonnet-4     │ 🟢 directo   │ │
│  │ generate       │ gpt-5.4            │ 🟡 fallback  │ │
│  │ embed          │ text-embed-3-small  │ 🟢 directo   │ │
│  │ canvas-agent   │ gemini-main         │ 🟢 directo   │ │
│  │ agent-task     │ gemini-main         │ 🟢 directo   │ │
│  └────────────────┴─────────────────────┴──────────────┘ │
│                                                          │
│  Último check: hace 2 min                                │
└──────────────────────────────────────────────────────────┘
```

**Datos:** Viene de un nuevo endpoint `/api/models/health` que:
1. Ejecuta `resolveAlias()` para cada alias
2. Verifica que el modelo resuelto existe en LiteLLM `/v1/models`
3. Devuelve status por proveedor + status por alias (directo/fallback/error)

**Acción principal:** Botón "Verificar" refresca todo (Discovery + MID sync + health check)

### Tab 2: Proveedores (API Keys simplificadas)

Fusión de API Keys actual — misma funcionalidad, menos espacio.

```
┌──────────────────────────────────────────────────────────┐
│  Proveedores Conectados                                  │
│                                                          │
│  ┌─ Anthropic ─────────────────────────────── 🟢 ──────┐│
│  │  API Key: ****_abc  │ Endpoint: default              ││
│  │  Modelos: claude-opus-4, claude-sonnet-4 (+6 más)    ││
│  │  [Editar Key] [Probar] [Eliminar]                    ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─ Google ────────────────────────────────── 🟢 ──────┐│
│  │  API Key: ****_xyz  │ Endpoint: default              ││
│  │  Modelos: gemini-2.5-pro, gemini-2.5-flash (+26)    ││
│  │  [Editar Key] [Probar] [Eliminar]                    ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─ Ollama (local) ──────────────────────── 🟢 ──────┐ │
│  │  Endpoint: http://ollama:11434                      │ │
│  │  Modelos: gemma4:e4b, gemma4:31b, qwen3:32b (+5)   │ │
│  │  [Editar Endpoint] [Probar]                         │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ LiteLLM (gateway) ──────────────────── 🟢 ──────┐  │
│  │  Endpoint: http://localhost:4000                    │  │
│  │  Modelos: gemini-main, gemini-search (+9)           │  │
│  │  [Editar Endpoint] [Probar]                         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ OpenAI ──────────────────────────────── 🔴 ──────┐  │
│  │  Sin API key configurada                            │  │
│  │  [Configurar]                                       │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Cambios vs actual:**
- Cards colapsadas por defecto (solo nombre + status + modelos resumidos)
- Expandir al hacer clic en "Editar Key" — inline, no ocupa pantalla completa
- El test de conexión ya NO muestra lista completa de modelos (eso es el tab Resumen)
- Eliminar sección de API Keys separada de la página principal

### Tab 3: Modelos (MID unificado con costes)

Fusión de MID Cards + Costes de Modelos + Embeddings en una sola vista.

```
┌──────────────────────────────────────────────────────────┐
│  Modelos Clasificados                   [Filtro ▾]       │
│                                                          │
│  Mostrando: 17 activos │ 3 sin clasificar                │
│  Filtro: [Todos ▾] [Solo en uso ▾] [Por tier ▾]         │
│                                                          │
│  ── Elite (3) ──────────────────────────────────────     │
│                                                          │
│  ┌─────────────────────┬─────────────────────┬────────┐ │
│  │ Claude Opus 4       │ Claude Sonnet 4     │Gemini  │ │
│  │ 🟢 Elite            │ 🟢 Elite            │2.5 Pro │ │
│  │ anthropic            │ anthropic            │🟢 Elite│ │
│  │ $15/$75 por 1M      │ $3/$15 por 1M       │$0.15/  │ │
│  │ reasoning ████████░░│ reasoning ███████░░░ │$0.60   │ │
│  │ 📌 catbot(fallback) │ 📌 chat-rag          │        │ │
│  │ [Editar]            │ [Editar]             │[Editar]│ │
│  └─────────────────────┴─────────────────────┴────────┘ │
│                                                          │
│  ── Pro (4) ────────────────────────────────────────     │
│  ...                                                     │
│                                                          │
│  ── Libre (9) ──────────────────────────────────────     │
│  ...                                                     │
│                                                          │
│  ── Sin clasificar (3) ─────────────────────────────     │
│  │ Auto-detectados por Discovery, pendientes de          │
│  │ clasificación manual.                                 │
│  │ [Clasificar todos]                                    │
│  └──────────────────────────────────────────────────     │
└──────────────────────────────────────────────────────────┘
```

**Cambios vs actual:**
- **Eliminar sección "Costes de Modelos"** — pricing se edita dentro de la ficha MID (campo cost_notes ya existe)
- **Eliminar sección "Embeddings"** — los modelos de embedding son MID entries con capability `embedding`
- **Añadir indicador "📌 en uso"** — muestra qué aliases usan este modelo
- **Añadir filtro "Solo en uso"** — oculta modelos que no están asignados a ningún alias
- **Barra de scores mini** — resumen visual tipo progress bar en la card (sin abrir dialog)
- **Sección "Sin clasificar"** — agrupa auto_created sin tier, con acción bulk

### Tab 4: Enrutamiento (Routing simplificado)

```
┌──────────────────────────────────────────────────────────┐
│  Enrutamiento de Aliases                                 │
│                                                          │
│  Qué modelo usa cada tipo de tarea                       │
│                                                          │
│  ┌──────────────┬──────────────────┬──────┬───────────┐ │
│  │ Alias        │ Modelo           │Estado│ Tier      │ │
│  ├──────────────┼──────────────────┼──────┼───────────┤ │
│  │ catbot       │ [gemini-main ▾]  │  🟢  │ Pro       │ │
│  │ chat-rag     │ [claude-sonnet ▾]│  🟢  │ Elite     │ │
│  │ generate     │ [gpt-5.4     ▾]  │  🟡  │ Pro       │ │
│  │ embed        │ [embed-3-sm  ▾]  │  🟢  │ —         │ │
│  │ canvas-agent │ [gemini-main ▾]  │  🟢  │ Pro       │ │
│  │ canvas-fmt   │ [gemini-main ▾]  │  🟢  │ Pro       │ │
│  │ agent-task   │ [gemini-main ▾]  │  🟢  │ Pro       │ │
│  │ process-docs │ [gemini-main ▾]  │  🟢  │ Pro       │ │
│  └──────────────┴──────────────────┴──────┴───────────┘ │
│                                                          │
│  Dropdown muestra solo modelos disponibles (🟢).         │
│  Modelos no disponibles aparecen en gris con ⚠.          │
└──────────────────────────────────────────────────────────┘
```

**Cambios vs actual:**
- Tabla compacta en vez de cards separadas por fila
- Columna **Estado** con semáforo (nuevo endpoint `/api/models/health`)
- Dropdown filtra modelos no disponibles (gris + warning)
- Eliminar cost_notes de esta vista (ya está en Tab 3)

---

## 3. Secciones a Eliminar / Fusionar

| Sección actual | Acción | Justificación |
|---------------|--------|---------------|
| API Keys (sección independiente) | → Mover a Tab "Proveedores" | Misma info, menos scroll |
| Discovery Inventory (140 badges) | → Integrar en Tab "Resumen" como conteo por proveedor | Los badges individuales son ruido |
| Costes de Modelos (tabla separada) | → Eliminar, usar `cost_notes` de MID | Dos fuentes de verdad es peor que una |
| Embeddings (placeholder) | → Eliminar sección, embedding = modelo MID con capability `embedding` | Placeholder sin valor |
| Processing Settings | → Mantener fuera de "Centro de Modelos" | Es config de procesamiento, no de modelos |
| CatBot > campo Modelo | → Eliminar campo, CatBot usa alias `catbot` via routing | Evita confusión "¿dónde cambio el modelo de CatBot?" |

**Resultado:** De 6 secciones dispersas (~8000px scroll) a **1 sección con 4 tabs** (~800-1200px visibles).

---

## 4. Backend Necesario

### Nuevo endpoint: `/api/models/health` (GET)

```typescript
// Response shape
{
  providers: [
    { name: "ollama", status: "connected", latency_ms: 45, model_count: 8 },
    { name: "litellm", status: "connected", latency_ms: 12, model_count: 11 },
    { name: "openai", status: "disconnected", error: "No API key" },
    ...
  ],
  aliases: [
    { alias: "catbot", configured: "gemini-main", resolved: "gemini-main", 
      status: "direct", latency_ms: 120 },
    { alias: "generate-content", configured: "openai/gpt-4o", resolved: "gpt-5.4",
      status: "fallback", fallback_reason: "same_tier_fallback:Pro" },
    ...
  ],
  checked_at: "2026-04-07T10:30:00Z"
}
```

### Nuevo tool CatBot: `check_model_health`

```typescript
check_model_health(model_key?: string, alias?: string)
// Verifica conectividad real (1-token test)
// Devuelve: status, latency_ms, fallback_used, error
```

### Limpieza de código

- Eliminar `litellm.ts: resolveModel()` (código muerto, compite con alias-routing)
- Eliminar sección ModelPricingSettings del page.tsx
- Eliminar placeholder de Embeddings

---

## 5. Bugs Pendientes de Deploy

| Bug | Fix | Commit | Estado |
|-----|-----|--------|--------|
| Telegram ghost polling 409 | `deleteWebhook` al iniciar | `35d6ded` | Pendiente deploy |
| Alias routing no reconoce `litellm/` prefix | Check con prefijo `litellm/{key}` | `35d6ded` | Pendiente deploy |
| Discovery refresh no sincroniza MID | Llamar a `/api/mid/sync` tras refresh | `7c905d5` | Pendiente deploy |

```bash
cd ~/docflow
docker compose build --no-cache && docker compose up -d
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/
docker restart docflow-app
```

---

## 6. Plan de Ejecución (Phases sugeridas)

### Phase 113: Centro de Modelos — Backend + Health API
**Goal:** Un solo endpoint `/api/models/health` que verifique proveedores + aliases con resolución real
**Scope:** API route, refactor alias-routing con health probe, tool CatBot `check_model_health`, eliminar código muerto (`litellm.resolveModel`)
**Esfuerzo:** Medio (1 sesión)

### Phase 114: Centro de Modelos — Rediseño UI
**Goal:** Reemplazar las 6 secciones dispersas por una sola con 4 tabs (Resumen, Proveedores, Modelos, Enrutamiento)
**Scope:** Nuevo componente `ModelCenterSection` con tabs, migrar API Keys dentro, eliminar secciones redundantes (Costes, Embeddings placeholder, Discovery badges), filtros en MID grid
**Esfuerzo:** Alto (1-2 sesiones)
**Depends on:** Phase 113 (health API necesaria para Tab Resumen y semáforos en Tab Enrutamiento)

### Phase 115: Pulido + CatBot Oráculo
**Goal:** CatBot puede verificar su propia infraestructura y el sistema se auto-diagnostica
**Scope:** Tool `get_telegram_status`, auto-deprecación MID (cron), auto-refresh periódico del health check, badges "en uso" en MID cards
**Esfuerzo:** Bajo-Medio (1 sesión)

---

## 7. Resumen Visual del Cambio

```
ANTES (v25.0):                          DESPUÉS (v25.1):
─────────────────                       ─────────────────
├─ API Keys (3500px)                    ├─ Centro de Modelos
├─ Processing (350px)                   │  ├─ Tab: Resumen (semáforo)
├─ Modelos                              │  ├─ Tab: Proveedores (keys)
│  ├─ Discovery (600px, 140 badges)     │  ├─ Tab: Modelos (MID+costes)
│  ├─ MID Cards (2000px, 17 cards)      │  └─ Tab: Enrutamiento (routing)
│  └─ Routing (800px)                   ├─ Processing (sin cambios)
├─ Costes (600px)                       ├─ CatBot (sin campo modelo)
├─ Embeddings (200px, vacío)            ├─ CatBot Seguridad
├─ CatBot (450px)                       └─ Telegram
├─ CatBot Seguridad (900px)
└─ Telegram (1200px)

Scroll modelos: ~8000px                 Scroll modelos: ~1000px (tab visible)
Secciones modelo: 6                     Secciones modelo: 1 (4 tabs)
Indicadores salud: 0                    Indicadores salud: por proveedor + alias
```

---

*Paquete generado 2026-04-07 — Milestone v25.1: Centro de Modelos*
