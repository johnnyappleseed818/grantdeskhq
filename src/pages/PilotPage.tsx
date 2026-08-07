import { FormEvent, useState } from "react";
import { ArrowRight, Check, FileSearch, Mail, MessagesSquare, Presentation } from "lucide-react";

const CONTACT_DESTINATION = ["eli", "grantdeskhq.com"].join("@");
const QUESTIONNAIRE_URL = "https://docs.google.com/forms/d/e/1FAIpQLSddrmCFTno2tDYLKW2qCSUllnFxjxcjNMFFPtZJoOlPxQPSBQ/viewform";

const scope = [
  "One completed historical report",
  "Synthetic or redacted test files",
  "Award-rule extraction",
  "Funder-template structuring",
  "GL mapping suggestions",
  "Draft budget-versus-actual schedules",
  "Evidence-backed narrative drafts",
  "Missing-input questionnaires",
  "Quality-review checklist",
  "Source-linked evidence review",
  "No setup fee or subscription commitment"
];

export function PilotPage() {
  const [form, setForm] = useState({ name: "", email: "", firm: "", role: "", clients: "", process: "" });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = `Hello GrantDeskHQ team,\n\nI would like to try one grant report at no cost.\n\nName: ${form.name}\nWork email: ${form.email}\nOrganization: ${form.firm}\nRole: ${form.role}\nApproximate active grants: ${form.clients}\nCurrent reporting process: ${form.process}\n\nI understand that I should not send client files through this website.`;
    window.location.href = `mailto:${CONTACT_DESTINATION}?subject=${encodeURIComponent("GrantDeskHQ Free First Report")}&body=${encodeURIComponent(body)}`;
  };

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className="assessment-page">
      <section className="assessment-hero">
        <div className="site-shell">
          <div className="prototype-pill"><span aria-hidden="true" /> First report free · no setup fee</div>
          <div className="mt-8 grid items-start gap-12 lg:grid-cols-[1.05fr_.95fr]">
            <div>
              <p className="eyebrow">Free first report</p>
              <h1 className="page-title">Let AI prepare your first report draft at no cost.</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">Use one completed, appropriately redacted historical report to compare GrantDeskHQ with the process your team uses today. See whether AI can reduce spreadsheet rebuilding, identify missing evidence sooner, and give your reviewers a stronger starting point.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a className="button button-secondary button-large" href={QUESTIONNAIRE_URL} target="_blank" rel="noreferrer">Tell us about your workflow <ArrowRight aria-hidden="true" /></a>
              </div>
              <div className="mt-7 flex flex-wrap items-end gap-3"><strong className="text-4xl font-semibold text-navy-900">$0</strong><span className="pb-1 text-slate-500">for your first report · no subscription required</span></div>
            </div>
            <div className="assessment-summary">
              <p className="text-sm font-semibold text-emeraldMuted-700">What you can evaluate</p>
              <h2>See the full post-award reporting workflow on one report.</h2>
              <p>See extracted funder requirements, suggested financial mappings, tailored missing-input questions, a cited narrative draft, and the review items that GrantDeskHQ blocks until a professional resolves them.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="site-shell py-14 lg:py-20">
        <div className="assessment-process">
          {[
            [MessagesSquare, "Show us where the work gets stuck", "Tell us which reporting steps require the most spreadsheet work, checking, and follow-up."],
            [FileSearch, "See what AI can prepare", "Use synthetic or appropriately redacted historical files to compare GrantDeskHQ's draft, evidence links, and review controls with work your team already knows."],
            [Presentation, "Decide from the actual output", "Continue only if the result reduces meaningful manual work for your team. There is no setup fee or subscription commitment for the first report."]
          ].map(([Icon, title, copy], index) => {
            const ProcessIcon = Icon as typeof MessagesSquare;
            return <article key={title as string}><span className="step-number">0{index + 1}</span><ProcessIcon aria-hidden="true" /><h2>{title as string}</h2><p>{copy as string}</p></article>;
          })}
        </div>

        <div className="mt-14 grid gap-12 lg:grid-cols-[.9fr_1.1fr]">
        <section>
          <p className="eyebrow">Free first report</p>
          <h2 className="text-3xl font-semibold tracking-tight text-navy-900">Compare it with the way your team prepares reports today.</h2>
          <p className="mt-4 max-w-xl leading-7 text-slate-600">A completed historical report gives your team a clear comparison without replacing your accounting system or committing to a long implementation.</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">{scope.map((item) => <li key={item} className="flex gap-2 text-sm text-slate-700"><Check className="h-5 w-5 shrink-0 text-emeraldMuted-600" aria-hidden="true" />{item}</li>)}</ul>
          <div className="mt-8 border-l-4 border-amber-500 bg-amberReview-50 p-5 text-sm leading-6 text-amberReview-700"><strong>Outputs are drafts for professional review and are not accounting, legal, audit, or compliance advice.</strong></div>
        </section>

        <section id="contact" className="contact-panel">
          <p className="eyebrow">Start a conversation</p>
          <h2 className="text-3xl font-semibold tracking-tight text-navy-900">Try one report at no cost</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Tell us which parts of grant reporting create the most manual work. We’ll reply with the next step for trying one report. Please don’t include client information or files in this message.</p>
          <form className="mt-7 grid gap-5" onSubmit={submit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" id="assessment-name"><input id="assessment-name" className="form-control" required autoComplete="name" value={form.name} onChange={(event) => update("name", event.target.value)} /></Field>
              <Field label="Work email" id="assessment-email"><input id="assessment-email" className="form-control" type="email" required autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></Field>
              <Field label="Organization" id="assessment-firm"><input id="assessment-firm" className="form-control" required autoComplete="organization" value={form.firm} onChange={(event) => update("firm", event.target.value)} /></Field>
              <Field label="Role" id="assessment-role"><input id="assessment-role" className="form-control" required autoComplete="organization-title" value={form.role} onChange={(event) => update("role", event.target.value)} /></Field>
            </div>
            <Field label="Approximate number of active grants" id="assessment-clients"><select id="assessment-clients" className="form-control" required value={form.clients} onChange={(event) => update("clients", event.target.value)}><option value="">Select a range</option><option>1–5</option><option>6–15</option><option>16–30</option><option>31+</option></select></Field>
            <Field label="Current grant-reporting process" id="assessment-process"><textarea id="assessment-process" className="form-control min-h-28" required value={form.process} onChange={(event) => update("process", event.target.value)} placeholder="Which reporting steps take the most time today?" /></Field>
            <div className="form-note">Your email app will open with the message ready to send. This website does not store your answers or accept file uploads.</div>
            <button type="submit" className="button button-primary button-large w-full"><Mail aria-hidden="true" /> Try one report free <ArrowRight aria-hidden="true" /></button>
          </form>
        </section>
      </div>
      </section>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) { return <div><label className="mb-2 block text-sm font-semibold text-navy-900" htmlFor={id}>{label}</label>{children}</div>; }
