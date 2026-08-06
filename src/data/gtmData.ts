import type { GtmOpportunity } from "../lib/gtm";

export const initialOpportunities: GtmOpportunity[] = [
  {
    id: "award-perkins-2026",
    organization: "Perkins School for the Blind",
    organizationUrl: "https://www.perkins.org/",
    signalKind: "grant_award",
    headline: "Federal education grant record detected",
    observedAt: "2026-08-06",
    amount: 493100,
    awardStartDate: "2026-10-01",
    funder: "U.S. Department of Education",
    location: "Massachusetts",
    evidence: [
      {
        id: "usaspending-h326t260001",
        title: "USAspending award H326T260001",
        url: "https://www.usaspending.gov/award/ASST_NON_H326T260001_091/",
        observedAt: "2026-08-06",
        authority: "official",
        excerpt: "New England Consortium on Deafblindness state technical assistance project; award amount $493,100.",
        supports: ["recipient", "amount", "funder", "award start date"]
      }
    ],
    score: { pain: 18, timing: 25, fit: 22, value: 12 },
    entityVerified: true,
    nonprofitVerified: true,
    conflicts: [],
    unknowns: ["The public award record does not specify the funder's report cadence or internal reporting owner."],
    recommendedRoles: ["Chief financial officer", "Controller", "Director of grants"],
    whyNow: "A new federal assistance record creates a timely reason to ask how post-award financial and program reporting will be organized before the grant begins.",
    recommendedAngle: "Offer a free readiness audit of the agreement and reporting requirements; do not imply that the award record proves reporting difficulty.",
    draftMessage: "I saw the new Department of Education award record for the New England Consortium on Deafblindness. If your team is mapping the award requirements into a reporting calendar and evidence checklist, GrantDeskHQ can provide a free, source-linked readiness audit for review."
  },
  {
    id: "award-project-oceanology-2026",
    organization: "Project Oceanology",
    organizationUrl: "https://www.oceanology.org/",
    signalKind: "grant_award",
    headline: "Federal marine-science grant record detected",
    observedAt: "2026-08-06",
    amount: 960000,
    awardStartDate: "2026-10-01",
    funder: "National Oceanic and Atmospheric Administration",
    location: "Connecticut",
    evidence: [
      {
        id: "usaspending-na26nmfx469g0026",
        title: "USAspending award NA26NMFX469G0026",
        url: "https://www.usaspending.gov/award/ASST_NON_NA26NMFX469G0026_013/",
        observedAt: "2026-08-06",
        authority: "official",
        excerpt: "Federal funding supports a research vessel, marine science education, field research, and environmental monitoring; award amount $960,000.",
        supports: ["recipient", "amount", "funder", "program scope", "award start date"]
      }
    ],
    score: { pain: 20, timing: 25, fit: 22, value: 17 },
    entityVerified: true,
    nonprofitVerified: true,
    conflicts: [],
    unknowns: ["Reporting requirements and finance contacts must be verified before outreach."],
    recommendedRoles: ["Chief financial officer", "Finance director", "Grants manager"],
    whyNow: "The new award combines financial activity with measurable education and monitoring outcomes, making a reporting-readiness review potentially useful.",
    recommendedAngle: "Lead with organizing financial and program evidence around the funder's exact requirements.",
    draftMessage: "I noticed the new NOAA award record supporting Project Oceanology's vessel, education, and monitoring work. GrantDeskHQ can turn the award requirements and approved budget into a free reporting-readiness checklist so finance and program teams know what evidence to collect from the start."
  },
  {
    id: "job-ja-south-florida-2026",
    organization: "Junior Achievement of South Florida",
    organizationUrl: "https://www.jasouthflorida.org/",
    signalKind: "job_posting",
    headline: "Hiring a Grant Accountant for the post-award lifecycle",
    observedAt: "2026-08-06",
    location: "Florida",
    evidence: [
      {
        id: "job-ja-paylocity",
        title: "Grant Accountant job posting",
        url: "https://recruiting.paylocity.com/recruiting/jobs/Details/4290195/Junior-Achievement-South-Florida/Grant-Accountant",
        observedAt: "2026-08-06",
        authority: "employer",
        excerpt: "The role owns the post-award financial lifecycle and provides financial information for funder-specific narrative and program reporting templates.",
        supports: ["active hiring", "post-award workflow", "funder-specific reporting", "buyer path"]
      },
      {
        id: "org-ja-official",
        title: "Junior Achievement of South Florida",
        url: "https://www.jasouthflorida.org/",
        observedAt: "2026-08-06",
        authority: "official",
        excerpt: "Official organization website used to corroborate the employer identity; no workflow claim is inferred from this source.",
        supports: ["organization identity"]
      }
    ],
    score: { pain: 30, timing: 25, fit: 25, value: 16 },
    entityVerified: true,
    nonprofitVerified: true,
    conflicts: [],
    unknowns: ["The posting indicates need but does not prove dissatisfaction with current software."],
    recommendedRoles: ["Chief financial officer", "Senior grants manager"],
    whyNow: "The organization is publicly investing in a role that connects grant accounting, reporting templates, Excel, compliance, and process improvement.",
    recommendedAngle: "Position GrantDeskHQ as workflow support for the new hire—not as a replacement for the finance team.",
    draftMessage: "Your Grant Accountant posting describes the exact handoff GrantDeskHQ is built to simplify: grant budgets and accounting data flowing into funder-specific financial, narrative, and program reports. I would be glad to prepare a free readiness audit using one redacted agreement so your team can evaluate the workflow before considering software."
  },
  {
    id: "job-sustainable-food-center-2026",
    organization: "Sustainable Food Center",
    organizationUrl: "https://sustainablefoodcenter.org/",
    signalKind: "job_posting",
    headline: "Hiring a Grants Manager to coordinate reporting across teams",
    observedAt: "2026-08-06",
    location: "Texas",
    evidence: [
      {
        id: "job-sfc-wgu",
        title: "Sustainable Food Center Grants Manager posting",
        url: "https://careers.wgu.edu/jobs/sustainable-food-center-grants-manager/",
        observedAt: "2026-08-06",
        authority: "professional",
        excerpt: "The role coordinates reporting processes across program, finance, and data staff and manages funder portals and records.",
        supports: ["active hiring", "cross-team reporting", "funder portals"]
      },
      {
        id: "org-sfc-official",
        title: "Sustainable Food Center",
        url: "https://sustainablefoodcenter.org/",
        observedAt: "2026-08-06",
        authority: "official",
        excerpt: "Official organization website used to corroborate the organization identity.",
        supports: ["organization identity"]
      }
    ],
    score: { pain: 27, timing: 25, fit: 24, value: 14 },
    entityVerified: true,
    nonprofitVerified: true,
    conflicts: [],
    unknowns: ["The employer-controlled source for the open role should be confirmed before contact."],
    recommendedRoles: ["Director of grants", "Finance director"],
    whyNow: "A current role explicitly coordinates reporting across grants, finance, program data, records, and funder portals.",
    recommendedAngle: "Offer a source-linked workflow assessment that the incoming grants manager can use as an operating baseline.",
    draftMessage: "I saw that Sustainable Food Center is hiring a Grants Manager to coordinate reporting across program, finance, and data teams. GrantDeskHQ is focused on that post-award handoff—turning the agreement, approved budget, GL export, and program update into a source-linked report draft for professional review."
  },
  {
    id: "job-rodale-2026",
    organization: "Rodale Institute",
    organizationUrl: "https://rodaleinstitute.org/",
    signalKind: "job_posting",
    headline: "Hiring a Grants Accountant reporting to the CFO",
    observedAt: "2026-08-06",
    location: "Pennsylvania",
    evidence: [
      {
        id: "job-rodale-official",
        title: "Rodale Institute Grants Accountant posting",
        url: "https://rodaleinstitute.org/employment/grants-accountant/",
        observedAt: "2026-08-06",
        authority: "employer",
        excerpt: "The role reports to the CFO and includes grant reporting, deliverable monitoring, financial reports, timesheets, and document schedules.",
        supports: ["active hiring", "grant reporting", "supporting evidence", "buyer path"]
      }
    ],
    score: { pain: 27, timing: 25, fit: 25, value: 14 },
    entityVerified: true,
    nonprofitVerified: true,
    conflicts: [],
    unknowns: ["One current employer source is attached; confirm that the vacancy remains open."],
    recommendedRoles: ["Chief financial officer"],
    whyNow: "The organization is assigning grant reporting and evidence responsibilities to a new finance role that reports directly to the CFO.",
    recommendedAngle: "Show how the tool reduces repeat report assembly while preserving the new accountant's review authority.",
    draftMessage: "I saw Rodale Institute's Grants Accountant posting and the emphasis on reporting, deliverables, timesheets, and support schedules. GrantDeskHQ can assemble those approved sources around each funder's reporting format, with citations and review gates, so the finance team spends less time rebuilding the package manually."
  }
];

