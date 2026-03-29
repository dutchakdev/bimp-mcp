# Nomenclatures Extended + Production Chain E2E — Design Spec

## Overview

Extend the BIMP MCP server with 3 hardcoded tools for undocumented `/org2/nomenclatures/` endpoints that expose planning/accounting fields not available in the official API. Then validate the full production chain with an E2E test covering 3 products with specifications, procurement, inventory, and planning fields.

## Background

The official API (`/org2/nomenclature/api-*`, singular) lacks planning/accounting fields (min/max stock, demand rate, safety stock, delivery time). These fields exist in the BIMP UI and are managed through an undocumented API layer at `/org2/nomenclatures/*` (plural) that uses 1C-style Cyrillic field names mixed with English.

### Discovered Endpoints

| Endpoint | Method | Request Body | Response |
|----------|--------|-------------|----------|
| `/org2/nomenclatures/read` | POST | `{ lang: "ru", uid: "<uuid>" }` | Full product card with all planning fields |
| `/org2/nomenclatures/upsert` | POST | 1C-style body (see field mapping) | `{ success: true, data: { GUID: "..." } }` |
| `/org2/nomenclatures/readList` | POST | `{}` (no params) | Array of all products with МинимальныйОстаток |

### Field Mapping (English ↔ 1C)

| English (MCP tool) | 1C (API) | Type |
|-------------------|----------|------|
| uuid | GUID | string (uuid) |
| name | Наименование | string |
| fullName | НаименованиеДляПечати | string |
| code | Код | string |
| article | Артикул | string |
| comment | Комментарий | string |
| barcode | Штрихкод | string |
| minStock | МинимальныйОстаток | number |
| maxStock | МаксимальныйОстаток | number |
| speedOfDemand | speedOfDemand | number (English in API too) |
| insuranceReserve | insuranceReserve | number (English in API too) |
| deliveryTerm | deliveryTerm | number (English in API too) |
| weight | Вес | number |
| height | Высота | number |
| width | Ширина | number |
| length | Длина | number |
| plannedCost | ПлановаяСебестоимость | number |
| isKit | ЭтоНабор | boolean |
| isService | ЭтоУслуга | boolean |
| archived | Архив | boolean |
| type | ТипНоменклатуры | number (1=goods, 2=service) |
| unitOfMeasurementUuid | ЕдиницаИзмерения.GUID | string (uuid) |
| expenseAccountUuid | СчетУчетаЗатрат.GUID | string (uuid) |
| inventoryAccountUuid | СчетУчетаЗапасов.GUID | string (uuid) |
| docType | ТипДокумента | string (always "101" for nomenclature) |

## Architecture

### New File: `src/nomenclatures-extended.ts`

Hardcoded module (not generated from OpenAPI) that registers 3 tools with English↔1C field mapping. Follows the same `UtilityTool` interface pattern from `utilities.ts`.

Exports `createNomenclaturesTools(client: BimpClient): UtilityTool[]`

### Tool 1: `bimp_nomenclatures_read`

Read full product card including planning/accounting fields.

**Input:**
```json
{ "uuid": "string (required)" }
```

**Internal call:** `POST /org2/nomenclatures/read` with `{ lang: "ru", uid: "<uuid>" }`

**Output:** English-mapped object with all fields from the mapping table above.

### Tool 2: `bimp_nomenclatures_upsert`

Create or update a product with planning/accounting fields. For update, `uuid` is required. For create, `uuid` is optional (API generates one).

**Input:**
```json
{
  "uuid": "string (required for update)",
  "name": "string (required for create)",
  "article": "string",
  "minStock": "number",
  "maxStock": "number",
  "speedOfDemand": "number",
  "insuranceReserve": "number",
  "deliveryTerm": "number",
  "unitOfMeasurementUuid": "string",
  "type": "number (1=goods, 2=service)"
}
```

**Internal call:** Maps English→1C fields, adds `ТипДокумента: "101"`, `POST /org2/nomenclatures/upsert`

**Output:** `{ uuid: "string" }`

### Tool 3: `bimp_nomenclatures_readList`

