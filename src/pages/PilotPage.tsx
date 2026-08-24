import { ArrowRight, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { trackAnalyticsEvent } from "../lib/analytics";
import { useAuth } from "../lib/auth";

/** The public, canonical entry to the actual product workflow. */
export function PilotPage() {
  const { user, loading } = useAuth();
  const destination = user ? "/compile?new=1" : `/login?next=${encodeURIComponent("/compile?new=1")}`;
  return <div className="assessment-page">
    <section className="assessment-hero"><div className="site-shell">
      <div className="prototype-pill"><span aria-hidden="true" /> Free First Award · no credit card</div>
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <p className="eyebrow">Free First Award</p>
          <h1 className="page-title">Prepare your first award free.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">Bring the award agreement and whatever else you have. GrantDeskHQ turns the agreement, budget, accounting data, program updates, and evidence into a source-linked report draft your team reviews before anything is submitted.</p>
          <p className="mt-4 font-semibold text-slate-800">Use one real award at no cost. No sales call required.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="button button-primary button-large" to={destination} onClick={() => trackAnalyticsEvent("free_first_report_click", { surface: "assessment" })}>{loading ? "Loading your secure start…" : user ? "Start your Free First Award" : "Try your first award free"}<ArrowRight aria-hidden="true" /></Link>
            <Link className="button button-secondary button-large" to="/sample-report">See a sample report</Link>
          </div>
        </div>
        <aside className="assessment-summary"><ShieldCheck aria-hidden="true" /><h2>Start with what you have</h2><ul><li><CheckCircle2 aria-hidden="true" />Award agreement or Notice of Award — needed first</li><li><CheckCircle2 aria-hidden="true" />Budget and ledger export — add now or later</li><li><CheckCircle2 aria-hidden="true" />Program update, funder form, and evidence — add when available</li></ul><p>Missing inputs are shown as gaps. GrantDeskHQ never fills them in for you.</p></aside>
      </div>
    </div></section>
    <section className="assessment-process"><div className="site-shell"><p className="eyebrow">How it works</p><div className="grid gap-5 md:grid-cols-3"><article><FileText aria-hidden="true" /><h2>Add the award materials</h2><p>Upload the agreement first, then add the financial and program material you already have.</p></article><article><FileText aria-hidden="true" /><h2>See what is ready and what is missing</h2><p>Requirements, mapping, evidence, and review gaps stay connected to their sources.</p></article><article><FileText aria-hidden="true" /><h2>Review your first report</h2><p>After your first report is generated, choose a plan only if you want to continue with more awards.</p></article></div></div></section>
  </div>;
}
