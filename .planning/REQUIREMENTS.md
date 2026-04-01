# Requirements: v24.0 CatPower — Email Templates + Reorganizacion Menu

**Defined:** 2026-04-01
**Core Value:** Emails corporativos consistentes y profesionales desde cualquier canvas o agente, con identidad visual gestionada visualmente.

## Contexto

Los emails enviados desde canvas y agentes se generan con HTML ad-hoc por el LLM cada vez. No hay logo, ni cabecera corporativa, ni pie de firma consistente. Cada canvas necesita instrucciones de maquetacion en el prompt — fragil, inconsistente, no escalable. Las imagenes necesitan URLs publicas (Drive) para renderizar en clientes de email.

## v24.0 Requirements

### MENU — Reorganizacion: CatPower como modulo paraguas

- **MENU-01**: Nuevo modulo CatPower en el menu lateral con icono y sub-navegacion
- **MENU-02**: Sub-seccion Skills (/catpower/skills) — mover la pagina existente /skills
- **MENU-03**: Sub-seccion Conectores (/catpower/connectors) — mover /connectors existente
- **MENU-04**: Sub-seccion Templates (/catpower/templates) — nuevo
- **MENU-05**: Redirects 301 de /skills → /catpower/skills y /connectors → /catpower/connectors
- **MENU-06**: Actualizar navigate_to de CatBot para las nuevas rutas
- **MENU-07**: Layout CatPower con tabs (Skills | Conectores | Templates) y ruta activa

### DB — Modelo de datos Templates

- **DB-01**: Tabla `email_templates` con: id, name, description, category, structure (JSON), html_preview, drive_folder_id, is_active, times_used, created_at, updated_at
- **DB-02**: Tabla `template_assets` con: id, template_id, filename, drive_file_id, drive_url, mime_type, width, height, created_at
- **DB-03**: Migracion en db.ts con seed de 1 template de ejemplo basico

### API — CRUD Templates

- **API-01**: GET /api/email-templates — lista templates con filtro por category y is_active
- **API-02**: POST /api/email-templates — crear template con name, description, category, structure
- **API-03**: GET /api/email-templates/[id] — detalle con structure completa y assets
- **API-04**: PATCH /api/email-templates/[id] — actualizar campos parciales
- **API-05**: DELETE /api/email-templates/[id] — borrar template y assets
- **API-06**: POST /api/email-templates/[id]/assets — upload imagen, devuelve URL
- **API-07**: POST /api/email-templates/[id]/render — renderiza HTML con variables de instrucciones

### EDITOR — Editor visual de templates

- **EDIT-01**: Pagina de lista /catpower/templates con cards de cada template (preview thumbnail, nombre, categoria, usos)
- **EDIT-02**: Pagina de edicion /catpower/templates/[id] con editor visual + preview
- **EDIT-03**: Estructura en 3 secciones editables: Cabecera, Cuerpo, Pie
- **EDIT-04**: Cada seccion acepta multiples bloques ordenables
- **EDIT-05**: Boton "Añadir bloque" en cada seccion con selector de tipo

### BLOQUES — Tipos de bloque

- **BLK-01**: Bloque tipo **Logo** — upload imagen, posicion: izquierda/centro/derecha, tamaño configurable
- **BLK-02**: Bloque tipo **Imagen** — upload o URL, posicion: izquierda/centro/ancho-completo, alt text
- **BLK-03**: Bloque tipo **Video** — URL de YouTube, se renderiza como thumbnail con link al video
- **BLK-04**: Bloque tipo **Texto** — editor con formato basico: negrita, cursiva, links, listas con viñetas
- **BLK-05**: Bloque tipo **Instruccion LLM** — textarea con placeholder visual (fondo diferente), el agente rellena en runtime
- **BLK-06**: Cada bloque tiene opciones de alineacion: izquierda, centro, derecha
- **BLK-07**: Drag-and-drop para reordenar bloques dentro de una seccion

### LAYOUT — Sistema de filas y columnas

