import fs from "node:fs/promises";
import path from "node:path";
import { runDailyAwardScan } from "../../server/gtmAwardScanner.ts";

const outputPath = path.resolve(process.argv.find((value) => value.startsWith("--output="))?.slice(9) || "public/gtm/award-signals.json");
const scanDate = process.env.GTM_SCAN_DATE ? new Date(`${process.env.GTM_SCAN_DATE}T12:00:00Z`) : new Date();
const payload = await runDailyAwardScan(scanDate);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${payload.opportunities.length} source-backed federal grant candidates to ${path.relative(process.cwd(), outputPath)}.`);
console.log(payload.coverage);
console.log("No contact was discovered, no message was sent, and no CRM record was changed.");
