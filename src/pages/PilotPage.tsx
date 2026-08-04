import { FormEvent, useState } from "react";
import { ArrowRight, Check, Mail } from "lucide-react";

const CONTACT_DESTINATION = ["eli", "grantdeskhq.com"].join("@");

const scope = [
  "30 days",
  "Up to two nonprofit client entities",
  "Up to four completed historical reports",
  "Award-rule extraction",
  "Funder-template structuring",
  "GL mapping suggestions",
  "Draft budget-versus-actual schedules",
  "Evidence-backed narrative drafts",
  "Missing-input questionnaires",
  "Quality-review checklist",
  "Direct setup support"
];

export function PilotPage() {
  const [form, setForm] = useState({ name: "", email: "", firm: "", role: "", clients: "", process: "" });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = `Hello GrantDesk team,\n\nI would like to learn more about the Founding Agency Pilot.\n\nName: ${form.name}\nWork email: ${form.email}\nFirm: ${form.firm}\nRole: ${form.role}\nApproximate nonprofit clients: ${form.clients}\nCurrent reporting process: ${form.process}\n\nI understand that I should not send client files through this website.`;
    window.location.href = `mailto:${CONTACT_DESTINATION}?subject=${encodeURIComponent("GrantDesk Founding Pilot")}&body=${encodeURIComponent(body)}`;
  };

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className="site-shell py-14 lg:py-20">
      <div className="prototype-pill"><span aria-hidden="true" /> A practical way to test GrantDesk with your workflow</div>
      <div className="mt-8 grid gap-12 lg:grid-cols-[.9fr_1.1fr]">
        <section>
          <p className="eyebrow">Start small and learn quickly</p>
          <h1 className="page-title">Founding Agency Pilot</h1>
          <div className="mt-6 flex items-end gap-3"><strong className="text-4xl font-semibold text-navy-900">$500</strong><span className="pb-1 text-slate-500">one-time</span></div>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">Use completed historical reports to see where GrantDesk could reduce manual assembly, catch missing support earlier, and make review easier for your team.</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">{scope.map((item) => <li key={item} className="flex gap-2 text-sm text-slate-700"><Check className="h-5 w-5 shrink-0 text-emeraldMuted-600" aria-hidden="true" />{item}</li>)}</ul>
          <div className="mt-8 border-l-4 border-amber-500 bg-amberReview-50 p-5 text-sm leading-6 text-amberReview-700"><strong>Pilot outputs are drafts for professional review and are not accounting, legal, audit, or compliance advice.</strong></div>
        </section>

        <section id="contact" className="contact-panel">
          <p className="eyebrow">Have a reporting workflow in mind?</p>
          <h2 className="text-3xl font-semibold tracking-tight text-navy-900">Contact us</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Tell us how your team prepares grant reports and where the work gets stuck. We’ll use that context to see whether the pilot is a useful fit. Please don’t include client information or files.</p>
          <form className="mt-7 grid gap-5" onSubmit={submit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" id="pilot-name"><input id="pilot-name" className="form-control" required autoComplete="name" value={form.name} onChange={(event) => update("name", event.target.value)} /></Field>
              <Field label="Work email" id="pilot-email"><input id="pilot-email" className="form-control" type="email" required autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></Field>
              <Field label="Firm name" id="pilot-firm"><input id="pilot-firm" className="form-control" required autoComplete="organization" value={form.firm} onChange={(event) => update("firm", event.target.value)} /></Field>
              <Field label="Role" id="pilot-role"><input id="pilot-role" className="form-control" required autoComplete="organization-title" value={form.role} onChange={(event) => update("role", event.target.value)} /></Field>
            </div>
            <Field label="Approximate number of nonprofit clients" id="pilot-clients"><select id="pilot-clients" className="form-control" required value={form.clients} onChange={(event) => update("clients", event.target.value)}><option value="">Select a range</option><option>1–5</option><option>6–15</option><option>16–30</option><option>31+</option></select></Field>
            <Field label="Current grant-reporting process" id="pilot-process"><textarea id="pilot-process" className="form-control min-h-28" required value={form.process} onChange={(event) => update("process", event.target.value)} placeholder="What takes the most manual effort today?" /></Field>
            <div className="form-note">Your email app will open with the message ready to send. This website does not store your answers or accept file uploads.</div>
            <button type="submit" className="button button-primary button-large w-full"><Mail aria-hidden="true" /> Send enquiry <ArrowRight aria-hidden="true" /></button>
          </form>
        </section>
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) { return <div><label className="mb-2 block text-sm font-semibold text-navy-900" htmlFor={id}>{label}</label>{children}</div>; }
