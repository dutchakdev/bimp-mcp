# Nomenclatures Extended + Production Chain E2E — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 hardcoded MCP tools for undocumented `/org2/nomenclatures/` endpoints (planning/accounting fields) and validate the full production chain with an E2E test.

**Architecture:** New module `src/nomenclatures-extended.ts` exports `createNomenclaturesTools(client)` returning `UtilityTool[]` — same interface as `utilities.ts`. Three tools with English↔1C Cyrillic field mapping. Integrated into `index.ts` alongside existing utility tools. E2E test covers 8-step production chain in test company.

**Tech Stack:** TypeScript, MCP SDK, Vitest, BimpClient

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/nomenclatures-extended.ts` | Field mapping constants, translation functions, 3 tool definitions |
| Create | `tests/unit/nomenclatures-extended.test.ts` | Unit tests for field mapping and tool handlers (mock client) |
| Create | `tests/functional/production-chain.test.ts` | 8-step E2E test for full production chain |
| Modify | `src/index.ts` | Import and register nomenclatures tools |
| Modify | `src/prompts.ts` | Add planning fields to ERP context and workflow prompts |
| Modify | `.claude/skills/bimp-api-discovery.md` | Add undocumented API layer section |
| Modify | `.claude/skills/bimp-erp-domain.md` | Add planning fields and production chain |
| Modify | `.claude/skills/bimp-mcp-development.md` | Add nomenclatures-extended explanation |
| Modify | `CLAUDE.md` | Add undocumented API note and file description |

---

### Task 1: Field Mapping and Translation Functions

**Files:**
- Create: `src/nomenclatures-extended.ts`
- Create: `tests/unit/nomenclatures-extended.test.ts`

- [ ] **Step 1: Write the failing tests for field mapping**

```typescript
// tests/unit/nomenclatures-extended.test.ts
import { describe, it, expect } from "vitest";
import { toEnglish, toCyrillic, FIELD_MAP } from "../../src/nomenclatures-extended.js";

