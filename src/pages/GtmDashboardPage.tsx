import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileSearch,
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
import seoContentQueue from "../../ops/seo-content-queue.json";
import seoSchedule from "../../ops/seo-schedule.json";
import seoAssetInventory from "../../reports/seo-content-asset-inventory.json";
import linkedinItems from "../../gtm/data/linkedin-engagement.json";
import { signalSources } from "../data/gtmData";
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
import { FULL_FUNNEL_STAGES, PARTNER_ICP_TYPES, PRODUCT_LED_ABANDONMENT_ACTIONS, scoreGrantComplexity } from "../lib/gtmExpansion";
import { isDefaultSocialAction, reconcileSocialQueue, socialActionUpdate, validateSocialActionRecord, type SocialActionRecord, type SocialActionStatus } from "../lib/gtmActionState";
import type { ControlPlaneLeadState, ControlPlaneQueueReconciliation } from "../lib/gtmControlPlaneQueue";
import type { GtmOverview, GtmMetric } from "../lib/gtmOverview";
import { applyManualFollowUpCadence, confirmedHumanOutreach, initialOutreachEligibility, reconcileOutreachControlPlane, summarizeOutreach, type OutreachRecord } from "../lib/gtmOutreach";
import { canonicalPartnerResearch } from "../lib/partnerPipeline";

type DashboardTab = "overview" | "customers" | "partners" | "social" | "seo" | "feedback" | "system-health";
type StageState = Record<string, OpportunityStage>;
type OutreachFilter = "all" | "awaiting" | "follow_up_due" | "replied" | "positive" | "negative" | "trial" | "paid" | "direct" | "partner" | "ready_to_send" | "needs_verification" | "suppressed" | "already_contacted";
type CustomerActionFilter = "to_contact" | "awaiting_reply" | "follow_up_due" | "replied" | "positive" | "all_contacted" | "suppressed";
const SOCIAL_STATE_KEY = "grantdeskhq:gtm-social-actions:v1";

const STORAGE_KEY = "grantdeskhq:gtm-stages:v1";

export function GtmDashboardPage() {
  const { user, loading, token } = useAuth();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  useEffect(() => {
    if (!user) return;
    token()
      .then((idToken) => apiRequest<{ allowed: boolean }>("/api/gtm/access", idToken))
      .then((body) => setAccess(body.allowed ? "allowed" : "denied"))
      .catch(() => setAccess("denied"));
  }, [user, token]);
  if (loading) return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading GTM command center…</div>;
  if (!user) return <Navigate replace to="/login?next=/gtm" />;
  if (access === "checking") return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Verifying private workspace access…</div>;
  if (access === "denied") return <section className="workspace-page"><div className="site-shell py-16"><div className="workspace-empty"><ShieldCheck aria-hidden="true" /><h1>Private workspace</h1><p>The GTM command center is restricted to the GrantDeskHQ administrator.</p><Link className="button button-primary" to="/workspace">Return to your reports</Link></div></div></section>;
  return <GtmDashboardContent dailySignalToken={token} />;
}

