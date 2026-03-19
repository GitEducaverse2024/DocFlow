# Sesion 17 — Correcciones Post-v9.0 + Feature Extraccion con IA

**Fecha:** 2026-03-15
**Milestone:** v9.0 CatBrains — Correcciones y mejoras post-migracion
**Estado:** COMPLETADO

---

## Resumen

Sesion de estabilizacion post-migracion v9.0 con 3 bugs criticos corregidos, 1 feature nueva (extraccion con IA), y 1 mejora de flujo (modo pass-through). Todos los problemas tenian origen en la migracion de `projects` a `catbrains` o en un desajuste de formato SSE que existia desde antes pero no se habia detectado.

---

## BUG-01: Foreign Key rota en tabla `sources` y `processing_runs`

**Sintoma:** Error 500 al subir archivos a cualquier CatBrain. Log: `"no such table: main.projects"` o `"FOREIGN KEY constraint failed"`.

**Causa raiz:** La migracion de Phase 39 (`CREATE TABLE catbrains AS SELECT * FROM projects; DROP TABLE projects`) renombro la tabla y actualizo el codigo, pero **no recreo las FK constraints** de las tablas dependientes. SQLite no permite ALTER FOREIGN KEY — hay que recrear la tabla.

Las FK de `sources` y `processing_runs` seguian apuntando a `projects(id)`:
```sql
-- Antes (roto)
project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
-- Despues (corregido)
project_id TEXT NOT NULL REFERENCES catbrains(id) ON DELETE CASCADE
```

**Correccion:** Script de migracion en vivo (CREATE new → INSERT INTO new SELECT * FROM old → DROP old → RENAME new):
```sql
PRAGMA foreign_keys = OFF;
CREATE TABLE sources_new (...REFERENCES catbrains(id)...);
INSERT INTO sources_new SELECT * FROM sources;
DROP TABLE sources;
ALTER TABLE sources_new RENAME TO sources;
-- idem para processing_runs
PRAGMA foreign_keys = ON;
```

**Tip para futuro:** Cuando se renombra una tabla en SQLite, SIEMPRE verificar todas las tablas que tienen FK apuntando a ella. Usar `PRAGMA foreign_key_list(tabla)` para listar FK de cada tabla dependiente. El codigo fuente en `db.ts` ya estaba correcto (apuntaba a catbrains), pero la DB en disco conservaba la FK vieja del primer CREATE.

---

## BUG-02: SSE token format mismatch (Chat, Process, CatBot)

**Sintoma:** El chat del CatBrain se quedaba "pensando" infinitamente sin mostrar respuesta. El streaming de procesamiento tampoco mostraba contenido en tiempo real.

**Causa raiz:** Desajuste entre lo que el servidor envia y lo que el cliente espera en eventos SSE tipo `token`:

| Componente | Servidor enviaba | Cliente esperaba |
|------------|-----------------|-----------------|
| Chat route | `{ content: token }` | `{ token: token }` |
| Process route | `{ content: token }` | `{ token: token }` |
| CatBot route | `{ content: token }` | `{ token: token }` |

El cliente (`use-sse-stream.ts` linea 115) hace `data.token || ''`, pero el servidor enviaba `data.content`. El token llegaba como cadena vacia.

**Correccion:** Cambiar `send('token', { content: token })` → `send('token', { token })` en las 3 rutas:
- `app/src/app/api/catbrains/[id]/chat/route.ts`
- `app/src/app/api/catbrains/[id]/process/route.ts`
- `app/src/app/api/catbot/chat/route.ts`

**Tip para futuro:** Definir un contrato tipado para eventos SSE. Crear un tipo compartido:
```typescript
// src/lib/types/sse-events.ts
type SSETokenEvent = { token: string };
type SSEStageEvent = { stage: string; message: string };
type SSEDoneEvent = { version?: number; usage?: object };
type SSEErrorEvent = { message: string };
```
Usar este tipo tanto en el servidor (al hacer `send`) como en el cliente (al hacer `data.token`). Asi TypeScript detectaria el mismatch en compilacion. **Buscar `send('token'` en todo el codebase** si se crea una nueva ruta SSE para verificar que use el formato correcto.

---

## BUG-03: "Controller is already closed" en SSE streams

**Sintoma:** Error `Invalid state: Controller is already closed` al procesar documentos grandes. El procesamiento fallaba silenciosamente.

**Causa raiz:** `createSSEStream()` en `stream-utils.ts` no protegia contra escritura a un `ReadableStreamDefaultController` ya cerrado. Si el cliente se desconectaba o ocurria un error despues de `close()`, la siguiente llamada a `send()` intentaba `controller.enqueue()` sobre un controller cerrado.

**Correccion:** Anadir flag `closed` y try-catch en `send`/`close`:
```typescript
let closed = false;
const send = (event, data) => {
  if (closed) return;
  try { controller.enqueue(...); } catch { closed = true; }
};
const close = () => {
  if (closed) return;
  closed = true;
  try { controller.close(); } catch {}
};
```

**Tip para futuro:** Toda funcion que use `createSSEStream` debe asumir que `send()` puede ser no-op si el cliente se desconecto. Nunca lanzar errores criticos desde dentro del handler que dependan de que el stream siga abierto. Tambien considerar anadir `cancel()` callback al `ReadableStream` para detectar desconexiones del cliente.

---

## Feature: Extraccion de documentos con IA

