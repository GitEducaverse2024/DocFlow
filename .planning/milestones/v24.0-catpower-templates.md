# Milestone: CatPower — Modulo Email Templates + Reorganizacion Menu

**Version:** v24.0
**Fecha planificacion:** 2026-04-01
**Estado:** PLANIFICADO

---

## Contexto del problema

Los emails que salen de los canvas y agentes no tienen identidad visual corporativa. El LLM genera HTML desde cero cada vez, produciendo resultados inconsistentes: sin logo, sin cabecera, sin pie de firma, sin colores corporativos. Cada nuevo canvas que envia email necesita instrucciones completas de maquetacion en el prompt, lo cual es fragil y no escalable.

Las imagenes (logos, banners) necesitan URLs publicas para que los clientes de email las rendericen — no sirven base64 ni rutas locales. La solucion es subirlas a Drive y usar las URLs.

---

## Vision de la solucion

### 1. CatPower — Nuevo modulo paraguas

Nuevo item en el menu lateral que agrupa las herramientas del sistema:

```
CatPower
  ├── Skills (ya existe en /skills, se mueve a /catpower/skills)
  ├── Conectores (ya existe en /connectors, se mueve a /catpower/connectors)
  └── Templates (nuevo, /catpower/templates)
```

El menu lateral actual tiene Skills y Connectors como items separados. Se unifican bajo CatPower con navegacion por tabs o sub-rutas.

### 2. Email Templates — Editor visual

**Ruta:** `/catpower/templates`

Cada template tiene:
- **Nombre** + **descripcion** (cuando usar esta plantilla)
- **Estructura en 3 secciones:** Cabecera, Cuerpo, Pie
- Cada seccion contiene **bloques ordenables** (drag & drop)
- Preview HTML en tiempo real en panel lateral

### 3. Tipos de bloque

| Tipo | Que hace | Ejemplo |
|------|----------|---------|
| **Imagen** | Sube imagen a Drive, genera URL publica, renderiza `<img>` | Logo corporativo, banner |
| **Texto** | Texto estatico con formato basico (negrita, cursiva, links, listas) | Pie de firma, disclaimer |
| **Instruccion LLM** | Placeholder que el agente rellena al enviar | "Saludo personalizado con nombre del lead" |

Formato basico del texto: **negrita**, *cursiva*, [links](url), listas con viñetas. No necesita editor WYSIWYG completo — un textarea con markdown o un mini-editor como tiptap.

### 4. Gestion de assets (imagenes)

Cada template tiene una carpeta en Drive:
```
DoCatFlow/
  templates/
    corporativa-educa360/
      logo.png
      banner-cabecera.png
    informe-leads/
      logo.png
```

Al subir una imagen en el editor:
1. Se sube via Operador Drive a la carpeta de la plantilla
2. Se obtiene la URL publica de Drive
3. Se guarda la URL en la definicion del bloque
4. El HTML generado usa `<img src="url_drive">` directamente

**Alternativa manual:** Si no quiere usar Drive, puede pegar una URL de imagen publica directamente.

### 5. Preview HTML

El editor genera HTML en tiempo real:
- Los bloques de imagen → `<img src="url" style="...">`
- Los bloques de texto → HTML formateado
- Los bloques de instruccion → `<!-- INSTRUCCION: texto -->`  con placeholder visual

El preview muestra como se vera el email final (excepto las instrucciones que se rellenaran en runtime).

### 6. Integracion con Canvas y Agentes

**Conector tipo `email_template`:**
- Nuevo tipo de conector que da acceso a las plantillas
- Se vincula a un CatPaw como cualquier otro conector
- Expone tools: `list_email_templates`, `get_email_template`, `render_email_template`

**Skill "Maquetador de Email":**
- Skill que se inyecta en el system prompt
- Instrucciones: "Cuando vayas a enviar un email, primero consulta las plantillas disponibles. Analiza: quien envia, a quien, que tipo de correo es (comercial, informe, notificacion, etc). Selecciona la plantilla mas apropiada segun su descripcion. Luego rellena las instrucciones de cada bloque con el contenido real."

**Flujo en runtime:**
```
Agent necesita enviar email
  → Skill le dice: "consulta plantillas"
  → Tool list_email_templates devuelve las disponibles con descripcion
  → Agent elige la apropiada
  → Tool get_email_template devuelve la estructura con bloques
  → Agent rellena los bloques de instruccion
  → Tool render_email_template genera el HTML final
  → Agent envia con gmail_send_email(html_body=HTML_generado)
```

### 7. Modelo de datos

