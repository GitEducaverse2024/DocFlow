# Testing Strategy & Coverage

## Current State

**No testing infrastructure exists.** The codebase has:
- No test framework configured
- No test files
- No CI/CD pipeline for automated testing
- No `test` script in package.json beyond the default placeholder

## Gap Analysis

### High Priority (Should Test First)
1. **API Routes** - Core business logic lives in Next.js API routes (`app/src/app/api/`). These handle database operations, file processing, LLM calls, and RAG indexing.
2. **Content Extraction** (`app/src/lib/services/content-extractor.ts`) - PDF text extraction via poppler-utils, critical for pipeline correctness.
3. **Database Layer** (`app/src/lib/db.ts`) - SQLite operations with migrations, schema changes.
4. **LLM Service** (`app/src/lib/services/llm.ts`) - LiteLLM proxy interaction, prompt construction.

### Medium Priority
5. **React Components** - Source management, process panel, RAG panel state logic.
6. **Utility Functions** (`app/src/lib/utils.ts`) - Token estimation, helper functions.

### Lower Priority
7. **UI Components** - Layout, styling, visual components.

## Recommendations

- **Framework**: Vitest (fast, native ESM/TypeScript, compatible with Next.js)
- **Component Testing**: React Testing Library
- **API Route Testing**: Supertest or direct handler invocation
- **E2E**: Playwright (if needed later)

## Risk Assessment

Without tests, all changes rely on manual verification. The processing pipeline (sources → extraction → LLM processing → RAG indexing) is the highest-risk area for regressions.
