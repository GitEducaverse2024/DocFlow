# Phase 102: Layout Filas/Columnas + Drag-and-Drop

## Goal
Los bloques se organizan en filas de 1-2 columnas con drag-and-drop para reordenar. Un logo puede estar a la izquierda con un banner a la derecha en la misma fila.

## Requirements
LAY-01 to LAY-07, BLK-07

---

## Plan 01

### Task 1: Instalar @dnd-kit
Check if @dnd-kit/core and @dnd-kit/sortable are in package.json. If not, install.

### Task 2: Add "Añadir al lado" button to section-editor
When a row has 1 column, show a small "+" button on the right side to add a second column (side-by-side). Max 2 columns per row.

### Task 3: Refactor section-editor for row-based layout
Currently blocks render as a flat list. Refactor to show rows visually — each row as a horizontal container with its columns side by side. Use flex layout for 2-column rows.

### Task 4: Implement drag-and-drop for rows
Use @dnd-kit/sortable to make rows within a section sortable via drag. Each row gets a drag handle. Reordering updates structure.sections[section].rows array.

### Task 5: Implement drag-and-drop for blocks between columns
Allow dragging a block from one column to another (within the same row or across rows). When dragging to an empty spot, create a new row.

### Task 6: Visual feedback during drag
Show drop indicators (blue line) when dragging. Highlight drop zones. Dim the dragged item source location.

### Task 7: Responsive layout
2-column rows show side-by-side on desktop (>768px). On mobile, columns stack vertically.

### Task 8: Build + verify
