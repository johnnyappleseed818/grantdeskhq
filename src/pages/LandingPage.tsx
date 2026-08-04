import {
  ArrowRight,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  Database,
  FileSearch,
  FileText,
  Link2,
  MessageSquareText,
  ShieldCheck,
  TriangleAlert,
  Users
} from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { formatCurrency } from "../lib/calculations";

const compilerSteps = [
  ["01", "Avoid missing funder requirements", "AI reads the funder’s questions, word limits, spending thresholds, document rules, and required approvals before your team starts drafting."],
  ["02", "Prepare your documentation automatically", "GrantDeskHQ brings budgets, ledger rows, program updates, funder forms, and supporting documents into one organized review package."],
  ["03", "Cut down transaction-mapping work", "Get a suggested grant category for each transaction, together with the source or rule your reviewer needs to approve it."],
  ["04", "Start with a source-backed draft", "Give your reviewer a useful first draft built from confirmed information, with evidence attached to every material statement."],
  ["05", "Send fewer follow-up requests", "Ask program staff only for the answers and documents that are still missing instead of requesting information twice."],
  ["06", "Catch errors before they create rework", "Find contradictions, missing receipts, unexplained variances, and unsupported claims while they are still easy to correct."]
];

const capabilities = [
  [FileSearch, "Structure each funder report automatically", "AI turns the funder’s form and award rules into a clear reporting checklist for your team."],
  [MessageSquareText, "Draft with the evidence attached", "Give reviewers a useful starting point instead of a blank page, with the supporting source visible sentence by sentence."],
  [ClipboardCheck, "Cut down follow-up emails", "Ask program staff only for the answers or documents that are genuinely still missing."],
  [Calculator, "Explain variances faster", "See the transactions behind a material variance and draft an explanation from confirmed facts."],
  [ShieldCheck, "Catch errors before final review", "Find unsupported claims, inconsistent figures, missing receipts, and incomplete approvals earlier."]
];

const customerValue = [
  [Clock3, "Reduce manual overhead", "Spend less time copying figures between spreadsheets, templates, and narrative documents."],
  [ShieldCheck, "Reduce reporting errors", "Find missing support and conflicting information while there is still time to correct it."],
  [Users, "Free up team resources", "Give your team more time for client service, thoughtful review, and other high-priority work."]
];

