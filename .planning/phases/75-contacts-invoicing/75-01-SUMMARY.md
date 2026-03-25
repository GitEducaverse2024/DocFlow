---
phase: 75-contacts-invoicing
plan: 01
subsystem: holded-mcp
tags: [contacts, search, id-resolver, mcp-tools]
dependency_graph:
  requires: []
  provides: [resolveContactId, holded_search_contact, holded_resolve_contact]
  affects: [75-02, 75-03]
tech_stack:
  added: []
  patterns: [client-side-filtering, fuzzy-match-priority, id-passthrough]
key_files:
  created:
    - src/tools/contact-search.ts
    - src/__tests__/contact-search.test.ts
  modified:
    - src/utils/id-resolver.ts
    - src/validation.ts
    - src/index.ts
decisions:
  - Exported looksLikeId and fuzzyMatch (previously module-private) to enable reuse by resolveContactId
metrics:
  duration: 2m
  completed: 2026-03-23
  tasks: 2/2
  tests: 15 new (285 total)
---

# Phase 75 Plan 01: Contact Search + Resolve Tools Summary

Contact search and ID resolution tools for Holded MCP -- client-side filtering on name/email/vatnumber/tradename with fuzzy ID resolution (exact > startsWith > includes priority).

## What Was Built

### resolveContactId utility (id-resolver.ts)
- Exported `looksLikeId` and `fuzzyMatch` (previously private functions)
- Added `resolveContactId(client, nameOrId)` -- returns ID directly for 24-char hex, otherwise fetches all contacts and fuzzy-matches by name
- Throws `AmbiguousMatchError` with candidate list when multiple contacts match
- Reusable by Plan 02 (simplified invoicing) to accept contact names

### holded_search_contact tool
- Searches contacts by name, email, vatnumber, or tradename (case-insensitive includes)
- Client-side pagination (page/limit params, default 50, max 500)
- Returns filtered fields: id, name, email, vatnumber, tradename, phone, type
- Pagination metadata: page, pageSize, totalItems, totalPages, hasMore

### holded_resolve_contact tool
- Resolves contact name or 24-char hex ID to a single contactId
- 24-char hex IDs pass through without API call
- Fuzzy match priority: exact > startsWith > includes
- AmbiguousMatchError with candidates for multiple matches

### Zod schemas
- `searchContactSchema`: query (required), page, limit
- `resolveContactSchema`: contact (required, described as name or ID)

### Registration
- Both tools registered in index.ts allTools spread
- Rate limiter: 200 req/min for both tools

## Test Coverage

15 new tests in `src/__tests__/contact-search.test.ts`:
- Search by name (case-insensitive): 2 results for "acme"
- Search by email: "beta.io" finds Beta Industries
- Search by vatnumber: "B12345678" finds Acme Corp
- Search by tradename: "Beta" finds Beta Industries
- Empty results for non-matching query
- Pagination: limit=1 returns hasMore=true, totalPages=2
- Field filtering: only relevant fields returned
- Empty query rejection (Zod validation)
- Resolve hex ID passthrough (no API call)
- Resolve single match by name
- Ambiguous match throws AmbiguousMatchError
- No match throws "No contact found"
- resolveContactId utility: passthrough, resolve, ambiguous

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 174417d | feat(75-01): add contact search + resolve tools and resolveContactId utility |
| 2 | a85f94f | test(75-01): add contact search and resolve test suite |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `npm run build` passes (0 errors)
- `npm test -- --run` passes (26 test files, 285 tests, 0 failures)
- holded_search_contact and holded_resolve_contact registered in allTools
- resolveContactId exported from id-resolver.ts

## Self-Check: PASSED

All files exist, all commits verified.
