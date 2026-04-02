#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod";
import { BimpClient } from "./client.js";
import { generateTools, type ToolDefinition } from "./tool-generator.js";
import { createUtilityTools } from "./utilities.js";
import { createNomenclaturesTools } from "./nomenclatures-extended.js";
import { PROMPT_TEXTS } from "./prompts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Maximum response size in characters.
 * MCP clients (Claude Code, Claude Desktop) have tool result size limits.
 * We truncate large responses to stay within safe bounds.
 */
const MAX_RESPONSE_SIZE = 80_000;

/**
 * Truncate a tool result if its JSON representation exceeds MAX_RESPONSE_SIZE.
 * For array-based results (items/data), uses binary search to fit max items.
 */
function truncateResponse(result: unknown): string {
  const json = JSON.stringify(result, null, 2);
  if (json.length <= MAX_RESPONSE_SIZE) return json;

  if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;
    const arrayKey = ["items", "data"].find((k) => Array.isArray(obj[k]));
    if (arrayKey) {
      const arr = obj[arrayKey] as unknown[];
      const totalCount = arr.length;

      // Binary search for max number of items that fit
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const test = JSON.stringify(
          { ...obj, [arrayKey]: arr.slice(0, mid), count: mid, _truncated: { total: totalCount, returned: mid } },
          null,
          2
        );
        if (test.length <= MAX_RESPONSE_SIZE) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }

      return JSON.stringify(
        {
          ...obj,
          [arrayKey]: arr.slice(0, lo),
          count: lo,
          _truncated: {
            total: totalCount,
            returned: lo,
            message:
              `Response truncated: showing ${lo} of ${totalCount} items. ` +
              `To get all data, re-call with limit=${lo} and iterate using skip parameter: ` +
              `skip=0 limit=${lo}, then skip=${lo} limit=${lo}, etc. ` +
              `For bimp_fetch_all: recommended limit is 50 with enrich=true, 200 without.`,
          },
        },
        null,
        2
      );
    }
  }

  // Fallback: hard truncate for non-array responses
  return (
    json.slice(0, MAX_RESPONSE_SIZE) +
    "\n\n... [TRUNCATED: response exceeded size limit. Use limit parameter or filters to reduce result size.]"
  );
}

const config = {
  email: process.env.BIMP_EMAIL ?? "",
  password: process.env.BIMP_PASSWORD ?? "",
  companyCode: process.env.BIMP_COMPANY_CODE ?? "",
  baseUrl: process.env.BIMP_BASE_URL,
};

const specPath = resolve(__dirname, "..", "bimp-api.json");
const spec = JSON.parse(readFileSync(specPath, "utf-8"));

const client = new BimpClient(config);
const generatedTools = generateTools(spec);

const toolMap = new Map<string, ToolDefinition>();
for (const tool of generatedTools) {
  toolMap.set(tool.name, tool);
}

// Build entity→actions index for bimp_api description
const entityActions = new Map<string, string[]>();
for (const tool of generatedTools) {
  const parts = tool.name.replace("bimp_", "").split("_");
  const action = parts.pop()!;
  const entity = parts.join("_");
  if (!entityActions.has(entity)) entityActions.set(entity, []);
  entityActions.get(entity)!.push(action);
}

const utilityTools = createUtilityTools(client, toolMap);
const nomenclaturesTools = createNomenclaturesTools(client);

const server = new McpServer(
  { name: "bimp-mcp", version: "0.3.1" },
  { capabilities: { logging: {} } }
);

// Register prompts via McpServer (uses Zod, type-safe)
for (const [name, prompt] of Object.entries(PROMPT_TEXTS)) {
  server.registerPrompt(
    name,
    { description: prompt.description },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: prompt.text },
        },
      ],
    })
  );
}

// Register auth tools via McpServer
server.registerTool(
  "bimp_auth_listCompanies",
  {
    description: "List all companies accessible to the current user",
    inputSchema: z.object({}),
  },
  async () => {
    const companies = await client.listCompanies();
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(companies, null, 2) },
      ],
    };
  }
);