**Problema:** Los archivos DOCX, PDFs escaneados, e imagenes mostraban "Extraccion limitada" porque `pdftotext` solo extrae texto plano y no hay parser DOCX. El contenido binario/imagenes se perdia.

**Solucion:** Nuevo endpoint y UI para enviar archivos a un modelo multimodal (Gemini, Claude, GPT-4o) que los lea y transcriba.

### API
- **Ruta:** `POST /api/catbrains/[id]/sources/[sid]/ai-extract`
- **Body:** `{ model: string }`
- **Proceso:** Lee archivo → base64 → envia a LiteLLM como `image_url` con data URI → guarda texto extraido → limpia `extraction_log`
- **Formatos soportados:** PDF, DOCX, PPTX, XLSX, PNG, JPG, GIF, WEBP, BMP, TIFF
- **Limite:** 20MB por archivo
- **Respuesta:** `{ source, ai_extraction: { model, extracted_length, input_tokens, output_tokens, total_tokens } }`

### UI
- Boton sparkle (violeta) visible en `source-item.tsx` cuando:
  - Es archivo de tipo soportado AND
  - Tiene `extraction_log` o contenido < 100 chars
- Al pulsar: panel desplegable con selector de modelo + aviso de coste
- Spinner animado durante extraccion
- Toast con resultado: caracteres extraidos + tokens consumidos

### Archivos
| Archivo | Cambio |
|---------|--------|
| `src/app/api/catbrains/[id]/sources/[sid]/ai-extract/route.ts` | Nuevo: endpoint de extraccion IA |
| `src/components/sources/source-item.tsx` | Boton sparkle + panel de extraccion + selector de modelo |
| `src/components/sources/source-list.tsx` | Handler `handleAiExtract` + fetch de modelos disponibles |

**Tip para futuro:** El formato `image_url` con data URI funciona via LiteLLM para imagenes y PDFs. Para DOCX/PPTX, depende de que el modelo subyacente los soporte (Gemini si, Claude si, GPT-4o solo imagenes). Si un proveedor no soporta el formato, LiteLLM devolvera error — considerar en el futuro convertir DOCX a PDF como paso previo para compatibilidad universal.

---

## Mejora: Modo pass-through en procesamiento

**Problema:** Al procesar sin instrucciones ni skills, el sistema enviaba todo el contenido al LLM con un prompt "analiza y estructura". Esto causaba:
1. Truncamiento de documentos grandes (limite 50K tokens)
2. Coste innecesario de tokens
3. Timeouts en volumenes altos

**Solucion:** Nuevo modo "pass-through" que detecta automaticamente cuando no hay instrucciones, skills, ni worker. En este caso:
- **No llama al LLM** = 0 tokens, 0 coste
- **No trunca** = sin limite de volumen
- Concatena todas las fuentes como texto plano con separadores markdown
- Progreso via SSE: `"Transcribiendo fuente X/N: nombre"`
- Ideal para ingesta masiva y creacion de RAG a partir de texto plano

**Logica de decision:**
```
isPassThrough = !instructions && selectedSkills.length === 0 && !worker
```

**Aplicado en ambas rutas:** streaming (`useLocalProcessing && useStream`) y no-streaming (`startLocalProcessing`).

**Tip para futuro:** Si el usuario quiere que el LLM procese pero tiene mucho volumen, considerar implementar procesamiento por lotes: dividir las fuentes en grupos de N tokens, procesar cada grupo por separado, y concatenar los resultados. Esto evitaria truncamiento manteniendo el analisis IA.

---

## Advertencia docker-compose.yml

**Sintoma:** Warning `the attribute 'version' is obsolete` al ejecutar docker compose.

**Solucion pendiente:** Eliminar la linea `version: '3.x'` del `docker-compose.yml`. No afecta funcionalidad pero genera ruido en logs.

---

## Checklist de verificacion post-migracion

Para futuras migraciones de tablas en SQLite, seguir esta lista:

1. **FK de tablas dependientes:** `PRAGMA foreign_key_list(tabla)` en TODAS las tablas
2. **Formato SSE:** Buscar `send('token'` en el codebase — verificar que el payload coincida con lo que `use-sse-stream.ts` espera
3. **Paths en disco:** Verificar que las rutas de archivos (`/app/data/projects/` vs `/app/data/catbrains/`) sean consistentes
4. **Redirects 301:** Comprobar que las rutas antiguas redirigen correctamente
5. **Registro dual:** Verificar que Canvas y Tareas acepten tanto el tipo viejo como el nuevo
6. **Test de streaming:** Probar chat, proceso, y catbot con streaming activado

---

## Archivos modificados en esta sesion

| Archivo | Cambio |
|---------|--------|
| `src/lib/services/stream-utils.ts` | Guard contra controller cerrado en `createSSEStream` |
| `src/app/api/catbrains/[id]/chat/route.ts` | Fix token format: `{ content }` → `{ token }` |
| `src/app/api/catbrains/[id]/process/route.ts` | Fix token format + modo pass-through |
| `src/app/api/catbot/chat/route.ts` | Fix token format: `{ content }` → `{ token }` |
| `src/app/api/catbrains/[id]/sources/[sid]/ai-extract/route.ts` | Nuevo: endpoint extraccion IA |
| `src/components/sources/source-item.tsx` | Boton sparkle + panel extraccion IA |
| `src/components/sources/source-list.tsx` | Handler AI extract + fetch modelos |

**DB en vivo (no en codigo):** Recreadas FK de `sources` y `processing_runs` para apuntar a `catbrains(id)`.
