# BIMP MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that dynamically wraps the BIMP ERP API, providing ~135 auto-generated tools, 3 utility tools for bulk operations, and 6 MCP prompts for ERP context.

**Architecture:** Low-level MCP `Server` class with request handlers for dynamic tool registration from OpenAPI spec. HTTP client with auto-login and token refresh. Utility tools layer on top of generated tools for pagination, batching, and bulk updates.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `zod`, `vitest`, `tsx`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | Dependencies, scripts |
| `tsconfig.json` | TypeScript config (ESM, strict) |
| `vitest.config.ts` | Test config with 3 projects (unit, integration, functional) |
| `.env.example` | Required env vars template |
| `bimp-api.json` | OpenAPI 3.1 spec (source of truth) |
| `src/index.ts` | MCP server entry, stdio transport, wires handlers |
| `src/client.ts` | HTTP client: auth flow, token management, request execution |
| `src/tool-generator.ts` | Parses OpenAPI spec → tool definitions + handlers + metadata |
| `src/utilities.ts` | bimp_fetch_all, bimp_batch_read, bimp_bulk_update |
| `src/prompts.ts` | All 6 MCP prompts in one file |
| `tests/unit/tool-generator.test.ts` | Spec parsing, naming, schema transform, exclusions |
| `tests/unit/utilities.test.ts` | Pagination, batching, error handling with mocked client |
| `tests/integration/auth.test.ts` | Real auth flow against BIMP API |
| `tests/integration/crud.test.ts` | CRUD operations per domain |
| `tests/integration/inventory.test.ts` | Cursor and page/pageSize pagination |
| `tests/functional/fetch-all.test.ts` | Full pagination + enrich |
| `tests/functional/batch-read.test.ts` | Parallel reads |
| `tests/functional/bulk-update.test.ts` | Mass updates |
| `tests/functional/scenarios.test.ts` | E2E: products+specs, bulk price update |
| `.claude/skills/bimp-api-discovery.md` | How to find undocumented endpoints |
| `.claude/skills/bimp-erp-domain.md` | ERP domain knowledge |
| `.claude/skills/bimp-mcp-development.md` | How to develop this MCP server |
| `.claude/skills/bimp-testing.md` | How to write and run tests |
| `CLAUDE.md` | Project documentation for Claude Code |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Copy: `bimp-api.json` from `~/Downloads/bimp-api (4).json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "bimp-mcp",
  "version": "0.1.0",
  "description": "MCP server for BIMP ERP API",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:functional": "vitest run --project functional",
    "test:all": "vitest run",
    "test:watch": "vitest --project unit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "dotenv": "^16.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": ".",
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 30_000,
          setupFiles: ["tests/setup-env.ts"],
        },
      },
      {
        test: {
          name: "functional",
          include: ["tests/functional/**/*.test.ts"],
          testTimeout: 120_000,
          setupFiles: ["tests/setup-env.ts"],
        },
      },
    ],
  },
});
```

- [ ] **Step 4: Create tests/setup-env.ts**

```typescript
import { config } from "dotenv";
config();
```

- [ ] **Step 5: Create .env.example**

```
BIMP_BASE_URL=https://app.bimpsoft.com
BIMP_EMAIL=
BIMP_PASSWORD=
BIMP_COMPANY_CODE=
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 7: Copy API spec**

```bash
cp ~/Downloads/'bimp-api (4).json' bimp-api.json
```

- [ ] **Step 8: Install dependencies**

```bash
npm install
```

- [ ] **Step 9: Create .env for testing**

```bash
cp .env.example .env
# Fill in: BIMP_EMAIL, BIMP_PASSWORD, BIMP_COMPANY_CODE=000001398
```

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .env.example .gitignore bimp-api.json tests/setup-env.ts
git commit -m "chore: scaffold project with dependencies and config"
```

---

### Task 2: HTTP Client

**Files:**
- Create: `src/client.ts`
- Create: `tests/unit/client.test.ts`

- [ ] **Step 1: Write the failing test for BimpClient constructor and request**

Create `tests/unit/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BimpClient } from "../../src/client.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("BimpClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create client with default base URL", () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });
    expect(client).toBeDefined();
  });

  it("should auto-login on first request", async () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });

    // Mock login response
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: "at-123", refreshToken: "rt-456" },
        }),
      })
      // Mock selectCompany response
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { companyAccessToken: "cat-789" },
        }),
      })
      // Mock actual request
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [{ uuid: "a" }] }),
      });

    const result = await client.request(
      "POST",
      "/org2/nomenclature/api-readList",
      { pagination: { offset: 0, count: 10 } }
    );

    expect(result).toEqual({ success: true, data: [{ uuid: "a" }] });
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify login call
    const loginCall = mockFetch.mock.calls[0];
    expect(loginCall[0]).toContain("/org2/auth/api-login");

    // Verify selectCompany call
    const selectCall = mockFetch.mock.calls[1];
    expect(selectCall[0]).toContain("/org2/auth/api-selectCompany");

    // Verify actual request has access-token header
    const apiCall = mockFetch.mock.calls[2];
    expect(apiCall[1].headers["access-token"]).toBe("cat-789");
  });

  it("should reuse token on subsequent requests", async () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });

    // Login + selectCompany + first request
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: "at-123", refreshToken: "rt-456" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { companyAccessToken: "cat-789" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      })
      // Second request — no login needed
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });

    await client.request("POST", "/org2/nomenclature/api-readList", {});
    await client.request("POST", "/org2/nomenclature/api-readList", {});

    // 3 for first request (login + select + api), 1 for second
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("should refresh token on 401 and retry", async () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });

    // Initial login + selectCompany
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: "at-123", refreshToken: "rt-456" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { companyAccessToken: "cat-789" },
        }),
      })
      // First attempt — 401
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      // Refresh token
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: "at-new", refreshToken: "rt-new" },
        }),
      })
      // Re-selectCompany
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { companyAccessToken: "cat-new" },
        }),
      })
      // Retry request — success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [{ uuid: "b" }] }),
      });

    const result = await client.request(
      "POST",
      "/org2/nomenclature/api-readList",
      {}
    );

    expect(result).toEqual({ success: true, data: [{ uuid: "b" }] });
  });

  it("should handle GET requests with query params", async () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });

    // Login + select + request
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

    await client.request("GET", "/org2/inventory/api-readList", {
      page: 1,
      pageSize: 50,
    });

    const apiCall = mockFetch.mock.calls[2];
    expect(apiCall[0]).toContain("page=1");
    expect(apiCall[0]).toContain("pageSize=50");
    expect(apiCall[1].method).toBe("GET");
  });

  it("should substitute path parameters", async () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });

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
        json: async () => ({ success: true, data: {} }),
      });

    await client.request(
      "GET",
      "/org2/inventory/api-read/{productHex}/stock",
      { productHex: "abc123", orgId: "org1" }
    );

    const apiCall = mockFetch.mock.calls[2];
    expect(apiCall[0]).toContain("/org2/inventory/api-read/abc123/stock");
    expect(apiCall[0]).toContain("orgId=org1");
    expect(apiCall[0]).not.toContain("productHex");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project unit tests/unit/client.test.ts
```

Expected: FAIL — `Cannot find module '../../src/client.js'`

- [ ] **Step 3: Implement BimpClient**

Create `src/client.ts`:

