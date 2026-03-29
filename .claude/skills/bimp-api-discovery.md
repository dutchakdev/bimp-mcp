# BIMP API Endpoint Discovery

How to find and document undocumented BIMP API endpoints by inspecting the frontend application.

## Step 1: Capture Requests

1. Open https://app.bimpsoft.com and log in
2. Open DevTools (F12) -> Network tab
3. Filter by `Fetch/XHR`
4. Navigate through the UI section you want to investigate (e.g., open a sales invoice, click "Save", etc.)
5. For each request, record:
   - **Method**: POST or GET
   - **Path**: always starts with `/org2/...` (e.g., `/org2/salesInvoice/api-readList`)
   - **Request body**: the JSON payload (for POST) or query params (for GET)
   - **Response body**: focus on the `data` field structure
   - **Auth**: all endpoints require the `access-token` header (companyAccessToken)

## Step 2: Identify the Pattern

BIMP endpoints follow a consistent naming convention:

```
/org2/{entity}/api-{action}
```

Common actions:
- `readList` — list with pagination (POST, body has `pagination: { offset, count }`)
- `read` — read single item by UUID (POST, body has `uuid`)
- `create` — create new item (POST)
- `update` — update existing item (POST, body has `uuid` + fields)
- `delete` — delete item (POST, body has `uuid`)
- `readStatuses` — get available status values (POST)
- `updateStatus` — change item status (POST)

Variations:
- `/org2/inventory/api-readList` — GET with page/pageSize query params
- `/org2/inventory/api-readList/cursor` — GET with cursor pagination
- `/org2/{entity}/api-read/{pathParam}/something` — path params in braces

## Step 3: Add to bimp-api.json

The spec file is in OpenAPI 3.1 format at the project root. Add new endpoints under `paths`.

### Example: Adding a POST readList endpoint

```json
{
  "paths": {
    "/org2/newEntity/api-readList": {
      "post": {
        "tags": ["NewEntity"],
        "description": "List new entities with pagination",
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
                  },
                  "name": { "type": "string", "description": "Filter by name" }
                },
                "required": ["pagination"]
              }
            }
          },
          "required": true
        },
        "security": [{ "tokenAuth": [] }],
        "responses": {
          "200": { "description": "Default Response" }
        }
      }
    }
  }
}
```

### Example: Adding a GET endpoint with query params

```json
{
  "/org2/newEntity/api-readList": {
    "get": {
      "tags": ["NewEntity"],
      "description": "Read new entity list",
      "parameters": [
        { "in": "query", "name": "page", "schema": { "type": "number" } },
        { "in": "query", "name": "pageSize", "schema": { "type": "number" } },
        { "in": "header", "name": "accept-language", "schema": { "type": "string" }, "required": false }
      ],
      "security": [{ "tokenAuth": [] }],
      "responses": {
        "200": { "description": "Default Response" }
      }
    }
  }
}
```

## Step 4: Verify Tool Generation

After editing `bimp-api.json`, verify the tool generator produces the expected tool:

```bash
npx tsx -e "
import { readFileSync } from 'fs';
import { generateTools } from './src/tool-generator.js';
const spec = JSON.parse(readFileSync('bimp-api.json', 'utf-8'));
const tools = generateTools(spec);
const tool = tools.find(t => t.name === 'bimp_newEntity_readList');
console.log(JSON.stringify(tool, null, 2));
"
```

Check that:
- `name` matches the expected `bimp_{entity}_{action}` pattern
- `inputSchema.properties` contains all fields from the spec
- `metadata.paginationType` is correctly detected (offset, cursor, page, or none)
- `metadata.pathParams` lists any `{param}` values from the path

## Step 5: Run Unit Tests

```bash
npm test
```

The `tool-generator.test.ts` tests verify that excluded paths are filtered, schemas are mapped correctly, and pagination types are detected.

## Tips

- The `accept-language` header parameter is automatically stripped by the tool generator; no need to exclude it manually.
- Auth endpoints (`/org2/auth/api-*`) and image download are excluded via `EXCLUDED_PATHS` in `tool-generator.ts`.
- Integration paths matching `EXCLUDED_PATH_PATTERNS` (e.g., Zoho People) are also excluded.
- BIMP always returns `{ success: boolean, data: ... }` — the `data` field structure is what matters for schema documentation.
