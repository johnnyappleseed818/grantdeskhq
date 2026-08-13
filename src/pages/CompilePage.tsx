import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
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
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud
} from "lucide-react";
import { MAX_EVIDENCE_FILE_BYTES, MAX_EVIDENCE_FILES, MAX_EVIDENCE_TOTAL_BYTES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, canGenerateReviewPackage, resultToDownload, validateCompilationRequest } from "../lib/prototype";
import { buildFinancialExceptionSummary, buildReportAttention, machineCheckCount } from "../lib/reportAttention";
import { buildProgramInsights, buildProgramReadiness, satisfiedProgramCheckIds } from "../lib/programInsights";
import { fileRoleSuggestionKey, inspectFileRole, type FileRoleSuggestion } from "../lib/fileRoleDetection";
import { agreementSetup, remainingSetupConflicts } from "../lib/agreementSetup";
import { createEvidenceId, mergePendingEvidenceFiles, type PendingEvidenceFile } from "../lib/evidenceUploads";
import { futureWorkflowStatus, normalizeWorkflowObligations } from "../lib/obligationApplicability";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { CompilationPreflightResult, CompilationRequest, CompilationResult, CompilerFile, GrantReportingPeriod, GrantWorkflowObligation, ObligationApplicability, PersistedCompilationResponse, ReviewState, SetupDecision, SourceRole, SupportingEvidenceFile } from "../types/prototype";

const sourceFields: Array<{ role: SourceRole; label: string; help: string; accept: string; required: boolean }> = [
  { role: "awardAgreement", label: "Award agreement or Notice of Award", help: "PDF, DOCX, or TXT", accept: ".pdf,.docx,.txt", required: true },
  { role: "approvedBudget", label: "Approved grant budget", help: "Add now or later · XLSX, CSV, or PDF", accept: ".xlsx,.csv,.pdf", required: false },
  { role: "ledgerExport", label: "General ledger export", help: "Add now or later · CSV or XLSX", accept: ".csv,.xlsx", required: false },
  { role: "funderTemplate", label: "Funder report template", help: "Optional · DOCX or PDF", accept: ".docx,.pdf", required: false },
  { role: "programUpdate", label: "Program update", help: "Add now or later · DOCX, PDF, or TXT", accept: ".docx,.pdf,.txt", required: false }
];

const evidenceAccept = ".xlsx,.csv,.pdf,.docx,.txt,.png,.jpg,.jpeg";

type ResultTab = "overview" | "requirements" | "inputs" | "mapping" | "narrative" | "review";

