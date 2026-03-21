# Requirements: DoCatFlow v14.0 — CatBrain UX Redesign

**Defined:** 2026-03-21
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v14.0 Requirements

Requirements for CatBrain UX Redesign. Each maps to roadmap phases.

### CORS Fix

- [ ] **CORS-01**: /api/agents GET returns JSON directly without redirect (proxy to /api/cat-paws internally)
- [ ] **CORS-02**: /api/agents/[id] GET/PUT/DELETE proxy to /api/cat-paws/[id] without redirect
- [ ] **CORS-03**: No fetch to /api/agents or /api/workers remains in /catbrains/[id] page or child components

### Entry Modal

- [ ] **MODAL-01**: User clicks CatBrain card on /catbrains and sees a Dialog modal (not navigation)
- [ ] **MODAL-02**: Modal header shows CatBrain emoji, name, description, source count, and RAG status (vectors count or "Sin RAG")
- [ ] **MODAL-03**: Modal presents 3 clickable card options: Chatear, Nuevas Fuentes, Resetear
- [ ] **MODAL-04**: "Chatear" closes modal and navigates to CatBrain chat view (step 7 of pipeline)
- [ ] **MODAL-05**: "Nuevas Fuentes" closes modal and navigates to simplified sources view
- [ ] **MODAL-06**: "Resetear" option has destructive styling (red border, warning icon)
- [ ] **MODAL-07**: All modal text uses i18n t() from catbrains namespace (es.json + en.json)

### Sources Pipeline

- [ ] **SRC-01**: Sources view shows 3 sequential phases: Fuentes, Procesar, Indexar en RAG
- [ ] **SRC-02**: Phase 1 (Fuentes): user can upload files (drag-and-drop), add URLs, YouTube, notes
- [ ] **SRC-03**: Phase 1: existing sources listed with delete option; new sources show pulsing "NUEVA" badge
- [ ] **SRC-04**: Phase 1: "Continuar" button activates only when at least 1 source exists
- [ ] **SRC-05**: Phase 2 (Procesar): user can change source mode (Procesar IA / Contexto directo / Excluir) per source
- [ ] **SRC-06**: Phase 2: CatPaw selector hidden/disabled when all sources are "Contexto directo"
- [ ] **SRC-07**: Phase 2: processing executes with SSE streaming progress; errors show retry + "continue anyway" options
- [ ] **SRC-08**: Phase 3 (Indexar RAG): uses append incremental if RAG already active, full create if new
- [ ] **SRC-09**: Phase 3: RAG config (embedding model, chunk size, overlap) shown collapsed, expandable
- [ ] **SRC-10**: Phase 3: progress bar with chunks processed/total and elapsed time
- [ ] **SRC-11**: Phase 3: sources without content_text get re-extraction with filename fallback (never blocks append)
- [ ] **SRC-12**: Phase 3: partial success shows summary ("X indexed, Y failed" with per-source details)
- [ ] **SRC-13**: Phase 3: Qdrant accessibility check before starting indexation
- [ ] **SRC-14**: "Ir al Chat" button appears after successful indexation
- [ ] **SRC-15**: Back button returns to /catbrains list

### Reset CatBrain

- [ ] **RST-01**: POST /api/catbrains/[id]/reset endpoint deletes sources, processing_runs, Qdrant collection, physical files
- [ ] **RST-02**: Reset updates catbrain: rag_enabled=0, rag_collection=NULL, processed_content=NULL, status='draft'
- [ ] **RST-03**: Reset does NOT delete catbrain config, system prompt, connectors, or LLM model
- [ ] **RST-04**: Step 1 confirmation modal shows what will be deleted (source count, vector count)
- [ ] **RST-05**: Step 2 requires typing exact CatBrain name to enable final button
- [ ] **RST-06**: Reset button disabled during execution; modal cannot be closed during reset
- [ ] **RST-07**: After reset completes, user lands on Sources Pipeline phase 1 (empty CatBrain)
- [ ] **RST-08**: If Qdrant unavailable during reset, continue with DB/file cleanup and log error
- [ ] **RST-09**: Endpoint uses withRetry for Qdrant calls

