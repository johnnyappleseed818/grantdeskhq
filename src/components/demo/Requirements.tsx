import { useState } from "react";
import { ArrowRight, ScanSearch } from "lucide-react";
import { reportRequirements } from "../../data/grantData";
import { StatusBadge } from "../StatusBadge";
import { WorkspaceHeading } from "./AgencyOverview";

export function Requirements() {
  const [selectedId, setSelectedId] = useState(reportRequirements[0].id);
  const selected = reportRequirements.find((item) => item.id === selectedId) ?? reportRequirements[0];

  return (
    <div className="workspace-stack">
      <WorkspaceHeading eyebrow="Funder-template compiler" title="Know what the funder expects before drafting" description="Our AI-powered solution reads the award and funder form together, then turns the requirements into a clear checklist your team can review before work begins." />

      <div className="compiler-message"><ScanSearch aria-hidden="true" /><strong>Your draft follows the funder’s exact questions and format, saving your team from rebuilding the form by hand.</strong></div>

      <section className="requirement-split">
        <div className="template-pane">
          <div className="pane-heading"><span>Original synthetic template excerpt</span><StatusBadge tone="neutral">{selected.source}</StatusBadge></div>
          <div className="synthetic-document">
            <div className="document-heading">PACIFIC YOUTH FOUNDATION</div>
            <div className="document-subheading">Six-Month Progress Report</div>
            <div className="mt-8 space-y-5">
              {reportRequirements.map((requirement) => (
                <button
                  type="button"
                  key={requirement.id}
                  className={`source-highlight ${requirement.id === selectedId ? "is-selected" : ""}`}
                  onClick={() => setSelectedId(requirement.id)}
                  aria-pressed={requirement.id === selectedId}
                >
                  <span className="font-semibold">{requirement.section}.</span> {requirement.sourceExcerpt}
                </button>
              ))}
            </div>
            <p className="mt-8 text-[10px] uppercase tracking-widest text-slate-400">Synthetic demonstration document</p>
          </div>
        </div>

        <div className="schema-pane">
          <div className="pane-heading"><span>Structured reporting schema</span><StatusBadge tone="info">6 required sections</StatusBadge></div>
          <div className="divide-y divide-slate-200">
            {reportRequirements.map((requirement) => (
              <button
                type="button"
                key={requirement.id}
                className={`schema-row ${requirement.id === selectedId ? "is-selected" : ""}`}
                onClick={() => setSelectedId(requirement.id)}
                aria-pressed={requirement.id === selectedId}
              >
                <div><span>{requirement.section}</span><h3>{requirement.title}</h3><p>{requirement.rule}</p></div>
                <ArrowRight aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel border-l-4 border-l-emeraldMuted-500">
        <p className="eyebrow">Selected evidence trace</p>
        <div className="mt-3 grid gap-5 md:grid-cols-[1fr_auto]">
          <div><h3>{selected.section}: {selected.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">“{selected.sourceExcerpt}”</p></div>
          <StatusBadge tone="success">Source linked</StatusBadge>
        </div>
      </section>
    </div>
  );
}
