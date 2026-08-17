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

type DashboardTab = "overview" | "hot-list" | "control-plane" | "outreach-history" | "signals" | "sources" | "partners" | "pipeline" | "automation" | "accuracy";
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

export function GtmDashboardContent({ dailySignalToken, initialDailyScan = null, initialAwardScan = null, initialControlPlane = null, initialOverview = null, seedOpportunities = [] }: { dailySignalToken?: () => Promise<string>; initialDailyScan?: DailySocialScan | null; initialAwardScan?: AwardDiscoveryScan | null; initialControlPlane?: ControlPlaneQueueReconciliation | null; initialOverview?: GtmOverview | null; seedOpportunities?: GtmOpportunity[] } = {}) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("hot-list");
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
  const [signalsLoading, setSignalsLoading] = useState(Boolean(dailySignalToken));
  const [signalsError, setSignalsError] = useState("");

  useEffect(() => {
    if (!dailySignalToken) return;
    let active = true;
    dailySignalToken().then(async (idToken) => Promise.all([
      apiRequest<{ opportunities: GtmOpportunity[] }>("/api/gtm/opportunities", idToken),
      apiRequest<{ scan: DailySocialScan | null }>("/api/gtm/daily-signals", idToken),
      apiRequest<{ scan: AwardDiscoveryScan | null }>("/api/gtm/award-signals", idToken),
      apiRequest<{ reconciliation: ControlPlaneQueueReconciliation | null }>("/api/gtm/control-plane-queue", idToken),
      apiRequest<{ overview: GtmOverview }>("/api/gtm/overview", idToken)
    ]))
      .then(([opportunityBody, socialBody, awardBody, controlPlaneBody, overviewBody]) => {
        if (!active) return;
        setDailyScan(socialBody.scan);
        setAwardScan(awardBody.scan);
        setControlPlane(controlPlaneBody.reconciliation);
        setOverview(overviewBody.overview);
        setLiveOpportunities(mergeAwardCandidates(awardBody.scan?.opportunities || [], opportunityBody.opportunities));
        setExpanded((current) => current || opportunityBody.opportunities[0]?.id || null);
      })
      .catch((requestError) => { if (active) setSignalsError(requestError instanceof Error ? requestError.message : "Daily signals could not be loaded."); })
      .finally(() => { if (active) setSignalsLoading(false); });
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
  const readyCount = ranked.filter((item) => assessOpportunityAccuracy(item).readyForAction).length;
  const unresolvedAwardCandidates = ranked.filter((item) => item.signalKind === "grant_award" && !item.primaryContact?.email).length;
  const outreachMetrics = summarizeOutreach(confirmedHumanOutreach);
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
          <Metric icon={MailCheck} label="Human-confirmed sends" value={outreachMetrics.totalSent} detail={`${outreachMetrics.awaitingResponse} awaiting response · read-only ledger`} />
        </div>
        <OverviewPanel overview={overview} />
      </div>
    </header>

    <div className="gtm-tab-wrap">
      <div className="site-shell gtm-tabs" role="tablist" aria-label="GTM dashboard sections">
        {([
          ["overview", "Overview"], ["hot-list", "Daily hot list"], ["control-plane", "Canonical queue"], ["outreach-history", "Outreach history"], ["signals", "Manual social research"], ["sources", "Signal engines"], ["partners", "Referral channels"], ["pipeline", "Progress"], ["automation", "Outreach automation"], ["accuracy", "Accuracy controls"]
        ] as Array<[DashboardTab, string]>).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}>{label}</button>)}
      </div>
    </div>

    <div className="site-shell py-8 lg:py-12">
      {activeTab === "overview" && <OverviewPanel overview={overview} inMain />}
      {activeTab === "hot-list" && <section aria-labelledby="hot-list-heading">
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

      {activeTab === "control-plane" && <ControlPlanePanel reconciliation={controlPlane} />}
      {activeTab === "outreach-history" && <OutreachHistoryPanel records={confirmedHumanOutreach} canonicalOpportunityIds={controlPlane?.cards.map((card) => card.canonicalCardId) || ranked.map((opportunity) => opportunity.id)} />}
      {activeTab === "signals" && <SignalsPanel dailyScan={dailyScan} loading={signalsLoading} error={signalsError} />}
      {activeTab === "sources" && <SourcesPanel />}
      {activeTab === "partners" && <PartnersPanel />}
      {activeTab === "pipeline" && <PipelinePanel opportunities={ranked} stages={stages} stagesOrder={pipelineStages} onStageChange={updateStage} />}
      {activeTab === "automation" && <OutreachAutomationPanel opportunities={ranked} stages={stages} />}
      {activeTab === "accuracy" && <AccuracyPanel />}
    </div>
  </div>;
}

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

