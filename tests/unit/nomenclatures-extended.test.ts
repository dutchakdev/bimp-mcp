import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FIELD_MAP,
  toEnglish,
  toCyrillic,
  createNomenclaturesTools,
} from "../../src/nomenclatures-extended.js";
import type { UtilityTool } from "../../src/utilities.js";
import type { BimpClient } from "../../src/client.js";

function createMockClient() {
  return {
    request: vi.fn(),
  } as unknown as BimpClient;
}

describe("Field mapping", () => {
  it("FIELD_MAP has all expected keys", () => {
    const expectedKeys = [
      "uuid",
      "name",
      "fullName",
      "code",
      "article",
      "comment",
      "barcode",
      "minStock",
      "maxStock",
      "speedOfDemand",
      "insuranceReserve",
      "deliveryTerm",
      "weight",
      "height",
      "width",
      "length",
      "plannedCost",
      "isKit",
      "isService",
      "archived",
      "type",
      "unitOfMeasurementUuid",
      "expenseAccountUuid",
      "inventoryAccountUuid",
      "docType",
    ];
    for (const key of expectedKeys) {
      expect(FIELD_MAP).toHaveProperty(key);
    }
  });

  it("toEnglish maps Cyrillic keys to English", () => {
    const cyrillic = {
      GUID: "abc-123",
      Наименование: "Test Product",
      МинимальныйОстаток: 10,
    };
    const result = toEnglish(cyrillic);
    expect(result).toEqual({
      uuid: "abc-123",
      name: "Test Product",
      minStock: 10,
    });
  });

  it("toCyrillic maps English keys to Cyrillic", () => {
    const english = {
      uuid: "abc-123",
      name: "Test Product",
      minStock: 10,
    };
    const result = toCyrillic(english);
    expect(result).toEqual({
      GUID: "abc-123",
      Наименование: "Test Product",
      МинимальныйОстаток: 10,
    });
  });

  it("preserves unknown keys in toEnglish", () => {
    const input = { unknownField: "value", GUID: "abc" };
    const result = toEnglish(input);
    expect(result).toHaveProperty("unknownField", "value");
    expect(result).toHaveProperty("uuid", "abc");
  });

  it("preserves unknown keys in toCyrillic", () => {
    const input = { unknownField: "value", uuid: "abc" };
    const result = toCyrillic(input);
    expect(result).toHaveProperty("unknownField", "value");
    expect(result).toHaveProperty("GUID", "abc");
  });

  it("round-trip toEnglish(toCyrillic(obj)) preserves data", () => {
    const original = {
      uuid: "abc-123",
      name: "Product",
      minStock: 5,
      maxStock: 100,
      speedOfDemand: 2.5,
      insuranceReserve: 10,
      deliveryTerm: 7,
    };
    const roundTripped = toEnglish(toCyrillic(original));
    expect(roundTripped).toEqual(original);
  });
});

describe("bimp_nomenclatures_read", () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: UtilityTool[];

  beforeEach(() => {
    client = createMockClient();
    tools = createNomenclaturesTools(client as unknown as BimpClient);
  });

  function getReadTool() {
    return tools.find((t) => t.name === "bimp_nomenclatures_read")!;
  }

  it("has correct name and description", () => {
    const tool = getReadTool();
    expect(tool.name).toBe("bimp_nomenclatures_read");
    expect(tool.description).toContain("planning/accounting fields");
  });

  it("has uuid as required in inputSchema", () => {
    const tool = getReadTool();
    expect(tool.inputSchema.properties).toHaveProperty("uuid");
    expect(tool.inputSchema.required).toEqual(["uuid"]);
  });

  it("calls POST /org2/nomenclatures/read with {lang, uid}", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: { GUID: "abc-123", Наименование: "Test" },
    });

    const tool = getReadTool();
    await tool.handler({ uuid: "abc-123" });

    expect(mockRequest).toHaveBeenCalledWith("POST", "/org2/nomenclatures/read", {
      lang: "ru",
      uid: "abc-123",
    });
  });

  it("returns English-mapped result", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: {
        GUID: "abc-123",
        Наименование: "Test Product",
        МинимальныйОстаток: 10,
        МаксимальныйОстаток: 50,
      },
    });

    const tool = getReadTool();
    const result = (await tool.handler({ uuid: "abc-123" })) as Record<string, unknown>;

    expect(result.uuid).toBe("abc-123");
    expect(result.name).toBe("Test Product");
    expect(result.minStock).toBe(10);
    expect(result.maxStock).toBe(50);
  });
});

