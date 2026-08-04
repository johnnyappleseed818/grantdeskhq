import {
  ArrowRight,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Database,
  FileSearch,
  FileText,
  Link2,
  MessageSquareText,
  ShieldCheck,
  TriangleAlert
} from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { formatCurrency } from "../lib/calculations";

const compilerSteps = [
  ["01", "Read the funder’s format", "AI identifies the questions, word limits, spending thresholds, documentation rules, and required sign-offs in each award package."],
  ["02", "Organize the evidence", "Budgets, ledger rows, program updates, funder forms, and supporting documents come together in one review workspace."],
  ["03", "Suggest financial mappings", "GrantDesk proposes a grant category for each transaction and shows the rule or source behind the suggestion."],
  ["04", "Draft from confirmed facts", "Narrative suggestions use the information your team has already confirmed, with a source attached to every material statement."],
  ["05", "Ask only for what is missing", "Program staff receive focused questions instead of another broad request for information your finance team already has."],
  ["06", "Catch problems before rework", "Contradictions, missing receipts, unexplained variances, and unsupported claims are surfaced before the package leaves your team."]
];

const capabilities = [
  [FileSearch, "Stop rebuilding funder formats", "AI turns each funder’s form and award rules into a clear reporting checklist for your team."],
  [MessageSquareText, "Start with a sourced draft", "Give reviewers a useful first draft instead of a blank page, with evidence visible sentence by sentence."],
  [ClipboardCheck, "Send fewer follow-up emails", "Ask program staff for the specific answers or documents that are genuinely still missing."],
  [Calculator, "Explain variances faster", "See the transactions behind a material variance and draft an explanation from confirmed facts."],
  [ShieldCheck, "Reduce avoidable review errors", "Catch unsupported claims, inconsistent figures, missing receipts, and incomplete approvals earlier."]
];

const customerValue = [
  [Clock3, "Less manual assembly", "Spend less time copying figures between spreadsheets, templates, and narrative documents."],
  [ShieldCheck, "Fewer avoidable errors", "Surface missing support and conflicting information while there is still time to fix it."],
  [Calculator, "More capacity, less admin cost", "Use team time for review and advice instead of repeat data entry, helping keep the internal cost of each report under control."]
];

