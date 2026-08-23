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
  UsersRound
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import redditSignals from "../../gtm/data/reddit-signals.json";
import linkedinItems from "../../gtm/data/linkedin-engagement.json";
import { referralChannels, signalSources } from "../data/gtmData";
import { apiRequest } from "../lib/api";
import {
  assessOpportunityAccuracy,
  formatOpportunityScore,
  labelForSignal,
  rankGtmOpportunities,
  type AwardDiscoveryScan,
  type DailySocialScan,
  type GtmOpportunity,
  type OpportunityStage,
  type SignalKind
} from "../lib/gtm";
import { useAuth } from "../lib/auth";
import type { ControlPlaneLeadState, ControlPlaneQueueReconciliation } from "../lib/gtmControlPlaneQueue";
import type { GtmOverview, GtmMetric } from "../lib/gtmOverview";
import { confirmedHumanOutreach, reconcileOutreachControlPlane, summarizeOutreach, type OutreachRecord } from "../lib/gtmOutreach";
import type { CanonicalGtmModel, CanonicalGtmRecord, CanonicalGtmState } from "../lib/gtmCanonical";
import type { SearchConsoleState } from "../../server/searchConsole";

type DashboardTab = "overview" | "outreach" | "leads" | "partners" | "social" | "seo" | "feedback" | "system-health" | "research";
type StageState = Record<string, OpportunityStage>;
type OutreachFilter = "all" | "awaiting" | "follow_up_due" | "replied" | "positive" | "trial" | "paid" | "direct" | "partner";
type GtmTokenProvider = (forceRefresh?: boolean) => Promise<string>;
type GtmRequest = <T>(path: string, token: string, init?: RequestInit) => Promise<T>;
type InstantlyHealth = { status: string; integrationEnabled: boolean; apiKeyConfigured: boolean; webhookSecretConfigured: boolean; outboundEnabled: boolean; autoHandoffEnabled: boolean; directEnabled: boolean; partnerEnabled: boolean; firstTouchLinkEnabled: boolean; mappings: { directList: boolean; partnerList: boolean; directCampaign: boolean; partnerCampaign: boolean } };

const STORAGE_KEY = "grantdeskhq:gtm-stages:v1";

export function GtmDashboardPage() {
  const { user, loading, token } = useAuth();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  useEffect(() => {
    if (!user) return;
    let active = true;
    requestGtmWithFreshToken<{ allowed: boolean }>(token, "/api/gtm/access")
      .then(() => setAccess("allowed"))
      .catch(() => { if (active) setAccess("denied"); });
    return () => { active = false; };
  }, [user, token]);
  if (loading) return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading GTM command center…</div>;
  if (!user) return <Navigate replace to="/login?next=/gtm" />;
  if (access === "checking") return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Verifying private workspace access…</div>;
  if (access === "denied") return <section className="workspace-page"><div className="site-shell py-16"><div className="workspace-empty"><ShieldCheck aria-hidden="true" /><h1>Private workspace</h1><p>The GTM command center is restricted to the GrantDeskHQ administrator.</p><Link className="button button-primary" to="/workspace">Return to your reports</Link></div></div></section>;
  return <GtmDashboardContent dailySignalToken={token} />;
}

