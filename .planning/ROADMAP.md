# Roadmap: DocFlow v1.0

**Milestone:** Fix RAG Chat + Mejoras de indexación
**Phases:** 2
**Requirements:** 12 active (2 already done)

## Phase 1: Fix RAG Chat Retrieval

**Goal:** Make the chat endpoint find and return indexed content by using the same search logic as "Probar consulta".

**Requirements:** CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07

**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Reescribir chat/route.ts con servicios compartidos ollama.ts y qdrant.ts (2/2 tasks)

**What changes:**
- Rewrite `app/src/app/api/projects/[id]/chat/route.ts` to use shared `ollama.ts` and `qdrant.ts` services instead of raw fetch calls
- Increase Qdrant search limit from 5 to 10
- Remove any score_threshold filtering
- Add diagnostic logging (query, chunks found, scores, context length)
- Ensure CHAT_MODEL defaults to gemini-main

**Success criteria:**
1. User sends "spoke" in chat → receives answer with content from Chunk 44 (same as Probar consulta)
2. Chat endpoint logs show: query text, N chunks found, their scores, context character count
3. Chat and Probar consulta use identical Ollama embedding + Qdrant search paths (shared services)
4. `npm run build` passes without errors

**Estimated complexity:** Low — single file rewrite, no new dependencies

---

## Phase 2: Real-time RAG Indexing Progress

**Goal:** Show real-time progress during RAG indexing with visual bar, step descriptions, and structured status data.

**Requirements:** PROG-01, PROG-02, PROG-03, PROG-04, PROG-05

**What changes:**
- Update `rag-jobs.ts` to track `chunksProcessed` and `chunksTotal` fields
- Update `rag/create/route.ts` to parse chunksProcessed/chunksTotal from worker status file and update job tracker
- Update `rag/status/route.ts` to return chunksProcessed and chunksTotal in response
- Update `rag-panel.tsx` to show visual progress bar (percentage) when chunksProcessed/chunksTotal are available
- Update `rag-worker.mjs` to write chunksProcessed and chunksTotal to status file

**Success criteria:**
1. During indexing, rag-panel shows a visual progress bar with percentage (e.g., "15/44 — 34%")
2. Step description updates in real-time: "Leyendo documento...", "Dividiendo en chunks...", "Generando embedding 15/44..."
3. Elapsed time counter is visible during indexing
4. On completion, toast shows "Indexación completada: N vectores indexados"
5. `npm run build` passes without errors

**Estimated complexity:** Low-Medium — changes across 4-5 files, mostly additive

Plans:
- [x] 02-01-PLAN.md — Structured progress data + visual progress bar (4/4 tasks)

---

## Summary

| # | Phase | Goal | Requirements | Criteria |
|---|-------|------|--------------|----------|
| 1 | Fix RAG Chat Retrieval | Chat finds indexed content | CHAT-01..07 | 4 |
| 2 | RAG Indexing Progress | Real-time progress bar | PROG-01..05 | 5 |

**Total:** 2 phases | 12 requirements mapped | 0 unmapped

---
*Roadmap created: 2026-03-11*
