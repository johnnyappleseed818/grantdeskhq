import { ArrowRight, Check, CircleHelp } from "lucide-react";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Essentials",
    monthly: "$49",
    annual: "$490",
    activeGrants: "Up to 10",
    reports: "12",
    users: "5 internal users",
    description: "For nonprofit finance teams that want to replace manual report assembly without adding an expensive grant-management system.",
    extras: ["Unlimited guest reviewers", "Report history and evidence log"]
  },
  {
    name: "Growth",
    monthly: "$149",
    annual: "$1,490",
    activeGrants: "Up to 30",
    reports: "60",
    users: "15 internal users",
    description: "For larger nonprofits, multi-program finance teams, and accounting partners managing a higher volume of grant reports.",
    extras: ["Separate program or client workspaces", "Unlimited guest reviewers", "Report history and evidence log"],
    featured: true
  }
];

export function PricingPage() {
  return (
    <div className="pricing-page">
      <section className="pricing-hero">
        <div className="site-shell text-center">
          <div className="prototype-pill mx-auto"><span aria-hidden="true" /> Simple, transparent pricing</div>
          <p className="eyebrow mt-8">Pricing</p>
          <h1 className="page-title mx-auto">Start with one report. Keep going only if the workflow saves your team time.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Your first report is free. See how GrantDeskHQ turns the agreement, accounting export, and program updates into a source-linked draft before choosing a plan.
          </p>
          <div className="pricing-promises"><span>First report free</span><span>Free source import</span><span>No setup fee</span><span>Cancel anytime</span></div>
        </div>
      </section>

      <section className="site-shell pb-14 lg:pb-20" aria-label="GrantDeskHQ subscription plans">
        <div className="pricing-grid">
          {plans.map((plan) => (
            <article key={plan.name} className={`pricing-card ${plan.featured ? "is-featured" : ""}`}>
              {plan.featured && <div className="pricing-label">Best fit for larger teams</div>}
              <p className="text-sm font-semibold text-emeraldMuted-700">{plan.name}</p>
              <div className="mt-4 flex items-end gap-1">
                <strong className="text-4xl font-semibold tracking-tight text-navy-950">{plan.monthly}</strong>
                <span className="pb-1 text-sm text-slate-500">/month</span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-600">or {plan.annual}/year</p>
              <p className="mt-5 min-h-[72px] text-sm leading-6 text-slate-600">{plan.description}</p>
              <ul className="mt-7 grid gap-3 text-sm text-slate-700">
                <Feature>{plan.activeGrants} active grants</Feature>
                <Feature>{plan.reports} report packages per year</Feature>
                <Feature>{plan.users}</Feature>
                <Feature>Unlimited archived grants</Feature>
                {plan.extras.map((extra) => <Feature key={extra}>{extra}</Feature>)}
              </ul>
              <Link className={`button mt-8 w-full ${plan.featured ? "button-primary" : "button-secondary"}`} to="/assessment#contact">
                Try your first report free <ArrowRight aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>

        <div className="pricing-overages">
          <div>
            <p className="eyebrow">Only pay for the extra work you use</p>
            <h2>Add a report during a busy period</h2>
            <p>Keep the same plan instead of moving to a higher tier for an occasional reporting spike.</p>
          </div>
          <dl>
            <div><dt>Additional report package</dt><dd>$15</dd></div>
          </dl>
        </div>

        <div className="pricing-definitions">
          <CircleHelp aria-hidden="true" />
          <div>
            <h2>How usage is counted</h2>
            <p><strong>Active grants</strong> are grants currently being prepared or monitored in GrantDeskHQ. <strong>Archived grants</strong> stay available for reference without counting toward the limit. One <strong>report package</strong> includes a compiled draft, financial schedule, evidence log, missing-input list, and quality review.</p>
          </div>
        </div>
      </section>

      <section className="cta-section print:hidden">
        <div className="site-shell flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <p className="eyebrow">Try it before you commit</p>
            <h2 className="text-3xl font-semibold text-navy-900">See the value on a report your team already knows.</h2>
            <p className="mt-3 max-w-2xl text-slate-600">Use synthetic or appropriately redacted test files, compare the source-linked output with your current process, and continue only if it reduces meaningful manual work.</p>
          </div>
          <Link className="button button-primary button-large shrink-0" to="/assessment#contact">Request your free first report <ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emeraldMuted-600" aria-hidden="true" />{children}</li>;
}
