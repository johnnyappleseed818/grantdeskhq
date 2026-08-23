import { initialOpportunities } from "../src/data/gtmData.ts";
import { contactEnrichmentKey, createPartnerShadowDraft, type ContactEnrichmentRecord, type EnrichmentTarget } from "../src/lib/contactEnrichment.ts";
import { confirmedHumanOutreach, initialOutreachEligibility } from "../src/lib/gtmOutreach.ts";
import type { CanonicalGtmCandidate } from "../src/lib/gtmCanonical.ts";
import { enrichGtmContactWithHunter, reconcileStoredGtmContact, retryEligible } from "./contactEnrichment.ts";
import { readGtmContactEnrichment } from "./persistence.ts";

export type EnrichmentBatchSegment = "partner" | "direct";
export interface StoredEnrichmentReconciliationResult { segment: EnrichmentBatchSegment; reconciled: number; ready: number; needsVerification: number; alreadyContacted: number; verified: number; acceptAll: number; risky: number; invalid: number; resultMissing: number; records: Array<{ organization: string; email: string | null; verifierStatus: string; suppressionStatus: string; priorContactStatus: string; readyToSend: boolean; blocker: string | null }>; }
export interface EnrichmentBatchResult { segment: EnrichmentBatchSegment; attempted: number; contactsResolved: number; verifiedEmails: number; ready: number; needsVerification: number; alreadyContacted: number; duplicates: number; failures: number; providerUsage: { hunterLookups: number; hunterVerifications: number }; records: Array<{ organization: string; contact: string; title: string; email: string | null; status: string; source: string; subject?: string; personalizedEmail?: string; whyFit: string; failureReason?: string; }>; }

const partnerCandidates: Array<{ organization: string; domain: string; source: string; first: string; last: string; title: string; type: string; whyFit: string }> = [
 ["The Charity CFO","thecharitycfo.com","https://thecharitycfo.com/about-us/leadership-team/","Tosha","Anderson","Founder + Managing Partner","fractional CFO","Nonprofit CFO, accounting, and grant-management support."],
 ["Kiwi Partners","kiwipartners.com","https://www.kiwipartners.com/ken-hafner","Ken","Hafner","Head of Accounting Services","accounting","Nonprofit accounting, CFO coverage, and budget-to-actual reporting."],
 ["YPTC","yptc.com","https://www.yptc.com/ceo-jennifer-alleva/","Jennifer","Alleva","Chief Executive Officer","fractional CFO","Fractional CFO and nonprofit accounting support."],
 ["Array Accounting","arrayaccounting.com","https://arrayaccounting.com/about-fractional-cfo-nonprofit-accounting-consulting-services/","Danielle","Wright","Founder, Array Accounting & Consulting","accounting","Nonprofit accounting, controller, fractional CFO, and grant-compliance support."],
 ["c3 by Design","c3bydesign.com","https://www.c3bydesign.com/about","Scott","Turner","Founder and CEO","grant advisory","Grant requirements, allocation methodology, and reporting expertise."],
 ["Altruic Advisors","altruic.com","https://altruic.com/ryan-hagan","Ryan","Hagan","Founder & Managing Partner","accounting","Nonprofit CFO solutions, grant tracking, and audit support."],
 ["JMT Consulting","jmtconsulting.com","https://jmtconsulting.com/blog/nonprofit-ai-adoption-leadership-capacity-change/","Jacqueline","Tiso","Founder & Chief Executive Officer","technology advisory","Nonprofit finance systems, grant management, and reporting workflows."],
 ["NFO Nonprofit Financial Outsourcing","nfoyourcfo.com","https://www.nfoyourcfo.com/our-team","Scott","Kriete","Chief Executive Officer","fractional CFO","Fractional CFO, fiscal grant management, financial reporting, and audit support."],
 ["Strategic Nonprofit Finance","strategicnonprofitfinance.com","https://www.strategicnonprofitfinance.com/about","Larry","Bomback","Founder and CEO","fractional CFO","Nonprofit finance leadership, board reporting, and foundation reporting."],
 ["100 Degrees Consulting","100degreesconsulting.com","https://100degreesconsulting.com/our-team/","Stephanie","Skryzowski","Founder & CEO","fractional CFO","Nonprofit financial leadership, planning, reporting, and sustainability support."]
].map(([organization, domain, source, first, last, title, type, whyFit]) => ({ organization, domain, source, first, last, title, type, whyFit }));

