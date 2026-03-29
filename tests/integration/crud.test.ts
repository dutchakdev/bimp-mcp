import { describe, it, expect } from "vitest";
import { BimpClient } from "../../src/client.js";

const client = new BimpClient({
  email: process.env.BIMP_EMAIL!,
  password: process.env.BIMP_PASSWORD!,
  companyCode: process.env.BIMP_COMPANY_CODE!,
  baseUrl: process.env.BIMP_BASE_URL,
});

describe("Nomenclature CRUD", () => {
  let createdUuid: string;
  let unitUuid: string;

  it("should list nomenclature", async () => {
    const result = (await client.request(
      "POST",
      "/org2/nomenclature/api-readList",
      { pagination: { offset: 0, count: 5 } }
    )) as { success: boolean; data: unknown[] };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should create a nomenclature item", async () => {
    // Fetch a valid unit of measurement first (required field)
    const units = (await client.request(
      "POST",
      "/org2/unitsOfMeasurment/api-readList",
      { pagination: { offset: 0, count: 1 } }
    )) as { success: boolean; data: Array<{ uuid: string }> };
    expect(units.success).toBe(true);
    expect(units.data.length).toBeGreaterThan(0);
    unitUuid = units.data[0].uuid;

    const result = (await client.request(
      "POST",
      "/org2/nomenclature/api-create",
      {
        name: `Test Product ${Date.now()}`,
        type: "goods",
        unitOfMeasurementUuid: unitUuid,
      }
    )) as { success: boolean; data: { uuid: string } };
    expect(result.success).toBe(true);
    expect(result.data.uuid).toBeDefined();
    createdUuid = result.data.uuid;
  });

  it("should update the created item", async () => {
    expect(createdUuid).toBeDefined();
    const result = (await client.request(
      "POST",
      "/org2/nomenclature/api-update",
      { uuid: createdUuid, comment: `Updated at ${Date.now()}` }
    )) as { success: boolean };
    expect(result.success).toBe(true);
  });
});

describe("Nomenclature Group CRUD", () => {
  it("should list groups", async () => {
    const result = (await client.request(
      "POST",
      "/org2/nomenclature-group/api-readList",
      {}
    )) as { success: boolean; data: unknown[] };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});

describe("Counterparty CRUD", () => {
  it("should list counterparties", async () => {
    const result = (await client.request(
      "POST",
      "/org2/counterparty/api-readList",
      { pagination: { offset: 0, count: 5 } }
    )) as { success: boolean; data: unknown[] };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});

describe("Reference Data", () => {
  it("should read currencies", async () => {
    const result = (await client.request(
      "POST",
      "/org2/currency/api-readList",
      { pagination: { offset: 0, count: 10 } }
    )) as { success: boolean; data: Array<{ uuid: string; code: string }> };
    expect(result.success).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0]).toHaveProperty("code");
  });

  it("should read VAT rates", async () => {
    const result = (await client.request(
      "POST",
      "/org2/vat/api-readList",
      {}
    )) as { success: boolean; data: unknown[] };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should read warehouses", async () => {
    const result = (await client.request(
      "POST",
      "/org2/warehouse/api-readList",
      { pagination: { offset: 0, count: 10 } }
    )) as { success: boolean; data: unknown[] };
    expect(result.success).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("should read employees", async () => {
    const result = (await client.request(
      "POST",
      "/org2/employee/api-readList",
      { pagination: { offset: 0, count: 5 } }
    )) as { success: boolean; data: unknown[] };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});
