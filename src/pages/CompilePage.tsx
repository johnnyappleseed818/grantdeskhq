import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
import { buildReportAttention, machineCheckCount } from "../lib/reportAttention";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { CompilationPreflightResult, CompilationRequest, CompilationResult, CompilerFile, GrantReportingPeriod, GrantWorkflowObligation, ObligationApplicability, PersistedCompilationResponse, ReviewState, SetupConflict, SetupDecision, SourceRole } from "../types/prototype";

const sourceFields: Array<{ role: SourceRole; label: string; help: string; accept: string; required: boolean }> = [
  { role: "awardAgreement", label: "Award agreement or Notice of Award", help: "PDF, DOCX, or TXT", accept: ".pdf,.docx,.txt", required: true },
  { role: "approvedBudget", label: "Approved grant budget", help: "Add now or later · XLSX, CSV, or PDF", accept: ".xlsx,.csv,.pdf", required: false },
  { role: "ledgerExport", label: "General ledger export", help: "Add now or later · CSV or XLSX", accept: ".csv,.xlsx", required: false },
  { role: "funderTemplate", label: "Funder report template", help: "Optional · DOCX or PDF", accept: ".docx,.pdf", required: false },
  { role: "programUpdate", label: "Program update", help: "Add now or later · DOCX, PDF, or TXT", accept: ".docx,.pdf,.txt", required: false },
  { role: "supportingEvidence", label: "Supporting evidence", help: "Add if required · PDF, XLSX, CSV, or image", accept: ".pdf,.xlsx,.csv,.png,.jpg,.jpeg", required: false }
];