export function CompilePage() {
  const { user, loading, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const savedReportId = new URLSearchParams(location.search).get("report") || "";
  const [meta, setMeta] = useState({
    organizationName: "",
    grantName: "",
    reportingPeriod: ""
  });
  const [files, setFiles] = useState<Partial<Record<SourceRole, File>>>({});
  const [evidenceFiles, setEvidenceFiles] = useState<PendingEvidenceFile[]>([]);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
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
  const [fileRoleSuggestions, setFileRoleSuggestions] = useState<Partial<Record<SourceRole, FileRoleSuggestion>>>({});
  const [acceptedFileRoles, setAcceptedFileRoles] = useState<string[]>([]);
  const [compileAttempt, setCompileAttempt] = useState<{ fingerprint: string; requestId: string } | null>(null);
  const [loadingSavedReport, setLoadingSavedReport] = useState(Boolean(savedReportId));

  const selectedCoreFiles = useMemo(() => (Object.entries(files) as Array<[SourceRole, File | undefined]>)
    .filter((entry): entry is [SourceRole, File] => Boolean(entry[1])), [files]);
  const selectedFiles = useMemo<Array<[SourceRole, File]>>(() => [
    ...selectedCoreFiles,
    ...evidenceFiles.map((item) => ["supportingEvidence" as const, item.file] as [SourceRole, File])
  ], [evidenceFiles, selectedCoreFiles]);
  const coreBytes = useMemo(() => selectedCoreFiles.reduce((sum, [, file]) => sum + file.size, 0), [selectedCoreFiles]);
  const evidenceBytes = useMemo(() => evidenceFiles.reduce((sum, item) => sum + item.file.size, 0), [evidenceFiles]);
  const totalBytes = coreBytes + evidenceBytes;
  const requiredFilesComplete = sourceFields.filter((field) => field.required).every((field) => files[field.role]);
  const activeFileRoleSuggestions = useMemo(() => Object.values(fileRoleSuggestions).filter((suggestion): suggestion is FileRoleSuggestion => {
    if (!suggestion || acceptedFileRoles.includes(suggestion.key)) return false;
    const file = files[suggestion.assignedRole];
    return Boolean(file && fileRoleSuggestionKey(suggestion.assignedRole, file) === suggestion.key);
  }), [acceptedFileRoles, fileRoleSuggestions, files]);

  useEffect(() => {
    if (!savedReportId || !user) return;
    setLoadingSavedReport(true);
    setError("");
    token()
      .then((idToken) => apiRequest<PersistedCompilationResponse>(`/api/reports/${encodeURIComponent(savedReportId)}`, idToken))
      .then((body) => {
        setReportId(body.reportId);
        setResult(body.result);
        setMeta({
          organizationName: body.report.organizationName,
          grantName: body.report.grantName,
          reportingPeriod: body.report.reportingPeriod
        });
        setActiveTab("overview");
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "The saved report could not be opened."))
      .finally(() => setLoadingSavedReport(false));
  }, [savedReportId, token, user]);

  const inspectSelectedFile = (role: SourceRole, file: File) => {
    setAcceptedFileRoles((current) => current.filter((key) => !key.startsWith(`${role}:`)));
    setFileRoleSuggestions((current) => ({ ...current, [role]: undefined }));
    void inspectFileRole(file, role).then((suggestion) => setFileRoleSuggestions((current) => ({ ...current, [role]: suggestion || undefined })));
  };

  const updateFile = (role: SourceRole, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFiles((current) => ({ ...current, [role]: file }));
    inspectSelectedFile(role, file);
    setResult(null);
    if (role === "awardAgreement") {
      setPreflight(null);
      setPreflightKey("");
      setSetupDecisions([]);
      setSetupNotice("");
    }
    setError("");
  };

  const appendEvidenceFiles = (selected: File[]) => {
    if (!selected.length) return;
    const unsupported = selected.filter((file) => !acceptsEvidenceFile(file));
    const accepted = selected.filter(acceptsEvidenceFile);
    setEvidenceFiles((current) => {
      const merged = mergePendingEvidenceFiles(current, accepted);
      if (merged.error) window.requestAnimationFrame(() => setError(merged.error));
      return merged.files;
    });
    setResult(null);
    if (unsupported.length) setError(`${unsupported.map((file) => file.name).join(", ")} is not a supported evidence format.`);
  };

  const updateEvidenceFiles = (event: ChangeEvent<HTMLInputElement>) => {
    appendEvidenceFiles(Array.from(event.target.files || []));
    event.target.value = "";
  };

  const removePendingEvidence = (id: string) => {
    setEvidenceFiles((current) => current.filter((item) => item.id !== id));
    setResult(null);
    setError("");
  };

  const replacePendingEvidence = (id: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !acceptsEvidenceFile(file)) {
      if (file) setError(`${file.name} is not a supported evidence format.`);
      return;
    }
    setEvidenceFiles((current) => {
      const next = current.map((item) => item.id === id ? { id, file, uploadedAt: new Date().toISOString() } : item);
      if (file.size > MAX_EVIDENCE_FILE_BYTES || next.reduce((sum, item) => sum + item.file.size, 0) > MAX_EVIDENCE_TOTAL_BYTES) {
        window.requestAnimationFrame(() => setError("The replacement would exceed the supporting-evidence upload limit."));
        return current;
      }
      return next;
    });
    setResult(null);
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
    const { assigned, evidence, unmatched } = assignPackageFiles(selected, files);
    setFiles((current) => ({ ...current, ...assigned }));
    appendEvidenceFiles(evidence);
    for (const [role, file] of Object.entries(assigned) as Array<[SourceRole, File]>) inspectSelectedFile(role, file);
    setResult(null);
    if (assigned.awardAgreement) {
      setPreflight(null);
      setPreflightKey("");
      setSetupDecisions([]);
      setSetupNotice("");
    }
    setWizardStep(2);
    if (unmatched.length) setError(`${unmatched.map((file) => file.name).join(", ")} could not be assigned automatically. Add each file to the appropriate source box below.`);
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
    if (wizardStep === 2 && activeFileRoleSuggestions.length) {
      setError("Review the file placement suggestion before continuing. Move the file to the recommended field or confirm that you want to keep it where it is.");
      return;
    }
    if (wizardStep === 2 && (coreBytes > MAX_TOTAL_BYTES || Object.values(files).some((file) => (file?.size || 0) > MAX_FILE_BYTES)
      || evidenceFiles.length > MAX_EVIDENCE_FILES || evidenceBytes > MAX_EVIDENCE_TOTAL_BYTES || evidenceFiles.some((item) => item.file.size > MAX_EVIDENCE_FILE_BYTES))) {
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
    const fingerprint = compilationFingerprint(meta, selectedFiles, setupDecisions);
    const requestId = compileAttempt?.fingerprint === fingerprint ? compileAttempt.requestId : crypto.randomUUID();
    setCompileAttempt({ fingerprint, requestId });

    if (!user) {
      navigate("/login?next=/compile");
      return;
    }

    setCompiling(true);
    try {
      const payloadFiles = await Promise.all(selectedFiles.map(([role, file], index) => {
        const evidence = role === "supportingEvidence" ? evidenceFiles[index - selectedCoreFiles.length] : undefined;
        return fileToCompilerFile(role, file, evidence?.id, evidence?.uploadedAt);
      }));
      const payload: CompilationRequest = { ...meta, files: payloadFiles, setupDecisions, requestId };
      const errors = validateCompilationRequest(payload);
      if (!acknowledged) errors.push("Confirm that the files are synthetic or redacted test files.");
      if (errors.length) {
        setError(errors.join(" "));
        return;
      }
      const idToken = await token();
      const corePayload = { ...payload, files: payload.files.filter((file) => file.role !== "supportingEvidence") };
      const body = await apiRequest<PersistedCompilationResponse>("/api/reports/compile", idToken, { method: "POST", body: JSON.stringify(corePayload) });
      setResult(body.result);
      setReportId(body.reportId);
      let completed = body;
      const evidencePayload = payload.files.filter((file) => file.role === "supportingEvidence");
      if (evidencePayload.length) {
        try {
          completed = await apiRequest<PersistedCompilationResponse>(`/api/reports/${body.reportId}/evidence`, idToken, { method: "POST", body: JSON.stringify({ files: evidencePayload }) });
          setEvidenceFiles([]);
        } catch (evidenceError) {
          setError(`The report draft was saved, but supporting evidence analysis did not finish. ${evidenceError instanceof Error ? evidenceError.message : "Try adding the evidence again from the Inputs tab."}`);
        }
      }
      setResult(completed.result);
      setReportId(completed.reportId);
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
    const resolvedProgramCheck = current.programChecks?.find((check) => `program-${check.id}` === id);
    const useEvidenceBackedValue = resolution === "resolved" && resolvedProgramCheck?.type === "data_conflict" && resolvedProgramCheck.evidenceBackedValue;
    const evidenceBackedNarrativeId = resolvedProgramCheck ? `evidence-backed-${resolvedProgramCheck.id}` : "";
    const evidenceBackedSource = resolvedProgramCheck?.sources.at(-1);
    const updatedNarrative = useEvidenceBackedValue && evidenceBackedSource
      ? [
          ...current.narrative.filter((statement) => statement.id !== evidenceBackedNarrativeId),
          {
            id: evidenceBackedNarrativeId,
            text: `${current.grantProfile.granteeName?.value || "The organization"} completed ${resolvedProgramCheck.evidenceBackedValue} housing stability assessments during the reporting period.`,
            evidenceType: "source_fact" as const,
            source: evidenceBackedSource,
            status: "verified" as const
          }
        ]
      : current.narrative;
    const updated = {
      ...current,
      narrative: updatedNarrative,
      qualityChecks: current.qualityChecks.map((check) => check.id === id && check.status === "review" ? { ...check, status: "passed" as const, detail: `${check.detail} Reviewed and confirmed by the signed-in user.` } : check),
      validation: {
        ...current.validation,
        findings: current.validation.findings.map((finding) => finding.id === id && finding.verdict === "review" ? { ...finding, verdict: "source_matched" as const, reason: `${finding.reason} A professional reviewer confirmed this item.` } : finding)
      },
      programChecks: current.programChecks?.map((check) => `program-${check.id}` === id ? { ...check, resolution } : check)
    };
    const next = synchronizeClientResult(updated);
    if (reportId && user) token().then((idToken) => apiRequest(`/api/reports/${reportId}/review`, idToken, { method: "PATCH", body: JSON.stringify({ itemId: id, resolution }) })).catch(() => setError("The review changed locally but could not be saved. Try again before leaving this page."));
    return next;
  });

  const addEvidenceToSavedReport = async (selected: File[], replaceEvidenceId?: string) => {
    if (!reportId || !selected.length) return;
    setEvidenceBusy(true);
    setError("");
    try {
      const uploadedAt = new Date().toISOString();
      const payloadFiles = await Promise.all(selected.map((file) => fileToCompilerFile("supportingEvidence", file, createEvidenceId(), uploadedAt)));
      const body = await apiRequest<PersistedCompilationResponse>(`/api/reports/${reportId}/evidence`, await token(), {
        method: "POST",
        body: JSON.stringify({ files: payloadFiles, replaceEvidenceId })
      });
      setResult(body.result);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Supporting evidence could not be analyzed.");
    } finally {
      setEvidenceBusy(false);
    }
  };

  const removeEvidenceFromSavedReport = async (evidenceId: string) => {
    if (!reportId) return;
    setEvidenceBusy(true);
    setError("");
    try {
      const body = await apiRequest<PersistedCompilationResponse>(`/api/reports/${reportId}/evidence/${encodeURIComponent(evidenceId)}`, await token(), { method: "DELETE" });
      setResult(body.result);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Supporting evidence could not be removed.");
    } finally {
      setEvidenceBusy(false);
    }
  };

  const confirmEvidenceMatchForSavedReport = async (evidenceId: string, targetId: string) => {
    if (!reportId) return;
    setEvidenceBusy(true);
    setError("");
    try {
      const body = await apiRequest<PersistedCompilationResponse>(`/api/reports/${reportId}/evidence/${encodeURIComponent(evidenceId)}/matches`, await token(), { method: "PATCH", body: JSON.stringify({ targetId }) });
      setResult(body.result);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "The evidence match could not be confirmed.");
    } finally {
      setEvidenceBusy(false);
    }
  };

  const download = () => {
    if (!result || !canGenerateReviewPackage(result)) return;
    const url = URL.createObjectURL(new Blob([resultToDownload(result)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "GrantDeskHQ_Review_Package.json";
    anchor.click();
    URL.revokeObjectURL(url);
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
      setupConflicts: remainingSetupConflicts(preflight)
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

  const moveSourceFile = (suggestion: FileRoleSuggestion) => {
    if (files[suggestion.suggestedRole]) {
      setError(`${sourceLabel(suggestion.suggestedRole)} already contains a file. Remove or replace that file before moving ${suggestion.fileName}.`);
      return;
    }
    setFiles((current) => {
      const next = { ...current };
      const file = next[suggestion.assignedRole];
      delete next[suggestion.assignedRole];
      if (file) next[suggestion.suggestedRole] = file;
      return next;
    });
    setFileRoleSuggestions((current) => ({ ...current, [suggestion.assignedRole]: undefined, [suggestion.suggestedRole]: undefined }));
    setAcceptedFileRoles((current) => current.filter((key) => key !== suggestion.key));
    setResult(null);
    setError("");
    setSetupNotice(`${suggestion.fileName} moved to ${sourceLabel(suggestion.suggestedRole)}.`);
  };

  const keepSourceFile = (suggestion: FileRoleSuggestion) => {
    setAcceptedFileRoles((current) => current.includes(suggestion.key) ? current : [...current, suggestion.key]);
    setError("");
  };

  if (savedReportId) {
    if (loading) return <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Checking your account…</div>;
    if (!user) return <Navigate replace to={`/login?next=${encodeURIComponent(`/compile?report=${savedReportId}`)}`} />;
    return <div className="compile-page saved-report-page">
      <section className="site-shell py-10">
        <Link className="button button-secondary" to="/workspace"><ChevronLeft aria-hidden="true" />Back to reports</Link>
        {loadingSavedReport && <div className="workspace-loading"><LoaderCircle className="animate-spin" aria-hidden="true" />Opening saved report…</div>}
        {error && <div className="compiler-error mt-6" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span></div>}
      </section>
      {result && <CompilerResults result={result} activeTab={activeTab} setActiveTab={setActiveTab} onResolve={resolveCheck} onDownload={download} onEditSetup={() => navigate("/compile")} onAddSources={() => navigate("/compile")} onAddEvidence={addEvidenceToSavedReport} onRemoveEvidence={removeEvidenceFromSavedReport} onConfirmEvidenceMatch={confirmEvidenceMatchForSavedReport} evidenceBusy={evidenceBusy} />}
    </div>;
  }

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
            <div className="wizard-intro flex items-center justify-between gap-4"><span>Only an award agreement or Notice of Award is needed to start. Add everything else now or later. No accounting connection is needed.</span><strong>Core {formatBytes(coreBytes)} / {formatBytes(MAX_TOTAL_BYTES)} · Evidence {formatBytes(evidenceBytes)} / {formatBytes(MAX_EVIDENCE_TOTAL_BYTES)}</strong></div>
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
            <section className="evidence-upload-panel" aria-labelledby="supporting-evidence-upload-title">
              <div className="evidence-upload-heading">
                <div><p className="eyebrow">Supporting evidence</p><h3 id="supporting-evidence-upload-title">Add receipts, approvals, KPI records, and other supporting files</h3><p>Select several files at once or add more later. Each file stays separate and is matched independently after the report is created.</p></div>
                <label className="button button-secondary button-small" htmlFor="source-supporting-evidence"><UploadCloud aria-hidden="true" />Add evidence files</label>
                <input id="source-supporting-evidence" className="sr-only" type="file" multiple accept={evidenceAccept} onChange={updateEvidenceFiles} />
              </div>
              <div className="evidence-upload-summary"><strong>{evidenceFiles.length} supporting evidence {evidenceFiles.length === 1 ? "file" : "files"}</strong><span>{formatBytes(evidenceBytes)} · up to {MAX_EVIDENCE_FILES} files</span></div>
              {evidenceFiles.length > 0 && <div className="evidence-pending-list">{evidenceFiles.map((item) => <article key={item.id}>
                <FileText aria-hidden="true" />
                <div><strong>{item.file.name}</strong><small>{item.file.type || "File"} · {formatBytes(item.file.size)} · Ready to analyze</small></div>
                <label className="button button-secondary button-small" htmlFor={`replace-${item.id}`}><RefreshCw aria-hidden="true" />Replace</label>
                <input id={`replace-${item.id}`} className="sr-only" type="file" accept={evidenceAccept} onChange={(event) => replacePendingEvidence(item.id, event)} />
                <button type="button" className="button button-secondary button-small" onClick={() => removePendingEvidence(item.id)}><Trash2 aria-hidden="true" />Remove</button>
              </article>)}</div>}
            </section>
            {activeFileRoleSuggestions.map((suggestion) => <section key={suggestion.key} className="file-role-suggestion" aria-label={`File placement suggestion for ${suggestion.fileName}`}>
              <AlertTriangle aria-hidden="true" />
              <div><p className="eyebrow">Check this file</p><h3>This file looks like {indefiniteSourceLabel(suggestion.suggestedRole)}, not {indefiniteSourceLabel(suggestion.assignedRole)}.</h3><p>{suggestion.reason}</p><small>{suggestion.fileName}</small></div>
              <div><button type="button" className="button button-primary button-small" onClick={() => moveSourceFile(suggestion)}>Move to {sourceLabel(suggestion.suggestedRole)}</button><button type="button" className="button button-secondary button-small" onClick={() => keepSourceFile(suggestion)}>Keep in {sourceLabel(suggestion.assignedRole)}</button></div>
            </section>)}
            {preflighting && <div className="setup-checking" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" /><div><strong>Checking the award details</strong><p>GrantDeskHQ is comparing the funder, grant, and reporting period before drafting begins.</p></div></div>}
            {setupNotice && <div className="setup-notice" role="status"><CheckCircle2 aria-hidden="true" /><div><strong>Report setup updated</strong><p>{setupNotice}</p></div></div>}
            {preflight && preflight.setupConflicts.length > 0 && <AgreementSetupCard preflight={preflight} onApply={applyAgreementWorkflow} onReplaceAgreement={replaceAwardAgreement} onEditSetup={() => returnToSetup("compiler-organization")} />}
            {preflight && preflight.setupConflicts.length === 0 && <div className="setup-match"><CheckCircle2 aria-hidden="true" /><div><strong>Award details match this report setup</strong><p>GrantDeskHQ checked the grant identity and reporting period before moving forward.</p></div></div>}
            {preflight && preflight.reportingPeriods.some((period) => period.status === "verified") && <ReportingSchedule periods={preflight.reportingPeriods} selectedPeriodId={preflight.referencePeriodId} onSelect={selectReportingPeriod} />}
            {preflight && preflight.workflowObligations.length > 0 && <ReportWorkflow obligations={preflight.workflowObligations} referencePeriod={preflight.reportingPeriods.find((period) => period.id === preflight.referencePeriodId)} availableSources={selectedFiles.map(([role]) => role)} />}
          </fieldset>

          <fieldset className="wizard-step" hidden={wizardStep !== 3}>
            <legend><span className="eyebrow">Step 3 of 4</span>Review the information used for your draft</legend>
            <p className="wizard-intro">GrantDeskHQ starts with the available sources, identifies missing inputs, and compares the material output with the source package.</p>
            <div className="preflight-list">
              <Preflight label="Award document present" passed={requiredFilesComplete} detail={`${sourceFields.filter((field) => field.required && files[field.role]).length} of ${sourceFields.filter((field) => field.required).length} required to start`} />
              <Preflight label="Package fits file limits" passed={coreBytes <= MAX_TOTAL_BYTES && evidenceBytes <= MAX_EVIDENCE_TOTAL_BYTES && evidenceFiles.length <= MAX_EVIDENCE_FILES && Object.values(files).every((file) => (file?.size || 0) <= MAX_FILE_BYTES) && evidenceFiles.every((item) => item.file.size <= MAX_EVIDENCE_FILE_BYTES)} detail={`${formatBytes(coreBytes)} core files · ${evidenceFiles.length} evidence files (${formatBytes(evidenceBytes)})`} />
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
              <div><span>Source package</span><strong>{selectedFiles.length} files · {formatBytes(totalBytes)}</strong></div>
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
            {wizardStep < 4 && <button type="button" className="button button-primary" onClick={() => moveWizard(1)} disabled={preflighting || (wizardStep === 2 && (Boolean(preflight?.setupConflicts.length) || activeFileRoleSuggestions.length > 0))}>{preflighting ? "Checking award…" : "Continue"} {!preflighting && <ArrowRight aria-hidden="true" />}</button>}
          </div>
        </form>
      </section>

      {reportId && <div className="site-shell"><div className="account-notice">Report saved to your private workspace. <Link className="underline" to="/workspace">View saved reports</Link></div></div>}
      {result && <CompilerResults result={result} activeTab={activeTab} setActiveTab={setActiveTab} onResolve={resolveCheck} onDownload={download} onEditSetup={() => returnToSetup("compiler-grant")} onAddSources={returnToSources} onAddEvidence={addEvidenceToSavedReport} onRemoveEvidence={removeEvidenceFromSavedReport} onConfirmEvidenceMatch={confirmEvidenceMatchForSavedReport} evidenceBusy={evidenceBusy} />}
    </div>
  );
}

export function CompilerResults({ result, activeTab, setActiveTab, onResolve, onDownload, onEditSetup, onAddSources, onAddEvidence, onRemoveEvidence, onConfirmEvidenceMatch, evidenceBusy = false }: { result: CompilationResult; activeTab: ResultTab; setActiveTab(tab: ResultTab): void; onResolve(id: string, resolution?: "resolved" | "not_applicable"): void; onDownload(): void; onEditSetup(): void; onAddSources(): void; onAddEvidence?(files: File[], replaceEvidenceId?: string): void; onRemoveEvidence?(evidenceId: string): void; onConfirmEvidenceMatch?(evidenceId: string, targetId: string): void; evidenceBusy?: boolean }) {
  const actions = buildReportAttention(result).length;
  const checks = machineCheckCount(result);
  const hasLedger = result.inputStatus.some((item) => item.role === "ledgerExport" && item.available);
  const tabs: Array<[ResultTab, string]> = [
    ["overview", "Overview"],
    ["requirements", "Requirements"],
    ["inputs", "Inputs"],
    ["mapping", hasLedger ? "Financial mapping" : "Financial mapping · add data"],
    ["narrative", "Draft & evidence"],
    ["review", `Review · ${actions} ${actions === 1 ? "item" : "items"}`]
  ];
  return (
    <section id="compiler-results" tabIndex={-1} className="compiler-results">
      <div className="site-shell py-12 lg:py-16">
        <div className="compiler-result-heading">
          <div><p className="eyebrow">{result.workflow.readiness === "ready_for_review" ? "Draft ready for review" : "Preparing report"}</p><h2>{displayReportTitle(result)}</h2><p><strong>Working draft — human review required.</strong> {actions ? "Some inputs and financial exceptions still need attention before this report can be approved." : "The source checks are complete and the report is ready for professional review."}</p></div>
          <div className={`review-count ${actions ? "needs-review" : "ready"}`}><strong>{checks}</strong><span>checks completed</span><small>{actions} {actions === 1 ? "item needs" : "items need"} your attention</small></div>
        </div>
        <div className="result-tabs" role="tablist" aria-label="Compiled report sections">
          {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}>{label}</button>)}
        </div>
        <div className="result-panel">
          {activeTab === "overview" && <Overview result={result} onEditSetup={onEditSetup} />}
          {activeTab === "requirements" && <Requirements result={result} />}
          {activeTab === "inputs" && <Inputs result={result} onAddSources={onAddSources} onResolve={onResolve} onAddEvidence={onAddEvidence} onRemoveEvidence={onRemoveEvidence} onConfirmEvidenceMatch={onConfirmEvidenceMatch} evidenceBusy={evidenceBusy} />}
          {activeTab === "mapping" && <Mappings result={result} onAddSources={onAddSources} />}
          {activeTab === "narrative" && <Narrative result={result} onAddSources={onAddSources} onReviewFinancial={() => setActiveTab("mapping")} />}
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
  const reviewRequirements = result.requirements.filter((item) => item.status === "review").length;
  const blockedRequirements = result.requirements.filter((item) => ["blocked", "not_evaluated"].includes(item.status)).length;
  const requirementsNeedingSourceReview = result.requirements.filter((item) => item.status !== "verified");
  const attention = buildReportAttention(result);
  const readinessLabel = result.workflow.readiness === "not_ready" ? "Not ready" : result.workflow.readiness === "needs_review" ? "Needs review" : "Ready for review";
  return <div className="result-metric-grid">
    <TextResultMetric label="Report readiness" value={readinessLabel} detail={result.workflow.readiness === "not_ready" ? "Complete the items below before export." : "Professional review and approval are still required."} />
    <TextResultMetric label="Distinct award requirements" value={verifiedRequirements === result.requirements.length ? `${verifiedRequirements} of ${result.requirements.length}` : `${verifiedRequirements} verified`} detail={verifiedRequirements === result.requirements.length ? "All distinct requirements identified in this analysis are verified against the award documents" : `${reviewRequirements} need source review${blockedRequirements ? ` · ${blockedRequirements} awaiting support` : ""}. Duplicated wording is consolidated; these are extraction checks, not additional workflow tasks.`} />
    <TextResultMetric label="Required inputs" value={`${availableInputs} of ${requiredInputs.length}`} detail="Available for this reporting period" />
    <ResultMetric label="Your actions" value={attention.length} detail="Grouped decisions—not every check the system performed" />
    {requirementsNeedingSourceReview.length > 0 && <details className="requirement-source-review col-span-full">
      <summary>Review {requirementsNeedingSourceReview.length} award {requirementsNeedingSourceReview.length === 1 ? "requirement" : "requirements"} needing source confirmation</summary>
      <p>GrantDeskHQ found these possible requirements, but the source wording or extraction confidence needs confirmation. They are not treated as completed obligations, and they do not become extra workflow tasks unless the award supports them.</p>
      <div>{requirementsNeedingSourceReview.map((item) => <article key={item.id}>
        <div><ReviewLabel status={item.status} /><strong>{item.requirement}</strong></div>
        <small>{Math.round(item.confidence * 100)}% extraction confidence · {item.source.sourceName} · {cleanSourceLocator(item.source.locator)}</small>
      </article>)}</div>
    </details>}
    <div className="attention-summary col-span-full"><div><p className="eyebrow">Less work for your team</p><h3>GrantDeskHQ ran {machineCheckCount(result)} checks. You only need to review {attention.length} {attention.length === 1 ? "thing" : "things"}.</h3></div><div className="attention-summary-list">{attention.map((item) => <article key={item.id} data-action-id={item.id} data-action-kind={item.kind}><CheckCircle2 aria-hidden="true" /><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div></div>
    {result.setupConflicts.length > 0 && <div className="setup-conflict-summary col-span-full"><AlertTriangle aria-hidden="true" /><div><strong>{result.setupConflicts.length} setup {result.setupConflicts.length === 1 ? "conflict" : "conflicts"} must be corrected</strong><p>{result.setupConflicts.map((item) => item.title).join(" · ")}</p></div><button type="button" className="button button-primary button-small" onClick={onEditSetup}>Fix report setup</button></div>}
    <div className="validation-method col-span-full"><ShieldCheck aria-hidden="true" /><div><strong>Evidence status</strong><p><b>{result.validation.sourceMatchedItems} verified</b> · {result.validation.itemsNeedingReview} source checks need review · {result.validation.blockedItems} awaiting inputs or not yet verified</p><p>{attention.length} grouped {attention.length === 1 ? "action covers" : "actions cover"} the related checks shown above. {result.validation.method}</p></div></div>
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

function Inputs({ result, onAddSources, onResolve, onAddEvidence, onRemoveEvidence, onConfirmEvidenceMatch, evidenceBusy }: { result: CompilationResult; onAddSources(): void; onResolve(id: string, resolution?: "resolved" | "not_applicable"): void; onAddEvidence?(files: File[], replaceEvidenceId?: string): void; onRemoveEvidence?(evidenceId: string): void; onConfirmEvidenceMatch?(evidenceId: string, targetId: string): void; evidenceBusy: boolean }) {
  const satisfiedChecks = satisfiedProgramCheckIds(result);
  const programChecks = (result.programChecks || []).filter((check) => !satisfiedChecks.has(check.id));
  return <div className="input-status-list">
    <div className="input-request-card">
      <div><p className="eyebrow">Start with what you have</p><h3>GrantDeskHQ shows exactly what is still needed</h3><p>Add the remaining information as it becomes available. Missing inputs stay visible and cannot be mistaken for completed work.</p></div>
      <button type="button" className="button button-primary button-small" onClick={onAddSources}>Add report inputs</button>
    </div>
    {result.inputStatus.filter((item) => item.role !== "supportingEvidence").map((item) => {
      const available = item.available || (item.role === "ledgerExport" && (result.mappings.length > 0 || Boolean(result.financialAnalysis?.ledgerTransactionCount)));
      const presentation = inputPresentation(result, item.role, available);
      return <article key={item.role} className={`input-status-card ${available ? "is-available" : "is-missing"} ${presentation.tone === "review" ? "has-review" : ""}`}>
      {presentation.tone === "success" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
      <div><div className="input-status-heading"><h3>{item.label}</h3><MappingStateBadge label={presentation.label} tone={presentation.tone} /></div><p>{presentation.detail || item.detail}</p>{!available && item.requiredForCompletion && <small>Needed before the report can be prepared for approval.</small>}</div>
      {!available && <button type="button" className="button button-secondary button-small" onClick={onAddSources}>{item.actionLabel}</button>}
    </article>;})}
    <EvidenceCollection result={result} onAddEvidence={onAddEvidence} onRemoveEvidence={onRemoveEvidence} onConfirmEvidenceMatch={onConfirmEvidenceMatch} busy={evidenceBusy} />
    <ProgramChecks checks={programChecks} onAddSources={onAddSources} onResolve={onResolve} />
  </div>;
}

function EvidenceCollection({ result, onAddEvidence, onRemoveEvidence, onConfirmEvidenceMatch, busy }: { result: CompilationResult; onAddEvidence?(files: File[], replaceEvidenceId?: string): void; onRemoveEvidence?(evidenceId: string): void; onConfirmEvidenceMatch?(evidenceId: string, targetId: string): void; busy: boolean }) {
  const evidence = result.evidenceFiles || [];
  const matched = evidence.filter((file) => file.relevance === "matched").length;
  const review = evidence.filter((file) => file.relevance === "review" || file.parsingStatus === "failed").length;
  const irrelevant = evidence.filter((file) => file.relevance === "irrelevant").length;
  const unmatched = evidence.filter((file) => file.relevance === "unmatched").length;
  const addFiles = (event: ChangeEvent<HTMLInputElement>, replaceEvidenceId?: string) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length) onAddEvidence?.(files, replaceEvidenceId);
  };
  return <section className="evidence-collection" aria-labelledby="evidence-collection-title">
    <div className="evidence-collection-heading">
      <div><p className="eyebrow">Supporting evidence</p><h3 id="evidence-collection-title">Evidence files stay separate and traceable</h3><p>GrantDeskHQ analyzes each file independently and matches it to requirements, KPI results, transactions, approvals, and open report issues.</p></div>
      <label className={`button button-primary button-small ${busy || !onAddEvidence ? "is-disabled" : ""}`} htmlFor="saved-evidence-add"><UploadCloud aria-hidden="true" />{busy ? "Analyzing evidence…" : "Add evidence files"}</label>
      <input id="saved-evidence-add" className="sr-only" type="file" multiple accept={evidenceAccept} disabled={busy || !onAddEvidence} onChange={addFiles} />
    </div>
    <div className="evidence-collection-summary">
      <strong>{evidence.length} supporting evidence {evidence.length === 1 ? "file" : "files"}</strong>
      <span>{matched} matched automatically · {review} {review === 1 ? "needs" : "need"} review · {unmatched} unmatched · {irrelevant} not relevant</span>
    </div>
    {!evidence.length && <div className="evidence-empty"><FileText aria-hidden="true" /><div><strong>No supporting evidence added yet</strong><p>Add only the records this award requires. Irrelevant files remain unmatched and cannot satisfy a requirement.</p></div></div>}
    {evidence.length > 0 && <div className="evidence-file-list">{evidence.map((file) => <EvidenceFileCard key={file.id} file={file} busy={busy} onConfirm={(targetId) => onConfirmEvidenceMatch?.(file.id, targetId)} onReplace={(event) => addFiles(event, file.id)} onRemove={() => {
      if (!onRemoveEvidence) return;
      if (window.confirm(`Remove ${file.name}? This will not affect any other evidence file.`)) onRemoveEvidence(file.id);
    }} />)}</div>}
  </section>;
}

function EvidenceFileCard({ file, busy, onReplace, onRemove, onConfirm }: { file: SupportingEvidenceFile; busy: boolean; onReplace(event: ChangeEvent<HTMLInputElement>): void; onRemove(): void; onConfirm(targetId: string): void }) {
  const presentation = evidenceFilePresentation(file);
  const autoMatches = file.matches.filter((match) => match.status === "matched");
  const suggestions = file.matches.filter((match) => match.status === "suggested");
  return <article className={`evidence-file-card ${presentation.tone}`}>
    <FileText aria-hidden="true" />
    <div className="evidence-file-main">
      <div className="evidence-file-title"><div><strong>{file.name}</strong><small>{file.mimeType || "File"} · {formatBytes(file.size)} · Uploaded {humanTimestamp(file.uploadedAt)}</small></div><MappingStateBadge label={presentation.label} tone={presentation.badgeTone} /></div>
      <p>{file.parsingMessage || presentation.detail}</p>
      {autoMatches.length > 0 && <div className="evidence-match-list"><strong>Matched automatically</strong>{autoMatches.map((match) => <span key={`${match.targetId}-${match.source.locator}`}><CheckCircle2 aria-hidden="true" />{match.targetLabel}<small>{Math.round(match.confidence * 100)}% · {match.source.locator}</small></span>)}</div>}
      {suggestions.length > 0 && <div className="evidence-match-list suggestions"><strong>Suggested match — review needed</strong>{suggestions.map((match) => <span key={`${match.targetId}-${match.source.locator}`}><AlertTriangle aria-hidden="true" />{match.targetLabel}<small>{Math.round(match.confidence * 100)}% · {match.rationale}</small><button type="button" className="button button-secondary button-small" disabled={busy} onClick={() => onConfirm(match.targetId)}>Confirm match</button></span>)}</div>}
    </div>
    <div className="evidence-file-actions">
      <label className="button button-secondary button-small" htmlFor={`saved-replace-${file.id}`}><RefreshCw aria-hidden="true" />Replace</label>
      <input id={`saved-replace-${file.id}`} className="sr-only" type="file" accept={evidenceAccept} disabled={busy} onChange={onReplace} />
      <button type="button" className="button button-secondary button-small" disabled={busy} onClick={onRemove}><Trash2 aria-hidden="true" />Remove</button>
    </div>
  </article>;
}

function evidenceFilePresentation(file: SupportingEvidenceFile): { label: string; detail: string; tone: string; badgeTone: "success" | "review" | "blocked" | "neutral" } {
  if (file.parsingStatus === "failed") return { label: "Needs review", detail: "GrantDeskHQ could not finish parsing this file. Replace it or try again.", tone: "review", badgeTone: "review" };
  if (file.relevance === "matched") return { label: "Matched", detail: "This file directly supports one or more report requirements.", tone: "matched", badgeTone: "success" };
  if (file.relevance === "review") return { label: "Suggested match", detail: "The likely relationship is not confident enough to apply automatically.", tone: "review", badgeTone: "review" };
  if (file.relevance === "irrelevant") return { label: "Not relevant", detail: "This file does not support a requirement in this report and has not cleared any item.", tone: "irrelevant", badgeTone: "neutral" };
  return { label: "Unmatched", detail: "No direct match was found. The file remains available without satisfying a requirement.", tone: "unmatched", badgeTone: "neutral" };
}

function inputPresentation(result: CompilationResult, role: SourceRole, available: boolean): { label: string; tone: "success" | "review" | "blocked" | "neutral"; detail?: string } {
  if (!available) return { label: "Not provided", tone: "neutral" };
  if (role === "awardAgreement") {
    const conflicts = result.setupConflicts.length;
    const verified = result.requirements.some((item) => item.status === "verified") && Object.values(result.grantProfile).some((item) => item?.status === "verified");
    return conflicts
      ? { label: `Available · ${conflicts} setup ${conflicts === 1 ? "issue" : "issues"}`, tone: "review", detail: "The award document is available, but the report setup must be corrected before its details can be treated as confirmed." }
      : verified
        ? { label: "Verified", tone: "success", detail: "Award details and reporting requirements were checked against the uploaded document." }
        : { label: "Available", tone: "success", detail: "The award document is available and its extracted requirements still need validation." };
  }
  if (role === "approvedBudget") {
    const verified = result.requirements.some((item) => item.status === "verified" && /approved budget|budget(?:ed)?|allocation|personnel|travel|indirect|technology|assistance/i.test(`${item.requirement} ${item.source.excerpt}`) && /\$\s*[\d,]+/.test(`${item.requirement} ${item.source.excerpt}`));
    return verified
      ? { label: "Verified", tone: "success", detail: result.inputStatus.find((item) => item.role === role)?.detail }
      : { label: "Available", tone: "success", detail: "Budget information is available and still needs validation against the award." };
  }
  if (role === "ledgerExport") {
    const count = buildFinancialExceptionSummary(result).length;
    return count
      ? { label: `Available · ${count} ${count === 1 ? "exception" : "exceptions"}`, tone: "review", detail: `Accounting data was analyzed. ${count} grouped ${count === 1 ? "exception needs" : "exceptions need"} review; routine transactions do not require approval.` }
      : result.financialAnalysis
        ? { label: "Verified", tone: "success", detail: "Accounting data was analyzed and no unresolved financial exceptions remain." }
        : { label: "Available", tone: "success", detail: "Accounting data is available and has not completed financial validation yet." };
  }
  if (role === "programUpdate") {
    const satisfiedChecks = satisfiedProgramCheckIds(result);
    const open = (result.programChecks || []).filter((item) => item.severity !== "info" && item.resolution === "open" && (item.type === "data_conflict" || !item.evidenceSatisfiedBy?.length) && !satisfiedChecks.has(item.id)).length;
    return open
      ? { label: `Available · ${open} ${open === 1 ? "item needs" : "items need"} review`, tone: "review", detail: `Program results are available. ${open} ${open === 1 ? "item still needs" : "items still need"} confirmation before the draft can be approved.` }
      : (result.programChecks?.length || result.narrative.some((item) => item.status === "verified" && item.evidenceType === "program_response"))
        ? { label: "Verified", tone: "success", detail: "Program results were checked against the award requirements." }
        : { label: "Available", tone: "success", detail: "Program results are available and still need validation against the award requirements." };
  }
  return { label: "Available", tone: "success" };
}

function ProgramChecks({ checks, onAddSources, onResolve }: { checks: NonNullable<CompilationResult["programChecks"]>; onAddSources(): void; onResolve(id: string, resolution?: "resolved" | "not_applicable"): void }) {
  const ordered = checks.filter((item) => item.resolution === "open" && item.severity !== "info" && (item.type === "data_conflict" || !item.evidenceSatisfiedBy?.length)).sort((left, right) => programPriority(left.severity) - programPriority(right.severity));
  if (!ordered.length) return null;
  return <section className="program-checks" aria-labelledby="program-checks-title">
    <div className="program-checks-heading"><div><p className="eyebrow">Program items needing attention</p><h3 id="program-checks-title">Review only the unresolved results</h3><p>Completed source checks stay in the background. These are the program decisions or missing facts that still need your team.</p></div><span>{ordered.length} open</span></div>
    <div className="program-check-list">{ordered.map((check) => <article key={check.id} className={`program-check ${check.severity} ${check.resolution !== "open" ? "is-resolved" : ""}`}>
      {check.severity === "info" || check.resolution !== "open" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
      <div><div className="program-check-label"><MappingStateBadge label={programSeverityLabel(check)} tone={check.resolution !== "open" || check.severity === "info" ? "success" : check.severity === "action_required" ? "blocked" : "review"} /><span>Owner: {check.owner}</span></div><h4>{check.title}</h4><p>{check.detail}</p>{check.severity !== "info" && <p className="program-next-step"><strong>Next step:</strong> {check.action}</p>}<small>{check.sources.map((source) => `${source.sourceName} · ${source.locator}`).join(" · ")}</small></div>
      {check.resolution === "open" && check.severity !== "info" && <div className="program-check-actions">
        {check.type === "data_conflict" && check.evidenceBackedValue ? <>
          <button type="button" className="button button-primary button-small" onClick={() => onResolve(`program-${check.id}`)}>Use {check.evidenceBackedValue} in report</button>
          <button type="button" className="button button-secondary button-small" onClick={onAddSources}>Keep current value and explain</button>
        </> : check.type === "kpi_result" ? <button type="button" className="button button-primary button-small" onClick={onAddSources}>Add information</button> : <button type="button" className="button button-primary button-small" onClick={() => onResolve(`program-${check.id}`)}>Mark addressed</button>}
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
  const hasLedger = result.inputStatus.some((item) => item.role === "ledgerExport" && item.available) || result.mappings.length > 0 || Boolean(result.financialAnalysis?.ledgerTransactionCount);
  if (!hasLedger) return <EmptyResultState title="Accounting data is still needed" detail="Add a general-ledger export when it is available. GrantDeskHQ will then suggest grant-budget mappings and calculate the financial schedule from those source rows." action="Add accounting data" onAction={onAddSources} />;
  if (!result.mappings.length) return <EmptyResultState title="No transaction mappings are available yet" detail="GrantDeskHQ could not produce usable mapping suggestions from the current accounting file. Review the file format or add a different export." action="Review accounting data" onAction={onAddSources} />;
  const analysis = result.financialAnalysis;
  const automaticallyMapped = result.mappings.filter((item) => item.mappingConfidence === "high" && !["provisional", "excluded_duplicate", "excluded_outside_period", "excluded_grant_period"].includes(item.reportTreatment || "")).length;
  const categoryReviews = result.mappings.filter((item) => item.reportTreatment === "needs_category_review").length;
  const duplicates = result.financialAnalysis?.controls.find((control) => control.id === "duplicate-transactions")?.transactionIds.length
    || result.mappings.filter((item) => item.reportTreatment === "excluded_duplicate").length;
  const dateExclusions = result.mappings.filter((item) => ["excluded_outside_period", "excluded_grant_period"].includes(item.reportTreatment || "")).length;
  const approvalControl = analysis?.controls.find((control) => control.id === "assistance-approvals" && control.requiresAction);
  const approvalEvidenceNeeded = approvalControl?.transactionIds.length || new Set(result.mappings
    .filter((item) => item.complianceStatus === "evidence_required" && /approval/i.test(`${item.rationale} ${item.complianceDetail || ""}`))
    .map((item) => item.transactionId)).size;
  const groupedExceptionItems = buildFinancialExceptionSummary(result);
  const groupedExceptions = groupedExceptionItems.length;
  return <div className="grid gap-5">
    <section className="financial-ingestion-summary" aria-labelledby="financial-ingestion-title">
      <div className="financial-ingestion-heading"><div><p className="eyebrow">Ledger review completed</p><h3 id="financial-ingestion-title">{analysis?.ledgerTransactionCount || result.mappings.length} ledger rows analyzed</h3><p>GrantDeskHQ mapped the routine rows automatically and brought forward only the exceptions that need judgment.</p></div><span>{groupedExceptions} grouped {groupedExceptions === 1 ? "exception" : "exceptions"} to review</span></div>
      <dl>
        <div><dt>Mapped automatically</dt><dd>{automaticallyMapped}</dd></div>
        <div><dt>Category decisions</dt><dd>{categoryReviews}</dd></div>
        <div><dt>Duplicate rows</dt><dd>{duplicates}</dd></div>
        <div><dt>Excluded by date</dt><dd>{dateExclusions}</dd></div>
        <div><dt>Approval evidence needed</dt><dd>{approvalEvidenceNeeded}</dd></div>
      </dl>
      {groupedExceptionItems.length > 0 && <div className="financial-exception-groups" aria-label="Grouped financial decisions">
        {groupedExceptionItems.map((item, index) => <article key={item.id}>
          <span>Decision {index + 1} of {groupedExceptionItems.length}</span>
          <h4>{item.title}</h4>
          <p>{item.detail}</p>
          {item.transactionIds.length > 0 && <small>{item.transactionIds.length} transaction {item.transactionIds.length === 1 ? "row" : "rows"} covered by this decision</small>}
        </article>)}
      </div>}
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
  return <section className="financial-analysis" aria-labelledby="financial-analysis-title"><div className="financial-analysis-heading"><div><p className="eyebrow">Agreement + ledger checks</p><h3 id="financial-analysis-title">Detailed checks and calculations</h3><p>These checks support the grouped decisions above. Multiple related checks do not create separate tasks for your team.</p></div><span>{analysis.mappedTransactionCount} mapped · {analysis.excludedTransactionCount} excluded</span></div><div className="financial-control-grid">{analysis.controls.map((control) => <article key={control.id} className={control.status}><ReviewLabel status={qualityState(control.status)} /><h4>{control.title}</h4><p>{control.detail}</p>{control.transactionIds.length > 0 && <small>Transactions: {control.transactionIds.join(", ")}</small>}</article>)}</div>{analysis.budgetVariances.length > 0 && <div className="table-scroll"><table className="data-table"><thead><tr><th>Budget category</th><th>Approved</th><th>Current-period actual</th><th>Variance</th><th>Variance %</th><th>Result</th></tr></thead><tbody>{analysis.budgetVariances.map((item) => <tr key={item.category}><th>{item.category}</th><td>{formatCurrency(item.approvedAmount)}</td><td>{formatCurrency(item.actualAmount)}</td><td>{signedCurrency(item.varianceAmount)}</td><td>{item.variancePercent >= 0 ? "+" : ""}{item.variancePercent.toFixed(1)}%</td><td>{item.explanationRequired ? "Explanation required" : "Within threshold"}</td></tr>)}</tbody></table></div>}</section>;
}

function Narrative({ result, onAddSources, onReviewFinancial }: { result: CompilationResult; onAddSources(): void; onReviewFinancial(): void }) {
  const programMissing = result.inputStatus.some((item) => item.role === "programUpdate" && !item.available);
  const financialMissing = result.inputStatus.some((item) => item.role === "ledgerExport" && !item.available);
  const programInsights = buildProgramInsights(result);
  const programReadiness = buildProgramReadiness(result);
  const financialExceptions = buildFinancialExceptionSummary(result);
  const hasFinancialData = !financialMissing || result.mappings.length > 0 || Boolean(result.financialAnalysis?.ledgerTransactionCount);
  const narrative = result.narrative.filter((item) => item.status === "verified"
    && !["needs_confirmation", "unsupported"].includes(item.evidenceType)
    && !/^information required/i.test(item.text)
    && !(financialExceptions.length && /financial narrative|budget-to-actual.*finalized|resolving the duplicate|blocked transactions/i.test(item.text)));
  const unresolvedProgramItems = programReadiness.conflicts + programReadiness.awaitingConfirmation;
  const evidenceInput = result.inputStatus.find((item) => item.role === "supportingEvidence");
  const evidenceRequirement = findUnderlyingEvidenceRequirement(result);
  const evidenceMissingCount = result.missingInputs.filter((item) => item.status === "open" && /evidence|documentation|record|attachment|receipt|approval/i.test(`${item.question} ${item.reason}`)).length;
  const narrativeSourceCount = new Set(narrative.map((item) => `${item.source.sourceName}:${item.source.locator}`)).size;
  const readinessTitle = !programMissing && hasFinancialData
    ? financialExceptions.length
      ? "Most program information is ready. Financial review is still in progress."
      : unresolvedProgramItems
        ? "Most program information is ready. A few results still need confirmation."
        : "Program and financial information are ready for review."
    : programMissing
      ? "Program results are still needed."
      : "Program information is available. Accounting data is still needed.";
  const readinessDetail = !programMissing && hasFinancialData
    ? `GrantDeskHQ has enough confirmed program data to draft most of this report. ${unresolvedProgramItems || "No"} program ${unresolvedProgramItems === 1 ? "item remains" : "items remain"} unresolved, and ${financialExceptions.length || "no"} financial ${financialExceptions.length === 1 ? "decision requires" : "decisions require"} review before approval.`
    : "Add the remaining report inputs when they are available. Confirmed information can be drafted now; missing information will never be invented.";
  return <div className="grid gap-4">
    <section className="draft-readiness-overview" aria-labelledby="draft-readiness-title">
      <div className="draft-readiness-heading"><div><p className="eyebrow">Report readiness</p><h3 id="draft-readiness-title">{readinessTitle}</h3><p>{readinessDetail}</p></div>{(programMissing || !hasFinancialData) && <button type="button" className="button button-secondary button-small" onClick={onAddSources}>Add report inputs</button>}</div>
      <div className="draft-readiness-grid">
        <article><span>Program readiness</span><strong>{programReadiness.ready} KPIs ready</strong><p>{programReadiness.conflicts} {programReadiness.conflicts === 1 ? "conflict" : "conflicts"} · {programReadiness.awaitingConfirmation} awaiting confirmation</p></article>
        <article><span>Financial readiness</span><strong>{result.financialAnalysis ? "Budget-to-actual calculated" : hasFinancialData ? "Budget-to-actual pending review" : "Accounting data needed"}</strong><p>{financialExceptions.length} grouped {financialExceptions.length === 1 ? "decision" : "decisions"} remaining</p></article>
        <article><span>Evidence readiness</span><strong>{narrativeSourceCount} narrative {narrativeSourceCount === 1 ? "source" : "sources"} linked</strong><p>{evidenceInput?.available ? "Supporting files available for review" : evidenceRequirement ? `${evidenceMissingCount || "Required"} underlying evidence ${evidenceMissingCount === 1 ? "item is" : "items are"} still needed` : "No separate evidence gap identified"}</p></article>
      </div>
    </section>
    {programInsights.length > 0 && <section className="program-intelligence" aria-labelledby="program-intelligence-title"><div className="program-intelligence-heading"><div><p className="eyebrow">Confirmed data + award rules</p><h3 id="program-intelligence-title">Program results at a glance</h3></div><span>{programInsights.length} cross-source checks</span></div><div className="program-intelligence-grid">{programInsights.map((insight) => <article key={insight.id} className={`program-insight ${insight.tone}`}><div className="program-insight-top"><MappingStateBadge label={insight.status} tone={insight.tone} /><small>Sources: {insight.sources.map((source) => `${source.sourceName} · ${source.locator}`).join(" + ")}</small></div><h4>{insight.title}</h4><strong className="program-insight-value">{insight.value}</strong><p>{insight.detail}</p></article>)}</div></section>}
    {hasFinancialData && financialExceptions.length > 0 && <section className="financial-draft-readiness" aria-labelledby="financial-draft-readiness-title"><div><p className="eyebrow">Financial readiness</p><h3 id="financial-draft-readiness-title">{result.financialAnalysis ? `Financial section needs ${financialExceptions.length} ${financialExceptions.length === 1 ? "decision" : "decisions"}` : "Budget-to-actual pending financial review"}</h3><p className="financial-readiness-copy">{result.financialAnalysis ? "GrantDeskHQ calculated the budget-to-actual schedule from the approved award budget and uploaded ledger. Routine transactions are already mapped; only these exceptions need attention." : "GrantDeskHQ will generate the required budget-to-actual schedule from the approved award budget and uploaded ledger once the remaining transaction exceptions are resolved."}</p><ul>{financialExceptions.map((item) => <li key={item.id}><AlertTriangle aria-hidden="true" /><span><strong>{item.title}</strong>{item.detail}</span></li>)}</ul></div><button type="button" className="button button-secondary" onClick={onReviewFinancial}>Review financial exceptions <ArrowRight aria-hidden="true" /></button></section>}
    {narrative.length ? <section className="source-linked-draft" aria-labelledby="source-linked-draft-title"><div className="draft-section-heading"><p className="eyebrow">Data → interpretation → draft</p><h3 id="source-linked-draft-title">Source-linked draft language</h3><p>Confirmed facts, their narrative source, and any underlying evidence requirement remain visibly separate.</p></div><div className="compiled-list">{narrative.map((item) => {
      const underlyingEvidence = narrativeEvidenceState(result, item, evidenceRequirement);
      return <article key={item.id}>
        <div className="compiled-list-main"><div><div className="draft-status-row"><MappingStateBadge label="Narrative source verified" tone="success" /><MappingStateBadge label="Draft ready for review" tone="neutral" /></div><p className="eyebrow">Draft language · {humanEvidenceType(item.evidenceType)}</p><h3>{item.text}</h3></div></div>
        <div className="draft-source-column"><p className="eyebrow draft-evidence-label">Source for this draft</p><Source reference={item.source} /><div className={`underlying-evidence-state ${underlyingEvidence.tone}`}><p className="eyebrow">Required underlying evidence</p><strong>{underlyingEvidence.label}</strong><p>{underlyingEvidence.detail}</p></div></div>
      </article>;
    })}</div></section> : <p className="empty-copy">No source-supported narrative can be drafted from the current inputs.</p>}
  </div>;
}

function findUnderlyingEvidenceRequirement(result: CompilationResult) {
  const verified = result.requirements.filter((item) => item.status === "verified");
  return verified.find((item) => /KPI[^.]{0,100}(?:evidence|records?)|evidence index|reported (?:KPI|outcome|program)[^.]{0,100}(?:source|evidence|records?)/i.test(`${item.requirement} ${item.source.excerpt}`))
    || verified.find((item) => /(?:program|participant|outcome|KPI)[^.]{0,120}(?:supporting evidence|underlying (?:source|evidence)|case-management records?|attendance records?)/i.test(`${item.requirement} ${item.source.excerpt}`));
}

function narrativeEvidenceState(result: CompilationResult, item: CompilationResult["narrative"][number], evidenceRequirement: CompilationResult["requirements"][number] | undefined) {
  const families = narrativeClaimKpiFamilies(item.text);
  if (!families.length || !evidenceRequirement) return { tone: "neutral", label: "No separate requirement identified", detail: "The uploaded award did not identify a separate underlying-evidence requirement for this statement." };
  const filesByFamily = new Map<string, string[]>();
  for (const file of result.evidenceFiles || []) {
    if (file.parsingStatus !== "parsed" || file.relevance === "irrelevant" || file.relevance === "unmatched") continue;
    for (const match of file.matches.filter((candidate) => candidate.status === "matched" && (candidate.confidence >= 0.88 || candidate.confirmedByUser))) {
      for (const family of evidenceMatchKpiFamilies(file.name, match.targetId, match.rationale, match.source)) {
        filesByFamily.set(family, [...new Set([...(filesByFamily.get(family) || []), file.name])]);
      }
    }
  }
  const missing = families.filter((family) => !filesByFamily.get(family)?.length);
  const matchedFiles = [...new Set(families.flatMap((family) => filesByFamily.get(family) || []))];
  if (!missing.length) return { tone: "success", label: "Underlying evidence matched", detail: matchedFiles.join(" · ") };
  if (matchedFiles.length) return { tone: "review", label: "Some underlying evidence is still needed", detail: `Matched: ${matchedFiles.join(" · ")}. Still needed: ${missing.map(kpiFamilyLabel).join(", ")}.` };
  return { tone: "review", label: "No matching evidence uploaded yet", detail: `The narrative source supports this draft, but the award also requires underlying records: ${evidenceRequirement.requirement}` };
}

function narrativeClaimKpiFamilies(value: string) {
  const normalized = value.replace(/[_/\\-]+/g, " ");
  const families: string[] = [];
  if (/(?:served|serving)\s+\d[\d,]*\s+(?:unduplicated\s+)?households?|\d[\d,]*\s+(?:unduplicated\s+)?households?\s+(?:were\s+)?served/i.test(normalized)) families.push("p1");
  if (/\d[\d,]*\s+(?:housing(?: stability)?\s+)?assessments?|(?:completed|reported)\s+\d[\d,]*\s+(?:housing(?: stability)?\s+)?assessments?/i.test(normalized)) families.push("p2");
  if (/(?:placed|placing|secured|securing)\s+\d[\d,]*\s+(?:households?|(?:stable housing\s+)?placements?\b(?!\s+ready))|\d[\d,]*\s+(?:households?\s+(?:were\s+)?placed|(?:stable housing\s+)?placements?\b(?!\s+ready))/i.test(normalized)) families.push("p3");
  if (/(?:120\s*days?|120 day)[^.]{0,100}\d[\d,]*\s+of\s+\d[\d,]*|\d[\d,]*\s+of\s+\d[\d,]*[^.]{0,100}(?:120\s*days?|120 day)/i.test(normalized)) families.push("p4");
  if (/\d[\d,]*\s+(?:households?[^.]{0,30})?benefits?\s+screenings?|benefits?\s+screenings?[^.]{0,30}\d[\d,]*/i.test(normalized)) families.push("p5");
  if (/(?:average\s+)?client satisfaction[^.]{0,40}\d+(?:\.\d+)?\s*(?:\/|out of)\s*5/i.test(normalized)) families.push("p6");
  return [...new Set(families)];
}

function evidenceMatchKpiFamilies(fileName: string, targetId: string, rationale: string, source: CompilationResult["narrative"][number]["source"]) {
  const explicitTarget = targetId.match(/(?:^|[:_-])(p[1-6])(?:$|[:_-])/i)?.[1]?.toLowerCase();
  return [...new Set([
    ...(explicitTarget ? [explicitTarget] : []),
    ...narrativeKpiFamilies(`${fileName} ${rationale} ${source.sourceName} ${source.locator} ${source.excerpt}`)
  ])];
}

function narrativeKpiFamilies(value: string) {
  const normalized = value.replace(/[_/\\-]+/g, " ");
  const families: string[] = [];
  if (/\bp1\b|unduplicated households?|households? served|enrollment records?/i.test(normalized)) families.push("p1");
  if (/\bp2\b|housing(?: stability)? assessments?|assessment records?|completed assessments?/i.test(normalized)) families.push("p2");
  if (/\bp3\b|households? placed|placing\s+\d[\d,]*\s+households?|housing placements?|placement records?/i.test(normalized)) families.push("p3");
  if (/\bp4\b|120 day|retention|follow up records?|remained (?:stably )?housed/i.test(normalized)) families.push("p4");
  if (/\bp5\b|benefits? screenings?|screening records?/i.test(normalized)) families.push("p5");
  if (/\bp6\b|client satisfaction|satisfaction survey|survey responses?/i.test(normalized)) families.push("p6");
  return [...new Set(families)];
}

function kpiFamilyLabel(value: string) {
  return ({ p1: "households served", p2: "housing assessments", p3: "housing placements", p4: "120-day housing retention", p5: "benefits screenings", p6: "client satisfaction" } as Record<string, string>)[value] || value.toUpperCase();
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
      <div className="attention-summary-list">{attention.map((item) => <article key={item.id} data-action-id={item.id} data-action-kind={item.kind}><AlertTriangle aria-hidden="true" /><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div>
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

export function AgreementSetupCard({ preflight, onApply, onReplaceAgreement, onEditSetup }: { preflight: CompilationPreflightResult; onApply(): void; onReplaceAgreement?(): void; onEditSetup?(): void }) {
  const setup = agreementSetup(preflight);
  if (!setup.grantName) return null;
  const changes = preflight.setupConflicts;
  const hasIdentityChange = changes.some((conflict) => conflict.type === "organization_identity" || conflict.type === "grant_identity");
  return <section className="agreement-setup-card" aria-labelledby="agreement-setup-title">
    <div className="agreement-setup-heading">
      <div><p className="eyebrow">Recommended setup</p><h3 id="agreement-setup-title">{hasIdentityChange ? "We found a different grant in your award agreement" : "The reporting period does not match the award agreement"}</h3><p>{setup.period ? "We can update the organization, grant, and reporting period automatically." : "We can update the organization and grant automatically. Choose a reporting period after the update."}</p></div>
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
    <button type="button" className="button button-primary" onClick={onApply}>{setup.period ? "Use agreement setup" : "Use verified grant details"} <ArrowRight aria-hidden="true" /></button>
    <small>The previous manual setup will remain in the report’s audit history.</small>
    <details className="agreement-change-review">
      <summary><span>Review what will change</span><small>{changes.length} {changes.length === 1 ? "update" : "updates"}</small></summary>
      <div className="agreement-change-list">
        {changes.map((conflict) => <article key={conflict.id}>
          <div><strong>{conflict.title}</strong><small>Source: Award agreement · {cleanSourceLocator(conflict.source.locator)}</small></div>
          <dl>
            <div><dt>Current setup</dt><dd>{conflict.enteredValue}</dd></div>
            <div><dt>From award agreement</dt><dd>{conflict.type === "reporting_period" && conflict.suggestedValue ? `${conflict.suggestedLabel || "First reporting period"}: ${conflict.suggestedValue}${conflict.suggestedDueDate ? ` · Due ${conflict.suggestedDueDate}` : ""}` : conflict.sourceValue}</dd></div>
          </dl>
        </article>)}
      </div>
      {(onReplaceAgreement || onEditSetup) && <div className="agreement-change-actions">
        {onReplaceAgreement && <button type="button" className="button button-secondary button-small" onClick={onReplaceAgreement}>Replace agreement</button>}
        {onEditSetup && <button type="button" className="button button-secondary button-small" onClick={onEditSetup}>Edit setup manually</button>}
      </div>}
    </details>
  </section>;
}

export function ReportingSchedule({ periods, selectedPeriodId, onSelect }: {
  periods: CompilationPreflightResult["reportingPeriods"];
  selectedPeriodId: string;
  onSelect(period: GrantReportingPeriod): void;
}) {
  const verified = periods.filter((period) => period.status === "verified");
  const ordered = [...verified].sort((left, right) => reportingPeriodOrder(left) - reportingPeriodOrder(right));
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

export function ReportWorkflow({ obligations, referencePeriod, availableSources = [] }: { obligations: GrantWorkflowObligation[]; referencePeriod?: GrantReportingPeriod; availableSources?: SourceRole[] }) {
  const normalizedObligations = normalizeWorkflowObligations(obligations);
  const groups: Array<{ id: ObligationApplicability; title: string; detail: string }> = [
    { id: "required_now", title: "Required for this report", detail: "Work the team needs to complete for this reporting period." },
    { id: "conditional", title: "Conditional requirements", detail: "GrantDeskHQ monitors these automatically and creates an action only when the condition occurs." },
    { id: "future", title: "Required later", detail: "Obligations the agreement assigns to a later report or milestone." },
    { id: "not_applicable", title: "Not required for this report", detail: "Items the agreement explicitly excludes from this reporting period." }
  ];
  return <section className="report-workflow" aria-labelledby="report-workflow-title">
    <div className="report-workflow-heading"><div><p className="eyebrow">Report workflow</p><h3 id="report-workflow-title">What your team needs to complete next</h3><p>{referencePeriod ? `${referencePeriod.title} · ${humanDateRange(referencePeriod.startDate, referencePeriod.endDate)}` : "Selected reporting obligation"}</p></div><ClipboardCheck aria-hidden="true" /></div>
    <div className="report-workflow-groups">
      {groups.map((group) => {
        const items = normalizedObligations.filter((obligation) => obligation.applicability === group.id);
        if (!items.length) return null;
        return <section key={group.id} className={`workflow-group ${group.id}`}><div><h4>{group.title}</h4><p>{group.detail}</p></div><div className="workflow-obligation-list">
          {items.map((item) => {
            const workflowStatus = obligationWorkflowStatus(item, availableSources);
            return <article key={item.id}>
            <div className="workflow-obligation-top"><span className="workflow-owner">{item.owner}</span><SourceStatusBadge status={item.status} /></div>
            <strong>{item.title}</strong><p>{humanizeWorkflowText(item.detail)}</p><div className={`workflow-task-status ${workflowStatus.tone}`}><span>Workflow status</span><strong>{workflowStatus.label}</strong></div>
            {group.id === "conditional" && item.trigger && !/^not applicable|none$/i.test(item.trigger) && <small><b>Trigger:</b> {humanizeWorkflowText(item.trigger)}</small>}
            <small>Source: Award agreement · {cleanSourceLocator(item.source.locator)}</small>
          </article>;})}
        </div></section>;
      })}
    </div>
  </section>;
}

function SourceStatusBadge({ status }: { status: ReviewState }) {
  const label = status === "verified" ? "Source verified" : status === "review" ? "Source needs review" : status === "blocked" ? "Source conflict" : "Source not evaluated";
  const tone = status === "verified" ? "success" : status === "review" ? "review" : status === "blocked" ? "blocked" : "neutral";
  return <MappingStateBadge label={label} tone={tone} />;
}

function obligationWorkflowStatus(item: GrantWorkflowObligation, availableSources: SourceRole[]) {
  const available = new Set(availableSources);
  const text = `${item.title} ${item.detail}`;
  if (item.applicability === "conditional") return { label: "Monitoring · trigger evaluated during report analysis", tone: "monitoring" };
  if (item.applicability === "future") return { label: futureWorkflowStatus(item), tone: "future" };
  if (item.applicability === "not_applicable") return { label: "Not required for this report", tone: "future" };
  if (item.owner === "Finance") return available.has("ledgerExport")
    ? { label: "Accounting data available · validation pending", tone: "available" }
    : { label: "Accounting data needed", tone: "needed" };
  if (item.owner === "Program") return available.has("programUpdate")
    ? { label: /de-identified|social security|data privacy|participant information/i.test(text) ? "Program input available · privacy scan runs during draft preparation" : "Program input available · validation pending", tone: "available" }
    : { label: "Program input needed", tone: "needed" };
  if (item.owner === "Approver") return { label: "Not started · begins after draft preparation", tone: "not-started" };
  return { label: "Not started", tone: "not-started" };
}

function reportingPeriodOrder(period: GrantReportingPeriod) {
  const dueDate = isUsableDate(period.dueDate) ? Date.parse(period.dueDate) : Number.NaN;
  if (Number.isFinite(dueDate)) return dueDate;
  const endDate = Date.parse(period.endDate);
  return Number.isFinite(endDate) ? endDate : Date.parse(period.startDate);
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
  const sourceMatchedItems = findings.filter((item) => item.verdict === "source_matched" || item.evidenceSatisfiedBy?.length).length;
  const itemsNeedingReview = findings.filter((item) => item.verdict === "review" && !item.evidenceSatisfiedBy?.length).length;
  const blockedItems = findings.filter((item) => item.verdict === "blocked" && !item.evidenceSatisfiedBy?.length).length;
  const blockedChecks = result.qualityChecks.filter((check) => check.required && check.status === "blocked" && !check.evidenceSatisfiedBy?.length).length;
  const reviewChecks = result.qualityChecks.filter((check) => check.required && check.status === "review" && !check.evidenceSatisfiedBy?.length).length;
  const missingRequiredSources = result.inputStatus.filter((item) => item.requiredForCompletion && !item.available).length;
  const openMissingInputs = result.missingInputs.filter((item) => item.status === "open" && !item.evidenceSatisfiedBy?.length).length;
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
  const evidence: File[] = [];
  const unmatched: File[] = [];

  for (const file of selected) {
    const hinted = roleHints.find(([role, pattern]) => pattern.test(file.name) && acceptsFile(role, file))?.[0];
    if (hinted === "supportingEvidence") {
      evidence.push(file);
      continue;
    }
    const role = hinted && !occupied.has(hinted)
      ? hinted
      : sourceFields.find((field) => !occupied.has(field.role) && acceptsFile(field.role, file))?.role;
    if (!role) {
      if (acceptsEvidenceFile(file)) evidence.push(file);
      else unmatched.push(file);
      continue;
    }
    assigned[role] = file;
    occupied.add(role);
  }

  return { assigned, evidence, unmatched };
}

function acceptsFile(role: SourceRole, file: File) {
  if (role === "supportingEvidence") return acceptsEvidenceFile(file);
  const field = sourceFields.find((candidate) => candidate.role === role);
  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  return Boolean(field?.accept.split(",").includes(extension));
}

function sourceLabel(role: SourceRole) {
  if (role === "ledgerExport") return "Accounting data";
  if (role === "supportingEvidence") return "Supporting evidence";
  return sourceFields.find((field) => field.role === role)?.label || "the recommended field";
}

function compilationFingerprint(
  meta: { organizationName: string; grantName: string; reportingPeriod: string },
  files: Array<[SourceRole, File]>,
  setupDecisions: SetupDecision[]
) {
  return JSON.stringify({
    ...meta,
    files: files.map(([role, file]) => [role, file.name, file.size, file.lastModified]),
    setupDecisions: setupDecisions.map((decision) => [decision.action, decision.sourceName, decision.selectedObligationId || ""])
  });
}

function indefiniteSourceLabel(role: SourceRole) {
  if (role === "ledgerExport") return "accounting data";
  const label = sourceLabel(role).toLowerCase();
  return `${/^[aeiou]/.test(label) ? "an" : "a"} ${label}`;
}

async function fileToCompilerFile(role: SourceRole, file: File, evidenceId?: string, uploadedAt?: string): Promise<CompilerFile> {
  return { role, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data: await readAsDataUrl(file), ...(evidenceId ? { evidenceId, uploadedAt: uploadedAt || new Date().toISOString() } : {}) };
}

function acceptsEvidenceFile(file: File) {
  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  return evidenceAccept.split(",").includes(extension);
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

function humanTimestamp(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "time unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed);
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

function humanizeWorkflowText(value: string) {
  return value.replace(/\b(20\d{2}-\d{2}-\d{2})\b/g, (date) => isUsableDate(date) ? humanDate(date) : date);
}