export function GtmDashboardContent({ dailySignalToken, initialDailyScan = null, initialAwardScan = null, initialControlPlane = null, initialOverview = null, seedOpportunities = [] }: { dailySignalToken?: () => Promise<string>; initialDailyScan?: DailySocialScan | null; initialAwardScan?: AwardDiscoveryScan | null; initialControlPlane?: ControlPlaneQueueReconciliation | null; initialOverview?: GtmOverview | null; seedOpportunities?: GtmOpportunity[] } = {}) {
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
  const [signalsLoading, setSignalsLoading] = useState(Boolean(dailySignalToken));
  const [signalsError, setSignalsError] = useState("");
  const [outreach, setOutreach] = useState<OutreachRecord[]>(confirmedHumanOutreach);
  const [outreachFilter, setOutreachFilter] = useState<OutreachFilter>("all");
  const [outreachQuery, setOutreachQuery] = useState("");
  const [customerActionFilter, setCustomerActionFilter] = useState<CustomerActionFilter>("to_contact");
  const [socialActions, setSocialActions] = useState<SocialActionRecord[]>(() => readSocialActions());

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

  useEffect(() => {
    if (!dailySignalToken) return;
    let active = true;
    dailySignalToken().then((idToken) => apiRequest<{ outreach: OutreachRecord[] }>("/api/gtm/outreach", idToken)).then((body) => { if (active && body.outreach.length) setOutreach(body.outreach); }).catch(() => { /* Retain the factual local no-data fallback. */ });
    return () => { active = false; };
  }, [dailySignalToken]);


  useEffect(() => { try { localStorage.setItem(SOCIAL_STATE_KEY, JSON.stringify(socialActions)); } catch { /* Browser storage can be unavailable. */ } }, [socialActions]);

  const ranked = useMemo(() => rankGtmOpportunities(liveOpportunities), [liveOpportunities]);
  const scheduledOutreach = useMemo(() => applyManualFollowUpCadence(outreach), [outreach]);
  const sendReadyCustomers = useMemo(() => ranked.filter((opportunity) => opportunity.targetTier !== "adjacent" && assessOpportunityAccuracy(opportunity).readyForAction && initialOutreachEligibility(scheduledOutreach, { organization: opportunity.organization, email: opportunity.primaryContact?.email }) === "ELIGIBLE_FOR_INITIAL_OUTREACH"), [ranked, scheduledOutreach]);
  const needsVerificationCustomers = ranked.filter((opportunity) => !sendReadyCustomers.some((candidate) => candidate.id === opportunity.id)).length;
  const visible = ranked.filter((opportunity) => {
    const matchesFilter = filter === "all" || opportunity.signalKind === filter;
    const eligibility = initialOutreachEligibility(scheduledOutreach, { organization: opportunity.organization, email: opportunity.primaryContact?.email });
    const matchesAction = customerActionFilter === "to_contact" && eligibility === "ELIGIBLE_FOR_INITIAL_OUTREACH" && assessOpportunityAccuracy(opportunity).readyForAction;
    const haystack = [opportunity.organization, opportunity.headline, opportunity.funder || ""].join(" ").toLowerCase();
    return matchesFilter && matchesAction && haystack.includes(query.trim().toLowerCase());
  });
  const unresolvedAwardCandidates = ranked.filter((item) => item.signalKind === "grant_award" && !item.primaryContact?.email).length;
  const outreachMetrics = summarizeOutreach(outreach);
  const updateStage = (id: string, stage: OpportunityStage) => setStages((current) => ({ ...current, [id]: stage }));
  const updateSocialAction = (record: ReturnType<typeof socialActionUpdate>) => setSocialActions((current) => [...current.filter((item) => item.id !== record.id), record]);
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
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><div className="prototype-pill"><span aria-hidden="true" /> Private founder console · human approval required</div><p className="eyebrow mt-6">Commercial operating view</p><h1>Founder GTM Command Center</h1><p>Manual outreach is active. Instantly is warming and no automated campaign is active.</p></div><span className="status-badge status-neutral">INSTANTLY WARMING · AUTOMATION PAUSED</span></div>
      </div>
    </header>

    <div className="gtm-tab-wrap">
      <div className="site-shell gtm-tabs" role="tablist" aria-label="GTM dashboard sections">
        {([
          ["overview", "Overview"], ["customers", "Customers"], ["partners", "Partners"], ["social", "Social"], ["seo", "SEO"], ["feedback", "Feedback"], ["system-health", "System Health"]
        ] as Array<[DashboardTab, string]>).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}>{label}</button>)}
      </div>
    </div>

    <div className="site-shell py-8 lg:py-12">
      {activeTab === "overview" && <FounderOverview records={scheduledOutreach} overview={overview} sendReadyCustomers={sendReadyCustomers} needsVerificationCustomers={needsVerificationCustomers} onOpenOutreach={() => setActiveTab("customers")} onOpenCustomers={(filter) => { setCustomerActionFilter(filter); setOutreachFilter(filter === "to_contact" ? "all" : filter === "awaiting_reply" ? "awaiting" : filter === "follow_up_due" ? "follow_up_due" : filter === "all_contacted" ? "already_contacted" : filter as OutreachFilter); setActiveTab("customers"); }} onOpenSocial={() => setActiveTab("social")} />}
      {activeTab === "customers" && <section aria-labelledby="hot-list-heading">
        <div className="gtm-filters mb-5" aria-label="Customer action filter">{([ ["to_contact", "To contact"], ["awaiting_reply", "Awaiting reply"], ["follow_up_due", "Follow-up due"], ["replied", "Replied"], ["positive", "Positive"], ["all_contacted", "All contacted"], ["suppressed", "Suppressed"] ] as Array<[CustomerActionFilter, string]>).map(([value, label]) => <button key={value} type="button" className={customerActionFilter === value ? "is-active" : ""} aria-pressed={customerActionFilter === value} onClick={() => { setCustomerActionFilter(value); if (value !== "to_contact") setOutreachFilter(value === "awaiting_reply" ? "awaiting" : value === "follow_up_due" ? "follow_up_due" : value === "all_contacted" ? "already_contacted" : value as OutreachFilter); }}>{label}</button>)}</div>
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

      {activeTab === "customers" && <><SignalComplexityPanel opportunities={ranked} /><CustomerSendReadyPanel opportunities={sendReadyCustomers} needsVerification={needsVerificationCustomers} onReview={(id) => setExpanded(id)} /><OutreachHistoryPanel records={scheduledOutreach.filter((record) => record.type === "DIRECT_NONPROFIT")} canonicalOpportunityIds={controlPlane?.cards.map((card) => card.canonicalCardId) || ranked.map((opportunity) => opportunity.id)} filter={outreachFilter} query={outreachQuery} onFilter={setOutreachFilter} onQuery={setOutreachQuery} /></>}
      {activeTab === "social" && <SocialEngagementPanel actions={socialActions} onAction={updateSocialAction} />}
      {activeTab === "partners" && <><PartnersPanel records={scheduledOutreach} overview={overview} /><GtmExpansionPanel /></>}
      {activeTab === "feedback" && <FeedbackPanel />}
      {activeTab === "seo" && <SeoOperationsPanel />}
      {activeTab === "system-health" && <><OverviewPanel overview={overview} inMain /><div className="mt-8"><ControlPlanePanel reconciliation={controlPlane} /></div><div className="mt-8"><SignalsPanel dailyScan={dailyScan} loading={signalsLoading} error={signalsError} /></div><div className="mt-8"><SourcesPanel /></div><div className="mt-8"><AccuracyPanel /></div></>}
    </div>
  </div>;
}

