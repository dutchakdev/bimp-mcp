# BIMP MCP Server — Design Spec

## Overview

MCP (Model Context Protocol) server that wraps the BIMP ERP API (bimpsoft.com), enabling LLMs to interact with BIMP data: read, create, update entities, perform bulk operations, and analyze business data.

**BIMP** is a Ukrainian cloud-based ERP system for SMBs covering sales, inventory, finance, manufacturing, and procurement.

## Key Design Decisions

1. **Dynamic tool generation** — tools are auto-generated from `bimp-api.json` (OpenAPI 3.1 spec) at startup. Adding a new endpoint = editing the JSON file, no code changes.
2. **Smart auth** — auto-login from env vars on first API call, auto-refresh tokens, with manual tools for switching companies.
3. **Utility tools** — 3 tools for bulk operations (fetch_all, batch_read, bulk_update) that handle API quirks internally.
4. **MCP prompts** — 6 prompts providing ERP domain context, workflow guides, and data analysis instructions for the consuming LLM.
5. **Claude Code skills** — 4 skills for developers working on this codebase.
6. **Three-tier tests** — unit (mocked), integration (real API), functional (E2E scenarios).
7. **All English** — code, comments, docs, prompts, tests, commit messages.

## Architecture

```
bimp-mcp/
├── package.json              # @modelcontextprotocol/sdk, vitest, tsx
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── bimp-api.json             # OpenAPI spec — source of truth for tool generation
├── src/
│   ├── index.ts              # MCP server entry, stdio transport
│   ├── client.ts             # HTTP client, auth flow, token management
│   ├── tool-generator.ts     # OpenAPI spec → MCP tool definitions + handlers
│   ├── utilities.ts          # bimp_fetch_all, bimp_batch_read, bimp_bulk_update
│   └── prompts/
│       ├── index.ts          # Prompt registration
│       ├── erp-context.ts    # BIMP entity structure, relationships, terminology
│       ├── data-analysis.ts  # How to analyze BIMP data effectively
│       ├── bulk-operations.ts # Mass edit/import/export patterns
│       └── workflows.ts      # Sales, production, procurement workflows
├── tests/
│   ├── unit/
│   │   ├── tool-generator.test.ts
│   │   └── utilities.test.ts
│   ├── integration/
│   │   ├── auth.test.ts
│   │   ├── crud.test.ts
│   │   └── inventory.test.ts
│   └── functional/
│       ├── fetch-all.test.ts
│       ├── batch-read.test.ts
│       ├── bulk-update.test.ts
│       └── scenarios.test.ts
├── .claude/
│   └── skills/
│       ├── bimp-api-discovery.md
│       ├── bimp-erp-domain.md
│       ├── bimp-mcp-development.md
│       └── bimp-testing.md
└── CLAUDE.md
```

## HTTP Client (`client.ts`)

### Auth Flow

1. First API call triggers auto-login: `POST /org2/auth/api-login` with email/password from env → returns `accessToken` + `refreshToken`
2. Then `POST /org2/auth/api-selectCompany` with company code from env → returns `companyAccessToken`
3. All subsequent requests use header `access-token: {companyAccessToken}`
4. On 401 response → attempt `POST /org2/auth/api-refresh` with refreshToken → if that also 401 → full re-login
5. Max 1 retry per request after token refresh

### Environment Variables

```
BIMP_BASE_URL=https://app.bimpsoft.com   # default
BIMP_EMAIL=<user email>
BIMP_PASSWORD=<user password>
BIMP_COMPANY_CODE=<company code>          # e.g. 000001398
```

### Request Defaults

- Header `accept-language: uk-UA` on all requests
- Content-Type: `application/json`
- Timeout: 30s for regular requests, 120s for utility bulk operations

### Auth Tools

In addition to auto-login, two explicit tools are registered:

- `bimp_auth_listCompanies` — calls `POST /org2/company/api-readDetailedList`, returns available companies
- `bimp_auth_switchCompany` — switches to a different company by code or uuid, obtains new companyAccessToken

## Tool Generator (`tool-generator.ts`)

Reads `bimp-api.json` at startup and generates one MCP tool per endpoint.

### Naming Convention

```
/org2/{entity}/api-{action}           →  bimp_{entity}_{action}
/org2/{entity}/api-{action}/v2        →  bimp_{entity}_{action}_v2
/org2/inventory/api-readList/cursor   →  bimp_inventory_readList_cursor
/org2/inventory/api-read/{id}/stock   →  bimp_inventory_read_stock
```

