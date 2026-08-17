import type { ProspectChannel } from "../lib/contactEnrichment";

export type PartnerRelationship = "A" | "B" | "C" | "D";

export interface PartnerPipelineCandidate {
  organization: string;
  website: string;
  channel: ProspectChannel;
  partnerFit: number;
  relationship: PartnerRelationship;
  recommendedPerson: string | null;
  currentTitle: string | null;
  sourceUrl: string;
  enrichmentReady: boolean;
  emailStatus: "CONTACT_NOT_ESTABLISHED";
  suppressionStatus: "UNKNOWN";
}

/**
 * Source-backed partner-research snapshot. It is deliberately read-only: the
 * contact-enrichment and human-approval gates remain server-side and no item
 * in this collection authorizes delivery.
 */
export const partnerPipelineSnapshot = {
  generatedAt: "2026-08-17T04:46:22.666Z",
  source: "reports/gtm-fractional-cfo-advisory-queue.md",
  metrics: {
    researched: 50,
    highFit: 20,
    contactIdentified: 10,
    enrichmentReady: 10,
    emailVerified: 0,
    draftReady: 10,
    humanReview: 0,
    approved: 0,
    contacted: 0,
    replies: 0,
    activeConversations: 0,
    activatedPartners: 0,
    customersInfluenced: 0,
    paidCustomersInfluenced: 0,
    arrInfluenced: 0
  },
  candidates: [
    { organization: "The Charity CFO", website: "https://thecharitycfo.com/", channel: "PARTNER_FRACTIONAL_CFO", partnerFit: 10, relationship: "A", recommendedPerson: "Tosha Anderson", currentTitle: "Founder + Managing Partner", sourceUrl: "https://thecharitycfo.com/about-us/leadership-team/", enrichmentReady: true, emailStatus: "CONTACT_NOT_ESTABLISHED", suppressionStatus: "UNKNOWN" },
    { organization: "Kiwi Partners", website: "https://www.kiwipartners.com/", channel: "PARTNER_ACCOUNTING", partnerFit: 10, relationship: "A", recommendedPerson: "Ken Hafner", currentTitle: "Head of Accounting Services", sourceUrl: "https://www.kiwipartners.com/ken-hafner", enrichmentReady: true, emailStatus: "CONTACT_NOT_ESTABLISHED", suppressionStatus: "UNKNOWN" },
    { organization: "Altruic Advisors", website: "https://altruic.com/", channel: "PARTNER_ACCOUNTING", partnerFit: 9, relationship: "A", recommendedPerson: "Ryan Hagan", currentTitle: "Founder & Managing Partner", sourceUrl: "https://altruic.com/ryan-hagan", enrichmentReady: true, emailStatus: "CONTACT_NOT_ESTABLISHED", suppressionStatus: "UNKNOWN" },
    { organization: "JMT Consulting", website: "https://jmtconsulting.com/", channel: "PARTNER_TECH_ADVISOR", partnerFit: 9, relationship: "C", recommendedPerson: "Jacqueline M. Tiso", currentTitle: "Founder & Chief Executive Officer", sourceUrl: "https://jmtconsulting.com/blog/nonprofit-ai-adoption-leadership-capacity-change/", enrichmentReady: true, emailStatus: "CONTACT_NOT_ESTABLISHED", suppressionStatus: "UNKNOWN" },
    { organization: "Snap Advisory", website: "https://www.snapadvisory.com/", channel: "PARTNER_FRACTIONAL_CFO", partnerFit: 9, relationship: "A", recommendedPerson: null, currentTitle: null, sourceUrl: "https://www.snapadvisory.com/nonprofit", enrichmentReady: false, emailStatus: "CONTACT_NOT_ESTABLISHED", suppressionStatus: "UNKNOWN" },
    { organization: "GreenPoint NFP", website: "https://www.greenpointnfp.org/", channel: "PARTNER_ACCOUNTING", partnerFit: 9, relationship: "A", recommendedPerson: null, currentTitle: null, sourceUrl: "https://www.greenpointnfp.org/financial-and-tax/", enrichmentReady: false, emailStatus: "CONTACT_NOT_ESTABLISHED", suppressionStatus: "UNKNOWN" },
    { organization: "NFO Nonprofit Financial Outsourcing", website: "https://www.nfoyourcfo.com/", channel: "PARTNER_FRACTIONAL_CFO", partnerFit: 9, relationship: "A", recommendedPerson: "Scott Kriete", currentTitle: "Chief Executive Officer", sourceUrl: "https://www.nfoyourcfo.com/our-team", enrichmentReady: true, emailStatus: "CONTACT_NOT_ESTABLISHED", suppressionStatus: "UNKNOWN" },
    { organization: "Northpoint CFO Group", website: "https://northpointcfogroup.com/", channel: "PARTNER_FRACTIONAL_CFO", partnerFit: 9, relationship: "A", recommendedPerson: null, currentTitle: null, sourceUrl: "https://northpointcfogroup.com/", enrichmentReady: false, emailStatus: "CONTACT_NOT_ESTABLISHED", suppressionStatus: "UNKNOWN" },
    { organization: "CorePath CFO Advisory", website: "https://www.corepathcfoadvisory.com/", channel: "PARTNER_FRACTIONAL_CFO", partnerFit: 9, relationship: "A", recommendedPerson: null, currentTitle: null, sourceUrl: "https://www.corepathcfoadvisory.com/", enrichmentReady: false, emailStatus: "CONTACT_NOT_ESTABLISHED", suppressionStatus: "UNKNOWN" },
    { organization: "Acclarity", website: "https://acclarity.com/", channel: "PARTNER_ACCOUNTING", partnerFit: 9, relationship: "A", recommendedPerson: null, currentTitle: null, sourceUrl: "https://acclarity.com/industries/nonprofit/", enrichmentReady: false, emailStatus: "CONTACT_NOT_ESTABLISHED", suppressionStatus: "UNKNOWN" }
  ] satisfies PartnerPipelineCandidate[]
} as const;