List all products from the extended endpoint (includes minStock).

**Input:** `{}` (no parameters)

**Internal call:** `POST /org2/nomenclatures/readList` with `{}`

**Output:** Array of English-mapped items (subset of fields: uuid, name, article, minStock, unitOfMeasurement, isKit, isService)

### Integration: `src/index.ts`

Import `createNomenclaturesTools`, add them to the utility tools array. They are registered alongside existing utility tools in the ListTools and CallTool handlers.

## E2E Test: `tests/functional/production-chain.test.ts`

Sequential test using real BIMP API (test company nailsmade shop 000001398).

### Step 1: Prepare reference data
- Fetch unit of measurement UUID via `unitsOfMeasurment/api-readList`
- Fetch warehouse UUID via `warehouse/api-readList`
- Fetch organization UUID via `organization/api-readList`
- Create a supplier counterparty via `counterparty/api-insert`

### Step 2: Create components (5 items)
Via `nomenclature/api-create`:
- Pigment Red, Pigment Blue, Base Gel, Brush, Nail File

### Step 3: Create finished products (3 items)
Via `nomenclature/api-create`:
- Red Gel Polish, Blue Gel Polish, Manicure Kit

### Step 4: Set planning fields
Via `bimp_nomenclatures_upsert` for each of the 3 products:
- minStock: 10, maxStock: 100, speedOfDemand: 3, insuranceReserve: 5, deliveryTerm: 7

### Step 5: Create specifications (BOM)
Via `specification/api-create`:
- Red Gel Polish = 2×Pigment Red + 5×Base Gel
- Blue Gel Polish = 2×Pigment Blue + 5×Base Gel
- Manicure Kit = 1×Red Gel Polish + 1×Blue Gel Polish + 1×Brush + 1×Nail File

### Step 6: Procure components
Via `purchaseInvoice/api-create`:
- Purchase invoice from supplier with all components:
  - Pigment Red ×20, Pigment Blue ×20, Base Gel ×100, Brush ×50, Nail File ×50

### Step 7: Verify inventory
Via `nomenclature/api-readStocks` or `inventory/api-readList`:
- Confirm all components have positive stock balances

### Step 8: Complex extraction and analysis
1. Fetch all specifications with `bimp_fetch_all` + `enrich: true` to get composition
2. For each specification: map components → quantities per unit
3. Check component stock levels
4. Calculate: how many units of each product can be produced, how many components need to be ordered to maintain minStock

### Assertions
- 3 specifications created with correct component counts
- All component stocks > 0 after procurement
- Planning fields readable via `bimp_nomenclatures_read`
- Production capacity calculation is correct based on available materials
- Deficit calculation identifies what needs to be ordered

## Documentation Updates

### `.claude/skills/bimp-api-discovery.md`
Add section: "Undocumented API Layer" — `/org2/nomenclatures/` (plural), 1C-style fields, field mapping, body format examples.

### `.claude/skills/bimp-erp-domain.md`
Add: planning/accounting fields (minStock, maxStock, speedOfDemand, insuranceReserve, deliveryTerm). Full production chain diagram including procurement. Procurement analysis pattern.

### `.claude/skills/bimp-mcp-development.md`
Add: how `nomenclatures-extended.ts` works, how to add new undocumented endpoints with field mapping.

### `src/prompts.ts`
- `bimp_erp_context`: add planning fields section
- `bimp_production_workflow`: add procurement of materials step
- `bimp_procurement_workflow`: add planning fields and procurement needs analysis pattern

### `CLAUDE.md`
Add: undocumented API layer note, `nomenclatures-extended.ts` description.

## Testing

### Unit test: `tests/unit/nomenclatures-extended.test.ts`
- Field mapping English→1C and 1C→English
- Tool definitions have correct names, descriptions, input schemas
- Mock client calls verify correct path, method, and mapped body

### Functional test: `tests/functional/production-chain.test.ts`
- Full 8-step chain described above
- Timeout: 120s (many sequential API calls)
- Cleanup: not needed (test company is disposable)
