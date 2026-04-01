# Sesion 31 — CatPower Templates: Bugfixes, CatBot CRUD, Drive Assets, send_email HTML

**Fecha:** 2026-04-01
**Estado:** COMPLETADO

---

## Resumen

Sesion de estabilizacion y expansion del modulo Email Templates (CatPower). Incluye: correccion de bugs criticos en UI (popover, colores, i18n), integracion completa de CatBot con CRUD de templates, solucion del envio de emails con HTML renderizado, y resolucion automatica de assets locales a URLs publicas de Drive.

---

## Bloque 1 — Bugfixes UI Templates

### Popover "Anadir bloque" no abria
- **Causa:** `Button` de shadcn usa `@base-ui/react/button` que no forwardea refs correctamente para Radix `PopoverTrigger asChild`.
- **Fix:** Wrapper `<div>` nativo en `BlockTypeSelector`, estado controlado con `useState`, cierre automatico al seleccionar tipo.
- **Archivo:** `app/src/components/templates/block-type-selector.tsx`

### Panel derecho vacio sin opciones
- **Causa:** Cuando no habia bloque seleccionado, solo mostraba texto "Anadir bloque" sin opciones.
- **Fix:** Ahora muestra los 5 tipos de bloque como botones clickables que añaden al body directamente.
- **Archivo:** `app/src/components/templates/template-editor.tsx`

### Boton eliminar plantilla inexistente
- **Fix:** Añadido icono Trash2 en cada card de la lista, con `confirm()` + `DELETE /api/email-templates/{id}`.
- **i18n:** Claves `templates.delete` y `templates.deleteConfirm` en es.json + en.json.
- **Archivo:** `app/src/app/catpower/templates/page.tsx`

---

## Bloque 2 — Error pagina Conectores

### TypeError: Cannot read 'border' of undefined
- **Causa:** Phase 105 añadio `email_template` como tipo de conector en `TYPE_CONFIG` pero no en `typeColors`.
- **Fix:** Añadido `email_template: { bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-400', border: 'border-fuchsia-500/20' }` + fallback `|| typeColors.n8n_webhook` en 2 accesos sin proteccion.
- **Archivo:** `app/src/app/catpower/connectors/page.tsx`

### MISSING_MESSAGE i18n para email_template
- **Fix:** Añadidas claves `connectors.types.email_template.label` y `.description` en es.json y en.json.

### Test conector "Unknown connector type: email_template"
- **Causa:** Faltaba case en 2 endpoints de test:
  - `/api/connectors/[id]/test/route.ts` (pagina conectores)
  - `/api/catbrains/[id]/connectors/[connId]/test/route.ts` (panel CatBrain)
- **Fix:** Añadidos cases para `email_template`, `gmail` y `google_drive` en ambos endpoints.

### Type error: CatBrainConnector missing gmail/google_drive
- **Fix:** Añadidos `gmail` | `google_drive` al union type de `CatBrainConnector.type` en `types.ts`.
- **Fix complementario:** Añadidos `gmail` y `google_drive` a `TYPE_CONFIG` en `connectors-panel.tsx`.

---

## Bloque 3 — CatBot: 6 herramientas CRUD de Templates

### Nuevas tools en catbot-tools.ts

| Tool | Descripcion |
|------|-------------|
| `list_email_templates` | Lista plantillas con filtro por categoria |
| `get_email_template` | Detalle completo: estructura, bloques, variables instruction, assets |
| `create_email_template` | Crea plantilla nueva con estructura opcional |
| `update_email_template` | Edita nombre, descripcion, categoria, estructura, activo/inactivo |
| `delete_email_template` | Elimina plantilla (con confirmacion previa) |
| `render_email_template` | Renderiza HTML final con variables rellenas + resolucion automatica de assets |

### Permisos
- `list/get/render` — siempre disponibles (read-only)
- `create/update/delete` — disponibles por defecto o con `manage_templates` en allowedActions

### Feature Knowledge
- Añadidos entries `templates` y `catpower` en `FEATURE_KNOWLEDGE` para `explain_feature`.

---

## Bloque 4 — send_email con soporte HTML

### Problema
CatBot renderizaba el template correctamente pero al enviarlo usaba `text_body` (texto plano), haciendo que el destinatario viera codigo HTML raw.

### Fix
- **Tool definition:** Añadido parametro `html_body` (HTML del template) y `cc` al tool `send_email`.
- **Handler:** Construye payload con `html_body` si esta presente. El pipeline `invoke → parseOutputToPayload → sendEmail → nodemailer` ya soportaba `html_body`, solo faltaba el puente en catbot-tools.
- **Archivo:** `app/src/lib/services/catbot-tools.ts`

---

## Bloque 5 — Resolucion automatica de assets a Drive

### Problema
Las imagenes subidas al editor se guardaban solo localmente (`/api/email-templates/.../assets/...`). Estas URLs no son accesibles desde Gmail porque el servidor es interno.

### Solucion: resolveAssetsForEmail()

Nuevo servicio `app/src/lib/services/template-asset-resolver.ts` que:

1. Detecta assets sin `drive_url` (locales)
2. Crea carpeta en Drive: `DoCatFlow/templates/{templateId}/` (incluso sin `root_folder_id` — usa Drive root)
3. Sube cada imagen y la pone publica (`anyone with link = reader`)
4. Actualiza la DB con `drive_url` y `drive_file_id`
5. Reemplaza URLs locales en la estructura antes de renderizar

