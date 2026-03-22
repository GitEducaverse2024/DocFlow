# Phase 68 Research: Config Panel Redesign + Copy/Paste

## Current Architecture

### Layout Structure (canvas-editor.tsx)
```
<div className="flex flex-col h-screen bg-zinc-950">
  <CanvasToolbar />
  <div className="flex flex-1 overflow-hidden min-h-0">
    <NodePalette />                    /* Left: 80px vertical icon palette */
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0">
        <ReactFlow />                  /* Main canvas */
      </div>
      {showResult ?
        <ExecutionResult />            /* BOTTOM: Execution results panel */
      :
        <NodeConfigPanel />            /* BOTTOM: Config panel (currently) */
      }
    </div>
  </div>
</div>
```

### Key Files
| File | Role |
|------|------|
| `app/src/components/canvas/canvas-editor.tsx` | Main editor component, layout, state management |
| `app/src/components/canvas/node-config-panel.tsx` | Config panel with all 11 node type forms |
| `app/src/components/canvas/execution-result.tsx` | Bottom execution result panel (UNCHANGED) |
| `app/src/components/canvas/node-palette.tsx` | Left sidebar node palette |
| `app/src/components/canvas/canvas-toolbar.tsx` | Top toolbar |
| `app/src/app/canvas/[id]/page.tsx` | Page route |

### Node Config Panel (node-config-panel.tsx)
- **Container:** `bg-zinc-900 border-t border-zinc-800 shadow-lg z-20 shrink-0`
- **Resize handle:** Draggable `ns-resize` on top edge
- **Header:** Icon, label, collapse button
- **Body:** `overflow-y-auto` with `maxHeight: {panelHeight}px`
- **Height state:** MIN=80, DEFAULT=220, tracked in `panelHeight`
- **11 render functions:** renderStartForm, renderAgentForm, renderCatBrainForm, renderConnectorForm, renderCheckpointForm, renderMergeForm, renderConditionForm, renderOutputForm, renderSchedulerForm, renderStorageForm, renderMultiAgentForm

### Node Selection State (canvas-editor.tsx)
```typescript
const [selectedNode, setSelectedNode] = useState<Node | null>(null);
const onNodeClick = (_: React.MouseEvent, node: Node) => setSelectedNode(node);
const onPaneClick = () => setSelectedNode(null);
```

Panel visibility: shows NodeConfigPanel when `selectedNode !== null && !showResult`

### Execution Result Panel (execution-result.tsx)
- **Container:** `border-t border-zinc-800 bg-zinc-900 transition-all duration-200`
- **Resize handle:** Same `ns-resize` pattern
- **Layout:** Output (70%) + Stats sidebar (30%) + Action buttons
- **Height:** MIN=80, DEFAULT=320
- **MUST REMAIN UNCHANGED at bottom**

### Props Interface (NodeConfigPanel)
- `selectedNode: Node | null`
- `onNodeDataUpdate: (nodeId, newData) => void`
- `canvasId: string`
- Other: agents, catbrains, connectors lists for selectors

### Auto-save Pattern
`handleNodeDataUpdate` → updates node in ReactFlow → `scheduleAutoSave()` → PATCH /api/canvas/{id}

## Requirements Analysis

### PANEL-01 to PANEL-09: Right Sidebar Panel
1. Fixed right sidebar w-80 (320px) instead of bottom flex child
2. Slide in/out with translate-x transition
3. Canvas compresses width (pr-80) when open
4. Fixed header: editable name, type indicator, close button
5. Scrollable body for long configs
6. Fixed footer: "Duplicar" + delete buttons
7. No open during execution (read-only)
8. Click empty canvas closes panel
9. Execution result panel (bottom) unchanged

### CP-01 to CP-03: Copy/Paste
1. Ctrl+C copies selected node(s) with toast
2. Ctrl+V pastes with 60px offset and toast
3. Shortcuts skip input/textarea/select elements

## Implementation Strategy

### Plan 68-01: Config Panel → Right Sidebar
- Restructure canvas-editor.tsx layout: inner flex column → flex row with ReactFlow + sidebar
- Rewrite node-config-panel.tsx container: bottom → right sidebar w-80, border-l, translate-x
- Add fixed header (editable name input, type badge, X close)
- Add fixed footer (Duplicar + Delete buttons)
- Remove ns-resize drag handle (fixed w-80 sidebar, no resizing needed)
- Body becomes flex-1 overflow-y-auto (fills between header/footer)
- Panel does not open when execution is running

### Plan 68-02: Canvas Layout Adjustment
- Canvas container adds `pr-80` or dynamic padding/margin when panel is open
- Transition on canvas width change for smooth animation
- ExecutionResult panel stays as bottom child within the canvas column
- Ensure ReactFlow fitView/resize on panel open/close

### Plan 68-03: Copy/Paste
- useEffect keyboard listener for Ctrl+C/Ctrl+V
- Guard: skip if activeElement is input/textarea/select
- Ctrl+C: serialize selected node(s) to clipboard state (useRef or useState)
- Ctrl+V: deserialize, create new nodes with offset +60px, new IDs
- Toast notifications for both actions
- Handle edges: if multiple nodes copied, preserve internal edges

## Dependencies
- Phases 65-67 complete (scheduler, storage, multiagent nodes exist)
- All 11 node types have config forms in node-config-panel.tsx

## Risks
- ReactFlow fitView may need explicit trigger on sidebar toggle
- Form width reduction (from flexible bottom to fixed 320px) may need form layout adjustments
- Multi-node selection not currently implemented (may need for copy/paste)