```sql
-- Tabla de templates
CREATE TABLE email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,           -- "Cuando usar esta plantilla"
  category TEXT DEFAULT 'general',  -- corporativa, comercial, informe, notificacion
  structure TEXT NOT NULL,    -- JSON con la definicion de bloques
  html_preview TEXT,          -- HTML pre-renderizado del template
  drive_folder_id TEXT,       -- ID carpeta en Drive para assets
  is_active INTEGER DEFAULT 1,
  times_used INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Estructura JSON del template:**
```json
{
  "sections": {
    "header": {
      "blocks": [
        {"type": "image", "src": "https://drive.google.com/...", "alt": "Logo Educa360", "width": 200, "align": "center"},
        {"type": "image", "src": "https://drive.google.com/...", "alt": "Banner", "width": "100%"}
      ]
    },
    "body": {
      "blocks": [
        {"type": "instruction", "text": "Saludo personalizado con nombre del destinatario y empresa"},
        {"type": "instruction", "text": "Cuerpo principal del mensaje segun el contexto del email"},
        {"type": "text", "content": "Quedamos a tu disposicion para cualquier consulta."}
      ]
    },
    "footer": {
      "blocks": [
        {"type": "text", "content": "**Equipo Educa360**\ninfo@educa360.com | www.educa360.com"},
        {"type": "image", "src": "https://drive.google.com/...", "alt": "Logo pequeño", "width": 80, "align": "center"}
      ]
    }
  },
  "styles": {
    "backgroundColor": "#ffffff",
    "fontFamily": "Arial, sans-serif",
    "primaryColor": "#7C3AED",
    "textColor": "#333333",
    "maxWidth": 600
  }
}
```

---

## Fases de implementacion

### Fase 1 — Reorganizacion menu: CatPower
**Objetivo:** Crear /catpower como modulo paraguas con tabs Skills, Conectores, Templates
**Alcance:**
- Nueva ruta /catpower con layout de tabs
- Mover /skills a /catpower/skills (mantener redirect)
- Mover /connectors a /catpower/connectors (mantener redirect)
- Placeholder para /catpower/templates
- Actualizar menu lateral del layout
- Actualizar navegacion de CatBot (navigate_to)

### Fase 2 — Base de datos y API de templates
**Objetivo:** CRUD de templates con estructura JSON
**Alcance:**
- Tabla email_templates en db.ts
- API routes: GET/POST /api/email-templates, GET/PATCH/DELETE /api/email-templates/[id]
- API para assets: POST /api/email-templates/[id]/assets (upload imagen)
- Seed con 1-2 templates de ejemplo

### Fase 3 — Editor visual de templates
**Objetivo:** Interfaz de creacion/edicion de plantillas
**Alcance:**
- Pagina /catpower/templates/new y /catpower/templates/[id]
- Editor de 3 secciones (cabecera, cuerpo, pie)
- Añadir/eliminar/reordenar bloques en cada seccion
- Bloque tipo imagen: upload + URL Drive
- Bloque tipo texto: mini-editor con formato basico (negrita, cursiva, links, listas)
- Bloque tipo instruccion: textarea con placeholder visual
- Configuracion de estilos (colores, fuente, ancho)

### Fase 4 — Preview HTML y renderizado
**Objetivo:** Generar HTML del template en tiempo real
**Alcance:**
- Funcion renderTemplate(template, variables) → HTML string
- Preview en panel lateral del editor
- API POST /api/email-templates/[id]/render con variables
- Soporte para instrucciones LLM como placeholders visuales
- Responsive email HTML (inline styles, table layout para compatibilidad)

### Fase 5 — Gestion de assets (imagenes en Drive)
**Objetivo:** Subir imagenes a Drive y obtener URLs publicas
**Alcance:**
- Carpeta DoCatFlow/templates/{template-name}/ en Drive
- Upload via Operador Drive o manual (URL directa)
- Obtener URL compartible de Drive (sharing permission: anyone with link)
- Galeria de assets por template
- Opcion de reusar assets entre templates

### Fase 6 — Integracion: conector + skill + tools
**Objetivo:** Los agentes pueden usar templates automaticamente
**Alcance:**
- Tools: list_email_templates, get_email_template, render_email_template
- Conector tipo email_template (se vincula a CatPaw)
- Skill "Maquetador de Email" con protocolo de seleccion inteligente
- Modificar execute-catpaw.ts para soportar email_template connector
- Test E2E: canvas envia email con template corporativo automaticamente

### Fase 7 — Templates seed + documentacion
**Objetivo:** Templates iniciales + documentacion de conocimiento
**Alcance:**
- Template "Corporativa Educa360" con logo, banner, pie
- Template "Informe de Leads" con tabla de datos
- Template "Respuesta Comercial" con formato profesional
- Template "Notificacion Interna" minimalista
- Actualizar GUIA_USUARIO.md, canvas-nodes.md, CONNECTORS.md
- Actualizar catPaw.md con skill Maquetador

---

## Criterios de exito

- [ ] Menu CatPower agrupa Skills + Conectores + Templates
- [ ] Se puede crear una plantilla con logo + banner + instrucciones + pie desde la UI
- [ ] Las imagenes se suben a Drive y tienen URL publica funcional
- [ ] El preview muestra el HTML correctamente
- [ ] Un agente en canvas puede enviar email con template automaticamente
- [ ] El email recibido por el destinatario muestra logo, cabecera, colores corporativos
- [ ] La skill selecciona el template correcto segun el tipo de email

---

## Riesgos

1. **URLs de imagenes Drive** — Google puede exigir autenticacion para ver imagenes. Solucion: configurar sharing "anyone with link" al subir, o usar hosting alternativo.
2. **HTML email compatibility** — Los clientes de email (Gmail, Outlook, Apple Mail) tienen soporte CSS limitado. Solucion: usar table-based layout con inline styles.
3. **Complejidad del editor** — Un editor visual drag-and-drop es complejo. Solucion: empezar con interfaz simple de "añadir bloque" sin drag-and-drop, iterar despues.

---
