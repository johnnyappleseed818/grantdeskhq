import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileText,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UploadCloud
} from "lucide-react";
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, canGenerateReviewPackage, resultToDownload, validateCompilationRequest } from "../lib/prototype";
import type { CompilationRequest, CompilationResult, CompilerFile, SourceRole } from "../types/prototype";

const sourceFields: Array<{ role: SourceRole; label: string; help: string; accept: string; required: boolean }> = [
  { role: "awardAgreement", label: "Award agreement", help: "PDF, DOCX, or TXT", accept: ".pdf,.docx,.txt", required: true },
  { role: "approvedBudget", label: "Approved grant budget", help: "XLSX, CSV, or PDF", accept: ".xlsx,.csv,.pdf", required: true },
  { role: "ledgerExport", label: "General ledger export", help: "CSV or XLSX", accept: ".csv,.xlsx", required: true },
  { role: "funderTemplate", label: "Funder report template", help: "DOCX or PDF", accept: ".docx,.pdf", required: true },
  { role: "programUpdate", label: "Program update", help: "DOCX, PDF, or TXT", accept: ".docx,.pdf,.txt", required: true },
  { role: "supportingEvidence", label: "Supporting evidence", help: "Optional PDF, XLSX, CSV, or image", accept: ".pdf,.xlsx,.csv,.png,.jpg,.jpeg", required: false }
];

const sampleAssets: Array<{ role: SourceRole; url?: string; name: string; text?: string; type?: string }> = [
  { role: "awardAgreement", url: "/samples/Synthetic_Grant_Agreement.pdf", name: "Synthetic_Grant_Agreement.pdf" },
  { role: "approvedBudget", url: "/samples/Approved_Grant_Budget.xlsx", name: "Approved_Grant_Budget.xlsx" },
  { role: "ledgerExport", url: "/samples/General_Ledger_Export.csv", name: "General_Ledger_Export.csv" },
  { role: "funderTemplate", url: "/samples/Synthetic_Funder_Report_Draft.pdf", name: "Synthetic_Funder_Template.pdf" },
  {
    role: "programUpdate",
    name: "Synthetic_Program_Update.txt",
    type: "text/plain",
    text: "SYNTHETIC DEMONSTRATION DATA\nConfirmed youth served: 118 of a six-month target of 120. Two workshops were deferred. Three additional school-site visits were approved. The program expanded into two additional schools. Mileage reimbursement increased. One travel receipt remains missing."
  },
  { role: "supportingEvidence", url: "/samples/Transaction_Evidence_Schedule.xlsx", name: "Transaction_Evidence_Schedule.xlsx" }
];

type ResultTab = "overview" | "requirements" | "mapping" | "narrative" | "review";

