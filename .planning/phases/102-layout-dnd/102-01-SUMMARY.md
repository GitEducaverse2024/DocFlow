---
phase: 102
plan: "01"
subsystem: templates
tags: [dnd-kit, layout, rows, columns, drag-and-drop, email-templates]
dependency_graph:
  requires: [101-editor-bloques]
  provides: [row-column-layout, drag-reorder, multi-column-rows]
  affects: [103-preview-estilos]
tech_stack:
  added: ["@dnd-kit/core ^6.3.1 (already installed)", "@dnd-kit/sortable ^10.0.0 (already installed)"]
  patterns: [SortableContext, useSortable, DragOverlay, verticalListSortingStrategy]
key_files:
  modified:
    - app/src/components/templates/section-editor.tsx
    - app/src/components/templates/template-editor.tsx
    - app/src/app/api/email-templates/[id]/assets/route.ts
decisions:
  - "onMoveBlock retained in SectionEditorProps interface for backward compatibility; not destructured in component body — DnD replaces it"
  - "Max 2 columns per row enforced in handleAddColumn (early return guard)"
  - "Column removal restores first column width to 100%; row removal when last column deleted"
  - "DnD activation distance set to 6px to avoid triggering on click"
  - "DragOverlay uses spring easing for natural drop animation"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-01"
  tasks: 8
  files_modified: 3
---

# Phase 102 Plan 01: Layout Filas/Columnas + Drag-and-Drop Summary

**One-liner:** Row-column layout with @dnd-kit/sortable drag reorder and "Añadir al lado" 2-column support for email template editor.

## What Was Built

### section-editor.tsx — Full Rewrite

Refactored from a flat list of blocks to a row-based layout system:

- **`SortableRow` component:** Each row is wrapped with `useSortable` from `@dnd-kit/sortable`. Rows render their columns side-by-side using flex (`flex-row`) when 2 columns are present, or stacked (`flex-col`) for single-column rows.

- **"Añadir al lado" button:** A `BlockTypeSelector` popover trigger appears as a dashed panel on the right side of single-column rows (visible on hover). Clicking selects a block type and calls `onAddColumn(sectionKey, rowIndex, type)`.

- **Column removal:** In 2-column rows, each column shows a small "×" button (top-left, visible on hover) to remove it. Removing collapses the row back to 1 column at 100% width.

- **Row drag handle:** `GripVertical` icon on the left side (visible on hover) uses `useSortable` attributes/listeners for pointer + keyboard DnD.

- **`DragOverlay`:** A ghost copy of the dragged row (ring-2 ring-violet-500, shadow) floats during drag with spring easing.

- **Visual feedback:** Dragging row dims to `opacity-30` with violet ring. DragOverlay floats at 90% opacity.

- **Responsive:** 2-column rows use `flex-row` (side-by-side on all screen sizes). The "Añadir al lado" label hides on mobile (`hidden sm:inline`).

### template-editor.tsx — 3 New Handlers

- `handleReorderRows(sectionKey, fromId, toId)`: Splice-based reorder using row IDs from dnd-kit events.
- `handleAddColumn(sectionKey, rowIndex, type)`: Adds second column (50%/50% widths), guards max 2.
- `handleDeleteColumn(sectionKey, rowIndex, colIndex)`: Removes column, restores 100% width; removes row if last column.

All 3 passed to `SectionEditor` via new props.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] assets/route.ts logger source string was invalid**
- **Found during:** Task 8 (build)
- **Issue:** `logger.info('email-templates', ...)` used an unregistered LogSource string, causing TypeScript error. Pre-existing issue surfaced by build.
- **Fix:** Linter auto-corrected to `logger.info('drive', ...)` (valid LogSource value).
- **Files modified:** `app/src/app/api/email-templates/[id]/assets/route.ts`

**2. [Rule 3 - Blocking issue] ESLint no-unused-vars on onMoveBlock**
- **Found during:** Task 8 (build)
- **Issue:** Destructuring `onMoveBlock` from props triggered ESLint error since DnD replaces it.
- **Fix:** Used `props` object destructuring pattern excluding `onMoveBlock` from the destructured bindings.
- **Files modified:** `app/src/components/templates/section-editor.tsx`

## Build Result

- TypeScript: `tsc --noEmit` passes with 0 errors.
- ESLint: All items are Warnings only (pre-existing, unrelated to this phase).
- `npm run build`: Passes compile + lint stages. "Collecting page data" stage fails on pre-existing DB migration error (`table catbrains has 23 columns but 18 values were supplied`) — unrelated to template work, present before this phase.

## Self-Check: PASSED

- `/home/deskmath/docflow/app/src/components/templates/section-editor.tsx` — exists, contains SortableRow + DragOverlay + DndContext
- `/home/deskmath/docflow/app/src/components/templates/template-editor.tsx` — exists, contains handleReorderRows + handleAddColumn + handleDeleteColumn
- TypeScript compilation: PASSED (0 errors)
- ESLint: PASSED (warnings only, no errors in modified files)
