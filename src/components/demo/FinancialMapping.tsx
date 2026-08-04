import { Check, Eye, ShieldX, Undo2 } from "lucide-react";
import type { EvidenceDetail } from "../EvidenceDrawer";
import { StatusBadge } from "../StatusBadge";
import { budgetCategoryNames, transactions, type BudgetCategoryName } from "../../data/grantData";
import { formatCurrency, formatPercent, varianceForCategory } from "../../lib/calculations";
import type { MappingDecision } from "../../pages/DemoPage";
import { WorkspaceHeading } from "./AgencyOverview";

interface Props {
  decisions: Record<string, MappingDecision>;
  onSetMapping: (transactionId: string, category: BudgetCategoryName | null) => void;
  onApprove: (transactionId: string) => void;
  onEvidence: (evidence: EvidenceDetail) => void;
}

export function FinancialMapping({ decisions, onSetMapping, onApprove, onEvidence }: Props) {
  const mappedTotal = transactions.reduce((sum, transaction) => decisions[transaction.id]?.category ? sum + transaction.amount : sum, 0);
  const mappedCount = transactions.filter((transaction) => decisions[transaction.id]?.category).length;
  const travel = varianceForCategory("Local Travel");
  const travelTransactions = transactions.filter((transaction) => transaction.suggestedCategory === "Local Travel");

  return (
    <div className="workspace-stack">
      <WorkspaceHeading
        eyebrow="Financial mapping"
        title="Review AI suggestions instead of mapping from scratch"
        description="GrantDeskHQ suggests a grant category and shows why. Your controller approves it, changes it, or leaves the transaction unresolved—nothing is approved on the team’s behalf."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Ledger transactions" value="20" detail={formatCurrency(75400)} />
        <Summary label="Currently mapped" value={`${mappedCount}`} detail={formatCurrency(mappedTotal)} />
        <Summary label="Initially excluded" value={decisions["UNM-001"].category ? "0" : "1"} detail={decisions["UNM-001"].category ? formatCurrency(0) : formatCurrency(1250)} tone={decisions["UNM-001"].category ? "success" : "review"} />
      </div>

      <section className="panel panel-flush">
        <div className="panel-heading px-5 pt-5">
          <div><p className="eyebrow">Synthetic general ledger</p><h2>20 transaction mapping decisions</h2></div>
          <StatusBadge tone="review">Professional review required</StatusBadge>
        </div>
        <div className="table-scroll" tabIndex={0} aria-label="Financial mapping transaction table">
          <table className="data-table mapping-table">
            <thead>
              <tr><th>Transaction</th><th>Date</th><th>Vendor or memo</th><th>GL account</th><th>Amount</th><th>Suggested grant category</th><th>Confidence</th><th>Rule or evidence</th><th>Review status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => {
                const decision = decisions[transaction.id];
                return (
                  <tr key={transaction.id} className={!decision.category ? "row-unresolved" : ""}>
                    <th scope="row" className="font-mono text-xs">{transaction.id}</th>
                    <td>{new Date(`${transaction.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                    <td className="min-w-56"><strong className="block font-medium text-slate-800">{transaction.vendorMemo}</strong>{!transaction.grantTag && <span className="mt-1 block text-xs text-redBlocked-700">Grant tag blank</span>}</td>
                    <td className="min-w-44 text-xs">{transaction.glAccount}</td>
                    <td className="font-medium">{formatCurrency(transaction.amount)}</td>
                    <td>
                      <label className="sr-only" htmlFor={`category-${transaction.id}`}>Change category for {transaction.id}</label>
                      <select
                        id={`category-${transaction.id}`}
                        className="table-select"
                        value={decision.category ?? ""}
                        onChange={(event) => onSetMapping(transaction.id, event.target.value ? event.target.value as BudgetCategoryName : null)}
                      >
                        <option value="">Leave unmapped</option>
                        {budgetCategoryNames.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </td>
                    <td><StatusBadge tone={transaction.confidence === "High" ? "success" : transaction.confidence === "Unmapped" ? "blocked" : "review"}>{transaction.confidence}</StatusBadge></td>
                    <td className="min-w-64 text-xs leading-5 text-slate-600">{transaction.evidence}</td>
                    <td><StatusBadge tone={decision.status === "Approved" ? "success" : decision.status === "Unresolved" ? "blocked" : "review"}>{decision.status}</StatusBadge></td>
                    <td>
                      <div className="flex gap-1">
                        <button type="button" className="table-action" aria-label={`Open evidence for ${transaction.id}`} onClick={() => onEvidence(transactionEvidence(transaction.id))}><Eye aria-hidden="true" /></button>
                        <button type="button" className="table-action" aria-label={`Approve mapping for ${transaction.id}`} disabled={!decision.category} onClick={() => onApprove(transaction.id)}><Check aria-hidden="true" /></button>
                        <button type="button" className="table-action" aria-label={`Leave ${transaction.id} unresolved`} onClick={() => onSetMapping(transaction.id, null)}><Undo2 aria-hidden="true" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel variance-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">AI-assisted variance review</p><h2>Local Travel needs an explanation</h2></div>
          <StatusBadge tone="review">30.67% above elapsed plan</StatusBadge>
        </div>
        <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <dl className="variance-metrics">
              <div><dt>Annual travel budget</dt><dd>{formatCurrency(travel.annualBudget)}</dd></div>
              <div><dt>Six-month elapsed plan</dt><dd>{formatCurrency(travel.expected)}</dd></div>
              <div><dt>Actual travel</dt><dd>{formatCurrency(travel.actual)}</dd></div>
              <div className="is-review"><dt>Above elapsed plan</dt><dd>{formatCurrency(travel.varianceAmount)}</dd></div>
              <div className="is-review"><dt>Variance</dt><dd>{formatPercent(travel.variancePercentage, 2)}</dd></div>
              <div><dt>Explanation threshold</dt><dd>10%</dd></div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-slate-500">Travel remains {formatCurrency(travel.remaining)} below its full annual budget. The review flag compares actuals only with the 50% elapsed-period plan.</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Transactions driving the variance</p>
            <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
              {travelTransactions.map((transaction) => (
                <div key={transaction.id} className="grid grid-cols-[1fr_auto] gap-4 py-3 text-sm">
                  <div><strong className="font-medium text-navy-900">{transaction.id} · {transaction.vendorMemo}</strong><p className="mt-1 text-xs text-slate-500">{transaction.receiptStatus === "Missing" ? "Itemized receipt missing" : "Receipt attached"} · Written justification documented</p></div>
                  <div className="text-right"><strong>{formatCurrency(transaction.amount)}</strong><div className="mt-1"><StatusBadge tone={transaction.receiptStatus === "Missing" ? "blocked" : "success"}>{transaction.receiptStatus}</StatusBadge></div></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-2">
          <div className="supported-draft">
            <p className="eyebrow">Draft based on confirmed source information</p>
            <p>Local travel spending exceeded the six-month elapsed plan because three additional school-site visits were approved during the reporting period. <SourceChip>Program Update · Q3</SourceChip></p>
            <p>The program expanded into two additional schools, and mileage reimbursement increased as the additional visits were completed. <SourceChip>Program Update · Q4</SourceChip> <SourceChip>TRV-001–003</SourceChip></p>
            <p>Two itemized receipts are attached; the receipt for TRV-003 remains outstanding and requires controller follow-up. <SourceChip>Receipt Schedule</SourceChip></p>
          </div>
          <div className="blocked-draft">
            <div className="flex items-center gap-2 text-redBlocked-700"><ShieldX aria-hidden="true" /><strong>Blocked: no source supports hotel costs.</strong></div>
            <blockquote>“Travel increased because of unexpected hotel costs.”</blockquote>
            <p>The synthetic agreement, ledger descriptions, travel schedule, and program response contain no hotel-cost evidence. This statement cannot enter the review package.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "success" | "review" }) {
  return <article className="summary-card"><p>{label}</p><strong>{value}</strong><span>{detail}</span>{tone && <StatusBadge tone={tone}>{tone === "success" ? "Resolved locally" : "Excluded pending review"}</StatusBadge>}</article>;
}

function SourceChip({ children }: { children: React.ReactNode }) {
  return <span className="source-chip">{children}</span>;
}

function transactionEvidence(transactionId: string): EvidenceDetail {
  const transaction = transactions.find((item) => item.id === transactionId)!;
  return {
    title: `${transaction.id} mapping suggestion`,
    source: "General_Ledger_Export_Jan-Jun_2026.csv",
    locator: `Transaction ${transaction.id}`,
    excerpt: `${transaction.date} | ${transaction.vendorMemo} | ${transaction.glAccount} | ${formatCurrency(transaction.amount)} | Grant tag: ${transaction.grantTag || "blank"}`,
    evidenceType: "Ledger transaction and mapping rule",
    confidence: transaction.confidence,
    reviewerStatus: transaction.reviewStatus === "Unresolved" ? "Needs controller review" : "Suggested — not approved"
  };
}
