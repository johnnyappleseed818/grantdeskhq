import { ArrowRight, Check, CircleHelp } from "lucide-react";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Essentials",
    monthly: "$149",
    annual: "$1,490",
    activeGrants: "Up to 5",
    reports: "24",
    users: "3",
    description: "For a smaller finance team establishing a consistent grant-reporting workflow."
  },
  {
    name: "Growth",
    monthly: "$299",
    annual: "$2,990",
    activeGrants: "Up to 15",
    reports: "72",
    users: "8",
    description: "For teams preparing recurring funder reports across a growing grant portfolio.",
    featured: true
  },
  {
    name: "Portfolio",
    monthly: "$499",
    annual: "$4,990",
    activeGrants: "Up to 40",
    reports: "200",
    users: "15",
    description: "For established finance teams managing reporting across a larger portfolio."
  }
];

export function PricingPage() {
  return (
    <div className="pricing-page">
      <section className="pricing-hero">
        <div className="site-shell text-center">
          <div className="prototype-pill mx-auto"><span aria-hidden="true" /> Clear pricing for nonprofit finance teams</div>
          <p className="eyebrow mt-8">Pricing</p>
          <h1 className="page-title mx-auto">Choose the reporting capacity your team needs.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Every plan is designed to reduce manual report preparation while keeping source evidence, review decisions, and final approval with your team.
          </p>
        </div>
      </section>

      <section className="site-shell pb-14 lg:pb-20" aria-label="GrantDeskHQ subscription plans">
        <div className="pricing-grid">
          {plans.map((plan) => (
            <article key={plan.name} className={`pricing-card ${plan.featured ? "is-featured" : ""}`}>
              {plan.featured && <div className="pricing-label">Best fit for growing teams</div>}
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
                <Feature>{plan.users} users</Feature>
                <Feature>Unlimited archived grants</Feature>
              </ul>
              <Link className={`button mt-8 w-full ${plan.featured ? "button-primary" : "button-secondary"}`} to="/assessment#contact">
                Discuss {plan.name} <ArrowRight aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>

        <div className="pricing-overages">
          <div>
            <p className="eyebrow">Add capacity when you need it</p>
            <h2>Simple, consistent add-on pricing</h2>
            <p>Keep the same plan and add capacity during a busier reporting period.</p>
          </div>
          <dl>
            <div><dt>Additional 5 active grants</dt><dd>$75/month</dd></div>
            <div><dt>Additional report package</dt><dd>$25</dd></div>
          </dl>
        </div>

        <div className="pricing-definitions">
          <CircleHelp aria-hidden="true" />
          <div>
            <h2>How usage is counted</h2>
            <p><strong>Active grants</strong> are grants currently being managed in the reporting workflow. <strong>Archived grants</strong> remain available for reference but do not count toward the active-grant limit. A <strong>report package</strong> is one compiled reporting cycle with its draft and supporting evidence.</p>
          </div>
        </div>
      </section>

      <section className="cta-section print:hidden">
        <div className="site-shell flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <p className="eyebrow">Not sure which plan fits?</p>
            <h2 className="text-3xl font-semibold text-navy-900">Start with your actual reporting workflow.</h2>
            <p className="mt-3 max-w-2xl text-slate-600">Tell us how many grants and report packages your team manages. We’ll help you understand which plan matches the workload.</p>
          </div>
          <Link className="button button-primary button-large shrink-0" to="/assessment#contact">Discuss your needs <ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emeraldMuted-600" aria-hidden="true" />{children}</li>;
}
