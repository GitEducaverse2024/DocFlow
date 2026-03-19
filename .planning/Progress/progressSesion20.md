# Sesion 20 — v13.0 Phase 51 Execution + Bugfixes + RAG Append Feature

**Fecha:** 2026-03-18
**Milestone:** v13.0 Conector Gmail (continuacion) + mejoras independientes
**Estado:** COMPLETADO

---

## Resumen

Sesion mixta: se completo la ejecucion de Phase 51 (OAuth2 + Wizard + CatBot + Tests), se corrigieron dos bugs (CORS en endpoints legacy, build error), se reparo LiteLLM caido por YAML malformado, y se implemento la feature de append incremental de fuentes al RAG existente.

---

## 1. Phase 51 Execution (v13.0 completado)

Se ejecutaron los 5 planes restantes del milestone v13.0 en 3 waves:

### Wave 1 (paralelo)
- **51-01: OAuth2 API Routes** — auth-url + exchange-code endpoints, fix de OAuth2 transporter en EmailService (Nodemailer maneja refresh nativamente)
- **51-02: CatBot Email Tools** — `send_email` + `list_email_connectors` tools, system prompt con seccion email

### Wave 2
- **51-03: Gmail Wizard UI** — Componente gmail-wizard.tsx (~930 lineas), 4 pasos, badge esmeralda, integracion en /conectores

### Wave 3 (paralelo)
- **51-04: E2E + API Tests** — gmail.spec.ts (514 lineas), gmail.api.spec.ts (207 lineas), gmail-wizard.pom.ts (205 lineas)
- **51-05: Documentacion** — CONNECTORS.md seccion Gmail, progressSesion19.md

**Verificacion:** 25/25 must-haves passed. Milestone v13.0 marcado completo.

---

## 2. Bug Fix: CORS en /api/agents y /api/workers

**Problema:** Los endpoints de backward compatibility usaban `NextResponse.redirect()` a `/api/cat-paws`. El browser seguia el redirect hacia `http://0.0.0.0:3000` (IP interna Docker), generando error CORS al diferir del origen externo `http://192.168.1.49:3500`.

**Solucion:** Reemplazados los redirects por proxy interno — cada handler importa y ejecuta directamente la logica de `/api/cat-paws`.

**Archivos modificados:**
| Archivo | Cambio |
|---------|--------|
| `app/src/app/api/agents/route.ts` | Proxy a cat-paws GET/POST |
| `app/src/app/api/agents/[id]/route.ts` | Proxy a cat-paws GET/PATCH/DELETE |
| `app/src/app/api/workers/route.ts` | Proxy a cat-paws GET (inyecta mode=processor) / POST |
| `app/src/app/api/workers/[id]/route.ts` | Proxy a cat-paws GET/PATCH/DELETE |

**Verificacion:** `curl /api/agents` devuelve JSON directo (HTTP 200), sin redirect.

---

## 3. Bug Fix: LiteLLM caido

**Problema:** Contenedor `antigravity-gateway` (LiteLLM) en estado "Restarting" — crash loop por error YAML.

**Causa raiz:** Indentacion incorrecta en `/home/deskmath/open-antigravity-workspace/config/routing.yaml` linea 17-21. La entrada `gemini-search` tenia `litellm_params` sin indentar (a nivel raiz en vez de dentro del item de lista).

**Solucion:** Corregida indentacion, restart del contenedor. HTTP 200 en `/health`.

---

## 4. Feature: Append incremental de fuentes al RAG

**Contexto:** El usuario tiene CatBrains con RAG activo (160+ fuentes indexadas). Quiere añadir mas fuentes sin reindexar todo desde cero.

### Implementacion

**A) DB Migration**
- Nueva columna `sources.is_pending_append INTEGER DEFAULT 0`
- Tipo TypeScript `Source` actualizado con `is_pending_append: number`