Hyphens in entity names converted to underscores: `customer-inventories-return` → `customer_inventories_return`.

### Excluded Endpoints

- `GET /org2/images/download` — binary content
- `GET /org2/integration/zohoPeople/*/webhook` — webhook callback
- `POST /org2/auth/verifyCompanyAccess` — internal microservice endpoint
- Auth endpoints (login, refresh, selectCompany) — handled internally by client

### Schema Transformation

- OpenAPI `requestBody.schema` → MCP tool `inputSchema`
- `accept-language` header parameter stripped (always `uk-UA`)
- GET query params → properties in inputSchema
- Path params (e.g. `{productHex}`) → required properties in inputSchema

### Tool Metadata

Each generated tool stores metadata: original HTTP method, path, tag, and pagination type. This is used by utility tools to determine behavior.

## Utility Tools (`utilities.ts`)

### `bimp_fetch_all`

Fetches ALL records from any readList endpoint with auto-pagination.

**Input:**
```json
{
  "tool": "bimp_nomenclature_readList",
  "filters": { "nameContains": "paint" },
  "enrich": false,
  "limit": 0
}
```

- `tool` — which readList tool to call
- `filters` — optional filters passed to the endpoint
- `enrich` — if true, after collecting all UUIDs from readList, calls the corresponding `read` endpoint for each to get full data
- `limit` — 0 = fetch all, otherwise stop after N records

**Pagination logic:**
- Determines pagination type from tool metadata
- **offset/count**: loops with `offset += 100`, stops when `data.length < 100` (API returns no total count)
- **cursor**: passes cursor from previous response
- **page/pageSize**: increments page number

**Returns:** `{ items: [...], count: N }`

### `bimp_batch_read`

Parallel read of full details for an array of UUIDs.

**Input:**
```json
{
  "tool": "bimp_nomenclature_read",
  "uuids": ["uuid1", "uuid2", "..."],
  "concurrency": 10
}
```

**Logic:**
- Splits into batches of `concurrency` (default 10)
- `Promise.allSettled` per batch — does not stop on individual errors
- Returns `{ items: [...], errors: [...] }`

### `bimp_bulk_update`

Mass update of records.

**Input:**
```json
{
  "tool": "bimp_nomenclature_update",
  "items": [
    { "uuid": "...", "name": "new name" },
    { "uuid": "...", "article": "ART-01" }
  ],
  "concurrency": 5
}
```

**Logic:**
- Processes in batches of `concurrency` (default 5, lower than read to be cautious)
- Returns `{ updated: N, errors: [...] }` with error details per UUID

## API Patterns (discovered from spec analysis)

### Pagination

| Type | Endpoints | Mechanism |
|------|-----------|-----------|
| offset/count | 33 POST endpoints | `{ pagination: { offset: 0, count: 100 } }` in request body, max 100 |
| cursor | 2 GET endpoints | `/cursor` path suffix, cursor token in response |
| page/pageSize | 3 GET endpoints | `page` and `pageSize` query params |
| none | 15 POST endpoints | Return all results (reference data: statuses, types) |

**Critical: no total count** — all paginated responses return only `{ success, data: [...] }`. To know when done: `data.length < requested count` means last page.

### readList vs read — Data Completeness

Many entities return **summary data** in readList and **full details** in read:

| Entity | Missing from readList |
|--------|----------------------|
| salesInvoice | products, warehouse, priceList, VAT, VATaccounted, lineOfBusiness, settlementType |
| specification | composition, cost, currency, comment |
| purchaseInvoice | products, warehouse, contract, costWOVat, shipmentDate, orderInTablePart |
| production-order | products, materials, archived, baseDocument, distributionType |
| customerPayment | paymentDetails, commission, exchangeRateDifference, remainder, responsible, sum |
| contract | code, comment, currencyRateSource, date, lineOfBusiness, manager, organization, priceList, printName |

Entities with **identical** readList/read fields: counterparty, employee.

This is why `bimp_fetch_all` has the `enrich` parameter — it fetches summaries first, then full details.

### Filters

- **Date ranges**: `periodable: ["2025-01-01T00:00:00.000Z", "2025-12-31T23:59:59.000Z"]`
- **Text search**: `name`, `nameContains`, `code`, `article`
- **UUID arrays**: `nomenclatureUuids`, `organizations`, `orders`
- **Status**: `status`, `entryStatus`
- **Booleans**: `showAll`, `includeArchived`, `main`, `managerialAccounting`

## MCP Prompts

