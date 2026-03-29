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
  return [];
}
