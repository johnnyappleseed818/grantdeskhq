import { ArrowRight, FileWarning, MessagesSquare, ShieldCheck, UserCheck } from "lucide-react";
import { Link } from "react-router-dom";

export function PrivacyPage() {
  return (
    <div className="site-shell py-14 lg:py-20">
      <div className="max-w-3xl">
        <div className="prototype-pill"><span aria-hidden="true" /> Interactive demo using synthetic demonstration data</div>
        <p className="eyebrow mt-8">Privacy and data handling</p>
        <h1 className="page-title">A careful start with client data.</h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">Trust starts with plain language. The public demo uses fictional information. The working prototype accepts only small synthetic or appropriately redacted test files and keeps every reporting decision with a qualified professional.</p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <PrivacyCard icon={ShieldCheck} title="Demo data is fictional"><p>Every organization, file, transaction, figure, and evidence excerpt shown in the public demo is synthetic demonstration data.</p></PrivacyCard>
        <PrivacyCard icon={FileWarning} title="Use test files in the prototype"><p>The AI Report Compiler sends selected files to the configured AI provider for processing. Use only synthetic or appropriately redacted test files. Do not upload live client records or sensitive personal information.</p></PrivacyCard>
        <PrivacyCard icon={MessagesSquare} title="Contact messages do not accept files"><p>The contact form opens your email application and has no upload field. Please keep client names, financial details, and other sensitive information out of the message.</p></PrivacyCard>
        <PrivacyCard icon={UserCheck} title="Your team makes the final call"><p>GrantDeskHQ prepares drafts and suggestions. Your finance professionals review the mappings, calculations, evidence, narrative, and final report.</p></PrivacyCard>
      </div>

      <section className="mt-10 border-y border-slate-200 py-8">
        <h2 className="text-xl font-semibold text-navy-900">Clear boundaries for this public demo</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">This prototype does not claim verified certifications, security assessments, particular encryption standards, accounting-system integrations, autonomous compliance decisions, or guaranteed accuracy. It does not store files in an application database or send reports to funders. AI-provider processing and retention are governed by the provider configuration and terms in effect when the request is made.</p>
      </section>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <p className="text-sm text-slate-600">Have a question about using GrantDeskHQ with historical work?</p>
        <Link className="button button-secondary" to="/assessment#contact">Contact us <ArrowRight aria-hidden="true" /></Link>
      </div>
    </div>
  );
}

function PrivacyCard({ icon: Icon, title, children }: { icon: typeof ShieldCheck; title: string; children: React.ReactNode }) { return <article className="panel"><span className="icon-tile"><Icon aria-hidden="true" /></span><h2 className="mt-5 text-xl font-semibold text-navy-900">{title}</h2><div className="mt-3 text-sm leading-7 text-slate-600">{children}</div></article>; }