describe("bimp_nomenclatures_upsert", () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: UtilityTool[];

  beforeEach(() => {
    client = createMockClient();
    tools = createNomenclaturesTools(client as unknown as BimpClient);
  });

  function getUpsertTool() {
    return tools.find((t) => t.name === "bimp_nomenclatures_upsert")!;
  }

  it("has correct schema with all properties", () => {
    const tool = getUpsertTool();
    expect(tool.name).toBe("bimp_nomenclatures_upsert");
    const props = tool.inputSchema.properties;
    expect(props).toHaveProperty("uuid");
    expect(props).toHaveProperty("name");
    expect(props).toHaveProperty("article");
    expect(props).toHaveProperty("minStock");
    expect(props).toHaveProperty("maxStock");
    expect(props).toHaveProperty("speedOfDemand");
    expect(props).toHaveProperty("insuranceReserve");
    expect(props).toHaveProperty("deliveryTerm");
    expect(props).toHaveProperty("unitOfMeasurementUuid");
    expect(props).toHaveProperty("type");
  });

  it("maps English fields to Cyrillic for the API call", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: { GUID: "new-uuid" },
    });

    const tool = getUpsertTool();
    await tool.handler({ name: "New Product", minStock: 5 });

    const callBody = mockRequest.mock.calls[0][2];
    expect(callBody).toHaveProperty("Наименование", "New Product");
    expect(callBody).toHaveProperty("МинимальныйОстаток", 5);
  });

  it("always adds ТипДокумента: '101'", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: { GUID: "new-uuid" },
    });

    const tool = getUpsertTool();
    await tool.handler({ name: "Product" });

    const callBody = mockRequest.mock.calls[0][2];
    expect(callBody["ТипДокумента"]).toBe("101");
  });

  it("strips docType from input params", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: { GUID: "new-uuid" },
    });

    const tool = getUpsertTool();
    await tool.handler({ name: "Product", docType: "999" });

    const callBody = mockRequest.mock.calls[0][2];
    // docType should be stripped and ТипДокумента forced to "101"
    expect(callBody["ТипДокумента"]).toBe("101");
  });

  it("returns { uuid } from response", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: { GUID: "created-uuid" },
    });

    const tool = getUpsertTool();
    const result = (await tool.handler({ name: "Product" })) as { uuid: string };

    expect(result).toEqual({ uuid: "created-uuid" });
  });
});

describe("bimp_nomenclatures_readList", () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: UtilityTool[];

  beforeEach(() => {
    client = createMockClient();
    tools = createNomenclaturesTools(client as unknown as BimpClient);
  });

  function getReadListTool() {
    return tools.find((t) => t.name === "bimp_nomenclatures_readList")!;
  }

  it("has correct name", () => {
    const tool = getReadListTool();
    expect(tool.name).toBe("bimp_nomenclatures_readList");
  });

  it("has empty input schema properties", () => {
    const tool = getReadListTool();
    expect(tool.inputSchema.properties).toEqual({});
  });

  it("calls POST /org2/nomenclatures/readList with {}", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: [],
    });

    const tool = getReadListTool();
    await tool.handler({});

    expect(mockRequest).toHaveBeenCalledWith(
      "POST",
      "/org2/nomenclatures/readList",
      {}
    );
  });

  it("maps array items to English", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: [
        { GUID: "u1", Наименование: "Product A", МинимальныйОстаток: 5 },
        { GUID: "u2", Наименование: "Product B", МинимальныйОстаток: 10 },
      ],
    });

    const tool = getReadListTool();
    const result = (await tool.handler({})) as {
      items: Array<Record<string, unknown>>;
      count: number;
    };

    expect(result.count).toBe(2);
    expect(result.items[0]).toEqual({
      uuid: "u1",
      name: "Product A",
      minStock: 5,
    });
    expect(result.items[1]).toEqual({
      uuid: "u2",
      name: "Product B",
      minStock: 10,
    });
  });

  it("handles empty array", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: [],
    });

    const tool = getReadListTool();
    const result = (await tool.handler({})) as {
      items: unknown[];
      count: number;
    };

    expect(result.items).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("handles null data as empty array", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: null,
    });

    const tool = getReadListTool();
    const result = (await tool.handler({})) as {
      items: unknown[];
      count: number;
    };

    expect(result.items).toEqual([]);
    expect(result.count).toBe(0);
  });
});
