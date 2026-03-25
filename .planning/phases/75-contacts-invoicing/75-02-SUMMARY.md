---
phase: 75-contacts-invoicing
plan: 02
subsystem: holded-mcp-invoicing
tags: [invoicing, mcp-tools, holded-api]
dependency_graph:
  requires: [75-01]
  provides: [holded_quick_invoice, holded_list_invoices, holded_invoice_summary]
  affects: [src/index.ts, src/validation.ts]
tech_stack:
  added: []
  patterns: [withValidation, resolveContactId, client-side-pagination]
key_files:
  created:
    - src/tools/invoice-helpers.ts
    - src/__tests__/invoice-helpers.test.ts
  modified:
    - src/validation.ts
    - src/index.ts
decisions:
  - "Default tax 21% (Spain IVA) when not specified per item"
  - "Client-side pagination for list_invoices (API returns full set)"
  - "Partially paid invoices counted as pending for conservative summary"
metrics:
  duration: 2m 8s
  completed: 2026-03-23T14:21:24Z
  tasks: 2/2
  tests: 14 new (299 total)
---

# Phase 75 Plan 02: Invoice Helper Tools Summary

Simplified invoicing tools for Holded MCP: quick invoice creation with contact fuzzy-matching and 21% default tax, contact-scoped invoice listing with paid/date filters, and invoice summary with paid/unpaid/partial breakdowns.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create invoice helper tools + Zod schemas + registration | 71ff5af | src/tools/invoice-helpers.ts, src/validation.ts, src/index.ts |
| 2 | Create invoice helper tests | 71ff5af | src/__tests__/invoice-helpers.test.ts |

## What Was Built

### 3 Invoice Helper Tools

1. **holded_quick_invoice** - Create invoices with contact name (fuzzy matched) or ID. Defaults: tax=21%, units=1. Accepts optional date, notes, currency.
2. **holded_list_invoices** - List invoices for a contact with paid/unpaid/partial filter and date range. Client-side pagination (page, limit).
3. **holded_invoice_summary** - Aggregate invoice totals for a contact over configurable months (default: 12). Returns totalInvoiced, totalPaid, totalPending with paid/unpaid/partial counts.

### Zod Schemas Added

- `quickInvoiceItemSchema` - item validation with optional units/tax
- `quickInvoiceSchema` - invoice creation with contact + items + optional fields
- `listInvoicesSchema` - contact + paid filter + date range + pagination
- `invoiceSummarySchema` - contact + months lookback

### Registration

- All 3 tools registered in `src/index.ts` allTools spread
- Rate limiter configured: quick_invoice=20/min, list_invoices=200/min, invoice_summary=100/min

## Test Coverage

14 tests across 3 tool suites:
- **holded_quick_invoice (5)**: contact resolution, default tax/units, custom overrides, optional fields, empty items rejection
- **holded_list_invoices (5)**: contact listing, paid filter, date range, pagination, field projection
- **holded_invoice_summary (4)**: aggregation math, months parameter, empty list, default period

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Build: `npm run build` passes
- Tests: 27 test files, 299 tests all passing
- Tools registered and rate-limited in index.ts