server.registerTool(
  "bimp_auth_switchCompany",
  {
    description:
      "Switch to a different company by code (e.g. '000001398') or UUID",
    inputSchema: z.object({
      codeOrUuid: z
        .string()
        .describe("Company code or UUID to switch to"),
    }),
  },
  async ({ codeOrUuid }) => {
    await client.switchCompany(codeOrUuid);
    return {
      content: [
        { type: "text" as const, text: `Switched to company: ${codeOrUuid}` },
      ],
    };
  }
);

// Use low-level server for dynamic tool registration (raw JSON Schema from OpenAPI)
const lowLevelServer = server.server;

// Build entity catalog for bimp_api description
const entityCatalog = [...entityActions.entries()]
  .sort()
  .map(([entity, actions]) => `${entity}: ${actions.join(", ")}`)
  .join("\n");

lowLevelServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Meta tool — replaces 135 individual generated tools
    {
      name: "bimp_api",
      description:
        "Call any BIMP ERP API endpoint. Combines all entity CRUD operations into one tool.\n\n" +
        "Usage: provide tool_name in the format bimp_{entity}_{action} (e.g. bimp_specification_readList, bimp_nomenclature_create).\n\n" +
        "Available entities and actions:\n" +
        entityCatalog +
        "\n\nCommon params: readList needs {pagination:{offset:0,count:100}}, read needs {uuid}, " +
        "create/update/insert need entity-specific fields. " +
        "Filter by date: {periodable:[\"2026-01-01T00:00:00.000Z\",\"2026-12-31T23:59:59.000Z\"]}",
      inputSchema: {
        type: "object" as const,
        properties: {
          tool_name: {
            type: "string",
            description: "Tool name: bimp_{entity}_{action} (e.g. bimp_specification_readList, bimp_nomenclature_read, bimp_salesInvoice_create)",
          },
          params: {
            type: "object",
            description: "Parameters for the API call. For readList: {pagination:{offset:0,count:100}}. For read: {uuid:\"...\"}. For create/update: entity fields.",
          },
        },
        required: ["tool_name"],
      },
    },
    // Auth tools
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
    // Utility tools
    ...utilityTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    // Nomenclatures extended tools
    ...nomenclaturesTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  ],
}));

lowLevelServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const params = (args ?? {}) as Record<string, unknown>;

  try {
    // Auth tools
    if (name === "bimp_auth_listCompanies") {
      const companies = await client.listCompanies();
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(companies, null, 2) },
        ],
      };
    }
    if (name === "bimp_auth_switchCompany") {
      await client.switchCompany(params.codeOrUuid as string);
      return {
        content: [
          {
            type: "text" as const,
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
        content: [
          { type: "text" as const, text: truncateResponse(result) },
        ],
      };
    }

    // Nomenclatures extended tools
    const nomenclaturesTool = nomenclaturesTools.find((t) => t.name === name);
    if (nomenclaturesTool) {
      const result = await nomenclaturesTool.handler(params);
      return {
        content: [
          { type: "text" as const, text: truncateResponse(result) },
        ],
      };
    }

    // bimp_api meta-tool — routes to any generated tool
    if (name === "bimp_api") {
      const toolName = params.tool_name as string;
      const callParams = (params.params ?? {}) as Record<string, unknown>;

      const toolDef = toolMap.get(toolName);
      if (!toolDef) {
        return {
          content: [{
            type: "text" as const,
            text: `Unknown tool: ${toolName}. Available tools: ${[...toolMap.keys()].join(", ")}`,
          }],
          isError: true,
        };
      }

      const result = await client.request(
        toolDef.metadata.method,
        toolDef.metadata.path,
        callParams
      );
      return {
        content: [
          { type: "text" as const, text: truncateResponse(result) },
        ],
      };
    }

    // Direct generated API tools (still supported for Claude Code / backward compat)
    const toolDef = toolMap.get(name);
    if (!toolDef) {
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    const result = await client.request(
      toolDef.metadata.method,
      toolDef.metadata.path,
      params
    );
    return {
      content: [
        { type: "text" as const, text: truncateResponse(result) },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BIMP MCP server started");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