export function GtmDashboardContent({ dailySignalToken, initialDailyScan = null, initialAwardScan = null, initialControlPlane = null, initialOverview = null, seedOpportunities = [] }: { dailySignalToken?: GtmTokenProvider; initialDailyScan?: DailySocialScan | null; initialAwardScan?: AwardDiscoveryScan | null; initialControlPlane?: ControlPlaneQueueReconciliation | null; initialOverview?: GtmOverview | null; seedOpportunities?: GtmOpportunity[] } = {}) {
  const canonicalRuntime = Boolean(dailySignalToken);
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [filter, setFilter] = useState<"all" | SignalKind>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(seedOpportunities[0]?.id || null);
  const [copied, setCopied] = useState<string | null>(null);
  const [liveOpportunities, setLiveOpportunities] = useState<GtmOpportunity[]>(() => mergeAwardCandidates(initialAwardScan?.opportunities || [], seedOpportunities));
  const [stages, setStages] = useState<StageState>(() => readStages());
  const [dailyScan, setDailyScan] = useState<DailySocialScan | null>(initialDailyScan);
  const [awardScan, setAwardScan] = useState<AwardDiscoveryScan | null>(initialAwardScan);
  const [controlPlane, setControlPlane] = useState<ControlPlaneQueueReconciliation | null>(initialControlPlane);
  const [overview, setOverview] = useState<GtmOverview | null>(initialOverview);
  const [canonical, setCanonical] = useState<CanonicalGtmModel | null>(null);
  const [canonicalLoading, setCanonicalLoading] = useState(Boolean(dailySignalToken));
  const [canonicalError, setCanonicalError] = useState("");
  const [canonicalRetry, setCanonicalRetry] = useState(0);
  const [searchConsole, setSearchConsole] = useState<SearchConsoleState | null>(null);
  const [instantly, setInstantly] = useState<InstantlyHealth | null>(null);
  const [signalsLoading, setSignalsLoading] = useState(Boolean(dailySignalToken));
  const [signalsError, setSignalsError] = useState("");
  const [outreach, setOutreach] = useState<OutreachRecord[]>(confirmedHumanOutreach);
  const [outreachFilter, setOutreachFilter] = useState<OutreachFilter>("all");
  const [outreachQuery, setOutreachQuery] = useState("");

  useEffect(() => {
    if (!dailySignalToken) return;
    let active = true;
    dailySignalToken().then(async (idToken) => Promise.allSettled([
      apiRequest<{ opportunities: GtmOpportunity[] }>("/api/gtm/opportunities", idToken),
      apiRequest<{ scan: DailySocialScan | null }>("/api/gtm/daily-signals", idToken),
      apiRequest<{ scan: AwardDiscoveryScan | null }>("/api/gtm/award-signals", idToken),
      apiRequest<{ reconciliation: ControlPlaneQueueReconciliation | null }>("/api/gtm/control-plane-queue", idToken),
      apiRequest<{ overview: GtmOverview }>("/api/gtm/overview", idToken),
      apiRequest<{ state: SearchConsoleState | null }>("/api/gtm/search-console", idToken)
    ]))
      .then(([opportunityResult, socialResult, awardResult, controlPlaneResult, overviewResult, searchConsoleResult]) => {
        if (!active) return;
        const failures = [opportunityResult, socialResult, awardResult, controlPlaneResult, overviewResult, searchConsoleResult].filter((result) => result.status === "rejected");
        if (failures.length) setSignalsError("Some secondary GTM data could not be loaded. Commercial queues remain available.");
        if (socialResult.status === "fulfilled") setDailyScan(socialResult.value.scan);
        if (awardResult.status === "fulfilled") setAwardScan(awardResult.value.scan);
        if (controlPlaneResult.status === "fulfilled") setControlPlane(controlPlaneResult.value.reconciliation);
        if (overviewResult.status === "fulfilled") setOverview(overviewResult.value.overview);
        if (searchConsoleResult.status === "fulfilled") setSearchConsole(searchConsoleResult.value.state);
        if (opportunityResult.status === "fulfilled") {
          setLiveOpportunities(mergeAwardCandidates(awardResult.status === "fulfilled" ? awardResult.value.scan?.opportunities || [] : [], opportunityResult.value.opportunities));
          setExpanded((current) => current || opportunityResult.value.opportunities[0]?.id || null);
        }
      })
      .catch((requestError) => { if (active) setSignalsError(requestError instanceof Error ? requestError.message : "Daily signals could not be loaded."); })
      .finally(() => { if (active) setSignalsLoading(false); });
    return () => { active = false; };
  }, [dailySignalToken]);

  useEffect(() => {
    if (!dailySignalToken) return;
    let active = true;
    requestGtmWithFreshToken<{ health: InstantlyHealth }>(dailySignalToken, "/api/gtm/instantly")
      .then((body) => { if (active) setInstantly(body.health); })
      .catch(() => { /* System Health remains truthful: unavailable is not inferred as healthy. */ });
    return () => { active = false; };
  }, [dailySignalToken]);

  useEffect(() => {
    if (!dailySignalToken) return;
    let active = true;
    setCanonicalLoading(true);
    setCanonicalError("");
    loadCanonicalGtmModel(dailySignalToken)
      .then((model) => { if (active) setCanonical(model); })
      .catch(() => { if (active) setCanonicalError("Unable to load GTM records."); })
      .finally(() => { if (active) setCanonicalLoading(false); });
    return () => { active = false; };
  }, [dailySignalToken, canonicalRetry]);

  useEffect(() => {
    if (!dailySignalToken) return;
    let active = true;
    dailySignalToken().then((idToken) => apiRequest<{ outreach: OutreachRecord[] }>("/api/gtm/outreach", idToken)).then((body) => { if (active && body.outreach.length) setOutreach(body.outreach); }).catch(() => { /* Retain the factual local no-data fallback. */ });
    return () => { active = false; };
  }, [dailySignalToken]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stages)); } catch { /* Browser storage can be unavailable. */ }
  }, [stages]);

  const ranked = useMemo(() => rankGtmOpportunities(liveOpportunities), [liveOpportunities]);
  const visible = ranked.filter((opportunity) => {
    const matchesFilter = filter === "all" || opportunity.signalKind === filter;
    const haystack = `${opportunity.organization} ${opportunity.headline} ${opportunity.funder || ""}`.toLowerCase();
    return matchesFilter && haystack.includes(query.trim().toLowerCase());
  });
  const unresolvedAwardCandidates = ranked.filter((item) => item.signalKind === "grant_award" && !item.primaryContact?.email).length;
  const outreachMetrics = summarizeOutreach(outreach);
  const pipelineStages: OpportunityStage[] = ["new", "reviewing", "ready", "contacted", "replied", "converted", "dismissed"];

  const updateStage = (id: string, stage: OpportunityStage) => setStages((current) => ({ ...current, [id]: stage }));
  const copyDraft = async (opportunity: GtmOpportunity) => {
    try {
      const recipient = opportunity.primaryContact?.email || "Contact not yet verified";
      await navigator.clipboard.writeText(`To: ${recipient}\nSubject: ${opportunity.emailSubject}\n\n${opportunity.draftMessage}`);
      setCopied(opportunity.id);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };
  const reviewSocial = async (id: string, status: "RESPONDED" | "SKIPPED") => {
    if (!dailySignalToken) return;
    const idToken = await dailySignalToken();
    const result = await apiRequest<{ scan: DailySocialScan }>("/api/gtm/social", idToken, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    setDailyScan(result.scan);
  };

  return <div className="gtm-page">
    <header className="gtm-header">
      <div className="site-shell py-9 lg:py-12">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><div className="prototype-pill"><span aria-hidden="true" /> Private founder console · human approval required</div><p className="eyebrow mt-6">Commercial operating view</p><h1>Founder GTM Command Center</h1><p>Confirmed manual outreach and canonical pipeline records only. Nothing is posted or emailed automatically.</p></div><span className="status-badge status-neutral">AUTOMATED OUTBOUND LOCKED</span></div>
        <div className="gtm-metrics" aria-label="Commercial KPIs">
          <Metric icon={MailCheck} label="Direct ready" value={canonical?.metrics.directReady ?? "—"} detail="canonical first-touch queue" />
          <Metric icon={Handshake} label="Partner ready" value={canonical?.metrics.partnerReady ?? "—"} detail="canonical first-touch queue" />
          <Metric icon={MailCheck} label="Unique contacted" value={outreachMetrics.uniqueOrganizationsContacted} detail={outreachMetrics.directUniqueOrganizationsContacted + " direct · " + outreachMetrics.partnerUniqueOrganizationsContacted + " partner"} />
          <Metric icon={MessageSquareText} label="Awaiting reply" value={canonical?.metrics.awaitingReply ?? "—"} detail="recorded outcomes only" />
          <Metric icon={CheckCircle2} label="Replies" value={canonical?.metrics.replies ?? "—"} detail="recorded outcomes only" />
          <Metric icon={CheckCircle2} label="Positive replies" value={canonical?.metrics.positiveReplies ?? "—"} detail="recorded outcomes only" />
          <Metric icon={Sparkles} label="Trials or Free First Awards" value={canonical?.metrics.trials ?? "—"} detail="recorded outcomes only" />
          <Metric icon={CircleDollarSign} label="Paid" value={canonical?.metrics.paid ?? "—"} detail="recorded customer records only" />
          <Metric icon={CircleDollarSign} label="MRR" value={canonical ? formatMoney(canonical.metrics.mrr) : "—"} detail="recorded customer revenue only" />
        </div>
      </div>
    </header>

    <div className="gtm-tab-wrap">
      <div className="site-shell gtm-tabs" role="tablist" aria-label="GTM dashboard sections">
        {([
          ["overview", "Overview"], ["outreach", "Outreach"], ["leads", "Leads"], ["partners", "Partners"], ["social", "Social"], ["seo", "SEO"], ["feedback", "Feedback"], ["system-health", "System Health"]
        ] as Array<[DashboardTab, string]>).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}>{label}</button>)}
      </div>
    </div>

    <div className="site-shell py-8 lg:py-12">
      {activeTab === "overview" && (canonicalRuntime ? <CanonicalOperationalPanel model={canonical} loading={canonicalLoading} error={canonicalError} onRetry={() => setCanonicalRetry((value) => value + 1)} /> : <FounderOverview records={outreach} overview={overview} onOpenOutreach={() => setActiveTab("outreach")} onOpenFeedback={() => setActiveTab("feedback")} />)}
      {(activeTab === "research" || activeTab === "leads" && !canonicalRuntime) && <section aria-labelledby="hot-list-heading">
        <InventorySummary title="Direct lead inventory" metrics={overview?.direct.metrics} sent={outreachMetrics.directSent} />
        <div className="gtm-section-heading"><div><p className="eyebrow">Today’s review queue</p><h2 id="hot-list-heading">Prioritized by pain, timing, fit, and potential value</h2><p>A high score never replaces evidence. Every row shows what is known, what is inferred, and what still needs confirmation.</p></div><div className="status-badge status-success"><RefreshCw aria-hidden="true" /> Award feed scheduled daily</div></div>
        <div className="gtm-toolbar">
          <label className="gtm-search"><Search aria-hidden="true" /><span className="sr-only">Search opportunities</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search organizations or funders" /></label>
          <div className="gtm-filters" aria-label="Filter alerts">{(["all", "grant_award", "job_posting", "excel_pain", "competitor_intent"] as const).map((kind) => <button type="button" className={filter === kind ? "is-active" : ""} aria-pressed={filter === kind} onClick={() => setFilter(kind)} key={kind}>{kind === "all" ? "All alerts" : labelForSignal(kind)}</button>)}</div>
        </div>
        {awardScan && <div className="gtm-criteria-note"><Radar aria-hidden="true" /><div><strong>Expanded award discovery is active</strong><p>{awardScan.criteria.startDate} through {awardScan.criteria.endDate} · awards from {formatMoney(awardScan.criteria.minimumAward)} · up to {awardScan.criteria.maxCandidates} candidates · core, emerging, and adjacent nonprofit segments</p><small>{awardScan.coverage}</small></div></div>}
        {unresolvedAwardCandidates > 0 && <div className="gtm-candidate-note"><FileSearch aria-hidden="true" /><p><strong>{unresolvedAwardCandidates} award research candidate{unresolvedAwardCandidates === 1 ? " is" : "s are"} waiting for contact verification.</strong> They are now visible below, but remain blocked from outreach until a named recipient and authoritative email source are attached.</p></div>}
        <div className="gtm-opportunity-list" aria-live="polite">
          {visible.map((opportunity) => {
            const accuracy = assessOpportunityAccuracy(opportunity);
            const stage = stages[opportunity.id] || "new";
            const isExpanded = expanded === opportunity.id;
            return <article className="gtm-opportunity" key={opportunity.id}>
              <div className="gtm-score" data-label={accuracy.label}><strong>{accuracy.score}</strong><span>{formatOpportunityScore(accuracy.label)}</span></div>
              <div className="gtm-opportunity-main">
                <div className="gtm-opportunity-top"><div className="flex flex-wrap items-center gap-2"><span className="status-badge status-info">{labelForSignal(opportunity.signalKind)}</span>{opportunity.targetTier && <span className="status-badge status-neutral">{opportunity.targetTier} target</span>}<span className={`status-badge ${accuracy.readyForAction ? "status-success" : "status-review"}`}>{accuracy.confidence} confidence</span><span className="status-badge status-neutral">{stage.replaceAll("_", " ")}</span></div><span className="text-xs text-slate-500">Observed {formatDate(opportunity.observedAt)}</span></div>
                <h3>{opportunity.organization}</h3><p className="gtm-headline">{opportunity.headline}</p>
                <div className="gtm-facts">{opportunity.amount && <span><CircleDollarSign aria-hidden="true" />{formatMoney(opportunity.amount)}</span>}{opportunity.funder && <span><Building2 aria-hidden="true" />{opportunity.funder}</span>}{opportunity.location && <span><Radar aria-hidden="true" />{opportunity.location}</span>}</div>
                {opportunity.primaryContact ? <div className="gtm-contact-summary"><MailCheck aria-hidden="true" /><div><span>Suggested recipient</span><strong>{opportunity.primaryContact.name} · {opportunity.primaryContact.title}</strong><span>{opportunity.primaryContact.email} (manual review only)</span></div></div> : <div className="gtm-contact-summary needs-contact"><AlertCircle aria-hidden="true" /><div><span>Contact research needed</span><strong>No verified recipient email is attached to this generated alert.</strong></div></div>}
                {opportunity.fitSignals?.length ? <p className="gtm-why"><strong>Visible fit signals:</strong> {opportunity.fitSignals.join(" · ")}</p> : null}
                <p className="gtm-why"><strong>Why now:</strong> {opportunity.whyNow}</p>
                <div className="gtm-actions">
                  <button type="button" className="button button-secondary button-small" onClick={() => { setExpanded(isExpanded ? null : opportunity.id); updateStage(opportunity.id, stage === "new" ? "reviewing" : stage); }}>{isExpanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}{isExpanded ? "Hide evidence" : "Review evidence"}</button>
                  <button type="button" className="button button-secondary button-small" disabled={!accuracy.readyForAction || stage === "dismissed"} onClick={() => updateStage(opportunity.id, "ready")}><ClipboardCheck aria-hidden="true" />Mark ready for human review</button>
                  <button type="button" className="button button-secondary button-small" disabled={stage !== "ready"} onClick={() => copyDraft(opportunity)}><Copy aria-hidden="true" />{copied === opportunity.id ? "Copied" : "Copy draft"}</button>
                  <button type="button" className="button button-secondary button-small" disabled title="Outbound remains locked in SHADOW mode"><ShieldCheck aria-hidden="true" />Outbound locked</button>
                  <button type="button" className="button button-primary button-small" disabled title="Outbound remains locked in SHADOW mode"><MailCheck aria-hidden="true" />Outbound locked</button>
                  <button type="button" className="gtm-dismiss" onClick={() => updateStage(opportunity.id, "dismissed")}>Dismiss</button>
                </div>
                {isExpanded && <div className="gtm-evidence-panel">
                  <div><p className="eyebrow">Observed evidence</p>{opportunity.evidence.map((source) => <article className="gtm-source-evidence" key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink aria-hidden="true" /></a><blockquote>“{source.excerpt}”</blockquote><p>Supports: {source.supports.join(", ")}</p></article>)}</div>
                  <div><p className="eyebrow">Recipient and draft</p>{opportunity.primaryContact ? <div className="gtm-contact-card"><div><span>{opportunity.primaryContact.emailKind === "direct" ? "Verified direct email" : "Verified organization inbox"}</span><strong>{opportunity.primaryContact.name}</strong><p>{opportunity.primaryContact.title}</p><span>{opportunity.primaryContact.email} (manual review only)</span></div><p>{opportunity.primaryContact.note}</p><div className="gtm-contact-sources"><a href={opportunity.primaryContact.roleSourceUrl} target="_blank" rel="noreferrer">Verify role <ExternalLink aria-hidden="true" /></a><a href={opportunity.primaryContact.emailSourceUrl} target="_blank" rel="noreferrer">Verify email <ExternalLink aria-hidden="true" /></a><small>Checked {formatDate(opportunity.primaryContact.verifiedAt)}</small></div></div> : <div className="gtm-caveats"><AlertCircle aria-hidden="true" /><div><strong>Contact not verified</strong><p>Research a named finance or grants leader and confirm the email from an authoritative source before outreach.</p></div></div>}<div className="gtm-interpretation"><strong>Recommended roles</strong><p>{opportunity.recommendedRoles.join(" · ")}</p><strong>Suggested angle</strong><p>{opportunity.recommendedAngle}</p><strong>Email subject</strong><p>{opportunity.emailSubject}</p><strong>Draft for human review</strong><p className="whitespace-pre-line">{opportunity.draftMessage}</p></div>{[...accuracy.blockers, ...accuracy.warnings].length > 0 && <div className="gtm-caveats"><AlertCircle aria-hidden="true" /><div><strong>Before contact</strong><ul>{[...accuracy.blockers, ...accuracy.warnings].map((item) => <li key={item}>{item}</li>)}</ul></div></div>}</div>
                </div>}
              </div>
            </article>;
          })}
          {!visible.length && <div className="workspace-empty"><Search aria-hidden="true" /><h2>No alerts match this view</h2><p>Change the filter or search term. The source universe has not been broadened silently.</p></div>}
        </div>
      </section>}

      {activeTab === "leads" && canonicalRuntime && <CanonicalOperationalPanel model={canonical} segment="DIRECT" loading={canonicalLoading} error={canonicalError} onRetry={() => setCanonicalRetry((value) => value + 1)} />}
      {activeTab === "leads" && !canonicalRuntime && <ControlPlanePanel reconciliation={controlPlane} />}
      {activeTab === "outreach" && <OutreachHistoryPanel records={outreach} canonicalOpportunityIds={controlPlane?.cards.map((card) => card.canonicalCardId) || ranked.map((opportunity) => opportunity.id)} filter={outreachFilter} query={outreachQuery} onFilter={setOutreachFilter} onQuery={setOutreachQuery} />}
      {activeTab === "partners" && (canonicalRuntime ? <CanonicalOperationalPanel model={canonical} segment="PARTNER" loading={canonicalLoading} error={canonicalError} onRetry={() => setCanonicalRetry((value) => value + 1)} /> : <PartnersPanel records={outreach} overview={overview} />)}
      {activeTab === "social" && <SocialQueuePanel scan={dailyScan} onReview={reviewSocial} />}
      {activeTab === "seo" && <SeoQueuePanel state={searchConsole} />}
      {activeTab === "feedback" && <FeedbackPanel />}
      {activeTab === "system-health" && <><OverviewPanel overview={overview} inMain /><div className="mt-8"><InstantlyHealthPanel health={instantly} /></div><div className="mt-8"><SignalsPanel dailyScan={dailyScan} loading={signalsLoading} error={signalsError} /></div><div className="mt-8"><SourcesPanel /></div><div className="mt-8"><PipelinePanel opportunities={ranked} stages={stages} stagesOrder={pipelineStages} onStageChange={updateStage} /></div><div className="mt-8"><OutreachAutomationPanel opportunities={ranked} stages={stages} /></div><div className="mt-8"><AccuracyPanel /></div></>}
    </div>
  </div>;
}

