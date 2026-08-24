import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, FilePlus2, FolderCheck, LoaderCircle, LogOut, MessageSquareText, ShieldCheck } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { trackAnalyticsEvent } from "../lib/analytics";
import type { SavedReportSummary } from "../types/prototype";

interface BillingStatus { planKey: string; subscriptionStatus: string; foundingPricingApplied: boolean; cancelAtPeriodEnd: boolean; entitlementActive: boolean; }
interface FunnelStatus { freeFirstAwardReportGeneratedAt: string; paid: boolean; }

export function WorkspacePage() {
  const { user, loading, token, signOut } = useAuth();
  const [reports, setReports] = useState<SavedReportSummary[]>([]);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [funnel, setFunnel] = useState<FunnelStatus | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const location = useLocation();
  const subscriptionTracked = useRef(false);

  useEffect(() => {
    if (!user) return;
    token().then(async (idToken) => Promise.all([
      apiRequest<{ reports: SavedReportSummary[] }>("/api/reports", idToken),
      apiRequest<{ billing: BillingStatus | null }>("/api/billing/status", idToken),
      apiRequest<{ funnel: FunnelStatus }>("/api/lifecycle/funnel-status", idToken)
    ]))
      .then(([reportBody, billingBody, funnelBody]) => { setReports(reportBody.reports); setBilling(billingBody.billing); setFunnel(funnelBody.funnel); })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Reports could not be loaded."))
      .finally(() => setFetching(false));
  }, [user, token]);

  useEffect(() => {
    if (subscriptionTracked.current || !billing?.entitlementActive || new URLSearchParams(location.search).get("billing") !== "success") return;
    subscriptionTracked.current = true;
    trackAnalyticsEvent("subscription_started", { surface: "account" });
  }, [billing?.entitlementActive, location.search]);

  const openPortal = async () => {
    if (!user) return;
    setPortalError("");
    setOpeningPortal(true);
    try {
      const result = await apiRequest<{ url: string }>("/api/billing/portal", await token(), { method: "POST", body: "{}" });
      window.location.assign(result.url);
    } catch (requestError) {
      setPortalError(requestError instanceof Error ? requestError.message : "Billing management could not be opened.");
      setOpeningPortal(false);
    }
  };

  if (loading) return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading workspace…</div>;
  if (!user) return <Navigate replace to="/login?next=/workspace" />;

  return <section className="workspace-page">
    <div className="site-shell py-10 lg:py-14">
      <header className="workspace-header">
        <div><p className="eyebrow">Post-award reporting workspace</p><h1>{user.displayName ? `${user.displayName}’s reports` : "Your reports"}</h1><p>Continue a review or let our AI-powered solution prepare the first draft for another funder report.</p></div>
        <div className="workspace-actions"><Link className="button button-secondary" to="/account">Account &amp; billing</Link><Link className="button button-secondary" to="/contact"><MessageSquareText aria-hidden="true" />Feedback</Link><button type="button" className="button button-secondary" onClick={() => signOut()}><LogOut aria-hidden="true" />Sign out</button><Link className="button button-primary" to="/compile?new=1" reloadDocument><FilePlus2 aria-hidden="true" />New report</Link></div>
      </header>
      {new URLSearchParams(location.search).get("billing") === "success" && <div className="account-notice" role="status"><strong>Checkout completed.</strong> Your subscription is being confirmed.</div>}
      {funnel?.freeFirstAwardReportGeneratedAt && !funnel.paid && <section className="funnel-upgrade-panel"><div><p className="eyebrow">Your Free First Award is complete</p><h2>Keep going with another award.</h2><p>Your report remains available here. Choose a plan when you are ready to prepare additional awards.</p></div><Link className="button button-primary" to="/pricing">Choose a plan <ArrowRight aria-hidden="true" /></Link></section>}
      {billing?.planKey && <div className="workspace-plan"><span>Current plan</span><strong>{billing.planKey.charAt(0).toUpperCase() + billing.planKey.slice(1)}</strong><small>{billing.subscriptionStatus === "active" ? "Subscription active" : billing.subscriptionStatus.replaceAll("_", " ")}</small>{billing.foundingPricingApplied && <small>Current price retained</small>}{billing.cancelAtPeriodEnd && <small>Cancellation scheduled at period end</small>}<button type="button" className="button button-secondary mt-3" disabled={openingPortal} onClick={() => void openPortal()}>{openingPortal ? "Opening billing management…" : "Manage billing"}</button></div>}
      {portalError && <div className="compiler-error" role="alert">{portalError}</div>}
      <div className="workspace-trust"><ShieldCheck aria-hidden="true" /><div><strong>Review the work that needs judgment, not every source from scratch.</strong><p>Output from our AI-powered solution stays connected to its evidence, and your reports, validation findings, and review decisions stay together in your workspace.</p></div></div>
      {error && <div className="compiler-error" role="alert"><AlertTriangle aria-hidden="true" />{error}</div>}
      {fetching ? <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading saved reports…</div> : reports.length === 0 ?
        <div className="workspace-empty"><FolderCheck aria-hidden="true" /><h2>No saved reports yet</h2><p>Upload an appropriately redacted grant agreement, budget, accounting export, funder form, and program update to prepare your first draft.</p><Link className="button button-primary" to="/compile?new=1" reloadDocument>Prepare your first report <ArrowRight aria-hidden="true" /></Link></div> :
        <div className="report-list">{reports.map((report) => <article key={report.id} className="report-row">
          <div><span className={`status-badge ${report.status === "ready" ? "status-success" : "status-review"}`}>{report.status === "ready" ? "Review complete" : "Review required"}</span><h2>{report.grantName}</h2><p>{report.organizationName} · {report.reportingPeriod}</p></div>
          <dl><div><dt>Source-supported</dt><dd>{report.evidenceCoveragePercent}%</dd></div><div><dt>Open items</dt><dd>{report.unresolvedItems}</dd></div><div><dt>Sources</dt><dd>{report.sourceCount}</dd></div><div><dt>Updated</dt><dd>{new Date(report.updatedAt).toLocaleDateString()}</dd></div></dl>
          <Link className="button button-primary report-continue" to={`/compile?report=${encodeURIComponent(report.id)}`}>Continue review <ArrowRight aria-hidden="true" /></Link>
        </article>)}</div>}
    </div>
  </section>;
}
