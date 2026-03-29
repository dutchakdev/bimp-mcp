# Code Standards

## Language and Modules

- TypeScript with `strict: true`
- ESM modules (`"type": "module"` in package.json, `"module": "Node16"` in tsconfig)
- No build step in development -- executed directly via `tsx`

## Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Tool names | `bimp_{entity}_{action}` | `bimp_nomenclature_readList` |
| Variables, functions | camelCase | `fetchAllRecords`, `tokenExpiry` |
| Types, interfaces | PascalCase | `ToolMetadata`, `AuthState` |
| Files | kebab-case | `tool-generator.ts`, `bulk-operations.ts` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT` |

Entity names with hyphens are converted to underscores in tool names: `customer-inventories-return` becomes `bimp_customer_inventories_return_readList`.

## Language

All code, comments, documentation, commit messages, and test descriptions must be in English.

## Exports

- Use named exports only. No default exports.
- Export only what is needed by other modules.

```typescript
// Good
export function createClient(): BimpClient { ... }
export interface BimpClient { ... }

// Bad
export default class BimpClient { ... }
```

## Error Handling

- Throw descriptive `Error` instances with context about what failed and why.
- Include relevant identifiers (UUID, tool name, endpoint) in error messages.
- Do not silently swallow errors.

```typescript
// Good
throw new Error(`Auth failed for ${email}: ${response.status} ${response.statusText}`);

// Bad
throw new Error("Request failed");
```

## File Organization

- One responsibility per file.
- Keep files focused: `client.ts` handles HTTP and auth, `tool-generator.ts` handles spec parsing, `utilities.ts` handles bulk operations.
- Prompts are grouped in a single file (`src/prompts.ts`) since they are pure data.

## Design Principles

- **YAGNI** -- do not add abstractions, layers, or features until they are needed.
- **Spec-driven** -- `bimp-api.json` is the source of truth. Adding endpoints should never require code changes.
- **Transparent auth** -- the consumer should never think about tokens. The client handles login, refresh, and retry internally.

## Dependencies

- Keep dependencies minimal. The project uses:
  - `@modelcontextprotocol/sdk` -- MCP protocol
  - `zod` -- schema validation
  - `tsx` -- TypeScript execution
  - `vitest` -- testing
- Do not add dependencies without clear justification.
