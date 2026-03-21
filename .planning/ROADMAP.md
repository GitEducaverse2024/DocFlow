# Roadmap: DoCatFlow

## Milestones

- v12.0 WebSearch CatBrain — Phases 48-49 (shipped 2026-03-16) — [archive](.planning/milestones/v12.0-ROADMAP.md)
- v13.0 Conector Gmail — Phases 50-51 (shipped 2026-03-16)
- **v14.0 CatBrain UX Redesign** — Phases 52-56 (active)

## Phases

- [ ] **Phase 52: CORS Fix** - Replace redirects in /api/agents with internal proxy to /api/cat-paws
- [ ] **Phase 53: Entry Modal** - CatBrain entry dialog with 3 action options (Chat, New Sources, Reset)
- [ ] **Phase 54: Sources Pipeline** - Simplified 3-phase source ingestion flow (Sources, Process, Index RAG)
- [ ] **Phase 55: Reset CatBrain** - API endpoint and 2-step confirmation UI for resetting a CatBrain
- [ ] **Phase 56: RAG Info Bar + Integration** - RAG info bar in chat view, advanced view link, i18n, build validation

## Phase Details

### Phase 52: CORS Fix
**Goal**: API calls from CatBrain pages to /api/agents work without CORS errors or redirect failures
**Depends on**: Nothing (prerequisite for all subsequent phases)
**Requirements**: CORS-01, CORS-02, CORS-03
**Success Criteria** (what must be TRUE):
  1. GET /api/agents from CatBrain detail page returns JSON array without browser CORS error or redirect to 0.0.0.0
  2. GET/PUT/DELETE /api/agents/[id] return correct responses by proxying internally to cat-paws logic
  3. No fetch call in /catbrains/[id] page or child components references /api/agents or /api/workers directly
**Plans**: 1 plan
Plans:
- [ ] 52-01-PLAN.md — Reemplazar fetch URLs en frontend y reescribir alias routes con NextResponse.rewrite

### Phase 53: Entry Modal
**Goal**: Users interact with CatBrains through a contextual modal that shows status and offers clear action paths
**Depends on**: Phase 52 (modal loads CatBrain data which may trigger agent fetches)
**Requirements**: MODAL-01, MODAL-02, MODAL-03, MODAL-04, MODAL-05, MODAL-06, MODAL-07
**Success Criteria** (what must be TRUE):
  1. Clicking a CatBrain card on /catbrains opens a Dialog modal showing the CatBrain name, emoji, description, source count, and RAG status (vector count or "Sin RAG")
  2. User can click "Chatear" to navigate to chat view, "Nuevas Fuentes" to navigate to the simplified sources view, or "Resetear" (styled with red border and warning icon) to enter reset flow
  3. All modal text renders correctly in both Spanish and English via i18n catbrains namespace
**Plans**: TBD

### Phase 54: Sources Pipeline
**Goal**: Users can add sources and get them processed and indexed into RAG through a simple 3-step guided flow
**Depends on**: Phase 53 (modal "Nuevas Fuentes" button navigates to this view)
**Requirements**: SRC-01, SRC-02, SRC-03, SRC-04, SRC-05, SRC-06, SRC-07, SRC-08, SRC-09, SRC-10, SRC-11, SRC-12, SRC-13, SRC-14, SRC-15
**Success Criteria** (what must be TRUE):
  1. User sees 3 sequential phases (Fuentes, Procesar, Indexar RAG) with clear progress indication and can navigate forward/back between them
  2. In Phase 1, user can upload files (drag-and-drop), add URLs/YouTube/notes, see existing sources with delete option, new sources show pulsing "NUEVA" badge, and "Continuar" only enables when at least 1 source exists
  3. In Phase 2, user can set processing mode per source (Procesar IA / Contexto directo / Excluir), CatPaw selector hides when all sources are "Contexto directo", and processing runs with SSE streaming progress with error retry and "continue anyway" options
  4. In Phase 3, RAG indexing uses append if RAG already active or full create if new, shows progress bar with chunks processed/total and elapsed time, re-extracts sources without content_text with filename fallback, checks Qdrant before starting, and shows partial success summary ("X indexed, Y failed")
  5. After successful indexation "Ir al Chat" button appears; Back button returns to /catbrains list
**Plans**: TBD

### Phase 55: Reset CatBrain
**Goal**: Users can safely reset a CatBrain to empty state through a 2-step confirmation process
**Depends on**: Phase 53 (modal "Resetear" button triggers this flow)
**Requirements**: RST-01, RST-02, RST-03, RST-04, RST-05, RST-06, RST-07, RST-08, RST-09
**Success Criteria** (what must be TRUE):
  1. POST /api/catbrains/[id]/reset deletes sources, processing_runs, Qdrant collection, and physical files while preserving config, system prompt, connectors, and LLM model; endpoint uses withRetry for Qdrant calls
  2. User must pass 2-step confirmation: first modal shows what will be deleted (source count, vector count), second step requires typing exact CatBrain name to enable the final button
  3. Reset button is disabled during execution and modal cannot be closed; after completion user lands on Sources Pipeline phase 1 with empty CatBrain
  4. If Qdrant is unavailable during reset, operation continues with DB/file cleanup and logs the Qdrant error
**Plans**: TBD

### Phase 56: RAG Info Bar + Integration
**Goal**: Chat view shows RAG context information and the full milestone integrates cleanly with existing features
**Depends on**: Phase 54 (needs RAG-indexed CatBrain to display info), Phase 55 (reset flow must work end-to-end)
**Requirements**: RAG-01, RAG-02, RAG-03, RAG-04, RAG-05, RAG-06, INT-01, INT-02, INT-03, INT-04
**Success Criteria** (what must be TRUE):
  1. Chat view displays a collapsible info bar (chevron toggle, text-xs/sm, zinc-800/50 bg) showing MCP Bridge URL with copy-to-clipboard button, RAG status badge (green "RAG activo" + vector count or grey "Sin RAG"), embedding model name, and indexed source count
  2. CatBrain detail page includes a "Vista avanzada" link that opens the existing 7-step pipeline
  3. All new i18n keys exist in both es.json and en.json in catbrains namespace
  4. npm run build passes without TypeScript errors and no new/modified files use process.env.VAR without bracket notation
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 52. CORS Fix | 0/1 | Planned | - |
| 53. Entry Modal | 0/? | Not started | - |
| 54. Sources Pipeline | 0/? | Not started | - |
| 55. Reset CatBrain | 0/? | Not started | - |
| 56. RAG Info Bar + Integration | 0/? | Not started | - |

---
*Created: 2026-03-21*
*Last updated: 2026-03-21*
