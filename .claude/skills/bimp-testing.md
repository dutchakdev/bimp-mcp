# BIMP MCP Testing Guide

## Test Structure

```
tests/
  setup-env.ts                  Loads .env via dotenv (used by integration & functional)
  unit/
    client.test.ts              BimpClient with mocked fetch (login, refresh, path params)
    tool-generator.test.ts      pathToToolName, generateTools, exclusions, pagination detection
    utilities.test.ts           bimp_fetch_all, bimp_batch_read, bimp_bulk_update with mocks
  integration/
    auth.test.ts                Real auth: login, listCompanies, switchCompany, token reuse
    crud.test.ts                Real CRUD: nomenclature create/update, counterparty list, reference data
    inventory.test.ts           Real inventory: page/pageSize pagination, cursor pagination
  functional/                   End-to-end MCP protocol tests (planned)
```

## Test Configuration

Tests are configured in `vitest.config.ts` with three projects:

| Project | Include Pattern | Timeout | Setup | Command |
|---|---|---|---|---|
| unit | `tests/unit/**/*.test.ts` | default (5s) | none | `npm test` |
| integration | `tests/integration/**/*.test.ts` | 30,000ms | `tests/setup-env.ts` | `npm run test:integration` |
| functional | `tests/functional/**/*.test.ts` | 120,000ms | `tests/setup-env.ts` | `npm run test:functional` |

Run all suites: `npm run test:all`

## Test Companies

| Company | Code | Purpose | Notes |
|---|---|---|---|
| nailsmade shop | `000001398` | Primary test company | Safe for create/update/delete operations |
| HEYLOVE | `000001220` | Read-only reference company | Only use for read operations, do not modify data |

Set the test company in `.env`:

```env
BIMP_EMAIL=your-email@example.com
BIMP_PASSWORD=your-password
BIMP_COMPANY_CODE=000001398
```

## Writing Unit Tests

Unit tests mock all external dependencies. Use `vi.fn()` for the BimpClient and `vi.stubGlobal("fetch", mockFetch)` for raw fetch calls.

### Example: Testing a utility tool

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUtilityTools, type UtilityTool } from "../../src/utilities.js";
import type { BimpClient } from "../../src/client.js";
import type { ToolDefinition } from "../../src/tool-generator.js";

function createMockClient() {
  return { request: vi.fn() } as unknown as BimpClient;
}

function createToolMap(tools: ToolDefinition[]): Map<string, ToolDefinition> {
  const map = new Map<string, ToolDefinition>();
  for (const t of tools) map.set(t.name, t);
  return map;
}

// Define mock tool definitions matching the shape of real ones
const myReadList: ToolDefinition = {
  name: "bimp_entity_readList",
  description: "List entities",
  inputSchema: { type: "object", properties: {} },
  metadata: {
    method: "POST",
    path: "/org2/entity/api-readList",
    tag: "Entity",
    paginationType: "offset",
    pathParams: [],
  },
};

describe("my utility tool", () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: UtilityTool[];

  beforeEach(() => {
    client = createMockClient();
    const toolMap = createToolMap([myReadList]);
    tools = createUtilityTools(client as unknown as BimpClient, toolMap);
  });

  it("should do something", async () => {
    const mockRequest = client.request as ReturnType<typeof vi.fn>;
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: [{ uuid: "u1" }],
    });

    const tool = tools.find((t) => t.name === "bimp_fetch_all")!;
    const result = await tool.handler({ tool: "bimp_entity_readList" });
    expect(result).toBeDefined();
  });
});
```

### Example: Testing the BimpClient with mocked fetch

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BimpClient } from "../../src/client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("BimpClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should auto-login on first request", async () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });

    // Mock login -> selectCompany -> actual request
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: "at", refreshToken: "rt" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { companyAccessToken: "cat" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });

    const result = await client.request("POST", "/org2/warehouse/api-readList", {
      pagination: { offset: 0, count: 10 },
    });

    expect(result).toEqual({ success: true, data: [] });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
```

### Example: Testing tool generation

