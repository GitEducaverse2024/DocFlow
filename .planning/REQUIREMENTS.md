# Requirements: DocFlow

**Defined:** 2026-03-11
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v1.0 Requirements

Requirements for milestone v1.0: Fix RAG Chat + Mejoras de indexación.

### Chat RAG

- [x] **CHAT-01**: Chat endpoint usa los servicios compartidos (ollama.ts, qdrant.ts) en vez de llamadas HTTP manuales duplicadas
- [x] **CHAT-02**: Chat endpoint busca en la colección correcta del proyecto con el modelo de embeddings correcto (Ollama nomic-embed-text)
- [x] **CHAT-03**: Chat endpoint recupera hasta 10 resultados de Qdrant (actualmente limitado a 5)
- [x] **CHAT-04**: Chat endpoint no filtra resultados por score_threshold (o usa threshold <= 0.3)
- [x] **CHAT-05**: Los chunks recuperados se pasan como contexto al LLM en el prompt del chat
- [x] **CHAT-06**: Chat endpoint incluye logs: query recibida, chunks encontrados con scores, longitud del contexto
- [x] **CHAT-07**: Chat endpoint usa gemini-main como modelo por defecto (configurable via CHAT_MODEL env)

### Progreso RAG

- [ ] **PROG-01**: Barra de progreso visual en rag-panel durante indexación (porcentaje basado en chunks procesados/total)
- [ ] **PROG-02**: Texto descriptivo del paso actual durante indexación ("Leyendo documento...", "Generando embedding 15/44...", etc.)
- [ ] **PROG-03**: Tiempo transcurrido visible durante indexación
- [ ] **PROG-04**: Toast de éxito al completar con resumen (N vectores indexados)
- [ ] **PROG-05**: El endpoint GET /rag/status devuelve chunksProcessed y chunksTotal además del progress string

### Re-indexación

- [ ] **REIDX-01**: El worker borra la colección anterior en Qdrant antes de crear la nueva (ya implementado en rag-worker.mjs)
- [ ] **REIDX-02**: El worker usa project.current_version para leer el output.md correcto (ya implementado)

## Future Requirements

### Mejoras de Chat

- **CHAT-F01**: Historial de conversación en el chat (mantener contexto entre mensajes)
- **CHAT-F02**: Streaming de respuestas del LLM en el chat

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cambiar modelo de embeddings | Debe permanecer Ollama nomic-embed-text 768 dims |
| WebSocket para progreso | Polling cada 2s es suficiente para el caso de uso |
| Multi-idioma | Todo en español por ahora |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAT-01 | Phase 1 | Complete |
| CHAT-02 | Phase 1 | Complete |
| CHAT-03 | Phase 1 | Complete |
| CHAT-04 | Phase 1 | Complete |
| CHAT-05 | Phase 1 | Complete |
| CHAT-06 | Phase 1 | Complete |
| CHAT-07 | Phase 1 | Complete |
| PROG-01 | Phase 2 | Pending |
| PROG-02 | Phase 2 | Pending |
| PROG-03 | Phase 2 | Pending |
| PROG-04 | Phase 2 | Pending |
| PROG-05 | Phase 2 | Pending |
| REIDX-01 | — | Already done |
| REIDX-02 | — | Already done |

**Coverage:**
- v1.0 requirements: 14 total
- Mapped to phases: 12
- Already done: 2
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after initial definition*