export function CompilePage() {
  const [meta, setMeta] = useState({
    organizationName: "Hope Community Services",
    grantName: "Pacific Youth Foundation — Youth Access Initiative",
    reportingPeriod: "January 1–June 30, 2026"
  });
  const [files, setFiles] = useState<Partial<Record<SourceRole, File>>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CompilationResult | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("overview");
  const [wizardStep, setWizardStep] = useState(1);

  const totalBytes = useMemo(() => Object.values(files).reduce((sum, file) => sum + (file?.size || 0), 0), [files]);
  const requiredFilesComplete = sourceFields.filter((field) => field.required).every((field) => files[field.role]);

  const updateFile = (role: SourceRole, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFiles((current) => ({ ...current, [role]: file }));
    setResult(null);
    setError("");
  };

  const loadSamples = async () => {
    setLoadingSamples(true);
    setError("");
    try {
      const entries = await Promise.all(sampleAssets.map(async (asset) => {
        if (asset.text) return [asset.role, new File([asset.text], asset.name, { type: asset.type })] as const;
        const response = await fetch(asset.url!);
        if (!response.ok) throw new Error(`Could not load ${asset.name}.`);
        const blob = await response.blob();
        return [asset.role, new File([blob], asset.name, { type: blob.type })] as const;
      }));
      setFiles(Object.fromEntries(entries));
      setAcknowledged(true);
      setWizardStep(3);
      setMeta({ organizationName: "Hope Community Services", grantName: "Pacific Youth Foundation — Youth Access Initiative", reportingPeriod: "January 1–June 30, 2026" });
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : "The sample package could not be loaded.");
    } finally {
      setLoadingSamples(false);
    }
  };

  const moveWizard = (direction: 1 | -1) => {
    setError("");
    if (direction === -1) {
      setWizardStep((step) => Math.max(1, step - 1));
      return;
    }
    if (wizardStep === 1 && (!meta.organizationName.trim() || !meta.grantName.trim() || !meta.reportingPeriod.trim())) {
      setError("Complete the organization, grant, and reporting period before continuing.");
      return;
    }
    if (wizardStep === 2 && !requiredFilesComplete) {
      setError("Add each required source file before continuing. Supporting evidence is optional.");
      return;
    }
    if (wizardStep === 2 && (totalBytes > MAX_TOTAL_BYTES || Object.values(files).some((file) => (file?.size || 0) > MAX_FILE_BYTES))) {
      setError("Reduce the source package size before continuing.");
      return;
    }
    if (wizardStep === 3 && !acknowledged) {
      setError("Confirm the test-file and professional-review requirement before continuing.");
      return;
    }
    setWizardStep((step) => Math.min(4, step + 1));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setResult(null);
    const selected = Object.entries(files) as Array<[SourceRole, File]>;
    const payloadFiles = await Promise.all(selected.map(([role, file]) => fileToCompilerFile(role, file)));
    const payload: CompilationRequest = { ...meta, files: payloadFiles };
    const errors = validateCompilationRequest(payload);
    if (!acknowledged) errors.push("Confirm that the files are synthetic or redacted test files.");
    if (errors.length) {
      setError(errors.join(" "));
      return;
    }

    setCompiling(true);
    try {
      const response = await fetch("/api/compile-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json() as CompilationResult & { error?: string };
      if (!response.ok) throw new Error(body.error || "The report compiler could not complete this package.");
      setResult(body);
      setActiveTab("overview");
      window.requestAnimationFrame(() => document.getElementById("compiler-results")?.focus());
    } catch (compileError) {
      setError(compileError instanceof Error ? compileError.message : "The report compiler could not complete this package.");
    } finally {
      setCompiling(false);
    }
  };

  const resolveCheck = (id: string) => setResult((current) => current ? {
    ...current,
    qualityChecks: current.qualityChecks.map((check) => check.id === id ? { ...check, status: "passed", detail: `${check.detail} Reviewed and confirmed in this prototype session.` } : check),
    validation: {
      ...current.validation,
      findings: current.validation.findings.map((finding) => finding.id === id ? { ...finding, verdict: "source_matched", reason: `${finding.reason} A professional reviewer confirmed this item in the current session.` } : finding)
    }
  } : current);

  const download = () => {
    if (!result || !canGenerateReviewPackage(result)) return;
    const url = URL.createObjectURL(new Blob([resultToDownload(result)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "GrantDeskHQ_Review_Package.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="compile-page">
      <section className="compile-hero">
        <div className="site-shell grid items-start gap-10 py-12 lg:grid-cols-[1fr_.78fr] lg:py-16">
          <div>
            <div className="prototype-pill"><span aria-hidden="true" /> Working AI prototype · professional review required</div>
            <p className="eyebrow mt-7">AI Report Compiler</p>
            <h1 className="page-title">Turn source files into an evidence-backed report draft.</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">Upload a small test package. GrantDeskHQ reads the funder’s structure, suggests transaction mappings, identifies missing information, drafts source-supported narrative, and builds a focused review list.</p>
          </div>
          <div className="compile-boundary">
            <LockKeyhole aria-hidden="true" />
            <div><strong>Use synthetic or redacted test files only.</strong><p>This early prototype sends the selected files to the configured AI provider for processing. It does not connect to your accounting system or submit a report.</p></div>
          </div>
        </div>
      </section>

      <section className="site-shell grid gap-8 py-10 lg:grid-cols-[.8fr_1.2fr] lg:py-14">
        <aside className="compile-guide">
          <p className="eyebrow">What happens next</p>
          {["Read funder rules and report structure", "Suggest financial mappings with confidence", "Ask only for evidence that is missing", "Draft statements with visible citations", "Block unsupported content before export"].map((step, index) => (
            <div className="compile-guide-step" key={step}><span>{index + 1}</span><p>{step}</p></div>
          ))}
          <button type="button" className="button button-secondary mt-6 w-full" onClick={loadSamples} disabled={loadingSamples}>
            {loadingSamples ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <FileCheck2 aria-hidden="true" />}
            {loadingSamples ? "Loading sample package…" : "Load synthetic sample package"}
          </button>
        </aside>

        <form className="compile-form" onSubmit={submit}>
          <ol className="wizard-progress" aria-label="Getting started steps">
            {["Report", "Sources", "Validate", "Compile"].map((label, index) => {
              const number = index + 1;
              return <li key={label} className={wizardStep === number ? "is-current" : wizardStep > number ? "is-complete" : ""}><button type="button" onClick={() => number < wizardStep && setWizardStep(number)} disabled={number > wizardStep} aria-current={wizardStep === number ? "step" : undefined}><span>{wizardStep > number ? <CheckCircle2 aria-hidden="true" /> : number}</span>{label}</button></li>;
            })}
          </ol>

          <fieldset className="wizard-step" hidden={wizardStep !== 1}>
            <legend><span className="eyebrow">Step 1 of 4</span>Tell us which report you’re preparing</legend>
            <p className="wizard-intro">This information labels the report package and helps the compiler keep the right grant and reporting period in view.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organization" id="compiler-organization"><input id="compiler-organization" className="form-control" required value={meta.organizationName} onChange={(event) => setMeta({ ...meta, organizationName: event.target.value })} /></Field>
              <Field label="Grant or award" id="compiler-grant"><input id="compiler-grant" className="form-control" required value={meta.grantName} onChange={(event) => setMeta({ ...meta, grantName: event.target.value })} /></Field>
            </div>
            <Field label="Reporting period" id="compiler-period"><input id="compiler-period" className="form-control" required value={meta.reportingPeriod} onChange={(event) => setMeta({ ...meta, reportingPeriod: event.target.value })} /></Field>
          </fieldset>

          <fieldset className="wizard-step" hidden={wizardStep !== 2}>
            <legend><span className="eyebrow">Step 2 of 4</span>Add the files your team already uses</legend>
            <div className="wizard-intro flex items-center justify-between gap-4"><span>Required files are marked with an asterisk. No accounting connection is needed.</span><strong>{formatBytes(totalBytes)} / 2.5 MB</strong></div>
            <div className="source-upload-grid">
              {sourceFields.map((field) => {
                const file = files[field.role];
                return (
                  <label key={field.role} className={`source-upload ${file ? "has-file" : ""}`} htmlFor={`source-${field.role}`}>
                    <input id={`source-${field.role}`} type="file" accept={field.accept} required={field.required && !file} onChange={(event) => updateFile(field.role, event)} />
                    <UploadCloud aria-hidden="true" />
                    <span><strong>{field.label}{field.required ? " *" : ""}</strong><small>{file ? `${file.name} · ${formatBytes(file.size)}` : field.help}</small></span>
                    {file && <CheckCircle2 className="upload-check" aria-hidden="true" />}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="wizard-step" hidden={wizardStep !== 3}>
            <legend><span className="eyebrow">Step 3 of 4</span>Check the package before AI processing</legend>
            <p className="wizard-intro">GrantDeskHQ runs these controls before it starts drafting, then runs a separate evidence-verification pass after compilation.</p>
            <div className="preflight-list">
              <Preflight label="Required source roles present" passed={requiredFilesComplete} detail={`${sourceFields.filter((field) => field.required && files[field.role]).length} of 5 required sources`} />
              <Preflight label="Package fits prototype limits" passed={totalBytes <= MAX_TOTAL_BYTES && Object.values(files).every((file) => (file?.size || 0) <= MAX_FILE_BYTES)} detail={`${formatBytes(totalBytes)} total · 1 MB maximum per file`} />
              <Preflight label="Independent evidence verification enabled" passed detail="A second pass challenges citations, mappings, calculations, and narrative claims." />
              <Preflight label="Unsupported output blocked from export" passed detail="Required review items must be resolved by a professional before package generation." />
            </div>
            <label className="acknowledgement">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              <span>I confirm these are synthetic or appropriately redacted test files and understand that a finance professional must review the output.</span>
            </label>
          </fieldset>

          <fieldset className="wizard-step" hidden={wizardStep !== 4}>
            <legend><span className="eyebrow">Step 4 of 4</span>Compile and verify the report draft</legend>
            <p className="wizard-intro">The compiler prepares the draft first. A separate verification pass then checks every requirement, mapping, and narrative statement against the source package.</p>
            <div className="compile-summary">
              <div><span>Organization</span><strong>{meta.organizationName}</strong></div>
              <div><span>Grant</span><strong>{meta.grantName}</strong></div>
              <div><span>Reporting period</span><strong>{meta.reportingPeriod}</strong></div>
              <div><span>Source package</span><strong>{Object.values(files).length} files · {formatBytes(totalBytes)}</strong></div>
            </div>
            <button className="button button-primary button-large mt-6 w-full" type="submit" disabled={compiling}>
              {compiling ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
              {compiling ? "Compiling and independently verifying…" : "Compile and verify report draft"}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">Nothing is submitted to a funder. Suggested mappings, calculations, and draft language require professional review.</p>
          </fieldset>

          {error && <div className="compiler-error" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span></div>}
          <div className="wizard-actions">
            <button type="button" className="button button-secondary" onClick={() => moveWizard(-1)} disabled={wizardStep === 1 || compiling}>Back</button>
            {wizardStep < 4 && <button type="button" className="button button-primary" onClick={() => moveWizard(1)}>Continue <ArrowRight aria-hidden="true" /></button>}
          </div>
        </form>
      </section>

      {result && <CompilerResults result={result} activeTab={activeTab} setActiveTab={setActiveTab} onResolve={resolveCheck} onDownload={download} />}
    </div>
  );
}

function CompilerResults({ result, activeTab, setActiveTab, onResolve, onDownload }: { result: CompilationResult; activeTab: ResultTab; setActiveTab(tab: ResultTab): void; onResolve(id: string): void; onDownload(): void }) {
  const unresolved = result.qualityChecks.filter((check) => check.required && check.status !== "passed").length
    + result.validation.findings.filter((finding) => finding.verdict !== "source_matched").length;
  const tabs: Array<[ResultTab, string]> = [["overview", "Overview"], ["requirements", "Requirements"], ["mapping", "Financial mapping"], ["narrative", "Narrative & evidence"], ["review", `Quality review (${unresolved})`]];
  return (
    <section id="compiler-results" tabIndex={-1} className="compiler-results">
      <div className="site-shell py-12 lg:py-16">
        <div className="compiler-result-heading">
          <div><p className="eyebrow">Compiled draft</p><h2>{result.reportTitle}</h2><p>{result.summary}</p></div>
          <div className={`review-count ${unresolved ? "needs-review" : "ready"}`}><strong>{unresolved}</strong><span>{unresolved === 1 ? "required item" : "required items"} to review</span></div>
        </div>
        <div className="result-tabs" role="tablist" aria-label="Compiled report sections">
          {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}>{label}</button>)}
        </div>
        <div className="result-panel">
          {activeTab === "overview" && <Overview result={result} />}
          {activeTab === "requirements" && <Requirements result={result} />}
          {activeTab === "mapping" && <Mappings result={result} />}
          {activeTab === "narrative" && <Narrative result={result} />}
          {activeTab === "review" && <Review result={result} onResolve={onResolve} onDownload={onDownload} />}
        </div>
      </div>
    </section>
  );
}

function Overview({ result }: { result: CompilationResult }) {
  return <div className="result-metric-grid">
    <ResultMetric label="Evidence coverage" value={result.validation.evidenceCoveragePercent} suffix="%" detail="Source-matched by verification pass" />
    <ResultMetric label="Funder requirements" value={result.requirements.length} detail={`${result.requirements.filter((item) => item.status === "verified").length} source-verified`} />
    <ResultMetric label="Transaction mappings" value={result.mappings.length} detail={`${result.mappings.filter((item) => item.status !== "verified").length} need review`} />
    <ResultMetric label="Missing inputs" value={result.missingInputs.filter((item) => item.status === "open").length} detail="Tailored follow-up questions" />
    <ResultMetric label="Blocked outputs" value={result.validation.blockedItems} detail="Held back for reviewer action" />
    <div className="validation-method col-span-full"><ShieldCheck aria-hidden="true" /><div><strong>Independent evidence verification</strong><p>{result.validation.method}</p></div></div>
    <div className="col-span-full mt-3 grid gap-3">
      {result.warnings.map((warning) => <div className="prototype-warning" key={warning}><ShieldCheck aria-hidden="true" />{warning}</div>)}
    </div>
  </div>;
}

function Requirements({ result }: { result: CompilationResult }) {
  return <div className="compiled-list">{result.requirements.map((item) => <article key={item.id}>
    <div className="compiled-list-main"><span className={`review-dot ${item.status}`} /><div><p className="eyebrow">{item.id} · {Math.round(item.confidence * 100)}% confidence</p><h3>{item.requirement}</h3></div></div>
    <Source reference={item.source} />
  </article>)}</div>;
}

function Mappings({ result }: { result: CompilationResult }) {
  return <div className="table-scroll"><table className="data-table prototype-mapping-table"><thead><tr><th>ID</th><th>Date</th><th>Description</th><th>Amount</th><th>Suggested category</th><th>Confidence</th><th>Evidence / rule</th><th>Status</th></tr></thead><tbody>{result.mappings.map((item) => <tr key={item.transactionId} className={item.status === "blocked" ? "row-unresolved" : ""}><th>{item.transactionId}</th><td>{item.date}</td><td>{item.description}</td><td>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.amount)}</td><td>{item.suggestedCategory}</td><td>{Math.round(item.confidence * 100)}%</td><td>{item.rationale}</td><td><ReviewLabel status={item.status} /></td></tr>)}</tbody></table></div>;
}

function Narrative({ result }: { result: CompilationResult }) {
  return <div className="compiled-list">{result.narrative.map((item) => <article key={item.id}>
    <div className="compiled-list-main"><ReviewLabel status={item.status} /><div><p className="eyebrow">{item.evidenceType.replaceAll("_", " ")}</p><h3 className={item.status === "blocked" ? "text-redBlocked-700 line-through" : ""}>{item.text}</h3></div></div>
    <Source reference={item.source} />
  </article>)}</div>;
}

function Review({ result, onResolve, onDownload }: { result: CompilationResult; onResolve(id: string): void; onDownload(): void }) {
  const ready = canGenerateReviewPackage(result);
  return <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
    <div className="grid gap-3">
      {result.validation.findings.filter((finding) => finding.verdict !== "source_matched").map((finding) => <article key={finding.id} className={`prototype-review-item ${finding.verdict}`}>
        <ShieldCheck aria-hidden="true" /><div><h3>{finding.itemId}: {finding.verdict === "blocked" ? "Source support not confirmed" : "Evidence needs review"}</h3><p>{finding.reason}</p><small>{finding.source.sourceName} · {finding.source.locator}</small></div><button type="button" className="button button-secondary button-small" onClick={() => onResolve(finding.id)}>Confirm after review</button>
      </article>)}
      {result.qualityChecks.map((check) => <article key={check.id} className={`prototype-review-item ${check.status}`}>
      {check.status === "passed" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
      <div><h3>{check.label}</h3><p>{check.detail}</p></div>
      {check.required && check.status !== "passed" && <button type="button" className="button button-secondary button-small" onClick={() => onResolve(check.id)}>Mark reviewed</button>}
    </article>)}</div>
    <aside className="review-package-card"><ClipboardCheck aria-hidden="true" /><h3>{ready ? "Review package ready" : "Complete the review gate"}</h3><p>{ready ? "Required checks are marked as reviewed. Download the structured draft and citation log for professional review." : "Resolve every required item before generating the package."}</p><button type="button" className="button button-primary mt-5 w-full" disabled={!ready} onClick={onDownload}><Download aria-hidden="true" />Generate review package</button></aside>
  </div>;
}

function Source({ reference }: { reference: { sourceName: string; locator: string; excerpt: string } }) {
  return <div className="compiled-source"><FileText aria-hidden="true" /><div><strong>{reference.sourceName} · {reference.locator}</strong><blockquote>“{reference.excerpt}”</blockquote></div></div>;
}

function ReviewLabel({ status }: { status: "verified" | "review" | "blocked" }) {
  return <span className={`status-badge ${status === "verified" ? "status-success" : status === "review" ? "status-review" : "status-blocked"}`}>{status}</span>;
}

function ResultMetric({ label, value, detail, suffix = "" }: { label: string; value: number; detail: string; suffix?: string }) {
  return <article className="result-metric"><span>{label}</span><strong>{value}{suffix}</strong><p>{detail}</p></article>;
}

function Preflight({ label, passed, detail }: { label: string; passed: boolean; detail: string }) {
  return <div className={`preflight-item ${passed ? "passed" : "failed"}`}>{passed ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}<div><strong>{label}</strong><p>{detail}</p></div></div>;
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div><label className="field-label" htmlFor={id}>{label}</label>{children}</div>;
}

async function fileToCompilerFile(role: SourceRole, file: File): Promise<CompilerFile> {
  return { role, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data: await readAsDataUrl(file) };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
