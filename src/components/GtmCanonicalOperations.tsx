import { useMemo, useState } from "react";
import type { CanonicalGtmModel, CanonicalGtmRecord, CanonicalSegment } from "../lib/gtmCanonical";
import { buildGtmScaleModel, GTM_LIFECYCLE_STAGES, lifecycleStageFor, type GtmLifecycleStage } from "../lib/gtmScale";

export interface GtmProviderHealth {
  status: string;
  outboundEnabled: boolean;
  autoHandoffEnabled: boolean;
  directEnabled: boolean;
  partnerEnabled: boolean;
  eventSyncMode: "POLLING" | "WEBHOOKS";
}

type ProviderSnapshot = { campaigns?: Array<Record<string, unknown>>; accounts?: Array<Record<string, unknown>>; lastSuccessfulSync?: string; reconciliation?: string; pollingCadence?: string; errors?: string[] } | null;

function capacityFor(persisted: ProviderSnapshot, segment: CanonicalSegment) {
  const needle = segment === "DIRECT" ? /direct|nonprofit/i : /partner|cfo|accounting/i;
  const campaign = persisted?.campaigns?.find((item) => needle.test(String(item.name || "")));
  const raw = campaign?.daily_limit ?? campaign?.daily_max_leads;
  const number = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatCapacity(value: number | null) { return value === null ? "Not confirmed" : `${value}/business day`; }
function stageLabel(stage: GtmLifecycleStage) { return stage.replaceAll("_", " "); }

export function GtmExecutiveOverview({ model, health, persisted, seo }: { model: CanonicalGtmModel | null; health: GtmProviderHealth | null; persisted: ProviderSnapshot; seo: { published: number; indexed: number | null; impressions: number | null; clicks: number | null; nextPublication: string | null; error: string | null } }) {
  if (!model) return <section className="workspace-empty"><h2>Canonical GTM data is unavailable</h2><p>No funnel or send count is estimated until the server canonical model is available.</p></section>;
  const scale = buildGtmScaleModel(model, { directSafeDailyCapacity: capacityFor(persisted, "DIRECT"), partnerSafeDailyCapacity: capacityFor(persisted, "PARTNER") });
  const blockerRows = model.records.filter((record) => record.blockers.length).slice(0, 5);
  return <section aria-labelledby="gtm-executive-heading">
    <div className="gtm-section-heading"><div><p className="eyebrow">Executive operating view</p><h2 id="gtm-executive-heading">Demand, delivery, and blockers</h2><p>Organizations, verified contacts, provider enrollment, scheduled email, and actual sends are separate canonical stages.</p></div></div>
    <div className="grid gap-6 lg:grid-cols-2"><Funnel segment={scale.direct} /><Funnel segment={scale.partner} /></div>
    <div className="grid gap-6 lg:grid-cols-3 mt-6">
      <article className="panel"><p className="eyebrow">Provider and mailbox health</p><h3>{health?.status || "Not confirmed"}</h3><p>Instantly reconciliation: {persisted?.reconciliation || "not recorded"} · {health?.eventSyncMode || "unknown"}.</p><p>Direct handoff: {health?.directEnabled && health?.outboundEnabled && health?.autoHandoffEnabled ? "eligible after final guardrails" : "not enabled"}. Partner handoff: {health?.partnerEnabled && health?.outboundEnabled && health?.autoHandoffEnabled ? "eligible after final guardrails" : "not enabled"}.</p></article>
      <article className="panel"><p className="eyebrow">Discovery and enrichment freshness</p><h3>{model.generatedAt ? new Date(model.generatedAt).toLocaleString() : "Not recorded"}</h3><p>Direct evidence-qualified: {scale.direct.evidenceQualified}/{scale.direct.target.evidenceQualified.target}. Partner evidence-qualified: {scale.partner.evidenceQualified}/{scale.partner.target.evidenceQualified.target}.</p><p>Ready inventory is replenished independently of canary delivery state.</p></article>
      <article className="panel"><p className="eyebrow">SEO acquisition</p><h3>{seo.published} published pages</h3><p>{seo.indexed === null ? "Indexed pages not confirmed" : `${seo.indexed} indexed`} · {seo.impressions === null ? "impressions not confirmed" : `${seo.impressions} impressions`} · {seo.clicks === null ? "clicks not confirmed" : `${seo.clicks} clicks`}.</p><p>{seo.nextPublication ? `Next scheduled publication: ${seo.nextPublication}` : seo.error || "Publication schedule has not been recorded."}</p></article>
    </div>
    <div className="panel mt-6"><p className="eyebrow">Exact blockers</p>{blockerRows.length ? <ul className="space-y-2">{blockerRows.map((record) => <li key={record.id}><strong>{record.organization}</strong> — {record.blockers[0]}</li>)}</ul> : <p>No canonical record currently reports a blocker.</p>}</div>
    <div className="panel mt-6"><p className="eyebrow">Actions required from Eli</p><p>{seo.error ? seo.error : "None. Routine discovery, verification, provider reconciliation, sitemap maintenance, and content operations are system-owned."}</p></div>
  </section>;
}

function Funnel({ segment }: { segment: ReturnType<typeof buildGtmScaleModel>["direct"] }) {
  return <article className="panel"><div className="panel-heading"><div><p className="eyebrow">{segment.segment === "DIRECT" ? "Direct nonprofits" : "Partners"}</p><h3>{segment.evidenceQualified} evidence-qualified accounts</h3></div><span className="status-badge status-neutral">target {segment.target.evidenceQualified.target}</span></div><div className="gtm-automation-metrics mt-4"><article><strong>{segment.verifiedContacts}</strong><span>verified contacts</span></article><article><strong>{segment.ready}</strong><span>READY / {segment.target.ready.target}</span></article><article><strong>{segment.stages.STAGED}</strong><span>staged</span></article><article><strong>{segment.stages.SCHEDULED}</strong><span>scheduled</span></article><article><strong>{segment.stages.SENT}</strong><span>actually sent</span></article><article><strong>{segment.stages.REPLIED}</strong><span>replied</span></article></div><p className="mt-4 text-sm text-slate-600">Safe capacity: {formatCapacity(segment.safeDailyCapacity)} · READY coverage: {segment.readyCoverageBusinessDays === null ? "not confirmed" : `${segment.readyCoverageBusinessDays} business days`} · operational READY floor: {segment.readinessFloor ?? segment.target.ready.floor}.</p></article>;
}

export function GtmOpportunityQueue({ model }: { model: CanonicalGtmModel | null }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<"ALL" | CanonicalSegment>("ALL");
  const [stage, setStage] = useState<"ALL" | GtmLifecycleStage>("ALL");
  const [blocker, setBlocker] = useState<"ALL" | "BLOCKED">("ALL");
  const rows = useMemo(() => (model?.records || []).filter((record) => {
    const matchesQuery = `${record.organization} ${record.contact || ""} ${record.whyNow} ${record.sourceUrl}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (segment === "ALL" || record.segment === segment) && (stage === "ALL" || lifecycleStageFor(record) === stage) && (blocker === "ALL" || Boolean(record.blockers.length));
  }), [model, query, segment, stage, blocker]);
  return <section aria-labelledby="gtm-opportunities-heading"><div className="gtm-section-heading"><div><p className="eyebrow">Working queue</p><h2 id="gtm-opportunities-heading">Opportunities</h2><p>Raw signal → high-intent organization → verified contact → READY → Instantly-enrolled → scheduled → provider-confirmed sent.</p></div></div>
    <div className="gtm-toolbar"><label className="gtm-search"><span className="sr-only">Search opportunities</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search organization, contact, signal, or source" /></label><select className="form-control" aria-label="Filter segment" value={segment} onChange={(event) => setSegment(event.target.value as "ALL" | CanonicalSegment)}><option value="ALL">All segments</option><option value="DIRECT">Direct</option><option value="PARTNER">Partner</option></select><select className="form-control" aria-label="Filter lifecycle stage" value={stage} onChange={(event) => setStage(event.target.value as "ALL" | GtmLifecycleStage)}><option value="ALL">All lifecycle stages</option>{GTM_LIFECYCLE_STAGES.map((item) => <option key={item} value={item}>{stageLabel(item)}</option>)}</select><select className="form-control" aria-label="Filter blocker" value={blocker} onChange={(event) => setBlocker(event.target.value as "ALL" | "BLOCKED")}><option value="ALL">All records</option><option value="BLOCKED">Blocked only</option></select></div>
    <div className="panel panel-flush mt-6"><div className="table-scroll"><table className="data-table gtm-pipeline-table"><thead><tr><th>Organization / contact</th><th>Segment</th><th>Signal / evidence</th><th>Lifecycle</th><th>Verification</th><th>Instantly</th><th>Score / qualification</th><th>Prior contact / suppression</th><th>Blocking reason</th><th>Next automated action</th><th>Last updated</th></tr></thead><tbody>{rows.map((record) => <OpportunityRow key={record.id} record={record} />)}{!rows.length && <tr><td colSpan={11}>No canonical records match the selected filters.</td></tr>}</tbody></table></div></div></section>;
}

function OpportunityRow({ record }: { record: CanonicalGtmRecord }) { const stage = lifecycleStageFor(record); return <tr><th>{record.organization}<small className="block font-normal text-slate-500">{record.contact || "Contact not found"}{record.title ? ` · ${record.title}` : ""}</small></th><td>{record.segment === "DIRECT" ? "Direct" : "Partner"}</td><td><a href={record.sourceUrl} target="_blank" rel="noreferrer">Evidence</a><small className="block font-normal text-slate-500">{record.whyNow}</small></td><td><span className="status-badge status-neutral">{stageLabel(stage)}</span></td><td>{record.verificationStatus || "Not verified"}</td><td>{record.instantlyStatus || "Not enrolled"}</td><td>{record.qualified ? "Evidence-qualified" : "Raw signal"}</td><td>{record.priorContact ? "Prior contact" : record.suppressionStatus || "Not checked"}</td><td>{record.blockers[0] || "—"}</td><td>{record.nextAction}</td><td>{record.lastUpdated ? new Date(record.lastUpdated).toLocaleString() : "Not recorded"}</td></tr>; }
