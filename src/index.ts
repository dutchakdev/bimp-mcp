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
import { PROMPT_TEXTS } from "./prompts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const utilityTools = createUtilityTools(client, toolMap);

const server = new McpServer(
  { name: "bimp-mcp", version: "0.1.0" },
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

lowLevelServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...generatedTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    // Auth tools are registered via McpServer, but we need them in the list too
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
    ...utilityTools.map((t) => ({
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
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }

    // Generated API tools
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
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
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