function FounderOverview({ records, overview, sendReadyCustomers, needsVerificationCustomers, onOpenOutreach, onOpenCustomers, onOpenSocial }: { records: OutreachRecord[]; overview: GtmOverview | null; sendReadyCustomers: GtmOpportunity[]; needsVerificationCustomers: number; onOpenOutreach(): void; onOpenCustomers(filter: CustomerActionFilter): void; onOpenSocial(): void }) {
  const metrics = summarizeOutreach(records);
  const positiveReplies = records.filter((record) => record.replySentiment === "POSITIVE").length;
  const recordedMrr = overview?.funnel?.mrr?.actual;
  const actions = [...operatorActions(records), ...sendReadyCustomers.map((item) => ({ priority: "P1", record: { id: item.id, organization: item.organization }, action: "Review and manually send approved first email", reason: item.whyNow, dueState: "Ready after human review" })), ...(needsVerificationCustomers ? [{ priority: "P2", record: { id: "verification", organization: `${needsVerificationCustomers} signal records` }, action: "Verify contact before first outreach", reason: "No verified eligible recipient", dueState: "No date inferred" }] : [])];
  return <section aria-labelledby="founder-overview-heading"><div className="gtm-section-heading"><div><p className="eyebrow">Commercial performance</p><h2 id="founder-overview-heading">What happened and what needs attention</h2><p>Canonical manual outreach and recorded outcomes only.</p></div><button type="button" className="button button-secondary" onClick={onOpenOutreach}>Open Outreach</button></div><div className="gtm-automation-metrics" aria-label="Commercial funnel"><article><strong>{metrics.totalSent}</strong><span>Sent email events</span></article><article><strong>{metrics.uniqueOrganizationsContacted}</strong><span>Unique contacted</span></article><article><strong>{metrics.awaitingResponse}</strong><span>Awaiting reply</span></article><article><strong>{metrics.replied}</strong><span>Replies</span></article><article><strong>{positiveReplies}</strong><span>Positive replies</span></article><article><strong>{metrics.trials}</strong><span>Trials / Free First Awards</span></article><article><strong>{metrics.customers}</strong><span>Paid</span></article><article><strong>{recordedMrr === null || recordedMrr === undefined ? "—" : String.fromCharCode(36) + recordedMrr}</strong><span>MRR {recordedMrr === null || recordedMrr === undefined ? "not recorded" : ""}</span></article></div><div className="gtm-actions mt-5" aria-label="Overview action shortcuts"><button type="button" className="button button-secondary button-small" onClick={() => onOpenCustomers("to_contact")}>Customers ready to send</button><button type="button" className="button button-secondary button-small" onClick={() => onOpenCustomers("awaiting_reply")}>Awaiting replies</button><button type="button" className="button button-secondary button-small" onClick={() => onOpenCustomers("follow_up_due")}>Follow-ups due</button><button type="button" className="button button-secondary button-small" onClick={() => onOpenCustomers("positive")}>Positive replies</button><button type="button" className="button button-secondary button-small" onClick={onOpenSocial}>Social actions</button></div><div className="panel mt-6"><div className="panel-heading"><div><p className="eyebrow">Next actions</p><h3>{actions.length ? `${actions.length} action${actions.length === 1 ? "" : "s"} need attention` : "No operator action is due"}</h3></div><button type="button" className="button button-secondary button-small" onClick={onOpenOutreach}>View contact history</button></div>{actions.length ? <div className="mt-4 divide-y divide-slate-100">{actions.map((action) => <div className="py-3 text-sm" key={`${action.record.id}-${action.action}`}><strong>{action.priority} · {action.record.organization}</strong><p className="text-slate-600">{action.action} · {action.reason} · {action.dueState}</p></div>)}</div> : <p className="mt-4 text-sm text-slate-600">No replies, follow-up dates, trials, customer issues, or feedback actions are recorded. {metrics.uniqueOrganizationsContacted} unique organizations have been contacted and are awaiting responses; follow-up cadence is not configured.</p>}</div><div className="grid gap-6 lg:grid-cols-2 mt-6"><FunnelCard title="Direct funnel" metrics={overview?.direct.metrics} records={records.filter((record) => record.type === "DIRECT_NONPROFIT")} /><FunnelCard title="Partner funnel" metrics={overview?.partner.metrics} records={records.filter((record) => record.type === "PARTNER")} /></div></section>;
}

