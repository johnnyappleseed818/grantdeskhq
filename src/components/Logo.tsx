import { Link } from "react-router-dom";

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      to="/"
      className={`logo-lockup ${inverse ? "text-white" : "text-navy-900"}`}
      aria-label="GrantDeskHQ home"
    >
      <svg className="h-9 w-9" viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="9" fill="currentColor" opacity="0.08" />
        <path d="M11 8h14l5 5v19H11z" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M25 8v6h6M15 17h10M15 22h7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="m20 28 3 3 6-8" fill="none" stroke="#5d806b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
      </svg>
      <span>GrantDeskHQ</span>
    </Link>
  );
}
