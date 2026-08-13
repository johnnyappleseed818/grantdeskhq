import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, LoaderCircle, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { ReliabilityDashboardSnapshot, ReliabilityHealth } from "../types/reliability";

export function ReliabilityDashboardPage() {
  const { user, loading, token } = useAuth();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [snapshot, setSnapshot] = useState<ReliabilityDashboardSnapshot | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    const idToken = await token();
    const body = await apiRequest<{ reliability: ReliabilityDashboardSnapshot }>("/api/internal/reliability/summary", idToken);
    setSnapshot(body.reliability);
  };

  useEffect(() => {
    if (!user) return;
    token()
      .then((idToken) => apiRequest<{ allowed: boolean }>("/api/internal/reliability/access", idToken))
      .then(() => { setAccess("allowed"); return load(); })
      .catch((requestError) => {
        setAccess("denied");
        setError(requestError instanceof Error ? requestError.message : "Reliability status could not be loaded.");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token]);

  if (loading) return <Loading label="Loading reliability controls…" />;
  if (!user) return <Navigate replace to="/login?next=/internal/reliability" />;
  if (access === "checking") return <Loading label="Verifying internal reliability access…" />;
  if (access === "denied") return <section className="workspace-page"><div className="site-shell py-16"><div className="workspace-empty"><ShieldCheck aria-hidden="true" /><h1>Internal reliability workspace</h1><p>{error || "This page is restricted to the GrantDeskHQ administrator."}</p><Link className="button button-primary" to="/workspace">Return to reports</Link></div></div></section>;
  if (!snapshot) return <Loading label="Loading the latest canary and incident history…" />;

  const latest = snapshot.latestCanary;
  const score = latest?.scorecard;
  return <div className="reliability-page">
    <div className="site-shell py-10 lg:py-14">
      <header className="reliability-header">
        <div><p className="eyebrow">Internal reliability</p><h1>GrantDeskHQ self-health</h1><p>Production-like canaries, deterministic integrity gates, drift diagnostics, and bounded recovery history.</p></div>
        <button className="button button-secondary" type="button" onClick={() => load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Refresh failed."))}><RefreshCw aria-hidden="true" />Refresh</button>
      </header>
      {error && <div className="compiler-error" role="alert"><AlertTriangle aria-hidden="true" />{error}</div>}

      <section className="reliability-summary" aria-label="Current reliability status">
        <HealthCard status={snapshot.overallHealth} />
        <Metric label="Environment" value={snapshot.environment} detail={snapshot.deploymentRevision} icon={Database} />
        <Metric label="Last canary" value={latest ? formatTime(latest.completedAt) : "Never"} detail={latest ? `${Math.round(latest.durationMs / 1000)} seconds` : "No result recorded"} icon={Clock3} />
        <Metric label="Last successful" value={snapshot.lastSuccessfulCanary ? formatTime(snapshot.lastSuccessfulCanary) : "None"} detail={snapshot.applicationRevision.slice(0, 12)} icon={Activity} />
      </section>

      <section className="reliability-panel">
        <h2>Release gates</h2>
        <div className="reliability-score-grid">
          <Score label="Financial deterministic accuracy" value={score ? `${score.financialDeterministicAccuracy}%` : "—"} critical />
          <Score label="KPI factual accuracy" value={score ? `${score.kpiFactualAccuracy}%` : "—"} critical />
          <Score label="Obligation coverage" value={score ? `${score.obligationCoverage}%` : "—"} />
          <Score label="Evidence classification" value={score ? `${score.evidenceClassificationAccuracy}%` : "—"} />
          <Score label="Evidence attribution" value={score ? `${score.evidenceAttributionAccuracy}%` : "—"} />
          <Score label="Approval-state accuracy" value={score ? `${score.approvalStateAccuracy}%` : "—"} critical />
          <Score label="Unsupported critical claims" value={score ? String(score.unsupportedCriticalClaims) : "—"} critical />
          <Score label="Same-report determinism" value={score?.sameReportDeterminism || "—"} critical />
          <Score label="Cross-report determinism" value={score?.crossReportDeterminism || "—"} critical />
          <Score label="Browser/API consistency" value={score?.browserApiConsistency || "—"} critical />
        </div>
      </section>

      <section className="reliability-panel">
        <h2>Analysis performance and cost signals</h2>
        <div className="reliability-score-grid">
          <Score label="Total analysis" value={duration(latest?.analysisPerformance?.analysisDurationMs)} />
          <Score label="Parser" value={duration(latest?.analysisPerformance?.parserDurationMs)} />
          <Score label="LLM" value={duration(latest?.analysisPerformance?.llmDurationMs)} />
          <Score label="Evidence reconciliation" value={duration(latest?.analysisPerformance?.evidenceReconciliationDurationMs)} />
        </div>
      </section>

      <section className="reliability-panel">
        <h2>Failing assertions</h2>
        {latest?.failingAssertionIds.length ? <ul className="reliability-list">{latest.assertions.filter((item) => item.status === "failed").map((item) => <li key={item.id}><ShieldAlert aria-hidden="true" /><div><strong>{item.id}</strong><p>{item.detail}</p></div></li>)}</ul> : <p className="reliability-empty"><CheckCircle2 aria-hidden="true" />No failing assertions in the latest canary.</p>}
      </section>

      <section className="reliability-panel">
        <h2>Active incidents and recovery</h2>
        {snapshot.activeIncidents.length || snapshot.escalatedIncidents.length ? <div className="reliability-incidents">{[...snapshot.activeIncidents, ...snapshot.escalatedIncidents].map((incident) => <article key={incident.incidentId}>
          <div><span className={`status-badge ${incident.finalStatus === "escalated" ? "status-review" : "status-warning"}`}>{incident.lifecycle}</span><strong>{incident.diagnosis.probableComponent}</strong></div>
          <p>{incident.diagnosis.candidateRootCauses.join(" ")}</p>
          <dl><div><dt>Attempts</dt><dd>{incident.recoveryAttempts.length} / {incident.maxAutomaticAttempts}</dd></div><div><dt>Last action</dt><dd>{incident.lastRecoveryAction || "None"}</dd></div><div><dt>Verification</dt><dd>{incident.recoveryAttempts.at(-1)?.verificationResult || "Pending"}</dd></div></dl>
        </article>)}</div> : <p className="reliability-empty"><ShieldCheck aria-hidden="true" />No active or escalated incidents.</p>}
      </section>

      <section className="reliability-panel reliability-two-column">
        <div><h2>Last-known-good release</h2>{snapshot.lastKnownGood ? <dl className="reliability-details"><div><dt>Deployment</dt><dd>{snapshot.lastKnownGood.deploymentRevision}</dd></div><div><dt>Application</dt><dd>{snapshot.lastKnownGood.applicationRevision}</dd></div><div><dt>Models</dt><dd>{snapshot.lastKnownGood.primaryModel} / {snapshot.lastKnownGood.verifierModel}</dd></div><div><dt>Prompt</dt><dd>{snapshot.lastKnownGood.promptVersion}</dd></div><div><dt>Validated</dt><dd>{formatTime(snapshot.lastKnownGood.recordedAt)}</dd></div></dl> : <p>No release has passed every required gate yet.</p>}</div>
        <div><h2>Recent drift</h2>{snapshot.recentDriftEvents.length ? <ul className="reliability-drift">{snapshot.recentDriftEvents.slice(0, 8).map((event) => <li key={event.id}><span>{event.level}</span><div><strong>{event.field}</strong><p>{event.detail}</p></div></li>)}</ul> : <p>No drift events recorded.</p>}</div>
      </section>
    </div>
  </div>;
}

function Loading({ label }: { label: string }) { return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />{label}</div>; }
function HealthCard({ status }: { status: ReliabilityHealth }) {
  const Icon = status === "healthy" ? ShieldCheck : ShieldAlert;
  return <article className={`reliability-health reliability-health-${status}`}><Icon aria-hidden="true" /><span>Overall health</span><strong>{status.toUpperCase()}</strong></article>;
}
function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Activity }) { return <article><Icon aria-hidden="true" /><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function Score({ label, value, critical = false }: { label: string; value: string; critical?: boolean }) { return <div><span>{label}{critical ? " · release gate" : ""}</span><strong>{value}</strong></div>; }
function formatTime(value: string) { return new Date(value).toLocaleString(); }
function duration(value: number | undefined) { return typeof value === "number" ? `${(value / 1000).toFixed(1)}s` : "—"; }
