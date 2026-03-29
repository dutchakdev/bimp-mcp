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
- **`src/tool-generator.ts`** — Parses OpenAPI spec at startup, generates MCP tool definitions. Path `/org2/{entity}/api-{action}` becomes tool `bimp_{entity}_{action}`.
- **`src/utilities.ts`** — Three utility tools: `bimp_fetch_all` (auto-pagination + enrich), `bimp_batch_read` (parallel detail reads), `bimp_bulk_update` (mass updates).
- **`src/prompts.ts`** — Six MCP prompts providing ERP domain context, workflow guides, and data analysis patterns.
- **`src/index.ts`** — Wires McpServer with prompts (Zod) and low-level handlers for dynamic tools (raw JSON Schema).

## Key API Patterns

- **No total count** in paginated responses — pagination stops when `data.length < requested count`
- **readList returns incomplete data** for many entities (salesInvoice, specification, etc.) — use `enrich: true` in `bimp_fetch_all` or call the `read` endpoint separately
- **Three pagination types**: offset/count (POST, max 100), cursor (GET inventory), page/pageSize (GET inventory)
- **Auth flow**: login → accessToken → selectCompany → companyAccessToken → all requests

## Testing

- Unit tests mock BimpClient, no API calls needed
- Integration/functional tests use test company **nailsmade shop** (code: 000001398)
- Do NOT modify data in HEYLOVE company (000001220) — read only
