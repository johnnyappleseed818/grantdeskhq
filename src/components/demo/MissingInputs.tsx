import { useMemo, useState } from "react";
import { CalendarClock, Check, Clipboard, Eye, Link2, UserRound } from "lucide-react";
import { missingInputQuestions, programFacts } from "../../data/grantData";
import { StatusBadge } from "../StatusBadge";
import { WorkspaceHeading } from "./AgencyOverview";

export function MissingInputs() {
  const [answered, setAnswered] = useState<Set<number>>(() => new Set([0, 2]));
  const [assignedTo, setAssignedTo] = useState("Program Director");
  const [dueDate, setDueDate] = useState("2026-07-15");
  const [preview, setPreview] = useState(false);
  const [copyState, setCopyState] = useState("Copy secure questionnaire link");

  const unanswered = useMemo(() => missingInputQuestions.length - answered.size, [answered]);

  const toggleAnswered = (index: number) => {
    setAnswered((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const copyPrototypeLink = async () => {
    const link = "https://grantdeskhq.com/demo?recipient=synthetic-program-director";
    try { await navigator.clipboard?.writeText(link); } catch { /* local status still explains prototype behavior */ }
    setCopyState("Prototype link copied locally");
  };

  return (
    <div className="workspace-stack">
      <WorkspaceHeading
        eyebrow="Intelligent missing-input collection"
        title="Ask only what the evidence cannot establish"
        description="The prototype has generated a focused five-question follow-up from gaps in the synthetic source package. No questionnaire is actually sent."
      />

      <div className="workspace-grid">
        <section className="panel lg:col-span-2">
          <div className="panel-heading">
            <div><p className="eyebrow">Known program facts</p><h2>Established from supplied evidence</h2></div>
            <StatusBadge tone="success">8 facts traced</StatusBadge>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {programFacts.map((fact) => <li key={fact} className="fact-row"><Check aria-hidden="true" /> <span>{fact}</span></li>)}
          </ul>
        </section>
        <aside className="panel">
          <p className="eyebrow">Collection settings</p>
          <label className="field-label mt-4" htmlFor="assigned-to"><UserRound aria-hidden="true" /> Assign to</label>
          <select id="assigned-to" className="form-control" value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
            <option>Program Director</option><option>Executive Director</option><option>Controller</option>
          </select>
          <label className="field-label mt-4" htmlFor="internal-due-date"><CalendarClock aria-hidden="true" /> Internal due date</label>
          <input id="internal-due-date" className="form-control" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="button button-secondary button-small" onClick={() => setPreview((visible) => !visible)}><Eye aria-hidden="true" /> {preview ? "Close recipient preview" : "Preview recipient view"}</button>
            <button type="button" className="button button-secondary button-small" onClick={copyPrototypeLink}><Link2 aria-hidden="true" /> {copyState}</button>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Prototype controls update local state only. No external secure link, assignment, due date, or message is created.</p>
        </aside>
      </div>

      <section className="panel panel-flush">
        <div className="panel-heading px-5 pt-5">
          <div><p className="eyebrow">Tailored questionnaire</p><h2>Program Director · {unanswered} response{unanswered === 1 ? "" : "s"} still needed</h2></div>
          <StatusBadge tone={unanswered ? "review" : "success"}>{answered.size} of 5 marked answered</StatusBadge>
        </div>
        <div className="question-list">
          {missingInputQuestions.map((question, index) => (
            <article key={question} className={`question-row ${answered.has(index) ? "is-answered" : ""}`}>
              <div className="question-number">{index + 1}</div>
              <div className="flex-1"><h3>{question}</h3><p>{index === 3 ? "Requested because the receipt schedule marks TRV-003 as missing." : "Generated from an unresolved required report field or source-package gap."}</p></div>
              <button type="button" className="button button-secondary button-small" aria-pressed={answered.has(index)} onClick={() => toggleAnswered(index)}>{answered.has(index) ? "Mark unanswered" : "Mark question answered"}</button>
            </article>
          ))}
        </div>
      </section>

      {preview && (
        <section className="recipient-preview" aria-label="Synthetic recipient questionnaire preview">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4"><div><p className="eyebrow">Recipient preview</p><h2>Hope Community Services · Six-Month Progress Report</h2></div><StatusBadge tone="info">Synthetic preview</StatusBadge></div>
          <p className="mt-5 text-sm leading-6 text-slate-600">Hello {assignedTo}, Northstar Nonprofit Finance needs the following information to complete its professional review. Please do not upload real information in this prototype.</p>
          <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm text-slate-700">{missingInputQuestions.filter((_, index) => !answered.has(index)).map((question) => <li key={question}>{question}</li>)}</ol>
          <div className="mt-6 flex items-center gap-2 text-xs text-slate-500"><Clipboard className="h-4 w-4" aria-hidden="true" /> Internal due date: {new Date(`${dueDate}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
        </section>
      )}

      <p className="prototype-note">GrantDesk asks only for information that cannot be established from the uploaded evidence.</p>
    </div>
  );
}