const teamPriorities = [
  ["Grant accountant", "Spend less time rebuilding the same report", "Bring the funder form, approved budget, ledger export, and program update together so the first draft does not start from a blank page."],
  ["Nonprofit controller", "Find missing support before review gets delayed", "See open receipts, unexplained variances, conflicting figures, and unsupported statements in one focused review list."],
  ["Finance director", "Create more capacity without adding repetitive work", "Use AI for report preparation so the team has more time for forecasting, program support, and higher-value financial work."],
  ["Fractional CFO", "Give every client a consistent review process", "Standardize how the team prepares reporting packages while keeping the source evidence and final decisions visible."]
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
            <h1 className="hero-title">Build grant reports faster—with <span className="hero-highlight">less manual work.</span></h1>
            <p className="hero-copy">
              GrantDeskHQ uses AI to organize award terms, approved budgets, GL exports, funder forms, and program updates in one workspace—so nonprofit finance teams can reduce manual work, catch missing support earlier, and focus more of their time on the mission.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="button button-primary button-large" to="/demo">See GrantDeskHQ in action <ArrowRight aria-hidden="true" /></Link>
              <Link className="button button-secondary button-large" to="/sample-report">View the sample report</Link>
            </div>
            <p className="trust-line"><CheckCircle2 aria-hidden="true" /> Interactive demo using synthetic data · Your team approves every draft</p>
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
            <h2>Go from scattered files to a clear report draft</h2>
            <p>GrantDeskHQ brings the source material together and uses AI to complete the repetitive first pass, so your team can spend less time assembling reports and more time reviewing the work that matters.</p>
          </div>
          <div className="workflow-grid">
            {[
              [FileText, "Bring every source file into one place", "Add the award agreement, budget, ledger export, funder form, and program update once instead of working across scattered folders."],
              [BookOpenCheck, "Let AI prepare the report draft", "Get the reporting rules, suggested transaction mappings, calculated variances, and a source-backed narrative without building each section by hand."],
              [ClipboardCheck, "Review faster with evidence attached", "Focus on the few items that need judgment, then download the draft and its supporting documentation together."]
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

      <section id="compiler" className="section-block compiler-section bg-white">
        <div className="site-shell compiler-shell grid gap-14 lg:grid-cols-[.78fr_1.22fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow text-emerald-300">AI-powered, evidence-first</p>
            <h2 className="max-w-lg text-3xl font-semibold tracking-tight text-white md:text-4xl">Automate tedious manual work. Keep every decision in your hands.</h2>
            <p className="mt-5 max-w-lg leading-7 text-slate-300">
              GrantDeskHQ uses AI to read funder instructions, organize documents, suggest financial mappings, and prepare a sourced first draft—so your team can get to review sooner.
            </p>
            <div className="mt-7 border-l-2 border-emeraldMuted-500 pl-4 text-sm leading-6 text-slate-300">AI handles the repetitive preparation. Your finance team reviews the sources, makes the decisions, and approves the final work.</div>
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
            <p>GrantDeskHQ connects the numbers to the funder’s questions, documentation rules, program evidence, and your team’s review decisions.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

      <TeamPrioritiesCarousel />

      <section className="section-block bg-white">
        <div className="site-shell grid gap-12 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <p className="eyebrow">Keep the systems you already use</p>
            <h2 className="text-3xl font-semibold text-navy-900">Improve grant reporting without replacing your current tools</h2>
            <p className="mt-4 leading-7 text-slate-600">
              GrantDeskHQ adds an AI-powered reporting workflow around the systems your team already trusts, helping you improve the process without a disruptive migration.
            </p>
          </div>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {[
              [Database, "Accounting systems", "Keep the accounting system you already trust. GrantDeskHQ works from approved GL exports, so you can improve reporting without changing the books or adding a live connection."],
              [Link2, "Grant-management systems", "Avoid another system migration. Keep award records, deadlines, and funder access where they are while GrantDeskHQ helps prepare the report."],
              [FileText, "Program-data systems", "Use program results your team has already reviewed instead of asking staff to enter the same information in another system."],
              [TriangleAlert, "Professional judgment", "Give controllers a shorter, evidence-backed review list so they can focus on important decisions instead of chasing documents."]
            ].map(([Icon, title, copy]) => {
              const BoundaryIcon = Icon as typeof Database;
              return (
                <div key={title as string} className="system-value-row grid gap-3 py-5 sm:grid-cols-[32px_180px_1fr] sm:items-start">
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
            <h2 className="text-3xl font-semibold text-navy-900">See how AI can reduce your reporting workload.</h2>
            <p className="mt-3 text-slate-600">Explore the complete demo, or tell us which parts of grant reporting take the most time for your team.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="button button-primary button-large shrink-0" to="/demo">Open the demo <ArrowRight aria-hidden="true" /></Link>
            <Link className="button button-secondary button-large shrink-0" to="/assessment#contact">Assess your workflow</Link>
          </div>
        </div>
      </section>
    </>
  );
}

function ProductPreview() {
  return (
    <div className="product-preview-wrap">
    <div className="product-preview" aria-label="GrantDeskHQ synthetic product interface preview">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="text-xs font-semibold text-slate-500">Six-Month Progress Report</span>
        </div>
        <StatusBadge tone="info">Synthetic data</StatusBadge>
      </div>
      <div className="product-preview-body grid min-h-[430px] grid-cols-[116px_1fr]">
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

function TeamPrioritiesCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);

  const move = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * Math.max(280, track.clientWidth * 0.72), behavior: "smooth" });
  };

  return (
    <section className="team-priorities-section" aria-labelledby="team-priorities-title">
      <div className="site-shell">
        <div className="carousel-heading">
          <div className="section-heading">
            <p className="eyebrow">Common finance-team priorities</p>
            <h2 id="team-priorities-title">Give your team time back for work that matters</h2>
            <p>See how GrantDeskHQ is designed to reduce reporting overhead across common nonprofit finance roles.</p>
          </div>
          <div className="carousel-controls" aria-label="Finance-team priorities carousel controls">
            <button type="button" className="icon-button" aria-label="View previous priority" onClick={() => move(-1)}><ChevronLeft aria-hidden="true" /></button>
            <button type="button" className="icon-button" aria-label="View next priority" onClick={() => move(1)}><ChevronRight aria-hidden="true" /></button>
          </div>
        </div>
        <div ref={trackRef} className="priority-carousel" tabIndex={0} aria-label="Illustrative nonprofit finance-team priorities">
          {teamPriorities.map(([role, title, copy], index) => (
            <article className="priority-card" key={role}>
              <div className="priority-card-top"><span>Illustrative use case</span><strong>0{index + 1}</strong></div>
              <h3>{title}</h3>
              <p>{copy}</p>
              <div className="priority-role"><Users aria-hidden="true" /> {role}</div>
            </article>
          ))}
        </div>
        <p className="carousel-disclosure">Role-based scenarios for demonstration; no customer endorsement is implied.</p>
      </div>
    </section>
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
