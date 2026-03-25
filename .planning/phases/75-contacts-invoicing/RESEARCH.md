# Phase 75: Contactos Mejorado + Facturación - Research

**Researched:** 2026-03-23
**Domain:** Holded Invoicing API v1 (contacts + documents) — enhanced tools
**Confidence:** HIGH

## Summary

Phase 75 enhances the existing Holded MCP contact and document tools with three capabilities missing for LLM-driven workflows:

1. **Contact fuzzy search + ID resolution** (CONT-01) — The existing `list_contacts` tool has no search capability. The LLM must search contacts by name, email, or VAT number to find the right contact before creating invoices or looking up history. The `id-resolver.ts` utility already provides a `fuzzyMatch` function used for funnels.

2. **Simplified invoicing** (FACT-01) — The existing `create_document` tool requires docType, contactId, and raw items array. A simplified invoice tool should accept a contact name (with fuzzy resolution), simple line items, and handle defaults. Plus a convenience tool for listing/summarizing invoices per contact.

3. **Contact context** (CONT-02) — A composite tool that aggregates a contact's details, recent invoices, and outstanding balance into a single response. Gives the LLM complete context about a business relationship in one call.

**Primary recommendation:** Three plans: Plan 01 covers contact search + ID resolver (CONT-01, 3 tools). Plan 02 covers simplified invoicing tools (FACT-01, 3 tools). Plan 03 covers contact context composite tool (CONT-02, 1 tool).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONT-01 | Contact search: fuzzy search by name/email/vatnumber + contact ID resolver | Existing `list_contacts` fetches all; `fuzzyMatch` in id-resolver.ts provides matching logic; `resolveContactId` follows same pattern as `resolveFunnelId` |
| FACT-01 | Simplified invoicing: quick invoice creation with contact name resolution + per-contact invoice listing/summary | Existing `create_document` and `list_documents` provide the API layer; new tools add convenience wrappers with contact resolution and filtering |
| CONT-02 | Contact context: composite tool returning contact details + recent invoices + balance | Combines GET /contacts/{id} + GET /documents/invoice?contactid={id} into one response |
</phase_requirements>

## Existing Codebase — What's Already There

### Contact Tools (`src/tools/contacts.ts`)
| Tool | Type | Notes |
|------|------|-------|
| `list_contacts` | READ | Fetches all, client-side pagination, field filtering. NO search capability. |
| `create_contact` | WRITE | name required, optional email/phone/vatnumber/type/billAddress |
| `get_contact` | READ | By contactId |
| `update_contact` | WRITE | Partial update |
| `delete_contact` | WRITE | By contactId |
| `list_contact_attachments` | READ | Contact attachments |
| `get_contact_attachment` | READ | Specific attachment |

**Important:** These tools use **bare names** (no `holded_` prefix) and use the **default `invoicing` module** (no module parameter). New phase-75 tools should use `holded_` prefix for consistency with phases 72-75.

### Document Tools (`src/tools/documents.ts`)
| Tool | Type | Notes |
|------|------|-------|
| `list_documents` | READ | By docType with date/contact/paid filters |
| `create_document` | WRITE | docType + contactId + items array |
| `get_document` | READ | By docType + documentId |
| `pay_document` | WRITE | Register payment |
| `send_document` | WRITE | Email send |
| `get_document_pdf` | READ | PDF export |
| + 8 more | various | update, delete, shipping, tracking, pipeline |

**Key:** `list_documents` already supports `contactid` filter and `paid` filter (0/1/2). This is the foundation for invoice-per-contact queries.

### ID Resolver (`src/utils/id-resolver.ts`)
- `fuzzyMatch<T extends { name: string }>(items: T[], query: string): T[]` — exact → startsWith → includes
- `looksLikeId(value: string): boolean` — checks 24-char hex
- `resolveFunnelId(client, nameOrId)` — resolves funnel name to ID
- `AmbiguousMatchError` — thrown when multiple matches

### Contact API Endpoints (Holded Invoicing v1)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/contacts` | List all contacts (paginated server-side) |
| GET | `/contacts` + query params | Filter by phone, mobile, customId |
| GET | `/contacts/{contactId}` | Get single contact (full detail) |
| POST | `/contacts` | Create contact |
| PUT | `/contacts/{contactId}` | Update contact |
| DELETE | `/contacts/{contactId}` | Delete contact |

**Contact fields:** id, customId, name, email, phone, mobile, vatnumber, tradename, type, billAddress, shippAddress, defaults, socialNetworks, tags, groupId, note, isperson, ...

### Document API Endpoints (Holded Invoicing v1)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/documents/invoice` | List invoices (supports starttmp, endtmp, contactid, paid, sort) |
| POST | `/documents/invoice` | Create invoice |
| GET | `/documents/invoice/{id}` | Get invoice detail |

## Architecture Patterns

