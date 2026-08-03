import rawData from "./grantData.json";

export const budgetCategoryNames = [
  "Personnel",
  "Program Supplies",
  "Local Travel",
  "Indirect Overhead"
] as const;

export type BudgetCategoryName = (typeof budgetCategoryNames)[number];
export type MappingConfidence = "High" | "Medium" | "Low" | "Unmapped";
export type MappingReviewStatus = "Suggested" | "Approved" | "Changed" | "Unresolved";

export interface BudgetLine {
  category: BudgetCategoryName;
  annualBudget: number;
}

export interface Transaction {
  id: string;
  date: string;
  vendorMemo: string;
  glAccount: string;
  amount: number;
  suggestedCategory: BudgetCategoryName | null;
  confidence: MappingConfidence;
  evidence: string;
  reviewStatus: MappingReviewStatus;
  grantTag: string;
  receiptStatus: "Attached" | "Missing" | "Not applicable";
}

export interface GrantData {
  agency: string;
  client: string;
  funder: string;
  grantName: string;
  grantAmount: number;
  grantPeriod: string;
  reportName: string;
  reportingPeriod: string;
  elapsedTime: number;
  budget: BudgetLine[];
  transactions: Transaction[];
}

export const grantData = rawData as GrantData;
export const { budget, transactions } = grantData;

export interface SourceFile {
  name: string;
  kind: string;
  detail: string;
  size: string;
  status: "Processed" | "Review needed";
}

export const sourceFiles: SourceFile[] = [
  { name: "PYF_Youth_Access_Grant_Agreement.pdf", kind: "Grant agreement", detail: "14 pages", size: "1.8 MB", status: "Processed" },
  { name: "Approved_Grant_Budget.xlsx", kind: "Approved budget", detail: "3 worksheets", size: "84 KB", status: "Processed" },
  { name: "General_Ledger_Export_Jan-Jun_2026.csv", kind: "General ledger", detail: "20 transactions", size: "12 KB", status: "Processed" },
  { name: "Six_Month_Funder_Report_Template.docx", kind: "Blank funder template", detail: "6 pages", size: "96 KB", status: "Processed" },
  { name: "Program_Update_Form_June_2026", kind: "Structured program update", detail: "5 responses", size: "In-app", status: "Processed" },
  { name: "Supporting_Receipt_Schedule.pdf", kind: "Receipt schedule", detail: "3 travel entries", size: "540 KB", status: "Review needed" }
];

export interface ExtractedRule {
  id: string;
  title: string;
  source: string;
  page: string;
  excerpt: string;
  confidence: number;
  reviewStatus: "Reviewed" | "Needs review";
}

export const extractedRules: ExtractedRule[] = [
  { id: "award", title: "Total award: $150,000", source: "Grant Agreement", page: "Page 2", excerpt: "The Foundation awards Hope Community Services an amount not to exceed $150,000 for the Youth Access Initiative.", confidence: 99, reviewStatus: "Reviewed" },
  { id: "budget", title: "Approved category limits", source: "Approved Grant Budget", page: "Worksheet 1", excerpt: "Personnel $90,000; Program Supplies $35,000; Local Travel $15,000; Indirect Overhead $10,000.", confidence: 100, reviewStatus: "Reviewed" },
  { id: "travel", title: "Travel documentation above $1,000", source: "Grant Agreement", page: "Page 8", excerpt: "Each local-travel transaction above $1,000 must include an itemized receipt and written justification.", confidence: 98, reviewStatus: "Reviewed" },
  { id: "variance", title: "Explain variances greater than 10%", source: "Funder Report Template", page: "Page 4", excerpt: "Explain each budget category varying by more than ten percent from the elapsed-period spending plan.", confidence: 97, reviewStatus: "Reviewed" },
  { id: "narrative", title: "Six-month narrative: 200 words maximum", source: "Funder Report Template", page: "Page 2", excerpt: "Summarize progress during the reporting period. Maximum response length: 200 words.", confidence: 99, reviewStatus: "Reviewed" },
  { id: "youth", title: "Report number of youth served", source: "Funder Report Template", page: "Page 3", excerpt: "Enter the unduplicated number of youth served during this reporting period.", confidence: 99, reviewStatus: "Reviewed" },
  { id: "certification", title: "Signed certification required", source: "Funder Report Template", page: "Page 6", excerpt: "An authorized representative must sign the certification before the report is submitted.", confidence: 96, reviewStatus: "Needs review" }
];

