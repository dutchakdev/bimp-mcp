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

describe("bimp_fetch_all", () => {
  it("should fetch all warehouses (small dataset, no pagination)", async () => {
    const result = (await fetchAll.handler({
      tool: "bimp_warehouse_readList",
    })) as { items: unknown[]; count: number };

    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("count");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.count).toBe(result.items.length);
    expect(result.count).toBeGreaterThan(0);

    const first = result.items[0] as Record<string, unknown>;
    expect(first).toHaveProperty("uuid");
  });

  it("should fetch nomenclature with limit=5", async () => {
    const result = (await fetchAll.handler({
      tool: "bimp_nomenclature_readList",
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

  it("should fetch with limit=10 and verify structure", async () => {
    const result = (await fetchAll.handler({
      tool: "bimp_nomenclature_readList",
      limit: 10,
    })) as { items: unknown[]; count: number };

    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("count");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.count).toBeLessThanOrEqual(10);
    expect(result.count).toBe(result.items.length);

    for (const item of result.items) {
      const record = item as Record<string, unknown>;
      expect(record).toHaveProperty("uuid");
      expect(typeof record.uuid).toBe("string");
    }
  });
});
