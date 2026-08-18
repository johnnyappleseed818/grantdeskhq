import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Logo } from "./Logo";
import { CORE_VALUE_PROPOSITION, REVIEW_PROMISE } from "../content/positioning";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { openAnalyticsPreferences, trackAnalyticsEvent } from "../lib/analytics";

const marketingLinks = [
  ["How It Works", "/#how-it-works"],
  ["Sample Output", "/sample-report"],
  ["Resources", "/resources"],
  ["Security & FAQ", "/#security-faq"],
  ["Pricing", "/pricing"],
  ["Contact Us", "/contact"]
];

export function SiteLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [gtmAllowed, setGtmAllowed] = useState(false);
  const location = useLocation();
  const { user, token } = useAuth();

  useEffect(() => setMenuOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    if (!user) {
      setGtmAllowed(false);
      return () => { active = false; };
    }
    token()
      .then((idToken) => apiRequest<{ allowed: boolean }>("/api/gtm/access", idToken))
      .then((body) => { if (active) setGtmAllowed(body.allowed); })
      .catch(() => { if (active) setGtmAllowed(false); });
    return () => { active = false; };
  }, [user, token]);

  return (
    <div className="min-h-screen bg-canvas text-slate-800">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="site-header">
        <div className="site-shell flex h-18 items-center justify-between gap-5">
          <Logo />
          <button
            type="button"
            className="icon-button md:hidden"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
          <nav
            id="primary-navigation"
            aria-label="Primary navigation"
            className={`primary-navigation ${menuOpen ? "is-open" : ""}`}
          >
            {marketingLinks.map(([label, href]) => (
              <NavLink key={label} to={href} className="nav-link">{label}</NavLink>
            ))}
            {gtmAllowed && <Link className="nav-link admin-nav-link" to="/gtm">GTM Command Center</Link>}
            {user && <Link className="nav-link account-nav-link" to="/workspace">My workspace</Link>}
            <Link className="nav-link account-nav-link" to={user ? "/account" : "/login"}>{user ? "Account" : "Sign in"}</Link>
            <Link
              className="button button-primary whitespace-nowrap"
              to={user ? "/compile?new=1" : "/assessment"}
              reloadDocument={Boolean(user)}
              onClick={() => { if (!user) trackAnalyticsEvent("free_first_report_click", { surface: "header" }); }}
            >
              {user ? "New report" : "Free First Award"}
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content"><Outlet /></main>

      <footer className="border-t border-slate-200 bg-navy-950 text-slate-300 print:hidden">
        <div className="site-shell grid gap-10 py-12 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <Logo inverse />
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
              {CORE_VALUE_PROPOSITION} {REVIEW_PROMISE}
            </p>
          </div>
          <div>
            <p className="footer-heading">Product</p>
            <div className="mt-3 grid gap-2 text-sm">
              <Link to="/demo">Interactive demo</Link>
              <Link to="/compile">Prepare a report</Link>
              <Link to="/readiness">Free readiness audit</Link>
              <Link to="/sample-report">Synthetic sample report</Link>
              <Link to="/pricing">Pricing</Link>
              <Link to="/resources">Resources</Link>
              <Link to="/blog">Grant reporting field guide</Link>
              <Link to={user ? "/workspace" : "/login"}>{user ? "My workspace" : "Account sign in"}</Link>
              {user && <Link to="/account">Account settings &amp; billing</Link>}
              {gtmAllowed && <Link to="/gtm">GTM Command Center</Link>}
              <Link to="/assessment" onClick={() => trackAnalyticsEvent("free_first_report_click", { surface: "footer" })}>Free First Award</Link>
            </div>
          </div>
          <div>
            <p className="footer-heading">Information</p>
            <div className="mt-3 grid gap-2 text-sm">
              <Link to="/privacy">Privacy and data handling</Link>
              <Link to="/#security-faq">Security and FAQ</Link>
              <button type="button" className="footer-link-button" onClick={openAnalyticsPreferences}>Cookie settings</button>
              <Link to="/contact">Contact &amp; Feedback</Link>
              <span className="text-slate-500">© {new Date().getFullYear()} GrantDeskHQ</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
