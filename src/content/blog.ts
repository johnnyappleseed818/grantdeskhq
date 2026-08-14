export interface BlogSource { title: string; url: string; }
export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  readingMinutes: number;
  sources: BlogSource[];
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "post-award-grant-reporting-checklist",
    title: "A practical post-award grant reporting checklist for nonprofit finance teams",
    description: "Turn an award agreement, approved budget, accounting export, program update, and evidence into a reviewable grant-reporting workflow.",
    publishedAt: "2026-08-18",
    readingMinutes: 6,
    sources: [
      { title: "Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards (2 CFR Part 200)", url: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200" },
      { title: "Grants.gov applicant resources", url: "https://www.grants.gov/applicants/applicant-resources" }
    ],
    sections: [
      { heading: "Start with the controlling documents", paragraphs: [
        "Post-award reporting starts before the first narrative is drafted. Put the executed award agreement, approved budget, amendments, reporting instructions, and submission records in one controlled packet. Those documents, rather than a generic checklist, define the reporting period, required schedules, approval rules, certifications, and deadlines for a particular award.",
        "Create an obligation register that names each required deliverable, the owner, the due date, the source location, and the evidence needed to support it. When a requirement is unclear, record an evidence gap rather than treating an assumption as a fact. This gives finance, grants, and program staff the same starting point."
      ]},
      { heading: "Reconcile money before writing narrative", paragraphs: [
        "A useful grant report connects the approved budget to the accounting export. Map ledger activity to the funder categories, isolate open mapping decisions, and calculate budget-to-actual variances from the underlying records. Keep a separate note for any amendment, prior approval, match requirement, or cost question that needs a source check.",
        "Do not use narrative language to smooth over an unresolved financial issue. A concise variance explanation should identify what changed, why it changed, what evidence supports the explanation, and whether the award terms require further action. That is more reliable than rebuilding the same explanation in every spreadsheet."
      ]},
      { heading: "Build evidence while work happens", paragraphs: [
        "Evidence collection becomes difficult when it is postponed until the deadline. Associate material claims with dated program records, invoice support, payroll allocations, attendance exports, deliverables, or approved correspondence as the work occurs. The goal is not to collect every file; it is to make each material statement reviewable.",
        "Keep missing support visible. A report draft can be useful even when incomplete if it distinguishes source-backed statements from items that still need confirmation. That preserves professional review and gives the team a focused follow-up list."
      ]},
      { heading: "Use a repeatable review gate", paragraphs: [
        "Before submission, compare the draft to the current award terms. Confirm dates, reporting periods, budget categories, required metrics, attachments, and certifications from the primary documents. General guidance can help organize the process, but funder-specific instructions always control.",
        "GrantDeskHQ helps nonprofit teams assemble a source-linked post-award workflow from their own agreement, accounting data, program update, and evidence. You can start self-service with a first report without scheduling a sales call."
      ]}
    ]
  },
  {
    slug: "budget-to-actual-grant-reporting-workflow",
    title: "How to make budget-to-actual grant reporting reviewable",
    description: "A practical workflow for mapping accounting data to approved grant budgets, explaining variances, and preserving evidence for funder reporting.",
    publishedAt: "2026-08-21",
    readingMinutes: 5,
    sources: [
      { title: "Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards (2 CFR Part 200)", url: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200" },
      { title: "U.S. Department of Health and Human Services grants policy resources", url: "https://www.hhs.gov/grants/grants/grants-policies-regulations/index.html" }
    ],
    sections: [
      { heading: "Treat mapping as an explicit decision", paragraphs: [
        "Budget-to-actual reporting is not a copy-and-paste exercise. The approved grant budget and the organization chart of accounts were created for different purposes, so a reviewable report needs a documented mapping between the two. Record the budget category, ledger account, period, amount, evidence reference, and any judgment used in the mapping.",
        "Use stable categories and keep the source export intact. If one accounting account supports more than one grant category, document the allocation method and retain the calculation. If a category cannot be mapped with confidence, leave it open for review instead of forcing it into the closest label."
      ]},
      { heading: "Explain variance without overclaiming", paragraphs: [
        "A good variance explanation describes the operational fact, its financial effect, and the supporting source. It should not invent a cause or imply funder approval that is not documented. Review the award terms for any thresholds, amendment processes, or prior-approval requirements that apply to that specific grant.",
        "Finance and program teams often hold different parts of the explanation. Give each team a clear handoff: finance validates the numbers and calculations, program explains delivery changes and evidence, and grants staff checks the explanation against the award terms and reporting instructions."
      ]},
      { heading: "Create a repeatable closeout trail", paragraphs: [
        "The same mapping and evidence trail helps during closeout, audit preparation, and the next reporting period. Preserve the input export, the approved budget version, calculations, explanation sources, reviewer decisions, and the submitted report package. This makes later questions traceable instead of dependent on memory.",
        "GrantDeskHQ helps teams keep the award terms, budget mapping, accounting data, program narrative, and supporting evidence connected in one source-linked workflow. Start self-service when you are ready to test a real report without a required demo."
      ]}
    ]
  }
];

export function findBlogPost(slug: string | undefined) { return BLOG_POSTS.find((post) => post.slug === slug); }
export function blogWordCount(post: BlogPost) { return post.sections.flatMap((section) => section.paragraphs).join(" ").trim().split(/\s+/).filter(Boolean).length; }