```typescript
import { describe, it, expect } from "vitest";
import { generateTools, pathToToolName } from "../../src/tool-generator.js";

describe("pathToToolName", () => {
  it("converts standard path", () => {
    expect(pathToToolName("/org2/nomenclature/api-readList")).toBe(
      "bimp_nomenclature_readList"
    );
  });
});

describe("generateTools", () => {
  it("generates tools from a minimal spec", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "0.1.0" },
      components: { securitySchemes: {}, schemas: {} },
      paths: {
        "/org2/myEntity/api-readList": {
          post: {
            tags: ["MyEntity"],
            description: "List my entities",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      pagination: { type: "object" },
                    },
                    required: ["pagination"],
                  },
                },
              },
            },
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };

    const tools = generateTools(spec);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("bimp_myEntity_readList");
    expect(tools[0].metadata.paginationType).toBe("offset");
  });
});
```

## Writing Integration Tests

Integration tests call the real BIMP API. They require valid credentials in `.env` and use the test company (nailsmade shop, `000001398`).

### Example: Testing a real API endpoint

```typescript
import { describe, it, expect } from "vitest";
import { BimpClient } from "../../src/client.js";

const client = new BimpClient({
  email: process.env.BIMP_EMAIL!,
  password: process.env.BIMP_PASSWORD!,
  companyCode: process.env.BIMP_COMPANY_CODE!,
  baseUrl: process.env.BIMP_BASE_URL,
});

describe("Entity Integration", () => {
  it("should list entities", async () => {
    const result = (await client.request(
      "POST",
      "/org2/entity/api-readList",
      { pagination: { offset: 0, count: 5 } }
    )) as { success: boolean; data: unknown[] };

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should read a single entity by UUID", async () => {
    // First get a UUID from the list
    const list = (await client.request(
      "POST",
      "/org2/entity/api-readList",
      { pagination: { offset: 0, count: 1 } }
    )) as { success: boolean; data: Array<{ uuid: string }> };

    expect(list.data.length).toBeGreaterThan(0);

    const detail = (await client.request(
      "POST",
      "/org2/entity/api-read",
      { uuid: list.data[0].uuid }
    )) as { success: boolean; data: { uuid: string } };

    expect(detail.success).toBe(true);
    expect(detail.data.uuid).toBe(list.data[0].uuid);
  });
});
```

### Guidelines for Integration Tests

- Always use small page sizes (`count: 1` or `count: 5`) to minimize API load
- For create/update tests, use the nailsmade shop company (`000001398`)
- Clean up created test data when possible (delete after test)
- Use `expect(result.success).toBe(true)` as the first assertion
- Handle cases where the test company has no data: check `data.length > 0` or skip gracefully

## Writing Functional Tests

Functional tests validate the full MCP server protocol: tool listing, tool execution, prompt retrieval. They test the server end-to-end as an MCP client would use it.

### Example: Testing tool listing and execution

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateTools } from "../../src/tool-generator.js";
import { BimpClient } from "../../src/client.js";
import { createUtilityTools } from "../../src/utilities.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(__dirname, "../..", "bimp-api.json");

describe("MCP Functional", () => {
  it("should generate tools from the real spec", () => {
    const spec = JSON.parse(readFileSync(specPath, "utf-8"));
    const tools = generateTools(spec);
    expect(tools.length).toBeGreaterThan(0);

    // Every tool should have required fields
    for (const tool of tools) {
      expect(tool.name).toMatch(/^bimp_/);
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.metadata.method).toBeDefined();
      expect(tool.metadata.path).toMatch(/^\/org2\//);
    }
  });

  it("should execute a fetch_all call", async () => {
    const spec = JSON.parse(readFileSync(specPath, "utf-8"));
    const tools = generateTools(spec);
    const toolMap = new Map(tools.map((t) => [t.name, t]));

    const client = new BimpClient({
      email: process.env.BIMP_EMAIL!,
      password: process.env.BIMP_PASSWORD!,
      companyCode: process.env.BIMP_COMPANY_CODE!,
      baseUrl: process.env.BIMP_BASE_URL,
    });

    const utilityTools = createUtilityTools(client, toolMap);
    const fetchAll = utilityTools.find((t) => t.name === "bimp_fetch_all")!;

    const result = (await fetchAll.handler({
      tool: "bimp_warehouse_readList",
      limit: 5,
    })) as { items: unknown[]; count: number };

    expect(result.count).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(5);
  });
});
```

## Commands Reference

```bash
npm test                       # Unit tests (fast, no network)
npm run test:integration       # Integration tests (real API calls)
npm run test:functional        # Functional tests (end-to-end)
npm run test:all               # All suites
npm run test:watch             # Unit tests in watch mode
```
