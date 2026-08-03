import { FileWarning, Mail, ShieldCheck, UserCheck } from "lucide-react";

export function PrivacyPage() {
  return (
    <div className="site-shell py-14 lg:py-20">
      <div className="max-w-3xl">
        <div className="prototype-pill"><span aria-hidden="true" /> Interactive prototype using synthetic demonstration data</div>
        <p className="eyebrow mt-8">Privacy and data handling</p>
        <h1 className="page-title">Honest boundaries for an early prototype</h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">GrantDesk is being validated as a human-reviewed draft and evidence-assembly workflow. This page describes the public prototype and the intended first discussion for a potential pilot; it does not claim verified production controls or certifications.</p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <PrivacyCard icon={ShieldCheck} title="Public demonstration data"><p>All information, entities, files, transactions, figures, and evidence excerpts displayed publicly on this website are synthetic demonstration data.</p></PrivacyCard>
        <PrivacyCard icon={FileWarning} title="No real client files"><p>No real client files are accepted through this website. The pilot enquiry contains no file-upload control, and visitors should not place client information in the message.</p></PrivacyCard>
        <PrivacyCard icon={Mail} title="Pilot discussion first"><p>Prospective pilot participants will first discuss data-handling requirements with founder Eli Katz. Redacted historical examples are preferred during validation.</p></PrivacyCard>
        <PrivacyCard icon={UserCheck} title="Human review and submission"><p>No report is submitted automatically. Suggested mappings, extracted requirements, calculations, and narrative drafts require professional human review.</p></PrivacyCard>
      </div>

      <section className="mt-10 border-y border-slate-200 py-8">
        <h2 className="text-xl font-semibold text-navy-900">What this page does not claim</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">This prototype does not claim verified certifications, security assessments, particular technical controls, accounting-system integrations, production AI functionality, autonomous compliance decisions, or independently validated output accuracy.</p>
      </section>
      <p className="mt-8 text-sm text-slate-600">Questions about the founding pilot can be sent to <a className="font-semibold text-emeraldMuted-700 underline" href="mailto:eli@grantdeskhq.com">Eli Katz at eli@grantdeskhq.com</a>.</p>
    </div>
  );
}

function PrivacyCard({ icon: Icon, title, children }: { icon: typeof ShieldCheck; title: string; children: React.ReactNode }) { return <article className="panel"><span className="icon-tile"><Icon aria-hidden="true" /></span><h2 className="mt-5 text-xl font-semibold text-navy-900">{title}</h2><div className="mt-3 text-sm leading-7 text-slate-600">{children}</div></article>; }
