import { Download, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { budget, grantData, transactions } from "../data/grantData";
import { formatCurrency, formatPercent, varianceForCategory, youthAchievementPercentage } from "../lib/calculations";

export function SampleReportPage() {
  const travel = varianceForCategory("Local Travel");

  return (
    <div className="report-page">
      <div className="report-toolbar print:hidden">
        <div><p className="eyebrow">Synthetic sample output</p><h1>See the complete review package</h1><p>The draft, budget schedule, transaction evidence, open items, and citations are organized in one place.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="button button-secondary" onClick={() => window.print()}><Printer aria-hidden="true" /> Print or Save as PDF</button>
          <a className="button button-primary" href="/samples/Synthetic_Funder_Report_Draft.pdf" download><Download aria-hidden="true" /> Download synthetic PDF</a>
        </div>
      </div>

      <article className="report-document">
        <ReportDisclosure />
        <section className="report-cover print-page">
          <div>
            <p className="report-kicker">Pacific Youth Foundation</p>
            <h1>Six-Month Progress Report</h1>
            <p className="mt-4 max-w-xl text-lg text-slate-600">Youth Access Initiative · Hope Community Services</p>
          </div>
          <dl className="cover-details">
            <div><dt>Grant period</dt><dd>{grantData.grantPeriod}</dd></div>
            <div><dt>Reporting period</dt><dd>{grantData.reportingPeriod}</dd></div>
            <div><dt>Approved award</dt><dd>{formatCurrency(grantData.grantAmount)}</dd></div>
            <div><dt>Prepared for review by</dt><dd>Northstar Nonprofit Finance</dd></div>
            <div><dt>Package status</dt><dd>Draft · professional review required</dd></div>
          </dl>
          <div className="cover-footer"><strong>GrantDesk</strong><span>Interactive prototype using synthetic demonstration data</span></div>
        </section>

        <ReportSection number="01" title="Executive summary">
          <p>Hope Community Services served 118 youth during the first six months of 2026, reaching {formatPercent(youthAchievementPercentage(), 1)} of the six-month target of 120. The program expanded into two additional schools following three approved school-site visits. Two workshops were deferred into the next reporting period, and the reason and corrective action remain open for professional review.</p>
          <p>Mapped cumulative expenditures total {formatCurrency(74150)} against the {formatCurrency(150000)} annual award. Local Travel is {formatCurrency(2300)} above the 50% elapsed-period plan, while remaining {formatCurrency(5200)} below the full annual category budget.</p>
        </ReportSection>

        <ReportSection number="02" title="Required narrative questions">
          <div className="report-question"><h3>A. Describe progress toward approved program goals. Maximum 200 words.</h3><p>Hope Community Services continued the Youth Access Initiative across its approved community-school service area. The program served 118 youth, reaching 98.3% of its six-month target of 120. Three additional school-site visits were approved, and the program expanded into two additional schools. Two workshops were deferred into the next reporting period; the reason and corrective action require confirmation before this draft is approved.</p><Citation>Program Update Form · Responses 1–5</Citation></div>
          <div className="report-question"><h3>B. Number of youth served</h3><p className="text-2xl font-semibold text-navy-900">118</p><Citation>Program Update Form · Response 2</Citation></div>
        </ReportSection>

        <ReportSection number="03" title="Budget versus actual">
          <div className="table-scroll" tabIndex={0} aria-label="Sample report budget-versus-actual table">
            <table className="report-table"><thead><tr><th>Budget category</th><th>Annual budget</th><th>50% elapsed plan</th><th>Mapped actual</th><th>Remaining</th><th>Variance to plan</th><th>Status</th></tr></thead><tbody>
              {budget.map((line) => { const result = varianceForCategory(line.category); return <tr key={line.category}><th scope="row">{line.category}</th><td>{formatCurrency(line.annualBudget)}</td><td>{formatCurrency(result.expected)}</td><td>{formatCurrency(result.actual)}</td><td>{formatCurrency(result.remaining)}</td><td>{formatCurrency(result.varianceAmount)} · {formatPercent(result.variancePercentage, 2)}</td><td>{result.status}</td></tr>; })}
              <tr className="total-row"><th scope="row">Total mapped</th><td>{formatCurrency(150000)}</td><td>{formatCurrency(75000)}</td><td>{formatCurrency(74150)}</td><td>{formatCurrency(75850)}</td><td>{formatCurrency(-850)} · -1.13%</td><td>Within plan</td></tr>
            </tbody></table>
          </div>
          <p className="report-footnote">UNM-001 · Community Events LLC · {formatCurrency(1250)} is excluded from mapped actuals because its grant tag is blank and professional review remains open.</p>
        </ReportSection>

        <ReportSection number="04" title="Required variance explanation">
          <div className="report-callout">
            <p className="eyebrow">Local Travel · 30.67% above elapsed plan</p>
            <p>Local travel spending exceeded the six-month elapsed plan because three additional school-site visits were approved during the reporting period. The program expanded into two additional schools, and mileage reimbursement increased as those visits were completed. Two itemized receipts are attached; the receipt for TRV-003 remains outstanding.</p>
            <div className="mt-4 flex flex-wrap gap-2"><Citation>Program Update · Q3–Q4</Citation><Citation>TRV-001–003</Citation><Citation>Receipt Schedule</Citation></div>
          </div>
          <p className="mt-5 text-sm text-slate-600">Annual travel budget: {formatCurrency(travel.annualBudget)} · Six-month plan: {formatCurrency(travel.expected)} · Actual: {formatCurrency(travel.actual)} · Remaining annual budget: {formatCurrency(travel.remaining)}</p>
        </ReportSection>

        <ReportSection number="05" title="Program results">
          <div className="grid gap-4 sm:grid-cols-3"><ReportMetric label="Six-month target" value="120 youth" /><ReportMetric label="Confirmed served" value="118 youth" /><ReportMetric label="Achievement" value="98.3%" /></div>
          <ul className="report-list"><li>Program expanded into two additional schools.</li><li>Three additional school-site visits were approved.</li><li>Two workshops were deferred; reason and corrective action need confirmation.</li></ul>
        </ReportSection>

        <ReportSection number="06" title="Transaction evidence schedule">
          <div className="table-scroll" tabIndex={0} aria-label="Sample report transaction evidence table">
            <table className="report-table compact-table"><thead><tr><th>ID</th><th>Date</th><th>Vendor or memo</th><th>Amount</th><th>Suggested category</th><th>Confidence</th><th>Support</th></tr></thead><tbody>
              {transactions.map((transaction) => <tr key={transaction.id}><th scope="row">{transaction.id}</th><td>{transaction.date}</td><td>{transaction.vendorMemo}</td><td>{formatCurrency(transaction.amount)}</td><td>{transaction.suggestedCategory ?? "Unmapped"}</td><td>{transaction.confidence}</td><td>{transaction.receiptStatus}</td></tr>)}
            </tbody></table>
          </div>
        </ReportSection>

        <ReportSection number="07" title="Supporting-document checklist">
          <ul className="report-checklist"><li className="complete">Grant agreement and approved budget</li><li className="complete">GL export and mapping schedule</li><li className="complete">TRV-001 and TRV-002 itemized receipts</li><li className="review">TRV-003 itemized receipt — missing</li><li className="review">UNM-001 mapping decision — open</li><li className="review">Authorized certification — unsigned</li></ul>
        </ReportSection>

        <ReportSection number="08" title="Open-review items">
          <div className="grid gap-3 md:grid-cols-3"><OpenItem title="$1,250 unmapped transaction" /><OpenItem title="Missing TRV-003 receipt" /><OpenItem title="Certification not signed" /></div>
        </ReportSection>

        <ReportSection number="09" title="Certification placeholder">
          <p>I certify that the information presented in this draft has been reviewed and is complete to the best of my knowledge.</p>
          <div className="signature-grid"><div><span>Authorized representative</span></div><div><span>Title</span></div><div><span>Date</span></div></div>
          <p className="mt-5 text-xs font-semibold text-redBlocked-700">Unsigned synthetic placeholder. This prototype does not execute or validate a certification.</p>
        </ReportSection>

        <ReportSection number="10" title="Source citation appendix">
          <ol className="report-list list-decimal pl-5"><li>PYF_Youth_Access_Grant_Agreement.pdf — award terms, category limits, and travel documentation rule.</li><li>Approved_Grant_Budget.xlsx — annual category budgets totaling $150,000.</li><li>General_Ledger_Export_Jan-Jun_2026.csv — 20 synthetic transactions totaling $75,400.</li><li>Six_Month_Funder_Report_Template.docx — required Sections A–F, word limit, variance threshold, and certification.</li><li>Program_Update_Form_June_2026 — confirmed youth served, school expansion, site visits, and deferred workshops.</li><li>Supporting_Receipt_Schedule.pdf — TRV-001 and TRV-002 attached; TRV-003 missing.</li></ol>
        </ReportSection>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-slate-300 pt-6 text-xs text-slate-500"><span>Generated for GrantDesk interactive prototype</span><span>Synthetic demonstration data · Human professional review required</span></div>
      </article>

      <div className="report-downloads print:hidden">
        <h2>Related synthetic files</h2>
        <div className="mt-4 flex flex-wrap gap-3"><a className="button button-secondary" href="/samples/Synthetic_Grant_Agreement.pdf" download>Grant Agreement PDF</a><a className="button button-secondary" href="/samples/Approved_Grant_Budget.xlsx" download>Approved Budget XLSX</a><a className="button button-secondary" href="/samples/General_Ledger_Export.csv" download>GL Export CSV</a><a className="button button-secondary" href="/samples/Transaction_Evidence_Schedule.xlsx" download>Evidence Schedule XLSX</a></div>
        <p className="mt-5 text-sm text-slate-600">Want to see how this could work with your reporting process? <Link className="font-semibold text-emeraldMuted-700 underline" to="/pilot#contact">Contact us about the Founding Agency Pilot</Link>.</p>
      </div>
    </div>
  );
}

function ReportDisclosure() { return <div className="report-disclosure"><StatusBadge tone="info">Interactive prototype using synthetic demonstration data</StatusBadge><span>Draft for professional review · Not automatically submitted</span></div>; }
function ReportSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <section className="report-section"><div className="report-section-heading"><span>{number}</span><h2>{title}</h2></div><div className="report-section-body">{children}</div></section>; }
function Citation({ children }: { children: React.ReactNode }) { return <span className="source-chip">{children}</span>; }
function ReportMetric({ label, value }: { label: string; value: string }) { return <div className="report-metric"><span>{label}</span><strong>{value}</strong></div>; }
function OpenItem({ title }: { title: string }) { return <article className="border border-amberReview-200 bg-amberReview-50 p-4"><StatusBadge tone="review">Needs review</StatusBadge><h3 className="mt-3 text-sm font-semibold text-navy-900">{title}</h3></article>; }
