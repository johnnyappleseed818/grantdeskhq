import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, LoaderCircle, Pencil, Save, ShieldCheck } from "lucide-react";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { ContentDraft, ContentEngineState } from "../lib/gtmContentEngine";

type Mode = "REVIEW" | "PREVIEW" | "EDIT";

export function GtmContentReviewPage() {
  const { draftId } = useParams();
  const { user, loading, token } = useAuth();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [state, setState] = useState<ContentEngineState | null>(null);
  const [mode, setMode] = useState<Mode>("REVIEW");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ContentDraft>>({});

  useEffect(() => {
    if (!user) return;
    let active = true;
    token().then((idToken) => apiRequest<{ allowed: boolean }>("/api/gtm/access", idToken)).then(() => { if (active) setAccess("allowed"); }).catch(() => { if (active) setAccess("denied"); });
    return () => { active = false; };
  }, [user, token]);
  useEffect(() => {
    if (access !== "allowed") return;
    let active = true;
    token().then((idToken) => apiRequest<{ state: ContentEngineState | null }>("/api/gtm/content-engine", idToken)).then((body) => { if (active) setState(body.state); }).catch(() => { if (active) setError("Unable to load the canonical content draft."); });
    return () => { active = false; };
  }, [access, token]);

  const draft = useMemo(() => state?.drafts.find((item) => item.id === draftId) || null, [state, draftId]);
  useEffect(() => { if (draft) setForm({ title: draft.title, metaDescription: draft.metaDescription, body: draft.body, ctaCopy: draft.ctaCopy || "Try GrantDeskHQ with one award" }); }, [draft]);
  if (loading) return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading private content review…</div>;
  if (!user) return <Navigate replace to={`/login?next=/gtm/seo/content/${draftId || ""}`} />;
  if (access === "checking") return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Verifying private workspace access…</div>;
  if (access === "denied") return <section className="workspace-page"><div className="site-shell py-16"><div className="workspace-empty"><ShieldCheck aria-hidden="true" /><h1>Private workspace</h1><p>Content review is restricted to the GrantDeskHQ administrator.</p><Link className="button button-primary mt-5" to="/gtm">Return to GTM</Link></div></div></section>;
  if (!state && !error) return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading canonical content draft…</div>;
  if (!draft) return <section className="workspace-page"><div className="site-shell py-16"><div className="workspace-empty"><AlertCircle aria-hidden="true" /><h1>Draft not found</h1><p>{error || "This canonical draft is not available in the current content queue."}</p><Link className="button button-primary mt-5" to="/gtm">Return to SEO & Content</Link></div></div></section>;

  const opportunity = state?.opportunities.find((item) => item.id === draft.opportunityId);
  const relatedTasks = state?.distributionTasks.filter((task) => task.contentId === draft.id) || [];
  const save = async () => {
    setSaving(true); setError("");
    try {
      const idToken = await token(true);
      const body = await apiRequest<{ state: ContentEngineState }>("/api/gtm/content-engine", idToken, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "draft", id: draft.id, updates: form }) });
      setState(body.state); setMode("REVIEW");
    } catch { setError("Unable to save draft changes. Please review the required fields and retry."); }
    finally { setSaving(false); }
  };
  const transition = async (status: "APPROVED" | "SKIPPED") => {
    setSaving(true); setError("");
    try {
      const idToken = await token(true);
      const body = await apiRequest<{ state: ContentEngineState }>("/api/gtm/content-engine", idToken, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "draft", id: draft.id, status }) });
      setState(body.state);
    } catch { setError("Unable to save the review decision. Please retry."); }
    finally { setSaving(false); }
  };
  const displayed = { ...draft, ...form } as ContentDraft;
  return <main className="content-review-page"><div className="site-shell py-10 lg:py-14"><nav className="content-review-nav" aria-label="Content review navigation"><Link to="/gtm">GTM Command Center</Link><span>/</span><Link to="/gtm">SEO & Content</Link><span>/</span><span>Review draft</span></nav>
    <div className="content-review-header"><div><p className="eyebrow">Founder content review</p><h1>{draft.title}</h1><p>Review, preview, and edit the canonical draft before approval. Approval does not publish it.</p></div><span className="status-badge status-review">{draft.status.replaceAll("_", " ")}</span></div>
    <div className="content-review-actions"><div className="gtm-filters" aria-label="Draft view"><button type="button" className={mode === "REVIEW" ? "is-active" : ""} onClick={() => setMode("REVIEW")}>Review</button><button type="button" className={mode === "PREVIEW" ? "is-active" : ""} onClick={() => setMode("PREVIEW")}>Preview</button><button type="button" className={mode === "EDIT" ? "is-active" : ""} onClick={() => setMode("EDIT")}>Edit</button></div><div className="gtm-actions"><button type="button" className="button button-secondary" disabled={saving || draft.status === "APPROVED"} onClick={() => void transition("APPROVED")}> <CheckCircle2 aria-hidden="true" />Approve</button><button type="button" className="button button-secondary" disabled={saving} onClick={() => void transition("SKIPPED")}>Reject / Skip</button></div></div>
    {error && <div className="compiler-error mt-5" role="alert"><AlertCircle aria-hidden="true" />{error}</div>}
    {mode === "PREVIEW" ? <ArticlePreview draft={displayed} /> : mode === "EDIT" ? <section className="content-editor"><label>Article title<input value={form.title || ""} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label><label>Meta description<textarea value={form.metaDescription || ""} onChange={(event) => setForm((current) => ({ ...current, metaDescription: event.target.value }))} rows={3} /></label><label>Article body (Markdown)<textarea className="content-editor-body" value={form.body || ""} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} rows={24} /></label><label>CTA copy<input value={form.ctaCopy || ""} onChange={(event) => setForm((current) => ({ ...current, ctaCopy: event.target.value }))} /></label><div className="gtm-actions"><button type="button" className="button button-primary" disabled={saving} onClick={() => void save()}><Save aria-hidden="true" />{saving ? "Saving…" : "Save changes"}</button><button type="button" className="button button-secondary" onClick={() => setMode("PREVIEW")}><Pencil aria-hidden="true" />Preview edits</button></div></section> : <ReviewSurface draft={draft} opportunity={opportunity} tasks={relatedTasks} />}
  </div></main>;
}

