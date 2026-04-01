# Phase 103: Preview HTML + Panel de Estilos

## Goal
El editor muestra preview HTML en tiempo real en panel lateral. El HTML generado es compatible con clientes de email (table layout, inline styles).

## Requirements
STY-01 to STY-06, PRV-01 to PRV-06

---

## Plan 01

### Task 1: Add preview panel to template editor
Add a toggle button "Preview" in the editor toolbar. When active, shows a third panel (or replaces the config panel) with the rendered HTML preview using an iframe or dangerouslySetInnerHTML in a constrained container.

### Task 2: Real-time preview updates
Call renderTemplate() from template-renderer.ts on every structure change (debounced 500ms). Display the resulting HTML in the preview panel. Instructions show as styled placeholders.

### Task 3: Styles configuration panel
Add a "Estilos" section in the right panel (below block config or as a tab):
- Color de fondo (color picker or hex input)
- Color primario (color picker)
- Color de texto (color picker)
- Fuente (select: Arial, Helvetica, Georgia, Verdana)
- Ancho maximo (number input, default 600)

Changes update structure.styles and trigger preview refresh.

### Task 4: Color picker component
Simple color input using native HTML <input type="color"> with hex text display. No need for a full color picker library.

### Task 5: "Copy HTML" button
Button in preview panel that copies the rendered HTML to clipboard. Use navigator.clipboard.writeText(). Show toast "HTML copiado".

### Task 6: "Send test" button
Button that opens a small modal asking for email address. POSTs to a new endpoint or reuses gmail_send_email via the API. Sends the rendered HTML as a test email.

### Task 7: Build + verify