function InstantlyHealthPanel({ health }: { health: InstantlyHealth | null }) {
  return <section className="panel" aria-label="Instantly integration health"><div className="panel-heading"><div><p className="eyebrow">Outbound delivery integration</p><h3>Instantly</h3></div><span className={`status-badge ${health?.apiKeyConfigured ? "status-info" : "status-neutral"}`}>{health?.status || "UNAVAILABLE"}</span></div>{!health ? <p>Instantly health could not be read. No delivery state is assumed.</p> : <div className="grid gap-3 text-sm sm:grid-cols-2"><p>API credential: <strong>{health.apiKeyConfigured ? "configured" : "not configured"}</strong></p><p>Webhook secret: <strong>{health.webhookSecretConfigured ? "configured" : "not configured"}</strong></p><p>Outbound: <strong>{health.outboundEnabled ? "enabled" : "disabled"}</strong></p><p>Automatic handoff: <strong>{health.autoHandoffEnabled ? "enabled" : "disabled"}</strong></p><p>Direct live routing: <strong>{health.directEnabled ? "enabled" : "disabled"}</strong></p><p>Partner live routing: <strong>{health.partnerEnabled ? "enabled" : "disabled"}</strong></p></div>}<p className="mt-3 text-sm text-slate-600">GrantDeskHQ stages only eligible, uncontacted records. Instantly owns sequences and inbox handling when explicitly enabled.</p></section>;
}

function FounderOverview({ records, overview, onOpenOutreach, onOpenFeedback }: { records: OutreachRecord[]; overview: GtmOverview | null; onOpenOutreach(): void; onOpenFeedback(): void }) {
  const metrics = summarizeOutreach(records);
  const positiveReplies = records.filter((record) => record.replySentiment === "POSITIVE").length;
  const awaiting = records.filter((record) => record.nextAction === "AWAIT_RESPONSE" && !record.replied);
  return <section aria-labelledby="founder-overview-heading"><div className="gtm-section-heading"><div><p className="eyebrow">Commercial performance</p><h2 id="founder-overview-heading">Recorded commercial activity</h2><p>Manual sends and recorded downstream outcomes are shown alongside canonical pipeline counts.</p></div><button type="button" className="button button-secondary" onClick={onOpenOutreach}>Open outreach ledger</button></div><div className="gtm-automation-metrics" aria-label="Commercial funnel"><article><strong>{metrics.totalSent}</strong><span>Sent</span></article><article><strong>{metrics.awaitingResponse}</strong><span>Awaiting reply</span></article><article><strong>{metrics.replied}</strong><span>Replies</span></article><article><strong>{positiveReplies}</strong><span>Positive replies</span></article><article><strong>{metrics.trials}</strong><span>Trials or Free First Awards</span></article><article><strong>{metrics.customers}</strong><span>Paid</span></article><article><strong>{String.fromCharCode(36)}0</strong><span>MRR</span></article></div><div className="grid gap-6 lg:grid-cols-2 mt-6"><FunnelCard title="Direct funnel" metrics={overview?.direct.metrics} records={records.filter((record) => record.type === "DIRECT_NONPROFIT")} /><FunnelCard title="Partner funnel" metrics={overview?.partner.metrics} records={records.filter((record) => record.type === "PARTNER")} /></div><div className="panel mt-6"><div className="panel-heading"><div><p className="eyebrow">Next actions</p><h3>Follow the recorded workflow</h3></div><button type="button" className="button button-secondary button-small" onClick={onOpenOutreach}>Open Outreach</button></div><ul className="mt-4 grid gap-3 sm:grid-cols-2">{awaiting.map((record) => <li className="border-b border-slate-100 pb-3 text-sm" key={record.id}><strong>{record.nextAction.replaceAll("_", " ")}</strong><span className="block">{record.organization} · {record.contact}</span><span className="block text-slate-500">Reason: {record.whyNowSignal || record.notes}</span><span className="block text-slate-500">Source: {record.signalSource ? "Canonical signal source" : record.source.replaceAll("_", " ")}</span>{record.followUpDueAt && <span className="block text-slate-500">Due: {formatHistoryDate(record.followUpDueAt)}</span>}<button type="button" className="button-link mt-1" onClick={onOpenOutreach}>View in Outreach</button></li>)}<li className="border-b border-slate-100 pb-3 text-sm"><strong>REVIEW_FEEDBACK</strong><span className="block">Contact and feedback submissions</span><span className="block text-slate-500">Open the protected queue to review persisted submissions and update their status. No notification or outreach action is created.</span><button type="button" className="button-link mt-1" onClick={onOpenFeedback}>Open feedback review</button></li></ul></div></section>;
}

