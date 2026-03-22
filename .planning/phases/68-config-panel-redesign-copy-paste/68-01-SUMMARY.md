---
phase: 68-config-panel-redesign-copy-paste
plan: "01"
subsystem: canvas-config-panel
tags: [ui, refactor, sidebar, i18n]
dependency_graph:
  requires: []
  provides: [right-sidebar-panel, expanded-props-interface]
  affects: [canvas-editor-layout]
tech_stack:
  added: []
  patterns: [three-zone-sidebar, editable-name-input]
key_files:
  created: []
  modified:
    - app/src/components/canvas/node-config-panel.tsx
    - app/messages/es.json
    - app/messages/en.json
decisions:
  - Removed expandPanel/collapsePanel i18n keys since sidebar no longer collapses
  - Optional chaining on footer callbacks (onDuplicate?.(), onDelete?.()) for Plan 01 standalone compilation
metrics:
  duration: 129s
  completed: "2026-03-22T13:19:00Z"
---

# Phase 68 Plan 01: Panel Refactor to Right Sidebar Summary

Right sidebar (w-80, border-l) with three zones: fixed header with editable node name and type badge, scrollable form body, fixed footer with Duplicar/Delete buttons.

## What Was Done

### Task 1: Refactor NodeConfigPanel to right sidebar layout
- **Commit:** fbdc61a
- Replaced bottom panel (border-t, resizable height) with fixed-width right sidebar (w-80, border-l, h-full flex-col)
- Removed all resize logic: panelHeight, isDragging, startY, startHeight, handleMouseDown, mouseMove/mouseUp useEffect, MIN_PANEL_HEIGHT, DEFAULT_PANEL_HEIGHT constants
- Removed collapsed state and collapse toggle
- Removed unused imports: GripHorizontal, ChevronDown, ChevronUp, useCallback, useRef
- Added imports: X, Copy, Trash2
- Expanded props interface with optional onClose?, onDuplicate?, onDelete?, isExecuting?
- Added editable name state (editingName, nameValue) with sync on selectedNode change
- Header: type icon + type label + editable name + close (X) button
- Body: flex-1 overflow-y-auto (replaces maxHeight style)
- Footer: Duplicar button (Copy icon) + Delete button (Trash2 icon, red)
- Returns null when isExecuting is true or no selectedNode (PANEL-07)
- All 11 form renderers left completely unchanged

### Task 2: Add i18n keys for panel actions
- **Commit:** a9a4bde
- Added closePanel, clickToEditName, duplicate, delete keys to es.json and en.json
- Removed obsolete expandPanel and collapsePanel keys

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `npx tsc --noEmit` passes clean (no errors)
2. `w-80 border-l` confirmed in container className
3. No references to GripHorizontal, collapsed, panelHeight, isDragging, handleMouseDown, MIN_PANEL_HEIGHT, or DEFAULT_PANEL_HEIGHT remain
4. All 4 i18n keys confirmed present in both language files

## Self-Check: PASSED
