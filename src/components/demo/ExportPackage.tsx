import { Download, FileCheck2, FileOutput, LockKeyhole } from "lucide-react";
import { StatusBadge } from "../StatusBadge";
import { WorkspaceHeading } from "./AgencyOverview";

const outputs = [
  { label: "Funder-formatted report draft", detail: "PDF · narrative, BVA, program results, and open-review disclosures", href: "/samples/Synthetic_Funder_Report_Draft.pdf" },
  { label: "Budget-versus-actual workbook", detail: "XLSX · approved budget, elapsed plan, actuals, balance, and variance", href: "/samples/Approved_Grant_Budget.xlsx" },
  { label: "Transaction evidence schedule", detail: "XLSX · all 20 transactions, mapping evidence, confidence, and review status", href: "/samples/Transaction_Evidence_Schedule.xlsx" },
  { label: "Travel receipt checklist", detail: "Included in the transaction evidence workbook", href: "/samples/Transaction_Evidence_Schedule.xlsx" },
  { label: "Missing-input record", detail: "Included in the funder-formatted report draft", href: "/samples/Synthetic_Funder_Report_Draft.pdf" },
  { label: "Source and citation log", detail: "Included in the transaction evidence workbook", href: "/samples/Transaction_Evidence_Schedule.xlsx" },
  { label: "Controller review checklist", detail: "Included in the funder-formatted report draft", href: "/samples/Synthetic_Funder_Report_Draft.pdf" }
];

interface Props { enabled: boolean; generated: boolean; unresolved: number; onOpenQuality: () => void; onGenerate: () => void }

export function ExportPackage({ enabled, generated, unresolved, onOpenQuality, onGenerate }: Props) {
  return (
    <div className="workspace-stack">
      <WorkspaceHeading eyebrow="Export package" title="Everything your reviewer needs, organized" description="Download the draft, financial schedules, supporting evidence, and review checklist together. The synthetic files are prepared for professional review and are not sent to a funder." />

      {!enabled ? (
        <section className="export-gate">
          <div className="flex items-start gap-4"><LockKeyhole aria-hidden="true" /><div><p className="eyebrow">Finish your review</p><h2>Complete the remaining checks before download</h2><p>{unresolved} item{unresolved === 1 ? "" : "s"} still need your team’s attention.</p></div></div>
          <button type="button" className="button button-secondary" onClick={onOpenQuality}>Open Quality Review</button>
        </section>
      ) : !generated ? (
        <section className="export-gate is-enabled">
          <div className="flex items-start gap-4"><FileOutput aria-hidden="true" /><div><p className="eyebrow">Ready to download</p><h2>Create the complete review package</h2><p>Bring the draft, schedules, evidence, and checklist together for your reviewer.</p></div></div>
          <button type="button" className="button button-primary" onClick={onGenerate}>Generate Review Package</button>
        </section>
      ) : (
        <section className="border border-emerald-200 bg-emerald-50 p-5"><div className="flex gap-3"><FileCheck2 className="text-emerald-700" aria-hidden="true" /><div><h2 className="text-lg font-semibold text-emerald-900">Your synthetic review package is ready</h2><p className="mt-1 text-sm text-emerald-800">The demonstration files are ready to download and review.</p></div></div></section>
      )}

      <section className="panel panel-flush">
        <div className="panel-heading px-5 pt-5"><div><p className="eyebrow">Everything in one package</p><h2>Seven files and schedules for your reviewer</h2></div><StatusBadge tone="info">Synthetic demonstration data</StatusBadge></div>
        <div className="output-list">
          {outputs.map((output) => (
            <article key={output.label} className="output-row">
              <span className="file-icon"><FileOutput aria-hidden="true" /></span>
              <div className="flex-1"><h3>{output.label}</h3><p>{output.detail}</p></div>
              {generated ? <a className="button button-secondary button-small" href={output.href} download><Download aria-hidden="true" /> Download</a> : <button type="button" className="button button-secondary button-small" disabled><LockKeyhole aria-hidden="true" /> Locked</button>}
            </article>
          ))}
        </div>
      </section>
      <p className="prototype-note">Every file is labelled “Synthetic demonstration data,” and all totals match the figures shown throughout this demo.</p>
    </div>
  );
}