/** Server-derived action queues. Browser state never changes commercial status. */
function CanonicalOperationalPanel({ model, segment, loading, error, onRetry }: { model: CanonicalGtmModel | null; segment?: "DIRECT" | "PARTNER"; loading: boolean; error: string; onRetry(): void }) {
  const [state, setState] = useState<CanonicalGtmState>("READY_TO_SEND");
  const [copied, setCopied] = useState<string | null>(null);
  if (!model && loading) return <section className="workspace-empty"><LoaderCircle className="animate-spin" aria-hidden="true" /><h2>Loading canonical GTM records</h2><p>Commercial queues remain unavailable until the protected canonical model is read.</p></section>;
  if (!model) return <section className="workspace-empty"><AlertCircle aria-hidden="true" /><h2>Unable to load GTM records.</h2><p>{error || "The protected canonical model is unavailable right now."}</p><button type="button" className="button button-primary" onClick={onRetry}>Retry</button></section>;
  const records = model.records.filter((record) => (!segment || record.segment === segment) && record.state === state);
  const states: CanonicalGtmState[] = segment
    ? ["READY_TO_SEND", "FOLLOW_UP_DUE", "AWAITING_REPLY", "REPLIED", "POSITIVE", "TRIAL", "PAID", "NEEDS_VERIFICATION", "RESEARCH_BACKLOG", "ALREADY_CONTACTED"]
    : ["READY_TO_SEND", "FOLLOW_UP_DUE", "AWAITING_REPLY", "REPLIED", "POSITIVE", "TRIAL", "PAID", "NEEDS_VERIFICATION"];
  const label = segment === "DIRECT" ? "Customers" : segment === "PARTNER" ? "Partners" : "Overview";
  const copy = async (record: CanonicalGtmRecord, kind: "subject" | "email") => {
    const value = kind === "subject" ? record.subject : [record.email ? `To: ${record.email}` : "", record.subject ? `Subject: ${record.subject}` : "", record.draft || ""].filter(Boolean).join("\n\n");
    if (!value) return;
    try { await navigator.clipboard.writeText(value); setCopied(`${record.id}:${kind}`); window.setTimeout(() => setCopied(null), 1500); } catch { setCopied(null); }
  };
  return <section aria-label={`${label} canonical queues`}>
    <div className="gtm-section-heading"><div><p className="eyebrow">Canonical operating model</p><h2>{segment === "DIRECT" ? "Customer execution queue" : segment === "PARTNER" ? "Partner execution queue" : "Founder operating view"}</h2><p>Readiness, prior-contact protection, suppression, verification, and next action are calculated server-side. Outbound remains manual and disabled.</p></div><span className="status-badge status-neutral">CANONICAL</span></div>
    <div className="gtm-filters" aria-label="Canonical queue filter">{states.map((item) => {
      const count = model.records.filter((record) => (!segment || record.segment === segment) && record.state === item).length;
      return <button type="button" key={item} className={state === item ? "is-active" : ""} aria-pressed={state === item} onClick={() => setState(item)}>{item.replaceAll("_", " ")} · {count}</button>;
    })}</div>
    <div className="gtm-opportunity-list mt-6" aria-live="polite">{records.map((record) => <article className="gtm-opportunity" key={record.id}>
      <div className="gtm-opportunity-main"><div className="gtm-opportunity-top"><span className="status-badge status-info">{record.state.replaceAll("_", " ")}</span><span className="status-badge status-neutral">{record.segment === "DIRECT" ? "Direct" : record.partnerType || "Partner"}</span></div>
        <h3>{record.organization}</h3><p className="gtm-why"><strong>Why now:</strong> {record.whyNow}</p>
        <div className="gtm-contact-summary"><MailCheck aria-hidden="true" /><div><span>Canonical recipient</span><strong>{record.contact || "No contact established"}{record.title ? ` · ${record.title}` : ""}</strong><span>{record.email || "No verified business email"}{record.verificationStatus ? ` · ${record.verificationStatus}` : ""}</span></div></div>
        {record.blockers.length > 0 && <div className="gtm-caveats"><AlertCircle aria-hidden="true" /><div><strong>Blocking condition</strong><p>{record.blockers.join(" ")}</p></div></div>}
        <p className="gtm-why"><strong>Next action:</strong> {record.nextAction}</p>
        {record.sentAt && <p className="gtm-why"><strong>Sent:</strong> {formatHistoryDate(record.sentAt)}</p>}
        {record.followUpDueAt && <p className="gtm-why"><strong>Next follow-up:</strong> {formatHistoryDate(record.followUpDueAt)}</p>}
        <p><a href={record.sourceUrl} target="_blank" rel="noreferrer">Open source <ExternalLink aria-hidden="true" /></a></p>
        {record.state === "READY_TO_SEND" && <div className="gtm-actions"><button type="button" className="button button-secondary button-small" onClick={() => copy(record, "subject")}><Copy aria-hidden="true" />{copied === `${record.id}:subject` ? "Copied" : "Copy subject"}</button><button type="button" className="button button-secondary button-small" onClick={() => copy(record, "email")}><Copy aria-hidden="true" />{copied === `${record.id}:email` ? "Copied" : "Copy email"}</button>{record.email && record.subject && <a className="button button-secondary button-small" href={`mailto:${record.email}?subject=${encodeURIComponent(record.subject)}`}>Open email</a>}<span className="status-badge status-neutral">MARK SENT REQUIRES EXPLICIT HUMAN RECORDING</span></div>}
      </div>
    </article>)}{!records.length && <div className="workspace-empty"><ClipboardCheck aria-hidden="true" /><h2>No records in this queue</h2><p>No result is inferred or manufactured. Change the canonical queue filter to inspect the next operational state.</p></div>}</div>
  </section>;
}

const GTM_REQUEST_TIMEOUT_MS = 15_000;

/** A bounded, one-refresh request path for founder-only GTM reads. */
export async function requestGtmWithFreshToken<T>(tokenProvider: GtmTokenProvider, path: string, request: GtmRequest = apiRequest): Promise<T> {
  try {
    return await requestGtmOnce(tokenProvider, false, path, request);
  } catch (error) {
    if (!isAuthenticationFailure(error)) throw error;
    return requestGtmOnce(tokenProvider, true, path, request);
  }
}

export async function loadCanonicalGtmModel(tokenProvider: GtmTokenProvider, request: GtmRequest = apiRequest): Promise<CanonicalGtmModel> {
  const body = await requestGtmWithFreshToken<{ model: CanonicalGtmModel }>(tokenProvider, "/api/gtm/canonical", request);
  if (!isCanonicalGtmModel(body?.model)) throw new Error("The canonical GTM response is invalid.");
  return body.model;
}

async function requestGtmOnce<T>(tokenProvider: GtmTokenProvider, forceRefresh: boolean, path: string, request: GtmRequest) {
  const token = await withinTimeout(tokenProvider(forceRefresh), "GTM authentication took too long.");
  const controller = new AbortController();
  try {
    return await withinTimeout(request<T>(path, token, { signal: controller.signal }), "GTM records took too long to load.");
  } catch (error) {
    controller.abort();
    throw error;
  }
}

function withinTimeout<T>(promise: Promise<T>, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(timeoutMessage)), GTM_REQUEST_TIMEOUT_MS);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timeout));
  });
}

function isAuthenticationFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return /\b401\b|session expired|sign in to continue|account session/.test(message);
}

function isCanonicalGtmModel(value: unknown): value is CanonicalGtmModel {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CanonicalGtmModel>;
  const metrics = candidate.metrics;
  return Array.isArray(candidate.records)
    && Boolean(metrics)
    && ["directReady", "partnerReady", "directNeedsVerification", "partnerNeedsVerification", "followUpsDue", "awaitingReply", "replies", "positiveReplies", "trials", "paid", "mrr"].every((key) => Number.isFinite(metrics?.[key as keyof CanonicalGtmModel["metrics"]]));
}

