import { useState } from "react";
import {
  Archive,
  BarChart3,
  CheckSquare,
  ClipboardList,
  FileInput,
  FileOutput,
  FileText,
  ListChecks
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EvidenceDrawer, type EvidenceDetail } from "../components/EvidenceDrawer";
import { StatusBadge } from "../components/StatusBadge";
import type { BudgetCategoryName, MappingReviewStatus } from "../data/grantData";
import { grantData, transactions } from "../data/grantData";
import type { RequiredReviewState } from "../lib/calculations";
import { canGenerateReviewPackage, unresolvedReviewCount } from "../lib/calculations";
import { AgencyOverview } from "../components/demo/AgencyOverview";
import { SourcePackage } from "../components/demo/SourcePackage";
import { Requirements } from "../components/demo/Requirements";
import { FinancialMapping } from "../components/demo/FinancialMapping";
import { MissingInputs } from "../components/demo/MissingInputs";
import { NarrativeDraft } from "../components/demo/NarrativeDraft";
import { QualityReview } from "../components/demo/QualityReview";
import { ExportPackage } from "../components/demo/ExportPackage";

export type DemoView = "overview" | "sources" | "requirements" | "mapping" | "missing" | "narrative" | "quality" | "export";

export interface MappingDecision {
  category: BudgetCategoryName | null;
  status: MappingReviewStatus;
}

const navigation: Array<{ id: DemoView; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Agency Overview", icon: BarChart3 },
  { id: "sources", label: "Source Package", icon: FileInput },
  { id: "requirements", label: "Requirements", icon: ListChecks },
  { id: "mapping", label: "Financial Mapping", icon: ClipboardList },
  { id: "missing", label: "Missing Inputs", icon: Archive },
  { id: "narrative", label: "Narrative Draft", icon: FileText },
  { id: "quality", label: "Quality Review", icon: CheckSquare },
  { id: "export", label: "Export Package", icon: FileOutput }
];

const initialMappingDecisions = Object.fromEntries(
  transactions.map((transaction) => [
    transaction.id,
    { category: transaction.suggestedCategory, status: transaction.reviewStatus }
  ])
) as Record<string, MappingDecision>;

const initialReviewState: RequiredReviewState = {
  unmappedTransaction: false,
  missingReceipt: false,
  certification: false
};

export function DemoPage() {
  const [activeView, setActiveView] = useState<DemoView>("overview");
  const [mappingDecisions, setMappingDecisions] = useState(initialMappingDecisions);
  const [reviewState, setReviewState] = useState(initialReviewState);
  const [evidence, setEvidence] = useState<EvidenceDetail | null>(null);
  const [packageGenerated, setPackageGenerated] = useState(false);

  const unresolved = unresolvedReviewCount(reviewState);
  const exportEnabled = canGenerateReviewPackage(reviewState);

  const setMapping = (transactionId: string, category: BudgetCategoryName | null) => {
    setMappingDecisions((current) => ({
      ...current,
      [transactionId]: {
        category,
        status: category ? "Changed" : "Unresolved"
      }
    }));
    if (transactionId === "UNM-001") {
      setReviewState((current) => ({ ...current, unmappedTransaction: false }));
    }
  };

  const approveMapping = (transactionId: string) => {
    setMappingDecisions((current) => ({
      ...current,
      [transactionId]: { ...current[transactionId], status: "Approved" }
    }));
    if (transactionId === "UNM-001" && mappingDecisions[transactionId].category) {
      setReviewState((current) => ({ ...current, unmappedTransaction: true }));
    }
  };

  const resolveReviewItem = (item: keyof RequiredReviewState) => {
    if (item === "unmappedTransaction") {
      setMappingDecisions((current) => ({
        ...current,
        "UNM-001": { category: "Program Supplies", status: "Approved" }
      }));
    }
    setReviewState((current) => ({ ...current, [item]: true }));
  };

  const renderActiveComponent = () => {
    switch (activeView) {
      case "sources":
        return <SourcePackage />;
      case "requirements":
        return <Requirements />;
      case "mapping":
        return <FinancialMapping decisions={mappingDecisions} onSetMapping={setMapping} onApprove={approveMapping} onEvidence={setEvidence} />;
      case "missing":
        return <MissingInputs />;
      case "narrative":
        return <NarrativeDraft onEvidence={setEvidence} />;
      case "quality":
        return <QualityReview reviewState={reviewState} onResolve={resolveReviewItem} onGenerate={() => { setPackageGenerated(true); setActiveView("export"); }} />;
      case "export":
        return <ExportPackage enabled={exportEnabled} generated={packageGenerated} unresolved={unresolved} onOpenQuality={() => setActiveView("quality")} onGenerate={() => setPackageGenerated(true)} />;
      default:
        return <AgencyOverview onNavigate={setActiveView} />;
    }
  };

  return (
    <div className="demo-page">
      <div className="demo-disclosure">
        <div className="site-shell flex items-center justify-center gap-2 text-center">
          <StatusBadge tone="info">Interactive demo using synthetic data</StatusBadge>
          <span className="hidden text-xs text-slate-600 sm:inline">AI-powered reporting workflow · Your team approves every output</span>
        </div>
      </div>

      <div className="demo-topbar">
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1.1fr_auto] lg:px-6">
          <DemoMeta label="Client" value={grantData.client} />
          <DemoMeta label="Grant" value={`${grantData.funder} · ${grantData.grantName}`} />
          <DemoMeta label="Reporting period" value="Jan 1–Jun 30, 2026" />
          <div className="flex items-center gap-2 lg:justify-end">
            <StatusBadge tone={unresolved ? "review" : "success"}>{unresolved ? "Controller review" : "Review gate cleared"}</StatusBadge>
            <StatusBadge tone="neutral">Synthetic</StatusBadge>
          </div>
        </div>
      </div>

      <div className="demo-mobile-nav">
        <label htmlFor="demo-workspace-view">Workspace section</label>
        <select id="demo-workspace-view" value={activeView} onChange={(event) => setActiveView(event.target.value as DemoView)}>
          {navigation.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>

      <div className="demo-layout">
        <aside className="demo-sidebar" aria-label="Demo workspace navigation">
          <div className="border-b border-white/10 px-4 py-5">
            <p className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">Agency workspace</p>
            <p className="mt-2 text-sm font-semibold text-white">Northstar Nonprofit Finance</p>
          </div>
          <nav className="space-y-1 p-3">
            {navigation.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`demo-nav-button ${activeView === id ? "is-active" : ""}`}
                aria-current={activeView === id ? "page" : undefined}
                onClick={() => setActiveView(id)}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
                {id === "quality" && unresolved > 0 && <span className="nav-count" aria-label={`${unresolved} unresolved items`}>{unresolved}</span>}
              </button>
            ))}
          </nav>
          <div className="m-3 border border-white/10 p-3 text-xs leading-5 text-slate-400">
            Suggestions and drafts remain subject to controller approval.
          </div>
        </aside>

        <section className="demo-workspace" aria-live="polite">{renderActiveComponent()}</section>
      </div>
      <EvidenceDrawer evidence={evidence} onClose={() => setEvidence(null)} />
    </div>
  );
}

function DemoMeta({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{label}</p><p className="mt-1 truncate text-xs font-semibold text-navy-900" title={value}>{value}</p></div>;
}
