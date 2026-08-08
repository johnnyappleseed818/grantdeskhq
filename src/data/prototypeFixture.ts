import type { CompilationResult } from "../types/prototype";

export const prototypeFixture: CompilationResult = {
  reportTitle: "Six-Month Progress Report",
  summary: "The source package supports a six-month funder-report draft. Travel is above the elapsed-period plan and requires explanation; one receipt and one transaction mapping require review.",
  grantProfile: {
    funderName: { value: "Pacific Youth Foundation", confidence: 0.99, source: { sourceName: "Synthetic_Grant_Agreement.pdf", locator: "Page 1", excerpt: "Pacific Youth Foundation" }, status: "verified" },
    grantName: { value: "Youth Access Initiative", confidence: 0.99, source: { sourceName: "Synthetic_Grant_Agreement.pdf", locator: "Page 1", excerpt: "Youth Access Initiative" }, status: "verified" },
    grantId: { value: "PYF-2026-018", confidence: 0.98, source: { sourceName: "Synthetic_Grant_Agreement.pdf", locator: "Page 1", excerpt: "Grant ID: PYF-2026-018" }, status: "verified" },
    grantStartDate: { value: "January 1, 2026", confidence: 0.99, source: { sourceName: "Synthetic_Grant_Agreement.pdf", locator: "Page 1", excerpt: "Grant period: January 1, 2026 through December 31, 2026" }, status: "verified" },
    grantEndDate: { value: "December 31, 2026", confidence: 0.99, source: { sourceName: "Synthetic_Grant_Agreement.pdf", locator: "Page 1", excerpt: "Grant period: January 1, 2026 through December 31, 2026" }, status: "verified" },
    grantType: { value: "Restricted program grant", confidence: 0.96, source: { sourceName: "Synthetic_Grant_Agreement.pdf", locator: "Page 1", excerpt: "Restricted program grant" }, status: "verified" }
  },
  setupConflicts: [],
  inputStatus: [
    { role: "awardAgreement", label: "Award document", available: true, core: true, requiredForCompletion: true, detail: "Available for this report.", actionLabel: "Add award document" },
    { role: "approvedBudget", label: "Approved budget", available: true, core: true, requiredForCompletion: true, detail: "Available for this report.", actionLabel: "Add approved budget" },
    { role: "ledgerExport", label: "Accounting data", available: true, core: true, requiredForCompletion: true, detail: "Available for this report.", actionLabel: "Add accounting data" },
    { role: "funderTemplate", label: "Funder report form", available: false, core: true, requiredForCompletion: false, detail: "Optional unless the funder provides a required form.", actionLabel: "Add funder form" },
    { role: "programUpdate", label: "Program results", available: true, core: true, requiredForCompletion: true, detail: "Available for this report.", actionLabel: "Add program update" },
    { role: "supportingEvidence", label: "Supporting evidence", available: true, core: false, requiredForCompletion: true, detail: "Available for this report.", actionLabel: "Add supporting evidence" }
  ],
  workflow: { readiness: "not_ready", actionRequiredCount: 2, needsReviewCount: 1, missingInputCount: 2 },
  requirements: [
    {
      id: "REQ-001",
      requirement: "Provide a program progress narrative of no more than 200 words.",
      source: { sourceName: "Synthetic_Grant_Agreement.pdf", locator: "Page 4", excerpt: "The six-month progress narrative must not exceed 200 words." },
      confidence: 0.98,
      status: "verified"
    },
    {
      id: "REQ-002",
      requirement: "Explain budget categories varying more than 10% from the elapsed-period plan.",
      source: { sourceName: "Synthetic_Grant_Agreement.pdf", locator: "Page 5", excerpt: "Explain variances greater than ten percent against the elapsed-period spending plan." },
      confidence: 0.97,
      status: "verified"
    }
  ],
  mappings: [
    { transactionId: "TRV-001", date: "2026-02-16", description: "School-site transportation", amount: 3200, suggestedCategory: "Local Travel", confidence: 0.95, rationale: "Memo and account align with the approved travel category.", status: "verified" },
    { transactionId: "TRV-002", date: "2026-04-09", description: "Mileage reimbursement", amount: 3100, suggestedCategory: "Local Travel", confidence: 0.93, rationale: "Mileage is included in the approved local travel budget.", status: "verified" },
    { transactionId: "TRV-003", date: "2026-06-03", description: "Additional school visits", amount: 3500, suggestedCategory: "Local Travel", confidence: 0.89, rationale: "Program update confirms additional school-site visits; receipt remains missing.", status: "review" },
    { transactionId: "UNM-001", date: "2026-06-18", description: "Community Events LLC", amount: 1250, suggestedCategory: "Unmapped", confidence: 0.18, rationale: "The class or grant tag is blank.", status: "blocked" }
  ],
  missingInputs: [
    { id: "MISS-001", question: "Please provide the itemized receipt for transaction TRV-003.", assignedRole: "Program Director", reason: "Travel transactions above $1,000 require an itemized receipt.", status: "open" },
    { id: "MISS-002", question: "Please confirm the appropriate grant category for Community Events LLC.", assignedRole: "Controller", reason: "The ledger row has no class or grant tag.", status: "open" }
  ],
  narrative: [
    {
      id: "NAR-001",
      text: "Hope Community Services served 118 youth during the first six months, reaching 98.3% of its six-month target.",
      evidenceType: "calculation",
      source: { sourceName: "Program Update Form", locator: "Youth served", excerpt: "Confirmed youth served: 118. Six-month target: 120." },
      status: "verified"
    },
    {
      id: "NAR-002",
      text: "Local travel exceeded the six-month spending plan after three approved additional school-site visits and expansion into two schools.",
      evidenceType: "program_response",
      source: { sourceName: "Program Update Form", locator: "Travel update", excerpt: "Three additional school-site visits were approved. The program expanded into two additional schools." },
      status: "verified"
    }
  ],
  qualityChecks: [
    { id: "QC-001", label: "Budget and mapped actual totals reconcile", detail: "$150,000 approved budget; $74,150 mapped actuals.", required: true, status: "passed" },
    { id: "QC-002", label: "All transactions mapped and approved", detail: "UNM-001 remains unmapped.", required: true, status: "review" },
    { id: "QC-003", label: "Required travel receipts attached", detail: "TRV-003 itemized receipt is missing.", required: true, status: "blocked" },
    { id: "QC-004", label: "Narrative statements have source support", detail: "Material statements include citations.", required: true, status: "passed" }
  ],
  validation: {
    evidenceCoveragePercent: 75,
    sourceMatchedItems: 3,
    itemsNeedingReview: 0,
    blockedItems: 1,
    method: "A separate verification pass checks each material output against the uploaded sources. Items without direct support are blocked from export.",
    findings: [
      { id: "VAL-001", itemId: "REQ-001", verdict: "source_matched", reason: "The word limit matches the cited agreement excerpt.", source: { sourceName: "Synthetic_Grant_Agreement.pdf", locator: "Page 4", excerpt: "The six-month progress narrative must not exceed 200 words." } },
      { id: "VAL-002", itemId: "NAR-001", verdict: "source_matched", reason: "Both calculation inputs are present in the program update.", source: { sourceName: "Program Update Form", locator: "Youth served", excerpt: "Confirmed youth served: 118. Six-month target: 120." } },
      { id: "VAL-003", itemId: "TRV-003", verdict: "source_matched", reason: "The program update supports the additional visits; the receipt remains a separate open item.", source: { sourceName: "Program Update Form", locator: "Travel update", excerpt: "Three additional school-site visits were approved." } },
      { id: "VAL-004", itemId: "UNM-001", verdict: "blocked", reason: "No source establishes the appropriate grant category.", source: { sourceName: "General_Ledger_Export.csv", locator: "UNM-001", excerpt: "Class / grant tag: blank" } }
    ]
  },
  warnings: ["This output requires professional review.", "No report has been submitted automatically."],
  generatedAt: "2026-08-05T00:00:00.000Z",
  model: "synthetic-fixture"
};