export function LandingPage() {
  return (
    <>
      <section className="hero-section">
        <div className="hero-shape hero-shape-one" aria-hidden="true" />
        <div className="hero-shape hero-shape-two" aria-hidden="true" />
        <div className="site-shell relative z-10 grid items-center gap-12 py-16 lg:grid-cols-[1.02fr_.98fr] lg:py-24">
          <div>
            <div className="prototype-pill"><span aria-hidden="true" /> AI-powered post-award reporting</div>
            <h1 className="hero-title">Spend less time <span className="hero-highlight">building grant reports.</span> Catch more before review.</h1>
            <p className="hero-copy">
              GrantDesk uses AI to organize award terms, approved budgets, GL exports, funder forms, and program updates in one workspace—so outsourced finance teams can reduce manual work, catch missing support earlier, and spend more time helping clients.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="button button-primary button-large" to="/demo">See GrantDesk in action <ArrowRight aria-hidden="true" /></Link>
              <Link className="button button-secondary button-large" to="/sample-report">View the sample report</Link>
            </div>
            <p className="trust-line"><CheckCircle2 aria-hidden="true" /> Interactive prototype using synthetic data · Every draft stays under human control</p>
          </div>

          <ProductPreview />
        </div>
        <div className="site-shell relative z-10 pb-12 lg:pb-16">
          <div className="value-strip">
            {customerValue.map(([Icon, title, copy]) => {
              const ValueIcon = Icon as typeof Clock3;
              return (
                <article key={title as string} className="value-item">
                  <span className="value-icon"><ValueIcon aria-hidden="true" /></span>
                  <div>
                    <h2>{title as string}</h2>
                    <p>{copy as string}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="section-block bg-white">
        <div className="site-shell">
          <div className="section-heading">
            <p className="eyebrow">How it helps</p>
            <h2>A cleaner path from source files to a report draft</h2>
            <p>Reporting evidence lives in too many places. GrantDesk brings it together and handles the repetitive first pass, so your team can focus on the decisions that need experience and judgment.</p>
          </div>
          <div className="workflow-grid">
            {[
              [FileText, "Bring the work together", "Add the award agreement, budget, ledger export, funder form, and program update to one organized workspace."],
              [BookOpenCheck, "Let AI handle the first pass", "Get extracted reporting rules, suggested transaction mappings, calculated variances, and a source-backed narrative draft."],
              [ClipboardCheck, "Review what matters", "Clear the few items that need attention, then download a complete review package with the supporting evidence organized alongside it."]
            ].map(([Icon, title, copy], index) => {
              const StepIcon = Icon as typeof FileText;
              return (
                <article className="workflow-card" key={title as string}>
                  <div className="flex items-center justify-between">
                    <span className="icon-tile"><StepIcon aria-hidden="true" /></span>
                    <span className="step-number">0{index + 1}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-navy-900">{title as string}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{copy as string}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="compiler" className="section-block bg-white">
        <div className="site-shell compiler-shell grid gap-14 lg:grid-cols-[.78fr_1.22fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow text-emerald-300">AI-powered, evidence-first</p>
            <h2 className="max-w-lg text-3xl font-semibold tracking-tight text-white md:text-4xl">Automate the tedious parts without losing control.</h2>
            <p className="mt-5 max-w-lg leading-7 text-slate-300">
              GrantDesk handles the repetitive first pass: reading requirements, organizing evidence, suggesting mappings, and preparing a sourced draft. Your team stays in control of every judgment and approval.
            </p>
            <div className="mt-7 border-l-2 border-emeraldMuted-500 pl-4 text-sm leading-6 text-slate-300">
              This demo uses deterministic synthetic data to show the intended AI workflow. A production AI service is not connected to this public website.
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {compilerSteps.map(([number, title, copy]) => (
              <article key={number} className="compiler-card">
                <span className="font-mono text-xs font-bold text-emerald-300">{number}</span>
                <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-block bg-canvas">
        <div className="site-shell">
          <div className="section-heading">
            <p className="eyebrow">Built for the whole reporting package</p>
            <h2>Less rework. More confidence in every draft.</h2>
            <p>GrantDesk connects the numbers to the funder’s questions, documentation rules, program evidence, and your team’s review decisions.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {capabilities.map(([Icon, title, copy]) => {
              const CapabilityIcon = Icon as typeof FileSearch;
              return (
                <article key={title as string} className="capability-card">
                  <CapabilityIcon className="h-5 w-5 text-emeraldMuted-600" aria-hidden="true" />
                  <h3>{title as string}</h3>
                  <p>{copy as string}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section-block bg-white">
        <div className="site-shell grid gap-12 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <p className="eyebrow">Works with your existing process</p>
            <h2 className="text-3xl font-semibold text-navy-900">Fits into the tools and judgment you already trust</h2>
            <p className="mt-4 leading-7 text-slate-600">
              GrantDesk helps your team prepare post-award drafts and organize the evidence behind them. It works alongside your accounting and program systems; it does not replace the books, professional review, or your funder’s submission process.
            </p>
          </div>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {[
              [Database, "Accounting systems", "Your accounting system remains the book of record; GrantDesk helps turn its approved data into the funder’s reporting format."],
              [Link2, "Grant-management systems", "Keep using your existing award records, workflows, deadlines, and funder portals."],
              [FileText, "Program-data systems", "Program results still come from sources your team knows and has reviewed."],
              [TriangleAlert, "Professional judgment", "Controllers and finance professionals remain responsible for mappings, explanations, supporting evidence, and final approval."]
            ].map(([Icon, title, copy]) => {
              const BoundaryIcon = Icon as typeof Database;
              return (
                <div key={title as string} className="grid gap-3 py-5 sm:grid-cols-[32px_180px_1fr] sm:items-start">
                  <BoundaryIcon className="mt-0.5 h-5 w-5 text-emeraldMuted-600" aria-hidden="true" />
                  <h3 className="text-base font-semibold text-navy-900">{title as string}</h3>
                  <p className="text-sm leading-6 text-slate-600">{copy as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="site-shell flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <p className="eyebrow">See it for yourself</p>
            <h2 className="text-3xl font-semibold text-navy-900">See where AI can take work off your team’s plate.</h2>
            <p className="mt-3 text-slate-600">Explore the complete synthetic workflow, or tell us where grant reporting slows your team down.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="button button-primary button-large shrink-0" to="/demo">Open the demo <ArrowRight aria-hidden="true" /></Link>
            <Link className="button button-secondary button-large shrink-0" to="/pilot#contact">Contact us</Link>
          </div>
        </div>
      </section>
    </>
  );
}

function ProductPreview() {
  return (
    <div className="product-preview-wrap">
    <div className="product-preview" aria-label="GrantDesk synthetic product interface preview">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="text-xs font-semibold text-slate-500">Six-Month Progress Report</span>
        </div>
        <StatusBadge tone="info">Synthetic data</StatusBadge>
      </div>
      <div className="grid min-h-[430px] grid-cols-[116px_1fr]">
        <div className="border-r border-slate-200 bg-navy-950 p-3 text-[10px] text-slate-400">
          <p className="mb-4 font-semibold text-white">Northstar Finance</p>
          {[
            "Sources",
            "Requirements",
            "Mapping",
            "Narrative",
            "Quality"
          ].map((item, index) => (
            <div key={item} className={`mb-1 rounded px-2 py-2 ${index === 4 ? "bg-white/10 text-white" : ""}`}>{item}</div>
          ))}
        </div>
        <div className="bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] uppercase tracking-widest text-slate-400">Quality review</p><p className="mt-1 text-sm font-semibold text-navy-900">3 items require review</p></div>
            <div className="text-right"><p className="text-[10px] text-slate-400">Mapped actuals</p><p className="text-sm font-semibold text-navy-900">{formatCurrency(74150)}</p></div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {["Requirements", "Evidence", "Narrative"].map((item, index) => (
              <div key={item} className="border border-slate-200 p-2">
                <span className="text-[9px] text-slate-400">{item}</span>
                <strong className="mt-1 block text-sm text-navy-900">{[6, 19, 147][index]}</strong>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-2">
            <PreviewCheck label="Budget totals reconcile" tone="success" />
            <PreviewCheck label="$1,250 unmapped transaction" tone="review" />
            <PreviewCheck label="TRV-003 receipt missing" tone="review" />
            <PreviewCheck label="Unsupported hotel-cost claim" tone="blocked" />
          </div>
          <div className="mt-5 border border-redBlocked-200 bg-redBlocked-50 p-3">
            <div className="flex gap-2 text-[11px] font-semibold text-redBlocked-700"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Claim blocked before export</div>
            <p className="mt-1 text-[10px] leading-4 text-redBlocked-700">No source supports unexpected hotel costs.</p>
          </div>
        </div>
      </div>
    </div>
    <div className="preview-note"><ShieldCheck aria-hidden="true" /> Sources stay visible as your team reviews</div>
    </div>
  );
}

function PreviewCheck({ label, tone }: { label: string; tone: "success" | "review" | "blocked" }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-[11px]">
      <span className="text-slate-600">{label}</span>
      <span className={`h-2 w-2 rounded-full ${tone === "success" ? "bg-emeraldMuted-500" : tone === "review" ? "bg-amber-500" : "bg-redBlocked-700"}`} />
    </div>
  );
}
