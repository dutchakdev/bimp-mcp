<p align="center">
  <img src="assets/header.png" alt="HEYLOVE x BIMP" width="480" />
</p>

<h1 align="center">BIMP MCP</h1>

<p align="center">
  MCP server for <a href="https://bimpsoft.com">BIMP ERP</a> — a Ukrainian cloud ERP for small and medium businesses
</p>

<p align="center">
  <a href="https://github.com/dutchakdev/bimp-mcp/actions/workflows/ci.yml"><img src="https://github.com/dutchakdev/bimp-mcp/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/dutchakdev/bimp-mcp/actions/workflows/release.yml"><img src="https://github.com/dutchakdev/bimp-mcp/actions/workflows/release.yml/badge.svg" alt="Release" /></a>
  <a href="https://www.npmjs.com/package/bimp-mcp"><img src="https://img.shields.io/npm/v/bimp-mcp" alt="npm" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/bimp-mcp" alt="Node.js" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
</p>

<p align="center">
  Enable LLMs to interact with BIMP data through the <a href="https://modelcontextprotocol.io">Model Context Protocol</a>:<br/>
  read, create, update entities, perform bulk operations, and analyze business data.
</p>

---

## Features

- **~135 auto-generated tools** from OpenAPI 3.1 spec — edit `bimp-api.json`, restart, done
- **3 utility tools** for bulk operations: `bimp_fetch_all`, `bimp_batch_read`, `bimp_bulk_update`
- **6 MCP prompts** with ERP domain context, workflow guides, and data analysis patterns
- **Auto-authentication** — login on first call, transparent token refresh on 401

## Quick Start

### Prerequisites

- Node.js 20+
- A [BIMP ERP](https://bimpsoft.com) account with API access

### 1. Configure environment

Create a `.env` file (see `.env.example`):

```env
BIMP_BASE_URL=https://app.bimpsoft.com
BIMP_EMAIL=your@email.com
BIMP_PASSWORD=your-password
BIMP_COMPANY_CODE=000001398
```

### 2. Install and run

```bash
npm install
npm start
```

For development with auto-reload:

```bash
npm run dev
```

### 3. Connect your MCP client

Add to `claude_desktop_config.json` (Claude Desktop) or equivalent:

```json
{
  "mcpServers": {
    "bimp": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/path/to/bimp-mcp",
      "env": {
        "BIMP_EMAIL": "your@email.com",
        "BIMP_PASSWORD": "your-password",
        "BIMP_COMPANY_CODE": "000001398"
      }
    }
  }
}
```

## Tools

### Auto-generated (~135 tools)

Generated from `bimp-api.json` at startup. Naming: `bimp_{entity}_{action}`.

| Domain | Examples |
|---|---|
| **Sales** | `bimp_salesInvoice_readList`, `bimp_salesInvoice_create`, `bimp_invoiceForCustomerPayment_readList` |
| **Inventory** | `bimp_nomenclature_readList`, `bimp_inventory_readList_cursor`, `bimp_movementOfInventories_create` |
| **Finance** | `bimp_customerPayment_readList`, `bimp_supplierPayment_create`, `bimp_cashBox_readList` |
| **Manufacturing** | `bimp_production_order_readList`, `bimp_production_assembly_create`, `bimp_specification_read` |
| **Procurement** | `bimp_purchaseInvoice_readList`, `bimp_invoiceForSupplierPayment_create` |
| **Reference Data** | `bimp_counterparty_readList`, `bimp_employee_readList`, `bimp_warehouse_readList` |
| **Auth** | `bimp_auth_listCompanies`, `bimp_auth_switchCompany` |

### Utility tools

| Tool | Purpose |
|---|---|
| `bimp_fetch_all` | Auto-paginate any readList. Supports offset/count, cursor, page/pageSize. Optional `enrich` mode fetches full details per record. |
| `bimp_batch_read` | Parallel read of full details for an array of UUIDs with configurable concurrency. |
| `bimp_bulk_update` | Mass update records with batched concurrency and per-item error reporting. |

## Prompts

| Prompt | Description |
|---|---|
| `bimp_erp_context` | Entity structure, relationships, Ukrainian terminology mapping |
| `bimp_data_analysis` | Data analysis patterns, pagination quirks, enrichment strategies |
| `bimp_bulk_operations` | Mass operation patterns: price updates, bulk edits, imports |
| `bimp_sales_workflow` | Sales process: order, realization, payment, returns |
| `bimp_production_workflow` | Production: specification, order, assembly, material write-offs |
| `bimp_procurement_workflow` | Procurement: supplier invoice, purchase invoice, contracts |

## Testing

```bash
npm test                  # Unit tests (mocked, no API calls)
npm run test:integration  # Integration tests (requires env vars)
npm run test:functional   # Functional E2E tests (requires env vars)
npm run test:all          # All tests
```

## License

[MIT](LICENSE)
