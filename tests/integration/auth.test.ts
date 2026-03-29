import { describe, it, expect } from "vitest";
import { BimpClient } from "../../src/client.js";

const config = {
  email: process.env.BIMP_EMAIL!,
  password: process.env.BIMP_PASSWORD!,
  companyCode: process.env.BIMP_COMPANY_CODE!,
  baseUrl: process.env.BIMP_BASE_URL,
};

describe("Auth Integration", () => {
  it("should login and make a request", async () => {
    const client = new BimpClient(config);
    const result = (await client.request(
      "POST",
      "/org2/warehouse/api-readList",
      { pagination: { offset: 0, count: 10 } }
    )) as { success: boolean; data: unknown[] };

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should list companies", async () => {
    const client = new BimpClient(config);
    const companies = (await client.listCompanies()) as Array<{
      uuid: string;
      name: string;
      code: string;
    }>;

    expect(Array.isArray(companies)).toBe(true);
    expect(companies.length).toBeGreaterThan(0);
    expect(companies[0]).toHaveProperty("uuid");
    expect(companies[0]).toHaveProperty("name");
  });

  it("should switch company", async () => {
    const client = new BimpClient(config);
    await client.request("POST", "/org2/warehouse/api-readList", {
      pagination: { offset: 0, count: 1 },
    });
    await client.switchCompany(config.companyCode);
    const result = (await client.request(
      "POST",
      "/org2/warehouse/api-readList",
      { pagination: { offset: 0, count: 1 } }
    )) as { success: boolean };
    expect(result.success).toBe(true);
  });

  it("should reuse tokens across requests", async () => {
    const client = new BimpClient(config);
    const r1 = (await client.request(
      "POST",
      "/org2/currency/api-readList",
      { pagination: { offset: 0, count: 10 } }
    )) as { success: boolean };
    const r2 = (await client.request(
      "POST",
      "/org2/vat/api-readList",
      {}
    )) as { success: boolean };
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });
});
