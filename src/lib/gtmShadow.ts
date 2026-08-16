import { FREE_FIRST_AWARD_CTA, INTRODUCTORY_GROWTH_OFFER } from "./contactEnrichment.ts";

export const GTM_MODE = "SHADOW" as const;
export const SOCIAL_RESEARCH_MODE = "MANUAL_REVIEW_ONLY" as const;
export const CONTENT_PUBLICATION_MODE = "HUMAN_REVIEW_REQUIRED" as const;
export const DEFAULT_CONTENT_SCHEDULE_DAYS = [2, 4] as const;
export const MAX_OUTREACH_MESSAGES = 3;
export const REQUIRED_ATTRIBUTION_FIELDS = ["lead_id", "campaign_id", "utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;

export interface SignalProvenance {
  source: string;
  sourceUrl: string;
  observedAt: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

export interface LeadScoreInput {
  activeGrantVolume: number;
  institutionalFunding: number;
  financeOrGrantsStaffing: number;
  reportingComplexity: number;
  organizationSize: number;
  signalRecency: number;
  fit: number;
}

export interface ExplainableLeadScore { total: number; factors: Record<keyof LeadScoreInput, number>; rationale: string[]; }
export interface ShadowLead {
  id: string;
  organization: string;
  organizationUrl?: string;
  provenance: SignalProvenance[];
  score: ExplainableLeadScore;
  contact?: { name: string; title: string; email?: string; sourceUrl: string; confidence: "high" | "medium" | "low"; };
  status: "research" | "qualified" | "drafted" | "suppressed";
  suppressions: Array<"unsubscribe" | "bounce" | "complaint" | "converted" | "do_not_contact">;
  attribution: Partial<Record<(typeof REQUIRED_ATTRIBUTION_FIELDS)[number], string>>;
}

export interface OutreachDraft { sequence: number; subject: string; body: string; status: "SHADOW_DRAFT"; }
export interface BlogTopic { id: string; title: string; slug: string; query: string; cluster: string; score: number; sources: SignalProvenance[]; status: "candidate" | "scheduled" | "blocked"; }
export interface BlogArticleDraft { title: string; slug: string; body: string; sources: SignalProvenance[]; metaDescription: string; canonicalUrl: string; cta: string; }
export interface ContentQualityResult { pass: boolean; blockers: string[]; }
export interface ShadowPipelineStatus { mode: typeof GTM_MODE; generatedAt: string; leadCount: number; qualifiedCount: number; suppressedCount: number; draftCount: number; scheduledTopics: BlogTopic[]; preparedArticles: PreparedArticle[]; outboundEnabled: false; automaticPublicationEnabled: false; socialResearchMode: typeof SOCIAL_RESEARCH_MODE; }

const caps: LeadScoreInput = { activeGrantVolume: 18, institutionalFunding: 15, financeOrGrantsStaffing: 15, reportingComplexity: 18, organizationSize: 10, signalRecency: 12, fit: 12 };

export function scoreShadowLead(input: LeadScoreInput): ExplainableLeadScore {
  const factors = Object.fromEntries(Object.entries(caps).map(([key, cap]) => [key, Math.max(0, Math.min(cap, Math.round(Number(input[key as keyof LeadScoreInput]) || 0)))])) as Record<keyof LeadScoreInput, number>;
  const total = Object.values(factors).reduce((sum, value) => sum + value, 0);
  const rationale = Object.entries(factors).filter(([, value]) => value > 0).map(([key, value]) => key + ":" + value + "/" + caps[key as keyof LeadScoreInput]);
  return { total, factors, rationale };
}

export function shadowLeadId(organization: string, sourceUrl: string) {
  return ("lead_" + normalize(organization) + "_" + normalize(sourceUrl).slice(-24)).slice(0, 120);
}

export function dedupeShadowLeads(leads: ShadowLead[]) {
  const seen = new Set<string>();
  return leads.filter((lead) => {
    const key = normalize(lead.organization);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isSuppressed(lead: Pick<ShadowLead, "suppressions">) { return lead.suppressions.length > 0; }

export function applyConversionSuppression(lead: ShadowLead): ShadowLead {
  return { ...lead, status: "suppressed", suppressions: lead.suppressions.includes("converted") ? lead.suppressions : [...lead.suppressions, "converted"] };
}

export function createShadowOutreach(lead: ShadowLead): OutreachDraft[] {
  if (isSuppressed(lead) || !lead.contact?.name || !lead.contact.email || lead.contact.confidence !== "high" || !lead.provenance.length) return [];
  const signal = lead.provenance[0];
  const firstName = lead.contact.name.split(/\s+/)[0];
  const base = "Hi " + firstName + ",\n\nWe built GrantDeskHQ to take repetitive post-award reporting work off nonprofit finance and grants teams. Our AI-powered workflow turns the grant agreement, accounting data, program updates, and supporting evidence into a reviewable funder-report draft, while your team keeps control of review and submission.\n\nI saw " + lead.organization + " through " + signal.source + ": " + signal.evidence + "\n\n" + INTRODUCTORY_GROWTH_OFFER + " " + FREE_FIRST_AWARD_CTA + "\n\nBest,\nEli";
  return [1, 2, 3].map((sequence) => ({
    sequence,
    subject: sequence === 1 ? "A source-linked grant reporting workflow for " + lead.organization : "Following up on " + lead.organization + " reporting workflow",
    body: sequence === 1 ? base : base + "\n\nThis is message " + sequence + " of a maximum three-message sequence.",
    status: "SHADOW_DRAFT" as const
  }));
}

export function scoreBlogTopic(input: { icpRelevance: number; commercialIntent: number; searchIntent: number; freshness: number; authority: number; differentiation: number; sources: SignalProvenance[] }) {
  const base = [input.icpRelevance, input.commercialIntent, input.searchIntent, input.freshness, input.authority, input.differentiation].reduce((sum, value) => sum + Math.max(0, Math.min(20, Math.round(value))), 0);
  return input.sources.some((source) => validSource(source)) ? base : 0;
}

export function createBlogTopic(title: string, query: string, cluster: string, sources: SignalProvenance[], scoreInputs: Omit<Parameters<typeof scoreBlogTopic>[0], "sources">): BlogTopic {
  const score = scoreBlogTopic({ ...scoreInputs, sources });
  return { id: "topic_" + normalize(title).slice(0, 64), title, slug: normalize(title).slice(0, 80), query, cluster, score, sources, status: score >= 65 ? "candidate" : "blocked" };
}

export function dedupeBlogTopics(topics: BlogTopic[]) {
  const seen = new Set<string>();
  return topics.filter((topic) => {
    const key = normalize(topic.slug || topic.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function scheduleEligibleTopics(topics: BlogTopic[], date = new Date(), publishingDays: readonly number[] = DEFAULT_CONTENT_SCHEDULE_DAYS): BlogTopic[] {
  const day = date.getUTCDay();
  if (!publishingDays.includes(day)) return [];
  return dedupeBlogTopics(topics).filter((topic) => topic.status === "candidate").sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 2).map((topic) => ({ ...topic, status: "scheduled" }));
}

export function assessContentQuality(article: BlogArticleDraft): ContentQualityResult {
  const blockers: string[] = [];
  if (article.body.trim().length < 700) blockers.push("Article is not substantive enough.");
  if (!article.metaDescription.trim() || article.metaDescription.length > 160) blockers.push("A concise meta description is required.");
  if (!article.canonicalUrl.startsWith("https://grantdeskhq.com/")) blockers.push("A GrantDeskHQ canonical URL is required.");
  if (!article.cta.includes("GrantDeskHQ")) blockers.push("A clear GrantDeskHQ self-service CTA is required.");
  if (!article.sources.length || article.sources.some((source) => !validSource(source))) blockers.push("Every article needs valid, source-linked evidence for time-sensitive claims.");
  if (/guaranteed|fully compliant|always compliant|legal advice|customer example/i.test(article.body)) blockers.push("Article contains unsupported compliance, guarantee, legal, or customer-example language.");
  return { pass: blockers.length === 0, blockers };
}

export function buildShadowStatus(leads: ShadowLead[], topics: BlogTopic[], generatedAt = new Date().toISOString()): ShadowPipelineStatus {
  const unique = dedupeShadowLeads(leads);
  const scheduledTopics = scheduleEligibleTopics(topics, new Date(generatedAt));
  return { mode: GTM_MODE, generatedAt, leadCount: unique.length, qualifiedCount: unique.filter((lead) => lead.status === "qualified" || lead.status === "drafted").length, suppressedCount: unique.filter(isSuppressed).length, draftCount: unique.filter((lead) => createShadowOutreach(lead).length > 0).length, scheduledTopics, preparedArticles: prepareScheduledTopics(topics, generatedAt), outboundEnabled: false, automaticPublicationEnabled: false, socialResearchMode: SOCIAL_RESEARCH_MODE };
}

function validSource(source: SignalProvenance) { return Boolean(source.source.trim() && source.evidence.trim() && /^https:\/\//.test(source.sourceUrl) && !Number.isNaN(Date.parse(source.observedAt))); }
function normalize(value: string) { return value.toLowerCase().trim().replace(/https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

export function shadowLeadFromOpportunity(opportunity: import("./gtm").GtmOpportunity): ShadowLead {
  const provenance = opportunity.evidence.map((evidence) => ({
    source: evidence.title,
    sourceUrl: evidence.url,
    observedAt: evidence.observedAt,
    evidence: evidence.excerpt,
    confidence: evidence.authority === "official" || evidence.authority === "employer" ? "high" as const : "medium" as const
  }));
  const amount = opportunity.amount || 0;
  const score = scoreShadowLead({
    activeGrantVolume: amount >= 500000 ? 18 : amount >= 100000 ? 12 : 6,
    institutionalFunding: opportunity.signalKind === "grant_award" ? 15 : 6,
    financeOrGrantsStaffing: opportunity.signalKind === "job_posting" ? 15 : 5,
    reportingComplexity: Math.min(18, 6 + (opportunity.fitSignals?.length || 0) * 3),
    organizationSize: opportunity.targetTier === "core" ? 10 : opportunity.targetTier === "emerging" ? 6 : 4,
    signalRecency: 12,
    fit: opportunity.targetTier === "core" ? 12 : opportunity.targetTier === "emerging" ? 8 : 4
  });
  return {
    id: shadowLeadId(opportunity.organization, provenance[0]?.sourceUrl || opportunity.id),
    organization: opportunity.organization,
    organizationUrl: opportunity.organizationUrl,
    provenance,
    score,
    contact: opportunity.primaryContact ? {
      name: opportunity.primaryContact.name,
      title: opportunity.primaryContact.title,
      email: opportunity.primaryContact.email,
      sourceUrl: opportunity.primaryContact.emailSourceUrl,
      confidence: opportunity.primaryContact.emailKind === "direct" ? "high" : "medium"
    } : undefined,
    status: opportunity.entityVerified && opportunity.nonprofitVerified ? "qualified" : "research",
    suppressions: [],
    attribution: {}
  };
}

export function suggestedTopicsFromLeads(leads: ShadowLead[]): BlogTopic[] {
  return leads.flatMap((lead) => lead.provenance.slice(0, 1).map((source) => createBlogTopic(
    "Post-award reporting checklist for nonprofit finance teams",
    "post-award grant reporting checklist",
    "post-award reporting",
    [source],
    { icpRelevance: 20, commercialIntent: 18, searchIntent: 19, freshness: 12, authority: source.confidence === "high" ? 18 : 10, differentiation: 15 }
  ))).filter((topic, index, all) => all.findIndex((candidate) => candidate.id === topic.id) === index);
}

export type ReplyClassification = "interested" | "question" | "not_now" | "unsubscribe" | "wrong_person" | "referral" | "objection" | "out_of_office" | "negative" | "unknown";

export function classifyReply(text: string): ReplyClassification {
  const value = text.toLowerCase();
  if (/\b(unsubscribe|remove me|do not contact)\b/.test(value)) return "unsubscribe";
  if (/\b(out of office|automatic reply|away until)\b/.test(value)) return "out_of_office";
  if (/\b(wrong person|not the right person)\b/.test(value)) return "wrong_person";
  if (/\btry|contact|speak with\b/.test(value) && /\b(instead|our|the)\b/.test(value)) return "referral";
  if (/\binterested|let's talk|lets talk|send details|would be useful\b/.test(value)) return "interested";
  if (/\bhow|what|when|where|can you\b/.test(value)) return "question";
  if (/\bnot now|later|next quarter|circle back\b/.test(value)) return "not_now";
  if (/\btoo expensive|already use|not a fit|budget\b/.test(value)) return "objection";
  if (/\bno thanks|not interested|stop\b/.test(value)) return "negative";
  return "unknown";
}

export function liveOutreachGate(configuration: { senderIdentity?: string; postalAddress?: string; unsubscribeUrl?: string }) {
  const blockers = ["GTM_MODE is SHADOW; no autonomous outbound delivery is permitted."];
  if (!configuration.senderIdentity?.trim()) blockers.push("Truthful sender identity is not configured.");
  if (!configuration.postalAddress?.trim()) blockers.push("Postal address is not configured.");
  if (!configuration.unsubscribeUrl?.startsWith("https://")) blockers.push("A working HTTPS unsubscribe URL is not configured.");
  return { allowed: false as const, blockers };
}

export function contentPublicationGate() {
  return {
    allowed: false as const,
    blockers: ["Content remains a source-linked SHADOW draft until a human approves publication.", "Automatic public publication is disabled."]
  };
}

export interface PreparedArticle {
  title: string;
  slug: string;
  status: "SHADOW_DRAFT_REQUIRES_REVIEW";
  publishedAt: string;
  metaDescription: string;
  canonicalUrl: string;
  structuredData: { "@context": "https://schema.org"; "@type": "Article"; headline: string; mainEntityOfPage: string; };
  sources: SignalProvenance[];
}

export function generateArticleDraft(topic: BlogTopic): BlogArticleDraft {
  const sourceLine = topic.sources.map((source) => source.source + " (" + source.sourceUrl + ")").join("; ");
  const body = [
    "Post-award reporting becomes manageable when a nonprofit converts the award agreement into an operating checklist before the first reporting deadline. This article provides general workflow guidance; each funder agreement, approved budget, and reporting portal remains the controlling source.",
    "Start with a single source-of-truth packet. Keep the executed award document, approved budget, amendments, reporting instructions, prior submissions, accounting export, program update, and supporting evidence together. Assign an owner for every required financial schedule, narrative response, outcome metric, certification, and attachment. Record both the evidence needed and the person responsible for producing it.",
    "Reconcile the financial view before drafting narrative. Map the general ledger to the approved budget categories, document any open mapping decisions, and separate a variance explanation from a variance approval. When finance and program teams disagree, preserve the source, the calculation, and the unresolved question instead of smoothing it over in a draft.",
    "Build an evidence trail as work happens. A report is stronger when each material statement can point to a dated program record, ledger detail, invoice, payroll allocation, attendance export, deliverable, or approved correspondence. Missing evidence should be visible as a follow-up task, not silently converted into an optimistic narrative.",
    "Review the draft against the actual award terms before submission. Confirm periods, deadlines, budgets, match requirements, allowable-cost restrictions, amendment conditions, and certifications from the primary documents. General guidance cannot replace funder-specific instructions.",
    "GrantDeskHQ helps teams organize source-linked post-award reporting and identify incomplete inputs before export. Start self-service with GrantDeskHQ when you are ready to test the workflow on a real report.",
    "Topic research sources: " + sourceLine
  ].join("\n\n");
  return {
    title: topic.title,
    slug: topic.slug,
    body,
    sources: topic.sources,
    metaDescription: "Practical, source-linked post-award reporting workflow guidance for nonprofit finance and grants teams.",
    canonicalUrl: "https://grantdeskhq.com/blog/" + topic.slug,
    cta: "Start your first GrantDeskHQ report without a sales call."
  };
}

export function prepareScheduledTopics(topics: BlogTopic[], preparedAt = new Date().toISOString()): PreparedArticle[] {
  return scheduleEligibleTopics(topics, new Date(preparedAt)).flatMap((topic) => {
    const article = generateArticleDraft(topic);
    const quality = assessContentQuality(article);
    return quality.pass ? [{
      title: article.title,
      slug: article.slug,
      status: "SHADOW_DRAFT_REQUIRES_REVIEW" as const,
      publishedAt: preparedAt,
      metaDescription: article.metaDescription,
      canonicalUrl: article.canonicalUrl,
      structuredData: { "@context": "https://schema.org", "@type": "Article", headline: article.title, mainEntityOfPage: article.canonicalUrl },
      sources: article.sources
    }] : [];
  });
}
