# Phase 53: Entry Modal — Research

## Problem Statement

Users currently navigate from the CatBrains list to a full-page detail view. The new UX requires an intermediary modal that shows CatBrain status and offers 3 action paths (Chat, New Sources, Reset) before navigating to specific views.

## Current Architecture

### CatBrains List Page (`app/src/app/catbrains/page.tsx`)
- Client component with `useState` for catbrains[], loading, search
- Fetches `GET /api/catbrains?limit=100` → `{ data: Project[], pagination }`
- Cards rendered inline (no separate card component) in a 3-column grid
- Current click handler: `<Link href={'/catbrains/${catbrain.id}'}> View Details </Link>` button
- Uses `useTranslations('catbrains')` for i18n
- Card shows: icon, name, system badge, status badge, lock icon, description, updated date

### CatBrain Detail Page (`app/src/app/catbrains/[id]/page.tsx`)
- Multi-step pipeline view with 8 steps
- Fetches additional data: sources count, versions count, connectors count, hasNewSources
- Chat is step 7 (index 6) in the pipeline

### Stats API (`GET /api/catbrains/[id]/stats`)
Returns all data needed for the modal:
```json
{
  "sources_count": number,
  "sources_by_type": [{ "type": string, "count": number }],
  "versions_count": number,
  "rag_enabled": 0|1,
  "rag_collection": string|null,
  "vectors_count": number|null,
  "embedding_model": string|null,
  "disk_size": string,
  "created_at": string,
  "updated_at": string
}
```

### Dialog Pattern in Codebase
- Uses shadcn/ui `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from `@/components/ui/dialog`
- Pattern: controlled with `open` + `onOpenChange` props
- Styling: `bg-zinc-950 border-zinc-800` or `bg-zinc-900 border-zinc-700`
- Examples: `delete-project-dialog.tsx`, `canvas-wizard.tsx`, `gmail-wizard.tsx`

### i18n
- Namespace: `catbrains` in `app/messages/{es,en}.json`
- Already has status keys, pipeline keys, detail keys
- Modal keys need to be added under `catbrains.modal.*`

### Project Type (from `@/lib/types`)
Key fields for modal display:
- `id`, `name`, `description`, `status`, `rag_enabled`, `rag_collection`, `is_system`, `icon_color`

## Solution

### Component: `CatBrainEntryModal`
- New file: `app/src/components/catbrains/catbrain-entry-modal.tsx`
- Controlled Dialog that receives `open`, `onOpenChange`, and selected `Project` object
- On open, fetches `/api/catbrains/[id]/stats` for source count and vectors count
- Displays header with emoji/icon, name, description, status badge
- Shows source count and RAG status (vectors count or "Sin RAG")
- 3 action cards: Chatear, Nuevas Fuentes, Resetear

### List Page Modifications (`catbrains/page.tsx`)
- Add state: `selectedCatBrain: Project | null`
- Replace `<Link>` "View Details" button with `onClick` that sets selectedCatBrain
- Also make card body clickable (cursor-pointer + onClick)
- Render `<CatBrainEntryModal>` at bottom of page

### Navigation Targets
- **Chatear**: `/catbrains/${id}?step=7` (chat is step 7 in pipeline)
- **Nuevas Fuentes**: `/catbrains/${id}?step=1` (sources is step 1 — will be replaced by phase 54's simplified view later)
- **Resetear**: For now, navigate to detail page (phase 55 will add the reset flow)