**B) API Endpoint** — `POST /api/catbrains/[id]/rag/append` (alias: `/append-rag`)
- Recibe `{ sourceIds: string[] }`
- Valida que RAG esta activo y la coleccion existe en Qdrant
- Re-extrae contenido de fuentes tipo file sin content_text (fallback automatico)
- Chunking local (smartChunkText ~512 chars, overlap 50), embedding via Ollama batch (16/batch)
- Point IDs deterministas: `sha256("${sourceId}_chunk_${index}")` → UUID (idempotente en re-append)
- Upsert incremental a Qdrant (sin recrear coleccion, sub-batches de 64)
- Marca `is_pending_append = 0` post-exito
- Registra en `processing_runs` con `output_format='append'`
- Payload incluye `append: true` para distinguir vectores añadidos incrementalmente
- Retorna `{ ok: true, vectors_added, sources_processed, collection }`

**C) Sources API actualizada**
- POST create: cuando `catbrain.rag_enabled = 1`, nuevas fuentes se crean con `is_pending_append = 1`
- GET list: ordenacion `is_pending_append DESC, order_index ASC` (pendientes primero)

**D) UI — SourceManager**
- Nuevo prop `ragEnabled` pasado desde catbrain page
- Tracking de `pendingAppendCount` via fetch
- Banner violet inferior: "X fuentes nuevas listas para indexar" + boton gradient "Procesar y añadir al RAG"
- `handleAppendToRag()`: fetch pending IDs → POST append → toast exito/error → refresh

**E) UI — SourceList**
- Badge pulsante violet `NUEVA ✦` para fuentes con `is_pending_append = 1` (cuando RAG activo)
- Badge verde `Nueva` existente se mantiene para fuentes post-procesamiento (sin RAG)

### Archivos creados/modificados

| Archivo | Cambio |
|---------|--------|
| `app/src/lib/db.ts` | Migration: columna is_pending_append |
| `app/src/lib/types.ts` | Campo is_pending_append en Source |
| `app/src/app/api/catbrains/[id]/rag/append/route.ts` | **NUEVO** — endpoint append incremental con re-extraccion, IDs deterministas, processing_runs |
| `app/src/app/api/catbrains/[id]/append-rag/route.ts` | **NUEVO** — alias que re-exporta /rag/append |
| `app/src/app/api/catbrains/[id]/sources/route.ts` | POST con is_pending_append, GET con orden |
| `app/src/components/sources/source-manager.tsx` | Banner append + handler + prop ragEnabled |
| `app/src/components/sources/source-list.tsx` | Badge NUEVA ✦ pulsante + prop ragEnabled |
| `app/src/components/sources/file-upload-zone.tsx` | Texto informativo cuando RAG activo |
| `app/src/app/catbrains/[id]/page.tsx` | Pasa ragEnabled a SourceManager |

---

## 5. Diagnostico de errores reportados

### Error 409 "Duplicate file" en /sources
**Diagnostico:** Funcionamiento correcto. El endpoint POST de fuentes detecta duplicados por hash SHA-256 del archivo. Si se sube el mismo archivo dos veces, retorna 409 con `isDuplicate: true`. El frontend ya maneja esto con un `confirm()` y opcion `force=true`.

### Error "signal is aborted without reason" en /process (Status 0)
**Diagnostico:** Error del lado cliente — el navegador cancelo la peticion HTTP antes de que el servidor respondiera. Causas tipicas: navegacion fuera de la pagina, cierre de pestaña, o timeout del browser. Los logs del servidor estan limpios (sin errores). No requiere fix en backend.

### Validacion E2E del append-rag
- `POST /rag/append` con 2 fuentes reales → 123 vectores añadidos, `{ ok: true }`
- `POST /append-rag` (alias) con 1 fuente → 36 vectores, `{ ok: true }`
- `processing_runs` registra entradas con `output_format='append'` y conteo de vectores
- Coleccion Qdrant existente no se borra, solo upsert incremental

---

## 6. Build error fix

**Problema:** `Mail` import no usado en `connectors/page.tsx` causaba fallo de build en Docker.

**Solucion:** Ya estaba corregido en working tree (eliminado por executor de Phase 50), solo faltaba que Docker lo recogiera en el rebuild.

---

## Deploy

Docker rebuild completo (`--no-cache`), deploy exitoso. App respondiendo HTTP 200.

---

## Estado del proyecto

| Milestone | Estado |
|-----------|--------|
| v13.0 Conector Gmail | COMPLETADO — 2 fases, 8 planes, ~35 requisitos |
| Append RAG | Feature independiente desplegada |
| CORS fix | Bug corregido y desplegado |
| LiteLLM | Reparado, operativo |
