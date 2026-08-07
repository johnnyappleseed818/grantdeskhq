import { ArrowRight, CircleDollarSign, Clock3, FileCheck2, TriangleAlert } from "lucide-react";
import type { DemoView } from "../../pages/DemoPage";
import { budget, grantData } from "../../data/grantData";
import { annualBudgetTotal, formatCurrency, mappedActualTotal, remainingMappedBalance, varianceForCategory } from "../../lib/calculations";
import { StatusBadge } from "../StatusBadge";

export function AgencyOverview({ onNavigate }: { onNavigate: (view: DemoView) => void }) {
  const travel = varianceForCategory("Local Travel");

  return (
    <div className="workspace-stack">
      <WorkspaceHeading eyebrow="Agency overview" title="Six-Month Progress Report" description="See how GrantDeskHQ brings funder requirements, financial data, program updates, and supporting evidence into one report workflow. Focus on the open decisions instead of rebuilding the report by hand." />

      <div className="metric-grid">
        <Metric icon={CircleDollarSign} label="Approved award" value={formatCurrency(annualBudgetTotal())} detail="Annual grant budget" />
        <Metric icon={FileCheck2} label="Mapped actuals" value={formatCurrency(mappedActualTotal())} detail="19 included transactions" />
        <Metric icon={Clock3} label="Remaining mapped budget" value={formatCurrency(remainingMappedBalance())} detail="At June 30, 2026" />
        <Metric icon={TriangleAlert} label="Required review" value="3 items" detail="Before review-package export" tone="review" />
      </div>

      <div className="workspace-grid">
        <section className="panel lg:col-span-2">
          <div className="panel-heading">
            <div><p className="eyebrow">Budget position</p><h3>Actuals against annual and elapsed-period plan</h3></div>
            <StatusBadge tone="neutral">50% elapsed</StatusBadge>
          </div>
          <div className="table-scroll" tabIndex={0} aria-label="Budget position table">
            <table className="data-table">
              <thead><tr><th>Category</th><th>Annual budget</th><th>Six-month plan</th><th>Actual</th><th>Remaining</th><th>Status</th></tr></thead>
              <tbody>
                {budget.map((line) => {
                  const variance = varianceForCategory(line.category);
                  return (
                    <tr key={line.category}>
                      <th scope="row">{line.category}</th>
                      <td>{formatCurrency(line.annualBudget)}</td>
                      <td>{formatCurrency(variance.expected)}</td>
                      <td>{formatCurrency(variance.actual)}</td>
                      <td>{formatCurrency(variance.remaining)}</td>
                      <td><StatusBadge tone={variance.status === "Within plan" ? "success" : "review"}>{variance.status}</StatusBadge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel">
          <p className="eyebrow">Report profile</p>
          <dl className="detail-list mt-4">
            <div><dt>Funder</dt><dd>{grantData.funder}</dd></div>
            <div><dt>Grant</dt><dd>{grantData.grantName}</dd></div>
            <div><dt>Grant period</dt><dd>{grantData.grantPeriod}</dd></div>
            <div><dt>Reporting period</dt><dd>{grantData.reportingPeriod}</dd></div>
            <div><dt>Status</dt><dd><StatusBadge tone="review">Controller review</StatusBadge></dd></div>
          </dl>
        </aside>
      </div>

      <section className="panel border-l-4 border-l-amber-500">
        <div className="grid items-start gap-5 md:grid-cols-[1fr_auto]">
          <div>
            <p className="eyebrow">Variance requiring explanation</p>
            <h3>Local Travel is {formatCurrency(travel.varianceAmount)} above the six-month elapsed plan—not above its annual budget.</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">Actual travel is {formatCurrency(travel.actual)} against a {formatCurrency(travel.expected)} elapsed-period plan, a 30.67% variance. Three source transactions drive the difference.</p>
          </div>
          <button type="button" className="button button-secondary" onClick={() => onNavigate("mapping")}>Review variance <ArrowRight aria-hidden="true" /></button>
        </div>
      </section>
    </div>
  );
}

export function WorkspaceHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="workspace-heading">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
      {action}
    </header>
  );
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Clock3; label: string; value: string; detail: string; tone?: "review" }) {
  return (
    <article className="metric-card">
      <div className={`icon-tile ${tone ? "icon-review" : ""}`}><Icon aria-hidden="true" /></div>
      <p>{label}</p><strong>{value}</strong><span>{detail}</span>
    </article>
  );
}
