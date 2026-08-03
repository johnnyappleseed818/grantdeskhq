import { AlertTriangle, BookCopy, CheckCircle2, ShieldX } from "lucide-react";
import type { EvidenceDetail } from "../EvidenceDrawer";
import { StatusBadge } from "../StatusBadge";
import { approvedContentLibrary } from "../../data/grantData";
import { formatPercent, hasNumericContradiction, isUnsupportedStatement, youthAchievementPercentage } from "../../lib/calculations";
import { WorkspaceHeading } from "./AgencyOverview";

const sentences: Array<{ text: string; status: string; tone: "success" | "info" | "review" | "blocked"; evidence: EvidenceDetail }> = [
  {
    text: "Hope Community Services continued the Youth Access Initiative across its approved community-school service area during the first six months of 2026.",
    status: "Verified source fact",
    tone: "success",
    evidence: { title: "Approved program scope", source: "PYF_Youth_Access_Grant_Agreement.pdf", locator: "Page 3", excerpt: "The Youth Access Initiative will provide school-linked learning support within the approved community-school service area.", evidenceType: "Award term", confidence: "High", reviewerStatus: "Reviewed" }
  },
  {
    text: `The program served 118 youth, reaching ${formatPercent(youthAchievementPercentage(), 1)} of its six-month target of 120.`,
    status: "Calculated result",
    tone: "info",
    evidence: { title: "Youth-served result", source: "Program_Update_Form_June_2026", locator: "Responses 1–2", excerpt: "Six-month target: 120. Confirmed unduplicated youth served January 1 through June 30: 118.", evidenceType: "Confirmed program response plus calculation", confidence: "High", reviewerStatus: "Controller review needed" }
  },
  {
    text: "The program expanded into two additional schools after three additional school-site visits were approved by the Program Director.",
    status: "Confirmed program response",
    tone: "success",
    evidence: { title: "Program expansion", source: "Program_Update_Form_June_2026", locator: "Responses 3–4", excerpt: "Three additional school-site visits were approved. The initiative expanded into two additional schools.", evidenceType: "Confirmed program response", confidence: "High", reviewerStatus: "Reviewed" }
  },
  {
    text: "Two workshops were deferred into the next reporting period; the reason and corrective action still require confirmation from the Program Director.",
    status: "Needs confirmation",
    tone: "review",
    evidence: { title: "Deferred workshops", source: "Program_Update_Form_June_2026", locator: "Response 5", excerpt: "Two workshops were deferred to the next reporting period. Reason and corrective action: not yet provided.", evidenceType: "Incomplete program response", confidence: "Medium", reviewerStatus: "Needs program confirmation" }
  },
  {
    text: "Travel increased because of unexpected hotel costs.",
    status: "Unsupported and blocked",
    tone: "blocked",
    evidence: { title: "Unsupported hotel-cost claim", source: "Cross-source evidence check", locator: "Agreement, ledger, receipt schedule, and program update", excerpt: "No supplied synthetic source mentions a hotel, lodging, airfare, or overnight travel cost.", evidenceType: "Absence of supporting evidence", confidence: "Blocked", reviewerStatus: "Must not be exported" }
  }
];

export function NarrativeDraft({ onEvidence }: { onEvidence: (evidence: EvidenceDetail) => void }) {
  const wordCount = sentences.filter((sentence) => sentence.tone !== "blocked").flatMap((sentence) => sentence.text.split(/\s+/)).length;
  const contradiction = hasNumericContradiction(120, 118);
  const unsupported = isUnsupportedStatement(sentences[4].text);

  return (
    <div className="workspace-stack">
      <WorkspaceHeading eyebrow="Evidence-backed narrative" title="Every sentence has a visible review state" description="Click a sentence to inspect its synthetic source, locator, excerpt, evidence type, confidence, and reviewer status." />

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Section A · Program progress</p><h2>Six-month narrative draft</h2></div>
          <StatusBadge tone={wordCount <= 200 ? "success" : "blocked"}>{wordCount} / 200 words</StatusBadge>
        </div>
        <div className="sentence-list">
          {sentences.map((sentence, index) => (
            <button type="button" key={sentence.text} className={`sentence-row sentence-${sentence.tone}`} onClick={() => onEvidence(sentence.evidence)}>
              <span className="sentence-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="flex-1 text-left"><span className="block leading-7 text-slate-800">{sentence.text}</span><span className="mt-2 block"><StatusBadge tone={sentence.tone}>{sentence.status}</StatusBadge></span></span>
            </button>
          ))}
        </div>
        <p className="mt-5 text-xs text-slate-500">Blocked text is excluded from the draft word count and cannot enter the generated review package.</p>
      </section>

      <section className="contradiction-panel">
        <div className="flex items-start gap-3"><AlertTriangle aria-hidden="true" /><div><p className="eyebrow">Deliberate quality-control example</p><h2>Contradiction detected</h2></div></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="border border-redBlocked-200 bg-redBlocked-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-redBlocked-700">Draft statement</p>
            <blockquote className="mt-3 text-sm text-slate-800">“Hope Community Services served 120 youth during the first six months.”</blockquote>
            {contradiction && <p className="mt-3 flex gap-2 text-sm font-semibold text-redBlocked-700"><ShieldX className="h-5 w-5 shrink-0" aria-hidden="true" /> Contradiction detected: Program Update Form reports 118 youth served.</p>}
          </div>
          <div className="border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Suggested corrected statement</p>
            <blockquote className="mt-3 text-sm text-slate-800">“Hope Community Services served 118 youth during the first six months, reaching 98.3% of its six-month target.”</blockquote>
            <p className="mt-3 flex gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" /> Confirmed value plus tested calculation.</p>
          </div>
        </div>
        {unsupported && <p className="mt-4 text-xs text-slate-500">The same quality control identifies the unsupported hotel-cost sentence above and keeps it blocked.</p>}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Approved Content Library</p><h2>Previously approved synthetic client language</h2></div>
          <StatusBadge tone="neutral">Future workflow demonstration</StatusBadge>
        </div>
        <p className="mb-5 text-sm leading-6 text-slate-600">This panel demonstrates possible agency reuse. It does not claim autonomous learning or a live production content library.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {approvedContentLibrary.map((item) => (
            <article key={item.title} className="library-card">
              <div className="flex items-start justify-between gap-3"><BookCopy className="h-5 w-5 text-emeraldMuted-600" aria-hidden="true" /><StatusBadge tone="info">Reused from previously approved client content</StatusBadge></div>
              <h3 className="mt-4">{item.title}</h3>
              <dl className="mt-3 text-xs leading-5 text-slate-500"><div><dt>Client</dt><dd>{item.client}</dd></div><div><dt>Last approved</dt><dd>{item.approved}</dd></div><div><dt>Approved by</dt><dd>{item.approvedBy}</dd></div><div><dt>Source report</dt><dd>{item.source}</dd></div><div><dt>Review date</dt><dd>{item.reviewDate}</dd></div></dl>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
