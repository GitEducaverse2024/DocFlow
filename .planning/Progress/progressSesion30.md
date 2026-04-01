# Sesion 30 — Sistema Comercial Completo: Gmail, Holded, Canvas, RAG, UI

**Fecha:** 2026-03-31 / 2026-04-01
**Estado:** COMPLETADO

---

## Resumen

Sesion de implementacion del sistema comercial completo de Educa360. Incluye: ampliacion de conectores Gmail y Holded, creacion de 4 canvas comerciales, correccion de multiples bugs criticos en el motor de canvas, mejora del chunking RAG, y rediseno del panel de configuracion de nodos Agent en Canvas.

---

## Bloque 1 — Skills y CatPaws adicionales

### 2 Skills nuevas (ventas)
- **Buscador de Emails Corporativos** — estrategia de 4 capas para encontrar emails B2B
- **Deduplicacion de Leads** — comparacion en 3 niveles contra listas de referencia

### 6 CatPaws nuevos
- **Clasificador Inbound** (business, processor) — clasifica emails entrantes en 7 categorias
- **Respondedor Inbound** (business, processor) — redacta respuestas con RAG Educa360
- **Derivador Inbound** (business, processor) — redirige a responsable segun reglas Educa360
- **Interprete de Operaciones** (direction, processor) — procesa canal de mando //negocio:educa360
- **Consultor CRM** (business, processor) — ejecuta queries contra Holded MCP
- **Experto de Negocio Educa360** (direction, processor) — genera informes ejecutivos diarios

### 2 CatPaws utilitarios para Canvas
- **Ejecutor Gmail** (production, processor) — CatPaw con conector Gmail vinculado para canvas
- **Operador Drive** (production, processor) — CatPaw con conector Drive vinculado para canvas

**Total CatPaws plataforma:** 30

---

## Bloque 2 — Ampliacion Gmail (8 tools por conector)

### 3 tools nuevas
- `gmail_mark_as_read` — marcar email como leido (IMAP + Gmail API)
- `gmail_reply_to_message` — responder en el mismo hilo con headers In-Reply-To/References
- `gmail_send_email` ampliado — ahora soporta CC y HTML body

### Archivos modificados
- `app/src/lib/types.ts` — EmailPayload con cc, in_reply_to, references, thread_id
- `app/src/lib/services/email-service.ts` — Nodemailer con CC + In-Reply-To headers
- `app/src/lib/services/gmail-reader.ts` — markAsRead, replyToMessage, fix IMAP headers
- `app/src/lib/services/catpaw-gmail-tools.ts` — 3 tool definitions nuevas
- `app/src/lib/services/catpaw-gmail-executor.ts` — 3 handlers nuevos

### Bugs IMAP corregidos (INC-08, INC-09)
- Headers IMAP devolvian subject/from vacios — imap-simple devuelve objeto, no string
- Query "is:unread" no funcionaba — IMAP necesita UNSEEN, no es query Gmail

---

## Bloque 3 — Ampliacion Holded (16 tools expuestas)

### 6 tools nuevas expuestas a CatBot/CatPaws
- `create_contact`, `update_contact`, `list_contacts`
- `holded_update_lead`, `holded_create_lead_note`, `holded_search_lead`

### Archivos modificados
- `app/src/lib/services/catbot-holded-tools.ts` — 6 tools añadidas al array
- `app/src/lib/services/catbot-tools.ts` — isHoldedTool importado para tools sin prefijo holded_

---

## Bloque 4 — Motor de Canvas: ejecuteCatPaw + Gmail tools

### Bug critico: executeCatPaw() skipea Gmail (INC-02)
- `execute-catpaw.ts` tenia `if (['google_drive', 'gmail'].includes(conn.connector_type)) continue;`
- Gmail tools nunca se cargaban en el tool-calling loop del canvas
- **Fix:** importar getGmailToolsForPaw + executeGmailToolCall, cargar junto a Drive tools

### Bug critico: Nodos Agent sin CatPaw no tienen tools (INC-01)
- Un nodo Agent con agentId=null cae en llamada LLM directa sin tool-calling
- **Fix:** crear CatPaws utilitarios (Ejecutor Gmail, Operador Drive) y vincularlos

---

## Bloque 5 — 4 Canvas comerciales creados

### Canvas 1: Revision Diaria Inbound — Educa360
- **ID:** `9366fa92-99c6-4ec9-8cf8-7c627ccd1d97`
- **Nodos:** 11 | **Schedule:** 10:00 L-V
- **Flujo:** Start → Lector Gmail → Condition → Clasificador → RAG Educa360 → Respondedor → Derivador → Ejecutor Gmail → Storage → Output
- **Probado y funcionando:** 2 emails respondidos automaticamente con info de RAG

### Canvas 2: Prospeccion Outbound — Educa360
- **ID:** `e52deeb1-5b00-455f-8ed9-30839300e0e3`
- **Nodos:** 18 | **listen_mode:** 1 (acepta triggers)
- **Flujo:** Start → [Lector Objetivos + Lector Historico] → Merge → Estratega ICP → Buscador → Condition → Deduplicador → Condition → Investigador → [Redactor + Connector Gmail] → Merge → Storage → Actualizador → Output