/** Candidate inventory only. This never contacts a provider and is shared by the read model. */
export function canonicalGtmCandidates(): CanonicalGtmCandidate[] {
 const direct = initialOpportunities.map((item) => {
  const contact = item.primaryContact;
  const names = contact?.name.trim().split(/\s+/) || [];
  const firstName = names[0] || "Unknown"; const lastName = names.at(-1) || "Contact";
  return {
   id: item.id, segment: "DIRECT" as const, qualified: Boolean(item.entityVerified && item.nonprofitVerified && !item.conflicts.length),
   target: { prospectChannel: "DIRECT_NONPROFIT" as const, organization: item.organization, organizationDomain: domainFromUrl(item.organizationUrl), domainSourceUrl: item.organizationUrl, person: { firstName, lastName, fullName: contact?.name || "Contact research required", currentTitle: contact?.title || "Contact research required", titleSourceUrl: contact?.roleSourceUrl || item.organizationUrl } },
   sourceUrl: item.evidence[0]?.url || item.organizationUrl, whyNow: item.whyNow, subject: item.emailSubject, draft: item.draftMessage,
   priority: item.score.pain + item.score.timing + item.score.fit + item.score.value
  };
 });
 const partner = partnerTargets().map((candidate) => {
  const draft = createPartnerShadowDraft({ firstName: candidate.target.person.firstName, organization: candidate.target.organization, partnerType: candidate.partnerType, whySelected: candidate.whyFit });
  return { id: contactEnrichmentKey(candidate.target), segment: "PARTNER" as const, target: candidate.target, qualified: true, sourceUrl: candidate.source, whyNow: candidate.whyFit, partnerType: candidate.partnerType, subject: draft.subject, draft: draft.body, priority: 100 };
 });
 return [...direct, ...partner];
}

export async function runContactEnrichmentBatch(input: { segment: EnrichmentBatchSegment; limit?: number; dryRun?: boolean }, environment: NodeJS.ProcessEnv = process.env): Promise<EnrichmentBatchResult> {
 const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 20);
 const candidates = input.segment === "partner" ? partnerTargets() : directTargets();
 const result: EnrichmentBatchResult = { segment: input.segment, attempted: 0, contactsResolved: 0, verifiedEmails: 0, ready: 0, needsVerification: 0, alreadyContacted: 0, duplicates: 0, failures: 0, providerUsage: { hunterLookups: 0, hunterVerifications: 0 }, records: [] };
 const seenOrganizations = new Set<string>(); const seenEmails = new Set<string>();
 for (const candidate of candidates) {
  if (result.attempted >= limit) break;
  const eligibility = initialOutreachEligibility(confirmedHumanOutreach, { organization: candidate.target.organization, domain: candidate.target.organizationDomain });
  if (eligibility !== "ELIGIBLE_FOR_INITIAL_OUTREACH") { result.alreadyContacted++; continue; }
  const key = contactEnrichmentKey(candidate.target);
  if (seenOrganizations.has(candidate.target.organization.toLowerCase())) { result.duplicates++; continue; }
  seenOrganizations.add(candidate.target.organization.toLowerCase());
  const previous = await readGtmContactEnrichment(key);
  if (!retryEligible(previous, candidate.target)) { result.needsVerification++; continue; }
  result.contactsResolved++;
  if (input.dryRun) { result.records.push(present(candidate, null)); continue; }
  result.attempted++;
  const record = await enrichGtmContactWithHunter(candidate.target, environment, previous || undefined);
  const hunterAttempts = record.providerAttempts.filter((attempt) => attempt.provider === "hunter" && attempt.attempted);
  result.providerUsage.hunterLookups += hunterAttempts.length;
  result.providerUsage.hunterVerifications += hunterAttempts.filter((attempt) => attempt.providerMetadata.verifierCalled === true).length;
  if (record.emailVerificationStatus === "VERIFIED") result.verifiedEmails++;
  if (record.email && seenEmails.has(record.email)) { result.duplicates++; continue; }
  if (record.email) seenEmails.add(record.email);
  if (record.readyForHumanApproval) result.ready++; else result.needsVerification++;
  if (record.emailVerificationStatus === "UNAVAILABLE" || record.emailVerificationStatus === "INVALID") result.failures++;
  result.records.push(present(candidate, record));
 }
 return result;
}

