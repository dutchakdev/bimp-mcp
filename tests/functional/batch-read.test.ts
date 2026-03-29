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
const batchRead = utilityTools.find((t) => t.name === "bimp_batch_read")!;

describe("bimp_batch_read", () => {
  it("should batch read nomenclature group details", async () => {
    // Step 1: Fetch nomenclature groups via direct API call (reliable)
    const listResponse = (await client.request(
      "POST",
      "/org2/nomenclature-group/api-readList",
      {}
    )) as { success: boolean; data: Array<{ uuid: string; name: string }> };

    expect(listResponse.success).toBe(true);
    expect(listResponse.data.length).toBeGreaterThan(0);

    // Step 2: Take first 3 UUIDs and batch read their details
    const uuids = listResponse.data
      .slice(0, 3)
      .map((item) => item.uuid);

    expect(uuids.length).toBeGreaterThan(0);
    expect(uuids.length).toBeLessThanOrEqual(3);

    const readResult = (await batchRead.handler({
      tool: "bimp_nomenclature_group_read",
      uuids,
    })) as { items: unknown[]; errors: Array<{ uuid: string; error: string }> };

    expect(readResult).toHaveProperty("items");
    expect(readResult).toHaveProperty("errors");
    expect(Array.isArray(readResult.items)).toBe(true);
    expect(Array.isArray(readResult.errors)).toBe(true);

    // All should succeed -- no errors expected
    expect(readResult.errors).toHaveLength(0);
    expect(readResult.items).toHaveLength(uuids.length);

    // Verify each item has expected fields
    for (const item of readResult.items) {
      const record = item as Record<string, unknown>;
      expect(record).toHaveProperty("uuid");
      expect(record).toHaveProperty("name");
      expect(typeof record.uuid).toBe("string");
      expect(typeof record.name).toBe("string");
    }
  });
});
