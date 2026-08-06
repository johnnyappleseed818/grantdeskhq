import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  FileSearch,
  FileText,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UploadCloud
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, validateReadinessRequest } from "../lib/prototype";
import type { ReadinessFile, ReadinessRequest, ReadinessResult, ReadinessSourceRole } from "../types/prototype";

const fields: Array<{ role: ReadinessSourceRole; label: string; help: string; accept: string; required: boolean }> = [
  { role: "awardAgreement", label: "Award agreement", help: "Required · PDF, DOCX, or TXT", accept: ".pdf,.docx,.txt", required: true },
  { role: "reportingRequirements", label: "Separate reporting instructions", help: "Optional · PDF, DOCX, or TXT", accept: ".pdf,.docx,.txt", required: false },
  { role: "approvedBudget", label: "Approved grant budget", help: "Optional · XLSX, CSV, or PDF", accept: ".xlsx,.csv,.pdf", required: false }
];

export function ReadinessPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [meta, setMeta] = useState({ organizationName: "", grantName: "" });
  const [files, setFiles] = useState<Partial<Record<ReadinessSourceRole, File>>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const totalBytes = useMemo(() => Object.values(files).reduce((sum, file) => sum + (file?.size || 0), 0), [files]);

  const updateFile = (role: ReadinessSourceRole, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFiles((current) => ({ ...current, [role]: file }));
    setResult(null);
    setError("");
  };

  const loadSyntheticSample = async () => {
    setLoadingSample(true);
    setError("");
    try {
      const [agreementResponse, budgetResponse] = await Promise.all([
        fetch("/samples/Synthetic_Grant_Agreement.pdf"),
        fetch("/samples/Approved_Grant_Budget.xlsx")
      ]);
      if (!agreementResponse.ok || !budgetResponse.ok) throw new Error("The synthetic sample files could not be loaded.");
      const [agreement, budget] = await Promise.all([agreementResponse.blob(), budgetResponse.blob()]);
      setFiles({
        awardAgreement: new File([agreement], "Synthetic_Grant_Agreement.pdf", { type: agreement.type }),
        approvedBudget: new File([budget], "Approved_Grant_Budget.xlsx", { type: budget.type })
      });
      setMeta({ organizationName: "Hope Community Services", grantName: "Pacific Youth Foundation — Youth Access Initiative" });
      setAcknowledged(true);
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : "The synthetic sample could not be loaded.");
    } finally { setLoadingSample(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setResult(null);
    const payloadFiles = await Promise.all((Object.entries(files) as Array<[ReadinessSourceRole, File]>).map(([role, file]) => toReadinessFile(role, file)));
    const payload: ReadinessRequest = { ...meta, files: payloadFiles };
    const errors = validateReadinessRequest(payload);
    if (!acknowledged) errors.push("Confirm that the files are synthetic or appropriately redacted test files.");
    if (errors.length) { setError(errors.join(" ")); return; }
    if (!user) { navigate("/login?next=/readiness"); return; }
    setLoading(true);
    try {
      const body = await apiRequest<ReadinessResult>("/api/readiness-assessment", await token(), { method: "POST", body: JSON.stringify(payload) });
      setResult(body);
      window.requestAnimationFrame(() => document.getElementById("readiness-results")?.focus());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The readiness audit could not be completed.");
    } finally { setLoading(false); }
  };

  return <div className="readiness-page">
    <section className="readiness-hero">
      <div className="site-shell grid items-start gap-10 py-12 lg:grid-cols-[1fr_.72fr] lg:py-16">
        <div><div className="prototype-pill"><span aria-hidden="true" /> Free readiness audit · professional review required</div><p className="eyebrow mt-7">Know what the grant will require</p><h1>Upload the agreement. Get a source-linked reporting plan.</h1><p>GrantDeskHQ identifies reporting obligations, deadlines, financial schedules, program metrics, and missing evidence from the award documents you already have—so your team can organize the work before the deadline pressure starts.</p><div className="mt-6 flex flex-wrap gap-3"><a className="button button-primary button-large" href="#readiness-form">Start the free audit <ArrowRight aria-hidden="true" /></a><button type="button" className="button button-secondary button-large" onClick={loadSyntheticSample} disabled={loadingSample}>{loadingSample ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <FileCheck2 aria-hidden="true" />}{loadingSample ? "Loading sample…" : "Use synthetic sample"}</button></div><p className="trust-line"><ShieldCheck aria-hidden="true" />AI-assisted extraction · independent evidence check · human approval required</p></div>
        <aside className="readiness-preview"><p className="eyebrow">Readiness report</p><h2>What you receive</h2>{[[CalendarClock, "Reporting dates and cadence"], [ListChecks, "Financial and program requirements"], [FileSearch, "Missing-evidence checklist"], [ShieldCheck, "Source citation for every extracted item"]].map(([Icon, label]) => { const Component = Icon as typeof CalendarClock; return <div key={String(label)}><Component aria-hidden="true" /><span>{String(label)}</span></div>; })}<p>No report is submitted. Unknown requirements remain clearly marked instead of being guessed.</p></aside>
      </div>
    </section>

    <section className="site-shell grid gap-8 py-10 lg:grid-cols-[.72fr_1.28fr] lg:py-14" id="readiness-form">
      <aside className="readiness-value"><LockKeyhole aria-hidden="true" /><h2>Start with the agreement—not another setup project.</h2><p>This free entry point is designed to be useful before you buy anything. It shows what the source documents actually require and where information is still missing.</p><ol><li><span>1</span>Add one award agreement</li><li><span>2</span>Optionally add the approved budget and separate instructions</li><li><span>3</span>Review the extracted plan and evidence coverage</li></ol></aside>
      <form className="compile-form" onSubmit={submit}>
        <div><p className="eyebrow">Free Grant Reporting Readiness Audit</p><h2 className="mt-2 text-2xl font-semibold text-navy-900">Prepare the source package</h2><p className="wizard-intro mt-2">Use synthetic or redacted historical files during this early validation stage. No accounting connection is required.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="readiness-organization" label="Organization"><input id="readiness-organization" className="form-control" required value={meta.organizationName} onChange={(event) => setMeta({ ...meta, organizationName: event.target.value })} /></Field>
          <Field id="readiness-grant" label="Grant or award"><input id="readiness-grant" className="form-control" required value={meta.grantName} onChange={(event) => setMeta({ ...meta, grantName: event.target.value })} /></Field>
        </div>
        <div className="source-upload-grid">{fields.map((field) => { const file = files[field.role]; return <label className={`source-upload ${file ? "has-file" : ""}`} htmlFor={`readiness-${field.role}`} key={field.role}><input id={`readiness-${field.role}`} type="file" accept={field.accept} required={field.required && !file} onChange={(event) => updateFile(field.role, event)} /><UploadCloud aria-hidden="true" /><span><strong>{field.label}{field.required ? " *" : ""}</strong><small>{file ? `${file.name} · ${formatBytes(file.size)}` : field.help}</small></span>{file && <CheckCircle2 className="upload-check" aria-hidden="true" />}</label>; })}</div>
        <div className="flex justify-between text-xs text-slate-500"><span>1 MB maximum per file</span><strong>{formatBytes(totalBytes)} / {formatBytes(MAX_TOTAL_BYTES)}</strong></div>
        <label className="acknowledgement"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I confirm these are synthetic or appropriately redacted test files and understand that the result is a draft requiring professional review.</span></label>
        {!user && <div className="form-note"><strong>A secure account is required before upload.</strong> Your file selections stay in the browser until you submit, then the page will ask you to sign in.</div>}
        <button type="submit" className="button button-primary button-large w-full" disabled={loading || totalBytes > MAX_TOTAL_BYTES || Object.values(files).some((file) => (file?.size || 0) > MAX_FILE_BYTES)}>{loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{loading ? "Extracting and independently verifying…" : "Create my readiness audit"}</button>
        {error && <div className="compiler-error" role="alert"><AlertTriangle aria-hidden="true" />{error}</div>}
        <p className="text-center text-xs leading-5 text-slate-500">The audit does not determine compliance and is not accounting, legal, or audit advice.</p>
      </form>
    </section>

    {result && <ReadinessResults result={result} />}
  </div>;
}

function ReadinessResults({ result }: { result: ReadinessResult }) {
  const blocked = result.validation.itemsNeedingReview + result.validation.blockedItems;
  return <section id="readiness-results" tabIndex={-1} className="readiness-results"><div className="site-shell py-12 lg:py-16"><div className="compiler-result-heading"><div><p className="eyebrow">AI-assisted draft · independently checked</p><h2>{result.title}</h2><p>{result.summary}</p></div><div className={`review-count ${blocked ? "needs-review" : "ready"}`}><strong>{blocked}</strong><span>items need professional review</span></div></div><div className="readiness-result-metrics"><article><CalendarClock aria-hidden="true" /><span>Next deadline</span><strong>{result.nextDeadline.date}</strong><p>{result.nextDeadline.label}</p></article><article><ListChecks aria-hidden="true" /><span>Reporting obligations</span><strong>{result.obligations.length}</strong><p>extracted from source files</p></article><article><FileText aria-hidden="true" /><span>Evidence gaps</span><strong>{result.evidenceGaps.filter((gap) => gap.status === "open").length}</strong><p>items to collect</p></article><article><ShieldCheck aria-hidden="true" /><span>Evidence coverage</span><strong>{result.validation.evidenceCoveragePercent}%</strong><p>source-matched by verification</p></article></div><div className="readiness-result-grid"><ResultList title="Reporting obligations" items={result.obligations} /><ResultList title="Financial requirements" items={result.financialRequirements} /><ResultList title="Program metrics" items={result.programMetrics} /><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Missing evidence</p><h3>{result.evidenceGaps.length} follow-up items</h3></div></div><div className="readiness-gap-list">{result.evidenceGaps.map((gap) => <article key={gap.id}><AlertTriangle aria-hidden="true" /><div><strong>{gap.item}</strong><p>{gap.reason}</p><small>Suggested owner: {gap.suggestedOwner}</small></div></article>)}</div></div></div><div className="validation-method mt-6"><ShieldCheck aria-hidden="true" /><div><strong>How the accuracy check works</strong><p>{result.validation.method}</p></div></div><div className="mt-6 flex flex-wrap gap-3"><Link to="/compile" className="button button-primary">Build the complete report workflow <ArrowRight aria-hidden="true" /></Link><Link to="/pricing" className="button button-secondary">View founding pricing</Link></div></div></section>;
}

function ResultList({ title, items }: { title: string; items: ReadinessResult["obligations"] }) {
  return <div className="panel"><div className="panel-heading"><div><p className="eyebrow">Source-linked extraction</p><h3>{title}</h3></div></div><div className="readiness-item-list">{items.map((item) => <article key={item.id} className={item.status}><div><span className={`status-badge ${item.status === "verified" ? "status-success" : item.status === "blocked" ? "status-blocked" : "status-review"}`}>{item.status}</span><strong>{item.label}</strong><p>{item.detail}</p></div><blockquote>“{item.source.excerpt}”<small>{item.source.sourceName} · {item.source.locator}</small></blockquote></article>)}</div></div>;
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div><label className="field-label" htmlFor={id}>{label}</label>{children}</div>;
}

async function toReadinessFile(role: ReadinessSourceRole, file: File): Promise<ReadinessFile> {
  return { role, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data: await readAsDataUrl(file) };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(`Could not read ${file.name}.`)); reader.readAsDataURL(file); });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