function SocialQueuePanel({ scan, onReview }: { scan: DailySocialScan | null; onReview(id: string, status: "RESPONDED" | "SKIPPED"): Promise<void> }) {
  const [copied, setCopied] = useState<string | null>(null);
  const items = (scan?.items || []).filter((item) => item.status === "ACTIONABLE");
  const copy = async (item: DailySocialScan["items"][number]) => {
    try { await navigator.clipboard.writeText(item.suggestedResponse); setCopied(item.id); window.setTimeout(() => setCopied(null), 1500); } catch { setCopied(null); }
  };
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Canonical research queue</p><h2>Social review</h2><p>Only source-linked research is shown. No post, reply, message, or automated engagement is enabled.</p></div><span className="status-badge status-neutral">MANUAL ONLY</span></div>
    {scan && <p className="gtm-daily-summary">Last scan {formatDateTime(scan.generatedAt)} · {scan.sourceCount} sources checked · {scan.itemsExamined} examined · {scan.itemsQualified} qualified · {scan.itemsSuppressed} suppressed.</p>}
    <div className="gtm-feed-list">{items.map((item) => <article key={item.id}><MessageSquareText aria-hidden="true" /><div><div className="flex flex-wrap items-center gap-2"><span className="status-badge status-neutral">{item.platform}</span><span className="status-badge status-review">actionable</span></div><a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink aria-hidden="true" /></a><p>{item.observedPain}</p><p><strong>Why relevant:</strong> {item.whyRelevant}</p><p><strong>Suggested response:</strong> {item.suggestedResponse}</p><small>{item.publishedAt || "Publication date not recorded"}</small><div className="gtm-actions"><a className="button button-secondary button-small" href={item.url} target="_blank" rel="noreferrer">Open</a><button type="button" className="button button-secondary button-small" onClick={() => copy(item)}>{copied === item.id ? "Copied" : "Copy response"}</button><button type="button" className="button button-secondary button-small" onClick={() => void onReview(item.id, "RESPONDED")}>Responded</button><button type="button" className="button button-secondary button-small" onClick={() => void onReview(item.id, "SKIPPED")}>Skip</button></div></div></article>)}</div>
    {!items.length && <div className="workspace-empty"><MessageSquareText aria-hidden="true" /><h2>No actionable social records</h2><p>No completed or speculative item is presented as an engagement task.</p></div>}
  </section>;
}

function SeoQueuePanel({ state }: { state: SearchConsoleState | null }) {
  if (!state) return <section className="workspace-empty"><LoaderCircle className="animate-spin" aria-hidden="true" /><h2>Loading Search Console state</h2><p>The SEO queue waits for the persisted Search Console reconciliation.</p></section>;
  const pages = state.ranges.last28Days?.pages || [];
  const actions = seoActions(state);
  const healthy = state.analyticsStatus !== "FAIL" && state.sitemap.result === "PASS";
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Search Console only</p><h2>SEO operating state</h2><p>{state.property} · synced {state.lastSuccessfulSync ? formatDateTime(state.lastSuccessfulSync) : "not yet"}</p></div><span className={`status-badge ${state.analyticsStatus === "FAIL" ? "status-blocked" : "status-neutral"}`}>{state.analyticsStatus.replaceAll("_", " ")}</span></div>
    <div className="gtm-automation-metrics"><article><strong>{healthy ? "GOOD" : "ATTENTION"}</strong><span>SEO health</span></article><article><strong>{pages.length}</strong><span>pages with data</span></article><article><strong>{state.ranges.last28Days?.queries.length || 0}</strong><span>queries with data</span></article><article><strong>{state.sitemap.result}</strong><span>sitemap submission</span></article></div>
    <div className="gtm-opportunity-list mt-6">{actions.map((item, index) => <article className="gtm-opportunity" key={`${item.page}:${index}`}><div className="gtm-opportunity-main"><span className="status-badge status-neutral">{item.action}</span><h3>{item.page || "Search performance monitoring"}</h3><p>{item.reason}</p>{item.page && <a href={item.page} target="_blank" rel="noreferrer">Open affected page <ExternalLink aria-hidden="true" /></a>}</div></article>)}</div>
    {!actions.length && <div className="workspace-empty"><ClipboardCheck aria-hidden="true" /><h2>No SEO action required</h2><p>Search Console has no page-specific, commercially meaningful task that meets the action threshold.</p></div>}
    <div className="gtm-boundary-note"><ShieldCheck aria-hidden="true" /><div><strong>Sitemap state</strong><p>{state.sitemap.publicAccessible && state.sitemap.canonicalUrlsPresent ? "Public canonical sitemap validated." : "Sitemap validation requires attention."} Submission: {state.sitemap.result}. {state.sitemap.error || ""}</p></div></div>
  </section>;
}

function seoActions(state: SearchConsoleState) {
  if (state.analyticsStatus !== "PASS") return state.sitemap.result === "FAIL" ? [{ page: state.sitemap.url, action: "TECHNICAL SEO", reason: state.sitemap.error || "The canonical sitemap needs attention." }] : [];
  const byPage = new Map<string, { impressions: number; ctr: number; position: number }>();
  for (const row of state.ranges.last28Days?.pages || []) {
    const raw = row.keys[0] || "";
    let page = "";
    try { const url = new URL(raw); if (!["grantdeskhq.com", "www.grantdeskhq.com"].includes(url.hostname)) continue; url.hostname = "grantdeskhq.com"; url.search = ""; url.hash = ""; if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, ""); page = url.toString(); } catch { continue; }
    if (["/privacy", "/terms", "/contact"].includes(new URL(page).pathname)) continue;
    const previous = byPage.get(page);
    byPage.set(page, previous ? { impressions: previous.impressions + row.impressions, ctr: 0, position: Math.min(previous.position, row.position) } : { impressions: row.impressions, ctr: row.ctr, position: row.position });
  }
  return [...byPage.entries()].flatMap(([page, row]) => row.impressions >= 50 && row.position >= 8 && row.position <= 20 ? [{ page, action: "CONTENT REFRESH", reason: "Meaningful impressions with average position 8–20." }] : row.impressions >= 50 && row.ctr < 0.02 ? [{ page, action: "TITLE / META", reason: "Meaningful impressions with a low click-through rate." }] : []);
}