### RAG Info Bar

- [ ] **RAG-01**: Chat view shows collapsible info bar above messages area
- [ ] **RAG-02**: Bar displays MCP Bridge URL with copy-to-clipboard button (if MCP enabled)
- [ ] **RAG-03**: Bar shows RAG status badge (green "RAG activo" + vector count, or grey "Sin RAG")
- [ ] **RAG-04**: Bar shows embedding model name (if RAG active)
- [ ] **RAG-05**: Bar shows indexed source count
- [ ] **RAG-06**: Collapsible via chevron toggle; compact design (text-xs/sm, zinc-800/50 bg)

### Integration

- [ ] **INT-01**: Existing 7-step pipeline accessible via "Vista avanzada" link from CatBrain detail page
- [ ] **INT-02**: All new i18n keys added to both es.json and en.json in catbrains namespace
- [ ] **INT-03**: npm run build passes without TypeScript errors
- [ ] **INT-04**: No process.env.VAR (without brackets) in new/modified files

## Future Requirements

### Deferred

- **FUT-01**: Sources Pipeline drag-and-drop reordering in Phase 1
- **FUT-02**: Batch source mode change in Phase 2
- **FUT-03**: RAG info bar with real-time vector count updates via polling

## Out of Scope

| Feature | Reason |
|---------|--------|
| Delete CatBrain from modal | Only reset — deletion stays in list page context menu |
| Modify 7-step pipeline UI | Kept as-is for advanced users; no changes |
| WebSocket for processing progress | SSE polling sufficient, already implemented |
| Multi-CatBrain reset | Single CatBrain at a time, safety first |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORS-01 | Phase 52 | Pending |
| CORS-02 | Phase 52 | Pending |
| CORS-03 | Phase 52 | Pending |
| MODAL-01 | Phase 53 | Pending |
| MODAL-02 | Phase 53 | Pending |
| MODAL-03 | Phase 53 | Pending |
| MODAL-04 | Phase 53 | Pending |
| MODAL-05 | Phase 53 | Pending |
| MODAL-06 | Phase 53 | Pending |
| MODAL-07 | Phase 53 | Pending |
| SRC-01 | Phase 54 | Pending |
| SRC-02 | Phase 54 | Pending |
| SRC-03 | Phase 54 | Pending |
| SRC-04 | Phase 54 | Pending |
| SRC-05 | Phase 54 | Pending |
| SRC-06 | Phase 54 | Pending |
| SRC-07 | Phase 54 | Pending |
| SRC-08 | Phase 54 | Pending |
| SRC-09 | Phase 54 | Pending |
| SRC-10 | Phase 54 | Pending |
| SRC-11 | Phase 54 | Pending |
| SRC-12 | Phase 54 | Pending |
| SRC-13 | Phase 54 | Pending |
| SRC-14 | Phase 54 | Pending |
| SRC-15 | Phase 54 | Pending |
| RST-01 | Phase 55 | Pending |
| RST-02 | Phase 55 | Pending |
| RST-03 | Phase 55 | Pending |
| RST-04 | Phase 55 | Pending |
| RST-05 | Phase 55 | Pending |
| RST-06 | Phase 55 | Pending |
| RST-07 | Phase 55 | Pending |
| RST-08 | Phase 55 | Pending |
| RST-09 | Phase 55 | Pending |
| RAG-01 | Phase 56 | Pending |
| RAG-02 | Phase 56 | Pending |
| RAG-03 | Phase 56 | Pending |
| RAG-04 | Phase 56 | Pending |
| RAG-05 | Phase 56 | Pending |
| RAG-06 | Phase 56 | Pending |
| INT-01 | Phase 56 | Pending |
| INT-02 | Phase 56 | Pending |
| INT-03 | Phase 56 | Pending |
| INT-04 | Phase 56 | Pending |

**Coverage:**
- v14.0 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 — Traceability populated after roadmap creation*
