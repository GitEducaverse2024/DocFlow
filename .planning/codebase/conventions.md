# Coding Conventions

**Analysis Date:** 2026-03-11

## Naming Patterns

**Files:**
- Components: kebab-case (`source-manager.tsx`, `chat-panel.tsx`, `pipeline-nav.tsx`)
- Pages: `page.tsx` inside App Router directories (`app/projects/[id]/page.tsx`)
- API routes: `route.ts` inside App Router directories (`app/api/projects/[id]/route.ts`)
- UI primitives (shadcn): kebab-case (`button.tsx`, `scroll-area.tsx`, `error-boundary.tsx`)
- Hooks: kebab-case with `use-` prefix (`use-system-health.ts`)
- Services: kebab-case (`content-extractor.ts`, `llm.ts`)
- Types/utils: simple lowercase (`types.ts`, `db.ts`, `utils.ts`)

**Functions:**
- camelCase for all functions and handlers: `handleSaveEdit`, `fetchAgents`, `getProviderKey`
- React components: PascalCase named exports: `export function SourceManager()`, `export function ChatPanel()`
- Page components: PascalCase default exports: `export default function Dashboard()`, `export default function AgentsPage()`
- Event handlers prefixed with `handle`: `handleSend`, `handleDelete`, `handleEdit`
- Fetch helpers prefixed with `fetch`: `fetchAgents`, `fetchHealth`, `fetchProject`

**Variables:**
- camelCase for all local variables and state: `isLoading`, `refreshTrigger`, `sourcesCount`
- Boolean state prefixed with `is`, `has`, `show`: `isLoading`, `hasNewSources`, `showCreate`, `showDeleteDialog`
- Database column names use snake_case: `project_id`, `file_path`, `content_text`, `created_at`
- Environment variables: UPPER_SNAKE_CASE accessed via bracket notation: `process['env']['VARIABLE_NAME']`

**Types/Interfaces:**
- PascalCase: `Project`, `Source`, `ProcessingRun`, `DocsWorker`, `Skill`
- Interface props suffixed with `Props`: `SourceManagerProps`, `ProcessPanelProps`, `ChatPanelProps`
- Inline type aliases for DB row shapes: `type WorkerRow = { ... }`, `type SkillRow = { ... }`
- Interface for local-only shapes: `interface Agent { ... }`, `interface Message { ... }`

## Code Style

**Formatting:**
- No Prettier config detected; uses default Next.js formatting
- 2-space indentation
- Single quotes for JS/TS strings (dominant pattern)
- Double quotes in JSX attributes and some imports (mixed, but single quotes predominate)
- Semicolons: present at end of statements
- Trailing commas: used in multiline objects and arrays
- Max line length: no enforced limit; some lines extend to 200+ characters

**Linting:**
- ESLint with `next/core-web-vitals` and `next/typescript` extends
- Config file: `app/.eslintrc.json`
- Occasional `// eslint-disable-next-line react-hooks/exhaustive-deps` for intentional dependency omissions
- Run with: `npm run lint`

## Import Organization

**Order (observed pattern):**
1. `"use client"` directive (when present, always first line)
2. React/Next.js framework imports (`react`, `next/server`, `next/navigation`, `next/link`)
3. UI component imports from `@/components/ui/*`
4. Feature component imports from `@/components/{feature}/*`
5. Library/utility imports (`@/lib/types`, `@/lib/db`, `@/lib/utils`)
6. Third-party libraries (`sonner`, `react-markdown`, `uuid`, `lucide-react`)
7. Node.js built-ins (`fs`, `path`, `crypto`, `child_process`) -- server-side only

**Path Aliases:**
- `@/*` maps to `./src/*` (configured in `app/tsconfig.json`)
- Use `@/lib/db` not `../../lib/db`
- Use `@/components/ui/button` not relative paths

**Icon Imports:**
- Import individual icons from `lucide-react`: `import { Loader2, Bot, FileText } from 'lucide-react'`
- Rename colliding icons: `import { Link as LinkIcon } from 'lucide-react'`

## Error Handling

**API Routes:**
- Wrap entire handler body in `try/catch`
- Log errors with `console.error('Context message:', error)`
- Return `NextResponse.json({ error: 'message' }, { status: code })` on failure
- Use descriptive error messages in Spanish for user-facing errors
- Use English for internal error context strings
- Standard HTTP status codes: 400 (validation), 404 (not found), 409 (conflict/duplicate), 415 (bad content type), 500 (server error)

```typescript
// Standard API route error pattern
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const item = db.prepare('SELECT * FROM table WHERE id = ?').get(params.id);
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

**Client Components:**
- Catch fetch errors silently with `.catch(() => {})` for non-critical requests
- Use `toast.error('mensaje')` from sonner for user-visible errors
- Use `toast.success('mensaje')` for success confirmations
- Console.error for debug logging: `console.error('Chat error:', error)`
- Error type casting: `(error as Error).message` or `(err as Error).message`

**Empty Catch Blocks:**
- Used intentionally for optional operations: `catch { /* skip */ }`, `catch { /* already exists */ }`
- Common in DB migrations (ALTER TABLE) and optional service health checks

## Component Patterns

**Client Components:**
- All page components and interactive components use `"use client"` directive
- No Server Components are used for pages (everything is client-rendered)
- State management via `useState` + `useEffect` with fetch calls
- Data fetching happens in `useEffect` with async inner functions

```typescript
// Standard data fetching pattern
"use client";