### Canvas 3: Canal de Mando — //negocio:educa360
- **ID:** `21f75e7f-f342-4eba-bc64-b14072e3351a`
- **Nodos:** 12 | **Schedule:** cada 30 min
- **Flujo:** Start → Lector Gmail → Condition → Interprete → [CRM / Canvas / Otros] → Merge → Generador Respuestas → Output

### Canvas 4: Informe Diario de Negocio — 14:00
- **ID:** `1b086477-e0c8-4688-b1d1-564935224bc6`
- **Nodos:** 9 | **Schedule:** 14:00 L-V
- **Flujo:** Start → [Extractor Holded + Lector Actividad] → Merge → RAG → Experto Negocio → Formateador HTML → Enviador Gmail → Output

---

## Bloque 6 — Bugs de Canvas UI corregidos

### Nodos borrados reaparecen (INC-06)
- **Causa:** doble merge (cliente pre-save + servidor PATCH) re-añade nodos eliminados
- **Fix:** eliminado pre-merge del cliente, añadido flag `force_overwrite: true`
- **Archivos:** canvas-editor.tsx, api/canvas/[id]/route.ts

### Nodos fantasma causan fallos (INC-07)
- **Causa:** POST /api/canvas crea Start default, PATCH merge lo re-añade
- **Fix:** limpieza manual + prevenido con force_overwrite

### Wizard → Chat muestra pasos bloqueados
- **Causa:** router.push no refresca datos del CatBrain
- **Fix:** setRefreshTrigger + setActiveStep + router.replace en onComplete

---

## Bloque 7 — Mejora RAG: chunking contextual

### Problema
- Chunks de tablas markdown perdian el heading de seccion
- Busqueda "Adriano Perez" no encontraba resultados porque el nombre estaba en heading separado

### Solucion
- Cada chunk ahora incluye `### {sectionTitle}` como prefijo si no empieza con #
- Aplicado en 3 archivos: rag.ts, rag/append/route.ts, rag-worker.mjs
- rag/append ahora actualiza rag_indexed_version (evita warning "nueva version")

---

## Bloque 8 — UI: Panel configuracion Agent en Canvas

### Mejoras implementadas
- **Conectores visibles:** seccion con pills coloreados por tipo, boton vincular/desvincular
- **Skills agrupadas:** acordeon por categoria (ventas, escritura, analisis, etc.)
- **Skills seleccionadas como pills** con X para quitar rapido
- **Colores por tipo:** Gmail=rojo, Drive=amarillo, MCP=violeta, ventas=verde, etc.

### Archivo modificado
- `app/src/components/canvas/node-config-panel.tsx`

---

## Bloque 9 — Documentacion de conocimiento

### Documentos creados
- `canvas-nodes.md` — 564 lineas, 11 nodos activos con configuracion y patrones
- `INCIDENCIAS-CONECTORES-CANVAS.md` — 9 incidencias con causa raiz y solucion

### Documentos actualizados
- `catPaw.md` — 30 agentes (antes 25)
- `skills.md` — 40 skills (antes 38)
- `CONNECTORS.md` — 9 conectores, Gmail con 8 tools, Holded con 16 tools
- `GUIA_USUARIO.md` — v22.1, Gmail y Holded con capacidades ampliadas

---

## Resumen de archivos modificados (codigo)

| Archivo | Cambio |
|---------|--------|
| `lib/types.ts` | EmailPayload + cc, in_reply_to, references |
| `lib/services/email-service.ts` | CC + In-Reply-To en Nodemailer |
| `lib/services/gmail-reader.ts` | markAsRead, replyToMessage, fix IMAP headers, IMAP query translation |
| `lib/services/catpaw-gmail-tools.ts` | 3 tools nuevas |
| `lib/services/catpaw-gmail-executor.ts` | 3 handlers nuevos |
| `lib/services/catbot-holded-tools.ts` | 6 tools añadidas |
| `lib/services/catbot-tools.ts` | isHoldedTool import |
| `lib/services/execute-catpaw.ts` | Gmail tools en tool-calling loop |
| `lib/services/rag.ts` | Chunking contextual con headings |
| `lib/services/canvas-executor.ts` | (sin cambios directos esta sesion) |
| `app/api/catbrains/[id]/rag/append/route.ts` | Chunking contextual + update rag_indexed_version |
| `app/api/canvas/[id]/route.ts` | force_overwrite flag en PATCH |
| `components/canvas/canvas-editor.tsx` | Eliminado pre-merge, force_overwrite |
| `components/canvas/node-config-panel.tsx` | Skills agrupadas + conectores |
| `components/catbrains/sources-pipeline.tsx` | Auto-index, auto-navigate, default modes |
| `app/catbrains/[id]/page.tsx` | onComplete refresh fix |
| `scripts/rag-worker.mjs` | Chunking contextual con section headings |
