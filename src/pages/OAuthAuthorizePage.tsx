import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";

/** Browser portion of the OAuth authorization-code flow.  Firebase remains
 * the established account login; the server exchanges it for a short-lived,
 * tenant-bound OAuth code rather than exposing the Firebase token to MCP. */
export function OAuthAuthorizePage() {
  const { user, loading, token } = useAuth();
  const location = useLocation();
  const [error, setError] = useState("");
  const started = useRef(false);
  const next = `/oauth/authorize${location.search}`;

  useEffect(() => {
    if (!user || loading || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const response = await fetch(`/api/mcp/oauth/authorize/approve${location.search}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${await token()}` }
        });
        const body = await response.json() as { redirect_uri?: string; error_description?: string };
        if (!response.ok || !body.redirect_uri) throw new Error(body.error_description || "The GrantDeskHQ connection could not be approved.");
        window.location.assign(body.redirect_uri);
      } catch (reason) { setError(reason instanceof Error ? reason.message : "The GrantDeskHQ connection could not be approved."); }
    })();
  }, [location.search, loading, token, user]);

  if (loading) return <section className="account-page"><div className="site-shell"><p>Checking your secure GrantDeskHQ session…</p></div></section>;
  if (!user) return <Navigate replace to={`/login?next=${encodeURIComponent(next)}`} />;
  return <section className="account-page"><div className="site-shell account-card"><ShieldCheck aria-hidden="true" /><h1>Connect GrantDeskHQ</h1>{error ? <p className="compiler-error" role="alert">{error}</p> : <p><LoaderCircle className="inline animate-spin" aria-hidden="true" /> Confirming your tenant-bound reporting access…</p>}<p className="account-boundary">Only the scopes requested by the connected tool are approved. GrantDeskHQ never exposes GTM administration through this connection.</p></div></section>;
}