### New Tool Files (phase 75 additions)
```
src/
  tools/
    contact-search.ts         # CONT-01: search + resolve (new file)
  utils/
    id-resolver.ts             # Add resolveContactId (extend existing)
  __tests__/
    contact-search.test.ts     # Tests for CONT-01
```

**Key decision: extend existing files vs new files.**
- Contact search → **new file** `contact-search.ts` (separate from original contacts.ts to avoid conflicts with upstream)
- Contact ID resolver → **extend** `id-resolver.ts` (follows established pattern)
- Simplified invoicing → **new file** `invoice-helpers.ts` (wraps existing document tools)
- Contact context → include in `contact-search.ts` (related to contact domain)

### Tool Definition Shape (same as prior phases)
```typescript
toolName: {
  description: string,
  inputSchema: { type: 'object', properties: {...}, required: [...] },
  readOnlyHint?: boolean,
  destructiveHint?: boolean,
  handler: withValidation(zodSchema, async (args) => { ... }),
}
```

All new tools use `holded_` prefix. Module: default (invoicing) — contacts and documents are in the invoicing API.

## Standard Stack

### Core (already in project)
| Library | Version | Purpose |
|---------|---------|---------|
| zod | existing | Input validation via withValidation pattern |
| vitest | existing | Testing via vi.fn() + createMockClient |
| typescript | existing | Strict compilation |

No new npm dependencies required.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy matching | Custom matching | `fuzzyMatch` from id-resolver.ts | Already tested, handles exact/startsWith/includes priority |
| Contact ID resolution | Inline logic | `resolveContactId` (new, same pattern as resolveFunnelId) | Reusable across invoice helpers and context tools |
| Invoice listing | Raw API call | `client.get('/documents/invoice', {contactid})` | API already supports server-side contactid filter |
| Input validation | Manual checks | `withValidation` + Zod schemas | Consistent error messages |

## Common Pitfalls

### Pitfall 1: Contact Name Collision
**What goes wrong:** Multiple contacts may share the same name (e.g., "Juan Garcia").
**How to avoid:** Use `AmbiguousMatchError` (from id-resolver.ts) when fuzzyMatch returns >1 result. The LLM can then ask the user to disambiguate.
**Warning signs:** Wrong contact selected for invoice.

### Pitfall 2: Bare Tool Names vs Prefixed Names
**What goes wrong:** Original tools use `list_contacts`, new tools use `holded_search_contact`. Naming inconsistency.
**How to avoid:** New tools all use `holded_` prefix. Original tools keep their names (no breaking changes). Document the distinction in tool descriptions.

### Pitfall 3: Contact Search Performance
**What goes wrong:** Fetching ALL contacts for each search may be slow for large contact lists.
**How to avoid:** The API supports server-side pagination but NOT server-side name search. Client-side filtering is the only option (same pattern as employees). Cache could help but adds complexity — skip for now.

### Pitfall 4: Invoice Amounts and Taxes
**What goes wrong:** Creating invoices with incorrect tax calculations.
**How to avoid:** The `holded_quick_invoice` tool should accept subtotal per item and tax percentage. The API handles tax calculation. Don't try to compute totals client-side.

### Pitfall 5: Contact Context Response Size
**What goes wrong:** Loading all invoices for a contact with many years of history produces huge responses.
**How to avoid:** Default to last 90 days of invoices. Accept optional `months` parameter. Limit to 20 most recent invoices.

## Tool Breakdown (Suggested)

### Plan 01 — Contact Search + ID Resolver (CONT-01, Wave 1)

| Tool | Type | Description |
|------|------|-------------|
| `holded_search_contact` | READ | Fuzzy search contacts by name, email, vatnumber, or tradename. Client-side filter over GET /contacts. |
| `holded_resolve_contact` | READ | Resolve a contact name to contactId. Returns single match or AmbiguousMatchError. |

Plus: `resolveContactId` function in `id-resolver.ts` for reuse by Plan 02 tools.

Files: `src/tools/contact-search.ts`, `src/utils/id-resolver.ts` (extend), `src/validation.ts`, `src/index.ts`, `src/__tests__/contact-search.test.ts`

### Plan 02 — Simplified Invoicing (FACT-01, Wave 1)

| Tool | Type | Description |
|------|------|-------------|
| `holded_quick_invoice` | WRITE | Create invoice with contact name resolution. Accepts contactName OR contactId, simple items [{name, units, subtotal, tax?}], optional date/notes/currency. |
| `holded_list_invoices` | READ | List invoices for a contact (by name or ID), with date range and paid/unpaid filter. Wraps list_documents('invoice') with contact resolver. |
| `holded_invoice_summary` | READ | Get invoice summary for a contact: total invoiced, total paid, total pending, recent invoices count. |

Files: `src/tools/invoice-helpers.ts`, `src/validation.ts`, `src/index.ts`, `src/__tests__/invoice-helpers.test.ts`

### Plan 03 — Contact Context (CONT-02, Wave 2)

