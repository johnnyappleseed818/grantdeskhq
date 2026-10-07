export interface BlogSource { title: string; url: string; }
export interface BlogPost {
  slug: string;
  title: string;
  /** A search-oriented title may be more descriptive than the on-page H1. */
  seoTitle?: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  readingMinutes: number;
  resourceCategory: "guide" | "checklist";
  sources: BlogSource[];
  sections: Array<{
    heading: string;
    paragraphs: string[];
    links?: Array<{ label: string; href: string }>;
    table?: { headers: string[]; rows: string[][]; caption?: string };
  }>;
}

export const WORKED_EXAMPLE_DOWNLOAD_BASE = "/resources/downloads/grant-report-example";
export const WORKED_EXAMPLE_FINANCIAL_TABLE = {
  caption: "Synthetic example — July 1–September 30, 2026; USD; variance = actual minus budget.",
  headers: ["Category", "Budget", "Actual", "Actual minus budget", "Percentage"],
  rows: [
    ["Personnel", "$36,000", "$32,400", "−$3,600", "−10%"],
    ["Participant support", "$12,000", "$13,800", "$1,800", "15%"],
    ["Travel", "$6,000", "$4,200", "−$1,800", "−30%"],
    ["Supplies", "$6,000", "$4,800", "−$1,200", "−20%"],
    ["Total", "$60,000", "$55,200", "−$4,800", "−8%"]
  ]
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "post-award-grant-reporting-checklist",
    title: "A practical post-award grant reporting checklist for nonprofit finance teams",
    description: "Turn an award agreement, approved budget, accounting export, program update, and evidence into a reviewable grant-reporting workflow.",
    publishedAt: "2026-08-16",
    readingMinutes: 6,
    resourceCategory: "checklist",
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
    title: "Your grant is $4,800 under budget. Why does the report still need approval?",
    seoTitle: "Grant budget vs actual: worked example and free Excel template",
    description: "A $60,000 synthetic grant is under budget overall but 15% over in participant support. Download the Excel workbook, ledger, and reviewable report.",
    publishedAt: "2026-08-16",
    updatedAt: "2026-10-07",
    readingMinutes: 7,
    resourceCategory: "guide",
    sources: [
      { title: "Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards (2 CFR Part 200)", url: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200" },
      { title: "U.S. Department of Health and Human Services grants policy resources", url: "https://www.hhs.gov/grants/grants/grants-policies-regulations/index.html" }
    ],
    sections: [
      { heading: "Synthetic source files for this worked example", paragraphs: [
        "This entire example is synthetic. Its organizations, numbers and grant terms are invented for demonstration. It is an authored example, not a customer result or a recorded product run."
      ], links: [
        { label: "Download the synthetic Excel workbook", href: `${WORKED_EXAMPLE_DOWNLOAD_BASE}/GrantDeskHQ-budget-vs-actual.xlsx` },
        { label: "Download the complete synthetic source packet", href: `${WORKED_EXAMPLE_DOWNLOAD_BASE}/GrantDeskHQ-synthetic-report-kit.zip` }
      ]},
      { heading: "The problem hiding in the total", paragraphs: [
        "The total looks comfortable: a $60,000 budget, $55,200 spent, and $4,800 left against budget. But one category is 15% over its limit. Under the fictional agreement in this example, that overspend needs documented approval—and the approval is missing.",
        "That is the detail a useful grant budget vs actual report should make hard to miss. The period is July 1–September 30, 2026, in USD, and the variance convention is actual minus budget.",
        "Participant support has spent $1.15 for every $1 budgeted. The unused personnel budget does not establish permission to move funds between categories. That permission depends on the agreement and approved changes."
      ], table: WORKED_EXAMPLE_FINANCIAL_TABLE},
      { heading: "Three ledger details change the answer", paragraphs: [
        "The downloadable GL contains 15 rows totaling $57,200. Only 13 rows belong in this report.",
        "SYN-T014 is a $1,200 October expense outside the reporting period. SYN-T015 is an $800 expense assigned to a different grant. SYN-T013 is a $200 supplies refund that must stay negative.",
        "After the exclusions, $57,200 − $1,200 − $800 = $55,200. Retaining excluded rows and their reasons lets a reviewer reproduce the reconciliation."
      ]},
      { heading: "Make the variance rule explicit", paragraphs: [
        "Dollar variance = actual spending − approved period budget. Percentage variance = dollar variance ÷ approved period budget.",
        "Participant support is $1,800, or 15%, over budget. Under these invented terms it needs an approval the packet does not contain. The example requires explanations at an absolute category variance of at least 10%. Personnel is exactly −10%, so it needs an explanation too. Where the budget is zero, mark percentage variance undefined. Real funders may use different rules."
      ]},
      { heading: "Write the note a reviewer needs", paragraphs: [
        "“Participant support was $13,800 against a $12,000 budget, an overspend of $1,800 (15%). The program lead reports higher participant transport assistance needs. The sample agreement requires documented approval at this level. No approval was supplied, so this remains an open item for the grants owner.”",
        "The calculation supplies the amount. The program update supplies the explanation. The evidence register supplies the approval status."
      ]},
      { heading: "Follow the source trail", paragraphs: [
        "Start with Budget vs Actual in the workbook. Inspect Inputs for the budget and dates, then Ledger for included and excluded transactions. The packet intentionally lacks original supporting records, the overspend approval and reviewer sign-offs. The draft flags those gaps."
      ], links: [
        { label: "See the completed quarterly report example", href: "/blog/grant-progress-report-workflow" }
      ]}
    ]
  }
  ,{
    slug: "turn-grant-agreement-into-reporting-plan",
    title: "How to turn a grant agreement into a practical reporting plan",
    description: "Convert award terms into a clear reporting plan that gives finance, grants, and program teams one source-linked way to prepare each deliverable.",
    publishedAt: "2026-08-16",
    readingMinutes: 7,
    resourceCategory: "guide",
    sources: [
      { title: "Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards (2 CFR Part 200)", url: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200" },
      { title: "Grants.gov applicant resources", url: "https://www.grants.gov/applicants/applicant-resources" }
    ],
    sections: [
      { heading: "Start with the agreement, not a generic checklist", paragraphs: [
        "A useful reporting plan begins with the executed agreement, approved budget, amendments, award notices, and funder instructions. These documents define the reporting period, deliverables, deadlines, required metrics, submission method, and any approval or certification steps for one specific award. A general checklist can organize the work, but it cannot replace the terms that govern the grant.",
        "Read the documents as a set. Note each requirement in an obligation register with the exact source location, due date, owner, evidence needed, and current status. Keep a separate question when a requirement is unclear. That is safer than quietly converting an assumption into a task or a report claim. For federal awards, applicable regulations and agency instructions may add requirements, but the award documents remain the working reference for the team." ] },
      { heading: "Translate requirements into a shared workback plan", paragraphs: [
        "For every report, work backward from the external due date to establish internal checkpoints. Give finance time to close or validate the accounting period, program staff time to confirm metrics and qualitative updates, grants staff time to compare the draft against the agreement, and an authorized reviewer time to approve the final package. Record dependencies such as a pending program export, an amendment, a budget revision, or supporting correspondence.",
        "Use precise ownership rather than a shared label such as team. Finance should own the accounting export, category mapping, and numerical review. Program staff should own operational results and supporting records. Grants staff should own agreement interpretation, deliverable completeness, and submission instructions. A reviewer should be able to see what is source-backed, what is awaiting confirmation, and what decision still belongs to a human." ] },
      { heading: "Connect the budget, program update, and evidence trail", paragraphs: [
        "A reporting plan should name the inputs before the deadline is close. Link the approved budget version, ledger or accounting export, program metric source, prior report, and material evidence records to the relevant obligation. When the organization chart of accounts does not line up with a funder category, document the mapping and the basis for any allocation. Leave uncertain mappings open for review rather than forcing a total to fit.",
        "The same approach applies to narrative statements. A claim about activities, outcomes, or a variance needs a source that a reviewer can inspect. If evidence is missing, carry the gap forward as a visible follow-up item. This keeps a working draft useful without suggesting that incomplete information has been verified." ] },
      { heading: "Review the plan before the first deadline", paragraphs: [
        "Run a short readiness review after setup and again before each reporting cycle. Check that the period dates, required questions, attachments, metrics, accounting categories, and approval path still reflect the current agreement. Amendments and funder communications can change what is required, so preserve them with the plan instead of relying on memory or an old spreadsheet.",
        "GrantDeskHQ helps teams organize their agreement, accounting data, program updates, and supporting evidence into a reviewable post-award workflow. The team remains responsible for review and submission. When you are ready, try one award through the Free First Award flow and see which reporting inputs become easier to assemble." ] }
    ]
  },
  {
    slug: "grant-progress-report-workflow",
    title: "A completed quarterly grant report—with the missing approval still visible",
    seoTitle: "Quarterly grant report example: filled draft and source files",
    description: "See a completed synthetic grant-report draft with budget variances, program results, source files, and explicit missing approvals.",
    publishedAt: "2026-08-16",
    updatedAt: "2026-10-07",
    readingMinutes: 7,
    resourceCategory: "guide",
    sources: [
      { title: "Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards (2 CFR Part 200)", url: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200" },
      { title: "U.S. Department of Health and Human Services grants policy resources", url: "https://www.hhs.gov/grants/grants/grants-policies-regulations/index.html" }
    ],
    sections: [
      { heading: "Synthetic source files for this filled draft", paragraphs: [
        "All names, figures, events and terms are synthetic. This is an authored teaching example, not a customer case study or recorded product output."
      ], links: [
        { label: "Download the filled synthetic report packet", href: "${WORKED_EXAMPLE_DOWNLOAD_BASE}/GrantDeskHQ-synthetic-report-kit.zip" },
        { label: "Download the copyable program-update handoff template", href: "${WORKED_EXAMPLE_DOWNLOAD_BASE}/program-update-handoff-template.md" }
      ]},
      { heading: "Start with a result that can be checked", paragraphs: [
        "Organization: Harbor Path Community Services — Synthetic Example. Grant: SYN-2026-001. Period: July 1–September 30, 2026. Status: Draft for review; approval and evidence gaps remain.",
        "The program recorded 108 unique participants against a target of 120, achieving 90% of target. A participant is counted once after attending at least one skills workshop during the period. The sample summary uses nonoverlapping synthetic ID ranges. Underlying participant-level records were not supplied and remain required for review. No verified employment outcomes were supplied, so this report makes no employment outcome claim.",
        "A useful paragraph gives the number, denominator, definition and source limitation. Real monthly counts must account for repeat participants."
      ]},
      { heading: "Put the financial result beside the program result", paragraphs: [
        "The two excluded transactions and negative refund remain visible in the ledger. The detailed calculation is available in the budget-versus-actual worked example."
      ], table: WORKED_EXAMPLE_FINANCIAL_TABLE, links: [
        { label: "See the budget-versus-actual calculation", href: "/blog/budget-to-actual-grant-reporting-workflow" }
      ]},
      { heading: "Explain changes without inventing approval", paragraphs: [
        "The fictional program lead reports a staffing gap, postponed workshops, fewer staff visits, higher transport-assistance needs and deferred supplies purchases. These explanations still need review against supporting records.",
        "Participant support is 15% over budget. The fictional agreement requires documented approval above 10%. No approval was provided."
      ]},
      { heading: "Give unfinished work an owner", paragraphs: [
        "The draft identifies four open items: overspend approval for the grants owner; original financial support for the finance reviewer; participant count support and deduplication for the program reviewer; and final finance and program review sign-offs.",
        "The downloadable report leaves the submitter unassigned and its submission date marked Not submitted. A completed narrative does not establish submission readiness."
      ]},
      { heading: "Make the handoff specific", paragraphs: [
        "Finance supplies the approved budget, period GL, mapping and reviewed calculations. Program staff supply the metric definition, result, source, explanation and proposed next action. The grants owner checks the package against the funder’s dates, form and approval requirements.",
        "Missing information stays missing; it does not become a plausible story."
      ], links: [
        { label: "Open the program-update handoff template", href: "${WORKED_EXAMPLE_DOWNLOAD_BASE}/program-update-handoff-template.md" }
      ]},
      { heading: "Inspect the complete example", paragraphs: [
        "Start with reviewable-quarterly-report.md. Follow its links to the source files. The evidence register distinguishes included summaries from missing primary records. The workbook recalculates the financial example."
      ], links: [
        { label: "Read the reviewable quarterly report", href: "${WORKED_EXAMPLE_DOWNLOAD_BASE}/reviewable-quarterly-report.md" }
      ]}
    ]
  },
  {
    slug: "grant-closeout-checklist",
    title: "Grant closeout checklist: prepare the final report without losing the evidence trail",
    description: "A practical closeout checklist for organizing final reporting, financial reconciliation, evidence, records, and human review around the controlling award terms.",
    publishedAt: "2026-08-16",
    readingMinutes: 7,
    resourceCategory: "checklist",
    sources: [
      { title: "Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards (2 CFR Part 200)", url: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200" },
      { title: "Grants.gov applicant resources", url: "https://www.grants.gov/applicants/applicant-resources" }
    ],
    sections: [
      { heading: "1. Confirm the closeout terms for this award", paragraphs: [
        "Start with the closeout language in the agreement, amendments, agency notices, and funder instructions. Identify every final report, financial reconciliation, deliverable, certification, return-of-funds instruction, record-retention requirement, and deadline. The timeline and submission route can differ across federal, state, local, and foundation awards, so use the terms for the specific award rather than assuming that another funder workflow applies.",
        "Put the external dates and internal review dates on a shared calendar. Name an owner for financial close, program results, document collection, agreement review, and final submission. A closeout task is not complete simply because a draft exists; it is complete when the applicable source requirements, review decisions, and submission records are accounted for." ] },
      { heading: "2. Reconcile the financial position", paragraphs: [
        "Use the approved budget, amendments, and final accounting export to review the grant-level financial position. Keep the mapping from accounts to budget categories, document allocation methods, and identify unresolved charges or explanations. Confirm which transactions belong in the grant period and which question needs a source check. If funds are unspent or a variance is material, consult the award terms before making a conclusion about disposition or approval.",
        "Keep the numbers and the narrative separate until both are reviewed. Finance should validate totals and calculations; program and grants staff can provide factual context for activities, timing, and documentation. Do not state that a cost is allowable, approved, or final unless the organization has the relevant support and reviewer decision." ] },
      { heading: "3. Assemble the final evidence package", paragraphs: [
        "Collect the agreement, amendments, submitted reports, approved budget versions, accounting exports, calculations, program records, required attachments, correspondence, and submission confirmations in an organized package. Link material report claims to the documents that support them. If a required record is absent, make that gap visible and assign it rather than filling the space with an unsupported statement.",
        "Retention requirements can vary. For awards subject to federal requirements, consult the applicable regulation and agency guidance as well as the award itself. Your operational archive should make it possible for a future reviewer to identify the final version, see what changed, and trace material values to their source records." ] },
      { heading: "4. Run the final human review", paragraphs: [
        "Before submission, compare the package to the current award terms line by line: reporting period, required narrative questions, financial fields, metrics, attachments, signatures, certifications, portal instructions, and due date. Record who reviewed the package and what was resolved. This supports continuity and avoids treating a generated draft as an approved submission.",
        "GrantDeskHQ helps teams bring award terms, financial data, program updates, and evidence into a reviewable workflow. It does not submit, certify, or approve a report for your organization. Use the Free First Award flow with one award when you want to test how a source-linked draft can support your closeout preparation." ] }
    ]
  },
  {
    slug: "post-award-grant-management-software",
    title: "What to look for in post-award grant management software",
    description: "A buyer guide for nonprofit teams that need to turn award terms, accounting data, program updates, and evidence into a reliable reporting workflow after funding is received.",
    publishedAt: "2026-08-16",
    readingMinutes: 7,
    resourceCategory: "guide",
    sources: [
      { title: "Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards (2 CFR Part 200)", url: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200" },
      { title: "U.S. Department of Health and Human Services grants policy resources", url: "https://www.hhs.gov/grants/grants/grants-policies-regulations/index.html" }
    ],
    sections: [
      { heading: "Begin with the post-award job to be done", paragraphs: [
        "Grant software covers many different jobs. Some tools focus on grant discovery, prospect research, proposal development, or a broad grants pipeline. A post-award reporting workflow begins after funding is received: understand the agreement, identify obligations, plan reporting work, bring together financial and program inputs, connect evidence, prepare a draft, review it, and complete closeout.",
        "A useful buying process starts by naming the work that currently creates repetitive effort. It may be translating an award agreement into deadlines, mapping a ledger export to a funder budget, gathering program results from several teams, locating support for a narrative claim, or reviewing a report before submission. Do not choose a product based solely on a feature list; test whether it makes that specific handoff more traceable." ] },
      { heading: "Evaluate the evidence and review model", paragraphs: [
        "For reporting work, the critical question is not whether a tool can generate text. Ask whether a reviewer can see the source behind a requirement, number, narrative statement, or open issue. The workflow should keep uncertainty visible, preserve the original inputs, and make it clear when a person must decide. A system that hides unresolved mapping or missing support may create a polished document that is harder to trust.",
        "Look for practical controls: agreement requirements linked to source locations, versioned budgets, traceable financial mappings, visible evidence gaps, role-based review, and a record of submitted output. Ask how the tool handles amendments, changed reporting periods, and an accounting category that does not neatly map to a funder category." ] },
      { heading: "Keep the accounting system as the financial source of truth", paragraphs: [
        "A post-award workflow should make financial reporting easier without asking a nonprofit to replace its accounting system. The accounting records remain the source for posted activity. The reporting layer should help organize a grant-level view, document mappings and explanations, and prepare material for review against the approved budget and award terms.",
        "During an evaluation, use one real award and a safe copy of the associated inputs. Measure the time needed to set up requirements, assemble the first reporting draft, trace a budget-to-actual total, and resolve a missing evidence question. This is more useful than a generic demonstration because it shows whether the product fits the organization workflow and review standards." ] },
      { heading: "Choose a focused workflow when reporting is the urgent need", paragraphs: [
        "A broad platform can be appropriate for organizations that need discovery, applications, portfolio management, and post-award administration in one system. A focused post-award workflow can be a better fit when the immediate need is to prepare accurate, source-linked funder reporting without adding a larger grant-discovery or proposal stack. The right choice depends on the work, team, existing systems, and award complexity.",
        "GrantDeskHQ is designed for the post-award reporting workflow: it turns the agreement, accounting data, program updates, and supporting evidence into a reviewable funder-report draft. It keeps the nonprofit team in control of review and submission. Try one award through the Free First Award flow to evaluate the workflow against your own reporting requirements." ] }
    ]
  }
  ,{
    slug: "funder-report-supporting-evidence-checklist",
    title: "What documents do you need for a funder report? A practical evidence checklist",
    description: "A practical checklist for organizing the agreement, financial support, program records, and review trail behind a funder report.",
    publishedAt: "2026-08-30",
    readingMinutes: 6,
    resourceCategory: "checklist",
    sources: [
      { title: "Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards (2 CFR Part 200)", url: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200" },
      { title: "Grants.gov applicant resources", url: "https://www.grants.gov/applicants/applicant-resources" }
    ],
    sections: [
      { heading: "Start with the controlling reporting requirements", paragraphs: [
        "Begin with the executed award agreement, amendments, approved budget, reporting instructions, and funder template or portal questions. Those materials, not a generic checklist, define the reporting period, required schedules, narrative questions, certifications, attachments, and deadline for the award.",
        "Create a short requirement register with the deliverable, due date, accountable owner, source document, reviewer, and unresolved question. If a requirement is unclear, retain it as an open item for the award owner instead of treating an assumption as a reporting fact."
      ] },
      { heading: "Keep financial support traceable", paragraphs: [
        "Use the accounting export covering the reporting period and map it to the approved grant budget. Preserve the ledger detail, category mapping, calculation, allocation method, and source for each material total. A reviewer should be able to follow a reported figure back to its accounting support without recreating the work from memory.",
        "For a material budget-to-actual variance, keep the confirmed amount separate from the operational explanation and any approval question. The award terms determine whether a variance, amendment, or prior approval needs additional action; a polished sentence is not evidence of approval."
      ] },
      { heading: "Collect program and supporting evidence as work happens", paragraphs: [
        "Program narratives need dated support appropriate to the award: activity logs, attendance exports, deliverables, case-management summaries, evaluation records, or other source material. Keep invoices, payroll support, contracts, correspondence, and approvals with the financial or narrative claim they support.",
        "Do not hide a missing document. A useful draft makes the source-backed statements and the remaining evidence gaps visible, assigns a next owner, and gives the organization time to resolve the gap before final review."
      ] },
      { heading: "Run a human review before submission", paragraphs: [
        "Before submission, compare the completed package with the current award terms: reporting dates, financial categories, metric definitions, required attachments, certifications, amendment conditions, and portal instructions. The person responsible for the award should make the final review and submission decision.",
        "GrantDeskHQ helps teams bring the agreement, accounting data, program updates, and supporting evidence into a source-linked report draft for review. Try the workflow with one real award through the Free First Award flow; your team keeps final review and submission control."
      ] }
    ]
  }
];

export function findBlogPost(slug: string | undefined) { return BLOG_POSTS.find((post) => post.slug === slug); }
export function blogWordCount(post: BlogPost) { return post.sections.flatMap((section) => section.paragraphs).join(" ").trim().split(/\s+/).filter(Boolean).length; }
