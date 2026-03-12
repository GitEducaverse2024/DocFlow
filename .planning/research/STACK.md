# Technology Stack — Canvas Visual Workflow Editor (v5.0)

**Project:** DoCatFlow — v5.0 Canvas Addition
**Researched:** 2026-03-12
**Scope:** NEW libraries only. Existing stack (Next.js 14, React 18, Tailwind, shadcn/ui, better-sqlite3, Qdrant, @dnd-kit, recharts) is validated and unchanged.

---

## New Dependencies Required

### Core Canvas Library

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@xyflow/react` | `^12.10.1` | Visual node/edge canvas editor | Industry-standard node-based UI library. v12 is the current major — the old `reactflow` package is deprecated in favor of `@xyflow/react`. Peer dep: React >=17, so React 18 is fully supported. v12 adds SSR/SSG support, dark mode, TSDoc. Actively maintained (released 2026-02-19). |

**Do NOT install `reactflow`** — it is the deprecated predecessor. `@xyflow/react` is the current package name.

### Auto-Layout

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@dagrejs/dagre` | `^2.0.4` | DAG auto-layout (top-to-bottom, left-to-right) | The old `dagre` package (v0.8.5, unmaintained 6+ years) is effectively deprecated. `@dagrejs/dagre` is the maintained fork under the dagrejs org, last published August 2024. React Flow's official dagre layout example explicitly imports from `@dagrejs/dagre`. Version 2.0.4 is current. |
| `@types/dagre` | `^0.7.54` | TypeScript types for dagre | The `@dagrejs/dagre` package does not bundle its own types. `@types/dagre` provides them and is actively updated (published 8 days before research date). |

**Do NOT install `dagre`** — use `@dagrejs/dagre`. **Do NOT install `@types/dagrejs__dagre`** — use `@types/dagre`.

### Thumbnail Generation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `html-to-image` | `1.11.11` (pinned) | Client-side PNG/SVG snapshot of canvas for thumbnail storage | Official React Flow docs pin this to `1.11.11` explicitly — later versions have a known open bug with image export. Generates a data URL from `.react-flow__viewport` DOM node. Store as data URL string in SQLite `thumbnail` column. No server-side process needed. |

**Version must be pinned to `1.11.11`** — do NOT use `^` or `latest`.

---

## Topological Sort — No New Library Needed

The project already executes sequential DAG pipelines in `task-engine.ts`. Topological sort for canvas DAG execution order is ~20 lines of standard Kahn's algorithm with a plain `Map` and `Set`. No additional npm package is justified for this. Implement inline in a `canvas-engine.ts` utility.

If a future need for a full graph library emerges, `graphology-dag` is the best option — but it is out of scope for v5.0.

---

## Zustand — Already Available via @xyflow/react

`@xyflow/react` ships with its own Zustand-based internal state. React Flow provides `useReactFlow()`, `useNodes()`, `useEdges()`, `useStore()` hooks for accessing and mutating canvas state. Do NOT install Zustand separately as a canvas state manager — React Flow's built-in store is sufficient for this use case.

---

## Full Installation Command

```bash
# Production dependencies
npm install @xyflow/react @dagrejs/dagre html-to-image@1.11.11

# Dev dependencies (TypeScript types)
npm install -D @types/dagre
```

---

## Integration Points with Existing Stack

### Next.js 14 App Router — Critical SSR Handling

React Flow uses browser APIs (`ResizeObserver`, DOM measurements) that are not available during SSR. The canvas component MUST be wrapped with `next/dynamic` and `ssr: false`. This cannot be done in a Server Component directly — use a Client Component wrapper:

```tsx
// app/canvas/canvas-wrapper.tsx  (client boundary wrapper)
'use client'
import dynamic from 'next/dynamic'

const CanvasEditor = dynamic(
  () => import('@/components/canvas/canvas-editor'),
  { ssr: false, loading: () => <div className="h-full animate-pulse bg-zinc-900" /> }
)

export default CanvasEditor
```

The canvas page (`/app/canvas/[id]/page.tsx`) imports `CanvasEditor` from this wrapper. The actual `canvas-editor.tsx` component also carries `'use client'` and uses React Flow hooks freely.

### Container Height — React Flow Requirement

React Flow requires a parent element with explicit dimensions. The constraint is already documented in PROJECT.md:

```tsx
<div className="h-[calc(100vh-64px)] w-full">
  <ReactFlow ... />
</div>
```

### CSS Import

The stylesheet must be imported once in the canvas editor component:

```tsx
import '@xyflow/react/dist/style.css'
```

Place this in the canvas editor component file, not in `globals.css`, to keep it scoped to the canvas route.

### Tailwind Theming Compatibility

`@xyflow/react/dist/style.css` ships with its own CSS variables. The project uses zinc-950 background and mauve primary color. Override React Flow's default colors via CSS in the canvas component scope:

```css
.react-flow {
  --xy-background-color: theme(colors.zinc.950);
  --xy-node-background-color: theme(colors.zinc.900);
  --xy-edge-stroke: theme(colors.violet.500);
}
```

### better-sqlite3 — Canvas Schema

Canvas data (nodes, edges, metadata, thumbnail data URL) stores in SQLite via `better-sqlite3`. No new database infrastructure required. Add `canvases` and `canvas_executions` tables in the existing `db.ts` schema init block.

### @dnd-kit Coexistence

`@dnd-kit` (already installed for the Task wizard) and `@xyflow/react` both handle pointer events on canvas elements. They do NOT conflict because the canvas editor lives on its own route (`/canvas/[id]`) separate from the Task wizard. No interoperability shim needed.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Canvas library | `@xyflow/react` | `reactflow` (old) | Deprecated, redirects to @xyflow/react |
| Canvas library | `@xyflow/react` | `Rete.js` | Smaller ecosystem, less React-native |
| Canvas library | `@xyflow/react` | `nodered-react` | Not a standalone lib, Node-RED specific |
| Layout | `@dagrejs/dagre` | `elkjs` | ELK is more powerful but heavier (~500KB), overkill for simple TB/LR layouts |
| Layout | `@dagrejs/dagre` | `d3-hierarchy` | Only for tree structures, not general DAGs |
| Toposort | inline Kahn's | `toposort` npm | 0 benefit over 20 lines of code; avoids dep |
| Thumbnail | `html-to-image@1.11.11` | Puppeteer server-side | Puppeteer adds massive overhead to a single-process Docker deployment; client-side is simpler and sufficient |
| Thumbnail | `html-to-image@1.11.11` | `dom-to-svg` | Less community adoption, no official React Flow example |
| Thumbnail | `html-to-image@1.11.11` | React Flow MiniMap | MiniMap is interactive UI, not storable thumbnail |

---

## Confidence Assessment

| Claim | Confidence | Source |
|-------|------------|--------|
| `@xyflow/react` is the current package name (not `reactflow`) | HIGH | npmjs.com search results, React Flow docs |
| Latest version is 12.10.1 | HIGH | WebSearch npmjs result (published 2026-02-19) |
| React 18 peer dep satisfied (requires >=17) | HIGH | Official React Flow installation docs |
| `@dagrejs/dagre` is the maintained fork | HIGH | Official React Flow dagre example imports from `@dagrejs/dagre` |
| `@dagrejs/dagre` version 2.0.4 | MEDIUM | WebSearch result (npmjs, last published Aug 2024) |
| `@types/dagre` needed separately | HIGH | `@dagrejs/dagre` does not ship own types, confirmed by React Flow examples using `@types/dagre` |
| `html-to-image` must be pinned to 1.11.11 | HIGH | Official React Flow example docs: "The version of the html-to-image package used in this example, has been locked to 1.11.11, which is the latest working version" |
| Next.js `dynamic` + `ssr: false` required | HIGH | React Flow uses browser APIs (ResizeObserver) not available in Node SSR |
| Topological sort — no library needed | HIGH | Standard algorithm, < 20 lines, already have task-engine.ts as reference |

---

## Sources

- React Flow installation requirements: https://reactflow.dev/learn/getting-started/installation-and-requirements
- React Flow dagre layout example: https://reactflow.dev/examples/layout/dagre
- React Flow download image example: https://reactflow.dev/examples/misc/download-image
- React Flow SSR/SSG configuration: https://reactflow.dev/learn/advanced-use/ssr-ssg-configuration
- React Flow v12.10.0 changelog: https://reactflow.dev/whats-new/2025-12-04
- @xyflow/react on npm: https://www.npmjs.com/package/@xyflow/react
- @dagrejs/dagre on npm: https://www.npmjs.com/package/@dagrejs/dagre
- dagre deprecation note: https://github.com/dagrejs/dagre/issues/469
- html-to-image on npm: https://www.npmjs.com/package/html-to-image
- React Flow example apps (Next.js): https://github.com/xyflow/react-flow-example-apps
- React Flow server-side image creation: https://reactflow.dev/examples/misc/server-side-image-creation