export default function PageName() {
  const [data, setData] = useState<Type[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/endpoint');
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return ( /* JSX */ );
}
```

**Props Interface Pattern:**
- Define interface directly above the component in the same file
- Use destructured props in function signature

```typescript
interface ComponentNameProps {
  projectId: string;
  onComplete?: () => void;
  isStale?: boolean;
}

export function ComponentName({ projectId, onComplete, isStale }: ComponentNameProps) {
  // ...
}
```

**Callback Props:**
- Prefix with `on`: `onProjectUpdate`, `onSourcesChanged`, `onNavigateToProcess`, `onAddComplete`
- Arrow function inline callbacks for simple state updates: `onClick={() => setShowCreate(true)}`
- Increment pattern for refresh triggers: `setRefreshTrigger(prev => prev + 1)`

**UI Component Library:**
- shadcn/ui components in `app/src/components/ui/`
- Styling via Tailwind CSS utility classes inline
- `cn()` helper from `@/lib/utils` for conditional class merging
- Dark theme exclusively: `bg-zinc-900`, `border-zinc-800`, `text-zinc-50`, accent `violet-500`
- Custom `ErrorBoundary` class component wrapping feature panels

**Loading States:**
- Full-page spinner: `<Loader2 className="w-8 h-8 animate-spin text-violet-500" />`
- Inline spinner: `<Loader2 className="w-4 h-4 animate-spin" />`
- Empty states with centered icon + descriptive text in Spanish

## API Route Patterns

**Route Structure:**
- Follow Next.js App Router conventions: `app/api/{resource}/route.ts`
- Dynamic segments: `app/api/projects/[id]/route.ts`
- Nested resources: `app/api/projects/[id]/sources/[sid]/route.ts`
- Action routes: `app/api/projects/[id]/process/route.ts`, `app/api/agents/create/route.ts`

**Force-Dynamic Export:**
- Routes without dynamic params that read `process.env` MUST export `dynamic = 'force-dynamic'`
- Example: `app/src/app/api/agents/route.ts`, `app/src/app/api/health/route.ts`

```typescript
export const dynamic = 'force-dynamic';
```

**Environment Variable Access:**
- CRITICAL: Always use bracket notation `process['env']['VAR_NAME']` to prevent webpack inlining at build time
- Provide fallback defaults: `process['env']['LITELLM_URL'] || 'http://192.168.1.49:4000'`

**Database Access:**
- Import singleton: `import db from '@/lib/db'`
- Use prepared statements: `db.prepare('SELECT * FROM x WHERE id = ?').get(id)`
- Cast results with `as` type assertions: `.get(id) as TypeName | undefined`
- Build dynamic UPDATE queries with arrays of field/value pairs

**Response Patterns:**
- Success: `NextResponse.json(data)` or `NextResponse.json(data, { status: 201 })`
- Error: `NextResponse.json({ error: 'message' }, { status: code })`
- Success with warnings: `NextResponse.json({ success: true, warnings: [...] })`

## State Management

**No External State Library:**
- All state is local component state via `useState`
- Cross-component communication through callback props (`onProjectUpdate`, `onSourcesChanged`)
- Refresh triggers: numeric counter state incremented to force re-fetches
- No Redux, Zustand, Jotai, or Context API usage

**Data Fetching:**
- Direct `fetch()` calls to internal API routes
- No SWR, React Query, or other data-fetching libraries
- Polling via `setInterval` in `useEffect` (see `use-system-health.ts` with 30s interval)
- `AbortSignal.timeout(5000)` for external service calls with timeout

## TypeScript Usage

**Strict Mode:** Enabled in `tsconfig.json` (`"strict": true`)

**Type Patterns:**
- Interfaces for domain models in `@/lib/types`: `Project`, `Source`, `ProcessingRun`, `DocsWorker`, `Skill`
- Inline interfaces for component props (not exported)
- `as` type assertions for DB query results: `.get(id) as Project`
- `unknown` in catch blocks: `catch (error: unknown)`, then cast `(error as Error).message`
- Union literal types for status fields: `'draft' | 'sources_added' | 'processing' | 'processed' | 'rag_indexed'`
- `Record<string, unknown>` for generic objects
- Optional properties with `?`: `bot_created?: number`, `rag_indexed_version?: number | null`

**Not Used:**
- Generics (minimal usage)
- Utility types (Pick, Omit, Partial)
- Enums (union string literals used instead)
- Zod or other runtime validation schemas

## Internationalization

**Language:** UI text is in Spanish throughout
- Page titles, descriptions, labels, error messages, toast notifications all in Spanish
- Code comments mix English and Spanish (English predominates in code comments)
- Variable names, function names, and type names are in English

---

*Convention analysis: 2026-03-11*
