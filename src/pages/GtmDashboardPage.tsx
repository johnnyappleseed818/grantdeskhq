import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BellRing,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileSearch,
  Handshake,
  LoaderCircle,
  MailCheck,
  MessageSquareText,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import redditSignals from "../../gtm/data/reddit-signals.json";
import linkedinItems from "../../gtm/data/linkedin-engagement.json";
import { initialOpportunities, referralChannels, signalSources } from "../data/gtmData";
import { apiRequest } from "../lib/api";
import {
  assessOpportunityAccuracy,
  canMoveToContacted,
  formatOpportunityScore,
  labelForSignal,
  type DailySocialScan,
  type GtmOpportunity,
  type OpportunityStage,
  type SignalKind
} from "../lib/gtm";
import { useAuth } from "../lib/auth";

type DashboardTab = "hot-list" | "signals" | "sources" | "partners" | "pipeline" | "accuracy";
type StageState = Record<string, OpportunityStage>;

const STORAGE_KEY = "grantdeskhq:gtm-stages:v1";

export function GtmDashboardPage() {
  const { user, loading, token } = useAuth();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  useEffect(() => {
    if (!user) return;
    token()
      .then((idToken) => apiRequest<{ allowed: boolean }>("/api/gtm/access", idToken))
      .then(() => setAccess("allowed"))
      .catch(() => setAccess("denied"));
  }, [user, token]);
  if (loading) return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading GTM command center…</div>;
  if (!user) return <Navigate replace to="/login?next=/gtm" />;
  if (access === "checking") return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Verifying private workspace access…</div>;
  if (access === "denied") return <section className="workspace-page"><div className="site-shell py-16"><div className="workspace-empty"><ShieldCheck aria-hidden="true" /><h1>Private workspace</h1><p>The GTM command center is restricted to the GrantDeskHQ administrator.</p><Link className="button button-primary" to="/workspace">Return to your reports</Link></div></div></section>;
  return <GtmDashboardContent dailySignalToken={token} />;
}

