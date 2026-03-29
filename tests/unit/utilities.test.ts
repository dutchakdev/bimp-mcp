import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUtilityTools, type UtilityTool } from "../../src/utilities.js";
import type { BimpClient } from "../../src/client.js";
import type { ToolDefinition } from "../../src/tool-generator.js";

function createMockClient() {
  return {
    request: vi.fn(),
  } as unknown as BimpClient;
}

function createToolMap(tools: ToolDefinition[]): Map<string, ToolDefinition> {
  const map = new Map<string, ToolDefinition>();
  for (const t of tools) map.set(t.name, t);
  return map;
}

const nomenclatureReadList: ToolDefinition = {
  name: "bimp_nomenclature_readList",
  description: "List nomenclatures",
  inputSchema: { type: "object", properties: {} },
  metadata: {
    method: "POST",
    path: "/org2/nomenclature/api-readList",
    tag: "Nomenclature",
    paginationType: "offset",
    pathParams: [],
  },
};

const nomenclatureRead: ToolDefinition = {
  name: "bimp_nomenclature_read",
  description: "Read one nomenclature",
  inputSchema: { type: "object", properties: {} },
  metadata: {
    method: "POST",
    path: "/org2/nomenclature/api-read",
    tag: "Nomenclature",
    paginationType: "none",
    pathParams: [],
  },
};

const nomenclatureUpdate: ToolDefinition = {
  name: "bimp_nomenclature_update",
  description: "Update nomenclature",
  inputSchema: { type: "object", properties: {} },
  metadata: {
    method: "POST",
    path: "/org2/nomenclature/api-update",
    tag: "Nomenclature",
    paginationType: "none",
    pathParams: [],
  },
};

describe("bimp_fetch_all", () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: UtilityTool[];

  beforeEach(() => {
    client = createMockClient();
    const toolMap = createToolMap([nomenclatureReadList, nomenclatureRead]);
    tools = createUtilityTools(client as unknown as BimpClient, toolMap);
  });

  function getFetchAll() {
    return tools.find((t) => t.name === "bimp_fetch_all")!;
  }

  it("paginates offset/count until partial page", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: Array.from({ length: 100 }, (_, i) => ({ uuid: `u${i}` })),
    });
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: Array.from({ length: 30 }, (_, i) => ({ uuid: `u${100 + i}` })),
    });

    const fetchAll = getFetchAll();
    const result = (await fetchAll.handler({
      tool: "bimp_nomenclature_readList",
    })) as { items: unknown[]; count: number };

    expect(result.count).toBe(130);
    expect(result.items).toHaveLength(130);
    expect(mockRequest).toHaveBeenCalledTimes(2);

    const call1 = mockRequest.mock.calls[0];
    expect(call1[2]).toMatchObject({ pagination: { offset: 0, count: 100 } });
    const call2 = mockRequest.mock.calls[1];
    expect(call2[2]).toMatchObject({ pagination: { offset: 100, count: 100 } });
  });

  it("stops at limit", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: Array.from({ length: 100 }, (_, i) => ({ uuid: `u${i}` })),
    });

    const fetchAll = getFetchAll();
    const result = (await fetchAll.handler({
      tool: "bimp_nomenclature_readList",
      limit: 50,
    })) as { items: unknown[]; count: number };

    expect(result.count).toBe(50);
    expect(result.items).toHaveLength(50);
  });

  it("passes filters through", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({ success: true, data: [{ uuid: "u1" }] });

    const fetchAll = getFetchAll();
    await fetchAll.handler({
      tool: "bimp_nomenclature_readList",
      filters: { nameContains: "paint" },
    });

    const call = mockRequest.mock.calls[0];
    expect(call[2]).toMatchObject({ nameContains: "paint" });
  });

  it("enriches with read endpoint when enrich=true", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: [{ uuid: "u1" }, { uuid: "u2" }],
    });
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: { uuid: "u1", fullField: "yes" },
    });
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: { uuid: "u2", fullField: "yes" },
    });

    const fetchAll = getFetchAll();
    const result = (await fetchAll.handler({
      tool: "bimp_nomenclature_readList",
      enrich: true,
    })) as { items: Array<{ fullField?: string }>; count: number };

    expect(result.items[0]).toHaveProperty("fullField", "yes");
    expect(result.count).toBe(2);
  });
});

describe("bimp_batch_read", () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: UtilityTool[];

  beforeEach(() => {
    client = createMockClient();
    const toolMap = createToolMap([nomenclatureRead]);
    tools = createUtilityTools(client as unknown as BimpClient, toolMap);
  });

  function getBatchRead() {
    return tools.find((t) => t.name === "bimp_batch_read")!;
  }

  it("reads all UUIDs in parallel batches", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockImplementation(async (_m: string, _p: string, params: Record<string, unknown>) => ({
      success: true,
      data: { uuid: params.uuid, name: "item" },
    }));

    const batchRead = getBatchRead();
    const result = (await batchRead.handler({
      tool: "bimp_nomenclature_read",
      uuids: ["u1", "u2", "u3"],
      concurrency: 2,
    })) as { items: unknown[]; errors: unknown[] };

    expect(result.items).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it("collects errors without stopping", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest
      .mockResolvedValueOnce({ success: true, data: { uuid: "u1" } })
      .mockRejectedValueOnce(new Error("API error"))
      .mockResolvedValueOnce({ success: true, data: { uuid: "u3" } });

    const batchRead = getBatchRead();
    const result = (await batchRead.handler({
      tool: "bimp_nomenclature_read",
      uuids: ["u1", "u2", "u3"],
      concurrency: 10,
    })) as { items: unknown[]; errors: Array<{ uuid: string }> };

    expect(result.items).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].uuid).toBe("u2");
  });
});

describe("bimp_bulk_update", () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: UtilityTool[];

  beforeEach(() => {
    client = createMockClient();
    const toolMap = createToolMap([nomenclatureUpdate]);
    tools = createUtilityTools(client as unknown as BimpClient, toolMap);
  });

  function getBulkUpdate() {
    return tools.find((t) => t.name === "bimp_bulk_update")!;
  }

  it("updates all items", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValue({ success: true, data: {} });

    const bulkUpdate = getBulkUpdate();
    const result = (await bulkUpdate.handler({
      tool: "bimp_nomenclature_update",
      items: [
        { uuid: "u1", name: "A" },
        { uuid: "u2", name: "B" },
      ],
    })) as { updated: number; errors: unknown[] };

    expect(result.updated).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("reports errors per UUID", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest
      .mockResolvedValueOnce({ success: true, data: {} })
      .mockRejectedValueOnce(new Error("Validation error"));

    const bulkUpdate = getBulkUpdate();
    const result = (await bulkUpdate.handler({
      tool: "bimp_nomenclature_update",
      items: [
        { uuid: "u1", name: "A" },
        { uuid: "u2", name: "B" },
      ],
      concurrency: 10,
    })) as { updated: number; errors: Array<{ uuid: string }> };

    expect(result.updated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].uuid).toBe("u2");
  });
});
