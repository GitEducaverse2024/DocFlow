# Feature Landscape: Canvas Visual Workflow Editor

**Domain:** Visual node-based workflow / pipeline editor (React Flow-based, DAG execution)
**Researched:** 2026-03-12
**Project:** DoCatFlow v5.0 — Canvas Visual de Workflows

---

## Context

This milestone adds a visual canvas editor to an existing system that already has:
- Multi-agent tasks with sequential pipeline execution (task-engine.ts)
- 4-step drag-and-drop task wizard (@dnd-kit)
- Connectors (n8n_webhook, http_api, mcp_server, email) with CRUD + logs
- Agents (custom_agents + OpenClaw) with CRUD
- Projects (RAG pipelines) with full lifecycle
- Usage tracking, CatBot AI assistant, settings management

The canvas is a new visual surface to design and execute pipelines by dragging nodes and connecting them — replacing the linear wizard UX with a spatial, graph-based one. React Flow (xyflow) is the chosen library.

---

## Table Stakes

Features users expect when they see "visual workflow editor." Missing any of these makes the product feel incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Infinite canvas with pan + zoom | Every canvas tool has this. Users expect spatial freedom | Low | React Flow provides out-of-the-box |
| Drag-and-drop nodes from a sidebar palette | Standard node addition pattern — seen in n8n, Retool, Figma | Low | React Flow drag-from-sidebar example covers this |
| Node connection by dragging handle to handle | Core graph editing gesture — bezier curves by default | Low | React Flow built-in; add connection validation |
| Delete nodes and edges (Backspace / Delete key) | Default React Flow behavior; users expect it immediately | Low | React Flow sensible default |
| Node selection (click + box-select) | Required for multi-node ops (move, delete, copy) | Low | React Flow built-in |
| Auto-layout (dagre) | Users need "tidy up" after adding nodes chaotically | Low | dagre already in PROJECT.md; single button action |
| Fit-to-view button | Required after navigating away or loading a canvas | Low | React Flow Controls component |
| Zoom in/out controls panel | Users expect UI controls, not just scroll wheel | Low | React Flow Controls component |
| Minimap | Orientation aid on large canvases; n8n, Figma, AWS Step Functions all have it | Low | React Flow MiniMap component |
| Grid background (dots pattern) | Visual reference for alignment; dots preferred over lines for workflow tools | Low | React Flow Background component, variant="dots" |
| Node status indicators during execution | Color/icon overlay showing running / success / error / waiting states | Medium | n8n uses CSS class variants + overlay icons; adapt this |
| Animated edges during execution | Moving dashes on active connections — signals data flow visually | Low | React Flow animated: true on edge |
| Undo/Redo (Ctrl+Z / Ctrl+Shift+Z) | Any editing tool needs undo; forgetting a delete is extremely frustrating | Medium | useUndoRedo hook (snapshot-based approach) |
| Copy/Paste nodes (Ctrl+C / Ctrl+V) | Expected from any desktop-class editor | Medium | React Flow copy-paste example — needs clipboard serialization |
| Canvas list page with thumbnails | Users need to manage multiple canvases at a glance | Medium | SVG thumbnail from node positions; auto-generated |
| CRUD for canvases (create, rename, delete) | Fundamental content management | Low | New DB table + API endpoints |
| Auto-save with debounce | Users do not manually save; loss of work is a critical failure | Medium | debounce 3s, PROJECT.md already calls this out |
| Canvas creation wizard (2-step) | Consistent with task wizard pattern already in product | Low | Step 1: choose mode, Step 2: name + description |
| Read-only mode (during execution) | Prevent edits mid-run; n8n gates edits when workflow is active | Low | Disable drag/connect while executionState !== 'idle' |
| Empty canvas state (first-run prompt) | Blank canvas is disorienting without guidance | Low | Overlay with "Arrastra nodos para empezar" + palette highlight |

---

## Differentiators

