# Sesion 23 — Bug fixes: RAG append + extracción multi-formato

**Fecha:** 2026-03-19
**Milestone:** Post v13.0 — mantenimiento
**Estado:** COMPLETADO

---

## Resumen

Bug fixes y mejora del pipeline de extracción de contenido:
1. RAG append fallaba con "Ninguna fuente tiene contenido de texto extraído"
2. Análisis QA completo: formatos que bloqueaban el pipeline (DOCX, PPTX, XLSX, RTF, EPUB, PDF escaneado)
3. Extracción nativa de Office XML (DOCX/PPTX/XLSX/ODT/ODP/ODS), EPUB y RTF
4. Conectores Gmail: "Sin probar" pese a test exitoso + HTML como texto plano

---

## 1. Bug fix: `/api/catbrains/[id]/rag/append` — "Ninguna fuente tiene contenido"

**Problema:** El endpoint devolvía 400 "Ninguna fuente tiene contenido de texto extraído" sin intentar re-extracción o sin dar detalles de por qué falló.

**Causas raíz:**
- Re-extracción solo corría para `type === 'file'` — fuentes URL/YouTube/nota con `content_text` vacío se ignoraban silenciosamente
- Cuando `extractContent()` devolvía `method: 'none'` (imagen, binario, error PDF), no se loggeaba nada — fallo invisible
- El error 400 no incluía qué fuentes fallaron ni por qué
- No había fallback: si extracción fallaba para todas las fuentes, el append se bloqueaba completamente

**Solución en `app/src/app/api/catbrains/[id]/rag/append/route.ts`:**
- Itera TODAS las fuentes sin contenido (no solo type=file)
- Logging detallado cuando `extractContent` devuelve `method: 'none'`
- Fallback: usa nombre del archivo como contenido mínimo para no bloquear append
- Error 400 ahora incluye array `failures` con nombre + razón por cada fuente fallida
- Umbral de contenido mínimo bajado de 10 a 5 chars (compatible con fallback)

**Solución en `app/src/components/sources/source-manager.tsx`:**
- Toast de error ahora muestra detalles por fuente (usando `description` de sonner con `duration: 8000`)
- Si el server devuelve `failures[]`, se listan como bullet points

---

## 2. Análisis QA: formatos que bloqueaban el pipeline

**Diagnóstico completo:**

| Formato | Qué pasaba | Resultado | Bloqueaba? |
|---------|-----------|-----------|-----------|
| `.docx` | `isBinaryBuffer()` → null bytes → `method: 'none'` | `content_text = null` | **SI** |
| `.pptx` | Igual — binario detectado | `content_text = null` | **SI** |
| `.xlsx` | Igual — binario detectado | `content_text = null` | **SI** |
| `.odt/.odp/.ods` | Igual — binario | `content_text = null` | **SI** |
| `.doc/.ppt/.xls` | Igual — binario | `content_text = null` | **SI** |
| PDF escaneado | `pdftotext` → texto vacío → placeholder | Placeholder inútil | **SI** |
| `.rtf` | En TEXT_EXTENSIONS pero es binario → garbled UTF-8 | Basura | **SI** |
| `.epub` | Sin soporte → binario | `content_text = null` | **SI** |
| Imágenes | Placeholder `[Imagen: ...]` | Sin contenido | **SI** |

---

## 3. Extracción nativa multi-formato — content-extractor.ts reescrito

### Cambios en `app/src/lib/services/content-extractor.ts`:

**Nuevo método `office-xml`** — extrae texto de formatos ZIP+XML sin dependencias npm:

| Formato | Método | Implementación |
|---------|--------|---------------|
| `.docx` | `unzip -p file word/document.xml` → strip XML tags | Texto del body principal |
| `.pptx` | `unzip -l` → listar slides → extraer cada `ppt/slides/slide*.xml` | Texto por slide con separadores |
| `.xlsx` | `unzip -p file xl/sharedStrings.xml` → strip tags | Todas las cadenas de texto |
| `.odt/.odp/.ods` | `unzip -p file content.xml` → strip tags | OpenDocument content |
| `.epub` | `unzip -l` → listar `.xhtml/.html` → extraer cada uno | Texto de capítulos |
| `.rtf` | Lectura latin1 + regex para strip control words | `\par` → newline, hex escapes, etc |
| `.doc/.xls/.ppt` | Sin soporte nativo → warning con "usa extracción AI" | Legacy binario |

**Otras mejoras:**
- `RTF` removido de `TEXT_EXTENSIONS` — ahora tiene su propia función `extractRtf()`
- Nuevos sets: `OFFICE_EXTENSIONS`, `LEGACY_OFFICE_EXTENSIONS`
- Helper `stripXmlTags()` — limpia XML, decodifica entidades, colapsa whitespace
- `ExtractionResult.method` ahora incluye `'office-xml'`
- Warnings mejorados sugieren "usa extracción AI" para formatos con limitaciones

### Cambios en `app/Dockerfile`:
- Añadido `unzip` junto a `poppler-utils` en la capa runner

### Cambios en `app/src/components/sources/file-upload-zone.tsx`:
- Texto actualizado: "Soporta PDF, DOCX, PPTX, XLSX, EPUB, TXT, MD, CSV, imágenes y código"

---

## 4. Bug fix: Gmail "Sin probar" + HTML como texto plano (sesión anterior)

### "Sin probar":
- `gmail-wizard.tsx`: envía `test_status: 'ok'` en POST cuando `allTestsPassed`
- `api/connectors/route.ts`: lee `body.test_status` e incluye en INSERT

### HTML como texto plano:
- `catbrain-connector-executor.ts`: `looksLikeHtml()` detecta HTML en cualquier campo body
- `email-service.ts`: solo incluye `text` cuando NO hay `html`

---

## Matriz de soporte actualizada

| Formato | Extracción nativa | AI Extraction | Notas |
|---------|------------------|--------------|-------|
| `.pdf` (texto) | pdftotext | Si | Funciona bien |
| `.pdf` (escaneado) | Solo placeholder | **Si (recomendado)** | Necesita modelo vision |
| `.docx` | **office-xml (NUEVO)** | Si | ZIP + word/document.xml |
| `.pptx` | **office-xml (NUEVO)** | Si | ZIP + slides |
| `.xlsx` | **office-xml (NUEVO)** | Si | ZIP + sharedStrings |
| `.odt/.odp/.ods` | **office-xml (NUEVO)** | No | OpenDocument |
| `.epub` | **office-xml (NUEVO)** | No | ZIP + XHTML |
| `.rtf` | **utf8 (FIJADO)** | No | Strip control words |
| `.doc/.xls/.ppt` | No (legacy) | Si (docx/pptx/xlsx) | Warning → "usa AI" |
| Imágenes | No | Si | OCR via vision model |
| Texto/código | utf8 | No | Lectura directa |

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `app/src/lib/services/content-extractor.ts` | Reescrito: DOCX/PPTX/XLSX/ODT/ODP/ODS/EPUB/RTF nativo |
| `app/Dockerfile` | Añadido `unzip` |
| `app/src/app/api/catbrains/[id]/rag/append/route.ts` | Re-extracción mejorada, fallback, error detallado |
| `app/src/components/sources/source-manager.tsx` | Toast con detalles de fallos por fuente |
| `app/src/components/sources/file-upload-zone.tsx` | Texto actualizado con formatos soportados |
| `app/src/app/api/connectors/route.ts` | test_status en INSERT |
| `app/src/components/connectors/gmail-wizard.tsx` | Envía test_status en POST |
| `app/src/lib/services/catbrain-connector-executor.ts` | looksLikeHtml() |
| `app/src/lib/services/email-service.ts` | Solo text cuando no hay html |