export function GtmDashboardContent({ dailySignalToken, initialDailyScan = null }: { dailySignalToken?: () => Promise<string>; initialDailyScan?: DailySocialScan | null } = {}) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("hot-list");
  const [filter, setFilter] = useState<"all" | SignalKind>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(initialOpportunities[0]?.id || null);
  const [copied, setCopied] = useState<string | null>(null);
  const [liveOpportunities, setLiveOpportunities] = useState<GtmOpportunity[]>(initialOpportunities);
  const [stages, setStages] = useState<StageState>(() => readStages());
  const [dailyScan, setDailyScan] = useState<DailySocialScan | null>(initialDailyScan);
  const [signalsLoading, setSignalsLoading] = useState(Boolean(dailySignalToken));
  const [signalsError, setSignalsError] = useState("");

  useEffect(() => {
    fetch("/gtm/award-signals.json", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ opportunities?: GtmOpportunity[] }> : null)
      .then((body) => {
        if (!body?.opportunities?.length) return;
        const generatedIds = new Set(body.opportunities.map((item) => item.id));
        setLiveOpportunities([...body.opportunities, ...initialOpportunities.filter((item) => !generatedIds.has(item.id))]);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!dailySignalToken) return;
    let active = true;
    dailySignalToken()
      .then((idToken) => apiRequest<{ scan: DailySocialScan | null }>("/api/gtm/daily-signals", idToken))
      .then((body) => { if (active) setDailyScan(body.scan); })
      .catch((requestError) => { if (active) setSignalsError(requestError instanceof Error ? requestError.message : "Daily signals could not be loaded."); })
      .finally(() => { if (active) setSignalsLoading(false); });
    return () => { active = false; };
  }, [dailySignalToken]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stages)); } catch { /* Browser storage can be unavailable. */ }
  }, [stages]);

  const ranked = useMemo(() => [...liveOpportunities].sort((left, right) => assessOpportunityAccuracy(right).score - assessOpportunityAccuracy(left).score), [liveOpportunities]);
  const visible = ranked.filter((opportunity) => {
    const matchesFilter = filter === "all" || opportunity.signalKind === filter;
    const haystack = `${opportunity.organization} ${opportunity.headline} ${opportunity.funder || ""}`.toLowerCase();
    return matchesFilter && haystack.includes(query.trim().toLowerCase());
  });
  const readyCount = ranked.filter((item) => assessOpportunityAccuracy(item).readyForAction).length;
  const contactedCount = Object.values(stages).filter((stage) => ["contacted", "replied", "converted"].includes(stage)).length;
  const pipelineStages: OpportunityStage[] = ["new", "reviewing", "ready", "contacted", "replied", "converted", "dismissed"];

  const updateStage = (id: string, stage: OpportunityStage) => setStages((current) => ({ ...current, [id]: stage }));
  const copyDraft = async (opportunity: GtmOpportunity) => {
    try {
      await navigator.clipboard.writeText(opportunity.draftMessage);
      setCopied(opportunity.id);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  return <div className="gtm-page">
    <header className="gtm-header">
      <div className="site-shell py-9 lg:py-12">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div><div className="prototype-pill"><span aria-hidden="true" /> Private GTM workspace · human approval required</div><p className="eyebrow mt-6">Grant-reporting pain detection</p><h1>Find the few organizations worth acting on today.</h1><p>GrantDeskHQ combines recent grant awards, hiring signals, public workflow pain, competitor intent, and partner opportunities into one source-backed action queue. Nothing is posted or emailed automatically.</p></div>
          <Link className="button button-primary button-large" to="/readiness"><FileSearch aria-hidden="true" />Open readiness audit</Link>
        </div>
        <div className="gtm-metrics" aria-label="GTM summary">
          <Metric icon={BellRing} label="Current alerts" value={ranked.length} detail="verified organizations" />
          <Metric icon={Target} label="Actionable now" value={readyCount} detail="source gate passed" />
          <Metric icon={MessageSquareText} label="Pain signals" value={redditSignals.length + linkedinItems.length + (dailyScan?.items.length || 0)} detail="reviewed + today’s scan" />
          <Metric icon={MailCheck} label="Contacted" value={contactedCount} detail="marked by you" />
        </div>
      </div>
    </header>

    <div className="gtm-tab-wrap">
      <div className="site-shell gtm-tabs" role="tablist" aria-label="GTM dashboard sections">
        {([
          ["hot-list", "Daily hot list"], ["signals", "Reddit & LinkedIn"], ["sources", "Signal engines"], ["partners", "Referral channels"], ["pipeline", "Progress"], ["accuracy", "Accuracy controls"]
        ] as Array<[DashboardTab, string]>).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}>{label}</button>)}
      </div>
    </div>

    <div className="site-shell py-8 lg:py-12">
      {activeTab === "hot-list" && <section aria-labelledby="hot-list-heading">
        <div className="gtm-section-heading"><div><p className="eyebrow">Today’s review queue</p><h2 id="hot-list-heading">Prioritized by pain, timing, fit, and potential value</h2><p>A high score never replaces evidence. Every row shows what is known, what is inferred, and what still needs confirmation.</p></div><div className="status-badge status-success"><RefreshCw aria-hidden="true" /> Award feed scheduled daily</div></div>
        <div className="gtm-toolbar">
          <label className="gtm-search"><Search aria-hidden="true" /><span className="sr-only">Search opportunities</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search organizations or funders" /></label>
          <div className="gtm-filters" aria-label="Filter alerts">{(["all", "grant_award", "job_posting", "excel_pain", "competitor_intent"] as const).map((kind) => <button type="button" className={filter === kind ? "is-active" : ""} aria-pressed={filter === kind} onClick={() => setFilter(kind)} key={kind}>{kind === "all" ? "All alerts" : labelForSignal(kind)}</button>)}</div>
        </div>
        <div className="gtm-opportunity-list" aria-live="polite">
          {visible.map((opportunity) => {
            const accuracy = assessOpportunityAccuracy(opportunity);
            const stage = stages[opportunity.id] || "new";
            const isExpanded = expanded === opportunity.id;
            return <article className="gtm-opportunity" key={opportunity.id}>
              <div className="gtm-score" data-label={accuracy.label}><strong>{accuracy.score}</strong><span>{formatOpportunityScore(accuracy.label)}</span></div>
              <div className="gtm-opportunity-main">
                <div className="gtm-opportunity-top"><div className="flex flex-wrap items-center gap-2"><span className="status-badge status-info">{labelForSignal(opportunity.signalKind)}</span><span className={`status-badge ${accuracy.readyForAction ? "status-success" : "status-review"}`}>{accuracy.confidence} confidence</span><span className="status-badge status-neutral">{stage.replaceAll("_", " ")}</span></div><span className="text-xs text-slate-500">Observed {formatDate(opportunity.observedAt)}</span></div>
                <h3>{opportunity.organization}</h3><p className="gtm-headline">{opportunity.headline}</p>
                <div className="gtm-facts">{opportunity.amount && <span><CircleDollarSign aria-hidden="true" />{formatMoney(opportunity.amount)}</span>}{opportunity.funder && <span><Building2 aria-hidden="true" />{opportunity.funder}</span>}{opportunity.location && <span><Radar aria-hidden="true" />{opportunity.location}</span>}</div>
                <p className="gtm-why"><strong>Why now:</strong> {opportunity.whyNow}</p>
                <div className="gtm-actions">
                  <button type="button" className="button button-secondary button-small" onClick={() => { setExpanded(isExpanded ? null : opportunity.id); updateStage(opportunity.id, stage === "new" ? "reviewing" : stage); }}>{isExpanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}{isExpanded ? "Hide evidence" : "Review evidence"}</button>
                  <button type="button" className="button button-secondary button-small" disabled={!accuracy.readyForAction || stage === "dismissed"} onClick={() => updateStage(opportunity.id, "ready")}><ClipboardCheck aria-hidden="true" />Approve for outreach</button>
                  <button type="button" className="button button-secondary button-small" disabled={stage !== "ready"} onClick={() => copyDraft(opportunity)}><Copy aria-hidden="true" />{copied === opportunity.id ? "Copied" : "Copy draft"}</button>
                  <button type="button" className="button button-primary button-small" disabled={!canMoveToContacted(stage, accuracy) || stage === "contacted"} onClick={() => updateStage(opportunity.id, "contacted")}><MailCheck aria-hidden="true" />{stage === "contacted" ? "Contacted" : "Mark contacted"}</button>
                  <button type="button" className="gtm-dismiss" onClick={() => updateStage(opportunity.id, "dismissed")}>Dismiss</button>
                </div>
                {isExpanded && <div className="gtm-evidence-panel">
                  <div><p className="eyebrow">Observed evidence</p>{opportunity.evidence.map((source) => <article className="gtm-source-evidence" key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink aria-hidden="true" /></a><blockquote>“{source.excerpt}”</blockquote><p>Supports: {source.supports.join(", ")}</p></article>)}</div>
                  <div><p className="eyebrow">Interpretation and next action</p><div className="gtm-interpretation"><strong>Recommended roles</strong><p>{opportunity.recommendedRoles.join(" · ")}</p><strong>Suggested angle</strong><p>{opportunity.recommendedAngle}</p><strong>Draft for human review</strong><p>{opportunity.draftMessage}</p></div>{[...accuracy.blockers, ...accuracy.warnings].length > 0 && <div className="gtm-caveats"><AlertCircle aria-hidden="true" /><div><strong>Before contact</strong><ul>{[...accuracy.blockers, ...accuracy.warnings].map((item) => <li key={item}>{item}</li>)}</ul></div></div>}</div>
                </div>}
              </div>
            </article>;
          })}
          {!visible.length && <div className="workspace-empty"><Search aria-hidden="true" /><h2>No alerts match this view</h2><p>Change the filter or search term. The source universe has not been broadened silently.</p></div>}
        </div>
      </section>}

      {activeTab === "signals" && <SignalsPanel dailyScan={dailyScan} loading={signalsLoading} error={signalsError} />}
      {activeTab === "sources" && <SourcesPanel />}
      {activeTab === "partners" && <PartnersPanel />}
      {activeTab === "pipeline" && <PipelinePanel opportunities={ranked} stages={stages} stagesOrder={pipelineStages} onStageChange={updateStage} />}
      {activeTab === "accuracy" && <AccuracyPanel />}
    </div>
  </div>;
}

