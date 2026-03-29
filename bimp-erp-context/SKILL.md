---
name: bimp-erp-context
description: ERP domain knowledge for BIMP (bimpsoft.com). Use when working with BIMP MCP tools — provides entity relationships, Ukrainian terminology mapping, API patterns, and planning/accounting field reference.
---

# BIMP ERP Context

Use this skill when working with BIMP MCP tools to understand the ERP domain, entity relationships, and API behavior.

## Entity Relationships

```
Organization
  +-- Warehouse (storage locations)
  +-- Employee (staff)
  +-- Currency / VAT (reference data)
  |
  +-- Nomenclature (products & services)
  |     +-- NomenclatureGroup (categories)
  |     +-- UnitOfMeasurement
  |     +-- Specification (BOM: materials + quantities)
  |     +-- PriceList (per-product prices)
  |     +-- Inventory (stock balances per warehouse)
  |
  +-- Counterparty (customers & suppliers)
  |     +-- Contract (terms, currency, price list)
  |
  +-- Sales: Order -> SalesInvoice -> CustomerPayment
  +-- Procurement: SupplierInvoice -> PurchaseInvoice
  +-- Production: Specification -> ProductionOrder -> ProductionAssembly
  +-- Inventory: Movement, Write-off
```

## Full Production Chain

```
Counterparty (supplier)
  -> PurchaseInvoice (procure components)
    -> Inventory (components in stock)
      -> Specification (BOM: components -> product)
        -> ProductionOrder (plan production)
          -> ProductionAssembly (execute)
            -> Inventory (finished goods)
              -> SalesInvoice (sell to customer)
```

## Ukrainian Terminology

| Ukrainian | English | API Entity |
|-----------|---------|------------|
| Номенклатура | Product | nomenclature |
| Контрагент | Counterparty | counterparty |
| Специфікація | Specification/BOM | specification |
| Замовлення покупця | Customer Order | invoiceForCustomerPayment |
| Реалізація | Sales Invoice | salesInvoice |
| Прихідна накладна | Purchase Invoice | purchaseInvoice |
| Виробничий наказ | Production Order | production-order |
| Склад | Warehouse | warehouse |
| Залишки | Inventory | inventory |

## Key API Behaviors

1. **readList returns INCOMPLETE data** for many entities (salesInvoice, specification, purchaseInvoice, production-order). Use `bimp_fetch_all` with `enrich=true` or call the `read` endpoint for full details.
2. **No total count** in paginated responses. Last page: `data.length < requested count`.
3. **Max page size is 100** for offset/count pagination.
4. **All mutations are POST** — even updates and deletes.
5. **UUID is the primary key** for all entities.

## Planning & Accounting Fields

Available only via extended tools (`bimp_nomenclatures_read`, `bimp_nomenclatures_upsert`):

| Field | Description |
|-------|-------------|
| minStock | Minimum stock level — triggers reorder |
| maxStock | Maximum stock level — replenishment target |
| speedOfDemand | Demand rate per period |
| insuranceReserve | Safety stock buffer |
| deliveryTerm | Delivery lead time in days |
| plannedCost | Planned unit cost |

These are NOT available in the standard `bimp_nomenclature_read` tool.

## Procurement Analysis Pattern

1. Read planning fields via `bimp_nomenclatures_read` for each product
2. Get current stock via `bimp_nomenclature_readStocks`
3. Fetch BOMs via `bimp_fetch_all` with `tool=bimp_specification_readList`, `enrich=true`
4. Calculate deficit: `max(0, minStock - currentStock)`
5. Explode BOM to get required component quantities
6. Compare component needs against component stock
7. Prioritize by `deliveryTerm` (longest lead time first)
