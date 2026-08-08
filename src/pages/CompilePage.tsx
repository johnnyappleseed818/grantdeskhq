import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UploadCloud
} from "lucide-react";
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, canGenerateReviewPackage, resultToDownload, validateCompilationRequest } from "../lib/prototype";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { CompilationRequest, CompilationResult, CompilerFile, PersistedCompilationResponse, SourceRole } from "../types/prototype";

const sourceFields: Array<{ role: SourceRole; label: string; help: string; accept: string; required: boolean }> = [
  { role: "awardAgreement", label: "Award agreement", help: "PDF, DOCX, or TXT", accept: ".pdf,.docx,.txt", required: true },
  { role: "approvedBudget", label: "Approved grant budget", help: "XLSX, CSV, or PDF", accept: ".xlsx,.csv,.pdf", required: true },
  { role: "ledgerExport", label: "General ledger export", help: "CSV or XLSX", accept: ".csv,.xlsx", required: true },
  { role: "funderTemplate", label: "Funder report template", help: "DOCX or PDF", accept: ".docx,.pdf", required: true },
  { role: "programUpdate", label: "Program update", help: "DOCX, PDF, or TXT", accept: ".docx,.pdf,.txt", required: true },
  { role: "supportingEvidence", label: "Supporting evidence", help: "Optional PDF, XLSX, CSV, or image", accept: ".pdf,.xlsx,.csv,.png,.jpg,.jpeg", required: false }
];

type ResultTab = "overview" | "requirements" | "mapping" | "narrative" | "review";