| Tool | Type | Description |
|------|------|-------------|
| `holded_contact_context` | READ | Composite: returns contact details + recent invoices (last 90 days) + outstanding balance + contact type. Single call for full business relationship context. |

Files: `src/tools/contact-search.ts` (add to existing), `src/validation.ts`, `src/index.ts`, `src/__tests__/contact-search.test.ts` (extend)

## Code Examples

### Contact Search Pattern
```typescript
// src/tools/contact-search.ts
import { HoldedClient } from '../holded-client.js';
import { withValidation, searchContactSchema, resolveContactSchema } from '../validation.js';
import { resolveContactId } from '../utils/id-resolver.js';

interface HoldedContact {
  id: string;
  name: string;
  email?: string;
  vatnumber?: string;
  tradename?: string;
  [key: string]: unknown;
}

export function getContactSearchTools(client: HoldedClient) {
  return {
    holded_search_contact: {
      description: 'Search Holded contacts by name, email, VAT number, or trade name (case-insensitive fuzzy match).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query' },
          page: { type: 'number' },
          limit: { type: 'number' },
        },
        required: ['query'],
      },
      readOnlyHint: true,
      handler: withValidation(searchContactSchema, async (args) => {
        const all = await client.get<HoldedContact[]>('/contacts');
        const q = args.query.toLowerCase();
        const filtered = all.filter((c) =>
          c.name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.vatnumber?.toLowerCase().includes(q) ||
          c.tradename?.toLowerCase().includes(q)
        );
        // paginate...
      }),
    },
  };
}
```

### Contact ID Resolver Pattern (extends id-resolver.ts)
```typescript
export async function resolveContactId(
  client: HoldedClient,
  nameOrId: string
): Promise<string> {
  if (looksLikeId(nameOrId)) return nameOrId;
  const contacts = await client.get<Array<{id: string; name: string}>>('/contacts');
  const matches = fuzzyMatch(contacts, nameOrId);
  if (matches.length === 0) throw new Error(`No contact found matching "${nameOrId}"`);
  if (matches.length === 1) return matches[0].id;
  throw new AmbiguousMatchError('contact', nameOrId, matches.map(c => ({id: c.id, name: c.name})));
}
```

### Quick Invoice Pattern
```typescript
holded_quick_invoice: {
  description: 'Create a Holded invoice with simplified inputs. Accepts contact name (fuzzy resolved) or ID, and simple line items.',
  handler: withValidation(quickInvoiceSchema, async (args) => {
    const contactId = await resolveContactId(client, args.contact);
    const items = args.items.map(item => ({
      name: item.name,
      units: item.units ?? 1,
      subtotal: item.subtotal,
      tax: item.tax ?? 21, // Default Spain IVA
    }));
    return client.post('/documents/invoice', { contactId, items, date: args.date, notes: args.notes, currency: args.currency });
  }),
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Quick run | `cd ~/holded-mcp && npm test -- --run src/__tests__/contact-search.test.ts` |
| Full suite | `cd ~/holded-mcp && npm test -- --run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | File |
|--------|----------|-----------|------|
| CONT-01 | search contacts by name | unit | contact-search.test.ts |
| CONT-01 | search contacts by email/vatnumber | unit | contact-search.test.ts |
| CONT-01 | resolve contact name to ID | unit | contact-search.test.ts |
| CONT-01 | ambiguous match error | unit | contact-search.test.ts |
| FACT-01 | create quick invoice with contact name | unit | invoice-helpers.test.ts |
| FACT-01 | list invoices for contact | unit | invoice-helpers.test.ts |
| FACT-01 | invoice summary per contact | unit | invoice-helpers.test.ts |
| CONT-02 | contact context composite | unit | contact-search.test.ts |

### Sampling Rate
- **Per task commit:** `cd ~/holded-mcp && npm run build && npm test -- --run`
- **Phase gate:** Full suite green

## Open Questions

1. **Default tax rate for quick_invoice**
   - Recommendation: Default 21% (Spain IVA). Accept per-item tax override.
   - Why: Business is Spain-based.

2. **Invoice summary period**
   - Recommendation: Default last 12 months for summary, last 90 days for context tool.
   - Why: Balance between completeness and response size.

## Sources

### Primary (HIGH confidence)
- Existing codebase: contacts.ts, documents.ts, id-resolver.ts — verified by reading source
- Holded API reference: /contacts, /documents/invoice endpoints

### Secondary (MEDIUM confidence)
- Contact field availability in list vs get endpoint
- Tax default (21% IVA) — business-specific assumption

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — same libraries, same patterns
- Architecture: HIGH — extends established patterns (id-resolver, search, composite tools)
- API endpoints: HIGH — reusing existing well-tested endpoints
- Pitfalls: MEDIUM — contact name collisions, response size concerns

**Research date:** 2026-03-23
**Valid until:** 2026-04-23
