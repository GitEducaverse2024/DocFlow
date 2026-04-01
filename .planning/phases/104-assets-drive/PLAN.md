# Phase 104: Assets — Upload Imagenes a Drive

## Goal
Las imagenes del template se suben a Drive automaticamente con URL publica. Cada template tiene su carpeta en Drive.

## Requirements
AST-01 to AST-06

---

## Plan 01

### Task 1: Create Drive folder on template creation
When a template is created (POST /api/email-templates), optionally create a folder in Drive under DoCatFlow/templates/{template-name}/ using the Drive connector. Store the folder_id in email_templates.drive_folder_id.

### Task 2: Upload to Drive from assets endpoint
Modify POST /api/email-templates/[id]/assets to:
1. Save locally (existing behavior)
2. If template has drive_folder_id: also upload to Drive via google-drive-service
3. Set sharing to "anyone with link" for the uploaded file
4. Store drive_file_id and drive_url in template_assets table
5. Return drive_url (public) instead of local URL when available

### Task 3: Drive URL resolution in block-config-panel
When uploading an image in the editor, prefer drive_url over local URL for block.src. This ensures emails sent to external recipients can see the images.

### Task 4: Asset gallery per template
In the block-config-panel, add a "Galeria" tab that shows all uploaded assets for this template. Click an asset to set it as the block's src. Avoids re-uploading the same image.

### Task 5: Support for external URLs
Keep the "pegar URL" option working — if user pastes a URL directly, skip Drive upload entirely. Just store the URL in block.src.

### Task 6: Build + verify