function FunnelCard({ title, metrics, records }: { title: string; metrics: Record<string, GtmMetric> | undefined; records: OutreachRecord[] }) { const direct = title === "Direct funnel"; const manualSent = records.filter((record) => record.status === "SENT").length; const recorded = (key: string) => metrics?.[key]?.actual; const stages = (direct ? [["Qualified", recorded("qualified")], ["Ready to send", recorded("humanReview")], ["Sent", Math.max(recorded("sent") || 0, manualSent)], ["Replies", records.filter((record) => record.replied).length], ["Positive replies", records.filter((record) => record.replySentiment === "POSITIVE").length], ["Free First Award", records.filter((record) => record.trial).length], ["Paid", records.filter((record) => record.customer).length]] : [["High fit", recorded("highFit")], ["Ready to send", recorded("humanReview")], ["Sent", Math.max(recorded("contacted") || 0, manualSent)], ["Replies", records.filter((record) => record.replied).length], ["Positive replies", records.filter((record) => record.replySentiment === "POSITIVE").length], ["Trial with client or award", records.filter((record) => record.trial).length], ["Paid customers influenced", records.filter((record) => record.customer).length]]).filter(([, value]) => value !== null && value !== undefined) as Array<[string, number]>; return <div className="panel"><p className="eyebrow">{title}</p><div className="gtm-automation-metrics mt-4" aria-label={title}>{stages.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div></div>; }

function FeedbackPanel() { return <section aria-labelledby="feedback-heading"><div className="gtm-section-heading"><div><p className="eyebrow">Voice of customer</p><h2 id="feedback-heading">Feedback review</h2><p>Feedback is stored and reviewed in its dedicated, authenticated workflow. No notifications or downstream actions are inferred here.</p></div><Link className="button button-secondary" to="/gtm/feedback">Open feedback review</Link></div><div className="panel mt-6"><MessageSquareText aria-hidden="true" /><h3 className="mt-4">Use the existing feedback queue</h3><p className="mt-2 text-sm text-slate-600">Review submission status and notes in the existing route without duplicating or fabricating feedback records in the command center.</p></div></section>; }

function OverviewPanel({ overview, inMain = false }: { overview: GtmOverview | null; inMain?: boolean }) {
  if (!overview) return <section className={inMain ? "gtm-overview-panel" : "gtm-overview-panel mt-8"} aria-label="GTM overview"><div className="gtm-boundary-note"><AlertCircle aria-hidden="true" /><div><strong>Founder overview is waiting for protected GTM data.</strong><p>Counts are intentionally not estimated. The dashboard will show BLOCKED until the canonical reconciliation and enrichment usage can be read.</p></div></div></section>;
  const direct = [["Control Plane leads", overview.direct.metrics.controlPlaneLeads], ["Unique organizations", overview.direct.metrics.uniqueOrganizations], ["Source qualified", overview.direct.metrics.qualified], ["Contact identified", overview.direct.metrics.contactIdentified], ["Enrichment ready", overview.direct.metrics.enrichmentReady], ["Email verified", overview.direct.metrics.emailVerified], ["Suppression clear", overview.direct.metrics.suppressionClear], ["Draft ready", overview.direct.metrics.draftReady], ["Human review", overview.direct.metrics.humanReview], ["Approved", overview.direct.metrics.approved], ["Sent", overview.direct.metrics.sent], ["Replies", overview.direct.metrics.replies], ["Free first award", overview.direct.metrics.freeFirstAward], ["Activated", overview.direct.metrics.activated], ["Paid", overview.direct.metrics.paid]] as Array<[string, GtmMetric]>;
  const partner = [["Researched", overview.partner.metrics.researched], ["High fit", overview.partner.metrics.highFit], ["Contact identified", overview.partner.metrics.contactIdentified], ["Enrichment ready", overview.partner.metrics.enrichmentReady], ["Email verified", overview.partner.metrics.emailVerified], ["Draft ready", overview.partner.metrics.draftReady], ["Human review", overview.partner.metrics.humanReview], ["Approved", overview.partner.metrics.approved], ["Contacted", overview.partner.metrics.contacted], ["Replies", overview.partner.metrics.replies], ["Active conversations", overview.partner.metrics.activeConversations], ["Partners activated", overview.partner.metrics.activatedPartners], ["Customers influenced", overview.partner.metrics.customersInfluenced], ["Paid customers influenced", overview.partner.metrics.paidCustomersInfluenced], ["ARR influenced", overview.partner.metrics.arrInfluenced]] as Array<[string, GtmMetric]>;
  return <section className={inMain ? "gtm-overview-panel" : "gtm-overview-panel mt-8"} aria-labelledby="gtm-overview-heading">
    <div className="gtm-section-heading"><div><p className="eyebrow">Founder-level GTM overview</p><h2 id="gtm-overview-heading">Pipeline health from canonical records</h2><p>Actual counts come from protected source records. Targets are operating goals, not achieved results. Website traffic remains in Google Analytics.</p></div><span className="status-badge status-neutral">OUTBOUND LOCKED</span></div>
    <div className="gtm-automation-metrics" aria-label="GTM queue health"><article><strong>{overview.direct.health}</strong><span>direct queue</span></article><article><strong>{overview.partner.health}</strong><span>partner queue</span></article><article><strong>{overview.controlPlane.health}</strong><span>Control Plane</span></article><article><strong>{overview.enrichment.health}</strong><span>contact enrichment</span></article></div>
    <div className="grid gap-6 lg:grid-cols-2 mt-6"><OverviewMetricTable title="Direct nonprofit pipeline" rows={direct} /><OverviewMetricTable title="Partner pipeline" rows={partner} /></div>
    <div className="grid gap-6 lg:grid-cols-2 mt-6"><div className="panel"><p className="eyebrow">Control Plane freshness</p><h3>{overview.controlPlane.health}</h3><p>Last Control Plane refresh: {overview.controlPlane.lastRefresh ? formatDateTime(overview.controlPlane.lastRefresh) : "not recorded"} · Source: private Firestore reconciliation</p><p>Last prospect queue update: {overview.controlPlane.lastRefresh ? formatDateTime(overview.controlPlane.lastRefresh) : "not recorded"}</p><p>Cards: {metricValue(overview.controlPlane.cards)} · Unique organizations: {metricValue(overview.controlPlane.uniqueOrganizations)} · Duplicates: {metricValue(overview.controlPlane.duplicates)} · Disqualified: {metricValue(overview.controlPlane.disqualified)} · Missing / unaccounted: {metricValue(overview.controlPlane.missingOrUnaccounted)}</p></div><div className="panel"><p className="eyebrow">Contact / enrichment health</p><h3>{overview.enrichment.health}</h3><p>Last contact enrichment: {overview.enrichment.lastRun ? formatDateTime(overview.enrichment.lastRun) : "not recorded"}</p><p>Hunter lookups: {metricValue(overview.enrichment.hunterLookups)} / {overview.enrichment.hunterLookupLimit} · Verifications: {metricValue(overview.enrichment.hunterVerifications)} · Apollo: {metricValue(overview.enrichment.apolloLookups)}</p><p>Verified: {metricValue(overview.enrichment.verifiedEmails)} · Not found: {metricValue(overview.enrichment.notFound)} · Suppressed: {metricValue(overview.enrichment.suppressed)} · Contact not established: {metricValue(overview.enrichment.contactNotEstablished)}</p></div></div>
    <div className="grid gap-6 lg:grid-cols-2 mt-6"><div className="panel"><p className="eyebrow">Top next enrichment candidates</p>{overview.direct.topNextEnrichmentCandidates.length ? <ol className="list-decimal pl-5 space-y-1">{overview.direct.topNextEnrichmentCandidates.map((organization) => <li key={organization}>{organization}</li>)}</ol> : <p>No candidate is displayed until a named contact and verified domain are present.</p>}<p className="eyebrow mt-5">Partner research freshness</p><p>{overview.partner.health} · Last updated: {formatDateTime(overview.partner.lastUpdated)} · Source: {overview.partner.source}</p>{overview.partner.topNextEnrichmentCandidates.length ? <ol className="list-decimal pl-5 space-y-1 mt-3">{overview.partner.topNextEnrichmentCandidates.map((organization) => <li key={organization}>{organization}</li>)}</ol> : null}</div><div className="panel"><p className="eyebrow">Customer funnel</p><p>Approved: {metricValue(overview.funnel.outreachApproved.actual)} · Sent: {metricValue(overview.funnel.sent.actual)} · Replies: {metricValue(overview.funnel.replies.actual)} · Trials: {metricValue(overview.funnel.freeFirstAwardTrials.actual)} · Paid: {metricValue(overview.funnel.paidCustomers.actual)} · MRR: {metricValue(overview.funnel.mrr.actual)} · ARR: {metricValue(overview.funnel.arr.actual)}</p><p className="mt-3">{overview.partner.sourceNote}</p></div></div>
  </section>;
}

function OverviewMetricTable({ title, rows }: { title: string; rows: Array<[string, GtmMetric]> }) {
  return <div className="panel panel-flush"><div className="panel-heading px-5 py-4"><h3>{title}</h3></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Metric</th><th>Current</th><th>Target</th><th>Gap</th></tr></thead><tbody>{rows.map(([label, value]) => <tr key={label}><th>{label}</th><td>{metricValue(value.actual)}</td><td>{metricValue(value.target)}</td><td>{metricValue(value.gap)}</td></tr>)}</tbody></table></div></div>;
}

function metricValue(value: number | null) { return value === null ? "Not instrumented" : String(value); }

function ControlPlanePanel({ reconciliation }: { reconciliation: ControlPlaneQueueReconciliation | null }) {
  const states: ControlPlaneLeadState[] = ["CONTACT_RESEARCH_REQUIRED", "ENRICHMENT_READY", "EMAIL_VERIFICATION_REQUIRED", "SUPPRESSION_CHECK_REQUIRED", "DRAFT_REQUIRED", "READY_FOR_HUMAN_REVIEW", "ALREADY_CONTACTED", "CUSTOMER", "DISQUALIFIED", "DUPLICATE", "QUALIFIED"];
  if (!reconciliation) return <section><div className="workspace-empty"><Radar aria-hidden="true" /><h2>Canonical queue is not available yet</h2><p>The private daily award scan has not saved a reconciliation. This workspace cannot create or send an outbound action.</p></div></section>;
  const cards = reconciliation.cards.filter((card) => card.state !== "DUPLICATE");
  return <section aria-labelledby="control-plane-heading">
    <div className="gtm-section-heading"><div><p className="eyebrow">Canonical direct nonprofit pipeline</p><h2 id="control-plane-heading">Every award lead has one visible queue state</h2><p>This read-only view comes from the private Control Plane reconciliation. It preserves source links, fails closed on verification and suppression, and contains no delivery controls.</p></div><span className="status-badge status-success">SHADOW only</span></div>
    <div className="gtm-automation-metrics" aria-label="Canonical queue summary"><article><strong>{reconciliation.cards.length}</strong><span>source cards</span></article><article><strong>{reconciliation.uniqueOrganizations}</strong><span>unique organizations</span></article><article><strong>{reconciliation.counts.CONTACT_RESEARCH_REQUIRED}</strong><span>contact research</span></article><article><strong>{reconciliation.counts.READY_FOR_HUMAN_REVIEW}</strong><span>human-review only</span></article></div>
    <div className="panel panel-flush mt-6"><div className="table-scroll"><table className="data-table gtm-pipeline-table"><thead><tr><th>Organization</th><th>Observed</th><th>Queue state</th><th>Reason</th><th>Evidence</th></tr></thead><tbody>{cards.map((card) => <tr key={card.cardId}><th>{card.organization}</th><td>{formatDate(card.observedAt)}</td><td><span className="status-badge status-neutral">{card.state.replaceAll("_", " ")}</span></td><td>{card.reason}</td><td>{card.sourceUrls[0] ? <a href={card.sourceUrls[0]} target="_blank" rel="noreferrer">Source <ExternalLink aria-hidden="true" /></a> : "Source retained privately"}</td></tr>)}</tbody></table></div></div>
    <div className="gtm-boundary-note"><ShieldCheck aria-hidden="true" /><div><strong>Queue totals</strong><p>{states.map((state) => state.replaceAll("_", " ") + ": " + reconciliation.counts[state]).join(" · ")}</p></div></div>
  </section>;
}

function InventorySummary({ title, metrics, sent }: { title: string; metrics: Record<string, GtmMetric> | undefined; sent: number }) {
  const direct = title === "Direct lead inventory";
  const manualSent: GtmMetric = { actual: sent, target: null, gap: null };
  const candidates: Array<[string, GtmMetric | undefined]> = direct ? [["Qualified", metrics?.qualified], ["Ready to send", metrics?.humanReview], ["Manual sent", manualSent]] : [["Researched", metrics?.researched], ["High fit", metrics?.highFit], ["Ready to send", metrics?.humanReview], ["Manual sent", manualSent]];
  const items = candidates.filter((item): item is [string, GtmMetric] => item[1]?.actual !== null && item[1]?.actual !== undefined);
  if (!items.length) return null;
  return <div className="panel mb-6" aria-label={title}><p className="eyebrow">Canonical inventory</p><h3>{title}</h3><div className="gtm-automation-metrics mt-4">{items.map(([label, metric]) => <article key={label}><strong>{metric.actual}</strong><span>{label}{metric.target !== null ? ` / ${metric.target} target` : ""}</span></article>)}</div></div>;
}

function SignalsPanel({ dailyScan, loading, error }: { dailyScan: DailySocialScan | null; loading: boolean; error: string }) {
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Voice of the market</p><h2>Public pain signals stay separate from contactable leads</h2><p>Anonymous or unresolved posts help refine positioning. They do not become outreach targets unless the organization and role are independently verified.</p></div></div>
    <div className="gtm-signal-grid">
      <div className="panel gtm-daily-panel"><div className="panel-heading"><div><p className="eyebrow">Manual Reddit + LinkedIn research</p><h3>{loading ? "Loading saved manual research…" : dailyScan ? `${dailyScan.items.length} source-linked result${dailyScan.items.length === 1 ? "" : "s"}` : "No manual research has been saved"}</h3></div><span className="status-badge status-success">Manual only</span></div>
        {error && <div className="compiler-error" role="alert"><AlertCircle aria-hidden="true" />{error}</div>}
        {dailyScan && <><p className="gtm-daily-summary">Last completed {formatDateTime(dailyScan.generatedAt)} · {dailyScan.coverage}</p><div className="gtm-feed-list">{dailyScan.items.map((item) => <article key={item.id}>{item.platform === "reddit" ? <MessageSquareText aria-hidden="true" /> : <UsersRound aria-hidden="true" />}<div><div className="flex flex-wrap items-center gap-2"><span className="status-badge status-neutral">{item.platform}</span><span className="status-badge status-review">research only</span></div><a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink aria-hidden="true" /></a><p>{item.observedPain}</p><small>{item.author !== "unknown" ? `${item.author} · ` : ""}{item.publishedAt !== "unknown" ? item.publishedAt : "publication date needs verification"}</small></div></article>)}</div><details className="gtm-scan-limitations"><summary>Coverage and limitations</summary><ul>{dailyScan.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details></>}
      </div>
      <div className="panel"><div className="panel-heading"><div><p className="eyebrow">Reddit research</p><h3>{redditSignals.length} reviewed threads</h3></div><span className="status-badge status-success">Manual only</span></div><div className="gtm-feed-list">{redditSignals.slice(0, 6).map((item) => <article key={item.id}><MessageSquareText aria-hidden="true" /><div><a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink aria-hidden="true" /></a><p>{item.evidenceSummary}</p><small>{item.community} · {item.confidence} confidence</small></div></article>)}</div></div>
      <div className="panel"><div className="panel-heading"><div><p className="eyebrow">LinkedIn review queue</p><h3>{linkedinItems.length} posts and communities</h3></div><span className="status-badge status-neutral">No automated engagement</span></div><div className="gtm-feed-list">{linkedinItems.slice(0, 6).map((item) => <article key={item.url}><UsersRound aria-hidden="true" /><div><a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink aria-hidden="true" /></a><p>{item.observedPain}</p><small>{item.status.replaceAll("_", " ")} · draft response requires review</small></div></article>)}</div></div>
    </div>
    <div className="gtm-boundary-note"><ShieldCheck aria-hidden="true" /><div><strong>Social research is manual-only.</strong><p>No Reddit or LinkedIn discovery job runs automatically. The workspace preserves previously reviewed public evidence, but does not crawl profiles, discover contacts, post, comment, message, or email anyone.</p></div></div>
  </section>;
}

function SourcesPanel() {
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Signal engines</p><h2>Know exactly which scanners are active—and which are not</h2><p>The dashboard never labels an unconfigured source as connected. Each lane shows its cadence, coverage, and practical boundary.</p></div></div><div className="gtm-source-registry">{signalSources.map((source) => <article key={source.name}><div className="gtm-source-icon"><Radar aria-hidden="true" /></div><div><div className="flex flex-wrap items-center gap-2"><h3>{source.name}</h3><span className={`status-badge ${source.status === "active" ? "status-success" : source.status === "configuration" ? "status-review" : "status-neutral"}`}>{source.status}</span></div><p>{source.coverage}</p><small>{source.cadence}</small></div><div className="gtm-source-boundary"><strong>Boundary</strong><p>{source.boundary}</p><a href={source.url} target="_blank" rel="noreferrer">Source policy or configuration <ExternalLink aria-hidden="true" /></a></div></article>)}</div></section>;
}

function PartnersPanel({ records, overview }: { records: OutreachRecord[]; overview: GtmOverview | null }) {
  const metrics = summarizeOutreach(records);
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Partner distribution</p><h2>Reach nonprofit teams through people they already trust</h2><p>Accountants and grant consultants can introduce the readiness assessment without making unverified partnership or referral-fee claims.</p></div></div><InventorySummary title="Partner inventory" metrics={overview?.partner.metrics} sent={metrics.partnerSent} /><div className="gtm-partner-grid">{referralChannels.map((channel) => <article key={channel.name}><Handshake aria-hidden="true" /><span className="status-badge status-neutral">{channel.status}</span><h3>{channel.name}</h3><strong>{channel.offer}</strong><p>{channel.value}</p><div><small>Next action</small><p>{channel.nextAction}</p></div></article>)}</div></section>;
}

function PipelinePanel({ opportunities, stages, stagesOrder, onStageChange }: { opportunities: GtmOpportunity[]; stages: StageState; stagesOrder: OpportunityStage[]; onStageChange(id: string, stage: OpportunityStage): void }) {
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Progress monitor</p><h2>Track every opportunity without pretending there is a CRM</h2><p>Progress is saved in this private browser workspace. No external CRM, email inbox, or campaign analytics are connected yet.</p></div></div><div className="gtm-pipeline-summary">{stagesOrder.map((stage) => <article key={stage}><strong>{opportunities.filter((item) => (stages[item.id] || "new") === stage).length}</strong><span>{stage.replaceAll("_", " ")}</span></article>)}</div><div className="panel panel-flush mt-6"><div className="table-scroll"><table className="data-table gtm-pipeline-table"><thead><tr><th>Organization</th><th>Signal</th><th>Score</th><th>Evidence</th><th>Progress</th></tr></thead><tbody>{opportunities.map((opportunity) => { const accuracy = assessOpportunityAccuracy(opportunity); return <tr key={opportunity.id}><th>{opportunity.organization}</th><td>{labelForSignal(opportunity.signalKind)}</td><td>{accuracy.score} · {formatOpportunityScore(accuracy.label)}</td><td>{opportunity.evidence.length} source{opportunity.evidence.length === 1 ? "" : "s"} · {accuracy.confidence}</td><td><label className="sr-only" htmlFor={`stage-${opportunity.id}`}>Progress for {opportunity.organization}</label><select id={`stage-${opportunity.id}`} className="table-select" value={stages[opportunity.id] || "new"} onChange={(event) => onStageChange(opportunity.id, event.target.value as OpportunityStage)}>{stagesOrder.map((stage) => <option value={stage} key={stage}>{stage.replaceAll("_", " ")}</option>)}</select></td></tr>; })}</tbody></table></div></div></section>;
}

function OutreachAutomationPanel({ opportunities, stages }: { opportunities: GtmOpportunity[]; stages: StageState }) {
  const verifiedContacts = opportunities.filter((item) => assessOpportunityAccuracy(item).readyForAction);
  const approved = verifiedContacts.filter((item) => stages[item.id] === "ready");
  const steps = [
    ["Daily signal discovery", "Active", "The bounded USAspending award scan runs once per day. Reddit and LinkedIn stay manual-only."],
    ["Contact enrichment", "Needs provider", "Resolve a current finance or grants leader and verify the address from an authoritative source. Apollo, Clay, or another permissioned provider can fill this lane."],
    ["Personalized draft", "Active", "Each supported lead receives a signal-specific subject and first-touch draft. Unknown details remain blank."],
    ["Human approval", "Required", "A reviewer checks the recipient, evidence, and message. The record remains a SHADOW draft and does not enter a send queue."],
    ["Outbound delivery", "Disabled", "No Resend, Gmail, SMTP, LinkedIn, Reddit, contact-form, or campaign integration is enabled in SHADOW mode."]
  ];
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">SHADOW outreach drafting</p><h2>Research and drafts stay reviewable. Delivery stays locked.</h2><p>The workspace prepares source-backed draft language only. It does not contact anyone, hand off an email-client draft, or export a send queue.</p></div><button type="button" className="button button-primary" disabled title="Outbound remains locked in SHADOW mode"><MailCheck aria-hidden="true" />Outbound locked</button></div>
    <div className="gtm-automation-metrics"><article><strong>{opportunities.length}</strong><span>research candidates</span></article><article><strong>{verifiedContacts.length}</strong><span>verified contacts</span></article><article><strong>{approved.length}</strong><span>drafts awaiting review</span></article><article><strong>0</strong><span>outbound actions sent</span></article></div>
    <div className="gtm-automation-flow">{steps.map(([title, status, detail], index) => <article key={title}><span>{index + 1}</span><div><div className="flex flex-wrap items-center gap-2"><h3>{title}</h3><small className={`status-badge ${status === "Active" ? "status-success" : status === "Required" ? "status-review" : "status-neutral"}`}>{status}</small></div><p>{detail}</p></div></article>)}</div>
    <div className="gtm-boundary-note"><ShieldCheck aria-hidden="true" /><div><strong>Future LIVE gate is disabled</strong><p>Limit automated delivery to U.S. recipients with a verified business role and address, include an accurate sender identity, advertisement disclosure, physical postal address, and working opt-out, suppress every opt-out immediately, and never send more than one automated follow-up. Keep LinkedIn messages and comments manual.</p></div></div>
  </section>;
}

function AccuracyPanel() {
  const controls = [
    ["Separate facts from inference", "Source excerpts, dates, links, and supported fields are shown before the system's interpretation."],
    ["Require identity resolution", "Anonymous posts and review-platform comments remain market evidence until an organization is verified."],
    ["Gate very-high intent", "A 90+ score needs at least two sources. A single strong signal can be useful, but it cannot receive the strongest label."],
    ["Expose unknowns and conflicts", "Our AI-powered solution never fills missing contacts, unclear reporting cadence, stale jobs, conflicting award amounts, or source gaps with guesses."],
    ["Use deterministic scoring", "Pain, timing, fit, and potential value are capped, visible components. Our AI-powered solution may summarize evidence but does not secretly change the score."],
    ["Keep outreach human-approved", "The system drafts and copies a message only after review. It does not scrape contact details or send email, LinkedIn messages, or comments automatically."],
    ["Preserve an audit trail", "Each alert retains the original source URL, observation date, excerpt, status changes, and the reason it was approved or dismissed."],
    ["Recheck freshness", "Signals older than 45 days receive a warning; closed job listings and changed awards must be reverified before action."]
  ];
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Trust architecture</p><h2>Accuracy comes from a controlled workflow, not an unexplained confidence score</h2><p>The product reduces unsupported output by limiting what our AI-powered solution can assert, validating source coverage, and blocking action when required evidence is missing.</p></div></div><div className="gtm-accuracy-grid">{controls.map(([title, detail], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><CheckCircle2 aria-hidden="true" /><div><h3>{title}</h3><p>{detail}</p></div></article>)}</div><div className="gtm-boundary-note"><Sparkles aria-hidden="true" /><div><strong>Our AI-powered solution supports classification, summarization, and draft language.</strong><p>Source retrieval, score caps, duplicate checks, contradiction flags, eligibility gates, consent checks, and sending boundaries remain deterministic.</p></div></div></section>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof BellRing; label: string; value: number | string; detail: string }) {
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

function mergeAwardCandidates(candidates: GtmOpportunity[], verified: GtmOpportunity[]) {
  const candidateIds = new Set(candidates.map((item) => item.id));
  return [...candidates, ...verified.filter((item) => !candidateIds.has(item.id))];
}
function OutreachHistoryPanel({ records, canonicalOpportunityIds, filter, query, onFilter, onQuery }: { records: OutreachRecord[]; canonicalOpportunityIds: readonly string[]; filter: OutreachFilter; query: string; onFilter(value: OutreachFilter): void; onQuery(value: string): void }) {
  const metrics = summarizeOutreach(records);
  const matchesFilter = (record: OutreachRecord) => filter === "all" || filter === "awaiting" && !record.replied || filter === "follow_up_due" && Boolean(record.followUpDueAt) || filter === "replied" && record.replied || filter === "positive" && record.replySentiment === "POSITIVE" || filter === "trial" && record.trial || filter === "paid" && record.customer || filter === "direct" && record.type === "DIRECT_NONPROFIT" || filter === "partner" && record.type === "PARTNER";
  const filteredRecords = records.filter((record) => matchesFilter(record) && [record.contact, record.organization, record.persona, record.email || "", record.whyNowSignal || ""].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const links = new Map(reconcileOutreachControlPlane(records, canonicalOpportunityIds).map((link) => [link.recordId, link]));
  const filterLabels: Array<[OutreachFilter, string]> = [["all", "All"], ["awaiting", "Awaiting reply"], ["follow_up_due", "Follow-up due"], ["replied", "Replied"], ["positive", "Positive"], ["trial", "Trial"], ["paid", "Paid"], ["direct", "Direct"], ["partner", "Partner"]];
  return <section aria-labelledby="outreach-history-heading"><div className="gtm-section-heading"><div><p className="eyebrow">Canonical human-confirmed activity</p><h2 id="outreach-history-heading">Contact history is factual and read-only</h2><p>Read-only canonical records only. Email delivery, replies, follow-up dates, trials, and payments are never inferred.</p></div><span className="status-badge status-neutral">NO SEND CONTROLS</span></div><div className="gtm-automation-metrics" aria-label="Outreach ledger summary"><article><strong>{metrics.totalSent}</strong><span>sent events</span></article><article><strong>{metrics.uniqueOrganizationsContacted}</strong><span>unique organizations contacted</span></article><article><strong>{metrics.directUniqueOrganizationsContacted}</strong><span>direct unique</span></article><article><strong>{metrics.partnerUniqueOrganizationsContacted}</strong><span>partner unique</span></article></div><div className="gtm-toolbar"><label className="gtm-search"><Search aria-hidden="true" /><span className="sr-only">Search outreach history</span><input aria-label="Search outreach history" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search organization, contact, or why now" /></label><div className="gtm-filters"><select className="form-control" aria-label="Filter outreach type" value={filter} onChange={(event) => onFilter(event.target.value as OutreachFilter)}>{filterLabels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div><div className="panel panel-flush mt-6"><div className="table-scroll"><table className="data-table gtm-pipeline-table"><thead><tr><th>Organization</th><th>Contact</th><th>Type</th><th>Email state</th><th>Why now / source</th><th>Sent</th><th>Status</th><th>Last contact</th><th>Follow-up due</th><th>Replied</th><th>Sentiment</th><th>Trial</th><th>Paid</th><th>Next action</th></tr></thead><tbody>{filteredRecords.map((record) => { const link = links.get(record.id)!; return <tr key={record.id}><th>{record.organization}</th><td>{record.contact}<small className="block font-normal text-slate-500">{record.persona}</small></td><td>{record.type === "DIRECT_NONPROFIT" ? "Direct" : "Partner"}</td><td>{record.email ? "Recorded" : "Not recorded"}</td><td>{record.whyNowSignal || "Not recorded"}<small className="block font-normal text-slate-500">{record.signalSource ? <a href={record.signalSource} target="_blank" rel="noreferrer">Source</a> : record.source.replaceAll("_", " ").toLowerCase()}</small></td><td>{formatHistoryDate(record.sentAt)}</td><td><span className="status-badge status-neutral">{record.status.replaceAll("_", " ")}</span><small className="block font-normal text-slate-500">{link.status === "LINKED" ? "linked" : "pending canonical link"}</small></td><td>{formatHistoryDate(record.lastContactAt)}</td><td>{record.followUpDueAt ? formatHistoryDate(record.followUpDueAt) : "Not yet configured"}</td><td>{record.replied ? "Yes" : "No"}</td><td>{record.replySentiment.replaceAll("_", " ")}</td><td>{record.trial ? "Yes" : "No"}</td><td>{record.customer ? "Yes" : "No"}</td><td>{record.nextAction.replaceAll("_", " ")}</td></tr>; })}</tbody></table></div></div></section>;
}

function formatHistoryDate(value: string | null) {
  if (!value) return "Date not recorded";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}
