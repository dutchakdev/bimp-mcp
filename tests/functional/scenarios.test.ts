import { describe, it, expect } from "vitest";
import { BimpClient } from "../../src/client.js";
import { generateTools } from "../../src/tool-generator.js";
import { createUtilityTools } from "../../src/utilities.js";
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

describe("E2E scenarios", () => {
  it("should fetch nomenclature groups with enrich=true (limit 3)", async () => {
    // nomenclature-group readList -> enriched via nomenclature-group read
    const result = (await fetchAll.handler({
      tool: "bimp_nomenclature_group_readList",
      enrich: true,
      limit: 3,
    })) as { items: unknown[]; count: number };

    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("count");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.count).toBeLessThanOrEqual(3);
    expect(result.count).toBe(result.items.length);

    if (result.count > 0) {
      // Enriched items should have full detail fields
      const first = result.items[0] as Record<string, unknown>;
      expect(first).toHaveProperty("uuid");
      expect(first).toHaveProperty("name");
    }
  });

  it("should fetch specifications with enrich=true (limit 5)", async () => {
    const result = (await fetchAll.handler({
      tool: "bimp_specification_readList",
      enrich: true,
      limit: 5,
    })) as { items: unknown[]; count: number };

    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("count");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.count).toBeLessThanOrEqual(5);
    expect(result.count).toBe(result.items.length);

    if (result.count > 0) {
      const first = result.items[0] as Record<string, unknown>;
      expect(first).toHaveProperty("uuid");
    }
  });

  it("should fetch sales invoices (limit 5) and verify structure", async () => {
    const result = (await fetchAll.handler({
      tool: "bimp_salesInvoice_readList",
      limit: 5,
    })) as { items: unknown[]; count: number };

    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("count");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.count).toBeLessThanOrEqual(5);
    expect(result.count).toBe(result.items.length);

    for (const item of result.items) {
      const record = item as Record<string, unknown>;
      expect(record).toHaveProperty("uuid");
      expect(typeof record.uuid).toBe("string");
    }
  });
});
