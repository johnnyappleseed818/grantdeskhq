import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, FilePlus2, FolderCheck, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { SavedReportSummary } from "../types/prototype";

export function WorkspacePage() {
  const { user, loading, token, signOut } = useAuth();
  const [reports, setReports] = useState<SavedReportSummary[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    token().then((idToken) => apiRequest<{ reports: SavedReportSummary[] }>("/api/reports", idToken))
      .then((body) => setReports(body.reports))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Reports could not be loaded."))
      .finally(() => setFetching(false));
  }, [user, token]);

  if (loading) return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading workspace…</div>;
  if (!user) return <Navigate replace to="/login?next=/workspace" />;

  return <section className="workspace-page">
    <div className="site-shell py-10 lg:py-14">
      <header className="workspace-header">
        <div><p className="eyebrow">Private beta workspace</p><h1>{user.displayName ? `${user.displayName}’s reports` : "Your reports"}</h1><p>Resume evidence review or start a new source-backed funder report.</p></div>
        <div className="workspace-actions"><button type="button" className="button button-secondary" onClick={() => signOut()}><LogOut aria-hidden="true" />Sign out</button><Link className="button button-primary" to="/compile"><FilePlus2 aria-hidden="true" />New report</Link></div>
      </header>
      <div className="workspace-trust"><ShieldCheck aria-hidden="true" /><div><strong>AI output stays connected to its evidence.</strong><p>Reports, source inventory, validation findings and reviewer decisions are saved to your account-isolated workspace.</p></div></div>
      {error && <div className="compiler-error" role="alert"><AlertTriangle aria-hidden="true" />{error}</div>}
      {fetching ? <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading saved reports…</div> : reports.length === 0 ?
        <div className="workspace-empty"><FolderCheck aria-hidden="true" /><h2>No saved reports yet</h2><p>Start with the synthetic package or upload a redacted historical source package.</p><Link className="button button-primary" to="/compile">Create your first report <ArrowRight aria-hidden="true" /></Link></div> :
        <div className="report-list">{reports.map((report) => <article key={report.id} className="report-row">
          <div><span className={`status-badge ${report.status === "ready" ? "status-success" : "status-review"}`}>{report.status === "ready" ? "Review complete" : "Review required"}</span><h2>{report.grantName}</h2><p>{report.organizationName} · {report.reportingPeriod}</p></div>
          <dl><div><dt>Evidence coverage</dt><dd>{report.evidenceCoveragePercent}%</dd></div><div><dt>Open items</dt><dd>{report.unresolvedItems}</dd></div><div><dt>Sources</dt><dd>{report.sourceCount}</dd></div><div><dt>Updated</dt><dd>{new Date(report.updatedAt).toLocaleDateString()}</dd></div></dl>
        </article>)}</div>}
    </div>
  </section>;
}