Features that go beyond table stakes and add real value for this specific product. Not expected, but memorable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 8 specialized node types (START, AGENT, PROJECT, CONNECTOR, CHECKPOINT, MERGE, CONDITION, OUTPUT) | Matches exactly the mental model of DoCatFlow's existing entities — users see familiar concepts on the canvas | High | Each node type needs a custom React component with correct handles, icon, config fields |
| 3 canvas modes (agent flow, project flow, mixed) | Filter palette and connection rules per mode — reduces cognitive overload on first use | Medium | Mode stored on canvas record; affects node type visibility in palette |
| Execution checkpoint UI (interactive pause) | When CHECKPOINT node is reached, execution pauses and user is prompted for input/approval — matches existing task-engine.ts checkpoint pattern | High | Re-use checkpoint logic from task-engine.ts adapted for DAG context |
| MERGE node that combines outputs from multiple branches | Enables fan-in patterns — multiple agents feeding a synthesis step | Medium | Collect outputs from all incoming edges; pass as combined context |
| CONDITION node with true/false branch routing | Adds conditional logic without code — routes execution based on agent output evaluation | High | Requires condition expression or predefined templates (contains/not-empty/equals) |
| Predefined templates (4 seed canvases) | Removes blank-canvas anxiety; users can remix existing flows instead of building from scratch | Medium | Propuesta comercial, Doc técnica, Research+síntesis, Pipeline+conector |
| CatBot create_canvas tool integration | CatBot can scaffold canvases from natural language — "crea un canvas de investigación" | Medium | Adds to existing CATBOT tool set; POST /api/canvas |
| Per-node execution log viewer | Click a node after execution to see its LLM output, token count, duration — not just pass/fail | Medium | Store per-step results in canvas execution record; render in node detail panel |
| SVG thumbnail auto-generation for canvas cards | Visual preview at a glance without opening the canvas | Medium | Render node positions as simplified SVG shapes; store in DB |
| Topological sort preview (execution order badge) | Show users in what order nodes will execute before they hit "run" — reduces surprises | Low | Compute topoSort on save; render small order number badge on each node |

---

## Anti-Features

Features to explicitly NOT build for v5.0. Each has a reason and an alternative.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Parallel branch execution | Increases execution complexity massively — race conditions, merge timing, partial state. Out-of-scope per PROJECT.md | Sequential topological order only; MERGE collects results from prior sequential steps |
| Loop / cycle detection at runtime | Cycles in a DAG break topological sort; infinite loops risk OOM. Out-of-scope per PROJECT.md | Validate DAG-only at save time; block edge creation that would form a cycle |
| Real-time WebSocket execution updates | Architecture decision: polling is sufficient, WS adds infra complexity. Out-of-scope per PROJECT.md | 2-second polling interval (matches task execution view) |
| Canvas collaboration / multi-user | Internal single-user tool; adds sync complexity with zero user benefit | None needed |
| Free-form annotation / sticky notes on canvas | Scope creep for v5.0 — workflow editor, not whiteboard | Use node description fields for documentation |
| Canvas version history / branching | High complexity, low immediate value | Single latest version; rely on undo/redo for recovery |
| Importing n8n JSON workflow format | Different schema, different node semantics — misleading compatibility illusion | Templates serve the same starting-point need |
| Variable passing UI (explicit named wires) | Complex schema design; hard to implement without full type system | Context is passed sequentially between steps — implicit chain |
| Scheduling / cron triggers | Out-of-scope per PROJECT.md | Manual execution only |
| Marketplace / sharing canvases | Not needed for single-user internal tool | Seed templates cover common patterns |

---

## Feature Dependencies

Relationships between features that constrain build order.

```
DB schema (canvases, canvas_executions tables)
  → Canvas CRUD API
    → Canvas list page (needs API)
    → Canvas editor page (needs API)
      → React Flow canvas component (needs page)
        → Node palette sidebar (needs canvas)
        → Custom node components (needs canvas)
          → Execution state overlays (needs node components)
        → Edge types + connection validation (needs canvas)
        → Auto-layout (dagre) (needs canvas + nodes)
        → Undo/redo (needs canvas)
        → Copy/paste (needs canvas)
        → Auto-save (needs canvas + CRUD API)
          → SVG thumbnail generation (needs auto-save)
  → Canvas execution API (needs DB schema)
    → Topological sort executor (needs API)
      → Checkpoint pause/resume (needs executor)
      → Per-node execution logs (needs executor)
      → Animated edge execution state (needs executor)

3 canvas modes → Node palette filtering (per mode)
Templates → Canvas CRUD API (templates are pre-built canvases seeded to DB)
CatBot canvas tool → Canvas CRUD API
```

**Critical path:** DB schema → CRUD API → editor page → custom nodes → execution engine

---

## MVP Recommendation

For v5.0, prioritize features in this order:

### Phase 1 — Data Model + CRUD API
1. DB schema: `canvases`, `canvas_steps`, `canvas_executions` tables
2. Full CRUD API (list, create, get, update, delete, execute)
3. Canvas list page with SVG thumbnail + create wizard