function SignalsPanel({ dailyScan, loading, error }: { dailyScan: DailySocialScan | null; loading: boolean; error: string }) {
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Voice of the market</p><h2>Public pain signals stay separate from contactable leads</h2><p>Anonymous or unresolved posts help refine positioning. They do not become outreach targets unless the organization and role are independently verified.</p></div></div>
    <div className="gtm-signal-grid">
      <div className="panel gtm-daily-panel"><div className="panel-heading"><div><p className="eyebrow">Daily Reddit + LinkedIn check</p><h3>{loading ? "Checking the latest saved scan…" : dailyScan ? `${dailyScan.items.length} source-linked result${dailyScan.items.length === 1 ? "" : "s"}` : "Waiting for the first scheduled scan"}</h3></div><span className="status-badge status-success">Once daily</span></div>
        {error && <div className="compiler-error" role="alert"><AlertCircle aria-hidden="true" />{error}</div>}
        {dailyScan && <><p className="gtm-daily-summary">Last completed {formatDateTime(dailyScan.generatedAt)} · {dailyScan.coverage}</p><div className="gtm-feed-list">{dailyScan.items.map((item) => <article key={item.id}>{item.platform === "reddit" ? <MessageSquareText aria-hidden="true" /> : <UsersRound aria-hidden="true" />}<div><div className="flex flex-wrap items-center gap-2"><span className="status-badge status-neutral">{item.platform}</span><span className="status-badge status-review">research only</span></div><a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink aria-hidden="true" /></a><p>{item.observedPain}</p><small>{item.author !== "unknown" ? `${item.author} · ` : ""}{item.publishedAt !== "unknown" ? item.publishedAt : "publication date needs verification"}</small></div></article>)}</div><details className="gtm-scan-limitations"><summary>Coverage and limitations</summary><ul>{dailyScan.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details></>}
      </div>
      <div className="panel"><div className="panel-heading"><div><p className="eyebrow">Reddit research</p><h3>{redditSignals.length} reviewed threads</h3></div><span className="status-badge status-success">Daily discovery + manual review</span></div><div className="gtm-feed-list">{redditSignals.slice(0, 6).map((item) => <article key={item.id}><MessageSquareText aria-hidden="true" /><div><a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink aria-hidden="true" /></a><p>{item.evidenceSummary}</p><small>{item.community} · {item.confidence} confidence</small></div></article>)}</div></div>
      <div className="panel"><div className="panel-heading"><div><p className="eyebrow">LinkedIn review queue</p><h3>{linkedinItems.length} posts and communities</h3></div><span className="status-badge status-neutral">No automated engagement</span></div><div className="gtm-feed-list">{linkedinItems.slice(0, 6).map((item) => <article key={item.url}><UsersRound aria-hidden="true" /><div><a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink aria-hidden="true" /></a><p>{item.observedPain}</p><small>{item.status.replaceAll("_", " ")} · draft response requires review</small></div></article>)}</div></div>
    </div>
    <div className="gtm-boundary-note"><ShieldCheck aria-hidden="true" /><div><strong>One bounded discovery check per day—no platform automation.</strong><p>The monitor searches public, indexed results and preserves source links. It does not crawl profiles, discover contact details, post, comment, message, or email anyone.</p></div></div>
  </section>;
}

function SourcesPanel() {
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Signal engines</p><h2>Know exactly which scanners are active—and which are not</h2><p>The dashboard never labels an unconfigured source as connected. Each lane shows its cadence, coverage, and practical boundary.</p></div></div><div className="gtm-source-registry">{signalSources.map((source) => <article key={source.name}><div className="gtm-source-icon"><Radar aria-hidden="true" /></div><div><div className="flex flex-wrap items-center gap-2"><h3>{source.name}</h3><span className={`status-badge ${source.status === "active" ? "status-success" : source.status === "configuration" ? "status-review" : "status-neutral"}`}>{source.status}</span></div><p>{source.coverage}</p><small>{source.cadence}</small></div><div className="gtm-source-boundary"><strong>Boundary</strong><p>{source.boundary}</p><a href={source.url} target="_blank" rel="noreferrer">Source policy or configuration <ExternalLink aria-hidden="true" /></a></div></article>)}</div></section>;
}

function PartnersPanel() {
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Partner distribution</p><h2>Reach nonprofit teams through people they already trust</h2><p>Accountants and grant consultants can introduce the readiness assessment without making unverified partnership or referral-fee claims.</p></div></div><div className="gtm-partner-grid">{referralChannels.map((channel) => <article key={channel.name}><Handshake aria-hidden="true" /><span className="status-badge status-neutral">{channel.status}</span><h3>{channel.name}</h3><strong>{channel.offer}</strong><p>{channel.value}</p><div><small>Next action</small><p>{channel.nextAction}</p></div></article>)}</div></section>;
}

function PipelinePanel({ opportunities, stages, stagesOrder, onStageChange }: { opportunities: GtmOpportunity[]; stages: StageState; stagesOrder: OpportunityStage[]; onStageChange(id: string, stage: OpportunityStage): void }) {
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Progress monitor</p><h2>Track every opportunity without pretending there is a CRM</h2><p>Progress is saved in this browser for the prototype. No external CRM, email inbox, or campaign analytics are connected yet.</p></div></div><div className="gtm-pipeline-summary">{stagesOrder.map((stage) => <article key={stage}><strong>{opportunities.filter((item) => (stages[item.id] || "new") === stage).length}</strong><span>{stage.replaceAll("_", " ")}</span></article>)}</div><div className="panel panel-flush mt-6"><div className="table-scroll"><table className="data-table gtm-pipeline-table"><thead><tr><th>Organization</th><th>Signal</th><th>Score</th><th>Evidence</th><th>Progress</th></tr></thead><tbody>{opportunities.map((opportunity) => { const accuracy = assessOpportunityAccuracy(opportunity); return <tr key={opportunity.id}><th>{opportunity.organization}</th><td>{labelForSignal(opportunity.signalKind)}</td><td>{accuracy.score} · {formatOpportunityScore(accuracy.label)}</td><td>{opportunity.evidence.length} source{opportunity.evidence.length === 1 ? "" : "s"} · {accuracy.confidence}</td><td><label className="sr-only" htmlFor={`stage-${opportunity.id}`}>Progress for {opportunity.organization}</label><select id={`stage-${opportunity.id}`} className="table-select" value={stages[opportunity.id] || "new"} onChange={(event) => onStageChange(opportunity.id, event.target.value as OpportunityStage)}>{stagesOrder.map((stage) => <option value={stage} key={stage}>{stage.replaceAll("_", " ")}</option>)}</select></td></tr>; })}</tbody></table></div></div></section>;
}

function AccuracyPanel() {
  const controls = [
    ["Separate facts from inference", "Source excerpts, dates, links, and supported fields are shown before the system's interpretation."],
    ["Require identity resolution", "Anonymous posts and review-platform comments remain market evidence until an organization is verified."],
    ["Gate very-high intent", "A 90+ score needs at least two sources. A single strong signal can be useful, but it cannot receive the strongest label."],
    ["Expose unknowns and conflicts", "Missing contacts, unclear reporting cadence, stale jobs, conflicting award amounts, and source gaps are never filled by AI."],
    ["Use deterministic scoring", "Pain, timing, fit, and potential value are capped, visible components. The AI may summarize evidence but does not secretly change the score."],
    ["Keep outreach human-approved", "The system drafts and copies a message only after review. It does not scrape contact details or send email, LinkedIn messages, or comments automatically."],
    ["Preserve an audit trail", "Each alert retains the original source URL, observation date, excerpt, status changes, and the reason it was approved or dismissed."],
    ["Recheck freshness", "Signals older than 45 days receive a warning; closed job listings and changed awards must be reverified before action."]
  ];
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Trust architecture</p><h2>Accuracy is a workflow, not an AI confidence claim</h2><p>The product reduces hallucination risk by limiting what the AI can assert, validating source coverage, and blocking action when required evidence is missing.</p></div></div><div className="gtm-accuracy-grid">{controls.map(([title, detail], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><CheckCircle2 aria-hidden="true" /><div><h3>{title}</h3><p>{detail}</p></div></article>)}</div><div className="gtm-boundary-note"><Sparkles aria-hidden="true" /><div><strong>AI is used for classification, summarization, and draft language.</strong><p>Source retrieval, score caps, duplicate checks, contradiction flags, eligibility gates, consent checks, and sending boundaries remain deterministic.</p></div></div></section>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof BellRing; label: string; value: number; detail: string }) {
  return <article><Icon aria-hidden="true" /><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function readStages(): StageState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) as StageState : {};
  } catch { return {}; }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(new Date(value));
}
