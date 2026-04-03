# Catalogo de Plantillas de Email

**Total:** 11 plantillas | **Actualizado:** 2026-04-02

**Ruta:** /catpower/templates
**Acciones:** Crear, Editar (visual drag-and-drop), Eliminar, Preview HTML, Enviar test, Subir imagenes a Drive

---

## Indice

| # | Nombre | Categoria | Bloques | Tipos de bloque | Usos | Estado |
|---|--------|-----------|---------|-----------------|------|--------|
| 1 | CatBot | General | 4 | logo, logo, instruction, image | 14 | Activo |
| 2 | Plantilla Corporativa | Corporativa | 2 | instruction, text | 3 | Activo |
| 3 | Corporativa Educa360 | Corporativa | 6 | logo, instruction, image, video, instruction, text, logo | 0 | Activo |
| 4 | Respuesta Comercial | Comercial | 4 | logo, instruction, text, text | 0 | Activo |
| 5 | Pro-K12 | Comercial | 4 | image, image, video, image | 0 | Activo |
| 6 | Pro-REVI | Comercial | 3 | logo, image, image | 0 | Activo |
| 7 | Pro-Simulator | Comercial | 3 | logo, image, image | 0 | Activo |
| 8 | Pro-Educaverse | Comercial | 2 | logo, image | 0 | Activo |
| 9 | Test Template | Comercial | 0 | — | 0 | Activo |
| 10 | Informe de Leads | Informe | 3 | text, instruction, text | 0 | Activo |
| 11 | Notificacion Interna | Notificacion | 2 | instruction, text | 0 | Activo |

---

## Categorias

| Categoria | Color | Uso tipico | Plantillas |
|-----------|-------|-----------|------------|
| General | Violeta | Emails internos, comunicacion general | CatBot |
| Corporativa | Azul | Comunicacion corporativa, empleados, clientes (no venta) | Plantilla Corporativa, Corporativa Educa360 |
| Comercial | Verde | Respuestas a leads, propuestas, emails de venta | Respuesta Comercial, Pro-K12, Pro-REVI, Pro-Simulator, Pro-Educaverse, Test Template |
| Informe | Ambar | Informes ejecutivos, resumenes de datos | Informe de Leads |
| Notificacion | Rosa | Alertas internas, notificaciones de sistema | Notificacion Interna |

---

## Estructura de un template

Cada plantilla tiene 3 secciones: **header**, **body**, **footer**. Cada seccion tiene filas (rows). Cada fila tiene 1-2 columnas. Cada columna contiene un bloque.

### Tipos de bloque

| Tipo | Props | Uso |
|------|-------|-----|
| `logo` | src, align, width, alt | Logotipo con tamaño y posicion configurables |
| `image` | src, align (left/center/right/full), width, alt | Imagen o grafico |
| `video` | url (YouTube) | Thumbnail con enlace a video |
| `text` | content (Markdown: **bold**, *italic*, [link](url), - lists) | Texto estatico |
| `instruction` | content/text (= clave de variable) | Variable IA — el agente rellena al enviar |

### Estilos globales

| Propiedad | Default | Descripcion |
|-----------|---------|-------------|
| backgroundColor | #ffffff | Fondo del email |
| fontFamily | Arial, sans-serif | Fuente del texto |
| primaryColor | #7C3AED | Color de cabecera y acentos |
| textColor | #333333 | Color del texto |
| maxWidth | 600 | Ancho maximo en px |

---

## Detalle de plantillas

### 1. CatBot

| Campo | Valor |
|-------|-------|
| **ID** | `077e4fff-6fb6-476e-a52e-ebef7013df0c` |
| **Categoria** | General |
| **Usos** | 14 |
| **Assets** | 2 (dcf_01.webp, logoEduca360new.png — en Drive con URL publica) |
| **Drive folder** | `17aXsgpqRXHyFO-ouzNHXjuMTnw2ebcvs` |

**Estructura:** Header (logo), Body (imagen banner + texto), Footer (logo footer)
**Uso:** Correos internos que CatBot envia a directiva o empleados.

---

### 2. Plantilla Corporativa

| Campo | Valor |
|-------|-------|
| **ID** | `seed-template-basic` |
| **Categoria** | Corporativa |
| **Usos** | 3 |

**Descripcion:** Utilizada para correos corporativos tanto a empleados, directivos y comunicacion con clientes para fines no de venta.
**Estructura:** Body (instruccion LLM + texto firma).

---

### 3. Corporativa Educa360

| Campo | Valor |
|-------|-------|
| **ID** | `seed-tpl-corporativa` |
| **Categoria** | Corporativa |

**Descripcion:** Plantilla corporativa con logo, banner de cabecera, cuerpo con instruccion LLM, y pie con firma y logo pequeno.
**Estructura:** Header (logo), Body (instruction + image + video + instruction + text), Footer (logo). Template completo con contenido visual y bloques IA.

---

### 4. Respuesta Comercial

| Campo | Valor |
|-------|-------|
| **ID** | `seed-tpl-respuesta-comercial` |
| **Categoria** | Comercial |

**Descripcion:** Plantilla comercial con logo sutil, cuerpo personalizado por LLM, CTA de reunion, y pie profesional.
**Estructura:** Header (logo), Body (instruccion LLM + CTA), Footer (firma).
**Uso recomendado:** Respuestas automaticas a leads entrantes.

---

### 5. Pro-K12

| Campo | Valor |
|-------|-------|
| **ID** | `bc03e496-8385-41e9-8a8f-da78e5e52f6d` |
| **Categoria** | Comercial |
| **Bloques** | 4 (image, image, video, image) |

