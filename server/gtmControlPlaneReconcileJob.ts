import { initialOpportunities } from "../src/data/gtmData.ts";
import { reconcileControlPlaneQueue } from "../src/lib/gtmControlPlaneQueue.ts";
import { confirmedHumanOutreach } from "../src/lib/gtmOutreach.ts";
import { readGtmAwardScan, readGtmContactSuppression, saveGtmControlPlaneReconciliation } from "./persistence.ts";

const scan = await readGtmAwardScan();
const opportunities = [...initialOpportunities, ...(scan?.opportunities || [])];
const directEmails = [...new Set(opportunities.flatMap((opportunity) => opportunity.primaryContact?.emailKind === "direct" ? [opportunity.primaryContact.email.toLowerCase()] : []))];
const checks = await Promise.all(directEmails.map(async (email) => [email, await readGtmContactSuppression(email)] as const));
const reconciliation = await saveGtmControlPlaneReconciliation(reconcileControlPlaneQueue({
  cards: opportunities,
  suppressionByEmail: Object.fromEntries(checks.map(([email, check]) => [email, check.status])),
  alreadyContactedOrganizations: confirmedHumanOutreach.map((record) => record.organization),
  alreadyContactedEmails: confirmedHumanOutreach.flatMap((record) => record.email ? [record.email] : []),
  draftOrganizations: opportunities.filter((opportunity) => opportunity.emailSubject.trim() && opportunity.draftMessage.trim()).map((opportunity) => opportunity.organization)
}));

console.log(JSON.stringify({
  status: "completed",
  awardScanGeneratedAt: scan?.generatedAt || null,
  controlPlaneCards: reconciliation.cards.length,
  uniqueOrganizations: reconciliation.uniqueOrganizations,
  counts: reconciliation.counts,
  outboundEnabled: false
}));
