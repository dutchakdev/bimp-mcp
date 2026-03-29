interface PromptDef {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
}

interface PromptResult {
  messages: Array<{
    role: "user" | "assistant";
    content: { type: "text"; text: string };
  }>;
}

const PROMPTS: Record<string, { def: PromptDef; text: string }> = {
  bimp_erp_context: {
    def: {
      name: "bimp_erp_context",
      description:
        "System context about BIMP ERP: entity structure, relationships, and Ukrainian terminology mapping",
    },
    text: `# BIMP ERP System Context

## Entity Structure and Relationships

BIMP is a Ukrainian cloud ERP for SMBs. Key entities and their API names:

### Core Entities
- **Nomenclature** (nomenclature) — products and services catalog. Has groups (nomenclature-group), units of measurement, and parent/child modifications.
- **Counterparty** (counterparty) — customers and suppliers. Can be marked as isCustomer, isSupplier, or both. Has addresses, EDRPOU (tax ID), contacts.
- **Specification** (specification) — bill of materials (BOM). Links a nomenclature item to its composition (materials and quantities needed to produce it).

### Sales Flow
- **Order** (invoiceForCustomerPayment) — customer order with status workflow
- **Sales Invoice / Realization** (salesInvoice) — goods shipment document, contains products array
- **Customer Payment** (customerPayment) — payment from customer
- **Customer Return** (customer-inventories-return) — return of goods from customer
- **Refund** (refundToCustomer) — money refund to customer

### Procurement Flow
- **Supplier Invoice** (invoiceForSupplierPayment) — invoice for payment to supplier
- **Purchase Invoice** (purchaseInvoice) — incoming goods document, contains products array

### Production Flow
- **Production Order** (production-order) — manufacturing order with products to produce and materials to consume
- **Production Assembly** (production-assembly) — assembly/production execution record

### Inventory
- **Inventory** (inventory) — stock balances per warehouse (GET endpoints with page/cursor pagination)
- **Movement** (movementOfInventories) — transfer between warehouses
- **Write-off** (writeOffOfInventories) — inventory write-off/disposal

### Finance
- **Currency** (currency) — currencies with codes
- **Bank Account** (bankAccounts) — bank accounts with types
- **Cash Registry** (cashRegistry) — cash registers
- **VAT** (vat) — VAT rates
- **Chart of Accounts** (chartOfAccount) — accounting chart
- **Expense Items** (expenseItems) — expense categories
- **Other Expenses** (otherExpenses) — general expense documents
- **Expense Request** (expenseRequest) — request for funds with approval workflow

### Organization
- **Organization** (organization) — legal entities
- **Warehouse** (warehouse) — storage locations
- **Employee** (employee) — staff members with positions and statuses
- **Contract** (contract) — contracts with counterparties, types, and statuses
- **Project** (project) — project tracking
- **Price List** (priceList) — price lists with per-product prices

## Ukrainian Terminology Mapping

| Ukrainian | English | API Entity |
|-----------|---------|------------|
| Номенклатура | Nomenclature/Product | nomenclature |
| Група номенклатури | Product Group | nomenclature-group |
| Контрагент | Counterparty | counterparty |
| Специфікація | Specification/BOM | specification |
| Замовлення покупця | Customer Order | invoiceForCustomerPayment |
| Реалізація | Sales Invoice | salesInvoice |
| Оплата покупця | Customer Payment | customerPayment |
| Повернення | Customer Return | customer-inventories-return |
| Повернення коштів | Refund | refundToCustomer |
| Прихідна накладна | Purchase Invoice | purchaseInvoice |
| Рахунок постачальнику | Supplier Invoice | invoiceForSupplierPayment |
| Виробничий наказ | Production Order | production-order |
| Збірка | Production Assembly | production-assembly |
| Склад | Warehouse | warehouse |
| Залишки | Inventory/Stock | inventory |
| Переміщення | Movement | movementOfInventories |
| Списання | Write-off | writeOffOfInventories |
| Валюта | Currency | currency |
| Прайс-лист | Price List | priceList |
| Співробітник | Employee | employee |
| Договір | Contract | contract |

## Important API Behavior

1. **readList returns INCOMPLETE data** for many entities. For example, salesInvoice.readList does NOT include products, warehouse, or VAT. Use enrich=true in bimp_fetch_all or call the read endpoint separately.
2. **No total count** in paginated responses. The only way to know you've reached the end is when data.length < requested count.
3. **Max page size is 100** for offset/count pagination.
4. **Three pagination types**: offset/count (most POST endpoints), cursor (inventory), page/pageSize (inventory GET).`,
  },

  bimp_data_analysis: {
    def: {
      name: "bimp_data_analysis",
      description:
        "Guide for analyzing BIMP ERP data: how to fetch complete datasets, handle pagination, and work with incomplete readList data",
    },
    text: `# BIMP Data Analysis Guide

## Fetching Complete Data

1. **Always use bimp_fetch_all** to collect all records — it handles pagination automatically.
2. **Use enrich=true** when you need full details. Many readList endpoints return summary data:
   - salesInvoice.readList: missing products, warehouse, VAT
   - specification.readList: missing composition, cost
   - purchaseInvoice.readList: missing products, warehouse
   - production-order.readList: missing products, materials
   - customerPayment.readList: missing paymentDetails
3. **Filter by period** using the periodable field: \`filters: { periodable: ["2025-01-01T00:00:00.000Z", "2025-12-31T23:59:59.000Z"] }\`
4. **No total count** — to count records, you must fetch all of them.

## Analysis Patterns

### Sales Dynamics
1. Fetch all sales invoices for a period: bimp_fetch_all with tool=bimp_salesInvoice_readList, filters={ periodable: [...] }, enrich=true
2. Each enriched salesInvoice contains: products array with quantities and prices, counterparty, currency, date
3. Aggregate by date/counterparty/product as needed

### Inventory Analysis
1. Use bimp_inventory_readList (GET endpoint with page/pageSize pagination) for current stock
2. Or use bimp_nomenclature_readStocks for stock per nomenclature
3. Cross-reference with specifications to check material availability for production

### Production Planning
1. Fetch production orders: bimp_fetch_all with tool=bimp_production_order_readList, enrich=true
2. Enriched orders contain products (what to produce) and materials (what to consume)
3. Compare materials against inventory to identify shortages
4. Fetch specifications for BOM details

### Price Analysis
1. Fetch all price lists: bimp_fetch_all with tool=bimp_priceList_readList
2. Use bimp_priceList_readPrice with specific price list UUID and nomenclature UUID for individual prices`,
  },

  bimp_bulk_operations: {
    def: {
      name: "bimp_bulk_operations",
      description:
        "How to perform bulk data operations: mass updates, batch imports, and large-scale data modifications",
    },
    text: `# BIMP Bulk Operations Guide

## Mass Price Update
1. Fetch all nomenclature: bimp_fetch_all tool=bimp_nomenclature_readList
2. Calculate new prices
3. Use bimp_priceList_updatePrice or bimp_bulk_update tool=bimp_priceList_updatePrice for each item

## Mass Product Update
1. Fetch products: bimp_fetch_all tool=bimp_nomenclature_readList with filters
2. Filter/transform on your side
3. Update: bimp_bulk_update tool=bimp_nomenclature_update items=[{uuid, ...fields}]

## Batch Import
1. Prepare data as array of objects
2. For each entity type, use the create endpoint
3. Example: bimp_bulk_update tool=bimp_nomenclature_create items=[{name, article, ...}]
   Note: bulk_update works for create too — it just calls the tool for each item

## Counterparty Bulk Edit
1. Fetch: bimp_fetch_all tool=bimp_counterparty_readList
2. Filter by type (isCustomer, isSupplier), status, or name
3. Update: bimp_bulk_update tool=bimp_counterparty_insert (counterparty uses insert for updates)

## Best Practices
- Always check the errors array after bulk operations
- Use lower concurrency (3-5) for create/update operations to avoid rate limiting
- Use higher concurrency (10-20) for read operations
- For very large datasets (1000+), consider processing in chunks and reporting progress
- Test with a small batch first before running on the full dataset`,
  },

  bimp_sales_workflow: {
    def: {
      name: "bimp_sales_workflow",
      description:
        "Sales process workflow: from customer order to payment and returns",
    },
    text: `# BIMP Sales Workflow

## Order to Realization to Payment

### 1. Customer Order (invoiceForCustomerPayment)
- Create: bimp_invoiceForCustomerPayment_create
- Contains: counterparty, products, prices, currency
- Has status workflow: use bimp_invoiceForCustomerPayment_readStatuses for available statuses
- Update status: bimp_invoiceForCustomerPayment_updateStatus

### 2. Sales Invoice / Realization (salesInvoice)
- Create: bimp_salesInvoice_create (link to order via orderUuid)
- Contains: products shipped, warehouse, VAT, price list
- Has EntryStatus: Draft (0) or Posted (1)
- List by order: bimp_salesInvoice_readList with filter orderUuid

### 3. Customer Payment (customerPayment)
- Create: bimp_customerPayment_create (link to order)
- Contains: amount, currency, payment details
- Has status workflow: bimp_customerPayment_readStatuses
- Cancel: bimp_customerPayment_cancel
- Filter by order: bimp_customerPayment_readList with orders=[orderUuid]

## Returns and Refunds

### Customer Return (customer-inventories-return)
- Create: bimp_customer_inventories_return_create
- Returns products to inventory

### Refund (refundToCustomer)
- Create: bimp_refundToCustomer_create
- Returns money to customer
- Has EntryStatus: Draft (0) or Posted (1)`,
  },

  bimp_production_workflow: {
    def: {
      name: "bimp_production_workflow",
      description:
        "Production process: from specifications to manufacturing orders and inventory operations",
    },
    text: `# BIMP Production Workflow

## Specification to Production Order to Assembly

### 1. Specification (BOM)
- A specification defines what materials are needed to produce a product
- Read: bimp_specification_read (returns composition — array of materials with quantities)
- Create: bimp_specification_create (link to nomenclature)
- List: bimp_specification_readList (summary only — use enrich for composition details)

### 2. Production Order
- Create: bimp_production_order_create
- Contains: products to produce and materials to consume
- Has status workflow: bimp_production_order_readStatuses
- Enriched read includes: products, materials, distributionType

### 3. Production Assembly
- Records actual production execution
- Create: bimp_production_assembly_create
- Links to production order

## Related Inventory Operations

### Material Write-off (writeOffOfInventories)
- Write off materials consumed in production
- bimp_writeOffOfInventories_create

### Inventory Movement (movementOfInventories)
- Transfer materials between warehouses for production
- bimp_movementOfInventories_create

## Production Planning Pattern
1. Fetch all specifications: bimp_fetch_all tool=bimp_specification_readList enrich=true
2. Get current inventory: bimp_inventory_readList
3. Calculate what can be produced based on available materials
4. Create production orders for feasible items`,
  },

  bimp_procurement_workflow: {
    def: {
      name: "bimp_procurement_workflow",
      description:
        "Procurement process: supplier invoices, purchase documents, and supplier management",
    },
    text: `# BIMP Procurement Workflow

## Supplier Invoice to Purchase Invoice

### 1. Supplier Invoice (invoiceForSupplierPayment)
- Invoice received from supplier for payment
- Create: bimp_invoiceForSupplierPayment_create
- Has status workflow: bimp_invoiceForSupplierPayment_readStatuses

### 2. Purchase Invoice (purchaseInvoice)
- Incoming goods document — records received products
- Create: bimp_purchaseInvoice_create
- Contains: products, warehouse, VAT, counterparty
- Filter by period: periodable filter
- Filter by org: organizations filter
- Flags: showAll (include archived/drafts), managerialAccounting, bookkeperAccounting

## Related Entities

### Counterparties (suppliers)
- Filter suppliers: bimp_counterparty_readList with types filter
- Create: bimp_counterparty_insert

### Contracts
- Manage supplier contracts: bimp_contract_create / bimp_contract_update
- Link to counterparty, currency, price list
- Types: bimp_contract_readTypes
- Statuses: bimp_contract_readStatuses

## Procurement Planning Pattern
1. Analyze current inventory: bimp_fetch_all tool=bimp_inventory_readList (or bimp_nomenclature_readStocks)
2. Check specifications for required materials: bimp_fetch_all tool=bimp_specification_readList enrich=true
3. Identify shortages
4. Create supplier invoices for needed materials`,
  },
};

export function getPrompts(): PromptDef[] {
  return Object.values(PROMPTS).map((p) => p.def);
}

export function handleGetPrompt(
  name: string,
  _args?: Record<string, string>
): PromptResult {
  const prompt = PROMPTS[name];
  if (!prompt) {
    return {
      messages: [
        {
          role: "user",
          content: { type: "text", text: `Unknown prompt: ${name}` },
        },
      ],
    };
  }

  return {
    messages: [
      {
        role: "user",
        content: { type: "text", text: prompt.text },
      },
    ],
  };
}
