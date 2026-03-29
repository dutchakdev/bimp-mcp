import type { BimpClient } from "./client.js";
import type { UtilityTool } from "./utilities.js";

export const FIELD_MAP: Record<string, string> = {
  uuid: "GUID",
  name: "Наименование",
  fullName: "НаименованиеДляПечати",
  code: "Код",
  article: "Артикул",
  comment: "Комментарий",
  barcode: "Штрихкод",
  minStock: "МинимальныйОстаток",
  maxStock: "МаксимальныйОстаток",
  speedOfDemand: "speedOfDemand",
  insuranceReserve: "insuranceReserve",
  deliveryTerm: "deliveryTerm",
  weight: "Вес",
  height: "Высота",
  width: "Ширина",
  length: "Длина",
  plannedCost: "ПлановаяСебестоимость",
  isKit: "ЭтоНабор",
  isService: "ЭтоУслуга",
  archived: "Архив",
  type: "ТипНоменклатуры",
  unitOfMeasurementUuid: "ЕдиницаИзмерения.GUID",
  expenseAccountUuid: "СчетУчетаЗатрат.GUID",
  inventoryAccountUuid: "СчетУчетаЗапасов.GUID",
  docType: "ТипДокумента",
};

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([en, cyrillic]) => [cyrillic, en])
);

export function toEnglish(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[REVERSE_MAP[key] ?? key] = value;
  }
  return result;
}

export function toCyrillic(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[FIELD_MAP[key] ?? key] = value;
  }
  return result;
}

function createNomenclaturesReadTool(client: BimpClient): UtilityTool {
  return {
    name: "bimp_nomenclatures_read",
    description:
      "Read full product card including planning/accounting fields " +
      "(minStock, maxStock, speedOfDemand, insuranceReserve, deliveryTerm) " +
      "from the extended nomenclatures endpoint.",
    inputSchema: {
      type: "object",
      properties: {
        uuid: { type: "string", description: "Product UUID" },
      },
      required: ["uuid"],
    },
    handler: async (params) => {
      const uuid = params.uuid as string;
      const response = (await client.request("POST", "/org2/nomenclatures/read", {
        lang: "ru",
        uid: uuid,
      })) as { success: boolean; data: Record<string, unknown> };
      return toEnglish(response.data);
    },
  };
}

function createNomenclaturesUpsertTool(client: BimpClient): UtilityTool {
  return {
    name: "bimp_nomenclatures_upsert",
    description:
      "Create or update a product with planning/accounting fields. " +
      "For update: uuid is required. For create: uuid is optional. " +
      "Supports: minStock, maxStock, speedOfDemand, insuranceReserve, deliveryTerm, and all standard fields.",
    inputSchema: {
      type: "object",
      properties: {
        uuid: { type: "string", description: "Product UUID (required for update, optional for create)" },
        name: { type: "string", description: "Product name (required for create)" },
        article: { type: "string", description: "Product article/SKU" },
        minStock: { type: "number", description: "Minimum stock level" },
        maxStock: { type: "number", description: "Maximum stock level" },
        speedOfDemand: { type: "number", description: "Demand rate" },
        insuranceReserve: { type: "number", description: "Safety stock" },
        deliveryTerm: { type: "number", description: "Delivery time in days" },
        unitOfMeasurementUuid: { type: "string", description: "Unit of measurement UUID" },
        type: { type: "number", description: "Product type: 1=goods, 2=service" },
      },
    },
    handler: async (params) => {
      const { docType: _ignored, ...fields } = params as Record<string, unknown>;
      const body = toCyrillic(fields);
      body["ТипДокумента"] = "101";
      const response = (await client.request(
        "POST",
        "/org2/nomenclatures/upsert",
        body
      )) as { success: boolean; data: { GUID: string } };
      return { uuid: response.data.GUID };
    },
  };
}

function createNomenclaturesReadListTool(client: BimpClient): UtilityTool {
  return {
    name: "bimp_nomenclatures_readList",
    description:
      "List all products from the extended nomenclatures endpoint. " +
      "Returns English-mapped items including minStock field.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const response = (await client.request(
        "POST",
        "/org2/nomenclatures/readList",
        {}
      )) as { success: boolean; data: Array<Record<string, unknown>> };
      const items = (response.data ?? []).map(toEnglish);
      return { items, count: items.length };
    },
  };
}

export function createNomenclaturesTools(client: BimpClient): UtilityTool[] {
  return [
    createNomenclaturesReadTool(client),
    createNomenclaturesUpsertTool(client),
    createNomenclaturesReadListTool(client),
  ];
}