function PartnersPanel() {
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Partner distribution</p><h2>Reach nonprofit teams through people they already trust</h2><p>Accountants and grant consultants can introduce the readiness assessment without making unverified partnership or referral-fee claims.</p></div></div><div className="gtm-partner-grid">{referralChannels.map((channel) => <article key={channel.name}><Handshake aria-hidden="true" /><span className="status-badge status-neutral">{channel.status}</span><h3>{channel.name}</h3><strong>{channel.offer}</strong><p>{channel.value}</p><div><small>Next action</small><p>{channel.nextAction}</p></div></article>)}</div></section>;
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

function mergeAwardCandidates(candidates: GtmOpportunity[], verified: GtmOpportunity[]) {
  const candidateIds = new Set(candidates.map((item) => item.id));
  return [...candidates, ...verified.filter((item) => !candidateIds.has(item.id))];
}
function OutreachHistoryPanel({ records, canonicalOpportunityIds }: { records: OutreachRecord[]; canonicalOpportunityIds: readonly string[] }) {
  const metrics = summarizeOutreach(records);
  const links = new Map(reconcileOutreachControlPlane(records, canonicalOpportunityIds).map((link) => [link.recordId, link]));
  return <section aria-labelledby="outreach-history-heading">
    <div className="gtm-section-heading"><div><p className="eyebrow">Canonical human-confirmed activity</p><h2 id="outreach-history-heading">Contact history is factual and read-only</h2><p>These entries record only the ten human-confirmed sends on August 17, 2026. No email address, provider delivery, reply, trial, conversion, or follow-up has been inferred.</p></div><span className="status-badge status-neutral">NO SEND CONTROLS</span></div>
    <div className="gtm-automation-metrics" aria-label="Outreach ledger summary"><article><strong>{metrics.totalSent}</strong><span>sent</span></article><article><strong>{metrics.directSent}</strong><span>direct nonprofit</span></article><article><strong>{metrics.partnerSent}</strong><span>partner</span></article><article><strong>{metrics.awaitingResponse}</strong><span>awaiting response</span></article></div>
    <div className="panel panel-flush mt-6"><div className="table-scroll"><table className="data-table gtm-pipeline-table"><thead><tr><th>Contact</th><th>Organization</th><th>Type</th><th>Sent</th><th>Signal / provenance</th><th>Canonical link</th><th>Outcome</th></tr></thead><tbody>{records.map((record) => {
      const link = links.get(record.id)!;
      return <tr key={record.id}><th>{record.contact}<small className="block font-normal text-slate-500">{record.persona}</small></th><td>{record.organization}</td><td>{record.type.replaceAll("_", " ")}</td><td>{formatHistoryDate(record.sentAt)}<small className="block font-normal text-slate-500">date confirmed</small></td><td>{record.whyNowSignal ? <>{record.whyNowSignal}<small className="block font-normal text-slate-500">{record.signalSource}</small></> : <small>{record.source.replaceAll("_", " ").toLowerCase()}</small>}</td><td><span className={`status-badge ${link.status === "LINKED" ? "status-success" : "status-review"}`}>{link.status === "LINKED" ? "linked" : "pending canonical link"}</span>{link.canonicalOpportunityId ? <small className="block font-normal text-slate-500">{link.canonicalOpportunityId}</small> : null}</td><td>Awaiting response<small className="block font-normal text-slate-500">No reply, trial, or conversion recorded</small></td></tr>;
    })}</tbody></table></div></div>
    <div className="gtm-boundary-note"><ShieldCheck aria-hidden="true" /><div><strong>Read-only record of human activity</strong><p>Records without source-backed Control Plane IDs remain pending. They are not matched by name, and this view has no email, delivery, or outreach action.</p></div></div>
  </section>;
}

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

