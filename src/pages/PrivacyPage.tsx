import { ArrowRight, FileWarning, MessagesSquare, ShieldCheck, UserCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { openAnalyticsPreferences } from "../lib/analytics";

export function PrivacyPage() {
  return (
    <div className="site-shell py-14 lg:py-20">
      <div className="max-w-3xl">
        <div className="prototype-pill"><span aria-hidden="true" /> Data handling in plain language</div>
        <p className="eyebrow mt-8">Privacy and data handling</p>
        <h1 className="page-title">Understand where your data goes and who can access it.</h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">GrantDeskHQ processes the documents and reporting information your team chooses so it can prepare a source-linked draft and evidence review. This page explains the current safeguards without making unverified certification claims.</p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <PrivacyCard icon={ShieldCheck} title="Workspace access is checked by organization"><p>Workspace records are separated from the public website. The application checks the signed-in user’s organization membership and role before returning grants, reports, financial records, or files.</p></PrivacyCard>
        <PrivacyCard icon={FileWarning} title="Files are stored privately"><p>Uploaded source and evidence files are kept in private cloud object storage rather than published as public links. A download is served only after an authorized request. Upload only information your organization is permitted to process.</p></PrivacyCard>
        <PrivacyCard icon={MessagesSquare} title="AI receives selected report context"><p>When you start an AI workflow, GrantDeskHQ sends the selected files and authorized reporting facts to the OpenAI API with <code>store: false</code>. OpenAI states that API data is not used to train its models unless the customer explicitly opts in; standard abuse-monitoring logs may retain content for up to 30 days. <a className="font-semibold text-emerald-800 underline" href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">Read OpenAI’s API data controls</a>.</p></PrivacyCard>
        <PrivacyCard icon={UserCheck} title="AI output stays reviewable"><p>Important financial calculations are performed by application code. AI-generated statements keep source and review information, and a separate verification step checks material output against the selected evidence. Missing or conflicting information is shown for review instead of being silently approved.</p></PrivacyCard>
        <PrivacyCard icon={ShieldCheck} title="GrantDeskHQ does not replace your accounting system"><p>Your accounting system remains the financial book of record. GrantDeskHQ works from the approved exports and documents you provide, so you can improve report preparation without giving the product live accounting credentials or waiting for an integration project.</p></PrivacyCard>
        <PrivacyCard icon={MessagesSquare} title="Contact messages do not accept files"><p>The contact form opens your email application and has no upload field. Please keep client names, financial details, and other sensitive information out of the message.</p></PrivacyCard>
        <PrivacyCard icon={ShieldCheck} title="Visitor analytics are optional"><p>When enabled and accepted, Google Analytics measures visits to public marketing pages and Microsoft Clarity helps us understand navigation and interaction patterns. Analytics is disabled until you choose to allow it. GrantDeskHQ does not deliberately send uploaded files, report content, form entries, or account identifiers to either service, and all page content is explicitly masked for Clarity.</p><button type="button" className="mt-4 font-semibold text-emerald-800 underline" onClick={openAnalyticsPreferences}>Review cookie settings</button></PrivacyCard>
      </div>

      <section className="mt-10 border-y border-slate-200 py-8">
        <h2 className="text-xl font-semibold text-navy-900">Professional review remains required</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">GrantDeskHQ prepares drafts, suggested mappings, calculations, and review controls. An authorized professional must resolve required items and approve the package. GrantDeskHQ does not submit reports to funders or replace accounting, legal, audit, or compliance judgment. We do not claim certifications, independent security assessments, or guaranteed accuracy that have not been verified.</p>
      </section>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <p className="text-sm text-slate-600">Have a question about using GrantDeskHQ with historical work?</p>
        <Link className="button button-secondary" to="/assessment#contact">Contact us <ArrowRight aria-hidden="true" /></Link>
      </div>
    </div>
  );
}

function PrivacyCard({ icon: Icon, title, children }: { icon: typeof ShieldCheck; title: string; children: React.ReactNode }) { return <article className="panel"><span className="icon-tile"><Icon aria-hidden="true" /></span><h2 className="mt-5 text-xl font-semibold text-navy-900">{title}</h2><div className="mt-3 text-sm leading-7 text-slate-600">{children}</div></article>; }
