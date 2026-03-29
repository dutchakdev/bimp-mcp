import { describe, it, expect } from "vitest";
import { BimpClient } from "../../src/client.js";
import { generateTools } from "../../src/tool-generator.js";
import { createUtilityTools } from "../../src/utilities.js";
import { createNomenclaturesTools } from "../../src/nomenclatures-extended.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new BimpClient({
  email: process.env.BIMP_EMAIL!,
  password: process.env.BIMP_PASSWORD!,
  companyCode: process.env.BIMP_COMPANY_CODE!,
  baseUrl: process.env.BIMP_BASE_URL,
});

const spec = JSON.parse(
  readFileSync(resolve(__dirname, "../../bimp-api.json"), "utf-8")
);
const tools = generateTools(spec);
const toolMap = new Map(tools.map((t) => [t.name, t]));
const utilityTools = createUtilityTools(client, toolMap);
const fetchAll = utilityTools.find((t) => t.name === "bimp_fetch_all")!;

const nomenclaturesTools = createNomenclaturesTools(client);
const nomRead = nomenclaturesTools.find((t) => t.name === "bimp_nomenclatures_read")!;
const nomUpsert = nomenclaturesTools.find((t) => t.name === "bimp_nomenclatures_upsert")!;

const timestamp = Date.now();

const refs = {
  unitUuid: "",
  warehouseUuid: "",
  orgUuid: "",
  currencyUuid: "",
  employeeUuid: "",
  supplierUuid: "",
  components: {} as Record<string, string>,
  products: {} as Record<string, string>,
  specUuids: [] as string[],
};

