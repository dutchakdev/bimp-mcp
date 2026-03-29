import { describe, it, expect } from "vitest";
import { BimpClient } from "../../src/client.js";

const client = new BimpClient({
  email: process.env.BIMP_EMAIL!,
  password: process.env.BIMP_PASSWORD!,
  companyCode: process.env.BIMP_COMPANY_CODE!,
  baseUrl: process.env.BIMP_BASE_URL,
});

describe("Inventory — page/pageSize pagination", () => {
  it("should read inventory list with page params", async () => {
    const warehouses = (await client.request(
      "POST",
      "/org2/warehouse/api-readList",
      { pagination: { offset: 0, count: 1 } }
    )) as { success: boolean; data: Array<{ uuid: string }> };

    const orgs = (await client.request(
      "POST",
      "/org2/organization/api-readList",
      { pagination: { offset: 0, count: 1 } }
    )) as { success: boolean; data: Array<{ uuid: string }> };

    if (warehouses.data.length === 0 || orgs.data.length === 0) {
      console.log("Skipping: no warehouses or orgs available");
      return;
    }

    const result = (await client.request(
      "GET",
      "/org2/inventory/api-readList",
      {
        orgId: orgs.data[0].uuid,
        warehouseId: warehouses.data[0].uuid,
        page: 1,
        pageSize: 5,
      }
    )) as { success: boolean; data: unknown[] };

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});

describe("Inventory — cursor pagination", () => {
  it("should read inventory with cursor", async () => {
    const orgs = (await client.request(
      "POST",
      "/org2/organization/api-readList",
      { pagination: { offset: 0, count: 1 } }
    )) as { success: boolean; data: Array<{ uuid: string }> };

    const warehouses = (await client.request(
      "POST",
      "/org2/warehouse/api-readList",
      { pagination: { offset: 0, count: 1 } }
    )) as { success: boolean; data: Array<{ uuid: string }> };

    if (warehouses.data.length === 0 || orgs.data.length === 0) {
      console.log("Skipping: no warehouses or orgs available");
      return;
    }

    const result = (await client.request(
      "GET",
      "/org2/inventory/api-readList/cursor",
      {
        orgId: orgs.data[0].uuid,
        warehouseId: warehouses.data[0].uuid,
      }
    )) as unknown;

    expect(result).toBeDefined();
  });
});
