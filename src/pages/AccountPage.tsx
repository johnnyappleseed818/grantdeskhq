import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CreditCard, LoaderCircle, MessageSquareText, Save, ShieldCheck, UserRound } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { PRICING_PLANS, formatUsd, type PlanId } from "../content/pricing";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";

interface BillingStatus {
  planKey: PlanId;
  subscriptionStatus: string;
  foundingPricingApplied: boolean;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  entitlementActive: boolean;
}

function billingStatusLabel(status: string) {
  if (status === "active") return "Active";
  if (status === "trialing") return "Trialing";
  if (status === "past_due") return "Past due";
  if (status === "canceled") return "Canceled";
  return status ? status.replaceAll("_", " ") : "Not available";
}

function billingDate(value: string) {
  if (!value) return "Not available yet";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not available yet" : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
}

/** Authenticated account and billing self-service. Card details stay entirely in Stripe Customer Portal. */
export function AccountPage() {
  const { user, loading, token, updateDisplayName } = useAuth();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState("");
  const [openingPortal, setOpeningPortal] = useState(false);
  const [name, setName] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => setName(user?.displayName || ""), [user?.displayName]);

  useEffect(() => {
    if (!user) return;
    setBillingLoading(true);
    token().then((idToken) => apiRequest<{ billing: BillingStatus | null }>("/api/billing/status", idToken))
      .then((body) => setBilling(body.billing))
      .catch((error) => setBillingError(error instanceof Error ? error.message : "Billing details could not be loaded."))
      .finally(() => setBillingLoading(false));
  }, [user, token]);

  const plan = useMemo(() => billing ? PRICING_PLANS.find((item) => item.id === billing.planKey) || null : null, [billing]);
  const currentMonthlyPrice = plan ? (billing?.foundingPricingApplied ? plan.foundingMonthly : plan.monthly) : null;

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileError("");
    setProfileSaved(false);
    try {
      await updateDisplayName(name);
      setProfileSaved(true);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Your profile could not be updated.");
    }
  };

  const openPortal = async () => {
    setBillingError("");
    setOpeningPortal(true);
    try {
      const result = await apiRequest<{ url: string }>("/api/billing/portal", await token(), { method: "POST", body: "{}" });
      window.location.assign(result.url);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Billing management could not be opened.");
      setOpeningPortal(false);
    }
  };

  if (loading) return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading account…</div>;
  if (!user) return <Navigate replace to="/login?next=/account" />;

  return <section className="workspace-page">
    <div className="site-shell py-10 lg:py-14">
      <header className="workspace-header">
        <div><p className="eyebrow">Account settings</p><h1>Manage your account</h1><p>Update your profile, review your subscription, and use secure billing self-service.</p></div>
        <div className="workspace-actions"><Link className="button button-secondary" to="/workspace">My workspace</Link><Link className="button button-secondary" to="/contact"><MessageSquareText aria-hidden="true" />Contact &amp; feedback</Link></div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel" aria-labelledby="profile-heading">
          <div className="flex items-start gap-3"><UserRound aria-hidden="true" className="mt-1 text-emerald-700" /><div><p className="eyebrow">Profile</p><h2 id="profile-heading">Your account details</h2></div></div>
          <form className="mt-5 grid gap-4" onSubmit={(event) => void saveProfile(event)}>
            <label className="form-field"><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={120} /></label>
            <label className="form-field"><span>Login email</span><input aria-label="Login email" value={user.email || ""} readOnly aria-readonly="true" autoComplete="email" /><small>Your login email is managed through the secure authentication flow and cannot be changed here.</small></label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"><strong className="text-slate-800">Organization and contact email</strong><p className="mt-1">Organization details remain attached to each report so they do not overwrite grant-specific records. Your secure login email is also the contact email currently associated with this account.</p></div>
            {profileError && <p className="compiler-error" role="alert">{profileError}</p>}
            {profileSaved && <p className="account-notice" role="status">Profile saved.</p>}
            <button className="button button-secondary w-fit" type="submit"><Save aria-hidden="true" />Save name</button>
          </form>
        </section>

        <section className="panel" aria-labelledby="billing-heading">
          <div className="flex items-start gap-3"><CreditCard aria-hidden="true" className="mt-1 text-emerald-700" /><div><p className="eyebrow">Billing</p><h2 id="billing-heading">Subscription self-service</h2></div></div>
          {billingLoading ? <div className="workspace-loading mt-5"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading billing details…</div> : billing ? <dl className="mt-5 grid gap-4 text-sm"><div><dt className="font-semibold text-slate-800">Current plan</dt><dd>{plan?.name || billing.planKey}</dd></div><div><dt className="font-semibold text-slate-800">Current price</dt><dd>{currentMonthlyPrice === null ? "Not available" : `${formatUsd(currentMonthlyPrice)}/month`}</dd></div><div><dt className="font-semibold text-slate-800">Subscription status</dt><dd>{billingStatusLabel(billing.subscriptionStatus)}</dd></div><div><dt className="font-semibold text-slate-800">Next billing date</dt><dd>{billingDate(billing.currentPeriodEnd)}</dd></div>{billing.cancelAtPeriodEnd && <div className="account-notice"><strong>Cancellation scheduled.</strong> Your subscription remains active through the current billing period.</div>}<div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-600"><strong className="text-slate-800">Manage billing securely in Stripe</strong><p className="mt-1">Update a payment method, view invoices, or cancel your subscription using the options enabled in your secure billing portal. GrantDeskHQ never receives your card details.</p></div><button className="button button-primary w-fit" type="button" disabled={openingPortal} onClick={() => void openPortal()}>{openingPortal ? "Opening billing management…" : "Manage billing"}</button></dl> : <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"><strong className="text-slate-800">No active subscription is recorded.</strong><p className="mt-1">You can still use the Free First Award flow. Choose a plan from pricing when you are ready.</p><Link className="button button-secondary mt-4" to="/pricing">View pricing</Link></div>}
          {billingError && <p className="compiler-error mt-4" role="alert"><AlertTriangle aria-hidden="true" />{billingError}</p>}
        </section>
      </div>

      <section className="workspace-trust mt-6"><ShieldCheck aria-hidden="true" /><div><strong>Billing actions stay protected.</strong><p>Account and billing data require an authenticated session. Portal sessions are created server-side for the Stripe customer mapped to your GrantDeskHQ account.</p></div></section>
    </div>
  </section>;
}