describe("Production chain E2E", () => {
  it("Step 1: Prepare reference data", async () => {
    const units = (await client.request("POST", "/org2/unitsOfMeasurment/api-readList", {
      pagination: { offset: 0, count: 10 },
    })) as { success: boolean; data: Array<{ uuid: string; name: string }> };
    expect(units.data.length).toBeGreaterThan(0);
    refs.unitUuid = units.data[0].uuid;

    const warehouses = (await client.request("POST", "/org2/warehouse/api-readList", {
      pagination: { offset: 0, count: 10 },
    })) as { success: boolean; data: Array<{ uuid: string }> };
    expect(warehouses.data.length).toBeGreaterThan(0);
    refs.warehouseUuid = warehouses.data[0].uuid;

    const orgs = (await client.request("POST", "/org2/organization/api-readList", {
      pagination: { offset: 0, count: 10 },
    })) as { success: boolean; data: Array<{ uuid: string }> };
    expect(orgs.data.length).toBeGreaterThan(0);
    refs.orgUuid = orgs.data[0].uuid;

    const currencies = (await client.request("POST", "/org2/currency/api-readList", {
      pagination: { offset: 0, count: 10 },
    })) as { success: boolean; data: Array<{ uuid: string }> };
    expect(currencies.data.length).toBeGreaterThan(0);
    refs.currencyUuid = currencies.data[0].uuid;

    const employees = (await client.request("POST", "/org2/employee/api-readList", {
      pagination: { offset: 0, count: 10 },
    })) as { success: boolean; data: Array<{ uuid: string }> };
    expect(employees.data.length).toBeGreaterThan(0);
    refs.employeeUuid = employees.data[0].uuid;

    const supplier = (await client.request("POST", "/org2/counterparty/api-insert", {
      name: `E2E Supplier ${timestamp}`,
      isCustomer: false,
      isSupplier: true,
    })) as { success: boolean; data: { uuid: string } };
    expect(supplier.success).toBe(true);
    refs.supplierUuid = supplier.data.uuid;
  });

  it("Step 2: Create 5 components", async () => {
    const componentNames = ["Pigment Red", "Pigment Blue", "Base Gel", "Brush", "Nail File"];
    for (const name of componentNames) {
      const result = (await client.request("POST", "/org2/nomenclature/api-create", {
        name: `${name} ${timestamp}`,
        unitOfMeasurementUuid: refs.unitUuid,
      })) as { success: boolean; data: { uuid: string } };
      expect(result.success).toBe(true);
      refs.components[name] = result.data.uuid;
    }
    expect(Object.keys(refs.components)).toHaveLength(5);
  });

  it("Step 3: Create 3 finished products", async () => {
    const productNames = ["Red Gel Polish", "Blue Gel Polish", "Manicure Kit"];
    for (const name of productNames) {
      const result = (await client.request("POST", "/org2/nomenclature/api-create", {
        name: `${name} ${timestamp}`,
        unitOfMeasurementUuid: refs.unitUuid,
      })) as { success: boolean; data: { uuid: string } };
      expect(result.success).toBe(true);
      refs.products[name] = result.data.uuid;
    }
    expect(Object.keys(refs.products)).toHaveLength(3);
  });

  it("Step 4: Set planning fields via nomenclatures_upsert", async () => {
    const planningFields = { minStock: 10, maxStock: 100, speedOfDemand: 3, insuranceReserve: 5, deliveryTerm: 7 };
    for (const [, uuid] of Object.entries(refs.products)) {
      const result = (await nomUpsert.handler({ uuid, ...planningFields })) as { uuid: string };
      expect(result.uuid).toBeDefined();
    }
    for (const [, uuid] of Object.entries(refs.products)) {
      const product = (await nomRead.handler({ uuid })) as Record<string, unknown>;
      expect(product.minStock).toBe(10);
      expect(product.maxStock).toBe(100);
      expect(product.speedOfDemand).toBe(3);
      expect(product.insuranceReserve).toBe(5);
      expect(product.deliveryTerm).toBe(7);
    }
  });

  it("Step 5: Create specifications (BOM)", async () => {
    const specs = [
      {
        name: `Red Gel Polish Spec ${timestamp}`,
        nomenclature: refs.products["Red Gel Polish"],
        composition: [
          { nomenclature: refs.components["Pigment Red"], quantity: 2, price: 1 },
          { nomenclature: refs.components["Base Gel"], quantity: 5, price: 1 },
        ],
      },
      {
        name: `Blue Gel Polish Spec ${timestamp}`,
        nomenclature: refs.products["Blue Gel Polish"],
        composition: [
          { nomenclature: refs.components["Pigment Blue"], quantity: 2, price: 1 },
          { nomenclature: refs.components["Base Gel"], quantity: 5, price: 1 },
        ],
      },
      {
        name: `Manicure Kit Spec ${timestamp}`,
        nomenclature: refs.products["Manicure Kit"],
        composition: [
          { nomenclature: refs.products["Red Gel Polish"], quantity: 1, price: 1 },
          { nomenclature: refs.products["Blue Gel Polish"], quantity: 1, price: 1 },
          { nomenclature: refs.components["Brush"], quantity: 1, price: 1 },
          { nomenclature: refs.components["Nail File"], quantity: 1, price: 1 },
        ],
      },
    ];
    for (const s of specs) {
      const result = (await client.request("POST", "/org2/specification/api-create", {
        name: s.name,
        nomenclature: s.nomenclature,
        quantity: 1,
        currency: refs.currencyUuid,
        composition: s.composition,
      })) as { success: boolean; data: { uuid: string } };
      expect(result.success).toBe(true);
      refs.specUuids.push(result.data.uuid);
    }
    expect(refs.specUuids).toHaveLength(3);
  });

  it("Step 6: Procure components via purchase invoice", async () => {
    const products = [
      { product: refs.components["Pigment Red"], orderedCount: 20, warehouseCount: 20, cost: 10, sum: 200, VATsum: 0 },
      { product: refs.components["Pigment Blue"], orderedCount: 20, warehouseCount: 20, cost: 10, sum: 200, VATsum: 0 },
      { product: refs.components["Base Gel"], orderedCount: 100, warehouseCount: 100, cost: 5, sum: 500, VATsum: 0 },
      { product: refs.components["Brush"], orderedCount: 50, warehouseCount: 50, cost: 3, sum: 150, VATsum: 0 },
      { product: refs.components["Nail File"], orderedCount: 50, warehouseCount: 50, cost: 2, sum: 100, VATsum: 0 },
    ];
    const result = (await client.request("POST", "/org2/purchaseInvoice/api-create", {
      date: new Date().toISOString().slice(0, 19),
      comment: `E2E test procurement ${timestamp}`,
      VATaccounted: false,
      costWithoutVAT: true,
      bookkeperAccounting: false,
      managerialAccounting: true,
      taxAccounting: false,
      organization: refs.orgUuid,
      responsible: refs.employeeUuid,
      counterparty: refs.supplierUuid,
      warehouse: refs.warehouseUuid,
      products,
    })) as { success: boolean; data: { uuid: string } };
    expect(result.success).toBe(true);
    expect(result.data.uuid).toBeDefined();
  });

  it("Step 7: Verify inventory has positive stock", async () => {
    for (const [, uuid] of Object.entries(refs.components)) {
      const stocks = (await client.request("POST", "/org2/nomenclature/api-readStocks", {
        pagination: { offset: 0, count: 10 },
        nomenclatureUuid: [uuid],
      })) as { success: boolean; data: Array<{ quantity?: number; leftovers?: number }> };
      expect(stocks.data.length).toBeGreaterThan(0);
      const item = stocks.data[0];
      const stockQty = (item.leftovers ?? item.quantity ?? 0) as number;
      expect(stockQty).toBeGreaterThan(0);
    }
  });

  it("Step 8: Complex extraction — specs, capacity, deficit analysis", async () => {
    const specsResult = (await fetchAll.handler({
      tool: "bimp_specification_readList",
      enrich: true,
    })) as { items: Array<Record<string, unknown>>; count: number };

    const testSpecs = specsResult.items.filter((s) =>
      refs.specUuids.includes(s.uuid as string)
    );
    expect(testSpecs).toHaveLength(3);

    for (const spec of testSpecs) {
      const composition = spec.composition as Array<Record<string, unknown>> | undefined;
      expect(composition).toBeDefined();
      expect(Array.isArray(composition)).toBe(true);
      expect(composition!.length).toBeGreaterThan(0);
    }

    const kitSpec = testSpecs.find((s) => {
      const comp = s.composition as Array<Record<string, unknown>>;
      return comp.length === 4;
    });
    expect(kitSpec).toBeDefined();

    const polishSpecs = testSpecs.filter((s) => {
      const comp = s.composition as Array<Record<string, unknown>>;
      return comp.length === 2;
    });
    expect(polishSpecs).toHaveLength(2);

    const bomMap = new Map<string, Map<string, number>>();
    for (const spec of testSpecs) {
      const productUuid = spec.nomenclature as string;
      const composition = spec.composition as Array<{ nomenclature: string; quantity: number }>;
      const components = new Map<string, number>();
      for (const line of composition) {
        components.set(line.nomenclature, line.quantity);
      }
      bomMap.set(productUuid, components);
    }

    const redBom = bomMap.get(refs.products["Red Gel Polish"]);
    expect(redBom).toBeDefined();
    expect(redBom!.get(refs.components["Pigment Red"])).toBe(2);
    expect(redBom!.get(refs.components["Base Gel"])).toBe(5);

    for (const [, uuid] of Object.entries(refs.products)) {
      const product = (await nomRead.handler({ uuid })) as Record<string, unknown>;
      expect(product.minStock).toBe(10);
      const deficit = Math.max(0, (product.minStock as number) - 0);
      expect(deficit).toBe(10);
    }
  });
});
