import { describe, expect, it } from "vitest";
import {
  GTM_MODE,
  MAX_OUTREACH_MESSAGES,
  applyConversionSuppression,
  assessContentQuality,
  buildShadowStatus,
  createBlogTopic,
  createShadowOutreach,
  dedupeShadowLeads,
  scoreShadowLead,
  classifyReply,
  liveOutreachGate,
  type ShadowLead
} from "../lib/gtmShadow";

const provenance = { source: "USAspending", sourceUrl: "https://www.usaspending.gov/award/example", observedAt: "2026-08-14T00:00:00Z", evidence: "Recent federal assistance award with post-award reporting implications.", confidence: "high" as const };
const lead: ShadowLead = {
  id: "lead_example",
  organization: "Example Nonprofit",
  provenance: [provenance],
  score: scoreShadowLead({ activeGrantVolume: 18, institutionalFunding: 15, financeOrGrantsStaffing: 15, reportingComplexity: 18, organizationSize: 10, signalRecency: 12, fit: 12 }),
  contact: { name: "Jordan Finance", title: "Director of Finance", email: "finance@example.org", sourceUrl: "https://example.org/team", confidence: "high" },
  status: "qualified",
  suppressions: [],
  attribution: { lead_id: "lead_example", campaign_id: "awards-2026" }
};

describe("GTM SHADOW mode", () => {
  it("keeps the pipeline permanently SHADOW and drafts at most three source-specific messages", () => {
    expect(GTM_MODE).toBe("SHADOW");
    const drafts = createShadowOutreach(lead);
    expect(drafts).toHaveLength(MAX_OUTREACH_MESSAGES);
    expect(drafts.every((draft) => draft.status === "SHADOW_DRAFT")).toBe(true);
    expect(drafts[0].body).toMatch(/USAspending/);
    expect(drafts[0].body).toMatch(/no sales call/i);
  });

  it("dedupes organization research and suppresses converted contacts immediately", () => {
    expect(dedupeShadowLeads([lead, { ...lead, id: "lead_duplicate" }])).toHaveLength(1);
    const converted = applyConversionSuppression(lead);
    expect(converted.status).toBe("suppressed");
    expect(converted.suppressions).toContain("converted");
    expect(createShadowOutreach(converted)).toEqual([]);
  });

  it("scores lead factors transparently and caps the total at 100", () => {
    expect(lead.score.total).toBe(100);
    expect(lead.score.rationale.join(" ")).toMatch(/reportingComplexity:18\/18/);
  });

  it("classifies replies and keeps the live delivery gate closed", () => {
    expect(classifyReply("Please unsubscribe me")).toBe("unsubscribe");
    expect(classifyReply("I am out of office until Monday")).toBe("out_of_office");
    expect(classifyReply("Could you send details?")).toBe("interested");
    expect(liveOutreachGate({ senderIdentity: "GrantDeskHQ", postalAddress: "1 Main St", unsubscribeUrl: "https://grantdeskhq.com/unsubscribe" })).toMatchObject({ allowed: false });
  });

  it("requires source-backed, substantive, safe articles and schedules the strongest Tuesday topics", () => {
    const topic = createBlogTopic("How to build a post-award reporting checklist", "post-award grant reporting checklist", "post-award reporting", [provenance], { icpRelevance: 20, commercialIntent: 18, searchIntent: 19, freshness: 10, authority: 18, differentiation: 15 });
    const status = buildShadowStatus([lead], [topic], "2026-08-18T12:00:00Z");
    expect(status.outboundEnabled).toBe(false);
    expect(status.scheduledTopics).toHaveLength(1);
    expect(status.publishedArticles).toHaveLength(1);
    expect(status.publishedArticles[0].structuredData["@type"]).toBe("Article");
    const article = {
      title: topic.title,
      slug: topic.slug,
      body: "Practical grant-reporting guidance. ".repeat(30),
      sources: [provenance],
      metaDescription: "A practical source-linked post-award grant reporting checklist for nonprofit finance and grants teams.",
      canonicalUrl: "https://grantdeskhq.com/blog/post-award-reporting-checklist",
      cta: "Start your first GrantDeskHQ report without a sales call."
    };
    expect(assessContentQuality(article)).toEqual({ pass: true, blockers: [] });
    expect(assessContentQuality({ ...article, body: "Guaranteed fully compliant customer example." })).toMatchObject({ pass: false });
  });
});
