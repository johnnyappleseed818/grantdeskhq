import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return <div className="site-shell flex min-h-[60vh] flex-col items-start justify-center py-20"><p className="eyebrow">404</p><h1 className="page-title">This GrantDesk page was not found.</h1><p className="mt-4 text-slate-600">Return to the home page or open the interactive reporting demo.</p><div className="mt-7 flex gap-3"><Link className="button button-secondary" to="/"><ArrowLeft aria-hidden="true" /> Home</Link><Link className="button button-primary" to="/demo">Interactive demo</Link></div></div>;
}