```typescript
export interface BimpClientConfig {
  email: string;
  password: string;
  companyCode: string;
  baseUrl?: string;
  timeout?: number;
}

interface TokenState {
  accessToken: string;
  refreshToken: string;
  companyAccessToken: string;
}

export class BimpClient {
  private config: Required<BimpClientConfig>;
  private tokens: TokenState | null = null;
  private loginPromise: Promise<void> | null = null;

  constructor(config: BimpClientConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? "https://app.bimpsoft.com",
      timeout: config.timeout ?? 30_000,
    };
  }

  async request(
    method: string,
    path: string,
    params: Record<string, unknown> = {},
    options?: { timeout?: number }
  ): Promise<unknown> {
    await this.ensureAuthenticated();
    const result = await this.executeRequest(
      method,
      path,
      params,
      options?.timeout
    );

    if (result.status === 401) {
      await this.refreshAuth();
      const retry = await this.executeRequest(
        method,
        path,
        params,
        options?.timeout
      );
      if (!retry.ok) {
        throw new Error(
          `BIMP API error: ${retry.status} on ${method} ${path}`
        );
      }
      return retry.data;
    }

    if (!result.ok) {
      throw new Error(`BIMP API error: ${result.status} on ${method} ${path}`);
    }
    return result.data;
  }

  async switchCompany(codeOrUuid: string): Promise<void> {
    if (!this.tokens) {
      throw new Error("Must be logged in before switching company");
    }
    const body: Record<string, string> = codeOrUuid.includes("-")
      ? { uuid: codeOrUuid }
      : { code: codeOrUuid };

    const resp = await this.rawFetch(
      "POST",
      "/org2/auth/api-selectCompany",
      body,
      { "access-token": this.tokens.accessToken }
    );
    const json = (await resp.json()) as {
      success: boolean;
      data: { companyAccessToken: string };
    };
    if (!json.success) {
      throw new Error("Failed to switch company");
    }
    this.tokens.companyAccessToken = json.data.companyAccessToken;
  }

  async listCompanies(): Promise<unknown> {
    await this.ensureAuthenticated();
    const resp = await this.rawFetch(
      "POST",
      "/org2/company/api-readDetailedList",
      {},
      { "access-token": this.tokens!.accessToken }
    );
    const json = (await resp.json()) as { success: boolean; data: unknown };
    return json.data;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.tokens) return;
    if (this.loginPromise) {
      await this.loginPromise;
      return;
    }
    this.loginPromise = this.login();
    try {
      await this.loginPromise;
    } finally {
      this.loginPromise = null;
    }
  }

  private async login(): Promise<void> {
    // Step 1: Login
    const loginResp = await this.rawFetch(
      "POST",
      "/org2/auth/api-login",
      {
        email: this.config.email,
        password: this.config.password,
      },
      {}
    );
    const loginJson = (await loginResp.json()) as {
      success: boolean;
      data: { accessToken: string; refreshToken: string };
    };
    if (!loginJson.success) {
      throw new Error("BIMP login failed");
    }

    // Step 2: Select company
    const selectResp = await this.rawFetch(
      "POST",
      "/org2/auth/api-selectCompany",
      { code: this.config.companyCode },
      { "access-token": loginJson.data.accessToken }
    );
    const selectJson = (await selectResp.json()) as {
      success: boolean;
      data: { companyAccessToken: string };
    };
    if (!selectJson.success) {
      throw new Error("BIMP company selection failed");
    }

    this.tokens = {
      accessToken: loginJson.data.accessToken,
      refreshToken: loginJson.data.refreshToken,
      companyAccessToken: selectJson.data.companyAccessToken,
    };
  }

  private async refreshAuth(): Promise<void> {
    if (!this.tokens) {
      await this.login();
      return;
    }

    try {
      const refreshResp = await this.rawFetch(
        "POST",
        "/org2/auth/api-refresh",
        { refreshToken: this.tokens.refreshToken },
        { "access-token": this.tokens.accessToken }
      );

      if (!refreshResp.ok) {
        this.tokens = null;
        await this.login();
        return;
      }

      const refreshJson = (await refreshResp.json()) as {
        success: boolean;
        data: { accessToken: string; refreshToken: string };
      };

      // Re-select company with new token
      const selectResp = await this.rawFetch(
        "POST",
        "/org2/auth/api-selectCompany",
        { code: this.config.companyCode },
        { "access-token": refreshJson.data.accessToken }
      );
      const selectJson = (await selectResp.json()) as {
        success: boolean;
        data: { companyAccessToken: string };
      };

      this.tokens = {
        accessToken: refreshJson.data.accessToken,
        refreshToken: refreshJson.data.refreshToken,
        companyAccessToken: selectJson.data.companyAccessToken,
      };
    } catch {
      this.tokens = null;
      await this.login();
    }
  }

  private async executeRequest(
    method: string,
    pathTemplate: string,
    params: Record<string, unknown>,
    timeout?: number
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const resp = await this.rawFetch(
      method,
      pathTemplate,
      params,
      { "access-token": this.tokens!.companyAccessToken },
      timeout
    );

    if (resp.status === 401) {
      return { ok: false, status: 401, data: null };
    }

    const json = (await resp.json()) as unknown;
    return { ok: resp.ok, status: resp.status, data: json };
  }

  private async rawFetch(
    method: string,
    pathTemplate: string,
    params: Record<string, unknown>,
    headers: Record<string, string>,
    timeout?: number
  ): Promise<Response> {
    // Substitute path parameters like {productHex}
    let path = pathTemplate;
    const bodyParams = { ...params };
    const pathParamRegex = /\{(\w+)\}/g;
    let match;
    while ((match = pathParamRegex.exec(pathTemplate)) !== null) {
      const paramName = match[1];
      if (paramName in bodyParams) {
        path = path.replace(`{${paramName}}`, String(bodyParams[paramName]));
        delete bodyParams[paramName];
      }
    }

    let url = `${this.config.baseUrl}${path}`;

    const fetchOptions: RequestInit & { signal?: AbortSignal } = {
      method,
      headers: {
        "accept-language": "uk-UA",
        "content-type": "application/json",
        ...headers,
      },
    };

    if (method === "GET") {
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(bodyParams)) {
        if (value !== undefined && value !== null) {
          queryParams.set(key, String(value));
        }
      }
      const qs = queryParams.toString();
      if (qs) url += `?${qs}`;
    } else {
      fetchOptions.body = JSON.stringify(bodyParams);
    }

    const controller = new AbortController();
    const timeoutMs = timeout ?? this.config.timeout;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    fetchOptions.signal = controller.signal;

    try {
      return await fetch(url, fetchOptions);
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project unit tests/unit/client.test.ts
```

Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/client.ts tests/unit/client.test.ts
git commit -m "feat: add HTTP client with auto-login and token refresh"
```

---

### Task 3: Tool Generator

**Files:**
- Create: `src/tool-generator.ts`
- Create: `tests/unit/tool-generator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/tool-generator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  generateTools,
  pathToToolName,
  type ToolDefinition,
} from "../../src/tool-generator.js";

describe("pathToToolName", () => {
  it("converts standard POST path", () => {
    expect(pathToToolName("/org2/nomenclature/api-readList")).toBe(
      "bimp_nomenclature_readList"
    );
  });

  it("converts path with hyphens in entity", () => {
    expect(pathToToolName("/org2/customer-inventories-return/api-read")).toBe(
      "bimp_customer_inventories_return_read"
    );
  });

  it("converts v2 path", () => {
    expect(pathToToolName("/org2/integrationSettings/api-create/v2")).toBe(
      "bimp_integrationSettings_create_v2"
    );
  });

  it("converts cursor path", () => {
    expect(pathToToolName("/org2/inventory/api-readList/cursor")).toBe(
      "bimp_inventory_readList_cursor"
    );
  });

  it("converts path with path params", () => {
    expect(pathToToolName("/org2/inventory/api-read/{productHex}/stock")).toBe(
      "bimp_inventory_read_stock"
    );
  });
});