export function CompilePage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [meta, setMeta] = useState({
    organizationName: "Hope Community Services",
    grantName: "Pacific Youth Foundation — Youth Access Initiative",
    reportingPeriod: "January 1–June 30, 2026"
  });
  const [files, setFiles] = useState<Partial<Record<SourceRole, File>>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CompilationResult | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("overview");
  const [wizardStep, setWizardStep] = useState(1);
  const [reportId, setReportId] = useState("");

  const totalBytes = useMemo(() => Object.values(files).reduce((sum, file) => sum + (file?.size || 0), 0), [files]);
  const requiredFilesComplete = sourceFields.filter((field) => field.required).every((field) => files[field.role]);

  const updateFile = (role: SourceRole, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFiles((current) => ({ ...current, [role]: file }));
    setResult(null);
    setError("");
  };

  const uploadPackage = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;
    const { assigned, unmatched } = assignPackageFiles(selected, files);
    setFiles((current) => ({ ...current, ...assigned }));
    setResult(null);
    setWizardStep(2);
    setError(unmatched.length ? `${unmatched.map((file) => file.name).join(", ")} could not be assigned automatically. Add each file to the appropriate source box below.` : "");
    event.target.value = "";
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

    if (!user) {
      navigate("/login?next=/compile");
      return;
    }

    setCompiling(true);
    try {
      const body = await apiRequest<PersistedCompilationResponse>("/api/reports/compile", await token(), { method: "POST", body: JSON.stringify(payload) });
      setResult(body.result);
      setReportId(body.reportId);
      setActiveTab("overview");
      window.requestAnimationFrame(() => document.getElementById("compiler-results")?.focus());
    } catch (compileError) {
      setError(compileError instanceof Error ? compileError.message : "The report compiler could not complete this package.");
    } finally {
      setCompiling(false);
    }
  };

  const resolveCheck = (id: string) => setResult((current) => {
    if (!current) return current;
    const next = {
      ...current,
      qualityChecks: current.qualityChecks.map((check) => check.id === id ? { ...check, status: "passed" as const, detail: `${check.detail} Reviewed and confirmed by the signed-in user.` } : check),
      validation: {
        ...current.validation,
        findings: current.validation.findings.map((finding) => finding.id === id ? { ...finding, verdict: "source_matched" as const, reason: `${finding.reason} A professional reviewer confirmed this item.` } : finding)
      }
    };
    if (reportId && user) token().then((idToken) => apiRequest(`/api/reports/${reportId}/review`, idToken, { method: "PATCH", body: JSON.stringify({ itemId: id, result: next }) })).catch(() => setError("The review changed locally but could not be saved. Try again before leaving this page."));
    return next;
  });

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
            <div className="prototype-pill"><span aria-hidden="true" /> AI-assisted report preparation · professional review required</div>
            <p className="eyebrow mt-7">AI Report Compiler</p>
            <h1 className="page-title">Let AI do the first pass on your grant report.</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">Add the grant agreement, approved budget, accounting export, funder form, and program update. GrantDeskHQ organizes the funder's requirements, suggests financial mappings, prepares a source-linked draft, and flags anything your team still needs to confirm.</p>
            {user ? <p className="mt-4 text-sm font-semibold text-emerald-800">Signed in as {user.email}. Your report and review history will be saved.</p> : <p className="mt-4 text-sm text-slate-600"><Link className="font-semibold text-emerald-800 underline" to="/login?next=/compile">Create an account or sign in</Link> before compilation so the report can be saved securely.</p>}
          </div>
          <div className="compile-boundary">
            <LockKeyhole aria-hidden="true" />
            <div><strong>You control which files GrantDeskHQ analyzes.</strong><p>GrantDeskHQ uses only the files you select to prepare the draft and evidence review. No accounting integration is required, and every result is clearly marked for professional review.</p></div>
          </div>
        </div>
      </section>

      <section className="site-shell grid gap-8 py-10 lg:grid-cols-[.8fr_1.2fr] lg:py-14">
        <aside className="compile-guide">
          <p className="eyebrow">How GrantDeskHQ saves you time</p>
          {["Find every reporting requirement in the funder's documents", "Turn accounting rows into suggested grant-budget mappings", "Ask program staff only for information that is still missing", "Prepare narrative answers with the supporting sources attached", "Hold conflicting or unsupported content for professional review"].map((step, index) => (
            <div className="compile-guide-step" key={step}><span>{index + 1}</span><p>{step}</p></div>
          ))}
          <label className="button button-secondary mt-6 w-full cursor-pointer" htmlFor="package-upload">
            <UploadCloud aria-hidden="true" />Upload documentation for evaluation
          </label>
          <input id="package-upload" className="sr-only" type="file" multiple accept=".pdf,.docx,.txt,.xlsx,.csv,.png,.jpg,.jpeg" onChange={uploadPackage} />
        </aside>

        <form className="compile-form" onSubmit={submit}>
          <ol className="wizard-progress" aria-label="Getting started steps">
            {["Report", "Sources", "Check", "Draft"].map((label, index) => {
              const number = index + 1;
              return <li key={label} className={wizardStep === number ? "is-current" : wizardStep > number ? "is-complete" : ""}><button type="button" onClick={() => number < wizardStep && setWizardStep(number)} disabled={number > wizardStep} aria-current={wizardStep === number ? "step" : undefined}><span>{wizardStep > number ? <CheckCircle2 aria-hidden="true" /> : number}</span>{label}</button></li>;
            })}
          </ol>

          <fieldset className="wizard-step" hidden={wizardStep !== 1}>
            <legend><span className="eyebrow">Step 1 of 4</span>Choose the report</legend>
            <p className="wizard-intro">Tell GrantDeskHQ which grant and reporting period these files belong to.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organization" id="compiler-organization"><input id="compiler-organization" className="form-control" required value={meta.organizationName} onChange={(event) => setMeta({ ...meta, organizationName: event.target.value })} /></Field>
              <Field label="Grant or award" id="compiler-grant"><input id="compiler-grant" className="form-control" required value={meta.grantName} onChange={(event) => setMeta({ ...meta, grantName: event.target.value })} /></Field>
            </div>
            <Field label="Reporting period" id="compiler-period"><input id="compiler-period" className="form-control" required value={meta.reportingPeriod} onChange={(event) => setMeta({ ...meta, reportingPeriod: event.target.value })} /></Field>
          </fieldset>

          <fieldset className="wizard-step" hidden={wizardStep !== 2}>
            <legend><span className="eyebrow">Step 2 of 4</span>Add the files your team already has</legend>
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
            <legend><span className="eyebrow">Step 3 of 4</span>Review what the AI will use</legend>
            <p className="wizard-intro">GrantDeskHQ checks that the required files are present before drafting, then compares the material output with the source package.</p>
            <div className="preflight-list">
              <Preflight label="Required source roles present" passed={requiredFilesComplete} detail={`${sourceFields.filter((field) => field.required && files[field.role]).length} of 5 required sources`} />
              <Preflight label="Package fits file limits" passed={totalBytes <= MAX_TOTAL_BYTES && Object.values(files).every((file) => (file?.size || 0) <= MAX_FILE_BYTES)} detail={`${formatBytes(totalBytes)} total · 1 MB maximum per file`} />
              <Preflight label="Independent evidence verification enabled" passed detail="A second pass challenges citations, mappings, calculations, and narrative claims." />
              <Preflight label="Unsupported output blocked from export" passed detail="Required review items must be resolved by a professional before package generation." />
            </div>
            <label className="acknowledgement">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              <span>I confirm these are synthetic or appropriately redacted test files and understand that a finance professional must review the output.</span>
            </label>
          </fieldset>

          <fieldset className="wizard-step" hidden={wizardStep !== 4}>
            <legend><span className="eyebrow">Step 4 of 4</span>Create and check the report draft</legend>
            <p className="wizard-intro">AI prepares the first draft, then a separate evidence check compares each requirement, mapping, and material statement with the uploaded sources.</p>
            <div className="compile-summary">
              <div><span>Organization</span><strong>{meta.organizationName}</strong></div>
              <div><span>Grant</span><strong>{meta.grantName}</strong></div>
              <div><span>Reporting period</span><strong>{meta.reportingPeriod}</strong></div>
              <div><span>Source package</span><strong>{Object.values(files).length} files · {formatBytes(totalBytes)}</strong></div>
            </div>
            <button className="button button-primary button-large mt-6 w-full" type="submit" disabled={compiling}>
              {compiling ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
              {compiling ? "Preparing and checking the draft…" : "Create and verify report draft"}
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

      {reportId && <div className="site-shell"><div className="account-notice">Report saved to your private workspace. <Link className="underline" to="/workspace">View saved reports</Link></div></div>}
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

const roleHints: Array<[SourceRole, RegExp]> = [
  ["awardAgreement", /(award|agreement|grant[ _-]?agreement)/i],
  ["approvedBudget", /(approved[ _-]?budget|grant[ _-]?budget|budget)/i],
  ["ledgerExport", /(general[ _-]?ledger|ledger|gl[ _-]?export|transactions?)/i],
  ["funderTemplate", /(funder|report[ _-]?template|blank[ _-]?report|template)/i],
  ["programUpdate", /(program[ _-]?update|program[ _-]?report|narrative|outcomes?)/i],
  ["supportingEvidence", /(support|evidence|receipt|invoice|documentation)/i]
];

function assignPackageFiles(selected: File[], current: Partial<Record<SourceRole, File>>) {
  const assigned: Partial<Record<SourceRole, File>> = {};
  const occupied = new Set<SourceRole>(Object.keys(current) as SourceRole[]);
  const unmatched: File[] = [];

  for (const file of selected) {
    const hinted = roleHints.find(([role, pattern]) => pattern.test(file.name) && acceptsFile(role, file))?.[0];
    const role = hinted && !occupied.has(hinted)
      ? hinted
      : sourceFields.find((field) => !occupied.has(field.role) && acceptsFile(field.role, file))?.role;
    if (!role) {
      unmatched.push(file);
      continue;
    }
    assigned[role] = file;
    occupied.add(role);
  }

  return { assigned, unmatched };
}

function acceptsFile(role: SourceRole, file: File) {
  const field = sourceFields.find((candidate) => candidate.role === role);
  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  return Boolean(field?.accept.split(",").includes(extension));
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
