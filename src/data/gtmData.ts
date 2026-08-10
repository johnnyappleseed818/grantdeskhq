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
    primaryContact: {
      name: "Maureen Lister",
      title: "Chief Financial Officer",
      email: "info@perkins.org",
      emailKind: "organization_inbox",
      roleSourceUrl: "https://www.perkins.org/team-member/maureen-lister/",
      emailSourceUrl: "https://askhowe.perkins.org/sites/default/files/CVI%20Messaging.pdf",
      verifiedAt: "2026-08-07",
      note: "Perkins does not publish Maureen Lister's direct email. Use the verified organization inbox and address the message to her."
    },
    emailSubject: "Free reporting analysis for Perkins' new federal award",
    draftMessage: "Hi Maureen,\n\nI saw the Department of Education award for the New England Consortium on Deafblindness. New awards often create manual work as finance and program teams translate the agreement, approved budget, program updates, and supporting documentation into the funder's reporting format.\n\nGrantDeskHQ's AI-powered solution prepares a source-linked report draft, flags missing information, and checks material claims against the uploaded evidence. We are offering to analyze a first report at no cost so your team can compare the output with its current process.\n\nWould it be useful if I sent a short overview?\n\nBest,\nEli\nGrantDeskHQ"
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
    primaryContact: {
      name: "Lisa Colón",
      title: "Accounts Manager",
      email: "lmcolon@oceanology.org",
      emailKind: "direct",
      roleSourceUrl: "https://www.oceanology.org/about-us",
      emailSourceUrl: "https://www.oceanology.org/about-us",
      verifiedAt: "2026-08-07",
      note: "Direct email and current role are published together on Project Oceanology's official team page."
    },
    emailSubject: "Free reporting analysis for Project Oceanology's new NOAA award",
    draftMessage: "Hi Lisa,\n\nI noticed the new NOAA award supporting Project Oceanology's vessel, education, and environmental-monitoring work. Bringing the financial activity, program results, supporting evidence, and funder questions into one report can create substantial manual preparation.\n\nGrantDeskHQ's AI-powered solution organizes those sources into a funder-specific draft, highlights missing information, and shows the evidence behind each material statement. We are offering to analyze a first report at no cost so you can judge whether it reduces work for your team.\n\nWould a short overview be useful?\n\nBest,\nEli\nGrantDeskHQ"
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
    primaryContact: {
      name: "Allie Martinez",
      title: "Chief Financial Officer",
      email: "allie.martinez@jasouthflorida.org",
      emailKind: "direct",
      roleSourceUrl: "https://jasouthflorida.org/staff/",
      emailSourceUrl: "https://jasouthflorida.org/staff/",
      verifiedAt: "2026-08-07",
      note: "Direct email is published in the CFO entry on Junior Achievement of South Florida's official staff page."
    },
    emailSubject: "A faster post-award workflow for your grant accounting team",
    draftMessage: "Hi Allie,\n\nYour Grant Accountant posting describes the exact handoff GrantDeskHQ is designed to simplify: approved grant budgets and accounting data flowing into funder-specific financial, narrative, and program reports.\n\nGrantDeskHQ's AI-powered solution assembles the first draft, connects material statements to source evidence, and surfaces missing support before review. It supports the finance team rather than replacing its judgment. We are offering to analyze a first report at no cost so you can compare the result with your current workflow.\n\nWould you be open to a brief look?\n\nBest,\nEli\nGrantDeskHQ"
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
    primaryContact: {
      name: "Nicole Thompson",
      title: "Senior Grants Manager",
      email: "info@sustainablefoodcenter.org",
      emailKind: "organization_inbox",
      roleSourceUrl: "https://sustainablefoodcenter.org/about-us/our-team/",
      emailSourceUrl: "https://sustainablefoodcenter.org/about-us/our-team/",
      verifiedAt: "2026-08-07",
      note: "Sustainable Food Center publishes Nicole Thompson's role and its administration inbox, but not a direct email. Address the message to Nicole."
    },
    emailSubject: "Free analysis of one Sustainable Food Center grant report",
    draftMessage: "Hi Nicole,\n\nI saw Sustainable Food Center's focus on coordinating grant reporting across program, finance, and data teams. That handoff often means rebuilding the same information across spreadsheets, funder templates, and narrative documents.\n\nGrantDeskHQ's AI-powered solution turns the agreement, approved budget, GL export, program update, and supporting evidence into a source-linked report draft. It also identifies missing information and blocks unsupported claims before export. We are offering to analyze a first report at no cost so your team can evaluate the workflow on familiar work.\n\nWould a short overview be helpful?\n\nBest,\nEli\nGrantDeskHQ"
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
    primaryContact: {
      name: "Elaine Macbeth",
      title: "Executive Vice President, Chief Finance and Administration Officer",
      email: "Elaine.Macbeth@RodaleInstitute.org",
      emailKind: "direct",
      roleSourceUrl: "https://rodaleinstitute.org/about/staff/",
      emailSourceUrl: "https://rodaleinstitute.org/wp-content/uploads/Rodale-Institute-BIPOC-micro-grant-evaluation_v2.pdf",
      verifiedAt: "2026-08-07",
      note: "Current finance leadership role and the direct email are published by Rodale Institute on its staff page and grant materials."
    },
    emailSubject: "Reduce manual grant-report preparation at Rodale Institute",
    draftMessage: "Hi Elaine,\n\nI saw Rodale Institute's Grants Accountant posting and its emphasis on reporting, deliverables, timesheets, and supporting-document schedules. Those requirements can leave finance teams repeatedly assembling the same evidence into different funder formats.\n\nGrantDeskHQ's AI-powered solution prepares a source-linked report draft, suggests financial mappings, identifies missing support, and checks narrative claims against the evidence. We are offering to analyze a first report at no cost so your team can decide whether the workflow meaningfully reduces manual preparation.\n\nWould you be open to a brief look?\n\nBest,\nEli\nGrantDeskHQ"
  }
];

export const signalSources = [
  { name: "USAspending federal awards", type: "Grant winners", status: "active", cadence: "Daily", coverage: "U.S. nonprofit grants from $25,000; 90-day window; paginated scan; core, emerging, and adjacent segments", boundary: "Award records establish funding and timing, not reporting pain. Contacts and requirements must be verified separately.", url: "https://api.usaspending.gov/docs/endpoints" },
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
