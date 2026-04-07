# Mejoras del Sistema de Modelos — Próxima Sesión

> Análisis post-implementación de Phases 107-112 (Milestone v25.0: Model Intelligence Orchestration)
> Fecha: 2026-04-07
> Contexto: Bugs descubiertos durante UAT de Phase 112 y pruebas con CatBot como oráculo

---

## Bugs Descubiertos en Esta Sesión

### 1. Telegram Bot: Ghost Polling (409 Conflict)
- **Síntoma:** Bot no responde; logs muestran `Conflict: terminated by other getUpdates request`
- **Causa:** Al reiniciar contenedor, la sesión anterior de long-poll queda viva en Telegram ~30s
- **Fix aplicado:** `deleteWebhook` antes de iniciar poll loop (`telegram-bot.ts`)
- **Estado:** Commiteado (`35d6ded`), pendiente de deploy Docker

### 2. Alias Routing: Fallback a modelo inexistente en LiteLLM
- **Síntoma:** CatBot por Telegram falla con `Invalid model name: openai/gpt-4o`
- **Causa encadenada:**
  1. `catbot → gemini-main` (configurado)
  2. Discovery tiene `litellm/gemini-main` pero check busca `gemini-main` exacto → no lo encuentra
  3. Fallback same-tier Pro → `openai/gpt-4o` (existe en MID y Discovery)
  4. LiteLLM rechaza `gpt-4o` (solo tiene `gpt-5.4`)
- **Fix aplicado:** Availability check ahora busca también `litellm/{model_key}` (`alias-routing.ts`)
- **Estado:** Commiteado (`35d6ded`), pendiente de deploy Docker

### 3. Discovery→MID Sync no se dispara al refrescar
- **Síntoma:** `gemma4:e4b` aparece en Discovery pero no tiene ficha MID
- **Causa:** El botón "Refrescar" solo llamaba a `/api/discovery/refresh`, no a `/api/mid/sync`
- **Fix aplicado:** `discovery-inventory-panel.tsx` ahora llama a ambos endpoints
- **Estado:** Commiteado (`7c905d5`), pendiente de deploy Docker

---

## Problemas Sistémicos Detectados

### A. "Probar Conexión" de CatBot no detecta errores reales

**Problema:** El test de conexión en Settings valida que las API keys funcionan y que los proveedores responden, pero NO verifica:
- Si los modelos configurados en alias routing existen realmente en LiteLLM
- Si el modelo al que resolverá CatBot está disponible (puede pasar el test pero fallar en chat)
- Si los fallbacks funcionan correctamente

**Mejora propuesta:** Un health check integral que:
1. Para cada alias configurado, ejecute `resolveAlias()` y verifique que el modelo resultante existe en LiteLLM `/v1/models`
2. Haga una llamada `chat/completions` de prueba con 1 token al modelo resuelto
3. Muestre resultado por alias: ✅ directo / ⚠️ fallback / ❌ fallo

### B. Dos rutas de resolución de modelos compitiendo

**Problema:** Existen dos sistemas independientes:
- `alias-routing.ts: resolveAlias()` — usado por CatBot chat (5 pasos con fallback)
- `litellm.ts: resolveModel()` — NO usado por nadie en producción

**Mejora propuesta:** Eliminar `litellm.resolveModel()` o unificar ambas rutas en un solo servicio.

### C. MID seeds desactualizados vs. realidad de LiteLLM

**Problema:** El MID tiene seeds para `openai/gpt-4o` y `openai/gpt-4o-mini` pero LiteLLM solo tiene `gpt-5.4` y `gpt-5.4-pro`. Los seeds solo se aplican en tabla vacía — la DB en producción tiene entradas viejas que nunca se actualizan.

**Mejora propuesta:**
- Mecanismo de deprecación automática: si un modelo lleva X días sin aparecer en Discovery, marcarlo como `deprecated` en MID
- O: sync bidireccional MID↔Discovery con detección de modelos retirados

### D. Sin indicador de disponibilidad en la UI

**Problema:** La tabla de Routing de Aliases muestra tier y modelo pero NO si el modelo está realmente accesible. El usuario puede seleccionar un modelo "muerto" sin saberlo.

**Mejora propuesta:**
- Badge de estado junto a cada modelo en el dropdown: 🟢 disponible / 🟡 vía fallback / 🔴 no disponible
- Al cambiar alias, verificar disponibilidad antes de confirmar

---

## Mejoras de Vista (Simplificación UI)

### E. Sección Modelos demasiado densa

