import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CircleHelp, LoaderCircle, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ADDITIONAL_GRANTS_PRICE,
  ADDITIONAL_GRANTS_QUANTITY,
  ADDITIONAL_REPORT_PRICE,
  EARLY_ACCESS_DISCOUNT_PERCENT,
  INCLUDED_IN_EVERY_PLAN,
  PRICING_PLANS,
  formatUsd,
  type BillingInterval,
  type PlanId
} from "../content/pricing";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";

export function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [startingPlan, setStartingPlan] = useState<PlanId | "">("");
  const [checkoutError, setCheckoutError] = useState("");
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const resumedCheckout = useRef(false);

  const beginCheckout = useCallback(async (plan: PlanId, billingInterval: BillingInterval = interval) => {
    setCheckoutError("");
    if (!user) {
      const next = `/pricing?checkout=${plan}-${billingInterval}`;
      navigate(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setStartingPlan(plan);
    try {
      const result = await apiRequest<{ url: string }>("/api/billing/checkout", await token(), {
        method: "POST",
        body: JSON.stringify({ plan, interval: billingInterval })
      });
      window.location.assign(result.url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Secure checkout could not be started.");
      setStartingPlan("");
    }
  }, [interval, navigate, token, user]);

  useEffect(() => {
    if (!user || resumedCheckout.current) return;
    const checkout = new URLSearchParams(location.search).get("checkout") || "";
    const match = checkout.match(/^(essentials|growth|portfolio)-(month|year)$/);
    if (!match) return;
    resumedCheckout.current = true;
    void beginCheckout(match[1] as PlanId, match[2] as BillingInterval);
  }, [user, location.search, beginCheckout]);

  return (
    <div className="pricing-page">
      <section className="pricing-hero">
        <div className="site-shell text-center">
          <div className="prototype-pill mx-auto"><span aria-hidden="true" /> Simple, workload-based pricing</div>
          <p className="eyebrow mt-8">Pricing</p>
          <h1 className="page-title mx-auto">Start with one report. Keep going only if the workflow saves your team time.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Your first report is free. See how GrantDeskHQ turns the agreement, accounting export, and program updates into a source-linked draft before choosing a plan.
          </p>
          <div className="pricing-promises"><span>First report free</span><span>No credit card to start</span><span>Unlimited contributors</span><span>Cancel anytime</span></div>
        </div>
      </section>

      <section className="site-shell pb-14 lg:pb-20" aria-label="GrantDeskHQ subscription plans">
        <div className="pricing-launch-offer">
          <div><p className="eyebrow">Early access savings</p><h2>{EARLY_ACCESS_DISCOUNT_PERCENT}% off your first year</h2><p>Join during early access and Stripe applies the discount to your first 12 months. Your regular plan price is always shown clearly before checkout.</p></div>
          <ShieldCheck aria-hidden="true" />
        </div>
        <div className="billing-toggle" role="group" aria-label="Billing schedule">
          <button type="button" className={interval === "month" ? "is-active" : ""} aria-pressed={interval === "month"} onClick={() => setInterval("month")}>Monthly</button>
          <button type="button" className={interval === "year" ? "is-active" : ""} aria-pressed={interval === "year"} onClick={() => setInterval("year")}>Annual</button>
        </div>
        {new URLSearchParams(location.search).get("billing") === "cancelled" && <div className="pricing-notice" role="status">Checkout was cancelled. Nothing was charged.</div>}
        {checkoutError && <div className="compiler-error pricing-error" role="alert">{checkoutError}</div>}
        <div className="pricing-grid">
          {PRICING_PLANS.map((plan) => (
            <article key={plan.name} className={`pricing-card ${plan.featured ? "is-featured" : ""}`}>
              {plan.featured && <div className="pricing-label">Most popular</div>}
              <p className="text-sm font-semibold text-emeraldMuted-700">{plan.name}</p>
              <div className="mt-4 flex items-end gap-1">
                <strong className="text-4xl font-semibold tracking-tight text-navy-950">{formatUsd(interval === "month" ? plan.monthly : plan.annual)}</strong>
                <span className="pb-1 text-sm text-slate-500">/{interval}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-600">{interval === "month" ? `${formatUsd(plan.annual)} per year at the monthly rate` : `${formatUsd(plan.monthly)} per month, billed annually`}</p>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Best for</p>
              <p className="mt-1 text-sm font-semibold text-navy-900">{plan.bestFor}</p>
              <p className="mt-5 min-h-[72px] text-sm leading-6 text-slate-600">{plan.description}</p>
              <ul className="mt-7 grid gap-3 text-sm text-slate-700">
                <Feature>Up to {plan.activeGrants} active grants</Feature>
                <Feature>{plan.reportsPerYear} report packages per year</Feature>
                <Feature>Unlimited contributors</Feature>
                <Feature>Unlimited archived grants</Feature>
                <Feature>{plan.support}</Feature>
              </ul>
              <button type="button" className={`button mt-8 w-full ${plan.featured ? "button-primary" : "button-secondary"}`} disabled={Boolean(startingPlan)} onClick={() => void beginCheckout(plan.id)}>
                {startingPlan === plan.id ? <><LoaderCircle className="animate-spin" aria-hidden="true" />Opening secure checkout…</> : <>Choose {plan.name} <ArrowRight aria-hidden="true" /></>}
              </button>
              <Link className="pricing-free-link" to="/assessment#contact">Or analyze your first report free</Link>
            </article>
          ))}
        </div>

        <div className="pricing-comparison" aria-labelledby="plan-comparison-heading">
          <div className="pricing-comparison-heading"><p className="eyebrow">Compare plans</p><h2 id="plan-comparison-heading">The same reporting workflow, sized for your portfolio</h2><p>Every plan includes the core AI-assisted reporting workflow. Choose based on the number of active grants and report packages your team needs.</p></div>
          <div className="pricing-table-wrap" tabIndex={0} aria-label="Scrollable plan comparison">
            <table>
              <thead><tr><th scope="col">Included</th>{PRICING_PLANS.map((plan) => <th scope="col" key={plan.id}>{plan.name}</th>)}</tr></thead>
              <tbody>
                <ComparisonRow label="Active grants" values={PRICING_PLANS.map((plan) => `Up to ${plan.activeGrants}`)} />
                <ComparisonRow label="Report packages per year" values={PRICING_PLANS.map((plan) => String(plan.reportsPerYear))} />
                <ComparisonRow label="Contributors" values={PRICING_PLANS.map(() => "Unlimited")} />
                <ComparisonRow label="Archived grants" values={PRICING_PLANS.map(() => "Unlimited")} />
                <ComparisonRow label="Support" values={PRICING_PLANS.map((plan) => plan.support)} />
                {INCLUDED_IN_EVERY_PLAN.map((feature) => <ComparisonRow key={feature} label={feature} values={PRICING_PLANS.map(() => "Included")} checkmarks />)}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pricing-overages">
          <div>
            <p className="eyebrow">Flexible when your workload changes</p>
            <h2>Add capacity without changing plans</h2>
            <p>Handle a temporary reporting spike without moving your entire organization to the next tier.</p>
          </div>
          <dl>
            <div><dt>Additional {ADDITIONAL_GRANTS_QUANTITY} active grants</dt><dd>{formatUsd(ADDITIONAL_GRANTS_PRICE)}/month</dd></div>
            <div><dt>Additional report package</dt><dd>{formatUsd(ADDITIONAL_REPORT_PRICE)}</dd></div>
          </dl>
        </div>

        <div className="pricing-definitions">
          <CircleHelp aria-hidden="true" />
          <div>
            <h2>How usage is counted</h2>
            <p><strong>Active grants</strong> are grants currently being prepared or monitored in GrantDeskHQ. <strong>Archived grants</strong> stay available for reference without counting toward the limit. One <strong>report package</strong> includes a compiled draft, financial schedule, evidence log, missing-input list, and quality review. The first report is free and does not require a credit card.</p>
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

function ComparisonRow({ label, values, checkmarks = false }: { label: string; values: string[]; checkmarks?: boolean }) {
  return <tr><th scope="row">{label}</th>{values.map((value, index) => <td key={`${label}-${index}`}>{checkmarks ? <span className="comparison-check"><Check aria-hidden="true" />{value}</span> : value}</td>)}</tr>;
}
