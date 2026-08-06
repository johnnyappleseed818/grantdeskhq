import { useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { user, loading, error: setupError, signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get("next") || "/workspace";

  if (user) return <Navigate replace to={next} />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") await signUp(name, email, password);
      else await signIn(email, password);
      navigate(next, { replace: true });
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Account request failed.");
    } finally { setSubmitting(false); }
  };

  const reset = async () => {
    if (!email.trim()) return setError("Enter your email first.");
    setError("");
    try {
      await resetPassword(email);
      setNotice("Password-reset instructions were sent if the account exists.");
    } catch { setError("We could not send reset instructions. Try again shortly."); }
  };

  return <section className="account-page">
    <div className="site-shell account-grid">
      <div className="account-value">
        <p className="eyebrow">Private beta workspace</p>
        <h1>Build funder-specific grant reports with less spreadsheet work.</h1>
        <p>Turn your approved budget, accounting export, program updates, and funder form into an AI-assisted draft with the supporting evidence attached—without replacing your accounting system.</p>
        <div className="account-benefits">
          <span><ShieldCheck aria-hidden="true" />Reduce manual report assembly</span>
          <span><CheckCircle2 aria-hidden="true" />Find missing support before final review</span>
          <span><KeyRound aria-hidden="true" />Keep every AI draft tied to its sources</span>
        </div>
      </div>
      <form className="account-card" onSubmit={submit}>
        <div className="account-tabs" role="tablist" aria-label="Account action">
          <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => setMode("signup")}>Create account</button>
          <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => setMode("signin")}>Sign in</button>
        </div>
        <h2>{mode === "signup" ? "Create your GrantDeskHQ workspace" : "Welcome back"}</h2>
        {mode === "signup" && <label className="field-label">Your name<input className="form-control" required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>}
        <label className="field-label">Work email<input className="form-control" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="field-label">Password<input className="form-control" type="password" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {(error || setupError) && <div className="compiler-error" role="alert">{error || setupError}</div>}
        {notice && <div className="account-notice" role="status">{notice}</div>}
        <button className="button button-primary w-full" disabled={submitting || loading}>
          {submitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {mode === "signup" ? "Create secure workspace" : "Sign in"}
        </button>
        {mode === "signin" && <button className="text-button" type="button" onClick={reset}>Forgot password?</button>}
        <p className="account-boundary">Private beta accounts are for synthetic or appropriately redacted validation files. Human professional review remains required.</p>
      </form>
    </div>
  </section>;
}