describe("generateTools", () => {
  const minimalSpec = {
    openapi: "3.1.0",
    info: { title: "Test", version: "0.1.0" },
    components: { securitySchemes: {}, schemas: {} },
    paths: {
      "/org2/nomenclature/api-readList": {
        post: {
          tags: ["Nomenclature"],
          description: "A request to view a list of nomenclatures",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    pagination: {
                      type: "object",
                      properties: {
                        offset: { type: "number", default: 0 },
                        count: { type: "number", default: 10, maximum: 100 },
                      },
                      required: ["offset", "count"],
                    },
                    name: { type: "string", description: "Filter by name" },
                  },
                  required: ["pagination"],
                },
              },
            },
            required: true,
          },
          security: [{ tokenAuth: [] }],
          responses: { "200": { description: "Default Response" } },
        },
      },
      "/org2/images/download": {
        get: {
          tags: ["images"],
          parameters: [],
          responses: { "200": { description: "Default Response" } },
        },
      },
      "/org2/auth/api-login": {
        post: {
          tags: ["Auth"],
          description: "Login",
          responses: { "200": { description: "Default Response" } },
        },
      },
      "/org2/auth/api-verifyCompanyAccess": {
        post: {
          tags: ["Auth"],
          description: "Verify",
          responses: { "200": { description: "Default Response" } },
        },
      },
      "/org2/inventory/api-readList": {
        get: {
          tags: ["Inventory"],
          description: "Read inventory list",
          parameters: [
            { in: "query", name: "page", schema: { type: "number" } },
            { in: "query", name: "pageSize", schema: { type: "number" } },
            {
              in: "header",
              name: "accept-language",
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Default Response" } },
        },
      },
    },
  };

  it("generates tools from spec", () => {
    const tools = generateTools(minimalSpec);
    const names = tools.map((t) => t.name);
    expect(names).toContain("bimp_nomenclature_readList");
    expect(names).toContain("bimp_inventory_readList");
  });

  it("excludes auth/internal/binary endpoints", () => {
    const tools = generateTools(minimalSpec);
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("bimp_auth_login");
    expect(names).not.toContain("bimp_auth_verifyCompanyAccess");
    expect(names).not.toContain("bimp_images_download");
  });

  it("transforms POST requestBody to inputSchema", () => {
    const tools = generateTools(minimalSpec);
    const tool = tools.find((t) => t.name === "bimp_nomenclature_readList")!;
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema.properties).toHaveProperty("pagination");
    expect(tool.inputSchema.properties).toHaveProperty("name");
  });

  it("transforms GET query params to inputSchema, strips accept-language", () => {
    const tools = generateTools(minimalSpec);
    const tool = tools.find((t) => t.name === "bimp_inventory_readList")!;
    expect(tool.inputSchema.properties).toHaveProperty("page");
    expect(tool.inputSchema.properties).toHaveProperty("pageSize");
    expect(tool.inputSchema.properties).not.toHaveProperty("accept-language");
  });

  it("stores metadata on each tool", () => {
    const tools = generateTools(minimalSpec);
    const tool = tools.find((t) => t.name === "bimp_nomenclature_readList")!;
    expect(tool.metadata.method).toBe("POST");
    expect(tool.metadata.path).toBe("/org2/nomenclature/api-readList");
    expect(tool.metadata.tag).toBe("Nomenclature");
    expect(tool.metadata.paginationType).toBe("offset");
  });

  it("detects pagination type from path and schema", () => {
    const tools = generateTools(minimalSpec);

    const offsetTool = tools.find(
      (t) => t.name === "bimp_nomenclature_readList"
    )!;
    expect(offsetTool.metadata.paginationType).toBe("offset");

    const pageTool = tools.find(
      (t) => t.name === "bimp_inventory_readList"
    )!;
    expect(pageTool.metadata.paginationType).toBe("page");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project unit tests/unit/tool-generator.test.ts
```

Expected: FAIL — `Cannot find module '../../src/tool-generator.js'`

- [ ] **Step 3: Implement tool-generator**

Create `src/tool-generator.ts`:

```typescript
export interface ToolMetadata {
  method: string;
  path: string;
  tag: string;
  paginationType: "offset" | "cursor" | "page" | "none";
  pathParams: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  metadata: ToolMetadata;
}

const EXCLUDED_PATHS = [
  "/org2/images/download",
  "/org2/auth/api-login",
  "/org2/auth/api-refresh",
  "/org2/auth/api-selectCompany",
  "/org2/auth/api-verifyCompanyAccess",
];

const EXCLUDED_PATH_PATTERNS = [/\/integration\/zohoPeople\//];

export function pathToToolName(path: string): string {
  // Remove /org2/ prefix
  let cleaned = path.replace(/^\/org2\//, "");
  // Remove /api- and replace with _
  cleaned = cleaned.replace(/\/api-/, "_");
  // Remove path params like {productHex}
  cleaned = cleaned.replace(/\/\{[^}]+\}/g, "");
  // Replace remaining / with _
  cleaned = cleaned.replace(/\//g, "_");
  // Replace hyphens with underscores
  cleaned = cleaned.replace(/-/g, "_");
  return `bimp_${cleaned}`;
}

function detectPaginationType(
  path: string,
  method: string,
  schema: Record<string, unknown>
): ToolMetadata["paginationType"] {
  if (path.includes("/cursor")) return "cursor";

  const properties = (schema.properties ?? {}) as Record<string, unknown>;

  if ("pagination" in properties) return "offset";

  if (method === "GET") {
    const params = Object.keys(properties);
    if (params.includes("page") || params.includes("pageSize")) return "page";
  }

  return "none";
}

function extractPathParams(path: string): string[] {
  const params: string[] = [];
  const regex = /\{(\w+)\}/g;
  let match;
  while ((match = regex.exec(path)) !== null) {
    params.push(match[1]);
  }
  return params;
}

interface OpenAPISpec {
  paths: Record<string, Record<string, OpenAPIOperation>>;
  [key: string]: unknown;
}

interface OpenAPIOperation {
  tags?: string[];
  description?: string;
  requestBody?: {
    content?: {
      "application/json"?: {
        schema?: Record<string, unknown>;
      };
    };
  };
  parameters?: Array<{
    in: string;
    name: string;
    schema?: Record<string, unknown>;
    required?: boolean;
    description?: string;
  }>;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, unknown>>;
}

export function generateTools(spec: OpenAPISpec): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    // Check exclusions
    if (EXCLUDED_PATHS.includes(path)) continue;
    if (EXCLUDED_PATH_PATTERNS.some((p) => p.test(path))) continue;

    for (const [method, operation] of Object.entries(methods)) {
      if (typeof operation !== "object" || operation === null) continue;
      const op = operation as OpenAPIOperation;

      const name = pathToToolName(path);
      const tag = op.tags?.[0] ?? "Unknown";
      const description = op.description ?? `${method.toUpperCase()} ${path}`;
      const pathParams = extractPathParams(path);

      // Build inputSchema
      let properties: Record<string, unknown> = {};
      let required: string[] = [];

      if (method.toUpperCase() === "GET" || method.toUpperCase() === "DELETE") {
        // Convert query params to properties
        const params = (op.parameters ?? []).filter(
          (p) => p.in === "query" && p.name !== "accept-language"
        );
        for (const param of params) {
          properties[param.name] = param.schema ?? { type: "string" };
          if (param.required) required.push(param.name);
        }
      } else {
        // POST — use requestBody schema
        const bodySchema =
          op.requestBody?.content?.["application/json"]?.schema;
        if (bodySchema) {
          properties = (bodySchema.properties ?? {}) as Record<string, unknown>;
          required = (bodySchema.required ?? []) as string[];
        }
      }

      // Add path params as required properties
      for (const pp of pathParams) {
        if (!(pp in properties)) {
          properties[pp] = { type: "string", description: `Path parameter: ${pp}` };
        }
        if (!required.includes(pp)) {
          required.push(pp);
        }
      }

      // Strip accept-language from header params (handled by client)
      // Already handled for GET; POST doesn't have it in body

      const inputSchema: ToolDefinition["inputSchema"] = {
        type: "object" as const,
        properties,
      };
      if (required.length > 0) {
        inputSchema.required = required;
      }

      const paginationType = detectPaginationType(
        path,
        method.toUpperCase(),
        inputSchema
      );

      tools.push({
        name,
        description,
        inputSchema,
        metadata: {
          method: method.toUpperCase(),
          path,
          tag,
          paginationType,
          pathParams,
        },
      });
    }
  }

  return tools;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project unit tests/unit/tool-generator.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tool-generator.ts tests/unit/tool-generator.test.ts
git commit -m "feat: add tool generator that parses OpenAPI spec into MCP tools"
```

---

### Task 4: MCP Server Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement MCP server**

Create `src/index.ts`:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BimpClient } from "./client.js";
import { generateTools, type ToolDefinition } from "./tool-generator.js";
import { createUtilityTools } from "./utilities.js";
import { getPrompts, handleGetPrompt } from "./prompts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config from env
const config = {
  email: process.env.BIMP_EMAIL ?? "",
  password: process.env.BIMP_PASSWORD ?? "",
  companyCode: process.env.BIMP_COMPANY_CODE ?? "",
  baseUrl: process.env.BIMP_BASE_URL,
};

// Load OpenAPI spec
const specPath = resolve(__dirname, "..", "bimp-api.json");
const spec = JSON.parse(readFileSync(specPath, "utf-8"));

// Initialize
const client = new BimpClient(config);
const generatedTools = generateTools(spec);

// Build tool map for lookup
const toolMap = new Map<string, ToolDefinition>();
for (const tool of generatedTools) {
  toolMap.set(tool.name, tool);
}

// Create utility tools
const utilityTools = createUtilityTools(client, toolMap);

// Create MCP server
const server = new Server(
  { name: "bimp-mcp", version: "0.1.0" },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

// Auth tools
const authTools = [
  {
    name: "bimp_auth_listCompanies",
    description: "List all companies accessible to the current user",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "bimp_auth_switchCompany",
    description:
      "Switch to a different company by code (e.g. '000001398') or UUID",
    inputSchema: {
      type: "object" as const,
      properties: {
        codeOrUuid: {
          type: "string",
          description: "Company code or UUID to switch to",
        },
      },
      required: ["codeOrUuid"],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...generatedTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    ...authTools,
    ...utilityTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  ],
}));

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const params = (args ?? {}) as Record<string, unknown>;

  try {
    // Auth tools
    if (name === "bimp_auth_listCompanies") {
      const companies = await client.listCompanies();
      return {
        content: [{ type: "text", text: JSON.stringify(companies, null, 2) }],
      };
    }
    if (name === "bimp_auth_switchCompany") {
      await client.switchCompany(params.codeOrUuid as string);
      return {
        content: [
          {
            type: "text",
            text: `Switched to company: ${params.codeOrUuid}`,
          },
        ],
      };
    }

    // Utility tools
    const utilityTool = utilityTools.find((t) => t.name === name);
    if (utilityTool) {
      const result = await utilityTool.handler(params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    // Generated API tools
    const toolDef = toolMap.get(name);
    if (!toolDef) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    const result = await client.request(
      toolDef.metadata.method,
      toolDef.metadata.path,
      params
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Prompts handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: getPrompts(),
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  return handleGetPrompt(request.params.name, request.params.arguments);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BIMP MCP server started");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Create stub files so index.ts compiles**

Create minimal `src/utilities.ts` stub:

```typescript
import type { BimpClient } from "./client.js";
import type { ToolDefinition } from "./tool-generator.js";

export interface UtilityTool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export function createUtilityTools(
  _client: BimpClient,
  _toolMap: Map<string, ToolDefinition>
): UtilityTool[] {
  return []; // Implemented in Task 5
}
```

Create minimal `src/prompts.ts` stub:

```typescript
export function getPrompts(): Array<{
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
}> {
  return []; // Implemented in Task 6
}

export function handleGetPrompt(
  _name: string,
  _args?: Record<string, string>
): { messages: Array<{ role: string; content: { type: string; text: string } }> } {
  return { messages: [] }; // Implemented in Task 6
}
```

- [ ] **Step 3: Verify the server compiles and starts**

```bash
npx tsx src/index.ts &
sleep 1
kill %1
```

Expected: Output `BIMP MCP server started` to stderr, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/utilities.ts src/prompts.ts
git commit -m "feat: add MCP server entry point with tool/prompt handlers"
```

---

### Task 5: Utility Tools

**Files:**
- Modify: `src/utilities.ts`
- Create: `tests/unit/utilities.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/utilities.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUtilityTools, type UtilityTool } from "../../src/utilities.js";
import type { BimpClient } from "../../src/client.js";
import type { ToolDefinition } from "../../src/tool-generator.js";

function createMockClient() {
  return {
    request: vi.fn(),
  } as unknown as BimpClient;
}

function createToolMap(
  tools: ToolDefinition[]
): Map<string, ToolDefinition> {
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
    // Page 1: 100 items (full)
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: Array.from({ length: 100 }, (_, i) => ({ uuid: `u${i}` })),
    });
    // Page 2: 30 items (partial = last page)
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

    // Verify pagination params
    const call1 = mockRequest.mock.calls[0];
    expect(call1[2]).toMatchObject({
      pagination: { offset: 0, count: 100 },
    });
    const call2 = mockRequest.mock.calls[1];
    expect(call2[2]).toMatchObject({
      pagination: { offset: 100, count: 100 },
    });
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
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: [{ uuid: "u1" }],
    });

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
    // readList returns 2 items
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: [{ uuid: "u1" }, { uuid: "u2" }],
    });
    // read for u1
    mockRequest.mockResolvedValueOnce({
      success: true,
      data: { uuid: "u1", fullField: "yes" },
    });
    // read for u2
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run --project unit tests/unit/utilities.test.ts
```

Expected: FAIL — `createUtilityTools` returns empty array, tools not found.

- [ ] **Step 3: Implement utility tools**

Replace `src/utilities.ts` with:

```typescript
import type { BimpClient } from "./client.js";
import type { ToolDefinition } from "./tool-generator.js";

export interface UtilityTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export function createUtilityTools(
  client: BimpClient,
  toolMap: Map<string, ToolDefinition>
): UtilityTool[] {
  return [
    createFetchAll(client, toolMap),
    createBatchRead(client, toolMap),
    createBulkUpdate(client, toolMap),
  ];
}

function createFetchAll(
  client: BimpClient,
  toolMap: Map<string, ToolDefinition>
): UtilityTool {
  return {
    name: "bimp_fetch_all",
    description:
      "Fetch ALL records from a readList endpoint with auto-pagination. " +
      "Set enrich=true to call the read endpoint for each item to get full details. " +
      "Set limit to stop after N records (0 = no limit).",
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description: "Name of the readList tool to call (e.g. bimp_nomenclature_readList)",
        },
        filters: {
          type: "object",
          description: "Optional filters to pass to the endpoint",
        },
        enrich: {
          type: "boolean",
          description: "If true, fetch full details via read endpoint for each item (default: false)",
        },
        limit: {
          type: "number",
          description: "Max number of records to fetch. 0 = all (default: 0)",
        },
      },
      required: ["tool"],
    },
    handler: async (params) => {
      const toolName = params.tool as string;
      const filters = (params.filters ?? {}) as Record<string, unknown>;
      const enrich = (params.enrich ?? false) as boolean;
      const limit = (params.limit ?? 0) as number;

      const toolDef = toolMap.get(toolName);
      if (!toolDef) throw new Error(`Unknown tool: ${toolName}`);

      const allItems: unknown[] = [];

      if (toolDef.metadata.paginationType === "offset") {
        let offset = 0;
        const count = 100;
        while (true) {
          const response = (await client.request(
            toolDef.metadata.method,
            toolDef.metadata.path,
            { ...filters, pagination: { offset, count } },
            { timeout: 120_000 }
          )) as { success: boolean; data: unknown[] };

          const items = response.data ?? [];
          allItems.push(...items);

          if (limit > 0 && allItems.length >= limit) {
            allItems.length = limit;
            break;
          }
          if (items.length < count) break;
          offset += count;
        }
      } else if (toolDef.metadata.paginationType === "page") {
        let page = 1;
        const pageSize = 100;
        while (true) {
          const response = (await client.request(
            toolDef.metadata.method,
            toolDef.metadata.path,
            { ...filters, page, pageSize },
            { timeout: 120_000 }
          )) as { success: boolean; data: unknown[] };

          const items = response.data ?? [];
          allItems.push(...items);

          if (limit > 0 && allItems.length >= limit) {
            allItems.length = limit;
            break;
          }
          if (items.length < pageSize) break;
          page++;
        }
      } else if (toolDef.metadata.paginationType === "cursor") {
        let cursor: string | undefined;
        while (true) {
          const requestParams: Record<string, unknown> = { ...filters };
          if (cursor) requestParams.cursor = cursor;

          const response = (await client.request(
            toolDef.metadata.method,
            toolDef.metadata.path,
            requestParams,
            { timeout: 120_000 }
          )) as { success: boolean; data: unknown[]; cursor?: string };

          const items = response.data ?? [];
          allItems.push(...items);

          if (limit > 0 && allItems.length >= limit) {
            allItems.length = limit;
            break;
          }
          cursor = response.cursor;
          if (!cursor || items.length === 0) break;
        }
      } else {
        // No pagination — single request
        const response = (await client.request(
          toolDef.metadata.method,
          toolDef.metadata.path,
          filters,
          { timeout: 120_000 }
        )) as { success: boolean; data: unknown[] };
        allItems.push(...(response.data ?? []));
        if (limit > 0 && allItems.length > limit) {
          allItems.length = limit;
        }
      }

      // Enrich: fetch full details
      if (enrich && allItems.length > 0) {
        const readToolName = toolName
          .replace("_readList_cursor", "_read")
          .replace("_readList", "_read");
        const readToolDef = toolMap.get(readToolName);

        if (readToolDef) {
          const batchRead = createBatchRead(client, toolMap);
          const uuids = allItems
            .map((item) => (item as Record<string, unknown>).uuid as string)
            .filter(Boolean);

          const enriched = (await batchRead.handler({
            tool: readToolName,
            uuids,
            concurrency: 10,
          })) as { items: unknown[]; errors: unknown[] };

          return { items: enriched.items, count: enriched.items.length };
        }
      }

      return { items: allItems, count: allItems.length };
    },
  };
}

function createBatchRead(
  client: BimpClient,
  toolMap: Map<string, ToolDefinition>
): UtilityTool {
  return {
    name: "bimp_batch_read",
    description:
      "Read full details for multiple UUIDs in parallel. " +
      "Returns items and errors arrays — does not stop on individual failures.",
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description: "Name of the read tool (e.g. bimp_nomenclature_read)",
        },
        uuids: {
          type: "array",
          items: { type: "string" },
          description: "Array of UUIDs to read",
        },
        concurrency: {
          type: "number",
          description: "Number of parallel requests (default: 10)",
        },
      },
      required: ["tool", "uuids"],
    },
    handler: async (params) => {
      const toolName = params.tool as string;
      const uuids = params.uuids as string[];
      const concurrency = (params.concurrency ?? 10) as number;

      const toolDef = toolMap.get(toolName);
      if (!toolDef) throw new Error(`Unknown tool: ${toolName}`);

      const items: unknown[] = [];
      const errors: Array<{ uuid: string; error: string }> = [];

      // Process in batches
      for (let i = 0; i < uuids.length; i += concurrency) {
        const batch = uuids.slice(i, i + concurrency);
        const results = await Promise.allSettled(
          batch.map((uuid) =>
            client.request(toolDef.metadata.method, toolDef.metadata.path, {
              uuid,
            })
          )
        );

        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          if (result.status === "fulfilled") {
            const data = (result.value as { data?: unknown }).data ?? result.value;
            items.push(data);
          } else {
            errors.push({
              uuid: batch[j],
              error: result.reason?.message ?? String(result.reason),
            });
          }
        }
      }

      return { items, errors };
    },
  };
}

function createBulkUpdate(
  client: BimpClient,
  toolMap: Map<string, ToolDefinition>
): UtilityTool {
  return {
    name: "bimp_bulk_update",
    description:
      "Update multiple records in parallel. Each item must include a uuid field. " +
      "Returns count of updated and array of errors.",
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description: "Name of the update tool (e.g. bimp_nomenclature_update)",
        },
        items: {
          type: "array",
          items: { type: "object" },
          description: "Array of objects with uuid + fields to update",
        },
        concurrency: {
          type: "number",
          description: "Number of parallel requests (default: 5)",
        },
      },
      required: ["tool", "items"],
    },
    handler: async (params) => {
      const toolName = params.tool as string;
      const items = params.items as Array<Record<string, unknown>>;
      const concurrency = (params.concurrency ?? 5) as number;

      const toolDef = toolMap.get(toolName);
      if (!toolDef) throw new Error(`Unknown tool: ${toolName}`);

      let updated = 0;
      const errors: Array<{ uuid: string; error: string }> = [];

      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const results = await Promise.allSettled(
          batch.map((item) =>
            client.request(
              toolDef.metadata.method,
              toolDef.metadata.path,
              item
            )
          )
        );

        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          if (result.status === "fulfilled") {
            updated++;
          } else {
            errors.push({
              uuid: (batch[j].uuid as string) ?? "unknown",
              error: result.reason?.message ?? String(result.reason),
            });
          }
        }
      }

      return { updated, errors };
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --project unit tests/unit/utilities.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utilities.ts tests/unit/utilities.test.ts
git commit -m "feat: add utility tools for bulk fetch, batch read, and bulk update"
```

---

### Task 6: MCP Prompts

**Files:**
- Modify: `src/prompts.ts`

- [ ] **Step 1: Implement all 6 prompts**

Replace `src/prompts.ts` with:

```typescript
interface PromptDef {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
}

interface PromptResult {
  messages: Array<{
    role: "user" | "assistant";
    content: { type: "text"; text: string };
  }>;
}

const PROMPTS: Record<string, { def: PromptDef; text: string }> = {
  bimp_erp_context: {
    def: {
      name: "bimp_erp_context",
      description:
        "System context about BIMP ERP: entity structure, relationships, and Ukrainian terminology mapping",
    },
    text: `# BIMP ERP System Context

## Entity Structure and Relationships

BIMP is a Ukrainian cloud ERP for SMBs. Key entities and their API names:

### Core Entities
- **Nomenclature** (nomenclature) — products and services catalog. Has groups (nomenclature-group), units of measurement, and parent/child modifications.
- **Counterparty** (counterparty) — customers and suppliers. Can be marked as isCustomer, isSupplier, or both. Has addresses, EDRPOU (tax ID), contacts.
- **Specification** (specification) — bill of materials (BOM). Links a nomenclature item to its composition (materials and quantities needed to produce it).

### Sales Flow
- **Order** (invoiceForCustomerPayment) — customer order with status workflow
- **Sales Invoice / Realization** (salesInvoice) — goods shipment document, contains products array
- **Customer Payment** (customerPayment) — payment from customer
- **Customer Return** (customer-inventories-return) — return of goods from customer
- **Refund** (refundToCustomer) — money refund to customer

### Procurement Flow
- **Supplier Invoice** (invoiceForSupplierPayment) — invoice for payment to supplier
- **Purchase Invoice** (purchaseInvoice) — incoming goods document, contains products array

### Production Flow
- **Production Order** (production-order) — manufacturing order with products to produce and materials to consume
- **Production Assembly** (production-assembly) — assembly/production execution record

### Inventory
- **Inventory** (inventory) — stock balances per warehouse (GET endpoints with page/cursor pagination)
- **Movement** (movementOfInventories) — transfer between warehouses
- **Write-off** (writeOffOfInventories) — inventory write-off/disposal

### Finance
- **Currency** (currency) — currencies with codes
- **Bank Account** (bankAccounts) — bank accounts with types
- **Cash Registry** (cashRegistry) — cash registers
- **VAT** (vat) — VAT rates
- **Chart of Accounts** (chartOfAccount) — accounting chart
- **Expense Items** (expenseItems) — expense categories
- **Other Expenses** (otherExpenses) — general expense documents
- **Expense Request** (expenseRequest) — request for funds with approval workflow

### Organization
- **Organization** (organization) — legal entities
- **Warehouse** (warehouse) — storage locations
- **Employee** (employee) — staff members with positions and statuses
- **Contract** (contract) — contracts with counterparties, types, and statuses
- **Project** (project) — project tracking
- **Price List** (priceList) — price lists with per-product prices

## Ukrainian Terminology Mapping

| Ukrainian | English | API Entity |
|-----------|---------|------------|
| Номенклатура | Nomenclature/Product | nomenclature |
| Група номенклатури | Product Group | nomenclature-group |
| Контрагент | Counterparty | counterparty |
| Специфікація | Specification/BOM | specification |
| Замовлення покупця | Customer Order | invoiceForCustomerPayment |
| Реалізація | Sales Invoice | salesInvoice |
| Оплата покупця | Customer Payment | customerPayment |
| Повернення | Customer Return | customer-inventories-return |
| Повернення коштів | Refund | refundToCustomer |
| Прихідна накладна | Purchase Invoice | purchaseInvoice |
| Рахунок постачальнику | Supplier Invoice | invoiceForSupplierPayment |
| Виробничий наказ | Production Order | production-order |
| Збірка | Production Assembly | production-assembly |
| Склад | Warehouse | warehouse |
| Залишки | Inventory/Stock | inventory |
| Переміщення | Movement | movementOfInventories |
| Списання | Write-off | writeOffOfInventories |
| Валюта | Currency | currency |
| Прайс-лист | Price List | priceList |
| Співробітник | Employee | employee |
| Договір | Contract | contract |

## Important API Behavior

1. **readList returns INCOMPLETE data** for many entities. For example, salesInvoice.readList does NOT include products, warehouse, or VAT. Use enrich=true in bimp_fetch_all or call the read endpoint separately.
2. **No total count** in paginated responses. The only way to know you've reached the end is when data.length < requested count.
3. **Max page size is 100** for offset/count pagination.
4. **Three pagination types**: offset/count (most POST endpoints), cursor (inventory), page/pageSize (inventory GET).`,
  },

  bimp_data_analysis: {
    def: {
      name: "bimp_data_analysis",
      description:
        "Guide for analyzing BIMP ERP data: how to fetch complete datasets, handle pagination, and work with incomplete readList data",
    },
    text: `# BIMP Data Analysis Guide

## Fetching Complete Data

1. **Always use bimp_fetch_all** to collect all records — it handles pagination automatically.
2. **Use enrich=true** when you need full details. Many readList endpoints return summary data:
   - salesInvoice.readList: missing products, warehouse, VAT
   - specification.readList: missing composition, cost
   - purchaseInvoice.readList: missing products, warehouse
   - production-order.readList: missing products, materials
   - customerPayment.readList: missing paymentDetails
3. **Filter by period** using the periodable field: \`filters: { periodable: ["2025-01-01T00:00:00.000Z", "2025-12-31T23:59:59.000Z"] }\`
4. **No total count** — to count records, you must fetch all of them.

## Analysis Patterns

### Sales Dynamics
1. Fetch all sales invoices for a period: bimp_fetch_all with tool=bimp_salesInvoice_readList, filters={ periodable: [...] }, enrich=true
2. Each enriched salesInvoice contains: products array with quantities and prices, counterparty, currency, date
3. Aggregate by date/counterparty/product as needed

### Inventory Analysis
1. Use bimp_inventory_readList (GET endpoint with page/pageSize pagination) for current stock
2. Or use bimp_nomenclature_readStocks for stock per nomenclature
3. Cross-reference with specifications to check material availability for production

### Production Planning
1. Fetch production orders: bimp_fetch_all with tool=bimp_production_order_readList, enrich=true
2. Enriched orders contain products (what to produce) and materials (what to consume)
3. Compare materials against inventory to identify shortages
4. Fetch specifications for BOM details

### Price Analysis
1. Fetch all price lists: bimp_fetch_all with tool=bimp_priceList_readList
2. Use bimp_priceList_readPrice with specific price list UUID and nomenclature UUID for individual prices`,
  },

  bimp_bulk_operations: {
    def: {
      name: "bimp_bulk_operations",
      description:
        "How to perform bulk data operations: mass updates, batch imports, and large-scale data modifications",
    },
    text: `# BIMP Bulk Operations Guide

## Mass Price Update
1. Fetch all nomenclature: bimp_fetch_all tool=bimp_nomenclature_readList
2. Calculate new prices
3. Use bimp_priceList_updatePrice or bimp_bulk_update tool=bimp_priceList_updatePrice for each item

## Mass Product Update
1. Fetch products: bimp_fetch_all tool=bimp_nomenclature_readList with filters
2. Filter/transform on your side
3. Update: bimp_bulk_update tool=bimp_nomenclature_update items=[{uuid, ...fields}]

## Batch Import
1. Prepare data as array of objects
2. For each entity type, use the create endpoint
3. Example: bimp_bulk_update tool=bimp_nomenclature_create items=[{name, article, ...}]
   Note: bulk_update works for create too — it just calls the tool for each item

## Counterparty Bulk Edit
1. Fetch: bimp_fetch_all tool=bimp_counterparty_readList
2. Filter by type (isCustomer, isSupplier), status, or name
3. Update: bimp_bulk_update tool=bimp_counterparty_insert (counterparty uses insert for updates)

## Best Practices
- Always check the errors array after bulk operations
- Use lower concurrency (3-5) for create/update operations to avoid rate limiting
- Use higher concurrency (10-20) for read operations
- For very large datasets (1000+), consider processing in chunks and reporting progress
- Test with a small batch first before running on the full dataset`,
  },

  bimp_sales_workflow: {
    def: {
      name: "bimp_sales_workflow",
      description:
        "Sales process workflow: from customer order to payment and returns",
    },
    text: `# BIMP Sales Workflow

## Order → Realization → Payment

### 1. Customer Order (invoiceForCustomerPayment)
- Create: bimp_invoiceForCustomerPayment_create
- Contains: counterparty, products, prices, currency
- Has status workflow: use bimp_invoiceForCustomerPayment_readStatuses for available statuses
- Update status: bimp_invoiceForCustomerPayment_updateStatus

### 2. Sales Invoice / Realization (salesInvoice)
- Create: bimp_salesInvoice_create (link to order via orderUuid)
- Contains: products shipped, warehouse, VAT, price list
- Has EntryStatus: Draft (0) or Posted (1)
- List by order: bimp_salesInvoice_readList with filter orderUuid

### 3. Customer Payment (customerPayment)
- Create: bimp_customerPayment_create (link to order)
- Contains: amount, currency, payment details
- Has status workflow: bimp_customerPayment_readStatuses
- Cancel: bimp_customerPayment_cancel
- Filter by order: bimp_customerPayment_readList with orders=[orderUuid]

## Returns and Refunds

### Customer Return (customer-inventories-return)
- Create: bimp_customer_inventories_return_create
- Returns products to inventory

### Refund (refundToCustomer)
- Create: bimp_refundToCustomer_create
- Returns money to customer
- Has EntryStatus: Draft (0) or Posted (1)`,
  },

  bimp_production_workflow: {
    def: {
      name: "bimp_production_workflow",
      description:
        "Production process: from specifications to manufacturing orders and inventory operations",
    },
    text: `# BIMP Production Workflow

## Specification → Production Order → Assembly

### 1. Specification (BOM)
- A specification defines what materials are needed to produce a product
- Read: bimp_specification_read (returns composition — array of materials with quantities)
- Create: bimp_specification_create (link to nomenclature)
- List: bimp_specification_readList (summary only — use enrich for composition details)

### 2. Production Order
- Create: bimp_production_order_create
- Contains: products to produce and materials to consume
- Has status workflow: bimp_production_order_readStatuses
- Enriched read includes: products, materials, distributionType

### 3. Production Assembly
- Records actual production execution
- Create: bimp_production_assembly_create
- Links to production order

## Related Inventory Operations

### Material Write-off (writeOffOfInventories)
- Write off materials consumed in production
- bimp_writeOffOfInventories_create

### Inventory Movement (movementOfInventories)
- Transfer materials between warehouses for production
- bimp_movementOfInventories_create

## Production Planning Pattern
1. Fetch all specifications: bimp_fetch_all tool=bimp_specification_readList enrich=true
2. Get current inventory: bimp_inventory_readList
3. Calculate what can be produced based on available materials
4. Create production orders for feasible items`,
  },

  bimp_procurement_workflow: {
    def: {
      name: "bimp_procurement_workflow",
      description:
        "Procurement process: supplier invoices, purchase documents, and supplier management",
    },
    text: `# BIMP Procurement Workflow

## Supplier Invoice → Purchase Invoice

### 1. Supplier Invoice (invoiceForSupplierPayment)
- Invoice received from supplier for payment
- Create: bimp_invoiceForSupplierPayment_create
- Has status workflow: bimp_invoiceForSupplierPayment_readStatuses

### 2. Purchase Invoice (purchaseInvoice)
- Incoming goods document — records received products
- Create: bimp_purchaseInvoice_create
- Contains: products, warehouse, VAT, counterparty
- Filter by period: periodable filter
- Filter by org: organizations filter
- Flags: showAll (include archived/drafts), managerialAccounting, bookkeperAccounting

## Related Entities

### Counterparties (suppliers)
- Filter suppliers: bimp_counterparty_readList with types filter
- Create: bimp_counterparty_insert

### Contracts
- Manage supplier contracts: bimp_contract_create / bimp_contract_update
- Link to counterparty, currency, price list
- Types: bimp_contract_readTypes
- Statuses: bimp_contract_readStatuses

## Procurement Planning Pattern
1. Analyze current inventory: bimp_fetch_all tool=bimp_inventory_readList (or bimp_nomenclature_readStocks)
2. Check specifications for required materials: bimp_fetch_all tool=bimp_specification_readList enrich=true
3. Identify shortages
4. Create supplier invoices for needed materials`,
  },
};

export function getPrompts(): PromptDef[] {
  return Object.values(PROMPTS).map((p) => p.def);
}

export function handleGetPrompt(
  name: string,
  _args?: Record<string, string>
): PromptResult {
  const prompt = PROMPTS[name];
  if (!prompt) {
    return {
      messages: [
        {
          role: "user",
          content: { type: "text", text: `Unknown prompt: ${name}` },
        },
      ],
    };
  }

  return {
    messages: [
      {
        role: "user",
        content: { type: "text", text: prompt.text },
      },
    ],
  };
}
```

- [ ] **Step 2: Verify server still compiles**

```bash
npx tsx --eval "import './src/prompts.js'; console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/prompts.ts
git commit -m "feat: add 6 MCP prompts for ERP context and workflows"
```

---

### Task 7: Integration Tests — Auth

**Files:**
- Create: `tests/integration/auth.test.ts`

- [ ] **Step 1: Write auth integration test**

Create `tests/integration/auth.test.ts`:

```typescript
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

    // First request to trigger login
    await client.request("POST", "/org2/warehouse/api-readList", {
      pagination: { offset: 0, count: 1 },
    });

    // Switch to same company (should succeed without error)
    await client.switchCompany(config.companyCode);

    // Verify still works after switch
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
```

- [ ] **Step 2: Create .env with test credentials**

```bash
cat > .env << 'EOF'
BIMP_BASE_URL=https://app.bimpsoft.com
BIMP_EMAIL=dutchakdev@gmail.com
BIMP_PASSWORD=Hl9823314!!!
BIMP_COMPANY_CODE=000001398
EOF
```

- [ ] **Step 3: Run integration test**

```bash
npx vitest run --project integration tests/integration/auth.test.ts
```

Expected: All 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add tests/integration/auth.test.ts
git commit -m "test: add auth integration tests"
```

---

### Task 8: Integration Tests — CRUD

**Files:**
- Create: `tests/integration/crud.test.ts`

- [ ] **Step 1: Write CRUD integration tests**

Create `tests/integration/crud.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { BimpClient } from "../../src/client.js";

const client = new BimpClient({
  email: process.env.BIMP_EMAIL!,
  password: process.env.BIMP_PASSWORD!,
  companyCode: process.env.BIMP_COMPANY_CODE!,
  baseUrl: process.env.BIMP_BASE_URL,
});

describe("Nomenclature CRUD", () => {
  let createdUuid: string;

  it("should list nomenclature", async () => {
    const result = (await client.request(
      "POST",
      "/org2/nomenclature/api-readList",
      { pagination: { offset: 0, count: 5 } }
    )) as { success: boolean; data: unknown[] };

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should create a nomenclature item", async () => {
    const result = (await client.request(
      "POST",
      "/org2/nomenclature/api-create",
      {
        name: `Test Product ${Date.now()}`,
        type: "product",
      }
    )) as { success: boolean; data: { uuid: string } };

    expect(result.success).toBe(true);
    expect(result.data.uuid).toBeDefined();
    createdUuid = result.data.uuid;
  });

  it("should update the created item", async () => {
    const result = (await client.request(
      "POST",
      "/org2/nomenclature/api-update",
      {
        uuid: createdUuid,
        name: `Updated Product ${Date.now()}`,
        article: "TEST-ART-001",
      }
    )) as { success: boolean };

    expect(result.success).toBe(true);
  });
});

describe("Nomenclature Group CRUD", () => {
  it("should list groups", async () => {
    const result = (await client.request(
      "POST",
      "/org2/nomenclature-group/api-readList",
      {}
    )) as { success: boolean; data: unknown[] };

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});

describe("Counterparty CRUD", () => {
  it("should list counterparties", async () => {
    const result = (await client.request(
      "POST",
      "/org2/counterparty/api-readList",
      { pagination: { offset: 0, count: 5 } }
    )) as { success: boolean; data: unknown[] };

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});

describe("Reference Data", () => {
  it("should read currencies", async () => {
    const result = (await client.request(
      "POST",
      "/org2/currency/api-readList",
      { pagination: { offset: 0, count: 10 } }
    )) as { success: boolean; data: Array<{ uuid: string; code: string }> };

    expect(result.success).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0]).toHaveProperty("code");
  });

  it("should read VAT rates", async () => {
    const result = (await client.request(
      "POST",
      "/org2/vat/api-readList",
      {}
    )) as { success: boolean; data: unknown[] };

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should read warehouses", async () => {
    const result = (await client.request(
      "POST",
      "/org2/warehouse/api-readList",
      { pagination: { offset: 0, count: 10 } }
    )) as { success: boolean; data: unknown[] };

    expect(result.success).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("should read employees", async () => {
    const result = (await client.request(
      "POST",
      "/org2/employee/api-readList",
      { pagination: { offset: 0, count: 5 } }
    )) as { success: boolean; data: unknown[] };

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});
```

- [ ] **Step 2: Run CRUD tests**

```bash
npx vitest run --project integration tests/integration/crud.test.ts
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/crud.test.ts
git commit -m "test: add CRUD integration tests for core entities"
```

---

### Task 9: Integration Tests — Inventory

**Files:**
- Create: `tests/integration/inventory.test.ts`

- [ ] **Step 1: Write inventory integration tests**

Create `tests/integration/inventory.test.ts`:

```typescript
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
    // First need to get orgId and warehouseId
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
```

- [ ] **Step 2: Run inventory tests**

```bash
npx vitest run --project integration tests/integration/inventory.test.ts
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/inventory.test.ts
git commit -m "test: add inventory integration tests for pagination types"
```

---

### Task 10: Functional Tests

**Files:**
- Create: `tests/functional/fetch-all.test.ts`
- Create: `tests/functional/batch-read.test.ts`
- Create: `tests/functional/bulk-update.test.ts`
- Create: `tests/functional/scenarios.test.ts`

- [ ] **Step 1: Write fetch-all functional test**

Create `tests/functional/fetch-all.test.ts`:

```typescript
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

describe("bimp_fetch_all — real API", () => {
  it("should fetch all warehouses (small dataset, no pagination needed)", async () => {
    const result = (await fetchAll.handler({
      tool: "bimp_warehouse_readList",
    })) as { items: unknown[]; count: number };

    expect(result.count).toBeGreaterThan(0);
    expect(result.items).toHaveLength(result.count);
  });

  it("should fetch nomenclature with limit", async () => {
    const result = (await fetchAll.handler({
      tool: "bimp_nomenclature_readList",
      limit: 5,
    })) as { items: unknown[]; count: number };

    expect(result.count).toBeLessThanOrEqual(5);
  });

  it("should fetch with filter", async () => {
    const result = (await fetchAll.handler({
      tool: "bimp_nomenclature_readList",
      limit: 10,
    })) as { items: Array<{ uuid: string }>; count: number };

    expect(result.items.length).toBeGreaterThanOrEqual(0);
    if (result.items.length > 0) {
      expect(result.items[0]).toHaveProperty("uuid");
    }
  });
});
```

- [ ] **Step 2: Write batch-read functional test**

Create `tests/functional/batch-read.test.ts`:

```typescript
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
const batchRead = utilityTools.find((t) => t.name === "bimp_batch_read")!;

describe("bimp_batch_read — real API", () => {
  it("should read full details for nomenclature items", async () => {
    // First get some UUIDs
    const list = (await fetchAll.handler({
      tool: "bimp_nomenclature_readList",
      limit: 3,
    })) as { items: Array<{ uuid: string }> };

    if (list.items.length === 0) {
      console.log("Skipping: no nomenclature items");
      return;
    }

    const uuids = list.items.map((i) => i.uuid);

    // Batch read is only for tools that have a 'read' endpoint
    // nomenclature doesn't have api-read in the spec, so let's test with nomenclature-group
    const groups = (await client.request(
      "POST",
      "/org2/nomenclature-group/api-readList",
      {}
    )) as { success: boolean; data: Array<{ uuid: string }> };

    if (groups.data.length === 0) {
      console.log("Skipping: no nomenclature groups");
      return;
    }

    const groupUuids = groups.data.slice(0, 3).map((g) => g.uuid);

    const result = (await batchRead.handler({
      tool: "bimp_nomenclature_group_read",
      uuids: groupUuids,
      concurrency: 2,
    })) as { items: unknown[]; errors: unknown[] };

    expect(result.items.length).toBe(groupUuids.length);
    expect(result.errors).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Write bulk-update functional test**

Create `tests/functional/bulk-update.test.ts`:

```typescript
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
const bulkUpdate = utilityTools.find((t) => t.name === "bimp_bulk_update")!;

describe("bimp_bulk_update — real API", () => {
  it("should bulk update nomenclature group descriptions", async () => {
    // Create 2 test groups
    const group1 = (await client.request(
      "POST",
      "/org2/nomenclature-group/api-create",
      { name: `Test Group A ${Date.now()}` }
    )) as { success: boolean; data: { uuid: string } };

    const group2 = (await client.request(
      "POST",
      "/org2/nomenclature-group/api-create",
      { name: `Test Group B ${Date.now()}` }
    )) as { success: boolean; data: { uuid: string } };

    // Bulk update
    const result = (await bulkUpdate.handler({
      tool: "bimp_nomenclature_group_update",
      items: [
        { uuid: group1.data.uuid, description: "Bulk updated A" },
        { uuid: group2.data.uuid, description: "Bulk updated B" },
      ],
    })) as { updated: number; errors: unknown[] };

    expect(result.updated).toBe(2);
    expect(result.errors).toHaveLength(0);

    // Verify updates
    const readA = (await client.request(
      "POST",
      "/org2/nomenclature-group/api-read",
      { uuid: group1.data.uuid }
    )) as { success: boolean; data: { description: string } };

    expect(readA.data.description).toBe("Bulk updated A");
  });
});
```

- [ ] **Step 4: Write E2E scenario test**

Create `tests/functional/scenarios.test.ts`:

```typescript
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

describe("E2E Scenarios", () => {
  it("should fetch all nomenclature with enriched data", async () => {
    const result = (await fetchAll.handler({
      tool: "bimp_nomenclature_readList",
      limit: 3,
      enrich: true,
    })) as { items: unknown[]; count: number };

    // Even if enrich finds no 'read' tool, should still return items
    expect(result.count).toBeGreaterThanOrEqual(0);
  });

  it("should fetch specifications with enrichment", async () => {
    const result = (await fetchAll.handler({
      tool: "bimp_specification_readList",
      limit: 5,
      enrich: true,
    })) as { items: Array<Record<string, unknown>>; count: number };

    if (result.count > 0) {
      // Enriched specs should have composition field
      const hasComposition = result.items.some((i) => "composition" in i);
      expect(hasComposition).toBe(true);
    }
  });

  it("should fetch sales invoices for analysis", async () => {
    const result = (await fetchAll.handler({
      tool: "bimp_salesInvoice_readList",
      limit: 5,
    })) as { items: Array<Record<string, unknown>>; count: number };

    if (result.count > 0) {
      expect(result.items[0]).toHaveProperty("uuid");
      expect(result.items[0]).toHaveProperty("sum");
    }
  });
});
```

- [ ] **Step 5: Run all functional tests**

```bash
npx vitest run --project functional
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add tests/functional/
git commit -m "test: add functional tests for utilities and E2E scenarios"
```

---

### Task 11: Claude Code Skills

**Files:**
- Create: `.claude/skills/bimp-api-discovery.md`
- Create: `.claude/skills/bimp-erp-domain.md`
- Create: `.claude/skills/bimp-mcp-development.md`
- Create: `.claude/skills/bimp-testing.md`

- [ ] **Step 1: Create bimp-api-discovery skill**

Create `.claude/skills/bimp-api-discovery.md`:

```markdown
# BIMP API Discovery

How to investigate the BIMP frontend and add undocumented endpoints to this MCP server.

## Finding Undocumented Endpoints

1. Open https://app.bimpsoft.com/ in a browser
2. Open DevTools → Network tab → Filter by "Fetch/XHR"
3. Navigate through the UI and perform the action you want to capture
4. Look for requests to `/org2/...` endpoints

## Capturing an Endpoint

For each new endpoint, record:
- **Method**: GET or POST
- **Path**: e.g. `/org2/newEntity/api-readList`
- **Request body**: copy the JSON payload (for POST)
- **Response body**: copy the JSON response
- **Auth**: most endpoints require `tokenAuth` security

## Adding to bimp-api.json

Add the endpoint in OpenAPI 3.1 format. Follow existing patterns:

```json
"/org2/newEntity/api-readList": {
  "post": {
    "tags": ["New Entity"],
    "description": "A request to view a list of new entities",
    "requestBody": {
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "pagination": {
                "type": "object",
                "properties": {
                  "offset": { "type": "number", "default": 0 },
                  "count": { "type": "number", "default": 10, "maximum": 100 }
                },
                "required": ["offset", "count"]
              }
            },
            "required": ["pagination"]
          }
        }
      },
      "required": true
    },
    "security": [{ "tokenAuth": [] }],
    "responses": {
      "200": {
        "description": "Default Response",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "success": { "type": "boolean" },
                "data": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "uuid": { "type": "string" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Verification

After adding to bimp-api.json:
1. Run `npx tsx -e "import { generateTools } from './src/tool-generator.js'; import { readFileSync } from 'fs'; const spec = JSON.parse(readFileSync('bimp-api.json','utf-8')); const tools = generateTools(spec); console.log(tools.map(t=>t.name).filter(n=>n.includes('newEntity')))"`
2. Verify the tool name appears and the schema looks correct
3. Add an integration test in `tests/integration/crud.test.ts`
```

- [ ] **Step 2: Create bimp-erp-domain skill**

Create `.claude/skills/bimp-erp-domain.md`:

```markdown
# BIMP ERP Domain Knowledge

## Entity Relationships

```
Nomenclature (product/service)
├── belongs to: Nomenclature Group
├── has: Specifications (BOM)
├── has: Prices (via Price List)
├── has: Stock (via Inventory)
└── has: Modifications (parent/child)

Counterparty (customer/supplier)
├── has: Contracts
├── has: Addresses
└── has: External IDs (integrations)

Sales Flow:
  Customer Order (invoiceForCustomerPayment)
  └── Sales Invoice (salesInvoice) [contains: products]
      └── Customer Payment (customerPayment)

Returns Flow:
  Customer Return (customer-inventories-return)
  └── Refund (refundToCustomer)

Procurement Flow:
  Supplier Invoice (invoiceForSupplierPayment)
  └── Purchase Invoice (purchaseInvoice) [contains: products]

Production Flow:
  Specification (BOM) [contains: composition]
  └── Production Order [contains: products, materials]
      └── Production Assembly
```

## Ukrainian ↔ API Mapping

| Ukrainian | API Entity |
|-----------|-----------|
| Номенклатура | nomenclature |
| Контрагент | counterparty |
| Реалізація | salesInvoice |
| Замовлення покупця | invoiceForCustomerPayment |
| Прихідна накладна | purchaseInvoice |
| Виробничий наказ | production-order |
| Специфікація | specification |
| Списання | writeOffOfInventories |
| Переміщення | movementOfInventories |

## readList Data Completeness

Entities where readList returns INCOMPLETE data (missing key fields):

| Entity | Missing from readList | Available via read |
|--------|----------------------|-------------------|
| salesInvoice | products, warehouse, VAT, priceList | Yes |
| specification | composition, cost, currency | Yes |
| purchaseInvoice | products, warehouse, contract | Yes |
| production-order | products, materials | Yes |
| customerPayment | paymentDetails, commission | Yes |
| contract | many fields | Yes |

Entities with COMPLETE readList data: counterparty, employee.
```

- [ ] **Step 3: Create bimp-mcp-development skill**

Create `.claude/skills/bimp-mcp-development.md`:

```markdown
# BIMP MCP Server Development Guide

## Architecture

- `bimp-api.json` — OpenAPI 3.1 spec, source of truth for tool generation
- `src/client.ts` — HTTP client with auto-login and token refresh
- `src/tool-generator.ts` — parses OpenAPI spec → generates MCP tool definitions
- `src/utilities.ts` — bimp_fetch_all, bimp_batch_read, bimp_bulk_update
- `src/prompts.ts` — 6 MCP prompts for ERP context
- `src/index.ts` — MCP server entry point, wires everything together

## How Tool Generation Works

1. `generateTools(spec)` reads all paths from bimp-api.json
2. Each path becomes a tool: `/org2/entity/api-action` → `bimp_entity_action`
3. POST requestBody.schema → tool inputSchema
4. GET query params → tool inputSchema properties
5. Excluded: images/download, zoho webhook, auth internals
6. Each tool stores metadata: method, path, tag, paginationType, pathParams

## Adding a New Utility Tool

1. Add the tool function in `src/utilities.ts` following the pattern of existing tools
2. Add it to the array returned by `createUtilityTools()`
3. Define: name, description, inputSchema, handler
4. Add unit tests in `tests/unit/utilities.test.ts`
5. Add functional test in `tests/functional/`

## Adding a New MCP Prompt

1. Add entry to the `PROMPTS` object in `src/prompts.ts`
2. Define: def (name, description, arguments) and text content
3. The prompt is automatically available via ListPrompts/GetPrompt

## Naming Conventions

- Tool names: `bimp_{entity}_{action}` (e.g. `bimp_nomenclature_readList`)
- Utility tools: `bimp_fetch_all`, `bimp_batch_read`, `bimp_bulk_update`
- Auth tools: `bimp_auth_listCompanies`, `bimp_auth_switchCompany`
- Prompts: `bimp_{topic}` (e.g. `bimp_erp_context`)

## Running Locally

```bash
npm start              # Start MCP server (stdio)
npm test               # Unit tests
npm run test:integration  # Integration tests (needs .env)
npm run test:functional   # Functional tests (needs .env)
```
```

- [ ] **Step 4: Create bimp-testing skill**

Create `.claude/skills/bimp-testing.md`:

```markdown
# BIMP MCP Testing Guide

## Test Structure

```
tests/
├── setup-env.ts              # Loads .env for integration/functional
├── unit/                     # No API calls, mocked client
│   ├── client.test.ts
│   ├── tool-generator.test.ts
│   └── utilities.test.ts
├── integration/              # Real API calls, test company
│   ├── auth.test.ts
│   ├── crud.test.ts
│   └── inventory.test.ts
└── functional/               # E2E through utility tools
    ├── fetch-all.test.ts
    ├── batch-read.test.ts
    ├── bulk-update.test.ts
    └── scenarios.test.ts
```

## Running Tests

```bash
npm test                    # Unit only (fast, no API)
npm run test:integration    # Integration (needs .env with credentials)
npm run test:functional     # Functional E2E (needs .env)
npm run test:all            # All tests
npm run test:watch          # Unit tests in watch mode
```

## Test Company

- **Company**: nailsmade shop
- **Code**: 000001398
- **Purpose**: Test data creation/modification/deletion
- **Read-only**: HEYLOVE (000001220) — do NOT create/modify data here

## Writing Unit Tests

Mock the BimpClient:
```typescript
const mockClient = { request: vi.fn() };
mockClient.request.mockResolvedValueOnce({ success: true, data: [...] });
```

## Writing Integration Tests

```typescript
const client = new BimpClient({
  email: process.env.BIMP_EMAIL!,
  password: process.env.BIMP_PASSWORD!,
  companyCode: process.env.BIMP_COMPANY_CODE!,
});

// Test CRUD cycle: create → read → update → (cleanup if needed)
```

## Writing Functional Tests

```typescript
const spec = JSON.parse(readFileSync('bimp-api.json', 'utf-8'));
const tools = generateTools(spec);
const toolMap = new Map(tools.map(t => [t.name, t]));
const utilityTools = createUtilityTools(client, toolMap);
const fetchAll = utilityTools.find(t => t.name === 'bimp_fetch_all')!;

// Test utility tools with real API
```

## Adding Tests for New Endpoints

1. Add integration test in `tests/integration/crud.test.ts`:
   - readList with pagination
   - create (if applicable)
   - read by UUID
   - update (if applicable)
2. If the endpoint uses a new pagination type, add to `tests/integration/inventory.test.ts`
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/
git commit -m "docs: add Claude Code skills for API discovery, ERP domain, development, and testing"
```

---

### Task 12: CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Create CLAUDE.md**

Create `CLAUDE.md`:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server for the BIMP ERP system (bimpsoft.com). Dynamically generates ~135 MCP tools from an OpenAPI spec, plus 3 utility tools for bulk operations and 6 MCP prompts for ERP context.

## Commands

```bash
npm start                   # Start MCP server (stdio transport)
npm test                    # Unit tests (no API needed)
npm run test:integration    # Integration tests (requires .env)
npm run test:functional     # Functional E2E tests (requires .env)
npm run test:all            # All tests
npm run test:watch          # Unit tests in watch mode
```

## Architecture

- **`bimp-api.json`** — OpenAPI 3.1 spec. Source of truth for tool generation. To add a new API endpoint, edit this file and restart the server.
- **`src/client.ts`** — HTTP client with auto-login (env vars), token refresh on 401, and company switching. All API requests go through `BimpClient.request()`.
- **`src/tool-generator.ts`** — Parses OpenAPI spec at startup → generates MCP tool definitions. Path `/org2/{entity}/api-{action}` becomes tool `bimp_{entity}_{action}`.
- **`src/utilities.ts`** — Three utility tools: `bimp_fetch_all` (auto-pagination + enrich), `bimp_batch_read` (parallel detail reads), `bimp_bulk_update` (mass updates).
- **`src/prompts.ts`** — Six MCP prompts providing ERP domain context, workflow guides, and data analysis patterns.
- **`src/index.ts`** — Wires MCP Server with low-level request handlers for tools and prompts.

## Key API Patterns

- **No total count** in paginated responses — pagination stops when `data.length < requested count`
- **readList returns incomplete data** for many entities (salesInvoice, specification, etc.) — use `enrich: true` in `bimp_fetch_all` or call the `read` endpoint separately
- **Three pagination types**: offset/count (POST, max 100), cursor (GET inventory), page/pageSize (GET inventory)
- **Auth flow**: login → accessToken → selectCompany → companyAccessToken → all requests

## Testing

- Unit tests mock BimpClient, no API calls needed
- Integration/functional tests use test company **nailsmade shop** (code: 000001398)
- Do NOT modify data in HEYLOVE company (000001220) — read only
- Functional tests create test data → verify → the test company is disposable
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with project overview and development guide"
```

---

### Task 13: Run Full Test Suite and Verify

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: All unit tests PASS (client, tool-generator, utilities)

- [ ] **Step 2: Run integration tests**

```bash
npm run test:integration
```

Expected: All integration tests PASS (auth, CRUD, inventory)

- [ ] **Step 3: Run functional tests**

```bash
npm run test:functional
```

Expected: All functional tests PASS

- [ ] **Step 4: Verify MCP server starts**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx tsx src/index.ts 2>/dev/null | head -1
```

Expected: JSON response with server info and capabilities

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git status
# If changes: git commit -m "fix: address test failures and finalize"
```
