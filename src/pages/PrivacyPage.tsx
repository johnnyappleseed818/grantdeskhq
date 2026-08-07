import { ArrowRight, FileWarning, MessagesSquare, ShieldCheck, UserCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { openAnalyticsPreferences } from "../lib/analytics";

export function PrivacyPage() {
  return (
    <div className="site-shell py-14 lg:py-20">
      <div className="max-w-3xl">
        <div className="prototype-pill"><span aria-hidden="true" /> Private beta · transparent data handling</div>
        <p className="eyebrow mt-8">Privacy and data handling</p>
        <h1 className="page-title">Know how your files are handled.</h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">GrantDeskHQ processes only the documents you choose so it can prepare a report draft and evidence review. During private beta, use synthetic or appropriately redacted files and keep sensitive client records out of the service.</p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <PrivacyCard icon={ShieldCheck} title="Sample data is clearly labeled"><p>Example workspaces use fictional organizations, files, transactions, figures, and evidence excerpts so you can explore the workflow without exposing real client information.</p></PrivacyCard>
        <PrivacyCard icon={FileWarning} title="Use redacted files during private beta"><p>The AI Report Compiler sends only the files you select to the configured AI provider for processing. Remove sensitive personal information and do not upload live client records.</p></PrivacyCard>
        <PrivacyCard icon={MessagesSquare} title="Contact messages do not accept files"><p>The contact form opens your email application and has no upload field. Please keep client names, financial details, and other sensitive information out of the message.</p></PrivacyCard>
        <PrivacyCard icon={UserCheck} title="Your team makes the final call"><p>GrantDeskHQ prepares drafts and suggestions. Your finance professionals review the mappings, calculations, evidence, narrative, and final report.</p></PrivacyCard>
        <PrivacyCard icon={ShieldCheck} title="Visitor analytics are optional"><p>When enabled and accepted, Google Analytics measures visits to public marketing pages and Microsoft Clarity helps us understand navigation and interaction patterns. Analytics is disabled until you choose to allow it. GrantDeskHQ does not deliberately send uploaded files, report content, form entries, or account identifiers to either service, and all page content is explicitly masked for Clarity.</p><button type="button" className="mt-4 font-semibold text-emerald-800 underline" onClick={openAnalyticsPreferences}>Review cookie settings</button></PrivacyCard>
      </div>

      <section className="mt-10 border-y border-slate-200 py-8">
        <h2 className="text-xl font-semibold text-navy-900">What to expect during private beta</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">GrantDeskHQ does not claim certifications, security assessments, specific encryption standards, accounting-system integrations, autonomous compliance decisions, or guaranteed accuracy that have not been independently verified. It does not submit reports to funders. AI-provider processing and retention follow the provider configuration and terms in effect when a request is made.</p>
      </section>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <p className="text-sm text-slate-600">Have a question about using GrantDeskHQ with historical work?</p>
        <Link className="button button-secondary" to="/assessment#contact">Contact us <ArrowRight aria-hidden="true" /></Link>
      </div>
    </div>
  );
}

function PrivacyCard({ icon: Icon, title, children }: { icon: typeof ShieldCheck; title: string; children: React.ReactNode }) { return <article className="panel"><span className="icon-tile"><Icon aria-hidden="true" /></span><h2 className="mt-5 text-xl font-semibold text-navy-900">{title}</h2><div className="mt-3 text-sm leading-7 text-slate-600">{children}</div></article>; }
