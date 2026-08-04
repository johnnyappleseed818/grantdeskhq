import { CheckCircle2, File, FileSpreadsheet, FileText, TriangleAlert } from "lucide-react";
import { extractedRules, sourceFiles } from "../../data/grantData";
import { StatusBadge } from "../StatusBadge";
import { WorkspaceHeading } from "./AgencyOverview";

export function SourcePackage() {
  return (
    <div className="workspace-stack">
      <WorkspaceHeading eyebrow="Source package" title="Every source file in one place" description="GrantDeskHQ uses AI to organize the award, budget, ledger, funder form, program update, and receipt schedule, giving your team one clear starting point for the report." />

      <div className="grid gap-3 lg:grid-cols-2">
        {sourceFiles.map((file) => (
          <article key={file.name} className="file-row">
            <span className="file-icon">{file.kind.includes("budget") || file.kind.includes("ledger") ? <FileSpreadsheet aria-hidden="true" /> : file.kind.includes("template") ? <FileText aria-hidden="true" /> : <File aria-hidden="true" />}</span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-navy-900" title={file.name}>{file.name}</h3>
              <p className="mt-1 text-xs text-slate-500">{file.kind} · {file.detail} · {file.size}</p>
            </div>
            <StatusBadge tone={file.status === "Processed" ? "success" : "review"}>{file.status}</StatusBadge>
          </article>
        ))}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Reporting rules found by AI</p><h2>See every requirement and where it came from</h2></div>
          <StatusBadge tone="info">Synthetic excerpts</StatusBadge>
        </div>
        <div className="rule-list">
          {extractedRules.map((rule) => (
            <article key={rule.id} className="rule-row">
              <div className="pt-1">{rule.reviewStatus === "Reviewed" ? <CheckCircle2 className="h-5 w-5 text-emeraldMuted-600" aria-hidden="true" /> : <TriangleAlert className="h-5 w-5 text-amberReview-700" aria-hidden="true" />}</div>
              <div>
                <div className="flex flex-wrap items-center gap-2"><h3>{rule.title}</h3><StatusBadge tone={rule.reviewStatus === "Reviewed" ? "success" : "review"}>{rule.reviewStatus}</StatusBadge></div>
                <p className="mt-2 text-sm leading-6 text-slate-600">“{rule.excerpt}”</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500"><span>{rule.source}</span><span>·</span><span>{rule.page}</span><span>·</span><span>{rule.confidence}% extraction confidence</span></div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <p className="prototype-note">Extracted requirements are suggestions for human verification against the original synthetic files.</p>
    </div>
  );
}