### Phase 2 — Canvas Editor (static)
4. React Flow canvas with Background (dots), Controls, MiniMap
5. Custom node components: START, AGENT, PROJECT, CONNECTOR, CHECKPOINT, MERGE, CONDITION, OUTPUT
6. Node palette sidebar with drag-to-canvas
7. Connection validation (mode-appropriate edge rules)
8. Auto-layout (dagre) + fit-to-view
9. Undo/redo + copy/paste + keyboard shortcuts
10. Auto-save (3s debounce)

### Phase 3 — Execution Engine
11. Topological sort DAG executor (adapted from task-engine.ts)
12. Per-node execution state (running / success / error / waiting)
13. Animated edges during execution
14. Checkpoint interactive pause/resume
15. Per-node log viewer (post-execution)
16. Read-only mode during execution

### Phase 4 — Polish + Templates
17. 4 seed templates
18. Topological sort order badges (pre-run preview)
19. 3 canvas modes with palette filtering
20. CatBot tool integration (create_canvas)

**Defer:** Free-form annotations, canvas version history, import/export from other tools

---

## Interaction Patterns (Expected User Behaviors)

Understanding what users will attempt on first contact — critical for getting the UX right.

| User Action | Expected Behavior | Common Failure Mode |
|-------------|-------------------|---------------------|
| Opens canvas editor for first time | Sees blank canvas with palette on left, "empty state" prompt | Completely empty screen with no affordances → user confused |
| Drags node from palette to canvas | Node appears at drop position, selected, ready to rename | Nothing visible happens, or node appears but unselected |
| Clicks node | Node becomes selected with handles visible, config sidebar opens | No feedback; user double-clicks trying to open config |
| Drags from output handle to input handle | Bezier edge draws live during drag; snaps when released on valid target | Edge disappears; or connects to invalid target types |
| Tries to connect node to itself | Should reject (cycle of 1) | Silent accept → breaks DAG constraint |
| Right-clicks canvas background | Context menu: "Add node", "Tidy up", "Fit to view" | Nothing → user learns no right-click exists |
| Right-clicks node | Context menu: "Duplicate", "Delete", "View logs" | Nothing |
| Presses Ctrl+Z after deleting a node | Node reappears with its connections | Action is irreversible → user loses work |
| Clicks "Run" button | All nodes switch to waiting state; START node activates first; execution proceeds in topo order | Execution runs with no visual feedback |
| Execution reaches CHECKPOINT node | Canvas pauses; CHECKPOINT node pulses; modal appears for user input | No pause, pipeline continues without human review |
| Canvas grows large | Minimap shows current viewport position; user can drag minimap to navigate | Minimap does not respond to clicks/drags |
| Presses Ctrl+A | Selects all nodes and edges | Only selects nodes, not edges; or does nothing |
| Closes tab without saving | Auto-save fires on 3s debounce; last state is recovered on reopen | Blank canvas on reopen |

---

## Sources

- React Flow official docs — reactflow.dev (HIGH confidence, authoritative)
  - Built-in components: https://reactflow.dev/learn/concepts/built-in-components
  - Layouting: https://reactflow.dev/learn/layouting/layouting
  - Undo/Redo example: https://reactflow.dev/examples/interaction/undo-redo
  - Copy/Paste example: https://reactflow.dev/examples/interaction/copy-paste
  - Edge types: https://reactflow.dev/examples/edges/edge-types
  - Drag and Drop: https://reactflow.dev/examples/interaction/drag-and-drop
- n8n canvas internals — DeepWiki analysis: https://deepwiki.com/n8n-io/n8n/6.2-workflow-canvas-and-node-management (MEDIUM confidence)
- n8n Keyboard Shortcuts: https://docs.n8n.io/keyboard-shortcuts/ (MEDIUM confidence)
- xyflow awesome-node-based-uis curated list: https://github.com/xyflow/awesome-node-based-uis (MEDIUM confidence)
- Velt React Flow guide Nov 2025: https://velt.dev/blog/react-flow-guide-advanced-node-based-ui (MEDIUM confidence)
- Pinpoint Engineering React Flow auto-layout guide: https://medium.com/pinpoint-engineering/part-2-building-a-workflow-editor-with-react-flow-a-guide-to-auto-layout-and-complex-node-1aadae67a3a5 (MEDIUM confidence)
- PROJECT.md constraints (out-of-scope decisions): LOCAL — authoritative for this project
