import { useEffect, useState } from "react";
import { LoaderCircle, MessageSquareText, ShieldCheck } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { FeedbackSubmission } from "../lib/feedback";

export function GtmFeedbackPage() {
  const { user, loading, token } = useAuth(); const [records, setRecords] = useState<FeedbackSubmission[] | null>(null); const [error, setError] = useState("");
  useEffect(() => { if (!user) return; token().then((idToken) => apiRequest<{ feedback: FeedbackSubmission[] }>("/api/gtm/feedback", idToken)).then((body) => setRecords(body.feedback)).catch((reason) => setError(reason instanceof Error ? reason.message : "Feedback could not be loaded.")); }, [user, token]);
  if (loading) return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading feedback review…</div>;
  if (!user) return <Navigate replace to="/login?next=/gtm/feedback" />;
  if (error) return <section className="workspace-page"><div className="site-shell py-16"><div className="workspace-empty"><ShieldCheck aria-hidden="true" /><h1>Private workspace</h1><p>{error}</p><Link className="button button-primary" to="/workspace">Return to your reports</Link></div></div></section>;
  return <section className="workspace-page"><div className="site-shell py-10 lg:py-14"><header className="workspace-header"><div><p className="eyebrow">GTM administrator</p><h1>Contact and feedback review</h1><p>Submissions are stored for review. Notifications remain explicitly not configured until a legitimate destination is added.</p></div><Link className="button button-secondary" to="/gtm">GTM Command Center</Link></header>{records === null ? <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading submissions…</div> : records.length === 0 ? <div className="workspace-empty"><MessageSquareText aria-hidden="true" /><h2>No feedback submissions yet</h2></div> : <div className="feedback-admin-list">{records.map((record) => <article className="report-row" key={record.id}><div><span className="status-badge status-neutral">{record.status}</span><h2>{record.category.replaceAll("_", " ")}</h2><p>{record.name} · {record.email}{record.organization ? ` · ${record.organization}` : ""}</p></div><p className="feedback-admin-message">{record.message}</p><dl><div><dt>Submitted</dt><dd>{new Date(record.createdAt).toLocaleString()}</dd></div><div><dt>Notification</dt><dd>{record.notificationStatus.replaceAll("_", " ")}</dd></div></dl></article>)}</div>}</div></section>;
}