function FunnelCard({ title, metrics, records }: { title: string; metrics: Record<string, GtmMetric> | undefined; records: OutreachRecord[] }) { const direct = title === "Direct funnel"; const manualSent = records.filter((record) => record.status === "SENT").length; const recorded = (key: string) => metrics?.[key]?.actual; const stages = (direct ? [["Qualified", recorded("qualified")], ["Ready to send", recorded("humanReview")], ["Sent", Math.max(recorded("sent") || 0, manualSent)], ["Replies", records.filter((record) => record.replied).length], ["Positive replies", records.filter((record) => record.replySentiment === "POSITIVE").length], ["Free First Award", records.filter((record) => record.trial).length], ["Paid", records.filter((record) => record.customer).length]] : [["High fit", recorded("highFit")], ["Ready to send", recorded("humanReview")], ["Sent", Math.max(recorded("contacted") || 0, manualSent)], ["Replies", records.filter((record) => record.replied).length], ["Positive replies", records.filter((record) => record.replySentiment === "POSITIVE").length], ["Trial with client or award", records.filter((record) => record.trial).length], ["Paid customers influenced", records.filter((record) => record.customer).length]]).filter(([, value]) => value !== null && value !== undefined) as Array<[string, number]>; return <div className="panel"><p className="eyebrow">{title}</p><div className="gtm-automation-metrics mt-4" aria-label={title}>{stages.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div></div>; }
function CustomerSendReadyPanel({ opportunities, needsVerification, onReview }: { opportunities: GtmOpportunity[]; needsVerification: number; onReview(id: string): void }) {
  return <section className="mt-8" aria-labelledby="customer-send-ready-heading"><div className="gtm-section-heading"><div><p className="eyebrow">Direct customer outbound</p><h2 id="customer-send-ready-heading">Who can receive a first email now</h2><p>Only source-backed, core-fit opportunities with a verified or confirmed email and a passing organization-level dedupe check appear here. Sending remains manual.</p></div><span className="status-badge status-neutral">MANUAL ONLY</span></div><div className="gtm-automation-metrics"><article><strong>{opportunities.length}</strong><span>ready for human review</span></article><article><strong>{needsVerification}</strong><span>needs verification</span></article></div>{opportunities.length ? <div className="panel panel-flush mt-6"><div className="table-scroll"><table className="data-table gtm-pipeline-table"><thead><tr><th>Organization</th><th>Signal</th><th>Why now</th><th>Decision maker</th><th>Email</th><th>Subject</th><th>Source</th><th>Action</th></tr></thead><tbody>{opportunities.map((item) => <tr key={item.id}><th>{item.organization}</th><td>{labelForSignal(item.signalKind)} · {formatDate(item.observedAt)}</td><td>{item.whyNow}</td><td>{item.primaryContact ? `${item.primaryContact.name} · ${item.primaryContact.title}` : "Not verified"}</td><td>{item.primaryContact?.email || "Not verified"}</td><td>{item.emailSubject}</td><td>{item.evidence[0] ? <a href={item.evidence[0].url} target="_blank" rel="noreferrer">View source <ExternalLink aria-hidden="true" /></a> : "Not recorded"}</td><td><button type="button" className="button button-secondary button-small" onClick={() => onReview(item.id)}>Review draft</button></td></tr>)}</tbody></table></div></div> : <div className="workspace-empty mt-6"><MailCheck aria-hidden="true" /><h3>No direct record is ready for a first email</h3><p>Existing source records require contact verification or are already protected by the initial-outreach guard.</p></div>}</section>;
}

function SignalComplexityPanel({ opportunities }: { opportunities: GtmOpportunity[] }) {
  const items = opportunities.map((item) => ({ item, score: scoreGrantComplexity({ verifiedAwardAmount: item.amount, recentGrantActivity: item.signalKind === "grant_award" ? true : undefined, federalFunding: item.assistanceListing ? true : undefined, ...item.complexitySignals }) }));
  return <section className="mt-8" aria-labelledby="signal-complexity-heading"><div className="gtm-section-heading"><div><p className="eyebrow">Signal radar</p><h2 id="signal-complexity-heading">Transparent grant complexity and pain inputs</h2><p>Scores use only recorded signals. Missing inputs are not converted into negative evidence.</p></div></div><div className="panel panel-flush"><div className="table-scroll"><table className="data-table"><thead><tr><th>Organization</th><th>Decision</th><th>Known contributing signals</th><th>Unknown inputs</th></tr></thead><tbody>{items.map(({ item, score }) => <tr key={item.id}><th>{item.organization}</th><td>{score.decision.replaceAll("_", " ")}</td><td>{score.contributingSignals.length ? score.contributingSignals.join(" · ") : "No complexity input recorded"}</td><td>{score.unknownInputs.length ? score.unknownInputs.join(" · ") : "None"}</td></tr>)}</tbody></table></div></div></section>;
}

function SocialEngagementPanel({ actions, onAction }: { actions: SocialActionRecord[]; onAction(record: ReturnType<typeof socialActionUpdate>): void }) {
  const [filter, setFilter] = useState<"default" | SocialActionStatus>("default");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const reddit = (redditSignals as Array<{ id: string; title: string; url: string; community: string; evidenceSummary: string; productImplication: string; observedAt: string; }>).map((item) => ({ platform: "reddit" as const, title: item.title, url: item.url, summary: item.evidenceSummary, suggestedResponse: item.productImplication, observedAt: item.observedAt, initialStatus: "NEW" as const }));
  const linkedin = (linkedinItems as Array<{ title: string; url: string; observedPain: string; suggestedComment?: string; status: string; }>).map((item) => ({ platform: "linkedin" as const, title: item.title, url: item.url, summary: item.observedPain, suggestedResponse: item.suggestedComment || "Review the source before drafting a response.", observedAt: null, initialStatus: item.status === "review_before_posting" ? "REVIEW" as const : "REVIEW" as const }));
  const queue = reconcileSocialQueue([...reddit, ...linkedin], actions);
  const visible = queue.filter((item) => filter === "default" ? isDefaultSocialAction(item.status) : item.status === filter);
  const setStatus = (item: typeof queue[number], status: SocialActionStatus) => onAction(socialActionUpdate(item, status, new Date().toISOString()));
  const copy = async (item: typeof queue[number]) => { try { await navigator.clipboard.writeText(item.suggestedResponse); setCopiedId(item.id); window.setTimeout(() => setCopiedId(null), 1800); } catch { setCopiedId(null); } };
  return <section aria-labelledby="social-engagement-heading"><div className="gtm-section-heading"><div><p className="eyebrow">Manual engagement queue</p><h2 id="social-engagement-heading">Review public conversations before engaging</h2><p>No posting, voting, direct messages, or automatic engagement occurs here. State changes record only the operator action.</p></div><span className="status-badge status-neutral">MANUAL REVIEW</span></div><div className="gtm-filters" aria-label="Social action filter">{([ ["default", "New + review"], ["RESPONDED", "Responded"], ["SKIP", "Skip"], ["STALE", "Stale"] ] as Array<["default" | SocialActionStatus, string]>).map(([value, label]) => <button type="button" key={value} className={filter === value ? "is-active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><div className="gtm-feed-list mt-6">{visible.map((item) => <article key={item.id}><MessageSquareText aria-hidden="true" /><div><div className="flex flex-wrap items-center gap-2"><span className="status-badge status-neutral">{item.platform}</span><span className="status-badge status-review">{item.status}</span></div><a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink aria-hidden="true" /></a><p>{item.summary}</p><p><strong>Suggested helpful response:</strong> {item.suggestedResponse}</p><div className="gtm-actions"><a className="button button-secondary button-small" href={item.url} target="_blank" rel="noreferrer">Open post</a><button type="button" className="button button-secondary button-small" onClick={() => void copy(item)}><Copy aria-hidden="true" />{copiedId === item.id ? "Copied" : "Copy suggested response"}</button><button type="button" className="button button-secondary button-small" onClick={() => setStatus(item, "RESPONDED")}>Mark responded</button><button type="button" className="gtm-dismiss" onClick={() => setStatus(item, "SKIP")}>Skip</button></div></div></article>)}</div>{!visible.length && <div className="workspace-empty mt-6"><MessageSquareText aria-hidden="true" /><h3>No social records match this filter</h3><p>Completed or skipped items remain in their audit filters and do not return to the default queue.</p></div>}</section>;
}

function SeoOperationsPanel() {
  const queue = seoContentQueue as unknown as { opportunities: Array<{ id: string; lifecycle_status: string; action: string; canonical_url: string; search_intent: string; existing_page: boolean; }>; };
  const assets = seoAssetInventory as { public_sitemap_url_count: number; article_count: number; };
  const schedule = seoSchedule as unknown as { cadence?: string; next_run?: string; };
  return <section aria-labelledby="seo-operations-heading"><div className="gtm-section-heading"><div><p className="eyebrow">SEO operations</p><h2 id="seo-operations-heading">Indexing, content, and internal-link work</h2><p>Google Analytics traffic data is intentionally not duplicated here. Search performance remains unavailable until Search Console is connected.</p></div><span className="status-badge status-review">SEARCH CONSOLE: HUMAN ACTION REQUIRED</span></div><div className="gtm-automation-metrics"><article><strong>{assets.public_sitemap_url_count}</strong><span>sitemap URLs</span></article><article><strong>{assets.article_count}</strong><span>article routes</span></article><article><strong>{queue.opportunities.length}</strong><span>content queue items</span></article><article><strong>{schedule.cadence || "NOT RECORDED"}</strong><span>content cadence</span></article></div><div className="panel panel-flush mt-6"><div className="table-scroll"><table className="data-table"><thead><tr><th>Target query / intent</th><th>Action</th><th>Status</th><th>Target page</th><th>Next action</th></tr></thead><tbody>{queue.opportunities.map((item) => <tr key={item.id}><th>{item.search_intent}</th><td>{item.action.replaceAll("_", " ")}</td><td>{item.lifecycle_status.replaceAll("_", " ")}</td><td><a href={item.canonical_url}>{item.canonical_url}</a></td><td>{item.lifecycle_status.includes("REFRESH") ? "Review content and internal links" : "Research before drafting"}</td></tr>)}</tbody></table></div></div><div className="panel mt-6"><p className="eyebrow">Technical status</p><p>Sitemap and robots are maintained by the public-site build. Canonical/structured-data checks run in the SEO validation workflow. Indexing, impressions, clicks, and positions are <strong>not recorded</strong> until an authenticated Search Console connection exists.</p></div></section>;
}


function FeedbackPanel() { return <section aria-labelledby="feedback-heading"><div className="gtm-section-heading"><div><p className="eyebrow">Voice of customer</p><h2 id="feedback-heading">Feedback review</h2><p>Feedback is stored and reviewed in its dedicated, authenticated workflow. No notifications or downstream actions are inferred here.</p></div><Link className="button button-secondary" to="/gtm/feedback">Open feedback review</Link></div><div className="panel mt-6"><MessageSquareText aria-hidden="true" /><h3 className="mt-4">Use the existing feedback queue</h3><p className="mt-2 text-sm text-slate-600">Review submission status and notes in the existing route without duplicating or fabricating feedback records in the command center.</p></div></section>; }

function OverviewPanel({ overview, inMain = false }: { overview: GtmOverview | null; inMain?: boolean }) {
  if (!overview) return <section className={inMain ? "gtm-overview-panel" : "gtm-overview-panel mt-8"} aria-label="GTM overview"><div className="gtm-boundary-note"><AlertCircle aria-hidden="true" /><div><strong>Founder overview is waiting for protected GTM data.</strong><p>Counts are intentionally not estimated. The dashboard will show BLOCKED until the canonical reconciliation and enrichment usage can be read.</p></div></div></section>;
  const direct = [["Control Plane leads", overview.direct.metrics.controlPlaneLeads], ["Unique organizations", overview.direct.metrics.uniqueOrganizations], ["Source qualified", overview.direct.metrics.qualified], ["Contact identified", overview.direct.metrics.contactIdentified], ["Enrichment ready", overview.direct.metrics.enrichmentReady], ["Email verified", overview.direct.metrics.emailVerified], ["Suppression clear", overview.direct.metrics.suppressionClear], ["Draft ready", overview.direct.metrics.draftReady], ["Human review", overview.direct.metrics.humanReview], ["Approved", overview.direct.metrics.approved], ["Sent", overview.direct.metrics.sent], ["Replies", overview.direct.metrics.replies], ["Free first award", overview.direct.metrics.freeFirstAward], ["Activated", overview.direct.metrics.activated], ["Paid", overview.direct.metrics.paid]] as Array<[string, GtmMetric]>;
  const partner = [["Researched", overview.partner.metrics.researched], ["High fit", overview.partner.metrics.highFit], ["Contact identified", overview.partner.metrics.contactIdentified], ["Enrichment ready", overview.partner.metrics.enrichmentReady], ["Email verified", overview.partner.metrics.emailVerified], ["Draft ready", overview.partner.metrics.draftReady], ["Human review", overview.partner.metrics.humanReview], ["Approved", overview.partner.metrics.approved], ["Contacted", overview.partner.metrics.contacted], ["Replies", overview.partner.metrics.replies], ["Active conversations", overview.partner.metrics.activeConversations], ["Partners activated", overview.partner.metrics.activatedPartners], ["Customers influenced", overview.partner.metrics.customersInfluenced], ["Paid customers influenced", overview.partner.metrics.paidCustomersInfluenced], ["ARR influenced", overview.partner.metrics.arrInfluenced]] as Array<[string, GtmMetric]>;
  return <section className={inMain ? "gtm-overview-panel" : "gtm-overview-panel mt-8"} aria-labelledby="gtm-overview-heading">
    <div className="gtm-section-heading"><div><p className="eyebrow">System health</p><h2 id="gtm-overview-heading">Pipeline health from canonical records</h2><p>Actual counts come from protected source records. Targets are operating goals, not achieved results. Website traffic remains in Google Analytics.</p></div><span className="status-badge status-neutral">MANUAL ACTIVE · INSTANTLY WARMING</span></div>
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
  const partnerRecords = records.filter((record) => record.type === "PARTNER");
  return <section aria-labelledby="partners-heading"><div className="gtm-section-heading"><div><p className="eyebrow">Partner pipeline</p><h2 id="partners-heading">Partner organizations requiring action</h2><p>Existing contacts stay out of new-initial-outreach inventory. No partner reply, trial, or influenced-customer result is inferred.</p></div><span className="status-badge status-neutral">MANUAL OUTREACH ACTIVE</span></div><FunnelCard title="Partner funnel" metrics={overview?.partner.metrics} records={partnerRecords} /><div className="panel panel-flush mt-6"><div className="table-scroll"><table className="data-table gtm-pipeline-table"><thead><tr><th>Priority</th><th>Organization</th><th>Contact</th><th>Email</th><th>Partner type</th><th>Status</th><th>Last contact</th><th>Follow-up due</th><th>Reply</th><th>Next action</th></tr></thead><tbody>{partnerRecords.map((record) => <tr key={record.id}><td>Human-confirmed</td><th>{record.organization}</th><td>{record.contact}</td><td>{record.email || "Not recorded"}</td><td>{record.persona}</td><td>{outreachStatus(record)}</td><td>{formatHistoryDate(record.lastContactAt)}</td><td>{record.followUpDueAt ? formatHistoryDate(record.followUpDueAt) : "Not configured"}</td><td>{record.replied ? record.replySentiment : "No reply recorded"}</td><td>{outreachNextAction(record)}</td></tr>)}</tbody></table></div></div><section className="mt-8"><div className="panel-heading"><div><p className="eyebrow">Uncontacted partner inventory</p><h3>Research requiring verification before any first send</h3><p className="mt-1 text-sm text-slate-600">Every record below lacks a verified contact and remains outside the send queue.</p></div></div><div className="panel panel-flush mt-4"><div className="table-scroll"><table className="data-table gtm-pipeline-table"><thead><tr><th>Organization</th><th>Fit</th><th>Evidence</th><th>Current state</th><th>Next action</th></tr></thead><tbody>{canonicalPartnerResearch.map((partner) => <tr key={partner.id}><th><a href={partner.officialSourceUrl} target="_blank" rel="noreferrer">{partner.organization}<ExternalLink aria-hidden="true" /></a></th><td>{partner.relationshipClass} · {partner.classRationale}</td><td>{partner.evidenceSummary}</td><td>{partner.stage === "COMMERCIAL_REVIEW_REQUIRED" ? "COMMERCIAL REVIEW REQUIRED" : "NEEDS CONTACT VERIFICATION"}</td><td>{partner.stage === "COMMERCIAL_REVIEW_REQUIRED" ? "Review service overlap" : "Identify and verify a business contact"}</td></tr>)}</tbody></table></div></div></section><section className="mt-8"><div className="panel-heading"><div><p className="eyebrow">Channel experiments</p><h3>No active channel experiment recorded</h3></div></div><p className="mt-3 text-sm text-slate-600">Grant consultants, professional communities, and referral channels remain research areas until an owner records a concrete, approved experiment.</p></section></section>;
}

function GtmExpansionPanel() {
  const partnerTypes = PARTNER_ICP_TYPES.filter((type) => type !== "FRACTIONAL_CFO_ACCOUNTING");
  return <section className="mt-8" aria-labelledby="gtm-expansion-heading"><div className="gtm-section-heading"><div><p className="eyebrow">Channel extensions and conversion model</p><h2 id="gtm-expansion-heading">New ICPs stay uncontacted until real records exist</h2><p>These channels are typed for qualification, campaign routing, attribution, and safe future measurement. No prospect, contact, email, campaign, or partner economics has been invented.</p></div><span className="status-badge status-neutral">PLANNING SUPPORT ONLY</span></div><div className="panel panel-flush"><div className="table-scroll"><table className="data-table"><thead><tr><th>Channel / ICP</th><th>Motion</th><th>Current state</th><th>Required before outreach</th></tr></thead><tbody>{partnerTypes.map((type) => <tr key={type}><th>{type.replaceAll("_", " ")}</th><td>{type === "FISCAL_SPONSOR" ? "Distribution through sponsored projects" : type === "COMMUNITY_FOUNDATION_FUNDER_INTERMEDIARY" ? "Grantee reporting standardization" : type === "NONPROFIT_ASSOCIATION" ? "Education, member resource, or partner relationship" : type === "AUDIT_CPA_REMEDIATION" ? "Educational/remediation relationship only; no attest-client referral commission" : "Complementary post-award workflow partnership"}</td><td>NO VALIDATED RECORD</td><td>Verified organization, rationale, contact, email, dedupe, suppression, and human review</td></tr>)}</tbody></table></div></div><div className="panel mt-6"><p className="eyebrow">Full-funnel architecture</p><p>{FULL_FUNNEL_STAGES.map((stage) => stage.replaceAll("_", " ")).join(" → ")}</p><p className="mt-3 text-sm text-slate-600">Cold prospects route only through Instantly when its status is ready; transactional customer lifecycle communication remains a separate lane. No customer event is currently inferred from this architecture.</p></div><div className="panel mt-6"><p className="eyebrow">Product-led conversion actions</p><ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">{Object.entries(PRODUCT_LED_ABANDONMENT_ACTIONS).map(([stage, action]) => <li key={stage}><strong>{stage.replaceAll("_", " ")}:</strong> {action}</li>)}</ul><p className="mt-3 text-sm text-slate-600">No abandoned high-intent user is shown until a corresponding authenticated product event is recorded.</p></div></section>;
}

// Kept as a non-rendered legacy helper while canonical records replace browser-local stages.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PipelinePanel({ opportunities, stages, stagesOrder, onStageChange }: { opportunities: GtmOpportunity[]; stages: StageState; stagesOrder: OpportunityStage[]; onStageChange(id: string, stage: OpportunityStage): void }) {
  return <section><div className="gtm-section-heading"><div><p className="eyebrow">Progress monitor</p><h2>Track every opportunity without pretending there is a CRM</h2><p>Progress is saved in this private browser workspace. No external CRM, email inbox, or campaign analytics are connected yet.</p></div></div><div className="gtm-pipeline-summary">{stagesOrder.map((stage) => <article key={stage}><strong>{opportunities.filter((item) => (stages[item.id] || "new") === stage).length}</strong><span>{stage.replaceAll("_", " ")}</span></article>)}</div><div className="panel panel-flush mt-6"><div className="table-scroll"><table className="data-table gtm-pipeline-table"><thead><tr><th>Organization</th><th>Signal</th><th>Score</th><th>Evidence</th><th>Progress</th></tr></thead><tbody>{opportunities.map((opportunity) => { const accuracy = assessOpportunityAccuracy(opportunity); return <tr key={opportunity.id}><th>{opportunity.organization}</th><td>{labelForSignal(opportunity.signalKind)}</td><td>{accuracy.score} · {formatOpportunityScore(accuracy.label)}</td><td>{opportunity.evidence.length} source{opportunity.evidence.length === 1 ? "" : "s"} · {accuracy.confidence}</td><td><label className="sr-only" htmlFor={`stage-${opportunity.id}`}>Progress for {opportunity.organization}</label><select id={`stage-${opportunity.id}`} className="table-select" value={stages[opportunity.id] || "new"} onChange={(event) => onStageChange(opportunity.id, event.target.value as OpportunityStage)}>{stagesOrder.map((stage) => <option value={stage} key={stage}>{stage.replaceAll("_", " ")}</option>)}</select></td></tr>; })}</tbody></table></div></div></section>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const matchesFilter = (record: OutreachRecord) => filter === "all" || filter === "awaiting" && outreachStatus(record) === "AWAITING_REPLY" || filter === "follow_up_due" && Boolean(record.followUpDueAt) || filter === "replied" && record.replied || filter === "positive" && record.replySentiment === "POSITIVE" || filter === "negative" && record.replySentiment === "NEGATIVE" || filter === "trial" && record.trial || filter === "paid" && record.customer || filter === "direct" && record.type === "DIRECT_NONPROFIT" || filter === "partner" && record.type === "PARTNER" || filter === "ready_to_send" && false || filter === "needs_verification" && false || filter === "suppressed" && false || filter === "already_contacted" && record.initialOutreachGuard === "DO_NOT_SEND_NEW_INITIAL_OUTREACH";
  const filteredRecords = records.filter((record) => matchesFilter(record) && [record.contact, record.organization, record.persona, record.email || "", record.whyNowSignal || ""].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const links = new Map(reconcileOutreachControlPlane(records, canonicalOpportunityIds).map((link) => [link.recordId, link]));
  const filterLabels: Array<[OutreachFilter, string]> = [["all", "All"], ["awaiting", "Awaiting Reply"], ["follow_up_due", "Follow-up Due"], ["replied", "Replied"], ["positive", "Positive"], ["negative", "Negative"], ["trial", "Trial / Free First Award"], ["paid", "Paid"], ["direct", "Direct"], ["partner", "Partner"], ["ready_to_send", "Ready to Send"], ["needs_verification", "Needs Verification"], ["suppressed", "Suppressed"], ["already_contacted", "Already Contacted"]];
  const copyEmail = async (record: OutreachRecord) => { if (!record.email) return; try { await navigator.clipboard.writeText(record.email); setCopiedEmail(record.id); window.setTimeout(() => setCopiedEmail(null), 1800); } catch { setCopiedEmail(null); } };
  return <section aria-labelledby="outreach-history-heading"><div className="gtm-section-heading"><div><p className="eyebrow">Canonical outreach work queue</p><h2 id="outreach-history-heading">Who has been contacted—and what happens next</h2><p>Manual sends are first-class records. Delivery, replies, follow-up dates, trials, and payments are never inferred.</p></div><span className="status-badge status-neutral">MANUAL OUTREACH ACTIVE</span></div><div className="gtm-automation-metrics" aria-label="Outreach ledger summary"><article><strong>{metrics.totalSent}</strong><span>email events sent</span></article><article><strong>{metrics.uniqueOrganizationsContacted}</strong><span>unique organizations contacted</span></article><article><strong>{metrics.directUniqueOrganizationsContacted}</strong><span>direct unique</span></article><article><strong>{metrics.partnerUniqueOrganizationsContacted}</strong><span>partner unique</span></article></div><div className="gtm-toolbar"><label className="gtm-search"><Search aria-hidden="true" /><span className="sr-only">Search outreach history</span><input aria-label="Search outreach history" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search organization, contact, or why now" /></label><div className="gtm-filters"><select className="form-control" aria-label="Filter outreach type" value={filter} onChange={(event) => onFilter(event.target.value as OutreachFilter)}>{filterLabels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div><div className="panel panel-flush mt-6"><div className="table-scroll"><table className="data-table gtm-pipeline-table"><thead><tr><th>Organization</th><th>Contact</th><th>Type</th><th>Email</th><th>Why now</th><th>Source</th><th>Sent date</th><th>Status</th><th>Last contact</th><th>Follow-up due</th><th>Replied</th><th>Reply sentiment</th><th>Trial</th><th>Paid</th><th>Next action</th></tr></thead><tbody>{filteredRecords.map((record) => { const link = links.get(record.id)!; return <tr key={record.id}><th>{record.organization}</th><td>{record.contact}<small className="block font-normal text-slate-500">{record.persona}</small></td><td>{record.type === "DIRECT_NONPROFIT" ? "Direct" : "Partner"}</td><td>{record.email || "Not recorded"}{record.email && <button type="button" className="button-link block text-xs" onClick={() => void copyEmail(record)}>{copiedEmail === record.id ? "Copied" : "Copy email"}</button>}</td><td>{record.whyNowSignal || "Human-confirmed outreach"}</td><td>{record.signalSource ? <a href={record.signalSource} target="_blank" rel="noreferrer">View source</a> : "Human-confirmed outreach"}</td><td>{formatHistoryDate(record.sentAt)}</td><td><span className="status-badge status-neutral">{outreachStatus(record)}</span><small className="block font-normal text-slate-500">{link.status === "LINKED" ? "Control Plane linked" : "Human-confirmed canonical record"}</small></td><td>{formatHistoryDate(record.lastContactAt)}</td><td>{record.followUpDueAt ? formatHistoryDate(record.followUpDueAt) : "Not configured"}</td><td>{record.replied ? "Yes" : "No"}</td><td>{record.replySentiment.replaceAll("_", " ")}</td><td>{record.trial ? "Yes" : "No"}</td><td>{record.customer ? "Yes" : "No"}</td><td>{outreachNextAction(record)}</td></tr>; })}</tbody></table></div></div>{!filteredRecords.length && <div className="workspace-empty mt-6"><MailCheck aria-hidden="true" /><h3>No records match this filter</h3><p>{filter === "ready_to_send" ? "No uncontacted record is ready for an initial send." : "No canonical outreach record currently has that state. No activity has been invented."}</p></div>}</section>;
}

function outreachStatus(record: OutreachRecord) {
  if (record.customer) return "PAID";
  if (record.trial) return "TRIAL";
  if (record.replySentiment === "POSITIVE") return "POSITIVE";
  if (record.replySentiment === "NEGATIVE") return "NEGATIVE";
  if (record.replied) return "REPLIED";
  if (record.followUpDueAt) return "FOLLOW_UP_DUE";
  return "AWAITING_REPLY";
}

function outreachNextAction(record: OutreachRecord) {
  if (record.customer) return "MONITOR CUSTOMER";
  if (record.trial) return "TRIAL FOLLOW-UP";
  if (record.replySentiment === "POSITIVE") return "RESPOND TO POSITIVE REPLY";
  if (record.replied) return "RESPOND TO REPLY";
  if (record.followUpDueAt) return "FOLLOW-UP DUE";
  return "AWAIT RESPONSE · FOLLOW-UP NOT CONFIGURED";
}

function operatorActions(records: OutreachRecord[]) {
  return records.flatMap((record) => {
    if (record.replySentiment === "POSITIVE") return [{ priority: "P0", record, action: "Respond to positive reply", reason: "Positive response recorded", dueState: "Due now" }];
    if (record.replied) return [{ priority: "P1", record, action: "Respond to reply", reason: "Reply recorded", dueState: "Due now" }];
    if (record.trial) return [{ priority: "P1", record, action: "Follow up on trial", reason: "Free First Award or trial is in progress", dueState: record.followUpDueAt ? formatHistoryDate(record.followUpDueAt) : "Not configured" }];
    if (record.followUpDueAt) return [{ priority: "P1", record, action: "Follow up", reason: "Configured follow-up is due", dueState: formatHistoryDate(record.followUpDueAt) }];
    return [];
  });
}

function formatHistoryDate(value: string | null) {
  if (!value) return "Date not recorded";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function readSocialActions(): SocialActionRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SOCIAL_STATE_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.map(validateSocialActionRecord).filter((item): item is SocialActionRecord => Boolean(item)) : [];
  } catch {
    return [];
  }
}
