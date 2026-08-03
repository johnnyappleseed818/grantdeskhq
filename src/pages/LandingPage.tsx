import {
  ArrowRight,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
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
  ["01", "Understand the funder format", "Extract the required sections, field types, word limits, thresholds, and certification rules from the synthetic award package."],
  ["02", "Combine financial and program evidence", "Bring budget lines, ledger rows, template fields, source documents, and structured program responses into one review workspace."],
  ["03", "Identify missing information", "Generate focused follow-up questions only when the supplied evidence cannot establish a required answer."],
  ["04", "Draft source-supported content", "Compose narrative suggestions from confirmed facts and calculated results, with visible citations at sentence level."],
  ["05", "Show the evidence trail", "Open the source document, page, transaction, excerpt, confidence, and reviewer status behind a mapping or statement."],
  ["06", "Block unsupported claims", "Prevent unresolved contradictions and unsupported narrative claims from entering the generated review package."]
];

const capabilities = [
  [FileSearch, "Funder-template understanding", "Translate the funder’s own blank form into a structured, cited reporting schema."],
  [MessageSquareText, "Evidence-backed narrative drafting", "Connect each suggested sentence to confirmed program facts, transactions, or calculated results."],
  [ClipboardCheck, "Intelligent missing-input collection", "Ask the program team only for required details that the source package cannot establish."],
  [Calculator, "Variance explanation workflow", "Compare actuals with the elapsed-period plan and surface the transactions driving material differences."],
  [ShieldCheck, "Pre-export quality controls", "Hold the review package when a receipt, mapping, certification, or supported statement still needs attention."]
];

export function LandingPage() {
  return (
    <>
      <section className="hero-section">
        <div className="site-shell grid items-center gap-12 py-16 lg:grid-cols-[1.02fr_.98fr] lg:py-24">
          <div>
            <div className="prototype-pill"><span aria-hidden="true" /> Interactive prototype using synthetic demonstration data</div>
            <h1 className="hero-title">Turn Grant Source Files into an Evidence-Backed Funder-Report Draft.</h1>
            <p className="hero-copy">
              GrantDesk helps outsourced nonprofit finance teams combine award agreements, approved budgets, GL exports, funder templates, and program updates into review-ready reporting packages—with every figure and narrative claim linked to its source.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="button button-primary button-large" to="/demo">Explore Interactive Demo <ArrowRight aria-hidden="true" /></Link>
              <Link className="button button-secondary button-large" to="/sample-report">View Synthetic Sample Report</Link>
            </div>
            <p className="trust-line"><CheckCircle2 aria-hidden="true" /> Interactive prototype · Synthetic data · Human approval required</p>
          </div>

          <ProductPreview />
        </div>
      </section>

      <section id="how-it-works" className="section-block bg-white">
        <div className="site-shell">
          <div className="section-heading">
            <p className="eyebrow">A controlled reporting workflow</p>
            <h2>From fragmented source package to reviewable draft</h2>
            <p>Designed for fractional nonprofit CFOs, outsourced accounting practices, and controller teams managing completed post-award reporting work.</p>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden border border-slate-200 bg-slate-200 md:grid-cols-3">
            {[
              [FileText, "Assemble", "Add the synthetic agreement, approved budget, ledger export, blank funder form, and structured program update."],
              [BookOpenCheck, "Compile", "Review extracted requirements, suggested financial mappings, calculated variances, and missing information."],
              [ClipboardCheck, "Approve", "Resolve open evidence items and generate a controller-review package—never an automatic submission."]
            ].map(([Icon, title, copy], index) => {
              const StepIcon = Icon as typeof FileText;
              return (
                <article className="bg-white p-7" key={title as string}>
                  <div className="flex items-center justify-between">
                    <span className="icon-tile"><StepIcon aria-hidden="true" /></span>
                    <span className="text-xs font-bold tracking-widest text-slate-400">0{index + 1}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-navy-900">{title as string}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{copy as string}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="compiler" className="section-block bg-navy-950 text-white">
        <div className="site-shell grid gap-14 lg:grid-cols-[.78fr_1.22fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow text-emerald-300">AI Report Compiler</p>
            <h2 className="max-w-lg text-3xl font-semibold tracking-tight text-white md:text-4xl">Structure first. Evidence always visible.</h2>
            <p className="mt-5 max-w-lg leading-7 text-slate-300">
              The differentiator is not generic document extraction. GrantDesk models the funder’s required format, compiles only supported content, and keeps professional judgment at the approval point.
            </p>
            <div className="mt-7 border-l-2 border-emeraldMuted-500 pl-4 text-sm leading-6 text-slate-300">
              Prototype behavior is simulated deterministically. This website does not imply that a production AI backend exists.
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
            <p className="eyebrow">Reporting context, not another ledger</p>
            <h2>More Than Budget vs. Actuals</h2>
            <p>Financial totals matter. So do the funder’s questions, program evidence, documentation rules, and the controller’s review decisions.</p>
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
            <p className="eyebrow">Clear boundaries</p>
            <h2 className="text-3xl font-semibold text-navy-900">What GrantDesk Does Not Replace</h2>
            <p className="mt-4 leading-7 text-slate-600">
              GrantDesk is a draft and evidence-assembly layer for post-award reporting. It does not discover grants, write proposals, keep the general ledger, perform an audit, determine compliance, or submit reports.
            </p>
          </div>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {[
              [Database, "Accounting systems", "QuickBooks, Sage Intacct, NetSuite, and other systems remain the books of record."],
              [Link2, "Grant-management systems", "Existing award records, workflows, and funder portals remain authoritative."],
              [FileText, "Program-data systems", "Service counts and program outcomes continue to come from reviewed program sources."],
              [TriangleAlert, "Professional judgment", "Controllers and finance professionals review mappings, explanations, support, and final outputs."]
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

      <section className="bg-emeraldMuted-50 py-16">
        <div className="site-shell flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <p className="eyebrow">See the evidence trail</p>
            <h2 className="text-3xl font-semibold text-navy-900">Review the synthetic six-month report package.</h2>
            <p className="mt-3 text-slate-600">Explore the complete workflow before discussing a founding agency pilot.</p>
          </div>
          <Link className="button button-primary button-large shrink-0" to="/demo">Open the demo <ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>
    </>
  );
}

function ProductPreview() {
  return (
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
