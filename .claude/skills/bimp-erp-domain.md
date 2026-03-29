# BIMP ERP Domain Knowledge

## Entity Relationship Graph

```
Organization
  |
  +-- Warehouse (storage locations)
  +-- Employee (staff members)
  +-- BankAccount / CashRegistry (financial accounts)
  +-- Currency / VAT (reference data)
  +-- ChartOfAccount / ExpenseItems (accounting)
  |
  +-- Nomenclature (products & services catalog)
  |     |
  |     +-- NomenclatureGroup (product categories)
  |     +-- UnitOfMeasurement
  |     +-- Specification (BOM: materials + quantities)
  |     +-- PriceList (prices per product)
  |     +-- Inventory (stock balances per warehouse)
  |
  +-- Counterparty (customers & suppliers)
  |     |
  |     +-- Contract (terms, currency, price list)
  |     +-- Project (project tracking)
  |
  +-- Sales Flow
  |     |
  |     +-- InvoiceForCustomerPayment (customer order)
  |     +-- SalesInvoice (shipment / realization)
  |     +-- CustomerPayment (payment received)
  |     +-- CustomerInventoriesReturn (goods return)
  |     +-- RefundToCustomer (money refund)
  |
  +-- Procurement Flow
  |     |
  |     +-- InvoiceForSupplierPayment (supplier invoice)
  |     +-- PurchaseInvoice (incoming goods)
  |
  +-- Production Flow
  |     |
  |     +-- ProductionOrder (manufacturing order)
  |     +-- ProductionAssembly (assembly execution)
  |
  +-- Inventory Operations
        |
        +-- MovementOfInventories (transfer between warehouses)
        +-- WriteOffOfInventories (disposal / write-off)
```

## Ukrainian to API Entity Mapping

| Ukrainian Term | English Term | API Entity Name | API Path Prefix |
|---|---|---|---|
| Номенклатура | Nomenclature / Product | nomenclature | /org2/nomenclature/ |
| Група номенклатури | Product Group | nomenclature-group | /org2/nomenclature-group/ |
| Одиниця виміру | Unit of Measurement | unitsOfMeasurment | /org2/unitsOfMeasurment/ |
| Контрагент | Counterparty | counterparty | /org2/counterparty/ |
| Специфікація | Specification / BOM | specification | /org2/specification/ |
| Замовлення покупця | Customer Order | invoiceForCustomerPayment | /org2/invoiceForCustomerPayment/ |
| Реалізація | Sales Invoice | salesInvoice | /org2/salesInvoice/ |
| Оплата покупця | Customer Payment | customerPayment | /org2/customerPayment/ |
| Повернення товару | Customer Return | customer-inventories-return | /org2/customer-inventories-return/ |
| Повернення коштів | Refund | refundToCustomer | /org2/refundToCustomer/ |
| Рахунок постачальнику | Supplier Invoice | invoiceForSupplierPayment | /org2/invoiceForSupplierPayment/ |
| Прихідна накладна | Purchase Invoice | purchaseInvoice | /org2/purchaseInvoice/ |
| Виробничий наказ | Production Order | production-order | /org2/production-order/ |
| Збірка | Production Assembly | production-assembly | /org2/production-assembly/ |
| Склад | Warehouse | warehouse | /org2/warehouse/ |
| Залишки | Inventory / Stock | inventory | /org2/inventory/ |
| Переміщення | Movement | movementOfInventories | /org2/movementOfInventories/ |
| Списання | Write-off | writeOffOfInventories | /org2/writeOffOfInventories/ |
| Валюта | Currency | currency | /org2/currency/ |
| ПДВ | VAT | vat | /org2/vat/ |
| Прайс-лист | Price List | priceList | /org2/priceList/ |
| Співробітник | Employee | employee | /org2/employee/ |
| Договір | Contract | contract | /org2/contract/ |
| Проект | Project | project | /org2/project/ |
| Організація | Organization | organization | /org2/organization/ |
| Банківський рахунок | Bank Account | bankAccounts | /org2/bankAccounts/ |
| Каса | Cash Registry | cashRegistry | /org2/cashRegistry/ |
| Стаття витрат | Expense Item | expenseItems | /org2/expenseItems/ |
| Інші витрати | Other Expenses | otherExpenses | /org2/otherExpenses/ |
| Заявка на витрати | Expense Request | expenseRequest | /org2/expenseRequest/ |

## readList: Incomplete vs Full Data

Many `readList` endpoints return summary records that are missing important nested fields. Use `bimp_fetch_all` with `enrich=true` or call the individual `read` endpoint to get the full record.

| Entity (readList tool) | Incomplete in readList | Full in read | Key Missing Fields |
|---|---|---|---|
| salesInvoice (bimp_salesInvoice_readList) | Yes | Yes | products[], warehouse, VAT, priceList |
| specification (bimp_specification_readList) | Yes | Yes | composition[] (materials + quantities), cost |
| purchaseInvoice (bimp_purchaseInvoice_readList) | Yes | Yes | products[], warehouse, VAT |
| production-order (bimp_production_order_readList) | Yes | Yes | products[], materials[], distributionType |
| customerPayment (bimp_customerPayment_readList) | Yes | Yes | paymentDetails |
| nomenclature (bimp_nomenclature_readList) | Partial | Yes | Full descriptions, some nested refs |
| counterparty (bimp_counterparty_readList) | Partial | Yes | Full address details, contacts |
| invoiceForCustomerPayment (bimp_invoiceForCustomerPayment_readList) | Partial | Yes | Full product lines, custom fields |
| warehouse (bimp_warehouse_readList) | No | N/A | readList returns complete data |
| currency (bimp_currency_readList) | No | N/A | readList returns complete data |
| vat (bimp_vat_readList) | No | N/A | readList returns complete data |
| employee (bimp_employee_readList) | No | N/A | readList returns complete data |
| nomenclature-group (bimp_nomenclature_group_readList) | No | N/A | readList returns complete data |

## Important API Behaviors

1. **No total count in responses**: Paginated responses do not include a total record count. The only way to detect the last page is when `data.length < requested count`.
2. **Max page size is 100**: The offset/count pagination accepts a maximum `count` of 100.
3. **Three pagination types**:
   - **offset/count** (most POST endpoints): `{ pagination: { offset: 0, count: 100 } }`
   - **cursor** (inventory cursor): GET with `cursor` query param
   - **page/pageSize** (inventory list): GET with `page` and `pageSize` query params
4. **All mutations are POST**: Even updates and deletes use POST, not PUT/PATCH/DELETE.
5. **UUID is the primary identifier**: All entities use UUID as their primary key.
6. **Counterparty dual role**: A counterparty can be both `isCustomer: true` and `isSupplier: true`.
7. **EntryStatus**: Documents like salesInvoice and refundToCustomer use `EntryStatus: 0` (Draft) and `EntryStatus: 1` (Posted).
8. **Period filter**: Date-ranged entities accept `periodable: ["2025-01-01T00:00:00.000Z", "2025-12-31T23:59:59.000Z"]` for filtering by period.
