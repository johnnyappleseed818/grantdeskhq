import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { INCLUDED_IN_EVERY_PLAN, PRICING_PLANS, formatUsd, type PlanId } from "../content/pricing";
import { apiRequest, apiUrl } from "../lib/api";
import { currentCampaignAttribution } from "../lib/attribution";
import { useAuth } from "../lib/auth";
import { trackAnalyticsEvent } from "../lib/analytics";

interface BillingConfig { billingConfigured?: boolean; foundingPricingActive?: boolean; }
interface BillingStatus { planKey: string; subscriptionStatus: string; foundingPricingApplied: boolean; entitlementActive: boolean; }

export function PricingPage() {
  const [startingPlan, setStartingPlan] = useState<PlanId | "">("");
  const [checkoutError, setCheckoutError] = useState("");
  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  const { user, token } = useAuth();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const resumedCheckout = useRef(false);
  const foundingPricing = Boolean(billingConfig?.foundingPricingActive);

  useEffect(() => {
    trackAnalyticsEvent("pricing_view", { page_type: "pricing" });
  }, []);

  useEffect(() => {
    fetch(apiUrl("/api/config"))
      .then(async (response) => response.ok ? response.json() as Promise<BillingConfig> : { billingConfigured: false, foundingPricingActive: false })
      .then((config) => setBillingConfig({ billingConfigured: Boolean(config.billingConfigured), foundingPricingActive: Boolean(config.foundingPricingActive) }))
      .catch(() => setBillingConfig({ billingConfigured: false, foundingPricingActive: false }));
  }, []);

  useEffect(() => {
    if (!user) { setBilling(null); return; }
    token().then((idToken) => apiRequest<{ billing: BillingStatus | null }>("/api/billing/status", idToken))
      .then((result) => setBilling(result.billing))
      .catch(() => setBilling(null));
  }, [token, user]);

  const beginCheckout = useCallback(async (plan: PlanId) => {
    setCheckoutError("");
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/pricing?checkout=${plan}`)}`);
      return;
    }
    setStartingPlan(plan);
    try {
      const idToken = await token();
      if (billing?.entitlementActive) {
        if (billing.planKey === plan) {
          setCheckoutError("This is already your current plan.");
          setStartingPlan("");
          return;
        }
        const result = await apiRequest<{ billing: Pick<BillingStatus, "planKey" | "subscriptionStatus" | "foundingPricingApplied"> }>("/api/billing/change-plan", idToken, {
          method: "POST",
          body: JSON.stringify({ plan })
        });
        setBilling({ ...billing, ...result.billing });
        setCheckoutError("Your plan change has been submitted for confirmation.");
        setStartingPlan("");
        return;
      }
      trackAnalyticsEvent("checkout_started", { plan_key: plan });
      await apiRequest<{ recorded: boolean }>("/api/lifecycle/checkout-started", idToken, {
        method: "POST",
        body: JSON.stringify({ attribution: currentCampaignAttribution() })
      }).catch(() => undefined);
      const result = await apiRequest<{ url: string }>("/api/billing/checkout", idToken, {
        method: "POST",
        body: JSON.stringify({ plan })
      });
      window.location.assign(result.url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Secure checkout could not be started.");
      setStartingPlan("");
    }
  }, [billing, navigate, token, user]);

  useEffect(() => {
    if (!user || !billingConfig?.billingConfigured || resumedCheckout.current) return;
    const checkout = new URLSearchParams(location.search).get("checkout") || "";
    if (!/^(starter|growth|agency)$/.test(checkout)) return;
    resumedCheckout.current = true;
    void beginCheckout(checkout as PlanId);
  }, [beginCheckout, billingConfig?.billingConfigured, location.search, user]);

  return <div className="pricing-page">
    <section className="pricing-hero"><div className="site-shell text-center">
      <div className="prototype-pill mx-auto"><span aria-hidden="true" /> Clear monthly pricing</div>
      <p className="eyebrow mt-8">Pricing</p>
      <h1 className="page-title mx-auto">Choose the GrantDeskHQ workflow that fits your reporting needs.</h1>
      <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">Choose the plan that fits your current grant workload and scale as your reporting needs grow.</p>
      <div className="pricing-promises"><span>Monthly billing</span><span>Secure checkout</span><span>No per-user pricing</span><span>Cancel anytime</span></div>
    </div></section>

    <section className="site-shell pb-14 lg:pb-20" aria-label="GrantDeskHQ subscription plans">
      {foundingPricing && <div className="pricing-launch-offer"><div><p className="eyebrow">LIMITED-TIME PRICING</p><h2>Lock in your current price for as long as your subscription remains active.</h2></div><ShieldCheck aria-hidden="true" /></div>}
      {new URLSearchParams(location.search).get("billing") === "cancelled" && <div className="pricing-notice" role="status">Checkout was cancelled. Nothing was charged.</div>}
      {checkoutError && <div className="compiler-error pricing-error" role="alert">{checkoutError}</div>}
      <div className="pricing-grid">{PRICING_PLANS.map((plan) => {
        const displayPrice = foundingPricing ? plan.foundingMonthly : plan.monthly;
        const currentPlan = billing?.entitlementActive && billing.planKey === plan.id;
        return <article key={plan.id} className={`pricing-card ${plan.featured ? "is-featured" : ""}`}>
          {plan.featured && <div className="pricing-label">Most popular</div>}
          <p className="text-sm font-semibold text-emeraldMuted-700">{plan.name}</p>
          <div className="mt-4 flex items-end gap-2">{foundingPricing && <s className="pb-1 text-lg text-slate-500">{formatUsd(plan.monthly)}</s>}<strong className="text-4xl font-semibold tracking-tight text-navy-950">{formatUsd(displayPrice)}</strong><span className="pb-1 text-sm text-slate-500">/month</span></div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Best for</p><p className="mt-1 text-sm font-semibold text-navy-900">{plan.bestFor}</p>
          <p className="mt-5 min-h-[72px] text-sm leading-6 text-slate-600">{plan.description}</p>
          <ul className="mt-7 grid gap-3 text-sm text-slate-700"><Feature>Up to {plan.activeGrants} active grants</Feature><Feature>{plan.reportsPerYear} report packages per year</Feature><Feature>No per-user fees</Feature><Feature>Unlimited archived grants</Feature><Feature>{plan.support}</Feature></ul>
          {billingConfig?.billingConfigured ? <button type="button" className={`button mt-8 w-full ${plan.featured ? "button-primary" : "button-secondary"}`} disabled={Boolean(startingPlan) || currentPlan} onClick={() => void beginCheckout(plan.id)}>{startingPlan === plan.id ? <><LoaderCircle className="animate-spin" aria-hidden="true" />Opening secure checkout…</> : currentPlan ? <>Current plan</> : billing?.entitlementActive ? <>Change to {plan.name}<ArrowRight aria-hidden="true" /></> : <>Choose {plan.name}<ArrowRight aria-hidden="true" /></>}</button> : billingConfig ? <Link className={`button mt-8 w-full ${plan.featured ? "button-primary" : "button-secondary"}`} to="/assessment#contact" onClick={() => trackAnalyticsEvent("free_first_report_click", { surface: "pricing" })}>Start your Free First Award<ArrowRight aria-hidden="true" /></Link> : <button type="button" className="button button-secondary mt-8 w-full" disabled><LoaderCircle className="animate-spin" aria-hidden="true" />Checking secure checkout…</button>}
        </article>;
      })}</div>
      <div className="pricing-comparison" aria-labelledby="plan-comparison-heading"><div className="pricing-comparison-heading"><p className="eyebrow">Compare plans</p><h2 id="plan-comparison-heading">One source-linked workflow, scaled for reporting demand</h2><p>Plan limits are defined once and applied consistently across GrantDeskHQ billing and workspace status.</p></div><div className="pricing-table-wrap" tabIndex={0} aria-label="Scrollable plan comparison"><table><thead><tr><th scope="col">Included</th>{PRICING_PLANS.map((plan) => <th scope="col" key={plan.id}>{plan.name}</th>)}</tr></thead><tbody><ComparisonRow label="Active grants" values={PRICING_PLANS.map((plan) => `Up to ${plan.activeGrants}`)} /><ComparisonRow label="Report packages per year" values={PRICING_PLANS.map((plan) => String(plan.reportsPerYear))} />{INCLUDED_IN_EVERY_PLAN.map((feature) => <ComparisonRow key={feature} label={feature} values={PRICING_PLANS.map(() => "Included")} checkmarks />)}</tbody></table></div></div>
    </section>
  </div>;
}

function Feature({ children }: { children: ReactNode }) { return <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emeraldMuted-600" aria-hidden="true" />{children}</li>; }
function ComparisonRow({ label, values, checkmarks = false }: { label: string; values: string[]; checkmarks?: boolean }) { return <tr><th scope="row">{label}</th>{values.map((value, index) => <td key={`${label}-${index}`}>{checkmarks ? <span className="comparison-check"><Check aria-hidden="true" />{value}</span> : value}</td>)}</tr>; }
