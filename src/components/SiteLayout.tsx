import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Logo } from "./Logo";

const marketingLinks = [
  ["How It Works", "/#how-it-works"],
  ["AI Report Compiler", "/#compiler"],
  ["Sample Output", "/sample-report"],
  ["Pricing", "/pricing"],
  ["Assessment", "/assessment"]
];

export function SiteLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

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
            <Link className="button button-primary whitespace-nowrap" to="/demo">See the demo</Link>
          </nav>
        </div>
      </header>

      <main id="main-content"><Outlet /></main>

      <footer className="border-t border-slate-200 bg-navy-950 text-slate-300 print:hidden">
        <div className="site-shell grid gap-10 py-12 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <Logo inverse />
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
              AI-powered grant-reporting workflow designed to reduce manual overhead and catch issues earlier. The public demo uses synthetic data; final decisions stay with your team.
            </p>
          </div>
          <div>
            <p className="footer-heading">Product</p>
            <div className="mt-3 grid gap-2 text-sm">
              <Link to="/demo">Interactive demo</Link>
              <Link to="/sample-report">Synthetic sample report</Link>
              <Link to="/pricing">Pricing</Link>
              <Link to="/assessment">Workflow assessment</Link>
            </div>
          </div>
          <div>
            <p className="footer-heading">Information</p>
            <div className="mt-3 grid gap-2 text-sm">
              <Link to="/privacy">Privacy and data handling</Link>
              <Link to="/assessment#contact">Contact us</Link>
              <span className="text-slate-500">© {new Date().getFullYear()} GrantDeskHQ</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
