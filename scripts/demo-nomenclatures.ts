// scripts/demo-nomenclatures.ts
//
// Interactive demo of the nomenclatures-extended tools.
// Usage: npx tsx scripts/demo-nomenclatures.ts
//
// Requires .env with BIMP_EMAIL, BIMP_PASSWORD, BIMP_COMPANY_CODE
//
import { config } from "dotenv";
config();

import { BimpClient } from "../src/client.js";
import { createNomenclaturesTools } from "../src/nomenclatures-extended.js";

const client = new BimpClient({
  email: process.env.BIMP_EMAIL!,
  password: process.env.BIMP_PASSWORD!,
  companyCode: process.env.BIMP_COMPANY_CODE!,
  baseUrl: process.env.BIMP_BASE_URL,
});

const tools = createNomenclaturesTools(client);
const read = tools.find((t) => t.name === "bimp_nomenclatures_read")!;
const upsert = tools.find((t) => t.name === "bimp_nomenclatures_upsert")!;
const readList = tools.find((t) => t.name === "bimp_nomenclatures_readList")!;

function log(label: string, data: unknown) {
  console.log(`\n━━━ ${label} ━━━`);
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  console.log("BIMP Nomenclatures Extended — Demo\n");

  // 1. List all products (extended)
  console.log("1. Fetching all products via bimp_nomenclatures_readList...");
  const list = (await readList.handler({})) as { items: Array<Record<string, unknown>>; count: number };
  console.log(`   Found ${list.count} products`);

  if (list.count === 0) {
    console.log("   No products found. Creating a demo product...");

    // Create a product via standard API first
    const unitList = (await client.request("POST", "/org2/unitsOfMeasurment/api-readList", {
      pagination: { offset: 0, count: 1 },
    })) as { success: boolean; data: Array<{ uuid: string; name: string }> };

    const created = (await client.request("POST", "/org2/nomenclature/api-create", {
      name: `Demo Product ${Date.now()}`,
      unitOfMeasurementUuid: unitList.data[0].uuid,
    })) as { success: boolean; data: { uuid: string } };

    console.log(`   Created product: ${created.data.uuid}`);

    // Re-fetch list
    const list2 = (await readList.handler({})) as { items: Array<Record<string, unknown>>; count: number };
    list.items = list2.items;
    list.count = list2.count;
  }

  // Show first 3 items
  log("Products (first 3)", list.items.slice(0, 3).map((p) => ({
    uuid: p.uuid,
    name: p.name,
    article: p.article,
    minStock: p.minStock,
  })));

  // 2. Read full details for first product
  const firstUuid = list.items[0].uuid as string;
  console.log(`\n2. Reading full product card for ${firstUuid}...`);
  const full = await read.handler({ uuid: firstUuid });
  log("Full Product Card", full);

  // 3. Update planning fields
  console.log("\n3. Setting planning fields via bimp_nomenclatures_upsert...");
  const planningUpdate = {
    uuid: firstUuid,
    minStock: 25,
    maxStock: 200,
    speedOfDemand: 5,
    insuranceReserve: 10,
    deliveryTerm: 14,
  };
  log("Sending", planningUpdate);
  const upsertResult = await upsert.handler(planningUpdate);
  log("Result", upsertResult);

  // 4. Verify the update
  console.log("\n4. Verifying planning fields were saved...");
  const verified = (await read.handler({ uuid: firstUuid })) as Record<string, unknown>;
  log("Verified Fields", {
    minStock: verified.minStock,
    maxStock: verified.maxStock,
    speedOfDemand: verified.speedOfDemand,
    insuranceReserve: verified.insuranceReserve,
    deliveryTerm: verified.deliveryTerm,
  });

  const allMatch =
    verified.minStock === 25 &&
    verified.maxStock === 200 &&
    verified.speedOfDemand === 5 &&
    verified.insuranceReserve === 10 &&
    verified.deliveryTerm === 14;

  console.log(allMatch ? "\nAll planning fields verified!" : "\nSome fields did not match — check output above.");

  // 5. Quick deficit analysis
  console.log("\n5. Quick deficit analysis...");
  const productsWithMinStock = list.items.filter(
    (p) => typeof p.minStock === "number" && (p.minStock as number) > 0
  );
  console.log(`   Products with minStock > 0: ${productsWithMinStock.length}`);
  for (const p of productsWithMinStock.slice(0, 5)) {
    console.log(`   - ${p.name}: minStock=${p.minStock}`);
  }

  console.log("\nDemo complete.");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
