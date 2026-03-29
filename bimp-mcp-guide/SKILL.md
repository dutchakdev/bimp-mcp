---
name: bimp-mcp-guide
description: Guide for using BIMP MCP tools effectively. Use when you have bimp-mcp tools available — covers tool naming, pagination, data fetching patterns, bulk operations, and workflow recipes.
---

# BIMP MCP Tools Guide

Use this skill when BIMP MCP tools are available to understand tool naming, data fetching patterns, and workflow recipes.

## Tool Naming Convention

All tools follow `bimp_{entity}_{action}`:

| Action | Description | Example |
|--------|-------------|---------|
| readList | List with pagination | `bimp_nomenclature_readList` |
| read | Read single by UUID | `bimp_nomenclature_read` |
| create | Create new | `bimp_nomenclature_create` |
| update | Update existing | `bimp_nomenclature_update` |
| delete | Delete by UUID | `bimp_nomenclature_delete` |
| readStatuses | Get available statuses | `bimp_salesInvoice_readStatuses` |
| updateStatus | Change status | `bimp_salesInvoice_updateStatus` |

## Utility Tools

### bimp_fetch_all
Auto-paginate any readList endpoint. Handles offset, cursor, and page pagination.

```json
{
  "tool": "bimp_nomenclature_readList",
  "limit": 50,
  "enrich": true,
  "filters": { "nameContains": "gel" }
}
```

**Always use `enrich: true`** for salesInvoice, specification, purchaseInvoice, production-order — their readList data is incomplete.

### bimp_batch_read
Read multiple items by UUID in parallel.

```json
{
  "tool": "bimp_nomenclature_read",
  "uuids": ["uuid1", "uuid2", "uuid3"],
  "concurrency": 10
}
```

### bimp_bulk_update
Update multiple items in parallel. Works for create too.

```json
{
  "tool": "bimp_nomenclature_update",
  "items": [{ "uuid": "...", "name": "New Name" }],
  "concurrency": 5
}
```

## Extended Nomenclature Tools

For planning/accounting fields not in the standard API:

| Tool | Purpose |
|------|---------|
| `bimp_nomenclatures_read` | Full product card with minStock, maxStock, speedOfDemand, etc. |
| `bimp_nomenclatures_upsert` | Create/update with planning fields |
| `bimp_nomenclatures_readList` | List all with minStock |

Note: these use `/org2/nomenclatures/` (plural) — different from `/org2/nomenclature/` (singular).

## Auth Tools

| Tool | Purpose |
|------|---------|
| `bimp_auth_listCompanies` | List accessible companies |
| `bimp_auth_switchCompany` | Switch by code or UUID |

## Common Workflows

### Fetch All Products with Details
```
bimp_fetch_all { tool: "bimp_nomenclature_readList", enrich: true }
```

### Sales Analysis for a Period
```
bimp_fetch_all {
  tool: "bimp_salesInvoice_readList",
  enrich: true,
  filters: { periodable: ["2026-01-01T00:00:00.000Z", "2026-03-31T23:59:59.000Z"] }
}
```

### Check What Can Be Produced
1. `bimp_fetch_all { tool: "bimp_specification_readList", enrich: true }` — get BOMs
2. `bimp_nomenclature_readStocks` — get current inventory
3. For each spec: min(stock[component] / bom[component].quantity) = max producible units

### Mass Price Update
1. `bimp_fetch_all { tool: "bimp_nomenclature_readList" }` — get products
2. Calculate new prices
3. `bimp_bulk_update { tool: "bimp_priceList_updatePrice", items: [...] }`

### Production Planning with Planning Fields
1. `bimp_nomenclatures_read { uuid }` — get minStock, speedOfDemand, deliveryTerm
2. `bimp_nomenclature_readStocks` — current stock
3. deficit = max(0, minStock - currentStock)
4. Check BOMs for component requirements
5. Create production orders for feasible items

## Tips

- Use `bimp_fetch_all` instead of manual pagination
- Always `enrich: true` for documents with product lines
- Filter by period with `periodable: [start, end]` in ISO format
- Counterparties can be both customer (`isCustomer`) and supplier (`isSupplier`)
- Documents use `EntryStatus: 0` (Draft) / `EntryStatus: 1` (Posted)
