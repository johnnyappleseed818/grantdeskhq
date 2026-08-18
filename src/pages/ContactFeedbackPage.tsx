import { useEffect, useState } from "react";
import { CheckCircle2, MessageSquareText } from "lucide-react";
import { useLocation } from "react-router-dom";
import { apiUrl } from "../lib/api";
import { feedbackCategories, type FeedbackCategory } from "../lib/feedback";
import { trackAnalyticsEvent } from "../lib/analytics";
import { useAuth } from "../lib/auth";

const labels: Record<FeedbackCategory, string> = {
  PRODUCT_FEEDBACK: "Product feedback", FEATURE_REQUEST: "Feature request", PROBLEM_BUG: "Problem or bug", BILLING_ACCOUNT: "Billing or account", SALES: "Sales", PARTNERSHIP: "Partnership", OTHER: "Other"
};

export function ContactFeedbackPage() {
  const { user, token } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ name: "", email: "", organization: "", category: "", message: "", website: "" });
  const [started, setStarted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => { trackAnalyticsEvent("contact_opened", { surface: "contact" }); }, []);
  useEffect(() => {
    if (!user) return;
    setForm((current) => ({ ...current, name: current.name || user.displayName || "", email: current.email || user.email || "" }));
  }, [user]);
  const start = () => { if (!started) { setStarted(true); trackAnalyticsEvent("feedback_started", { surface: user ? "workspace" : "contact" }); } };
  const update = (name: keyof typeof form, value: string) => setForm((current) => ({ ...current, [name]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setSubmitting(true);
    try {
      const identityToken = user ? await token() : "";
      const response = await fetch(apiUrl("/api/feedback"), { method: "POST", headers: { "Content-Type": "application/json", ...(identityToken ? { Authorization: `Bearer ${identityToken}` } : {}) }, body: JSON.stringify({ ...form, sourcePage: location.pathname }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Feedback could not be submitted.");
      setSubmitted(true); trackAnalyticsEvent("feedback_submitted", { surface: user ? "workspace" : "contact" });
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Feedback could not be submitted."); }
    finally { setSubmitting(false); }
  };
  if (submitted) return <section className="contact-feedback-page"><div className="site-shell contact-feedback-shell"><div className="contact-feedback-success"><CheckCircle2 aria-hidden="true" /><h1>Thanks for the feedback.</h1><p>Your submission is recorded for review. Notifications are not configured, so this form never sends your message to an unverified destination.</p></div></div></section>;
  return <section className="contact-feedback-page"><div className="site-shell contact-feedback-shell"><header><p className="eyebrow">Contact and feedback</p><h1>we'd love to hear from you</h1><p>Tell us what is working, what is missing, or where you need help. You do not need an account to use this form.</p></header><form className="contact-feedback-form" onSubmit={(event) => void submit(event)} onFocus={start}><label className="field-label">Name<input className="form-control" required maxLength={120} value={form.name} onChange={(event) => update("name", event.target.value)} autoComplete="name" /></label><label className="field-label">Email<input className="form-control" required type="email" maxLength={254} value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" /></label><label className="field-label">Organization <span className="text-slate-400 font-normal">(optional)</span><input className="form-control" maxLength={160} value={form.organization} onChange={(event) => update("organization", event.target.value)} autoComplete="organization" /></label><label className="field-label">What can we help with?<select className="form-control" required value={form.category} onChange={(event) => update("category", event.target.value)}><option value="">Choose a category</option>{feedbackCategories.map((category) => <option value={category} key={category}>{labels[category]}</option>)}</select></label><label className="field-label">Message<textarea className="form-control" required maxLength={5000} rows={7} value={form.message} onChange={(event) => update("message", event.target.value)} /></label><label className="feedback-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} /></label>{error && <p className="compiler-error" role="alert">{error}</p>}<p className="form-note">We store this request for the GrantDeskHQ team to review. A notification destination has not been configured, and no email is sent from this form.</p><button className="button button-primary" disabled={submitting} type="submit"><MessageSquareText aria-hidden="true" />{submitting ? "Submitting…" : "Submit feedback"}</button></form></div></section>;
}
