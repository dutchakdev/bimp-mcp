import type { BimpClient } from "./client.js";
import type { ToolDefinition } from "./tool-generator.js";

export interface UtilityTool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

const PAGE_SIZE = 100;

/**
 * Derive the "read" tool name from a "readList" tool name.
 * bimp_foo_readList       -> bimp_foo_read
 * bimp_foo_readList_cursor -> bimp_foo_read
 */
function deriveReadToolName(listToolName: string): string {
  return listToolName.replace(/_readList(?:_cursor)?$/, "_read");
}

/**
 * Run promises in batches of `concurrency`, collecting all settled results.
 */
async function runInBatches<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map((fn) => fn()));
    results.push(...settled);
  }
  return results;
}

/**
 * Internal batch-read logic shared by bimp_fetch_all (enrich) and bimp_batch_read.
 */
async function batchReadUuids(
  client: BimpClient,
  toolDef: ToolDefinition,
  uuids: string[],
  concurrency: number
): Promise<{ items: unknown[]; errors: Array<{ uuid: string; error: string }> }> {
  const items: unknown[] = [];
  const errors: Array<{ uuid: string; error: string }> = [];

  const tasks = uuids.map((uuid) => async () => {
    const response = (await client.request(
      toolDef.metadata.method,
      toolDef.metadata.path,
      { uuid }
    )) as { success: boolean; data: unknown };
    return { uuid, data: response.data };
  });

  const results = await runInBatches(tasks, concurrency);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      items.push(result.value.data);
    } else {
      errors.push({
        uuid: uuids[i],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  return { items, errors };
}

function createFetchAllTool(
  client: BimpClient,
  toolMap: Map<string, ToolDefinition>
): UtilityTool {
  return {
    name: "bimp_fetch_all",
    description:
      "Auto-paginate any readList endpoint to fetch all items. " +
      "Supports offset, cursor, page, and none pagination types. " +
      "Use enrich=true to call the corresponding read endpoint for full details on each item.",
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description: "Name of a readList tool to paginate (e.g. bimp_nomenclature_readList)",
        },
        limit: {
          type: "number",
          description: "Maximum number of items to return (default: unlimited)",
        },
        enrich: {
          type: "boolean",
          description: "If true, fetch full details for each item via the corresponding read endpoint",
        },
        filters: {
          type: "object",
          description: "Additional filter parameters to pass through to the API",
        },
      },
      required: ["tool"],
    },
    handler: async (params: Record<string, unknown>) => {
      const toolName = params.tool as string;
      const limit = params.limit as number | undefined;
      const enrich = params.enrich as boolean | undefined;
      const filters = (params.filters ?? {}) as Record<string, unknown>;

      const toolDef = toolMap.get(toolName);
      if (!toolDef) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      let allItems: Array<Record<string, unknown>> = [];
      const paginationType = toolDef.metadata.paginationType;

      if (paginationType === "offset") {
        let offset = 0;
        while (true) {
          const requestParams: Record<string, unknown> = {
            ...filters,
            pagination: { offset, count: PAGE_SIZE },
          };

          const response = (await client.request(
            toolDef.metadata.method,
            toolDef.metadata.path,
            requestParams
          )) as { success: boolean; data: unknown[] };

          const page = response.data ?? [];
          allItems.push(...(page as Array<Record<string, unknown>>));

          if (limit && allItems.length >= limit) {
            allItems = allItems.slice(0, limit);
            break;
          }

          if (page.length < PAGE_SIZE) {
            break;
          }

          offset += PAGE_SIZE;
        }
      } else if (paginationType === "cursor") {
        let cursor: string | undefined;
        while (true) {
          const requestParams: Record<string, unknown> = {
            ...filters,
            ...(cursor ? { cursor } : {}),
            count: PAGE_SIZE,
          };

          const response = (await client.request(
            toolDef.metadata.method,
            toolDef.metadata.path,
            requestParams
          )) as { success: boolean; data: unknown[]; cursor?: string };

          const page = response.data ?? [];
          allItems.push(...(page as Array<Record<string, unknown>>));

          if (limit && allItems.length >= limit) {
            allItems = allItems.slice(0, limit);
            break;
          }

          cursor = response.cursor;
          if (!cursor || page.length < PAGE_SIZE) {
            break;
          }
        }
      } else if (paginationType === "page") {
        let page = 1;
        while (true) {
          const requestParams: Record<string, unknown> = {
            ...filters,
            page,
            pageSize: PAGE_SIZE,
          };

          const response = (await client.request(
            toolDef.metadata.method,
            toolDef.metadata.path,
            requestParams
          )) as { success: boolean; data: unknown[] };

          const items = response.data ?? [];
          allItems.push(...(items as Array<Record<string, unknown>>));

          if (limit && allItems.length >= limit) {
            allItems = allItems.slice(0, limit);
            break;
          }

          if (items.length < PAGE_SIZE) {
            break;
          }

          page++;
        }
      } else {
        // paginationType === "none" — single request
        const requestParams: Record<string, unknown> = { ...filters };

        const response = (await client.request(
          toolDef.metadata.method,
          toolDef.metadata.path,
          requestParams
        )) as { success: boolean; data: unknown[] };

        const items = response.data ?? [];
        allItems.push(...(items as Array<Record<string, unknown>>));

        if (limit && allItems.length > limit) {
          allItems = allItems.slice(0, limit);
        }
      }

      // Enrich: call the read endpoint for each item
      if (enrich && allItems.length > 0) {
        const readToolName = deriveReadToolName(toolName);
        const readToolDef = toolMap.get(readToolName);
        if (!readToolDef) {
          throw new Error(
            `Cannot enrich: read tool not found (expected ${readToolName})`
          );
        }

        const uuids = allItems
          .map((item) => item.uuid as string)
          .filter(Boolean);

        const { items: enrichedItems } = await batchReadUuids(
          client,
          readToolDef,
          uuids,
          10
        );

        return { items: enrichedItems, count: enrichedItems.length };
      }

      return { items: allItems, count: allItems.length };
    },
  };
}