export interface ReportRequirement {
  id: string;
  section: string;
  title: string;
  rule: string;
  sourceExcerpt: string;
  source: string;
}

export const reportRequirements: ReportRequirement[] = [
  { id: "section-a", section: "Section A", title: "Program progress narrative", rule: "Maximum 200 words", sourceExcerpt: "A. Describe progress toward the approved program goals during this reporting period. Response must not exceed 200 words.", source: "Funder template · page 2" },
  { id: "section-b", section: "Section B", title: "Number of youth served", rule: "Required numeric response", sourceExcerpt: "B. Enter the unduplicated number of youth served during the reporting period.", source: "Funder template · page 3" },
  { id: "section-c", section: "Section C", title: "Budget-versus-actual schedule", rule: "Annual budget, cumulative actual, and remaining balance", sourceExcerpt: "C. Complete the approved budget, cumulative expenditure, and remaining-balance columns.", source: "Funder template · page 4" },
  { id: "section-d", section: "Section D", title: "Material variance explanation", rule: "Required when variance exceeds 10% of elapsed plan", sourceExcerpt: "D. Explain each budget category varying by more than ten percent from the elapsed-period spending plan.", source: "Funder template · page 4" },
  { id: "section-e", section: "Section E", title: "Travel receipt and justification schedule", rule: "Itemized receipt and written justification above $1,000", sourceExcerpt: "E. Attach the travel schedule, itemized receipt, and written justification for transactions over $1,000.", source: "Agreement · page 8; template · page 5" },
  { id: "section-f", section: "Section F", title: "Authorized certification", rule: "Signature required before submission", sourceExcerpt: "F. I certify that the information presented has been reviewed and is complete to the best of my knowledge.", source: "Funder template · page 6" }
];

export const programFacts = [
  "Six-month youth-served target: 120",
  "Confirmed youth served: 118",
  "Two workshops were deferred into the next reporting period",
  "Three additional school-site visits occurred",
  "The program expanded into two additional schools",
  "Mileage reimbursement increased during the reporting period",
  "The Program Director confirmed the additional travel",
  "One itemized receipt is still missing"
];

export const missingInputQuestions = [
  "Please confirm that 118 youth were served between January 1 and June 30.",
  "Why were two workshops deferred?",
  "Were the three additional school-site visits approved in advance?",
  "Please provide the missing receipt for transaction TRV-003.",
  "What corrective action will be taken to complete the deferred workshops?"
];

export const approvedContentLibrary = [
  { title: "Organization mission statement", client: "Hope Community Services", approved: "December 12, 2025", approvedBy: "Maya Chen, Controller", source: "2025 Annual Funder Report", reviewDate: "December 12, 2026" },
  { title: "Youth Access program description", client: "Hope Community Services", approved: "January 9, 2026", approvedBy: "Luis Romero, Program Director", source: "2026 Approved Program Plan", reviewDate: "January 9, 2027" },
  { title: "Internal financial-control description", client: "Hope Community Services", approved: "November 18, 2025", approvedBy: "Maya Chen, Controller", source: "2025 Finance Narrative", reviewDate: "November 18, 2026" },
  { title: "Standard indirect-cost explanation", client: "Hope Community Services", approved: "January 9, 2026", approvedBy: "Maya Chen, Controller", source: "Approved Grant Budget", reviewDate: "December 31, 2026" }
];
