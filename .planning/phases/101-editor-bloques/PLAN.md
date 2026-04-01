# Phase 101: Editor Visual — Estructura y Bloques

## Goal
Existe una pagina /catpower/templates/[id] con editor visual de 3 secciones donde se pueden añadir bloques de 5 tipos (logo, imagen, video, texto, instruccion) con configuracion individual.

## Requirements
EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, BLK-01, BLK-02, BLK-03, BLK-04, BLK-05, BLK-06

**NOT in scope (Phase 102):** Drag-and-drop, layout filas/columnas, "Añadir al lado"
**NOT in scope (Phase 103):** Preview HTML, panel de estilos

---

## Plan 01 — Lista de templates + Editor con bloques

### Task 1: Lista de templates (/catpower/templates)
**File:** `app/src/app/catpower/templates/page.tsx` (REWRITE — replace placeholder)

Pagina de lista con:
- Header con titulo "Email Templates" + boton "Nueva Plantilla" (→ /catpower/templates/new)
- Grid de cards (2-3 columnas) para cada template:
  - Icono de categoria (Mail para general, Building para corporativa, etc.)
  - Nombre del template
  - Descripcion (truncada 1 linea)
  - Badge de categoria (colored pill)
  - "X usos" counter
  - Click → navega a /catpower/templates/{id}
- Fetch desde GET /api/email-templates
- Empty state si no hay templates

### Task 2: Pagina de edicion — layout base
**File:** `app/src/app/catpower/templates/[id]/page.tsx` (NEW)

Layout de 2 paneles:
- **Panel izquierdo (60%):** Editor con 3 secciones
- **Panel derecho (40%):** Config del bloque seleccionado + metadata del template

Toolbar superior:
- Input nombre del template (editable inline)
- Select categoria (general, corporativa, comercial, informe, notificacion)
- Input descripcion
- Boton "Guardar" (PATCH /api/email-templates/{id})
- Boton "Volver" (→ /catpower/templates)

Las 3 secciones del panel izquierdo:
- Cabecera (header) — fondo violet-500/10, icono de cabecera
- Cuerpo (body) — fondo zinc-900, sin decoracion especial
- Pie (footer) — fondo zinc-800/50, icono de pie

Cada seccion muestra:
- Titulo de seccion (Cabecera / Cuerpo / Pie)
- Lista de filas/bloques (renderizados desde template.structure)
- Boton "+ Añadir bloque" al final de cada seccion

### Task 3: Pagina de creacion — /catpower/templates/new
**File:** `app/src/app/catpower/templates/new/page.tsx` (NEW)

- POST /api/email-templates con nombre por defecto "Nueva Plantilla"
- Redirige a /catpower/templates/{nuevo-id} inmediatamente
- No necesita UI propia — solo crea y redirige

### Task 4: Componente TemplateEditor
**File:** `app/src/components/templates/template-editor.tsx` (NEW)

Componente principal del editor. Recibe template data y maneja:
- State local del structure (sections, rows, blocks)
- Auto-save debounced (3s) con PATCH al backend
- Seleccion de bloque activo para el panel de config
- CRUD de bloques: añadir, eliminar, mover arriba/abajo

**Estructura del state:**
```typescript
const [structure, setStructure] = useState<TemplateStructure>(parsed);
const [selectedBlockPath, setSelectedBlockPath] = useState<{section: string, rowIndex: number, colIndex: number} | null>(null);
```

### Task 5: Componente SectionEditor
**File:** `app/src/components/templates/section-editor.tsx` (NEW)

Renderiza una seccion (header/body/footer):
- Titulo con icono
- Lista de filas, cada fila muestra sus bloques
- Boton "+ Añadir bloque" que abre un popover/modal con selector de tipo
- Cada bloque tiene overlay con: botones mover arriba/abajo, eliminar, seleccionar para config

### Task 6: Selector de tipo de bloque
**File:** `app/src/components/templates/block-type-selector.tsx` (NEW)

Popover o modal que aparece al click "+ Añadir bloque":
- 5 opciones con icono + nombre + descripcion breve:
  - 🏷️ Logo — Logotipo con posicion configurable
  - 🖼️ Imagen — Foto o grafico con alineacion
  - 🎬 Video — Video de YouTube (thumbnail con link)
  - ✏️ Texto — Texto con formato basico
  - 🤖 Instruccion — Placeholder para contenido generado por IA
- Al seleccionar, crea un nuevo row con una columna y el bloque elegido
- Se añade al final de la seccion

### Task 7: Renderizado de bloques en el editor
**File:** `app/src/components/templates/block-renderer.tsx` (NEW)

Componente que renderiza la preview de un bloque en el editor (no el HTML final):
- **Logo/Image:** Muestra la imagen si hay src, o dropzone de upload si no
- **Video:** Muestra thumbnail de YouTube si hay URL, o input para URL
- **Text:** Muestra el contenido formateado (markdown renderizado)
- **Instruction:** Fondo diferenciado (violet-500/10, borde dashed), muestra el texto del placeholder

Cada bloque tiene border seleccionable (click → se activa config panel derecho).

### Task 8: Panel de configuracion de bloque
**File:** `app/src/components/templates/block-config-panel.tsx` (NEW)

Panel derecho que muestra config del bloque seleccionado:

**Para Logo:**
- Upload imagen (drag or click) → POST /api/email-templates/{id}/assets
- Input URL alternativa
- Selector alineacion: Izquierda | Centro | Derecha (botones toggle)
- Input ancho (px, default 200)
- Input alt text

**Para Imagen:**
- Upload o URL (igual que logo)
- Selector alineacion: Izquierda | Centro | Ancho completo
- Input alt text

**Para Video:**
- Input URL de YouTube
- Preview automatico del thumbnail
- Nota: "Se mostrara como imagen con link al video"

**Para Texto:**
- Textarea con barra de herramientas mini:
  - B (negrita → envuelve en **)
  - I (cursiva → envuelve en *)
  - 🔗 (link → [texto](url))
  - • (lista → añade - al inicio de linea)
- Preview del markdown renderizado debajo

**Para Instruccion:**
- Textarea para el texto del placeholder
- Nota explicativa: "El agente IA rellenara este bloque con contenido real al enviar el email"

**Todos:**
- Boton "Eliminar bloque" (rojo)

### Task 9: Logica de upload de assets
**File:** Within `block-config-panel.tsx`

Al subir una imagen:
1. POST /api/email-templates/{id}/assets con FormData
2. Recibir URL del asset
3. Actualizar block.src con la URL
4. Trigger auto-save

### Task 10: i18n keys
**Files:** `app/messages/es.json`, `app/messages/en.json` (MODIFY)

Añadir dentro de "catpower.templates":
```json
"list": "Plantillas",
"new": "Nueva Plantilla",
"edit": "Editar Plantilla",
"save": "Guardar",
"saving": "Guardando...",
"saved": "Guardado",
"sections": {
  "header": "Cabecera",
  "body": "Cuerpo",
  "footer": "Pie"
},
"blocks": {
  "add": "Añadir bloque",
  "logo": "Logo",
  "logoDesc": "Logotipo con posicion configurable",
  "image": "Imagen",
  "imageDesc": "Foto o grafico con alineacion",
  "video": "Video",
  "videoDesc": "Video de YouTube",
  "text": "Texto",
  "textDesc": "Texto con formato basico",
  "instruction": "Instruccion IA",
  "instructionDesc": "Contenido generado por IA al enviar",
  "delete": "Eliminar bloque",
  "moveUp": "Subir",
  "moveDown": "Bajar"
},
"config": {
  "alignment": "Alineacion",
  "left": "Izquierda",
  "center": "Centro",
  "right": "Derecha",
  "full": "Ancho completo",
  "width": "Ancho (px)",
  "altText": "Texto alternativo",
  "uploadImage": "Subir imagen",
  "orPasteUrl": "o pegar URL",
  "youtubeUrl": "URL de YouTube",
  "instructionNote": "El agente IA rellenara este bloque con contenido real al enviar el email",
  "textPlaceholder": "Escribe aqui..."
},
"metadata": {
  "name": "Nombre",
  "description": "Descripcion",
  "category": "Categoria",
  "categories": {
    "general": "General",
    "corporate": "Corporativa",
    "commercial": "Comercial",
    "report": "Informe",
    "notification": "Notificacion"
  }
}
```

### Task 11: Build + verificacion
- npm run build sin errores
- /catpower/templates muestra lista con seed template
- /catpower/templates/new crea template y redirige al editor
- Editor muestra 3 secciones (Cabecera, Cuerpo, Pie)
- Se puede añadir bloque de cada tipo
- Config panel muestra opciones segun tipo de bloque
- Auto-save persiste cambios al backend
- Upload de imagen funciona

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `app/src/app/catpower/templates/page.tsx` | REWRITE | Lista de templates con cards |
| `app/src/app/catpower/templates/[id]/page.tsx` | NEW | Pagina del editor |
| `app/src/app/catpower/templates/new/page.tsx` | NEW | Crear y redirigir |
| `app/src/components/templates/template-editor.tsx` | NEW | Componente principal del editor |
| `app/src/components/templates/section-editor.tsx` | NEW | Editor de seccion con bloques |
| `app/src/components/templates/block-type-selector.tsx` | NEW | Selector popup de tipo de bloque |
| `app/src/components/templates/block-renderer.tsx` | NEW | Preview de bloque en el editor |
| `app/src/components/templates/block-config-panel.tsx` | NEW | Panel config del bloque seleccionado |
| `app/messages/es.json` | MODIFY | Keys i18n templates |
| `app/messages/en.json` | MODIFY | Keys i18n templates |

---

## Verification Checklist

- [ ] /catpower/templates muestra lista con cards
- [ ] Click en card navega al editor
- [ ] /catpower/templates/new crea y redirige
- [ ] Editor muestra 3 secciones (Cabecera, Cuerpo, Pie)
- [ ] Boton "Añadir bloque" abre selector de 5 tipos
- [ ] Bloque Logo: upload imagen + alineacion + ancho
- [ ] Bloque Imagen: upload/URL + alineacion + alt
- [ ] Bloque Video: input YouTube URL + thumbnail auto
- [ ] Bloque Texto: textarea con herramientas formato basico
- [ ] Bloque Instruccion: textarea con fondo diferenciado
- [ ] Panel config muestra opciones segun tipo seleccionado
- [ ] Auto-save persiste al backend (check con refresh)
- [ ] Upload de imagen crea asset y actualiza block.src
- [ ] npm run build sin errores