type ResultTab = "overview" | "requirements" | "inputs" | "mapping" | "narrative" | "review";

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
  const [preflighting, setPreflighting] = useState(false);
  const [preflight, setPreflight] = useState<CompilationPreflightResult | null>(null);
  const [preflightKey, setPreflightKey] = useState("");
  const [setupDecisions, setSetupDecisions] = useState<SetupDecision[]>([]);
  const [setupNotice, setSetupNotice] = useState("");
  const [guideOpen, setGuideOpen] = useState(true);

  const totalBytes = useMemo(() => Object.values(files).reduce((sum, file) => sum + (file?.size || 0), 0), [files]);
  const requiredFilesComplete = sourceFields.filter((field) => field.required).every((field) => files[field.role]);

  const updateFile = (role: SourceRole, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFiles((current) => ({ ...current, [role]: file }));
    setResult(null);
    if (role === "awardAgreement") {
      setPreflight(null);
      setPreflightKey("");
      setSetupDecisions([]);
      setSetupNotice("");
    }
    setError("");
  };

  const updateMeta = (next: typeof meta) => {
    setMeta(next);
    setPreflight(null);
    setPreflightKey("");
    setSetupDecisions([]);
    setSetupNotice("");
  };

  const uploadPackage = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;
    const { assigned, unmatched } = assignPackageFiles(selected, files);
    setFiles((current) => ({ ...current, ...assigned }));
    setResult(null);
    if (assigned.awardAgreement) {
      setPreflight(null);
      setPreflightKey("");
      setSetupDecisions([]);
      setSetupNotice("");
    }
    setWizardStep(2);
    setError(unmatched.length ? `${unmatched.map((file) => file.name).join(", ")} could not be assigned automatically. Add each file to the appropriate source box below.` : "");
    event.target.value = "";
  };

  const moveWizard = async (direction: 1 | -1) => {
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
      setError("Add an award agreement or Notice of Award to continue. Everything else can be added later.");
      return;
    }
    if (wizardStep === 2 && (totalBytes > MAX_TOTAL_BYTES || Object.values(files).some((file) => (file?.size || 0) > MAX_FILE_BYTES))) {
      setError("Reduce the source package size before continuing.");
      return;
    }
    if (wizardStep === 2 && user && files.awardAgreement) {
      const key = `${meta.organizationName}|${meta.grantName}|${meta.reportingPeriod}|${files.awardAgreement.name}|${files.awardAgreement.size}|${files.awardAgreement.lastModified}`;
      let checked = preflightKey === key ? preflight : null;
      if (!checked) {
        setPreflighting(true);
        try {
          const response = await apiRequest<CompilationPreflightResult>("/api/reports/preflight", await token(), {
            method: "POST",
            body: JSON.stringify({ ...meta, file: await fileToCompilerFile("awardAgreement", files.awardAgreement) })
          });
          checked = {
            ...response,
            reportingPeriods: response.reportingPeriods || [],
            referencePeriodId: response.referencePeriodId || "",
            workflowObligations: response.workflowObligations || []
          };
          setPreflight(checked);
          setPreflightKey(key);
        } catch (preflightError) {
          setError(preflightError instanceof Error ? preflightError.message : "GrantDeskHQ could not check the award details.");
          return;
        } finally {
          setPreflighting(false);
        }
      }
      if (checked.setupConflicts.length) {
        setError("");
        return;
      }
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
    const payload: CompilationRequest = { ...meta, files: payloadFiles, setupDecisions };
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

  const resolveCheck = (id: string, resolution: "resolved" | "not_applicable" = "resolved") => setResult((current) => {
    if (!current) return current;
    const updated = {
      ...current,
      qualityChecks: current.qualityChecks.map((check) => check.id === id && check.status === "review" ? { ...check, status: "passed" as const, detail: `${check.detail} Reviewed and confirmed by the signed-in user.` } : check),
      validation: {
        ...current.validation,
        findings: current.validation.findings.map((finding) => finding.id === id && finding.verdict === "review" ? { ...finding, verdict: "source_matched" as const, reason: `${finding.reason} A professional reviewer confirmed this item.` } : finding)
      },
      programChecks: current.programChecks?.map((check) => `program-${check.id}` === id ? { ...check, resolution } : check)
    };
    const next = synchronizeClientResult(updated);
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

  const acceptAgreementDetails = () => {
    if (!preflight) return;
    const organizationName = usableProfileValue(preflight.grantProfile.granteeName);
    const values = [preflight.grantProfile.funderName.value, preflight.grantProfile.grantName.value]
      .filter((value) => value && !/^information required|unknown|not (found|stated)/i.test(value));
    const grantName = values.join(" — ");
    if (grantName || organizationName) {
      setMeta((current) => ({ ...current, ...(grantName ? { grantName } : {}), ...(organizationName ? { organizationName } : {}) }));
      setSetupNotice([organizationName ? `Organization updated to ${organizationName}.` : "", grantName ? `Grant updated to ${grantName}.` : ""].filter(Boolean).join(" "));
      setSetupDecisions((current) => [...current, {
        at: new Date().toISOString(),
        action: "agreement_details_applied",
        detail: [organizationName ? `Organization updated to ${organizationName}.` : "", grantName ? `Grant updated to ${grantName}.` : ""].filter(Boolean).join(" "),
        sourceName: files.awardAgreement?.name || "Award agreement",
        previousOrganizationName: meta.organizationName,
        previousGrantName: meta.grantName,
        previousReportingPeriod: meta.reportingPeriod
      }]);
    }
    setPreflight({ ...preflight, setupConflicts: preflight.setupConflicts.filter((conflict) => !["organization_identity", "grant_identity"].includes(conflict.type)) });
    setPreflightKey("");
    setError("");
  };

  const applySuggestedReportingPeriod = (conflict: SetupConflict) => {
    if (!preflight || !conflict.suggestedValue) return;
    const matchedPeriod = preflight.reportingPeriods.find((period) => period.id === conflict.suggestedPeriodId);
    if (matchedPeriod) {
      selectReportingPeriod(matchedPeriod);
      return;
    }
    setMeta((current) => ({ ...current, reportingPeriod: conflict.suggestedValue! }));
    const due = conflict.suggestedDueDate ? ` Report due ${conflict.suggestedDueDate}.` : "";
    const detail = `${conflict.suggestedLabel || "Reporting period"}: ${conflict.suggestedValue}.${due}`.replace("..", ".");
    setSetupNotice(`Reporting period updated. ${detail}`);
    setSetupDecisions((current) => [...current, {
      at: new Date().toISOString(),
      action: "reporting_period_applied",
      detail,
      sourceName: files.awardAgreement?.name || "Award agreement",
      previousGrantName: meta.grantName,
      previousReportingPeriod: meta.reportingPeriod
    }]);
    setPreflight({ ...preflight, setupConflicts: preflight.setupConflicts.filter((item) => item.id !== conflict.id) });
    setPreflightKey("");
    setError("");
  };

  const selectReportingPeriod = (period: GrantReportingPeriod) => {
    if (!preflight) return;
    const reportingPeriod = humanDateRange(period.startDate, period.endDate);
    const due = isUsableDate(period.dueDate) ? ` Report due ${humanDate(period.dueDate)}.` : "";
    setMeta((current) => ({ ...current, reportingPeriod }));
    setSetupNotice(`${period.title} selected: ${reportingPeriod}.${due}`.replace("..", "."));
    setSetupDecisions((current) => [...current, {
      at: new Date().toISOString(),
      action: "reporting_period_applied",
      detail: `${period.title}: ${reportingPeriod}.${due}`.replace("..", "."),
      sourceName: files.awardAgreement?.name || "Award agreement",
      previousGrantName: meta.grantName,
      previousReportingPeriod: meta.reportingPeriod,
      selectedObligationId: period.id
    }]);
    setPreflight({
      ...preflight,
      referencePeriodId: period.id,
      workflowObligations: period.id === preflight.referencePeriodId ? preflight.workflowObligations : [],
      setupConflicts: preflight.setupConflicts.filter((item) => item.type !== "reporting_period")
    });
    setPreflightKey("");
    setError("");
  };

  const applyAgreementWorkflow = () => {
    if (!preflight) return;
    const setup = agreementSetup(preflight);
    if (!setup.grantName) return;
    const nextPeriod = setup.period ? humanDateRange(setup.period.startDate, setup.period.endDate) : meta.reportingPeriod;
    const previousOrganizationName = meta.organizationName;
    const previousGrantName = meta.grantName;
    const previousReportingPeriod = meta.reportingPeriod;
    setMeta((current) => ({ ...current, organizationName: setup.organizationName || current.organizationName, grantName: setup.grantName, reportingPeriod: nextPeriod }));
    const reportDetail = setup.period
      ? `${setup.period.title}, ${nextPeriod}${isUsableDate(setup.period.dueDate) ? `, due ${humanDate(setup.period.dueDate)}` : ""}`
      : nextPeriod;
    setSetupNotice(setup.period
      ? `Organization, grant, and report configured from the agreement: ${setup.organizationName || meta.organizationName} · ${setup.grantName} · ${reportDetail}.`
      : `Organization and grant details updated from the agreement: ${setup.organizationName || meta.organizationName} · ${setup.grantName}. Choose a reporting period to finish the setup.`);
    setSetupDecisions((current) => [...current, {
      at: new Date().toISOString(),
      action: "agreement_workflow_applied",
      detail: `Changed organization from “${previousOrganizationName}” to “${setup.organizationName || previousOrganizationName}”, grant from “${previousGrantName}” to “${setup.grantName}”, and reporting period from “${previousReportingPeriod}” to “${reportDetail}”.`,
      sourceName: files.awardAgreement?.name || "Award agreement",
      previousOrganizationName,
      previousGrantName,
      previousReportingPeriod,
      selectedObligationId: setup.period?.id
    }]);
    setPreflight({
      ...preflight,
      referencePeriodId: setup.period?.id || preflight.referencePeriodId,
      setupConflicts: preflight.setupConflicts.filter((conflict) => conflict.type === "reporting_period" && !setup.period)
    });
    setPreflightKey("");
    setError("");
    window.requestAnimationFrame(() => document.getElementById("report-workflow-title")?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  const replaceAwardAgreement = () => {
    setFiles((current) => {
      const next = { ...current };
      delete next.awardAgreement;
      return next;
    });
    setPreflight(null);
    setPreflightKey("");
    setSetupDecisions([]);
    setSetupNotice("");
    setError("");
    setWizardStep(2);
  };

  const returnToSetup = (fieldId: string) => {
    setError("");
    setWizardStep(1);
    window.requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
  };

  const returnToSources = () => {
    setError("");
    setWizardStep(2);
    window.requestAnimationFrame(() => document.querySelector(".compile-form")?.scrollIntoView({ block: "start" }));
  };

  return (
    <div className="compile-page">
      <section className="compile-hero">
        <div className="site-shell grid items-start gap-10 py-12 lg:grid-cols-[1fr_.78fr] lg:py-16">
          <div>
            <div className="prototype-pill"><span aria-hidden="true" /> AI-powered report preparation · professional review required</div>
            <p className="eyebrow mt-7">Your next funder report</p>
            <h1 className="page-title">Bring what you have. We’ll help with the rest.</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">Upload the grant documents and reporting data already available to you. GrantDeskHQ organizes the funder’s requirements, shows what’s still missing, helps coordinate the remaining inputs across your team, and prepares a source-linked draft as the report comes together.</p>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">You don’t need every document upfront. Add more information as it becomes available.</p>
            {user ? <p className="mt-4 text-sm font-semibold text-emerald-800">Signed in as {user.email}. Your report and review history will be saved.</p> : <p className="mt-4 text-sm text-slate-600"><Link className="font-semibold text-emerald-800 underline" to="/login?next=/compile">Create an account or sign in</Link> before compilation so the report can be saved securely.</p>}
          </div>
          <div className="compile-boundary">
            <LockKeyhole aria-hidden="true" />
            <div><strong>You control which files GrantDeskHQ analyzes.</strong><p>GrantDeskHQ uses only the files you select to prepare the draft and evidence review. No accounting integration is required, and every result is clearly marked for professional review.</p></div>
          </div>
        </div>
      </section>

      <section className={`site-shell compile-layout ${guideOpen ? "" : "guide-collapsed"}`}>
        <aside className={`compile-guide ${guideOpen ? "" : "is-collapsed"}`}>
          <button type="button" className="compile-guide-toggle" aria-expanded={guideOpen} onClick={() => setGuideOpen((open) => !open)}>
            {guideOpen ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}{guideOpen ? "Hide guide" : "Show guide"}
          </button>
          {guideOpen && <div className="compile-guide-content">
            <p className="eyebrow">How GrantDeskHQ saves you time</p>
            {["Find every reporting requirement in the funder's documents", "Turn accounting rows into suggested grant-budget mappings", "Ask program staff only for information that is still missing", "Prepare narrative answers with the supporting sources attached", "Hold conflicting or unsupported content for professional review"].map((step, index) => (
              <div className="compile-guide-step" key={step}><span>{index + 1}</span><p>{step}</p></div>
            ))}
            <label className="button button-secondary mt-6 w-full cursor-pointer" htmlFor="package-upload">
              <UploadCloud aria-hidden="true" />Upload documentation for evaluation
            </label>
          </div>}
          <input id="package-upload" className="sr-only" type="file" multiple accept=".pdf,.docx,.txt,.xlsx,.csv,.png,.jpg,.jpeg" onChange={uploadPackage} />
        </aside>

        <form className="compile-form" onSubmit={submit}>
          <ol className="wizard-progress" aria-label="Getting started steps">
            {["Report", "Sources", "Review", "Draft"].map((label, index) => {
              const number = index + 1;
              return <li key={label} className={wizardStep === number ? "is-current" : wizardStep > number ? "is-complete" : ""}><button type="button" onClick={() => number < wizardStep && setWizardStep(number)} disabled={number > wizardStep} aria-current={wizardStep === number ? "step" : undefined}><span>{wizardStep > number ? <CheckCircle2 aria-hidden="true" /> : number}</span>{label}</button></li>;
            })}
          </ol>

          <fieldset className="wizard-step" hidden={wizardStep !== 1}>
            <legend><span className="eyebrow">Step 1 of 4</span>Choose the report</legend>
            <p className="wizard-intro">Tell GrantDeskHQ which grant and reporting period these files belong to.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organization" id="compiler-organization"><input id="compiler-organization" className="form-control" required value={meta.organizationName} onChange={(event) => updateMeta({ ...meta, organizationName: event.target.value })} /></Field>
              <Field label="Grant or award" id="compiler-grant"><input id="compiler-grant" className="form-control" required value={meta.grantName} onChange={(event) => updateMeta({ ...meta, grantName: event.target.value })} /></Field>
            </div>
            <Field label="Reporting period" id="compiler-period"><input id="compiler-period" className="form-control" required value={meta.reportingPeriod} onChange={(event) => updateMeta({ ...meta, reportingPeriod: event.target.value })} /></Field>
          </fieldset>

          <fieldset className="wizard-step" hidden={wizardStep !== 2}>
            <legend><span className="eyebrow">Step 2 of 4</span>Add the files your team already has</legend>
            <div className="wizard-intro flex items-center justify-between gap-4"><span>Only an award agreement or Notice of Award is needed to start. Add everything else now or later. No accounting connection is needed.</span><strong>{formatBytes(totalBytes)} / 2.5 MB</strong></div>
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
            {preflighting && <div className="setup-checking" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" /><div><strong>Checking the award details</strong><p>GrantDeskHQ is comparing the funder, grant, and reporting period before drafting begins.</p></div></div>}
            {setupNotice && <div className="setup-notice" role="status"><CheckCircle2 aria-hidden="true" /><div><strong>Report setup updated</strong><p>{setupNotice}</p></div></div>}
            {preflight && preflight.setupConflicts.length > 0 && <AgreementSetupCard preflight={preflight} onApply={applyAgreementWorkflow} />}
            {preflight && preflight.setupConflicts.length > 0 && (
              <section className="setup-conflict-panel" aria-labelledby="setup-conflict-title">
                <div><p className="eyebrow">Action required</p><h3 id="setup-conflict-title">We found {preflight.setupConflicts.length} {preflight.setupConflicts.length === 1 ? "conflict" : "conflicts"} with your report setup</h3></div>
                {preflight.setupConflicts.map((conflict) => (
                  <article key={conflict.id} className="setup-conflict-card">
                    <AlertTriangle aria-hidden="true" />
                    <div>
                      <ReviewLabel status="blocked" />
                      <h4>{conflict.title}</h4>
                      <p>{conflict.detail}</p>
                      <small className="setup-source-label">Source: Award agreement · {cleanSourceLocator(conflict.source.locator)}</small>
                      {conflict.type === "reporting_period" && conflict.suggestedValue && (
                        <div className="setup-period-suggestion">
                          <span>Recommended from the award agreement</span>
                          <strong>{conflict.suggestedLabel || "First reporting period"}</strong>
                          <p>{conflict.suggestedValue}{conflict.suggestedDueDate ? ` · Report due ${conflict.suggestedDueDate}` : ""}</p>
                        </div>
                      )}
                    </div>
                    <div className="setup-conflict-actions">
                      {["organization_identity", "grant_identity"].includes(conflict.type) && <button type="button" className="button button-primary button-small" onClick={acceptAgreementDetails}>Use agreement details</button>}
                      {["organization_identity", "grant_identity"].includes(conflict.type) && <button type="button" className="button button-secondary button-small" onClick={replaceAwardAgreement}>Replace agreement</button>}
                      {conflict.type === "reporting_period" && conflict.suggestedValue && <button type="button" className="button button-primary button-small" onClick={() => applySuggestedReportingPeriod(conflict)}>Use first reporting period</button>}
                      <button type="button" className="button button-secondary button-small" onClick={() => returnToSetup(conflict.type === "reporting_period" ? "compiler-period" : conflict.type === "organization_identity" ? "compiler-org" : "compiler-grant")}>{conflict.type === "reporting_period" ? "Choose another period" : "Edit report setup"}</button>
                    </div>
                  </article>
                ))}
              </section>
            )}
            {preflight && preflight.setupConflicts.length === 0 && <div className="setup-match"><CheckCircle2 aria-hidden="true" /><div><strong>Award details match this report setup</strong><p>GrantDeskHQ checked the grant identity and reporting period before moving forward.</p></div></div>}
            {preflight && preflight.reportingPeriods.some((period) => period.status === "verified") && <ReportingSchedule periods={preflight.reportingPeriods} selectedPeriodId={preflight.referencePeriodId} onSelect={selectReportingPeriod} />}
            {preflight && preflight.workflowObligations.length > 0 && <ReportWorkflow obligations={preflight.workflowObligations} referencePeriod={preflight.reportingPeriods.find((period) => period.id === preflight.referencePeriodId)} />}
          </fieldset>

          <fieldset className="wizard-step" hidden={wizardStep !== 3}>
            <legend><span className="eyebrow">Step 3 of 4</span>Review the information used for your draft</legend>
            <p className="wizard-intro">GrantDeskHQ starts with the available sources, identifies missing inputs, and compares the material output with the source package.</p>
            <div className="preflight-list">
              <Preflight label="Award document present" passed={requiredFilesComplete} detail={`${sourceFields.filter((field) => field.required && files[field.role]).length} of ${sourceFields.filter((field) => field.required).length} required to start`} />
              <Preflight label="Package fits file limits" passed={totalBytes <= MAX_TOTAL_BYTES && Object.values(files).every((file) => (file?.size || 0) <= MAX_FILE_BYTES)} detail={`${formatBytes(totalBytes)} total · 1 MB maximum per file`} />
              <Preflight label="Source checks ready" passed detail="Every important item is checked against the uploaded sources before it can be marked verified." />
              <Preflight label="Unsupported output blocked from export" passed detail="Required review items must be resolved by a professional before package generation." />
            </div>
            <label className="acknowledgement">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              <span>I confirm these are synthetic or appropriately redacted test files and understand that a finance professional must review the output.</span>
            </label>
          </fieldset>

          <fieldset className="wizard-step" hidden={wizardStep !== 4}>
            <legend><span className="eyebrow">Step 4 of 4</span>Create and check the report draft</legend>
            <p className="wizard-intro">Our AI-powered solution prepares the first draft, then GrantDeskHQ compares each requirement, mapping, and important statement with the uploaded sources.</p>
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
            {wizardStep === 2 && preflight && preflight.setupConflicts.length > 0 && <p className="wizard-blocker-note">Resolve the {preflight.setupConflicts.length} setup {preflight.setupConflicts.length === 1 ? "conflict" : "conflicts"} to continue.</p>}
            {wizardStep < 4 && <button type="button" className="button button-primary" onClick={() => moveWizard(1)} disabled={preflighting || (wizardStep === 2 && Boolean(preflight?.setupConflicts.length))}>{preflighting ? "Checking award…" : "Continue"} {!preflighting && <ArrowRight aria-hidden="true" />}</button>}
          </div>
        </form>
      </section>

      {reportId && <div className="site-shell"><div className="account-notice">Report saved to your private workspace. <Link className="underline" to="/workspace">View saved reports</Link></div></div>}
      {result && <CompilerResults result={result} activeTab={activeTab} setActiveTab={setActiveTab} onResolve={resolveCheck} onDownload={download} onEditSetup={() => returnToSetup("compiler-grant")} onAddSources={returnToSources} />}
    </div>
  );
}

export function CompilerResults({ result, activeTab, setActiveTab, onResolve, onDownload, onEditSetup, onAddSources }: { result: CompilationResult; activeTab: ResultTab; setActiveTab(tab: ResultTab): void; onResolve(id: string, resolution?: "resolved" | "not_applicable"): void; onDownload(): void; onEditSetup(): void; onAddSources(): void }) {
  const actions = buildReportAttention(result).length;
  const hasLedger = result.inputStatus.some((item) => item.role === "ledgerExport" && item.available);
  const tabs: Array<[ResultTab, string]> = [
    ["overview", "Overview"],
    ["requirements", "Requirements"],
    ["inputs", "Inputs"],
    ["mapping", hasLedger ? "Financial mapping" : "Financial mapping · add data"],
    ["narrative", "Draft & evidence"],
    ["review", `Review & approval · ${actions}`]
  ];
  return (
    <section id="compiler-results" tabIndex={-1} className="compiler-results">
      <div className="site-shell py-12 lg:py-16">
        <div className="compiler-result-heading">
          <div><p className="eyebrow">{result.workflow.readiness === "ready_for_review" ? "Draft ready for review" : "Preparing report"}</p><h2>{displayReportTitle(result)}</h2><p>{result.summary}</p></div>
          <div className={`review-count ${actions ? "needs-review" : "ready"}`}><strong>{actions}</strong><span>{actions === 1 ? "thing needs" : "things need"} your attention</span></div>
        </div>
        <div className="result-tabs" role="tablist" aria-label="Compiled report sections">
          {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}>{label}</button>)}
        </div>
        <div className="result-panel">
          {activeTab === "overview" && <Overview result={result} onEditSetup={onEditSetup} />}
          {activeTab === "requirements" && <Requirements result={result} />}
          {activeTab === "inputs" && <Inputs result={result} onAddSources={onAddSources} onResolve={onResolve} />}
          {activeTab === "mapping" && <Mappings result={result} onAddSources={onAddSources} />}
          {activeTab === "narrative" && <Narrative result={result} onAddSources={onAddSources} />}
          {activeTab === "review" && <Review result={result} onResolve={onResolve} onDownload={onDownload} onEditSetup={onEditSetup} onAddSources={onAddSources} />}
        </div>
      </div>
    </section>
  );
}

function Overview({ result, onEditSetup }: { result: CompilationResult; onEditSetup(): void }) {
  const requiredInputs = result.inputStatus.filter((item) => item.requiredForCompletion);
  const availableInputs = requiredInputs.filter((item) => item.available).length;
  const verifiedRequirements = result.requirements.filter((item) => item.status === "verified").length;
  const attention = buildReportAttention(result);
  const readinessLabel = result.workflow.readiness === "not_ready" ? "Not ready" : result.workflow.readiness === "needs_review" ? "Needs review" : "Ready for review";
  return <div className="result-metric-grid">
    <TextResultMetric label="Report readiness" value={readinessLabel} detail={result.workflow.readiness === "not_ready" ? "Complete the items below before export." : "Professional review and approval are still required."} />
    <TextResultMetric label="Award requirements" value={`${verifiedRequirements} of ${result.requirements.length}`} detail="Verified against the uploaded award documents" />
    <TextResultMetric label="Required inputs" value={`${availableInputs} of ${requiredInputs.length}`} detail="Available for this reporting period" />
    <ResultMetric label="Your actions" value={attention.length} detail="Grouped decisions—not every check the system performed" />
    <div className="attention-summary col-span-full"><div><p className="eyebrow">Less work for your team</p><h3>GrantDeskHQ ran {machineCheckCount(result)} checks. You only need to review {attention.length} {attention.length === 1 ? "thing" : "things"}.</h3></div><div className="attention-summary-list">{attention.map((item) => <article key={item.id}><CheckCircle2 aria-hidden="true" /><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div></div>
    {result.setupConflicts.length > 0 && <div className="setup-conflict-summary col-span-full"><AlertTriangle aria-hidden="true" /><div><strong>{result.setupConflicts.length} setup {result.setupConflicts.length === 1 ? "conflict" : "conflicts"} must be corrected</strong><p>{result.setupConflicts.map((item) => item.title).join(" · ")}</p></div><button type="button" className="button button-primary button-small" onClick={onEditSetup}>Fix report setup</button></div>}
    <div className="validation-method col-span-full"><ShieldCheck aria-hidden="true" /><div><strong>Source verification: {result.validation.evidenceCoveragePercent}% of checked claims matched</strong><p>{result.validation.method}</p></div></div>
    <div className="col-span-full mt-3 grid gap-3">
      {result.warnings.map((warning) => <div className="prototype-warning" key={warning}><ShieldCheck aria-hidden="true" />{warning}</div>)}
    </div>
  </div>;
}

function Requirements({ result }: { result: CompilationResult }) {
  return <div className="compiled-list">{result.requirements.map((item) => <article key={item.id}>
    <div className="compiled-list-main"><ReviewLabel status={item.status} /><div><p className="eyebrow">{Math.round(item.confidence * 100)}% extraction confidence</p><h3>{item.requirement}</h3></div></div>
    <Source reference={item.source} />
  </article>)}</div>;
}

function Inputs({ result, onAddSources, onResolve }: { result: CompilationResult; onAddSources(): void; onResolve(id: string, resolution?: "resolved" | "not_applicable"): void }) {
  return <div className="input-status-list">
    <div className="input-request-card">
      <div><p className="eyebrow">Start with what you have</p><h3>GrantDeskHQ shows exactly what is still needed</h3><p>Add the remaining information as it becomes available. Missing inputs stay visible and cannot be mistaken for completed work.</p></div>
      <button type="button" className="button button-primary button-small" onClick={onAddSources}>Add report inputs</button>
    </div>
    <ProgramChecks checks={result.programChecks || []} onAddSources={onAddSources} onResolve={onResolve} />
    {result.inputStatus.map((item) => <article key={item.role} className={`input-status-card ${item.available ? "is-available" : "is-missing"}`}>
      {item.available ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
      <div><div className="input-status-heading"><h3>{item.label}</h3><ReviewLabel status={item.available ? "verified" : "not_evaluated"} /></div><p>{item.detail}</p>{!item.available && item.requiredForCompletion && <small>Needed before the report can be prepared for approval.</small>}</div>
      {!item.available && <button type="button" className="button button-secondary button-small" onClick={onAddSources}>{item.actionLabel}</button>}
    </article>)}
  </div>;
}

function ProgramChecks({ checks, onAddSources, onResolve }: { checks: NonNullable<CompilationResult["programChecks"]>; onAddSources(): void; onResolve(id: string, resolution?: "resolved" | "not_applicable"): void }) {
  if (!checks.length) return null;
  const kpis = checks.filter((item) => item.type === "kpi_result");
  const availableKpis = kpis.filter((item) => item.severity === "info" && item.status === "verified").length;
  const ordered = [...checks].sort((left, right) => programPriority(left.severity) - programPriority(right.severity));
  return <section className="program-checks" aria-labelledby="program-checks-title">
    <div className="program-checks-heading"><div><p className="eyebrow">Award + program update checks</p><h3 id="program-checks-title">Program results and triggered obligations</h3><p>{kpis.length ? `Results available for ${availableKpis} of ${kpis.length} required program metrics.` : "GrantDeskHQ compared the program update with the award's reporting rules."}</p></div><span>{checks.filter((item) => item.resolution === "open" && item.severity !== "info").length} open</span></div>
    <div className="program-check-list">{ordered.map((check) => <article key={check.id} className={`program-check ${check.severity} ${check.resolution !== "open" ? "is-resolved" : ""}`}>
      {check.severity === "info" || check.resolution !== "open" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
      <div><div className="program-check-label"><MappingStateBadge label={programSeverityLabel(check)} tone={check.resolution !== "open" || check.severity === "info" ? "success" : check.severity === "action_required" ? "blocked" : "review"} /><span>Owner: {check.owner}</span></div><h4>{check.title}</h4><p>{check.detail}</p>{check.severity !== "info" && <p className="program-next-step"><strong>Next step:</strong> {check.action}</p>}<small>{check.sources.map((source) => `${source.sourceName} · ${source.locator}`).join(" · ")}</small></div>
      {check.resolution === "open" && check.severity !== "info" && <div className="program-check-actions">
        {check.type === "kpi_result" ? <button type="button" className="button button-primary button-small" onClick={onAddSources}>Add information</button> : <button type="button" className="button button-primary button-small" onClick={() => onResolve(`program-${check.id}`)}>Mark addressed</button>}
        {check.type === "award_trigger" && <button type="button" className="button button-secondary button-small" onClick={() => onResolve(`program-${check.id}`, "not_applicable")}>Not applicable</button>}
      </div>}
    </article>)}</div>
  </section>;
}

function programPriority(value: NonNullable<CompilationResult["programChecks"]>[number]["severity"]) { return value === "action_required" ? 0 : value === "review" ? 1 : 2; }
function programSeverityLabel(check: NonNullable<CompilationResult["programChecks"]>[number]) {
  if (check.resolution === "resolved") return "Addressed";
  if (check.resolution === "not_applicable") return "Not applicable";
  return check.severity === "action_required" ? "Action required" : check.severity === "review" ? "Needs review" : "Information";
}

function Mappings({ result, onAddSources }: { result: CompilationResult; onAddSources(): void }) {
  const hasLedger = result.inputStatus.some((item) => item.role === "ledgerExport" && item.available);
  if (!hasLedger) return <EmptyResultState title="Accounting data is still needed" detail="Add a general-ledger export when it is available. GrantDeskHQ will then suggest grant-budget mappings and calculate the financial schedule from those source rows." action="Add accounting data" onAction={onAddSources} />;
  if (!result.mappings.length) return <EmptyResultState title="No transaction mappings are available yet" detail="GrantDeskHQ could not produce usable mapping suggestions from the current accounting file. Review the file format or add a different export." action="Review accounting data" onAction={onAddSources} />;
  const analysis = result.financialAnalysis;
  const automaticallyMapped = result.mappings.filter((item) => item.mappingConfidence === "high" && !["provisional", "excluded_duplicate", "excluded_outside_period", "excluded_grant_period"].includes(item.reportTreatment || "")).length;
  const categoryReviews = result.mappings.filter((item) => item.reportTreatment === "needs_category_review").length;
  const duplicates = result.mappings.filter((item) => item.reportTreatment === "excluded_duplicate").length;
  const dateExclusions = result.mappings.filter((item) => ["excluded_outside_period", "excluded_grant_period"].includes(item.reportTreatment || "")).length;
  const approvalEvidence = analysis?.controls.find((control) => control.id === "assistance-approvals" && control.requiresAction)?.transactionIds.length || 0;
  const groupedExceptions = categoryReviews + (duplicates ? 1 : 0) + (analysis?.controls.filter((control) => control.requiresAction).length || 0);
  return <div className="grid gap-5">
    <section className="financial-ingestion-summary" aria-labelledby="financial-ingestion-title">
      <div className="financial-ingestion-heading"><div><p className="eyebrow">Ledger review completed</p><h3 id="financial-ingestion-title">{analysis?.ledgerTransactionCount || result.mappings.length} ledger rows analyzed</h3><p>GrantDeskHQ mapped the routine rows automatically and brought forward only the exceptions that need judgment.</p></div><span>{groupedExceptions} grouped {groupedExceptions === 1 ? "exception" : "exceptions"} to review</span></div>
      <dl>
        <div><dt>Mapped automatically</dt><dd>{automaticallyMapped}</dd></div>
        <div><dt>Category decisions</dt><dd>{categoryReviews}</dd></div>
        <div><dt>Duplicate rows</dt><dd>{duplicates}</dd></div>
        <div><dt>Excluded by date</dt><dd>{dateExclusions}</dd></div>
        <div><dt>Approval evidence</dt><dd>{approvalEvidence}</dd></div>
      </dl>
    </section>
    <div className="financial-trust-note"><ShieldCheck aria-hidden="true" /><p><strong>Financial totals are calculated directly from your uploaded ledger.</strong> Our AI-powered solution may suggest transaction mappings and explanations, but it never invents transaction amounts.</p></div>
    <FinancialControls result={result} />
    <div className="table-scroll"><table className="data-table prototype-mapping-table"><thead><tr><th>ID</th><th>Date</th><th>Description</th><th>Amount</th><th>Mapping</th><th>Evidence / compliance</th><th>Report treatment</th></tr></thead><tbody>{result.mappings.map((item, index) => <tr key={`${item.transactionId}-${index}`} className={item.mappingConfidence === "unmapped" ? "row-unresolved" : ""}>
      <th>{item.transactionId}</th><td>{item.date}</td><td>{item.description}</td><td>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.amount)}</td>
      <td><strong className="mapping-category">{item.suggestedCategory || "No category selected"}</strong><MappingBadge value={item.mappingConfidence || (item.status === "verified" ? "high" : item.status === "blocked" ? "unmapped" : "review")} /></td>
      <td><MappingStateBadge label={complianceLabel(item.complianceStatus)} tone={complianceTone(item.complianceStatus)} /><p className="mapping-cell-detail">{item.complianceDetail || item.rationale}</p></td>
      <td><MappingStateBadge label={treatmentLabel(item.reportTreatment)} tone={treatmentTone(item.reportTreatment)} /></td>
    </tr>)}</tbody></table></div>
  </div>;
}

function MappingBadge({ value }: { value: NonNullable<CompilationResult["mappings"][number]["mappingConfidence"]> }) {
  const label = value === "high" ? "High confidence" : value === "unmapped" ? "Unmapped" : "Needs review";
  const tone = value === "high" ? "success" : value === "unmapped" ? "blocked" : "review";
  return <MappingStateBadge label={label} tone={tone} />;
}

function MappingStateBadge({ label, tone }: { label: string; tone: "success" | "review" | "blocked" | "neutral" }) {
  return <span className={`mapping-state mapping-state-${tone}`}>{label}</span>;
}

function complianceLabel(value: CompilationResult["mappings"][number]["complianceStatus"]) {
  if (value === "evidence_required") return "Evidence needed";
  if (value === "eligibility_review") return "Eligibility review";
  if (value === "duplicate") return "Duplicate";
  if (value === "not_applicable") return "Not applicable";
  return "No issue";
}

function complianceTone(value: CompilationResult["mappings"][number]["complianceStatus"]): "success" | "review" | "blocked" | "neutral" {
  if (value === "evidence_required" || value === "eligibility_review" || value === "duplicate") return "review";
  if (value === "not_applicable") return "neutral";
  return "success";
}

function treatmentLabel(value: CompilationResult["mappings"][number]["reportTreatment"]) {
  if (value === "pending_evidence") return "Pending evidence";
  if (value === "provisional") return "Provisional";
  if (value === "excluded_duplicate") return "Excluded — duplicate";
  if (value === "excluded_outside_period") return "Excluded — outside report period";
  if (value === "excluded_grant_period") return "Excluded — outside grant period";
  if (value === "needs_category_review") return "Needs category review";
  return "Included";
}

function treatmentTone(value: CompilationResult["mappings"][number]["reportTreatment"]): "success" | "review" | "blocked" | "neutral" {
  if (value === "needs_category_review") return "blocked";
  if (value === "pending_evidence" || value === "provisional" || value === "excluded_duplicate") return "review";
  if (value === "excluded_outside_period" || value === "excluded_grant_period") return "neutral";
  return "success";
}

function FinancialControls({ result }: { result: CompilationResult }) {
  const analysis = result.financialAnalysis;
  if (!analysis) return null;
  return <section className="financial-analysis" aria-labelledby="financial-analysis-title"><div className="financial-analysis-heading"><div><p className="eyebrow">Agreement + ledger checks</p><h3 id="financial-analysis-title">Financial controls for this reporting period</h3></div><span>{analysis.mappedTransactionCount} mapped · {analysis.excludedTransactionCount} excluded</span></div><div className="financial-control-grid">{analysis.controls.map((control) => <article key={control.id} className={control.status}><ReviewLabel status={qualityState(control.status)} /><h4>{control.title}</h4><p>{control.detail}</p>{control.transactionIds.length > 0 && <small>Transactions: {control.transactionIds.join(", ")}</small>}</article>)}</div>{analysis.budgetVariances.length > 0 && <div className="table-scroll"><table className="data-table"><thead><tr><th>Budget category</th><th>Approved</th><th>Current-period actual</th><th>Variance</th><th>Variance %</th><th>Result</th></tr></thead><tbody>{analysis.budgetVariances.map((item) => <tr key={item.category}><th>{item.category}</th><td>{formatCurrency(item.approvedAmount)}</td><td>{formatCurrency(item.actualAmount)}</td><td>{signedCurrency(item.varianceAmount)}</td><td>{item.variancePercent >= 0 ? "+" : ""}{item.variancePercent.toFixed(1)}%</td><td>{item.explanationRequired ? "Explanation required" : "Within threshold"}</td></tr>)}</tbody></table></div>}</section>;
}

function Narrative({ result, onAddSources }: { result: CompilationResult; onAddSources(): void }) {
  const programMissing = result.inputStatus.some((item) => item.role === "programUpdate" && !item.available);
  const financialMissing = result.inputStatus.some((item) => item.role === "ledgerExport" && !item.available);
  return <div className="grid gap-4">
    {(programMissing || financialMissing) && <EmptyResultState title="Program and financial results are still needed" detail="You haven’t provided all current-period program results or financial activity, so GrantDeskHQ will not generate those parts of the report yet." action="Add report inputs" onAction={onAddSources} compact />}
    {result.narrative.length ? <div className="compiled-list">{result.narrative.map((item) => <article key={item.id}>
      <div className="compiled-list-main"><ReviewLabel status={item.status} /><div><p className="eyebrow">{humanEvidenceType(item.evidenceType)}</p><h3 className={item.status === "blocked" ? "text-redBlocked-700 line-through" : ""}>{item.text}</h3></div></div>
      <Source reference={item.source} />
    </article>)}</div> : <p className="empty-copy">No source-supported narrative can be drafted from the current inputs.</p>}
  </div>;
}

function Review({ result, onResolve, onDownload, onEditSetup, onAddSources }: { result: CompilationResult; onResolve(id: string, resolution?: "resolved" | "not_applicable"): void; onDownload(): void; onEditSetup(): void; onAddSources(): void }) {
  const ready = canGenerateReviewPackage(result);
  const unresolvedFindings = result.validation.findings.filter((finding) => finding.verdict !== "source_matched");
  const blockedCount = result.setupConflicts.length
    + unresolvedFindings.filter((finding) => finding.verdict === "blocked").length
    + result.qualityChecks.filter((check) => check.required && check.status === "blocked").length;
  const missingCount = result.inputStatus.filter((item) => item.requiredForCompletion && !item.available).length;
  const reviewCount = unresolvedFindings.filter((finding) => finding.verdict === "review").length
    + result.qualityChecks.filter((check) => check.required && check.status === "review").length;
  const attention = buildReportAttention(result);
  return <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
    <div className="grid gap-3">
      <div className="attention-review-heading"><p className="eyebrow">Your review queue</p><h3>{attention.length} grouped {attention.length === 1 ? "decision" : "decisions"}</h3><p>GrantDeskHQ completed {machineCheckCount(result)} checks in the background. The items below group related checks so your team can focus on the decisions that need judgment.</p></div>
      <div className="attention-summary-list">{attention.map((item) => <article key={item.id}><AlertTriangle aria-hidden="true" /><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div>
      {result.setupConflicts.map((conflict) => <article key={conflict.id} className="prototype-review-item blocked">
        <AlertTriangle aria-hidden="true" /><div><ReviewLabel status="blocked" /><h3>{conflict.title}</h3><p>{conflict.detail}</p><small>{conflict.source.sourceName} · {conflict.source.locator}</small></div><button type="button" className="button button-primary button-small" onClick={onEditSetup}>Fix report setup</button>
      </article>)}
      <details className="machine-check-details"><summary>View detailed source and quality checks</summary><div className="grid gap-3 pt-3">
      {unresolvedFindings.map((finding) => <article key={finding.id} className={`prototype-review-item ${finding.verdict}`}>
        {finding.verdict === "blocked" ? <AlertTriangle aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
        <div><ReviewLabel status={finding.verdict === "blocked" ? "blocked" : "review"} /><h3>{findingTitle(finding.itemId, finding.verdict)}</h3><p>{finding.reason}</p><small>{finding.source.sourceName} · {finding.source.locator}</small></div>
        {finding.verdict === "review" ? <button type="button" className="button button-secondary button-small" onClick={() => onResolve(finding.id)}>Confirm after review</button> : <button type="button" className="button button-secondary button-small" onClick={onAddSources}>Correct source or setup</button>}
      </article>)}
      {result.qualityChecks.map((check) => <article key={check.id} className={`prototype-review-item ${check.status}`}>
      {check.status === "passed" ? <CheckCircle2 aria-hidden="true" /> : check.status === "not_evaluated" ? <FileText aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
      <div><ReviewLabel status={qualityState(check.status)} /><h3>{check.label}</h3><p>{check.detail}</p></div>
      {check.required && check.status === "review" && <button type="button" className="button button-secondary button-small" onClick={() => onResolve(check.id)}>Confirm after review</button>}
      {check.required && (check.status === "blocked" || check.status === "not_evaluated") && <button type="button" className="button button-secondary button-small" onClick={onAddSources}>{check.status === "not_evaluated" ? "Add information" : "Correct source data"}</button>}
    </article>)}</div></details></div>
    <aside className="review-package-card"><ClipboardCheck aria-hidden="true" /><h3>{ready ? "Review package ready" : "Complete the review gate"}</h3><p>{ready ? "Required checks are complete. Generate the structured draft and citation log for final professional review." : reviewGateMessage(blockedCount, missingCount, reviewCount)}</p>{result.setupConflicts.length > 0 && <button type="button" className="button button-secondary mt-4 w-full" onClick={onEditSetup}>Fix report setup</button>}{missingCount > 0 && <button type="button" className="button button-secondary mt-3 w-full" onClick={onAddSources}>Add missing information</button>}<button type="button" className="button button-primary mt-5 w-full" disabled={!ready} onClick={onDownload}><Download aria-hidden="true" />Generate review package</button></aside>
  </div>;
}

function Source({ reference }: { reference: { sourceName: string; locator: string; excerpt: string } }) {
  return <div className="compiled-source"><FileText aria-hidden="true" /><div><strong>{reference.sourceName} · {reference.locator}</strong><blockquote>“{reference.excerpt}”</blockquote></div></div>;
}

function ReviewLabel({ status }: { status: ReviewState }) {
  const label = status === "verified" ? "Verified" : status === "review" ? "Needs review" : status === "blocked" ? "Action required" : "Not evaluated";
  const className = status === "verified" ? "status-success" : status === "review" ? "status-review" : status === "blocked" ? "status-blocked" : "status-neutral";
  return <span className={`status-badge ${className}`}>{label}</span>;
}

export function AgreementSetupCard({ preflight, onApply }: { preflight: CompilationPreflightResult; onApply(): void }) {
  const setup = agreementSetup(preflight);
  if (!setup.grantName) return null;
  return <section className="agreement-setup-card" aria-labelledby="agreement-setup-title">
    <div className="agreement-setup-heading">
      <div><p className="eyebrow">Recommended setup</p><h3 id="agreement-setup-title">Set up this report from the agreement</h3><p>{setup.period ? "GrantDeskHQ can correct the grant details and select the first reporting obligation in one step." : "GrantDeskHQ can correct the verified grant details in one step. Choose a reporting period after the update."}</p></div>
      <ShieldCheck aria-hidden="true" />
    </div>
    <dl>
      {setup.organizationName && <div><dt>Organization</dt><dd>{setup.organizationName}</dd></div>}
      <div><dt>Grant</dt><dd>{setup.grantName}</dd></div>
      {setup.awardAmount && <div><dt>Award</dt><dd>{setup.awardAmount}</dd></div>}
      {setup.period && <>
        <div><dt>Report</dt><dd>{setup.period.title}</dd></div>
        <div><dt>Period</dt><dd>{humanDateRange(setup.period.startDate, setup.period.endDate)}</dd></div>
        {isUsableDate(setup.period.dueDate) && <div><dt>Due</dt><dd>{humanDate(setup.period.dueDate)}</dd></div>}
      </>}
    </dl>
    <button type="button" className="button button-primary" onClick={onApply}>{setup.period ? "Use these details" : "Use verified grant details"} <ArrowRight aria-hidden="true" /></button>
    <small>The previous manual setup will remain in the report’s audit history.</small>
  </section>;
}

export function ReportingSchedule({ periods, selectedPeriodId, onSelect }: {
  periods: CompilationPreflightResult["reportingPeriods"];
  selectedPeriodId: string;
  onSelect(period: GrantReportingPeriod): void;
}) {
  const verified = periods.filter((period) => period.status === "verified");
  const ordered = [...verified].sort((left, right) => Date.parse(left.startDate) - Date.parse(right.startDate));
  if (!ordered.length) return null;
  return <section className="setup-schedule" aria-label="Reporting schedule found in award agreement">
    <div className="setup-schedule-heading">
      <CalendarClock aria-hidden="true" />
      <div><strong>{ordered.length} reporting {ordered.length === 1 ? "obligation" : "obligations"} identified</strong><p>Select a report to configure its dates and required work.</p></div>
    </div>
    <details className="setup-schedule-details">
      <summary>View reporting schedule <ArrowRight aria-hidden="true" /></summary>
      <div className="setup-schedule-list">
        {ordered.map((period) => <button key={period.id} type="button" className={period.id === selectedPeriodId ? "is-selected" : ""} aria-pressed={period.id === selectedPeriodId} onClick={() => onSelect(period)}>
          <CheckCircle2 aria-hidden="true" />
          <span><strong>{period.title}</strong><small>{humanDateRange(period.startDate, period.endDate)}{isUsableDate(period.dueDate) ? ` · Due ${humanDate(period.dueDate)}` : ""}</small></span>
          <ArrowRight aria-hidden="true" />
        </button>)}
      </div>
    </details>
  </section>;
}

export function ReportWorkflow({ obligations, referencePeriod }: { obligations: GrantWorkflowObligation[]; referencePeriod?: GrantReportingPeriod }) {
  const groups: Array<{ id: ObligationApplicability; title: string; detail: string }> = [
    { id: "required_now", title: "Required for this report", detail: "Work the team needs to complete for this reporting period." },
    { id: "conditional", title: "Required only if triggered", detail: "Monitor these thresholds or events; they are not missing tasks unless triggered." },
    { id: "future", title: "Required later", detail: "Obligations the agreement assigns to a later report or milestone." },
    { id: "not_applicable", title: "Not required for this report", detail: "Items the agreement explicitly excludes from this reporting period." }
  ];
  return <section className="report-workflow" aria-labelledby="report-workflow-title">
    <div className="report-workflow-heading"><div><p className="eyebrow">Report workflow</p><h3 id="report-workflow-title">What your team needs to complete next</h3><p>{referencePeriod ? `${referencePeriod.title} · ${humanDateRange(referencePeriod.startDate, referencePeriod.endDate)}` : "Selected reporting obligation"}</p></div><ClipboardCheck aria-hidden="true" /></div>
    <div className="report-workflow-groups">
      {groups.map((group) => {
        const items = obligations.filter((obligation) => obligation.applicability === group.id);
        if (!items.length) return null;
        return <section key={group.id} className={`workflow-group ${group.id}`}><div><h4>{group.title}</h4><p>{group.detail}</p></div><div className="workflow-obligation-list">
          {items.map((item) => <article key={item.id}>
            <div className="workflow-obligation-top"><span className="workflow-owner">{item.owner}</span><ReviewLabel status={item.status} /></div>
            <strong>{item.title}</strong><p>{item.detail}</p>
            {group.id === "conditional" && item.trigger && !/^not applicable|none$/i.test(item.trigger) && <small><b>Trigger:</b> {item.trigger}</small>}
            <small>Source: Award agreement · {cleanSourceLocator(item.source.locator)}</small>
          </article>)}
        </div></section>;
      })}
    </div>
  </section>;
}

function ResultMetric({ label, value, detail, suffix = "" }: { label: string; value: number; detail: string; suffix?: string }) {
  return <article className="result-metric"><span>{label}</span><strong>{value}{suffix}</strong><p>{detail}</p></article>;
}

function TextResultMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="result-metric"><span>{label}</span><strong className="result-metric-text">{value}</strong><p>{detail}</p></article>;
}

function displayReportTitle(result: CompilationResult) {
  return result.workflow.readiness === "ready_for_review" ? result.reportTitle : result.reportTitle.replace(/^Draft\s+/i, "");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function signedCurrency(value: number) {
  return `${value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

function EmptyResultState({ title, detail, action, onAction, compact = false }: { title: string; detail: string; action: string; onAction(): void; compact?: boolean }) {
  return <section className={`empty-result-state ${compact ? "is-compact" : ""}`}><FileText aria-hidden="true" /><div><h3>{title}</h3><p>{detail}</p></div><button type="button" className="button button-primary button-small" onClick={onAction}>{action}</button></section>;
}

function qualityState(status: "passed" | "review" | "blocked" | "not_evaluated"): ReviewState {
  return status === "passed" ? "verified" : status;
}

function humanEvidenceType(value: string) {
  const labels: Record<string, string> = {
    source_fact: "Verified source fact",
    calculation: "Calculated from source data",
    program_response: "Confirmed program response",
    needs_confirmation: "Needs confirmation",
    unsupported: "Unsupported statement"
  };
  return labels[value] || "Source-linked draft";
}

function findingTitle(itemId: string, verdict: "source_matched" | "review" | "blocked") {
  const value = itemId.toLowerCase();
  if (value.includes("period")) return "Reporting period needs attention";
  if (value.includes("grant") || value.includes("award")) return "Grant details need attention";
  if (value.includes("ledger") || value.includes("mapping") || value.includes("transaction")) return "Financial source data needs attention";
  if (value.includes("narrative")) return verdict === "blocked" ? "Draft statement is not supported" : "Draft statement needs review";
  return verdict === "blocked" ? "Source support is missing" : "Source evidence needs review";
}

function reviewGateMessage(blocked: number, missing: number, review: number) {
  const items = [
    blocked ? `${blocked} ${blocked === 1 ? "blocker" : "blockers"}` : "",
    missing ? `${missing} required ${missing === 1 ? "input" : "inputs"}` : "",
    review ? `${review} ${review === 1 ? "review decision" : "review decisions"}` : ""
  ].filter(Boolean);
  return items.length ? `Complete ${items.join(", ")} before generating the review package.` : "Complete the remaining report actions before generating the review package.";
}

function Preflight({ label, passed, detail }: { label: string; passed: boolean; detail: string }) {
  return <div className={`preflight-item ${passed ? "passed" : "failed"}`}>{passed ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}<div><strong>{label}</strong><p>{detail}</p></div></div>;
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div><label className="field-label" htmlFor={id}>{label}</label>{children}</div>;
}

function synchronizeClientResult(result: CompilationResult): CompilationResult {
  const findings = result.validation.findings;
  const sourceMatchedItems = findings.filter((item) => item.verdict === "source_matched").length;
  const itemsNeedingReview = findings.filter((item) => item.verdict === "review").length;
  const blockedItems = findings.filter((item) => item.verdict === "blocked").length;
  const blockedChecks = result.qualityChecks.filter((check) => check.required && check.status === "blocked").length;
  const reviewChecks = result.qualityChecks.filter((check) => check.required && check.status === "review").length;
  const missingRequiredSources = result.inputStatus.filter((item) => item.requiredForCompletion && !item.available).length;
  const openMissingInputs = result.missingInputs.filter((item) => item.status === "open").length;
  const actionRequiredCount = result.setupConflicts.length + blockedChecks + blockedItems;
  const needsReviewCount = reviewChecks + itemsNeedingReview;
  const missingInputCount = Math.max(missingRequiredSources, openMissingInputs);
  return {
    ...result,
    validation: {
      ...result.validation,
      sourceMatchedItems,
      itemsNeedingReview,
      blockedItems,
      evidenceCoveragePercent: findings.length ? Math.round((sourceMatchedItems / findings.length) * 100) : 0
    },
    workflow: {
      actionRequiredCount,
      needsReviewCount,
      missingInputCount,
      readiness: actionRequiredCount || missingInputCount ? "not_ready" : needsReviewCount ? "needs_review" : "ready_for_review"
    }
  };
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

function cleanSourceLocator(locator: string) {
  return locator.trim().replace(/^information required\s*·\s*/i, "") || "Location shown in source";
}

function isUsableDate(value: string) {
  return Boolean(value && !/^information required|unknown|not (found|stated)/i.test(value) && Number.isFinite(Date.parse(value)));
}

function humanDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function humanDateRange(start: string, end: string) {
  if (!isUsableDate(start) || !isUsableDate(end)) return `${start} – ${end}`;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (startDate.getUTCFullYear() === endDate.getUTCFullYear()) return `${monthDay.format(startDate)} – ${monthDay.format(endDate)}, ${endDate.getUTCFullYear()}`;
  return `${humanDate(start)} – ${humanDate(end)}`;
}

function agreementSetup(preflight: CompilationPreflightResult) {
  const organizationName = usableProfileValue(preflight.grantProfile.granteeName);
  const funder = usableProfileValue(preflight.grantProfile.funderName);
  const grant = usableProfileValue(preflight.grantProfile.grantName);
  const verifiedPeriods = preflight.reportingPeriods
    .filter((period) => period.status === "verified" && isUsableDate(period.startDate) && isUsableDate(period.endDate))
    .sort((left, right) => Date.parse(left.startDate) - Date.parse(right.startDate));
  const period = verifiedPeriods.find((item) => item.id === preflight.referencePeriodId) || verifiedPeriods[0];
  return {
    organizationName,
    grantName: [funder, grant].filter(Boolean).join(" — "),
    awardAmount: usableProfileValue(preflight.grantProfile.awardAmount),
    period
  };
}

function usableProfileValue(field: { value: string; status: ReviewState } | undefined) {
  if (!field || field.status === "blocked" || field.status === "not_evaluated") return "";
  const value = field.value.trim();
  return /^information required|unknown|not (found|stated)/i.test(value) ? "" : value;
}