- **LAY-01**: Cada seccion es una lista de **filas**
- **LAY-02**: Cada fila puede tener 1 o 2 columnas (elemento unico centrado, o dos lado a lado)
- **LAY-03**: Ejemplo: fila de cabecera con logo a la izquierda + banner a la derecha
- **LAY-04**: Ejemplo: fila de cuerpo con imagen a la izquierda + texto a la derecha
- **LAY-05**: Al añadir un bloque, opcion "Añadir al lado" para crear columna en la misma fila
- **LAY-06**: Drag-and-drop para mover bloques entre filas y cambiar orden de filas
- **LAY-07**: Responsive: en pantallas pequeñas las columnas apilan verticalmente

### STYLES — Configuracion visual

- **STY-01**: Color de fondo del email (default: blanco)
- **STY-02**: Color primario (para cabecera, bordes, acentos)
- **STY-03**: Fuente (selector: Arial, Helvetica, Georgia, Verdana — fuentes email-safe)
- **STY-04**: Color de texto principal
- **STY-05**: Ancho maximo del email (default: 600px — estandar email)
- **STY-06**: Panel de estilos en el editor (sidebar o seccion inferior)

### PREVIEW — Renderizado HTML

- **PRV-01**: Preview en tiempo real en panel lateral del editor
- **PRV-02**: HTML generado con table-based layout (compatibilidad email)
- **PRV-03**: Inline styles (no CSS externo — los clientes de email lo ignoran)
- **PRV-04**: Bloques de instruccion LLM se muestran con fondo diferente y texto del placeholder
- **PRV-05**: Boton "Copiar HTML" para uso manual
- **PRV-06**: Boton "Enviar test" para enviar preview a un email de prueba

### ASSETS — Gestion de imagenes y media

- **AST-01**: Upload de imagen desde el editor del bloque (drag o click)
- **AST-02**: Subida automatica a Drive en carpeta DoCatFlow/templates/{template-name}/
- **AST-03**: Obtener URL publica de Drive (configurar sharing: anyone with link)
- **AST-04**: Alternativa: pegar URL publica directamente (sin usar Drive)
- **AST-05**: Galeria de assets del template (ver todos los assets subidos)
- **AST-06**: Soporte para: PNG, JPG, GIF, SVG (imagenes), YouTube URLs (video)

### INT — Integracion con Canvas y Agentes

- [x] **INT-01**: Tool `list_email_templates` — devuelve nombre, descripcion, categoria de cada template activo
- [x] **INT-02**: Tool `get_email_template` — devuelve estructura completa con bloques e instrucciones
- [x] **INT-03**: Tool `render_email_template` — recibe template_id + variables (contenido de instrucciones), devuelve HTML final listo para enviar
- [x] **INT-04**: Nuevo conector tipo `email_template` que se puede vincular a CatPaws
- [x] **INT-05**: Skill seed "Maquetador de Email" — protocolo de seleccion inteligente de template segun contexto (quien envia, a quien, tipo de email)
- **INT-06**: Modificar execute-catpaw.ts para soportar conector email_template (cargar tools INT-01/02/03)
- **INT-07**: Test E2E: canvas envia email con template corporativo automaticamente

### SEED — Templates iniciales

- **SEED-01**: Template "Corporativa Educa360" — logo + banner cabecera + instruccion cuerpo + pie con firma y logo pequeno
- **SEED-02**: Template "Informe de Leads" — cabecera violeta + instruccion tabla datos + pie DoCatFlow
- **SEED-03**: Template "Respuesta Comercial" — logo sutil + instruccion cuerpo personalizado + CTA reunion + pie
- **SEED-04**: Template "Notificacion Interna" — minimalista, solo instruccion + pie basico

---

## Requisitos tecnicos transversales

- **TECH-01**: HTML email compatible con Gmail, Outlook y Apple Mail (table layout, inline styles)
- **TECH-02**: Imagenes con URLs publicas (Drive sharing o hosting externo)
- **TECH-03**: Drag-and-drop con @dnd-kit/core (ya en el proyecto para canvas nodes)
- **TECH-04**: Editor de texto basico con markdown-to-html o tiptap (evaluar peso)
- **TECH-05**: Responsive email: max-width 600px, columnas apilan en mobile