### Integracion en todos los caminos de render
- `catbot-tools.ts` → `render_email_template`
- `/api/email-templates/[id]/render` → endpoint REST
- `catpaw-email-template-executor.ts` → CatPaw tools
- `canvas-executor.ts` → Canvas workflow

### URL de Drive: formato correcto para imagenes
- **Antes:** `https://drive.google.com/uc?id={ID}&export=view` — Google transcodifica a JPG, pierde transparencia de webp/png
- **Despues:** `https://lh3.googleusercontent.com/d/{ID}` — sirve el archivo original sin conversion

---

## Bloque 6 — Skill "Maquetador de Email" actualizada

### Contenido ampliado
- Documentacion de las 6 herramientas CRUD (no solo las 3 de lectura)
- Protocolo de creacion de templates (estructura, secciones, bloques, tipos)
- Ejemplo de estructura JSON completo
- Protocolo de uso completo: analizar → listar → seleccionar → rellenar → renderizar → enviar
- Reglas de contenido y matching exacto de variables

### Auto-actualizacion
- El seed en `db.ts` ahora detecta si el skill existente no tiene `create_email_template` en sus instrucciones y lo actualiza automaticamente.

---

## Resumen de archivos modificados (codigo)

| Archivo | Cambio |
|---------|--------|
| `app/src/components/templates/block-type-selector.tsx` | Fix popover: wrapper div + estado controlado + cierre al seleccionar |
| `app/src/components/templates/template-editor.tsx` | Panel derecho: 5 tipos de bloque cuando no hay seleccion |
| `app/src/app/catpower/templates/page.tsx` | Boton eliminar plantilla en cards |
| `app/src/app/catpower/connectors/page.tsx` | typeColors email_template + fallbacks |
| `app/src/components/catbrains/connectors-panel.tsx` | TYPE_CONFIG: gmail + google_drive entries |
| `app/src/lib/types.ts` | CatBrainConnector.type: +gmail +google_drive |
| `app/src/app/api/connectors/[id]/test/route.ts` | Case email_template en test |
| `app/src/app/api/catbrains/[id]/connectors/[connId]/test/route.ts` | Cases gmail, google_drive, email_template |
| `app/src/lib/services/catbot-tools.ts` | 6 tools CRUD templates + send_email html_body + feature knowledge |
| `app/src/lib/services/template-asset-resolver.ts` | **NUEVO** — resolucion automatica de assets locales a Drive |
| `app/src/app/api/email-templates/[id]/render/route.ts` | Integracion resolveAssetsForEmail |
| `app/src/app/api/email-templates/[id]/assets/route.ts` | URL Drive: lh3.googleusercontent.com |
| `app/src/lib/services/catpaw-email-template-executor.ts` | Integracion resolveAssetsForEmail |
| `app/src/lib/services/canvas-executor.ts` | Integracion resolveAssetsForEmail |
| `app/src/lib/db.ts` | Skill maquetador-email: instrucciones CRUD + auto-update |
| `app/messages/es.json` | i18n: templates.delete, types.email_template |
| `app/messages/en.json` | i18n: templates.delete, types.email_template |

---

## Tips y lecciones aprendidas

### Radix Popover + Base UI Button
`@base-ui/react/button` no forwardea refs correctamente para Radix `asChild`. Solucion: wrapper `<div>` nativo como trigger, o usar estado controlado con `open/onOpenChange`.

### Drive URLs para emails
`drive.google.com/uc?id=...&export=view` transcodifica imagenes a JPG (pierde transparencia webp/png). Usar `lh3.googleusercontent.com/d/{ID}` que sirve el archivo original.

### Assets locales no funcionan en emails
URLs tipo `/api/email-templates/.../assets/...` solo funcionan dentro de DoCatFlow. Para emails externos, las imagenes DEBEN estar en Drive con URL publica. El `resolveAssetsForEmail()` lo hace automaticamente al renderizar.

### send_email necesita html_body
El tool `send_email` de CatBot solo tenia `body` (texto plano). Para emails con plantilla, hay que usar `html_body` que pasa por el pipeline `invoke → parseOutputToPayload → sendEmail(config, payload)` donde nodemailer usa `html:` en vez de `text:`.

### Conector Drive sin root_folder_id
El conector Educa360Drive usa OAuth2 pero no tenia `root_folder_id` configurado. `resolveAssetsForEmail()` maneja esto creando carpetas desde la raiz de Drive (`'root'`).

### TypeScript Record strictness
Si usas `Record<Type['field'], Info>` y añades valores al union type, TODOS los archivos que usan ese Record deben tener entradas para los nuevos valores. Buscar con grep antes de añadir.

---

## Metricas de la sesion

- **Bugs corregidos:** 6 (popover, typeColors, i18n, test endpoint x2, type union)
- **Tools nuevas CatBot:** 6 (CRUD templates)
- **Tools mejoradas:** 1 (send_email + html_body)
- **Servicios nuevos:** 1 (template-asset-resolver.ts)
- **Archivos modificados:** 17
- **Build verificado:** Si (webpack, Turbopack tiene bug no relacionado)