function createBatchReadTool(
  client: BimpClient,
  toolMap: Map<string, ToolDefinition>
): UtilityTool {
  return {
    name: "bimp_batch_read",
    description:
      "Read multiple items by UUID in parallel. Provide the read tool name and an array of UUIDs.",
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description: "Name of a read tool (e.g. bimp_nomenclature_read)",
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
    handler: async (params: Record<string, unknown>) => {
      const toolName = params.tool as string;
      const uuids = params.uuids as string[];
      const concurrency = (params.concurrency as number) ?? 10;

      const toolDef = toolMap.get(toolName);
      if (!toolDef) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      return batchReadUuids(client, toolDef, uuids, concurrency);
    },
  };
}

function createBulkUpdateTool(
  client: BimpClient,
  toolMap: Map<string, ToolDefinition>
): UtilityTool {
  return {
    name: "bimp_bulk_update",
    description:
      "Update multiple items in parallel. Provide the update tool name and an array of items (each must include uuid).",
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description: "Name of an update tool (e.g. bimp_nomenclature_update)",
        },
        items: {
          type: "array",
          items: { type: "object" },
          description: "Array of objects to update (each must contain uuid)",
        },
        concurrency: {
          type: "number",
          description: "Number of parallel requests (default: 5)",
        },
      },
      required: ["tool", "items"],
    },
    handler: async (params: Record<string, unknown>) => {
      const toolName = params.tool as string;
      const items = params.items as Array<Record<string, unknown>>;
      const concurrency = (params.concurrency as number) ?? 5;

      const toolDef = toolMap.get(toolName);
      if (!toolDef) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      let updated = 0;
      const errors: Array<{ uuid: string; error: string }> = [];

      const tasks = items.map((item) => async () => {
        await client.request(
          toolDef.metadata.method,
          toolDef.metadata.path,
          item
        );
        return item.uuid as string;
      });

      const results = await runInBatches(tasks, concurrency);

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "fulfilled") {
          updated++;
        } else {
          errors.push({
            uuid: (items[i].uuid as string) ?? `item[${i}]`,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }

      return { updated, errors };
    },
  };
}

export function createUtilityTools(
  client: BimpClient,
  toolMap: Map<string, ToolDefinition>
): UtilityTool[] {
  return [
    createFetchAllTool(client, toolMap),
    createBatchReadTool(client, toolMap),
    createBulkUpdateTool(client, toolMap),
  ];
}
