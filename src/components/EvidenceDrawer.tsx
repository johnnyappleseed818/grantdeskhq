import { useEffect, useRef } from "react";
import { FileText, X } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

export interface EvidenceDetail {
  title: string;
  source: string;
  locator: string;
  excerpt: string;
  evidenceType: string;
  confidence: string;
  reviewerStatus: string;
}

export function EvidenceDrawer({ evidence, onClose }: { evidence: EvidenceDetail | null; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!evidence) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [evidence, onClose]);

  if (!evidence) return null;

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="evidence-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-drawer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="flex gap-3">
            <span className="icon-tile"><FileText aria-hidden="true" /></span>
            <div>
              <p className="eyebrow mb-1">Evidence trace</p>
              <h2 id="evidence-drawer-title" className="text-xl font-semibold text-navy-900">{evidence.title}</h2>
            </div>
          </div>
          <button ref={closeButton} type="button" className="icon-button" aria-label="Close evidence drawer" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-6 p-5">
          <dl className="detail-list">
            <div><dt>Source</dt><dd>{evidence.source}</dd></div>
            <div><dt>Location</dt><dd>{evidence.locator}</dd></div>
            <div><dt>Evidence type</dt><dd>{evidence.evidenceType}</dd></div>
            <div><dt>Confidence</dt><dd>{evidence.confidence}</dd></div>
            <div><dt>Reviewer status</dt><dd><StatusBadge tone={evidence.reviewerStatus.includes("review") ? "review" : "success"}>{evidence.reviewerStatus}</StatusBadge></dd></div>
          </dl>
          <div className="source-excerpt">
            <p className="eyebrow mb-2">Synthetic source excerpt</p>
            <blockquote>“{evidence.excerpt}”</blockquote>
          </div>
          <p className="prototype-note">Interactive prototype using synthetic demonstration data. Human controller review is required.</p>
        </div>
      </aside>
    </div>
  );
}
