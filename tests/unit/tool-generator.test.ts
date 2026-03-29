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
