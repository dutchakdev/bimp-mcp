# BIMP MCP Server Development Guide

## Architecture Overview

```
bimp-api.json          OpenAPI 3.1 spec (source of truth for API endpoints)
       |
       v
src/tool-generator.ts  Reads spec, generates ToolDefinition[] (name, schema, metadata)
       |
       v
src/index.ts           MCP server entry point — registers all tools, prompts, handles requests
       |
       +--- src/client.ts       HTTP client with auto-login, token refresh, path param substitution
       +--- src/utilities.ts    Higher-order tools: bimp_fetch_all, bimp_batch_read, bimp_bulk_update
       +--- src/prompts.ts      MCP prompts with ERP domain context
```

### Data Flow

1. On startup, `index.ts` reads `bimp-api.json` and passes it to `generateTools(spec)`
2. `tool-generator.ts` iterates all paths in the spec, skipping excluded ones (auth, images, integrations), and produces a `ToolDefinition` per endpoint
3. Each `ToolDefinition` has: `name`, `description`, `inputSchema` (JSON Schema from the OpenAPI spec), and `metadata` (method, path, tag, paginationType, pathParams)
4. `index.ts` registers these as MCP tools alongside auth tools and utility tools
5. When a tool is called, `index.ts` routes the request to either: the auth handler, a utility tool handler, or the generic `client.request()` with the tool's method and path

## How Tool Generation Works

The `generateTools()` function in `src/tool-generator.ts`:

1. Iterates `spec.paths` entries
2. Skips paths in `EXCLUDED_PATHS` (auth, images) and `EXCLUDED_PATH_PATTERNS` (Zoho integration)
3. For each path + method:
   - Converts path to tool name via `pathToToolName()`: `/org2/nomenclature/api-readList` -> `bimp_nomenclature_readList`
   - Extracts `inputSchema` from `requestBody.content.application/json.schema` (POST) or `parameters` (GET)
   - Strips `accept-language` header parameter
   - Detects pagination type: checks for `/cursor` in path, `pagination` in properties, or `page`/`pageSize` params
   - Extracts path parameters (e.g., `{productHex}`) and adds them to required properties

### Naming Convention

Tool names follow the pattern: `bimp_{entity}_{action}`

- Entity: derived from the URL path after `/org2/`, hyphens become underscores
- Action: derived from `/api-{action}`, e.g., `readList`, `read`, `create`, `update`
- Path params are stripped from the name
- Examples:
  - `/org2/nomenclature/api-readList` -> `bimp_nomenclature_readList`
  - `/org2/customer-inventories-return/api-read` -> `bimp_customer_inventories_return_read`
  - `/org2/inventory/api-readList/cursor` -> `bimp_inventory_readList_cursor`

## How to Add a Utility Tool

Utility tools are defined in `src/utilities.ts`. They wrap the generated API tools with higher-level logic.

1. Create a function that returns a `UtilityTool`:

```typescript
function createMyTool(
  client: BimpClient,
  toolMap: Map<string, ToolDefinition>
): UtilityTool {
  return {
    name: "bimp_my_tool",
    description: "What this tool does",
    inputSchema: {
      type: "object",
      properties: {
        param1: { type: "string", description: "Description" },
      },
      required: ["param1"],
    },
    handler: async (params: Record<string, unknown>) => {
      const param1 = params.param1 as string;
      // Use client.request() or toolMap to call API endpoints
      return { result: "data" };
    },
  };
}
```

2. Add it to the `createUtilityTools()` return array:

```typescript
export function createUtilityTools(
  client: BimpClient,
  toolMap: Map<string, ToolDefinition>
): UtilityTool[] {
  return [
    createFetchAllTool(client, toolMap),
    createBatchReadTool(client, toolMap),
    createBulkUpdateTool(client, toolMap),
    createMyTool(client, toolMap),  // <-- add here
  ];
}
```

No changes needed in `index.ts` — it auto-discovers all utility tools from `createUtilityTools()`.

## How to Add a Prompt

Prompts are defined in `src/prompts.ts` in the `PROMPTS` record.

1. Add a new entry to `PROMPTS`:

```typescript
bimp_my_prompt: {
  def: {
    name: "bimp_my_prompt",
    description: "Description shown in MCP prompt listing",
  },
  text: `# My Prompt Title

Prompt content here. This is the text returned when the prompt is invoked.
Supports full Markdown formatting.`,
},
```

The `PROMPT_TEXTS` record is auto-populated at module load time from `PROMPTS`, and `index.ts` registers all entries as MCP prompts.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BIMP_EMAIL` | Yes | BIMP account email |
| `BIMP_PASSWORD` | Yes | BIMP account password |
| `BIMP_COMPANY_CODE` | Yes | Company code (e.g., `000001398`) |
| `BIMP_BASE_URL` | No | Override base URL (default: `https://app.bimpsoft.com`) |

## Running Locally

### Start the MCP server (stdio transport)

```bash
npm start          # runs: tsx src/index.ts
npm run dev        # runs: tsx watch src/index.ts (restarts on file changes)
```

The server communicates over stdin/stdout using the MCP protocol. Configure it in your MCP client (e.g., Claude Desktop) as:

```json
{
  "mcpServers": {
    "bimp": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/path/to/bimp-mcp",
      "env": {
        "BIMP_EMAIL": "your-email",
        "BIMP_PASSWORD": "your-password",
        "BIMP_COMPANY_CODE": "000001398"
      }
    }
  }
}
```

### Run tests

```bash
npm test                 # unit tests only
npm run test:integration # integration tests (requires .env with credentials)
npm run test:functional  # functional / end-to-end tests
npm run test:all         # all test suites
npm run test:watch       # unit tests in watch mode
```

### Key Files

| File | Purpose |
|---|---|
| `bimp-api.json` | OpenAPI 3.1 spec — add new endpoints here |
| `src/index.ts` | Server entry point, tool routing, prompt registration |
| `src/tool-generator.ts` | Converts OpenAPI spec to MCP tool definitions |
| `src/client.ts` | HTTP client with auth, token refresh, request execution |
| `src/utilities.ts` | Higher-order utility tools (fetch_all, batch_read, bulk_update) |
| `src/prompts.ts` | MCP prompts with ERP domain context |
| `vitest.config.ts` | Test configuration with unit/integration/functional projects |
| `tests/setup-env.ts` | Loads `.env` for integration/functional tests |