**Descripcion:** Template para correos referentes a Educa360 K12.
**Estructura:** Imagenes de producto + video explicativo. Orientado a leads educativos K12.

---

### 6. Pro-REVI

| Campo | Valor |
|-------|-------|
| **ID** | `9f97f705-7cfd-4083-8436-eb5473f02468` |
| **Categoria** | Comercial |
| **Bloques** | 3 (logo, image, image) |

**Descripcion:** Template para leads o clientes de REVI.
**Estructura:** Logo + imagenes de producto. Orientado a leads de realidad virtual educativa.

---

### 7. Pro-Simulator

| Campo | Valor |
|-------|-------|
| **ID** | `d7cc4227-89f4-47ca-8780-745f4d0e54fa` |
| **Categoria** | Comercial |
| **Bloques** | 3 (logo, image, image) |

**Descripcion:** Template para leads o clientes de EducaSimulator.
**Estructura:** Logo + imagenes de producto. Orientado a leads de simuladores educativos.

---

### 8. Pro-Educaverse

| Campo | Valor |
|-------|-------|
| **ID** | `155c955e-7e9a-4d25-8f5b-93093a43d38b` |
| **Categoria** | Comercial |
| **Bloques** | 2 (logo, image) |

**Descripcion:** Educaverse template para correos de este producto.
**Estructura:** Logo + imagen de producto. Orientado a leads del metaverso educativo.

---

### 9. Test Template

| Campo | Valor |
|-------|-------|
| **ID** | `deef21aa-397b-421a-a4bd-1db7dce34f8f` |
| **Categoria** | Comercial |

**Descripcion:** Plantilla de pruebas. Vacia.

---

### 10. Informe de Leads

| Campo | Valor |
|-------|-------|
| **ID** | `seed-tpl-informe-leads` |
| **Categoria** | Informe |

**Descripcion:** Plantilla de informe con cabecera violeta, instruccion para tabla de datos, y pie DoCatFlow.
**Estructura:** Header (titulo), Body (instruccion LLM para tabla), Footer (pie DoCatFlow).

---

### 11. Notificacion Interna

| Campo | Valor |
|-------|-------|
| **ID** | `seed-tpl-notificacion` |
| **Categoria** | Notificacion |

**Descripcion:** Plantilla minimalista para notificaciones internas. Solo instruccion de cuerpo y pie basico.
**Estructura:** Body (instruccion LLM), Footer (texto basico).

---

## Imagenes y Drive

Las imagenes subidas al editor se guardan localmente Y se suben a Google Drive automaticamente al renderizar (servicio `resolveAssetsForEmail`). Las URLs de Drive usan el formato `https://lh3.googleusercontent.com/d/{fileId}` que preserva transparencia webp/png.

**Formatos soportados:** PNG, JPG, WEBP (transparencia preservada), GIF
**Nota sobre WEBP en email:** Outlook desktop no soporta webp. Para maxima compatibilidad usar PNG.

### Assets actuales

| Template | Archivo | Tipo | URL Drive |
|----------|---------|------|-----------|
| CatBot | dcf_01.webp | image/webp | lh3.../d/1pbSl3AKTEFbsjgYoCjetML5KqhkgNKzA |
| CatBot | logoEduca360new.png | image/png | lh3.../d/1nLHSEpT8CHAThCdbj-h69Zn7QI8rwdmC |

---

## Herramientas disponibles

### CatBot (6 tools CRUD)
- `list_email_templates(category?)` — lista con filtro
- `get_email_template(templateId/templateName)` — detalle completo + variables
- `create_email_template(name, description?, category?, structure?)` — crear nueva
- `update_email_template(templateId, ...)` — editar
- `delete_email_template(templateId)` — eliminar
- `render_email_template(templateId, variables)` — renderizar HTML

### CatPaw (3 tools via conector email_template)
- `list_email_templates` — lista
- `get_email_template` — detalle
- `render_email_template` — renderizar

### Skill asociada
- **Maquetador de Email** (`maquetador-email`) — protocolo de seleccion, creacion y renderizado

---

## Mapeo producto-plantilla (Canvas Inbound)

Definido en la skill "Leads y Funnel InfoEduca":

| Producto detectado | Plantilla | Bloques IA | Notas |
|-------------------|-----------|:---:|-------|
| Pro-K12 | Pro-K12 (`bc03e496...`) | 0 | Solo visual (imagenes + video). El texto se envia como body fuera del template. |
| Pro-REVI | Pro-REVI (`9f97f705...`) | 0 | Solo visual (logo + imagenes). Texto fuera del template. |
| Pro-Simulator | Pro-Simulator (`d7cc4227...`) | 0 | Solo visual (logo + imagenes). Texto fuera del template. |
| Pro-Educaverse | Pro-Educaverse (`155c955e...`) | 0 | Solo visual (logo + imagen). Texto fuera del template. |
| Generico/multiples | Respuesta Comercial (`seed-tpl-respuesta-comercial`) | 1 | Tiene bloque instruction — el agente rellena el cuerpo. |
| Interno/CatBot | CatBot (`077e4fff...`) | 1 | Logo header + bloque instruction + logo footer. |
| Informe ejecutivo | Informe de Leads (`seed-tpl-informe-leads`) | 1 | Bloque instruction para tabla de datos. |
| Notificacion | Notificacion Interna (`seed-tpl-notificacion`) | 1 | Bloque instruction para cuerpo. |

**Nota:** Las plantillas Pro-* actualmente solo tienen bloques visuales (logo/image/video) sin bloques `instruction`. Para que el agente pueda rellenar texto dinamicamente, se recomienda añadir al menos un bloque `instruction` en el body de cada una.

---
