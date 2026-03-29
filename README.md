# bimp-mcp

MCP server for [BIMP ERP](https://bimpsoft.com) -- a Ukrainian cloud-based ERP system for small and medium businesses covering sales, inventory, finance, manufacturing, and procurement.

This server enables LLMs to interact with BIMP data through the [Model Context Protocol](https://modelcontextprotocol.io): read, create, update entities, perform bulk operations, and analyze business data.

## Features

- **~135 auto-generated tools** from OpenAPI 3.1 spec -- adding a new endpoint requires only editing `bimp-api.json` and restarting
- **3 utility tools** for bulk operations: `bimp_fetch_all`, `bimp_batch_read`, `bimp_bulk_update`
- **6 MCP prompts** providing ERP domain context, workflow guides, and data analysis instructions
- **Auto-authentication** with token refresh -- login triggered on first API call, tokens refreshed transparently on 401

## Quick Start

### Prerequisites

- Node.js 20+
- A BIMP ERP account with API access

### Environment Variables

Create a `.env` file (see `.env.example`):

```env
BIMP_BASE_URL=https://app.bimpsoft.com
BIMP_EMAIL=your@email.com
BIMP_PASSWORD=your-password
BIMP_COMPANY_CODE=000001398
```

### Install and Run

```bash
npm install
npm start
```

The server starts on stdio transport. For development with auto-reload:

```bash
npm run dev
```

### MCP Client Configuration

Add to your `claude_desktop_config.json` (Claude Desktop) or equivalent MCP client config:

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

## Available Tools

### Auto-Generated (~135 tools)

Tools are generated from `bimp-api.json` at startup. Naming convention: `bimp_{entity}_{action}`.

| Domain | Examples |
|--------|----------|
| **Sales** | `bimp_salesInvoice_readList`, `bimp_salesInvoice_create`, `bimp_invoiceForCustomerPayment_readList` |
| **Inventory** | `bimp_nomenclature_readList`, `bimp_inventory_readList_cursor`, `bimp_movementOfInventories_create` |
| **Finance** | `bimp_customerPayment_readList`, `bimp_supplierPayment_create`, `bimp_cashBox_readList` |
| **Manufacturing** | `bimp_production_order_readList`, `bimp_production_assembly_create`, `bimp_specification_read` |
| **Procurement** | `bimp_purchaseInvoice_readList`, `bimp_invoiceForSupplierPayment_create` |
| **Reference Data** | `bimp_counterparty_readList`, `bimp_employee_readList`, `bimp_warehouse_readList` |
| **Auth** | `bimp_auth_listCompanies`, `bimp_auth_switchCompany` |

### Utility Tools

| Tool | Purpose |
|------|---------|
| `bimp_fetch_all` | Auto-paginate any readList endpoint. Supports offset/count, cursor, and page/pageSize pagination. Optional `enrich` mode fetches full details for each record. |
| `bimp_batch_read` | Parallel read of full details for an array of UUIDs with configurable concurrency. |
| `bimp_bulk_update` | Mass update records with batched concurrency and per-item error reporting. |

## Available Prompts

| Prompt | Description |
|--------|-------------|
| `bimp_erp_context` | Entity structure, relationships, Ukrainian terminology mapping |
| `bimp_data_analysis` | How to analyze BIMP data effectively, pagination quirks, enrichment |
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
