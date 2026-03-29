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
const bulkUpdate = utilityTools.find((t) => t.name === "bimp_bulk_update")!;

describe("bimp_bulk_update", () => {
  const createdUuids: string[] = [];
  const timestamp = Date.now();

  it("should create 2 test nomenclature groups", async () => {
    for (let i = 0; i < 2; i++) {
      const result = (await client.request(
        "POST",
        "/org2/nomenclature-group/api-create",
        { name: `FuncTest Group ${timestamp}-${i}` }
      )) as { success: boolean; data: { uuid: string } };

      expect(result.success).toBe(true);
      expect(result.data.uuid).toBeDefined();
      createdUuids.push(result.data.uuid);
    }

    expect(createdUuids).toHaveLength(2);
  });

  it("should bulk update their descriptions", async () => {
    expect(createdUuids).toHaveLength(2);

    const items = createdUuids.map((uuid, i) => ({
      uuid,
      description: `Bulk updated description ${timestamp}-${i}`,
    }));

    const result = (await bulkUpdate.handler({
      tool: "bimp_nomenclature_group_update",
      items,
    })) as { updated: number; errors: Array<{ uuid: string; error: string }> };

    expect(result).toHaveProperty("updated");
    expect(result).toHaveProperty("errors");
    expect(result.updated).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("should verify update by reading one back", async () => {
    expect(createdUuids.length).toBeGreaterThan(0);

    const readResult = (await batchRead.handler({
      tool: "bimp_nomenclature_group_read",
      uuids: [createdUuids[0]],
    })) as { items: Array<Record<string, unknown>>; errors: unknown[] };

    expect(readResult.errors).toHaveLength(0);
    expect(readResult.items).toHaveLength(1);

    const item = readResult.items[0] as Record<string, unknown>;
    expect(item.uuid).toBe(createdUuids[0]);
    expect(item.description).toBe(
      `Bulk updated description ${timestamp}-0`
    );
  });
});