function ReviewSurface({ draft, opportunity, tasks }: { draft: ContentDraft; opportunity: ContentEngineState["opportunities"][number] | undefined; tasks: ContentEngineState["distributionTasks"] }) {
  return <div className="content-review-grid"><article className="content-review-article"><p className="eyebrow">Article</p><h2>{draft.title}</h2><p className="content-review-description">{draft.metaDescription}</p><ArticleMarkdown body={draft.body} /><aside className="content-review-cta"><h3>Ready to organize a real report?</h3><p>Use the Free First Award flow with one award, its terms, budget, accounting export, and evidence. Your team remains in control of review and submission.</p><a className="button button-primary" href={draft.ctaUrl}>{draft.ctaCopy || "Try GrantDeskHQ with one award"}</a></aside></article><aside className="content-review-sidebar"><section><p className="eyebrow">Publishing metadata</p><dl><dt>Planned canonical URL</dt><dd>{draft.canonicalUrl}</dd><dt>Meta title</dt><dd>{draft.title}</dd><dt>Meta description</dt><dd>{draft.metaDescription}</dd><dt>Status</dt><dd>{draft.status.replaceAll("_", " ")}</dd></dl></section><section><p className="eyebrow">Why this exists</p><h3>{opportunity?.topic || "Content opportunity"}</h3><p>{opportunity?.primaryUserProblem}</p><p><strong>Evidence:</strong> {opportunity?.sourceOfIdea.join(" · ")}</p><p><strong>Recommendation:</strong> {opportunity?.recommendedAction} · priority {opportunity?.priorityScore}</p></section><section><p className="eyebrow">Internal links</p><ul>{draft.internalLinksTo.map((item) => <li key={item}>{item}</li>)}</ul></section><section><p className="eyebrow">Distribution tasks</p>{tasks.length ? <ul>{tasks.map((task) => <li key={task.id}><strong>{task.platform}</strong><span>{task.sourceOrCommunity} · {task.status}</span></li>)}</ul> : <p>No manual distribution task is associated with this draft.</p>}</section></aside></div>;
}

function ArticlePreview({ draft }: { draft: ContentDraft }) { return <article className="content-public-preview"><p className="eyebrow">GrantDeskHQ field guide</p><h1>{draft.title}</h1><p className="content-review-description">{draft.metaDescription}</p><ArticleMarkdown body={draft.body} /><aside className="content-review-cta"><h2>Ready to organize a real report?</h2><p>Use the Free First Award flow with one award, its terms, budget, accounting export, and evidence.</p><a className="button button-primary" href={draft.ctaUrl}>{draft.ctaCopy || "Try GrantDeskHQ with one award"}</a></aside></article>; }

function ArticleMarkdown({ body }: { body: string }) { return <div className="content-article-body">{body.split(/\n\n+/).map((block, index) => { const text = block.trim(); if (text.startsWith("# ")) return index === 0 ? null : <h2 key={index}>{text.slice(2)}</h2>; if (text.startsWith("## ")) return <h2 key={index}>{text.slice(3)}</h2>; if (text.startsWith("### ")) return <h3 key={index}>{text.slice(4)}</h3>; if (text.split("\n").every((line) => line.startsWith("- "))) return <ul key={index}>{text.split("\n").map((line) => <li key={line}>{line.slice(2)}</li>)}</ul>; return <p key={index}>{text}</p>; })}</div>; }