describe("field mapping", () => {
  it("FIELD_MAP contains all expected English keys", () => {
    const expectedKeys = [
      "uuid", "name", "fullName", "code", "article", "comment", "barcode",
      "minStock", "maxStock", "speedOfDemand", "insuranceReserve", "deliveryTerm",
      "weight", "height", "width", "length", "plannedCost",
      "isKit", "isService", "archived", "type",
      "unitOfMeasurementUuid", "expenseAccountUuid", "inventoryAccountUuid", "docType",
    ];
    for (const key of expectedKeys) {
      expect(FIELD_MAP).toHaveProperty(key);
    }
  });

  it("toEnglish maps 1C Cyrillic keys to English", () => {
    const input = {
      GUID: "abc-123",
      "Наименование": "Test Product",
      "МинимальныйОстаток": 10,
      "МаксимальныйОстаток": 100,
      speedOfDemand: 3,
      insuranceReserve: 5,
      deliveryTerm: 7,
    };
    const result = toEnglish(input);
    expect(result).toEqual({
      uuid: "abc-123",
      name: "Test Product",
      minStock: 10,
      maxStock: 100,
      speedOfDemand: 3,
      insuranceReserve: 5,
      deliveryTerm: 7,
    });
  });

  it("toCyrillic maps English keys to 1C Cyrillic", () => {
    const input = {
      uuid: "abc-123",
      name: "Test Product",
      minStock: 10,
      type: 1,
    };
    const result = toCyrillic(input);
    expect(result).toEqual({
      GUID: "abc-123",
      "Наименование": "Test Product",
      "МинимальныйОстаток": 10,
      "ТипНоменклатуры": 1,
    });
  });

  it("toEnglish preserves unknown keys as-is", () => {
    const input = { unknownField: "value" };
    const result = toEnglish(input);
    expect(result).toEqual({ unknownField: "value" });
  });

  it("toCyrillic preserves unknown keys as-is", () => {
    const input = { unknownField: "value" };
    const result = toCyrillic(input);
    expect(result).toEqual({ unknownField: "value" });
  });

  it("round-trip: toEnglish(toCyrillic(obj)) returns original", () => {
    const original = { uuid: "x", name: "Y", minStock: 5 };
    const roundTripped = toEnglish(toCyrillic(original));
    expect(roundTripped).toEqual(original);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/nomenclatures-extended.test.ts`
Expected: FAIL — module `../../src/nomenclatures-extended.js` not found

- [ ] **Step 3: Implement field mapping and translation functions**

```typescript
// src/nomenclatures-extended.ts
import type { BimpClient } from "./client.js";
import type { UtilityTool } from "./utilities.js";

/**
 * English → 1C Cyrillic field mapping for the undocumented
 * /org2/nomenclatures/ endpoints (plural).
 */
export const FIELD_MAP: Record<string, string> = {
  uuid: "GUID",
  name: "Наименование",
  fullName: "НаименованиеДляПечати",
  code: "Код",
  article: "Артикул",
  comment: "Комментарий",
  barcode: "Штрихкод",
  minStock: "МинимальныйОстаток",
  maxStock: "МаксимальныйОстаток",
  speedOfDemand: "speedOfDemand",
  insuranceReserve: "insuranceReserve",
  deliveryTerm: "deliveryTerm",
  weight: "Вес",
  height: "Высота",
  width: "Ширина",
  length: "Длина",
  plannedCost: "ПлановаяСебестоимость",
  isKit: "ЭтоНабор",
  isService: "ЭтоУслуга",
  archived: "Архив",
  type: "ТипНоменклатуры",
  unitOfMeasurementUuid: "ЕдиницаИзмерения.GUID",
  expenseAccountUuid: "СчетУчетаЗатрат.GUID",
  inventoryAccountUuid: "СчетУчетаЗапасов.GUID",
  docType: "ТипДокумента",
};

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([en, cyrillic]) => [cyrillic, en])
);

/** Convert 1C Cyrillic-keyed object to English-keyed object. */
export function toEnglish(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[REVERSE_MAP[key] ?? key] = value;
  }
  return result;
}

/** Convert English-keyed object to 1C Cyrillic-keyed object. */
export function toCyrillic(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[FIELD_MAP[key] ?? key] = value;
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/nomenclatures-extended.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/nomenclatures-extended.ts tests/unit/nomenclatures-extended.test.ts
git commit -m "feat: add field mapping for undocumented nomenclatures endpoints"
```

---

### Task 2: bimp_nomenclatures_read Tool

**Files:**
- Modify: `src/nomenclatures-extended.ts`
- Modify: `tests/unit/nomenclatures-extended.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/nomenclatures-extended.test.ts`:

```typescript
import { vi, beforeEach } from "vitest";
import { createNomenclaturesTools } from "../../src/nomenclatures-extended.js";
import type { BimpClient } from "../../src/client.js";
import type { UtilityTool } from "../../src/utilities.js";

function createMockClient() {
  return { request: vi.fn() } as unknown as BimpClient;
}

describe("bimp_nomenclatures_read", () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: UtilityTool[];

  beforeEach(() => {
    client = createMockClient();
    tools = createNomenclaturesTools(client);
  });

  function getReadTool() {
    return tools.find((t) => t.name === "bimp_nomenclatures_read")!;
  }

  it("has correct name, description, and input schema", () => {
    const tool = getReadTool();
    expect(tool.name).toBe("bimp_nomenclatures_read");
    expect(tool.description).toContain("planning");
    expect(tool.inputSchema.required).toEqual(["uuid"]);
    expect(tool.inputSchema.properties).toHaveProperty("uuid");
  });

  it("calls correct path with lang and uid", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: { GUID: "abc-123", "Наименование": "Test", "МинимальныйОстаток": 10 },
    });

    const tool = getReadTool();
    const result = await tool.handler({ uuid: "abc-123" });

    expect(mockRequest).toHaveBeenCalledWith("POST", "/org2/nomenclatures/read", {
      lang: "ru",
      uid: "abc-123",
    });
    expect(result).toEqual({
      uuid: "abc-123",
      name: "Test",
      minStock: 10,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/nomenclatures-extended.test.ts`
Expected: FAIL — `createNomenclaturesTools` not exported

- [ ] **Step 3: Implement the read tool**

Add to the bottom of `src/nomenclatures-extended.ts`:

```typescript
function createNomenclaturesReadTool(client: BimpClient): UtilityTool {
  return {
    name: "bimp_nomenclatures_read",
    description:
      "Read full product card including planning/accounting fields " +
      "(minStock, maxStock, speedOfDemand, insuranceReserve, deliveryTerm) " +
      "from the extended nomenclatures endpoint.",
    inputSchema: {
      type: "object",
      properties: {
        uuid: { type: "string", description: "Product UUID" },
      },
      required: ["uuid"],
    },
    handler: async (params) => {
      const uuid = params.uuid as string;
      const response = (await client.request("POST", "/org2/nomenclatures/read", {
        lang: "ru",
        uid: uuid,
      })) as { success: boolean; data: Record<string, unknown> };
      return toEnglish(response.data);
    },
  };
}

export function createNomenclaturesTools(client: BimpClient): UtilityTool[] {
  return [
    createNomenclaturesReadTool(client),
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/nomenclatures-extended.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/nomenclatures-extended.ts tests/unit/nomenclatures-extended.test.ts
git commit -m "feat: add bimp_nomenclatures_read tool with English field mapping"
```

---

### Task 3: bimp_nomenclatures_upsert Tool

**Files:**
- Modify: `src/nomenclatures-extended.ts`
- Modify: `tests/unit/nomenclatures-extended.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/nomenclatures-extended.test.ts`:

```typescript
describe("bimp_nomenclatures_upsert", () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: UtilityTool[];

  beforeEach(() => {
    client = createMockClient();
    tools = createNomenclaturesTools(client);
  });

  function getUpsertTool() {
    return tools.find((t) => t.name === "bimp_nomenclatures_upsert")!;
  }

  it("has correct name and input schema", () => {
    const tool = getUpsertTool();
    expect(tool.name).toBe("bimp_nomenclatures_upsert");
    expect(tool.inputSchema.properties).toHaveProperty("uuid");
    expect(tool.inputSchema.properties).toHaveProperty("name");
    expect(tool.inputSchema.properties).toHaveProperty("minStock");
    expect(tool.inputSchema.properties).toHaveProperty("maxStock");
    expect(tool.inputSchema.properties).toHaveProperty("speedOfDemand");
    expect(tool.inputSchema.properties).toHaveProperty("insuranceReserve");
    expect(tool.inputSchema.properties).toHaveProperty("deliveryTerm");
  });

  it("maps English fields to 1C and adds ТипДокумента", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: { GUID: "abc-123" },
    });

    const tool = getUpsertTool();
    const result = await tool.handler({
      uuid: "abc-123",
      name: "Red Gel Polish",
      minStock: 10,
      maxStock: 100,
    });

    expect(mockRequest).toHaveBeenCalledWith("POST", "/org2/nomenclatures/upsert", {
      GUID: "abc-123",
      "Наименование": "Red Gel Polish",
      "МинимальныйОстаток": 10,
      "МаксимальныйОстаток": 100,
      "ТипДокумента": "101",
    });
    expect(result).toEqual({ uuid: "abc-123" });
  });

  it("omits docType from input mapping (always injected)", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: { GUID: "new-uuid" },
    });

    const tool = getUpsertTool();
    await tool.handler({ name: "New Product" });

    const callBody = mockRequest.mock.calls[0][2];
    expect(callBody["ТипДокумента"]).toBe("101");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/nomenclatures-extended.test.ts`
Expected: FAIL — `bimp_nomenclatures_upsert` not found in tools array

- [ ] **Step 3: Implement the upsert tool**

Add to `src/nomenclatures-extended.ts`, before `createNomenclaturesTools`:

```typescript
function createNomenclaturesUpsertTool(client: BimpClient): UtilityTool {
  return {
    name: "bimp_nomenclatures_upsert",
    description:
      "Create or update a product with planning/accounting fields. " +
      "For update: uuid is required. For create: uuid is optional. " +
      "Supports: minStock, maxStock, speedOfDemand, insuranceReserve, deliveryTerm, and all standard fields.",
    inputSchema: {
      type: "object",
      properties: {
        uuid: { type: "string", description: "Product UUID (required for update, optional for create)" },
        name: { type: "string", description: "Product name (required for create)" },
        article: { type: "string", description: "Product article/SKU" },
        minStock: { type: "number", description: "Minimum stock level" },
        maxStock: { type: "number", description: "Maximum stock level" },
        speedOfDemand: { type: "number", description: "Demand rate" },
        insuranceReserve: { type: "number", description: "Safety stock" },
        deliveryTerm: { type: "number", description: "Delivery time in days" },
        unitOfMeasurementUuid: { type: "string", description: "Unit of measurement UUID" },
        type: { type: "number", description: "Product type: 1=goods, 2=service" },
      },
    },
    handler: async (params) => {
      const { docType: _ignored, ...fields } = params as Record<string, unknown>;
      const body = toCyrillic(fields);
      body["ТипДокумента"] = "101";
      const response = (await client.request(
        "POST",
        "/org2/nomenclatures/upsert",
        body
      )) as { success: boolean; data: { GUID: string } };
      return { uuid: response.data.GUID };
    },
  };
}
```

Update `createNomenclaturesTools` to include it:

```typescript
export function createNomenclaturesTools(client: BimpClient): UtilityTool[] {
  return [
    createNomenclaturesReadTool(client),
    createNomenclaturesUpsertTool(client),
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/nomenclatures-extended.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/nomenclatures-extended.ts tests/unit/nomenclatures-extended.test.ts
git commit -m "feat: add bimp_nomenclatures_upsert tool with English-to-1C mapping"
```

---

### Task 4: bimp_nomenclatures_readList Tool

**Files:**
- Modify: `src/nomenclatures-extended.ts`
- Modify: `tests/unit/nomenclatures-extended.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/nomenclatures-extended.test.ts`:

```typescript
describe("bimp_nomenclatures_readList", () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: UtilityTool[];

  beforeEach(() => {
    client = createMockClient();
    tools = createNomenclaturesTools(client);
  });

  function getReadListTool() {
    return tools.find((t) => t.name === "bimp_nomenclatures_readList")!;
  }

  it("has correct name and empty input schema", () => {
    const tool = getReadListTool();
    expect(tool.name).toBe("bimp_nomenclatures_readList");
    expect(tool.inputSchema.required).toBeUndefined();
  });

  it("calls correct path and maps all items to English", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: [
        { GUID: "u1", "Наименование": "Product A", "МинимальныйОстаток": 5 },
        { GUID: "u2", "Наименование": "Product B", "МинимальныйОстаток": 0 },
      ],
    });

    const tool = getReadListTool();
    const result = (await tool.handler({})) as { items: unknown[]; count: number };

    expect(mockRequest).toHaveBeenCalledWith("POST", "/org2/nomenclatures/readList", {});
    expect(result.count).toBe(2);
    expect(result.items).toEqual([
      { uuid: "u1", name: "Product A", minStock: 5 },
      { uuid: "u2", name: "Product B", minStock: 0 },
    ]);
  });

  it("returns empty array when no items", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({ success: true, data: [] });

    const tool = getReadListTool();
    const result = (await tool.handler({})) as { items: unknown[]; count: number };

    expect(result.items).toEqual([]);
    expect(result.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/nomenclatures-extended.test.ts`
Expected: FAIL — `bimp_nomenclatures_readList` not found in tools array

- [ ] **Step 3: Implement the readList tool**

Add to `src/nomenclatures-extended.ts`, before `createNomenclaturesTools`:

```typescript
function createNomenclaturesReadListTool(client: BimpClient): UtilityTool {
  return {
    name: "bimp_nomenclatures_readList",
    description:
      "List all products from the extended nomenclatures endpoint. " +
      "Returns English-mapped items including minStock field.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const response = (await client.request(
        "POST",
        "/org2/nomenclatures/readList",
        {}
      )) as { success: boolean; data: Array<Record<string, unknown>> };
      const items = (response.data ?? []).map(toEnglish);
      return { items, count: items.length };
    },
  };
}
```

Update `createNomenclaturesTools`:

```typescript
export function createNomenclaturesTools(client: BimpClient): UtilityTool[] {
  return [
    createNomenclaturesReadTool(client),
    createNomenclaturesUpsertTool(client),
    createNomenclaturesReadListTool(client),
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/nomenclatures-extended.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/nomenclatures-extended.ts tests/unit/nomenclatures-extended.test.ts
git commit -m "feat: add bimp_nomenclatures_readList tool"
```

---

### Task 5: Integrate into index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add import**

Add import after the `utilities.js` import in `src/index.ts`:

```typescript
import { createNomenclaturesTools } from "./nomenclatures-extended.js";
```

- [ ] **Step 2: Create the tools**

Add after `const utilityTools = createUtilityTools(client, toolMap);` (line 36):

```typescript
const nomenclaturesTools = createNomenclaturesTools(client);
```

- [ ] **Step 3: Add to ListToolsRequestSchema handler**

In the `ListToolsRequestSchema` handler, add `nomenclaturesTools` to the tools array. Find the spread of `utilityTools` and add after it:

```typescript
    ...nomenclaturesTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
```

- [ ] **Step 4: Add to CallToolRequestSchema handler**

In the `CallToolRequestSchema` handler, add a lookup block after the utility tool check (after the `if (utilityTool)` block):

```typescript
    // Nomenclatures extended tools
    const nomenclaturesTool = nomenclaturesTools.find((t) => t.name === name);
    if (nomenclaturesTool) {
      const result = await nomenclaturesTool.handler(params);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
```

- [ ] **Step 5: Run all unit tests to verify nothing is broken**

Run: `npx vitest run --project unit`
Expected: All unit tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: register nomenclatures-extended tools in MCP server"
```

---

### Task 6: E2E Production Chain Test

**Files:**
- Create: `tests/functional/production-chain.test.ts`

- [ ] **Step 1: Write the complete E2E test file**

```typescript
// tests/functional/production-chain.test.ts
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

// Shared state across sequential test steps
const refs = {
  unitUuid: "",
  warehouseUuid: "",
  orgUuid: "",
  currencyUuid: "",
  employeeUuid: "",
  supplierUuid: "",
  components: {} as Record<string, string>,  // name -> uuid
  products: {} as Record<string, string>,    // name -> uuid
  specUuids: [] as string[],
};

describe("Production chain E2E", () => {
  it("Step 1: Prepare reference data", async () => {
    // Fetch unit of measurement
    const units = (await client.request("POST", "/org2/unitsOfMeasurment/api-readList", {
      pagination: { offset: 0, count: 10 },
    })) as { success: boolean; data: Array<{ uuid: string; name: string }> };
    expect(units.data.length).toBeGreaterThan(0);
    refs.unitUuid = units.data[0].uuid;

    // Fetch warehouse
    const warehouses = (await client.request("POST", "/org2/warehouse/api-readList", {
      pagination: { offset: 0, count: 10 },
    })) as { success: boolean; data: Array<{ uuid: string }> };
    expect(warehouses.data.length).toBeGreaterThan(0);
    refs.warehouseUuid = warehouses.data[0].uuid;

    // Fetch organization
    const orgs = (await client.request("POST", "/org2/organization/api-readList", {
      pagination: { offset: 0, count: 10 },
    })) as { success: boolean; data: Array<{ uuid: string }> };
    expect(orgs.data.length).toBeGreaterThan(0);
    refs.orgUuid = orgs.data[0].uuid;

    // Fetch currency
    const currencies = (await client.request("POST", "/org2/currency/api-readList", {
      pagination: { offset: 0, count: 10 },
    })) as { success: boolean; data: Array<{ uuid: string }> };
    expect(currencies.data.length).toBeGreaterThan(0);
    refs.currencyUuid = currencies.data[0].uuid;

    // Fetch employee (for responsible field)
    const employees = (await client.request("POST", "/org2/employee/api-readList", {
      pagination: { offset: 0, count: 10 },
    })) as { success: boolean; data: Array<{ uuid: string }> };
    expect(employees.data.length).toBeGreaterThan(0);
    refs.employeeUuid = employees.data[0].uuid;

    // Create supplier counterparty
    const supplier = (await client.request("POST", "/org2/counterparty/api-insert", {
      name: `E2E Supplier ${timestamp}`,
      isCustomer: false,
      isSupplier: true,
    })) as { success: boolean; data: { uuid: string } };
    expect(supplier.success).toBe(true);
    refs.supplierUuid = supplier.data.uuid;
  });

  it("Step 2: Create 5 components", async () => {
    const componentNames = [
      "Pigment Red",
      "Pigment Blue",
      "Base Gel",
      "Brush",
      "Nail File",
    ];

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

    for (const [name, uuid] of Object.entries(refs.products)) {
      const result = (await nomUpsert.handler({
        uuid,
        ...planningFields,
      })) as { uuid: string };
      expect(result.uuid).toBeDefined();
    }

    // Verify planning fields are readable
    for (const [name, uuid] of Object.entries(refs.products)) {
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

    for (const spec of specs) {
      const result = (await client.request("POST", "/org2/specification/api-create", {
        name: spec.name,
        nomenclature: spec.nomenclature,
        quantity: 1,
        currency: refs.currencyUuid,
        composition: spec.composition,
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
    // Check stock for each component via readStocks
    for (const [name, uuid] of Object.entries(refs.components)) {
      const stocks = (await client.request("POST", "/org2/nomenclature/api-readStocks", {
        pagination: { offset: 0, count: 10 },
        nomenclatureUuid: [uuid],
      })) as { success: boolean; data: Array<{ quantity?: number; leftovers?: number }> };

      expect(stocks.data.length).toBeGreaterThan(0);
      // Stock response may use "leftovers" or "quantity" — check whichever is present
      const item = stocks.data[0];
      const stockQty = (item.leftovers ?? item.quantity ?? 0) as number;
      expect(stockQty).toBeGreaterThan(0);
    }
  });

  it("Step 8: Complex extraction — specs, capacity, deficit analysis", async () => {
    // Fetch all specifications with enrich to get composition
    const specsResult = (await fetchAll.handler({
      tool: "bimp_specification_readList",
      enrich: true,
    })) as { items: Array<Record<string, unknown>>; count: number };

    // Filter to our test specs by UUID
    const testSpecs = specsResult.items.filter((s) =>
      refs.specUuids.includes(s.uuid as string)
    );
    expect(testSpecs).toHaveLength(3);

    // Verify each spec has composition
    for (const spec of testSpecs) {
      const composition = spec.composition as Array<Record<string, unknown>> | undefined;
      expect(composition).toBeDefined();
      expect(Array.isArray(composition)).toBe(true);
      expect(composition!.length).toBeGreaterThan(0);
    }

    // Find the gel polish specs (2 components each) and kit spec (4 components)
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

    // Build BOM map: product uuid -> { componentUuid: quantityPerUnit }
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

    // Calculate production capacity for gel polishes
    // Red Gel Polish needs: 2x Pigment Red + 5x Base Gel
    // Available: 20 Pigment Red, 100 Base Gel
    // Capacity: min(20/2, 100/5) = min(10, 20) = 10 units
    const redBom = bomMap.get(refs.products["Red Gel Polish"]);
    expect(redBom).toBeDefined();
    expect(redBom!.get(refs.components["Pigment Red"])).toBe(2);
    expect(redBom!.get(refs.components["Base Gel"])).toBe(5);

    // Verify planning fields via extended read for deficit analysis
    for (const [name, uuid] of Object.entries(refs.products)) {
      const product = (await nomRead.handler({ uuid })) as Record<string, unknown>;
      expect(product.minStock).toBe(10);

      // Deficit = max(0, minStock - currentStock)
      // Since products have 0 stock (not yet produced), deficit = 10
      const deficit = Math.max(0, (product.minStock as number) - 0);
      expect(deficit).toBe(10);
    }
  });
});
```

- [ ] **Step 2: Run the E2E test**

Run: `npx vitest run tests/functional/production-chain.test.ts`
Expected: All 8 steps PASS (requires `.env` with credentials, test company nailsmade shop 000001398)

Note: If `purchaseInvoice/api-create` fails due to missing required fields (contract, invoiceForSupplierPayment, lineOfBusiness, project, etc.), adjust the payload — these fields may be required by the schema but optional in practice, or need to be fetched from reference data. Add additional reference data fetches in Step 1 as needed.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/production-chain.test.ts
git commit -m "test: add production chain E2E covering specs, procurement, and planning fields"
```

---

### Task 7: Update Prompts

**Files:**
- Modify: `src/prompts.ts`

- [ ] **Step 1: Add planning fields to bimp_erp_context prompt**

In `src/prompts.ts`, in the `bimp_erp_context` text, after the "Important API Behavior" section (before the closing backtick), add:

```

## Planning & Accounting Fields (Extended API)

Some nomenclature fields are only available via the undocumented \`/org2/nomenclatures/\` endpoints (plural):

| Field | Description |
|-------|-------------|
| minStock | Minimum stock level |
| maxStock | Maximum stock level |
| speedOfDemand | Demand rate |
| insuranceReserve | Safety stock |
| deliveryTerm | Delivery time in days |
| plannedCost | Planned cost |

These fields are NOT available in the standard \`/org2/nomenclature/\` (singular) API.
Use the \`bimp_nomenclatures_read\`, \`bimp_nomenclatures_upsert\`, and \`bimp_nomenclatures_readList\` tools to access them.
```

- [ ] **Step 2: Add procurement step to bimp_production_workflow prompt**

In `src/prompts.ts`, in the `bimp_production_workflow` text, replace the "Production Planning Pattern" section with:

```

## Procurement of Materials
Before production, ensure materials are available:
1. Create a supplier counterparty (if needed): bimp_counterparty_insert with isSupplier=true
2. Create purchase invoice: bimp_purchaseInvoice_create with products, warehouse, counterparty
3. Verify stock: bimp_nomenclature_readStocks to confirm material availability

## Production Planning Pattern
1. Fetch all specifications: bimp_fetch_all tool=bimp_specification_readList enrich=true
2. Get current inventory: bimp_inventory_readList or bimp_nomenclature_readStocks
3. Read planning fields: bimp_nomenclatures_read for minStock, maxStock, speedOfDemand
4. Calculate what can be produced based on available materials vs BOM requirements
5. Calculate deficit: max(0, minStock - currentStock) for each product
6. Create production orders for feasible items
```

- [ ] **Step 3: Add planning analysis to bimp_procurement_workflow prompt**

In `src/prompts.ts`, in the `bimp_procurement_workflow` text, replace the "Procurement Planning Pattern" section with:

```

## Procurement Needs Analysis
1. Read planning fields for each product: bimp_nomenclatures_read (minStock, maxStock, speedOfDemand, insuranceReserve, deliveryTerm)
2. Get current inventory: bimp_fetch_all tool=bimp_inventory_readList or bimp_nomenclature_readStocks
3. Calculate deficit per product: max(0, minStock - currentStock)
4. Check specifications for required materials: bimp_fetch_all tool=bimp_specification_readList enrich=true
5. Identify shortages based on BOM × planned production quantity
6. Factor in deliveryTerm to prioritize urgent orders
7. Create supplier invoices for needed materials
```

- [ ] **Step 4: Run unit tests to verify prompts module still loads**

Run: `npx vitest run --project unit`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/prompts.ts
git commit -m "docs: add planning fields and procurement analysis to MCP prompts"
```

---

### Task 8: Documentation Updates

**Files:**
- Modify: `.claude/skills/bimp-api-discovery.md`
- Modify: `.claude/skills/bimp-erp-domain.md`
- Modify: `.claude/skills/bimp-mcp-development.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add undocumented API section to bimp-api-discovery.md**

Append to `.claude/skills/bimp-api-discovery.md`:

```markdown

## Undocumented API Layer: /org2/nomenclatures/ (Plural)

In addition to the standard `/org2/nomenclature/api-*` (singular) endpoints documented in the OpenAPI spec, BIMP has undocumented endpoints at `/org2/nomenclatures/` (plural) that expose planning/accounting fields not available in the standard API.

### Endpoints

| Endpoint | Method | Request Body | Response |
|----------|--------|-------------|----------|
| `/org2/nomenclatures/read` | POST | `{ lang: "ru", uid: "<uuid>" }` | Full product card with planning fields |
| `/org2/nomenclatures/upsert` | POST | 1C-style Cyrillic body (see below) | `{ success: true, data: { GUID: "..." } }` |
| `/org2/nomenclatures/readList` | POST | `{}` | Array of all products with МинимальныйОстаток |

### 1C-Style Field Names

These endpoints use mixed Cyrillic/English field names (1C convention):

```json
{
  "GUID": "uuid",
  "Наименование": "Product name",
  "МинимальныйОстаток": 10,
  "МаксимальныйОстаток": 100,
  "speedOfDemand": 3,
  "insuranceReserve": 5,
  "deliveryTerm": 7,
  "ТипДокумента": "101"
}
```

The `ТипДокумента` field must always be `"101"` for nomenclature items.

### MCP Tools

These endpoints are wrapped as hardcoded MCP tools in `src/nomenclatures-extended.ts` with automatic English↔1C field translation:
- `bimp_nomenclatures_read` — read with planning fields
- `bimp_nomenclatures_upsert` — create/update with planning fields
- `bimp_nomenclatures_readList` — list all with minStock
```

- [ ] **Step 2: Add planning fields to bimp-erp-domain.md**

Append to the "Entity Relationship Graph" section in `.claude/skills/bimp-erp-domain.md`, under the Nomenclature node:

```markdown

### Planning & Accounting Fields

Available only via `bimp_nomenclatures_read` / `bimp_nomenclatures_upsert` (extended endpoint):

| Field | Type | Description |
|-------|------|-------------|
| minStock | number | Minimum stock level — triggers reorder when stock drops below |
| maxStock | number | Maximum stock level — target for replenishment |
| speedOfDemand | number | Demand rate — average units consumed per period |
| insuranceReserve | number | Safety stock — buffer against demand variability |
| deliveryTerm | number | Delivery time in days — lead time from order to receipt |
| plannedCost | number | Planned unit cost for accounting |

### Full Production Chain

```
Counterparty (supplier)
  → PurchaseInvoice (procure components)
    → Inventory (components in stock)
      → Specification (BOM: components → product)
        → ProductionOrder (plan production)
          → ProductionAssembly (execute production)
            → Inventory (finished goods in stock)
              → SalesInvoice (sell to customer)
```

### Procurement Analysis Pattern
1. Read planning fields (minStock, speedOfDemand, deliveryTerm) via `bimp_nomenclatures_read`
2. Get current stock via `bimp_nomenclature_readStocks`
3. Fetch BOMs via `bimp_specification_readList` (enrich=true)
4. Calculate deficit per product: `max(0, minStock - currentStock)`
5. Explode BOM to get required component quantities
6. Compare component needs against component stock
7. Generate procurement recommendations ordered by deliveryTerm (longest lead time first)
```

- [ ] **Step 3: Add nomenclatures-extended to bimp-mcp-development.md**

Append to `.claude/skills/bimp-mcp-development.md`:

```markdown

## How Nomenclatures Extended Works

`src/nomenclatures-extended.ts` provides hardcoded tools for undocumented API endpoints that cannot be generated from the OpenAPI spec.

### Pattern: Hardcoded Tools with Field Mapping

Unlike generated tools (from `bimp-api.json`), these tools are manually defined with:
1. **Field mapping** — `FIELD_MAP` maps English keys to 1C Cyrillic keys
2. **Translation functions** — `toEnglish()` and `toCyrillic()` convert objects between formats
3. **Tool definitions** — same `UtilityTool` interface as `utilities.ts`

### Adding New Undocumented Endpoints

If you discover another undocumented endpoint (via browser DevTools):

1. Add field mappings to `FIELD_MAP` in `src/nomenclatures-extended.ts`
2. Create a tool function following the existing pattern (e.g., `createNomenclaturesReadTool`)
3. Add it to the `createNomenclaturesTools()` return array
4. It will be auto-registered by `index.ts` (no changes needed there)
5. Add unit tests in `tests/unit/nomenclatures-extended.test.ts`
```

- [ ] **Step 4: Update CLAUDE.md**

Add to the Architecture section in `CLAUDE.md`, after the `src/utilities.ts` line:

```markdown
- **`src/nomenclatures-extended.ts`** — Three hardcoded tools for undocumented `/org2/nomenclatures/` endpoints. English↔1C Cyrillic field mapping for planning fields (minStock, maxStock, speedOfDemand, etc.).
```

Add to the "Key API Patterns" section:

```markdown
- **Undocumented API layer** at `/org2/nomenclatures/` (plural, note: different from `/org2/nomenclature/` singular) — exposes planning/accounting fields using 1C-style Cyrillic field names
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/bimp-api-discovery.md .claude/skills/bimp-erp-domain.md .claude/skills/bimp-mcp-development.md CLAUDE.md
git commit -m "docs: add nomenclatures-extended documentation to skills and CLAUDE.md"
```

---

### Task 9: Demo Script

**Files:**
- Create: `scripts/demo-nomenclatures.ts`

- [ ] **Step 1: Write the demo script**

```typescript
// scripts/demo-nomenclatures.ts
//
// Interactive demo of the nomenclatures-extended tools.
// Usage: npx tsx scripts/demo-nomenclatures.ts
//
// Requires .env with BIMP_EMAIL, BIMP_PASSWORD, BIMP_COMPANY_CODE
//
import { config } from "dotenv";
config();

import { BimpClient } from "../src/client.js";
import { createNomenclaturesTools } from "../src/nomenclatures-extended.js";

const client = new BimpClient({
  email: process.env.BIMP_EMAIL!,
  password: process.env.BIMP_PASSWORD!,
  companyCode: process.env.BIMP_COMPANY_CODE!,
  baseUrl: process.env.BIMP_BASE_URL,
});

const tools = createNomenclaturesTools(client);
const read = tools.find((t) => t.name === "bimp_nomenclatures_read")!;
const upsert = tools.find((t) => t.name === "bimp_nomenclatures_upsert")!;
const readList = tools.find((t) => t.name === "bimp_nomenclatures_readList")!;

function log(label: string, data: unknown) {
  console.log(`\n━━━ ${label} ━━━`);
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  console.log("BIMP Nomenclatures Extended — Demo\n");

  // 1. List all products (extended)
  console.log("1. Fetching all products via bimp_nomenclatures_readList...");
  const list = (await readList.handler({})) as { items: Array<Record<string, unknown>>; count: number };
  console.log(`   Found ${list.count} products`);

  if (list.count === 0) {
    console.log("   No products found. Creating a demo product...");

    // Create a product via standard API first
    const unitList = (await client.request("POST", "/org2/unitsOfMeasurment/api-readList", {
      pagination: { offset: 0, count: 1 },
    })) as { success: boolean; data: Array<{ uuid: string; name: string }> };

    const created = (await client.request("POST", "/org2/nomenclature/api-create", {
      name: `Demo Product ${Date.now()}`,
      unitOfMeasurementUuid: unitList.data[0].uuid,
    })) as { success: boolean; data: { uuid: string } };

    console.log(`   Created product: ${created.data.uuid}`);

    // Re-fetch list
    const list2 = (await readList.handler({})) as { items: Array<Record<string, unknown>>; count: number };
    list.items = list2.items;
    list.count = list2.count;
  }

  // Show first 3 items
  log("Products (first 3)", list.items.slice(0, 3).map((p) => ({
    uuid: p.uuid,
    name: p.name,
    article: p.article,
    minStock: p.minStock,
  })));

  // 2. Read full details for first product
  const firstUuid = list.items[0].uuid as string;
  console.log(`\n2. Reading full product card for ${firstUuid}...`);
  const full = await read.handler({ uuid: firstUuid });
  log("Full Product Card", full);

  // 3. Update planning fields
  console.log("\n3. Setting planning fields via bimp_nomenclatures_upsert...");
  const planningUpdate = {
    uuid: firstUuid,
    minStock: 25,
    maxStock: 200,
    speedOfDemand: 5,
    insuranceReserve: 10,
    deliveryTerm: 14,
  };
  log("Sending", planningUpdate);
  const upsertResult = await upsert.handler(planningUpdate);
  log("Result", upsertResult);

  // 4. Verify the update
  console.log("\n4. Verifying planning fields were saved...");
  const verified = (await read.handler({ uuid: firstUuid })) as Record<string, unknown>;
  log("Verified Fields", {
    minStock: verified.minStock,
    maxStock: verified.maxStock,
    speedOfDemand: verified.speedOfDemand,
    insuranceReserve: verified.insuranceReserve,
    deliveryTerm: verified.deliveryTerm,
  });

  const allMatch =
    verified.minStock === 25 &&
    verified.maxStock === 200 &&
    verified.speedOfDemand === 5 &&
    verified.insuranceReserve === 10 &&
    verified.deliveryTerm === 14;

  console.log(allMatch ? "\nAll planning fields verified!" : "\nSome fields did not match — check output above.");

  // 5. Quick deficit analysis
  console.log("\n5. Quick deficit analysis...");
  const productsWithMinStock = list.items.filter(
    (p) => typeof p.minStock === "number" && (p.minStock as number) > 0
  );
  console.log(`   Products with minStock > 0: ${productsWithMinStock.length}`);
  for (const p of productsWithMinStock.slice(0, 5)) {
    console.log(`   - ${p.name}: minStock=${p.minStock}`);
  }

  console.log("\nDemo complete.");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add demo script to package.json**

Add to the `scripts` section of `package.json`:

```json
"demo:nomenclatures": "tsx scripts/demo-nomenclatures.ts"
```

- [ ] **Step 3: Run the demo to verify it works**

Run: `npm run demo:nomenclatures`
Expected: Output showing product list, full card read, planning field update, verification, and deficit analysis. No errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/demo-nomenclatures.ts package.json
git commit -m "feat: add demo script for nomenclatures-extended tools"
```

---

## Spec Coverage Checklist

| Spec Section | Task |
|-------------|------|
| Field mapping (English ↔ 1C) | Task 1 |
| Tool 1: bimp_nomenclatures_read | Task 2 |
| Tool 2: bimp_nomenclatures_upsert | Task 3 |
| Tool 3: bimp_nomenclatures_readList | Task 4 |
| Integration: src/index.ts | Task 5 |
| E2E Test: 8 steps | Task 6 |
| Unit tests | Tasks 1-4 |
| Prompt updates | Task 7 |
| Skills docs | Task 8 |
| CLAUDE.md | Task 8 |
| Demo script | Task 9 |
