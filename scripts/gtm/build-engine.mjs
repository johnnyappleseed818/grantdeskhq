import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEligibleOptIn, parseCsv, renderOptInEmailText, scoreProspect, summarizeSignals, toCsv } from "./lib.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const outputDirectory = path.resolve(projectRoot, outputArgument?.slice("--output=".length) || "gtm/generated");

const config = JSON.parse(await fs.readFile(path.join(projectRoot, "gtm/config.json"), "utf8"));
const redditSignals = JSON.parse(await fs.readFile(path.join(projectRoot, "gtm/data/reddit-signals.json"), "utf8"));
const linkedinItems = JSON.parse(await fs.readFile(path.join(projectRoot, "gtm/data/linkedin-engagement.json"), "utf8"));
const prospects = parseCsv(await fs.readFile(path.join(projectRoot, "gtm/data/nonprofit-prospects.csv"), "utf8"));
const scoredProspects = prospects.map(scoreProspect).sort((left, right) => right.fit_score - left.fit_score || left.organization.localeCompare(right.organization));
const themeSummary = summarizeSignals(redditSignals, config.painThemes);
const eligibleOptIns = prospects.filter(isEligibleOptIn);

await fs.mkdir(outputDirectory, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(outputDirectory, "reddit-signal-summary.md"), renderSignalSummary(redditSignals, themeSummary), "utf8"),
  fs.writeFile(path.join(outputDirectory, "linkedin-engagement-queue.md"), renderLinkedInQueue(linkedinItems), "utf8"),
  fs.writeFile(path.join(outputDirectory, "prospect-research-priority.csv"), toCsv(scoredProspects, ["priority", "name", "role", "organization", "segment", "official_source", "fit_score", "fit_tier", "fit_basis", "unresolved"]), "utf8"),
  fs.writeFile(path.join(outputDirectory, "opt-in-email-preview.txt"), renderOptInEmailText({
    postalAddress: "1021 East Lincolnway, Cheyenne, Wyoming 82001",
    discount: config.offer.discount
  }), "utf8")
]);

console.log(`Built GrantDeskHQ GTM artifacts in ${path.relative(projectRoot, outputDirectory) || "."}.`);
console.log(`${redditSignals.length} Reddit signals; ${linkedinItems.length} LinkedIn items; ${prospects.length} nonprofit research prospects; ${eligibleOptIns.length} eligible email opt-ins.`);
console.log("No email was sent and no social action was posted.");

function renderSignalSummary(signals, themes) {
  const themeLines = themes.filter((theme) => theme.count > 0).map((theme) => `- **${theme.key} (${theme.count}/${signals.length}):** ${theme.description}`).join("\n");
  const signalLines = signals.map((signal) => `### [${signal.title}](${signal.url})\n\n${signal.evidenceSummary}\n\n**GTM implication:** ${signal.productImplication}`).join("\n\n");
  return `# Reddit pain-signal scan\n\nObserved and reviewed on August 6, 2026. This is a bounded qualitative scan, not a measure of market prevalence.\n\n## Recurring themes\n\n${themeLines}\n\n## Threads and implications\n\n${signalLines}\n`;
}

function renderLinkedInQueue(items) {
  const lines = items.map((item) => `## [${item.title}](${item.url})\n\n- **Type:** ${item.type.replaceAll("_", " ")}\n- **Why it matters:** ${item.observedPain}\n- **Status:** ${item.status.replaceAll("_", " ")}\n\n**Reviewed draft response**\n\n> ${item.suggestedComment}`).join("\n\n");
  return `# LinkedIn research and engagement queue\n\nEvery response below is a draft for human review. Nothing is posted automatically. Disclose the GrantDeskHQ affiliation whenever the product is mentioned, and contribute to the discussion before sharing a link.\n\n${lines}\n`;
}