Six prompts available to the consuming LLM:

### `bimp_erp_context`
System-level context about BIMP ERP:
- Entity structure and relationships (nomenclature → group → specification → production order)
- Ukrainian terminology ↔ API entity mapping (e.g. "реалізація" = salesInvoice, "прихідна накладна" = purchaseInvoice)
- Document statuses, posting, archiving business rules

### `bimp_data_analysis`
How to analyze BIMP data effectively:
- Use `bimp_fetch_all` to collect complete datasets
- When details needed (products, composition) — always use `enrich: true`
- Filter with `periodable` for time-based reports
- No total count — must fetch all to count

### `bimp_bulk_operations`
Mass operation patterns:
- Price updates: fetch_all nomenclature → bulk_update via priceList
- Product editing: fetch_all → filter client-side → bulk_update
- Import: batch create via respective tool
- Always check `errors` array after bulk operations

### `bimp_sales_workflow`
Sales process: order (invoiceForCustomerPayment) → realization (salesInvoice) → payment (customerPayment). Returns: customer-inventories-return → refundToCustomer. Status transitions.

### `bimp_production_workflow`
Production process: specification → production-order → production-assembly. Links to nomenclature and inventory. Material write-offs (writeOffOfInventories), movements (movementOfInventories).

### `bimp_procurement_workflow`
Procurement process: supplier invoice (invoiceForSupplierPayment) → purchase invoice (purchaseInvoice). Links to counterparties, contracts, warehouses.

## Claude Code Skills

Four skills for developers working on this codebase (stored in `.claude/skills/`):

### `bimp-api-discovery`
How to investigate the BIMP frontend for undocumented endpoints:
- Analyzing network requests in app.bimpsoft.com
- OpenAPI 3.1 format for adding new endpoints to `bimp-api.json`
- Checklist: path, method, request body schema, response schema, auth requirement, tag
- Verification: confirm the tool generates correctly after spec update

### `bimp-erp-domain`
ERP domain knowledge for development:
- Ukrainian terms ↔ API entities mapping
- Entity relationship graph
- Business rules (document statuses, posting, archiving)
- Which readList endpoints return incomplete data vs full data

### `bimp-mcp-development`
How to work with this codebase:
- How tool-generator parses the spec
- How to add a new utility tool
- How to add a new MCP prompt
- Naming conventions, file structure

### `bimp-testing`
How to test:
- Unit: mock client, test logic
- Integration: test company nailsmade shop (000001398), cleanup after tests
- Functional: E2E scenarios
- How to add tests for new endpoints

## Testing

### Configuration

- **Framework**: Vitest
- **Runner**: `tsx` (TypeScript execution without build step)

### Commands

```bash
npm test                  # Unit tests (fast, no API calls)
npm run test:integration  # Integration tests (requires env vars)
npm run test:functional   # Functional E2E tests (requires env vars)
npm run test:all          # All tests
```

### Test Company

Integration and functional tests use the test company **nailsmade shop** (code: `000001398`). Tests create test data → verify → clean up.

### Unit Tests (`tests/unit/`)

- `tool-generator.test.ts` — spec parsing produces correct tool definitions, naming, schema transformation, exclusion rules
- `utilities.test.ts` — pagination logic (offset/count, cursor, page), batching, error handling, enrich flow (with mocked client)

### Integration Tests (`tests/integration/`)

- `auth.test.ts` — login → select company → refresh token → switch company
- `crud.test.ts` — read/create/update cycle for each domain entity
- `inventory.test.ts` — cursor-based and page/pageSize pagination

### Functional Tests (`tests/functional/`)

- `fetch-all.test.ts` — full pagination, enrich mode, filters, limit
- `batch-read.test.ts` — parallel reads, error handling, concurrency
- `bulk-update.test.ts` — mass updates, error reporting
- `scenarios.test.ts` — E2E: "fetch all products with specifications", "bulk price update"

## Runtime

- **Node.js** with TypeScript
- **`tsx`** for direct execution without build step
- **Transport**: stdio (standard MCP transport)
- **Entry**: `npx tsx src/index.ts`

## Extensibility

The API spec is incomplete. New endpoints will be discovered by investigating the BIMP frontend. To add a new endpoint:

1. Open `bimp-api.json`
2. Add the endpoint in OpenAPI 3.1 format (path, method, requestBody, responses, tags, security)
3. Restart the MCP server — the new tool is auto-generated
4. Add integration test in `tests/integration/crud.test.ts`

No code changes required for new endpoints.
