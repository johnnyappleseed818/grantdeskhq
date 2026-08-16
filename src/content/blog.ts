export interface BlogSource { title: string; url: string; }
export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  readingMinutes: number;
  resourceCategory: "guide" | "checklist";
  sources: BlogSource[];
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

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
    title: "How to make budget-to-actual grant reporting reviewable",
    description: "A practical workflow for mapping accounting data to approved grant budgets, explaining variances, and preserving evidence for funder reporting.",
    publishedAt: "2026-08-16",
    readingMinutes: 5,
    resourceCategory: "guide",
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
        "GrantDeskHQ helps teams organize their agreement, accounting data, program updates, and supporting evidence into a reviewable post-award workflow. The team remains responsible for review and submission. When you are ready, try one award through the Free First Report flow and see which reporting inputs become easier to assemble." ] }
    ]
  },
  {
    slug: "grant-progress-report-workflow",
    title: "A grant progress report workflow for finance, grants, and program teams",
    description: "Build a reviewable progress-report process that ties the reporting period, financial summary, program results, evidence, and required approvals back to the award.",
    publishedAt: "2026-08-16",
    readingMinutes: 7,
    resourceCategory: "guide",
    sources: [
      { title: "Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards (2 CFR Part 200)", url: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200" },
      { title: "U.S. Department of Health and Human Services grants policy resources", url: "https://www.hhs.gov/grants/grants/grants-policies-regulations/index.html" }
    ],
    sections: [
      { heading: "Define the reporting question before drafting", paragraphs: [
        "A progress report is not a generic update. Begin by identifying the exact reporting period, required form or portal questions, budget structure, metrics, attachments, and due date in the award materials. A funder may request a narrative, a financial report, a performance report, or several separate deliverables. Build the draft around those requirements instead of starting with a reusable narrative that may not answer the right question.",
        "Create a short cover record with the award name and number, reporting period, submitting organization, draft owner, review owner, and current status. This simple control prevents a common source of rework: a correct paragraph or spreadsheet that belongs to the wrong period, version, or award." ] },
      { heading: "Prepare the financial summary from traceable inputs", paragraphs: [
        "Use the approved budget and accounting export as the starting point for the financial portion. Map the ledger data to the funder categories, calculate budget-to-actual amounts, and retain the source export and mapping decisions. If a total needs an allocation, write down the method and the person responsible for confirming it. A reviewer should be able to move from the report total to the calculation and back to the original financial data.",
        "Do not use a narrative explanation to hide a difference that still needs financial review. When there is a material variance, distinguish the confirmed number from the operational explanation and from any approval that may be required under the agreement. The agreement and funder instructions determine how a variance must be addressed." ] },
      { heading: "Pair program results with evidence and context", paragraphs: [
        "Program teams often hold the records needed to explain what happened during the period: service data, attendance records, milestone tracking, participant feedback, deliverables, or approved correspondence. Collect the supporting source alongside the result rather than at the end of the drafting process. The report should make clear which statements are documented and which questions still need a source or an owner response.",
        "Honest context improves a report when it is tied to evidence. If implementation changed, describe the confirmed change, its effect on the period, and the next action. Do not imply funder approval, a compliance conclusion, or a causal explanation unless the relevant source supports it." ] },
      { heading: "Use a human review gate before submission", paragraphs: [
        "A final review is more than proofreading. Check period dates, agreement requirements, totals, category labels, metric definitions, attachments, and any certification or authorized-signature step. Confirm that open questions are resolved or clearly escalated. Preserve the submitted package, review decisions, and source trail so that the next period starts from a reliable record.",
        "GrantDeskHQ prepares a source-linked draft from the agreement, accounting data, program updates, and supporting evidence, while keeping people in control of review and submission. You can try one award through the Free First Report flow without replacing the accounting system." ] }
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
        "GrantDeskHQ helps teams bring award terms, financial data, program updates, and evidence into a reviewable workflow. It does not submit, certify, or approve a report for your organization. Use the Free First Report flow with one award when you want to test how a source-linked draft can support your closeout preparation." ] }
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
        "GrantDeskHQ is designed for the post-award reporting workflow: it turns the agreement, accounting data, program updates, and supporting evidence into a reviewable funder-report draft. It keeps the nonprofit team in control of review and submission. Try one award through the Free First Report flow to evaluate the workflow against your own reporting requirements." ] }
    ]
  }
];

export function findBlogPost(slug: string | undefined) { return BLOG_POSTS.find((post) => post.slug === slug); }
export function blogWordCount(post: BlogPost) { return post.sections.flatMap((section) => section.paragraphs).join(" ").trim().split(/\s+/).filter(Boolean).length; }