export const signalSources = [
  { name: "USAspending federal awards", type: "Grant winners", status: "active", cadence: "Daily", coverage: "U.S. federal assistance awards; nonprofit recipient filter", boundary: "Award records do not prove reporting pain. Requirements must be verified from the agreement.", url: "https://api.usaspending.gov/docs/endpoints" },
  { name: "Nonprofit job postings", type: "Hiring", status: "review", cadence: "Daily queue", coverage: "Employer career pages and permissioned job feeds", boundary: "No broad scraping. Closed roles and mirrored listings require confirmation.", url: "https://grantdeskhq.com/gtm" },
  { name: "Reddit nonprofit discussions", type: "Pain research", status: "active", cadence: "Daily indexed-web check", coverage: "Recent public search results plus 10 previously reviewed threads", boundary: "Search-result discovery only. No Reddit page crawling, posting, commenting, messaging, or contact discovery.", url: "https://www.redditinc.com/policies/data-api-terms" },
  { name: "LinkedIn public discussions", type: "Social", status: "active", cadence: "Daily indexed-web check", coverage: "Recent public post results plus 5 reviewed posts and 3 professional communities", boundary: "Search-result discovery only. No profile scraping, automated messaging, commenting, or engagement.", url: "https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions" },
  { name: "Web pain search", type: "Excel pain", status: "configuration", cadence: "Not scheduled", coverage: "Forums, associations, blogs, public documents, and job descriptions", boundary: "Requires a permissioned search API; anonymous pain remains market evidence until an organization is resolved.", url: "https://grantdeskhq.com/gtm" },
  { name: "Competitor-intent search", type: "Competitor", status: "active", cadence: "Daily social subset", coverage: "Recent Reddit and LinkedIn mentions of Instrumentl, Fluxx, Foundant, Blackbaud, Submittable, and Salesforce", boundary: "Anonymous or unresolved mentions remain research signals and cannot become outreach leads.", url: "https://grantdeskhq.com/gtm" }
] as const;

export const referralChannels = [
  { name: "Nonprofit accounting and fractional-CFO firms", offer: "A co-branded Grant Reporting Health Check for each nonprofit client", value: "One trusted finance relationship can introduce the workflow across a portfolio without replacing the firm's services.", status: "design partner list", nextAction: "Identify 10 firms with visible nonprofit grant-reporting work and review each partner fit." },
  { name: "Grant consultants and grant writers", offer: "A post-award readiness handoff after the award is won", value: "Consultants help clients win the grant; GrantDeskHQ helps organize what must happen after the award.", status: "message ready", nextAction: "Draft a transparent referral proposal with no unverified fee or partner claims." },
  { name: "Professional communities", offer: "Educational reporting-readiness checklist", value: "Useful, non-promotional guidance can reveal real workflow language before a sales conversation.", status: "manual engagement", nextAction: "Review current discussions in GPA, ANAFP, and Nonprofit Financial Commons before contributing." }
] as const;