/** Stored-data-only reconciliation; it cannot make a provider request or alter retry eligibility. */
export async function reconcileStoredContactEnrichmentBatch(input: { segment: EnrichmentBatchSegment; limit?: number }): Promise<StoredEnrichmentReconciliationResult> {
 const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 20);
 const candidates = input.segment === "partner" ? partnerTargets() : directTargets();
 const result: StoredEnrichmentReconciliationResult = { segment: input.segment, reconciled: 0, ready: 0, needsVerification: 0, alreadyContacted: 0, verified: 0, acceptAll: 0, risky: 0, invalid: 0, resultMissing: 0, records: [] };
 for (const candidate of candidates.slice(0, limit)) {
  const key = contactEnrichmentKey(candidate.target);
  const previous = await readGtmContactEnrichment(key);
  if (!previous) continue;
  const eligibility = initialOutreachEligibility(confirmedHumanOutreach, { organization: candidate.target.organization, domain: candidate.target.organizationDomain });
  const priorContactStatus = eligibility === "ELIGIBLE_FOR_INITIAL_OUTREACH" ? "CLEAR" : "ALREADY_CONTACTED";
  const record = await reconcileStoredGtmContact(candidate.target, previous, { priorContactStatus });
  result.reconciled++;
  if (priorContactStatus === "ALREADY_CONTACTED") result.alreadyContacted++;
  if (record.readyForHumanApproval) result.ready++; else result.needsVerification++;
  if (record.verification.verifierStatus === "VERIFIED") result.verified++;
  if (record.verification.verifierStatus === "ACCEPT_ALL") result.acceptAll++;
  if (record.verification.verifierStatus === "RISKY") result.risky++;
  if (record.verification.verifierStatus === "INVALID") result.invalid++;
  if (record.verification.verifierStatus === "VERIFICATION_RESULT_MISSING") result.resultMissing++;
  result.records.push({ organization: candidate.target.organization, email: record.verification.email, verifierStatus: record.verification.verifierStatus, suppressionStatus: record.verification.suppressionStatus, priorContactStatus: record.verification.priorContactStatus, readyToSend: record.verification.readyToSend, blocker: record.verification.readyBlocker });
 }
 return result;
}

function partnerTargets() { return partnerCandidates.map((candidate) => ({ target: { prospectChannel: "PARTNER_ACCOUNTING" as const, organization: candidate.organization, organizationDomain: candidate.domain, domainSourceUrl: candidate.source, person: { firstName: candidate.first, lastName: candidate.last, fullName: candidate.first + " " + candidate.last, currentTitle: candidate.title, titleSourceUrl: candidate.source } }, partnerType: candidate.type, whyFit: candidate.whyFit, source: candidate.source })); }
function directTargets() {
 return initialOpportunities.filter((item) => item.primaryContact?.name && item.primaryContact.title && item.primaryContact.emailKind !== "direct").map((item) => {
  const [first, ...rest] = item.primaryContact!.name.trim().split(/\s+/); const last = rest.at(-1) || "";
  return { target: { prospectChannel: "DIRECT_NONPROFIT" as const, organization: item.organization, organizationDomain: domainFromUrl(item.organizationUrl), domainSourceUrl: item.organizationUrl, person: { firstName: first, lastName: last, fullName: item.primaryContact!.name, currentTitle: item.primaryContact!.title, titleSourceUrl: item.primaryContact!.roleSourceUrl } }, partnerType: "direct nonprofit", whyFit: item.whyNow, source: item.primaryContact!.roleSourceUrl, priority: item.score.pain + item.score.timing + item.score.fit + item.score.value };
 }).filter((candidate) => candidate.target.person.lastName).sort((a, b) => b.priority - a.priority);
}
function present(candidate: { target: EnrichmentTarget; partnerType: string; whyFit: string; source: string }, record: ContactEnrichmentRecord | null) {
 const draft = candidate.target.prospectChannel === "DIRECT_NONPROFIT" ? null : createPartnerShadowDraft({ firstName: candidate.target.person.firstName, organization: candidate.target.organization, partnerType: candidate.partnerType, whySelected: candidate.whyFit });
 return { organization: candidate.target.organization, contact: candidate.target.person.fullName, title: candidate.target.person.currentTitle, email: record?.email || null, status: record?.readiness || "DRY_RUN", source: candidate.source, whyFit: candidate.whyFit, ...(draft ? { subject: draft.subject, personalizedEmail: draft.body } : {}), ...(record?.blockers.length ? { failureReason: record.blockers.join(" ") } : {}) };
}
function domainFromUrl(url: string) { return new URL(url).hostname.replace(/^www\./, ""); }
