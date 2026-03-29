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

const server = new Server(
  { name: "bimp-mcp", version: "0.1.0" },
  { capabilities: { tools: {}, prompts: {} } }
);

const authTools = [
  {
    name: "bimp_auth_listCompanies",
    description: "List all companies accessible to the current user",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "bimp_auth_switchCompany",
    description: "Switch to a different company by code (e.g. '000001398') or UUID",
    inputSchema: {
      type: "object" as const,
      properties: {
        codeOrUuid: { type: "string", description: "Company code or UUID to switch to" },
      },
      required: ["codeOrUuid"],
    },
  },
];

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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const params = (args ?? {}) as Record<string, unknown>;

  try {
    if (name === "bimp_auth_listCompanies") {
      const companies = await client.listCompanies();
      return { content: [{ type: "text", text: JSON.stringify(companies, null, 2) }] };
    }
    if (name === "bimp_auth_switchCompany") {
      await client.switchCompany(params.codeOrUuid as string);
      return { content: [{ type: "text", text: `Switched to company: ${params.codeOrUuid}` }] };
    }

    const utilityTool = utilityTools.find((t) => t.name === name);
    if (utilityTool) {
      const result = await utilityTool.handler(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    const toolDef = toolMap.get(name);
    if (!toolDef) {
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }

    const result = await client.request(toolDef.metadata.method, toolDef.metadata.path, params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: getPrompts(),
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  return handleGetPrompt(request.params.name, request.params.arguments);
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