**Estado actual:** 3 paneles (Discovery, MID Cards, Routing) todos visibles a la vez. Discovery muestra TODOS los modelos de TODOS los proveedores (~140 modelos) como badges.

**Propuestas:**
1. **Tabs en vez de scroll:** Separar en tabs "Inventario" / "Fichas MID" / "Routing"
2. **Filtro de Discovery:** Mostrar solo modelos "relevantes" (los que tienen ficha MID o están en algún alias). Toggle para ver todos.
3. **Vista compacta de routing:** Mostrar como tabla simple con indicador de salud, sin separador visual para cada fila
4. **Agrupar MID cards por estado:** Primero los activos+usados en algún alias, luego los activos sin uso, finalmente los auto-creados sin clasificar

### F. Dashboard de Salud de Modelos (nueva vista)

**Propuesta:** Una vista tipo "semáforo" que muestre de un vistazo:

```
┌─────────────────────────────────────────────────────┐
│  Salud del Sistema de Modelos                       │
├─────────────────────────────────────────────────────┤
│  Proveedores:  🟢 Ollama  🟢 LiteLLM  🟢 Anthropic │
│                🟢 Google  🟡 OpenAI (latencia alta) │
├─────────────────────────────────────────────────────┤
│  Aliases:                                           │
│  🟢 catbot        → gemini-main (directo)           │
│  🟢 chat-rag      → claude-sonnet-4 (directo)       │
│  🟡 gen-content   → gpt-5.4 (fallback desde gpt-4o)│
│  🟢 embed         → text-embedding-3-small          │
│  🟢 canvas-agent  → gemini-main (directo)           │
├─────────────────────────────────────────────────────┤
│  Último check: hace 2 min  [🔄 Verificar ahora]    │
└─────────────────────────────────────────────────────┘
```

---

## CatBot como Oráculo: Gaps de Tools

### G. CatBot no puede verificar su propia salud

**Problema:** CatBot tiene `get_model_landscape` y `recommend_model_for_task` pero NO tiene una tool para verificar si un modelo está realmente accesible vía LiteLLM.

**Propuesta:** Nuevo tool `check_model_health`:
```
check_model_health(model_key?: string, alias?: string)
→ Verifica conectividad real (1-token test)
→ Devuelve: status, latency_ms, fallback_used, error
```

Así CatBot puede hacer self-diagnosis: "Voy a verificar si mis modelos funcionan..." → llama a `check_model_health` → reporta resultados.

### H. CatBot no conoce el estado de Telegram

**Problema:** Si Telegram falla, no hay forma de que CatBot lo sepa ni informe al usuario desde la web.

**Propuesta:** Tool `get_telegram_status` que devuelva:
- Estado del poll loop (running/paused/error)
- Último error
- Mensajes procesados hoy
- Latencia del último ciclo

---

## Prioridades Sugeridas para Próxima Sesión

| # | Mejora | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | Deploy Docker (3 fixes pendientes) | 🔴 Crítico | Bajo (rebuild) |
| 2 | Health check integral por alias (A) | 🔴 Alto | Medio (API + UI) |
| 3 | Badge de disponibilidad en routing dropdown (D) | 🟠 Alto | Bajo (UI) |
| 4 | Dashboard semáforo de salud (F) | 🟠 Alto | Medio (nueva vista) |
| 5 | Tool `check_model_health` para CatBot (G) | 🟠 Medio | Bajo (1 tool) |
| 6 | Deprecar modelos MID ausentes (C) | 🟡 Medio | Bajo (cron) |
| 7 | Simplificar vista Modelos con tabs (E) | 🟡 Medio | Medio (refactor UI) |
| 8 | Eliminar `litellm.resolveModel()` muerto (B) | 🟡 Bajo | Bajo (borrar) |
| 9 | Tool `get_telegram_status` (H) | 🟡 Bajo | Bajo (1 tool) |

---

## Deployment Pendiente

```bash
# Aplicar los 3 fixes commiteados (35d6ded, 7c905d5, commits Phase 111-112)
cd ~/docflow
docker compose build --no-cache
docker compose up -d
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/
docker restart docflow-app
```

**Verificar después:**
1. Telegram: enviar mensaje al bot → debe responder sin error 409
2. Settings > Modelos > Refrescar → gemma4:e4b debe aparecer con ficha MID auto-creada
3. CatBot: "¿qué modelos tengo?" → gemma4:e4b debe aparecer en la lista

---

*Generado durante UAT de Phase 112 — Milestone v25.0*
