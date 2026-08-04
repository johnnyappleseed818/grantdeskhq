import { Check, CheckCircle2, FileOutput, LockKeyhole, TriangleAlert } from "lucide-react";
import type { RequiredReviewState } from "../../lib/calculations";
import { canGenerateReviewPackage, unresolvedReviewCount } from "../../lib/calculations";
import { StatusBadge } from "../StatusBadge";
import { WorkspaceHeading } from "./AgencyOverview";

interface Props {
  reviewState: RequiredReviewState;
  onResolve: (item: keyof RequiredReviewState) => void;
  onGenerate: () => void;
}

const passedChecks = [
  "Budget totals reconcile",
  "Mapped actuals reconcile",
  "Travel variance identified",
  "Program-supply variance explanation drafted",
  "Narrative word limit met",
  "Youth-served contradiction detected",
  "Unsupported hotel-cost claim blocked",
  "Every included material statement has evidence"
];

const reviewItems: Array<{ key: keyof RequiredReviewState; label: string; detail: string; action: string }> = [
  { key: "unmappedTransaction", label: "$1,250 unmapped transaction", detail: "Community Events LLC has no class or grant tag and remains excluded from the initial $74,150 mapped actuals.", action: "Map and approve UNM-001" },
  { key: "missingReceipt", label: "Missing receipt for TRV-003", detail: "The $3,450 local-travel transaction has written justification but still requires an itemized receipt.", action: "Mark synthetic receipt received" },
  { key: "certification", label: "Final certification not signed", detail: "The funder template requires an authorized certification before any external submission.", action: "Mark demo certification signed" }
];

export function QualityReview({ reviewState, onResolve, onGenerate }: Props) {
  const unresolved = unresolvedReviewCount(reviewState);
  const enabled = canGenerateReviewPackage(reviewState);

  return (
    <div className="workspace-stack">
      <WorkspaceHeading eyebrow="Final quality check" title={enabled ? "Your review package is ready" : `Finish ${unresolved} items before downloading the package`} description="GrantDeskHQ puts every remaining decision in one short list, helping your team fix missing support and inconsistent information without searching through the full report." />

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Completed checks</p><h2>Totals and supporting evidence checked</h2></div><StatusBadge tone="success">{passedChecks.length} passed</StatusBadge></div>
          <ul className="check-list">
            {passedChecks.map((check) => <li key={check}><CheckCircle2 aria-hidden="true" /><span>{check}</span></li>)}
          </ul>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Your decisions</p><h2>Items that still need attention</h2></div><StatusBadge tone={unresolved ? "review" : "success"}>{unresolved} open</StatusBadge></div>
          <div className="space-y-3">
            {reviewItems.map((item) => {
              const resolved = reviewState[item.key];
              return (
                <article key={item.key} className={`review-item ${resolved ? "is-resolved" : ""}`}>
                  <div className="flex items-start gap-3">{resolved ? <CheckCircle2 className="text-emeraldMuted-600" aria-hidden="true" /> : <TriangleAlert className="text-amberReview-700" aria-hidden="true" />}<div><h3>{item.label}</h3><p>{item.detail}</p></div></div>
                  <button type="button" className="button button-secondary button-small mt-4" disabled={resolved} onClick={() => onResolve(item.key)}>{resolved ? <><Check aria-hidden="true" /> Resolved locally</> : item.action}</button>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <section className={`export-gate ${enabled ? "is-enabled" : ""}`}>
        <div className="flex items-start gap-4">{enabled ? <FileOutput aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}<div><p className="eyebrow">Review package</p><h2>{enabled ? "Every required check is complete." : "Complete the remaining checks first."}</h2><p>{enabled ? "Create the synthetic package, then inspect every output before professional use." : `Finish ${unresolved} item${unresolved === 1 ? "" : "s"}, then download the draft and supporting evidence together.`}</p></div></div>
        <button type="button" className="button button-primary button-large" disabled={!enabled} onClick={onGenerate}>Generate Review Package</button>
      </section>

      <p className="prototype-note">These buttons change only this demo. In real work, your team would still verify the ledger, inspect the documents, complete the certification, and decide when the report is ready.</p>
    </div>
  );
}
