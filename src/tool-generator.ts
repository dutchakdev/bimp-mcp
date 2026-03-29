export interface ToolMetadata {
  method: string;
  path: string;
  tag: string;
  paginationType: "offset" | "cursor" | "page" | "none";
  pathParams: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  metadata: ToolMetadata;
}

const EXCLUDED_PATHS = [
  "/org2/images/download",
  "/org2/auth/api-login",
  "/org2/auth/api-refresh",
  "/org2/auth/api-selectCompany",
  "/org2/auth/api-verifyCompanyAccess",
];

const EXCLUDED_PATH_PATTERNS = [/\/integration\/zohoPeople\//];

export function pathToToolName(path: string): string {
  let cleaned = path.replace(/^\/org2\//, "");
  cleaned = cleaned.replace(/\/api-/, "_");
  cleaned = cleaned.replace(/\/\{[^}]+\}/g, "");
  cleaned = cleaned.replace(/\//g, "_");
  cleaned = cleaned.replace(/-/g, "_");
  return `bimp_${cleaned}`;
}

function detectPaginationType(
  path: string,
  method: string,
  schema: Record<string, unknown>
): ToolMetadata["paginationType"] {
  if (path.includes("/cursor")) return "cursor";
  const properties = (schema.properties ?? {}) as Record<string, unknown>;
  if ("pagination" in properties) return "offset";
  if (method === "GET") {
    const params = Object.keys(properties);
    if (params.includes("page") || params.includes("pageSize")) return "page";
  }
  return "none";
}

function extractPathParams(path: string): string[] {
  const params: string[] = [];
  const regex = /\{(\w+)\}/g;
  let match;
  while ((match = regex.exec(path)) !== null) {
    params.push(match[1]);
  }
  return params;
}

interface OpenAPISpec {
  paths: Record<string, Record<string, OpenAPIOperation>>;
  [key: string]: unknown;
}

interface OpenAPIOperation {
  tags?: string[];
  description?: string;
  requestBody?: {
    content?: {
      "application/json"?: {
        schema?: Record<string, unknown>;
      };
    };
  };
  parameters?: Array<{
    in: string;
    name: string;
    schema?: Record<string, unknown>;
    required?: boolean;
    description?: string;
  }>;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, unknown>>;
}

export function generateTools(spec: OpenAPISpec): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    if (EXCLUDED_PATHS.includes(path)) continue;
    if (EXCLUDED_PATH_PATTERNS.some((p) => p.test(path))) continue;

    for (const [method, operation] of Object.entries(methods)) {
      if (typeof operation !== "object" || operation === null) continue;
      const op = operation as OpenAPIOperation;

      const name = pathToToolName(path);
      const tag = op.tags?.[0] ?? "Unknown";
      const description = op.description ?? `${method.toUpperCase()} ${path}`;
      const pathParams = extractPathParams(path);

      let properties: Record<string, unknown> = {};
      let required: string[] = [];

      if (method.toUpperCase() === "GET" || method.toUpperCase() === "DELETE") {
        const params = (op.parameters ?? []).filter(
          (p) => p.in === "query" && p.name !== "accept-language"
        );
        for (const param of params) {
          properties[param.name] = param.schema ?? { type: "string" };
          if (param.required) required.push(param.name);
        }
      } else {
        const bodySchema =
          op.requestBody?.content?.["application/json"]?.schema;
        if (bodySchema) {
          properties = (bodySchema.properties ?? {}) as Record<
            string,
            unknown
          >;
          required = (bodySchema.required ?? []) as string[];
        }
      }

      for (const pp of pathParams) {
        if (!(pp in properties)) {
          properties[pp] = {
            type: "string",
            description: `Path parameter: ${pp}`,
          };
        }
        if (!required.includes(pp)) {
          required.push(pp);
        }
      }

      const inputSchema: ToolDefinition["inputSchema"] = {
        type: "object" as const,
        properties,
      };
      if (required.length > 0) {
        inputSchema.required = required;
      }

      const paginationType = detectPaginationType(
        path,
        method.toUpperCase(),
        inputSchema
      );

      tools.push({
        name,
        description,
        inputSchema,
        metadata: {
          method: method.toUpperCase(),
          path,
          tag,
          paginationType,
          pathParams,
        },
      });
    }
  }

  return tools;
}
