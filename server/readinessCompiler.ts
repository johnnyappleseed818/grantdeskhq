import { readinessSchema, readinessVerificationSchema } from "./readinessSchema.ts";
import type { ReadinessRequest, ReadinessResult, ValidationFinding } from "../src/types/prototype.ts";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_VERIFIER_MODEL = "gpt-5.6-luna";

interface OpenAIResponse {
  model?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
}

type ReadinessDraft = Omit<ReadinessResult, "generatedAt" | "model" | "validation">;

export async function compileReadinessAudit(request: ReadinessRequest): Promise<ReadinessResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const verifierModel = process.env.OPENAI_VERIFIER_MODEL || DEFAULT_VERIFIER_MODEL;
  const sourceContent = request.files.map((file) => ({ type: "input_file" as const, filename: file.name, file_data: file.data }));

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: [{ type: "input_text", text: "You are the evidence-first GrantDeskHQ readiness compiler. Extract only reporting obligations, dates, financial requirements, program metrics, and evidence needs directly supported by the uploaded award documents. Never invent a deadline, metric, report cadence, threshold, form, or requirement. Use 'unknown' and add an evidence gap when a fact is absent. Every extracted item requires a precise, faithful source citation. Output is a draft for professional review, not legal, accounting, audit, or compliance advice." }] },
        { role: "user", content: [{ type: "input_text", text: `Prepare a concise Grant Reporting Readiness Audit for ${request.organizationName}; grant: ${request.grantName}. File roles: ${request.files.map((file) => `${file.role}=${file.name}`).join(", ")}.` }, ...sourceContent] }
      ],
      text: { format: { type: "json_schema", name: "grant_readiness_audit", strict: true, schema: readinessSchema } }
    })
  });
  const body = await response.json() as OpenAIResponse;
  if (!response.ok) throw new Error(body.error?.message || `Readiness compiler failed with status ${response.status}.`);
  const outputText = body.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("The readiness compiler returned no structured output.");
  const draft = JSON.parse(outputText) as ReadinessDraft;
  const findings = await verifyReadiness(request, draft, apiKey, verifierModel, sourceContent);
  const findingMap = new Map(findings.map((finding) => [finding.itemId, finding.verdict]));
  const verifiedDraft: ReadinessDraft = {
    ...draft,
    nextDeadline: { ...draft.nextDeadline, status: verdictToState(findingMap.get("next-deadline")) },
    obligations: draft.obligations.map((item) => ({ ...item, status: verdictToState(findingMap.get(item.id)) })),
    financialRequirements: draft.financialRequirements.map((item) => ({ ...item, status: verdictToState(findingMap.get(item.id)) })),
    programMetrics: draft.programMetrics.map((item) => ({ ...item, status: verdictToState(findingMap.get(item.id)) }))
  };
  const sourceMatchedItems = findings.filter((finding) => finding.verdict === "source_matched").length;
  const itemsNeedingReview = findings.filter((finding) => finding.verdict === "review").length;
  const blockedItems = findings.filter((finding) => finding.verdict === "blocked").length;
  return {
    ...verifiedDraft,
    validation: {
      evidenceCoveragePercent: Math.round((sourceMatchedItems / (findings.length || 1)) * 100),
      sourceMatchedItems,
      itemsNeedingReview,
      blockedItems,
      method: "A separate verification pass challenges every extracted deadline, obligation, financial requirement, and program metric against the uploaded source files. Unsupported items remain in review or are blocked.",
      findings
    },
    generatedAt: new Date().toISOString(),
    model: body.model || model
  };
}

async function verifyReadiness(request: ReadinessRequest, draft: ReadinessDraft, apiKey: string, model: string, sourceContent: Array<{ type: "input_file"; filename: string; file_data: string }>): Promise<ValidationFinding[]> {
  const candidates = [
    { id: "next-deadline", text: `${draft.nextDeadline.date}: ${draft.nextDeadline.label}`, proposedSource: draft.nextDeadline.source },
    ...draft.obligations.map((item) => ({ id: item.id, text: `${item.label}: ${item.detail}`, proposedSource: item.source })),
    ...draft.financialRequirements.map((item) => ({ id: item.id, text: `${item.label}: ${item.detail}`, proposedSource: item.source })),
    ...draft.programMetrics.map((item) => ({ id: item.id, text: `${item.label}: ${item.detail}`, proposedSource: item.source }))
  ];
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: [{ type: "input_text", text: "Act as a skeptical grant-document verifier. Return one finding for every candidate ID. Mark source_matched only when the claim and proposed excerpt are directly supported by the uploaded files. Mark review when wording, date, scope, or source is ambiguous. Mark blocked when contradicted or unsupported. Never repair or supplement claims with general knowledge." }] },
        { role: "user", content: [{ type: "input_text", text: `Verify the proposed readiness items for ${request.organizationName}: ${JSON.stringify(candidates)}` }, ...sourceContent] }
      ],
      text: { format: { type: "json_schema", name: "grant_readiness_verification", strict: true, schema: readinessVerificationSchema } }
    })
  });
  const body = await response.json() as OpenAIResponse;
  if (!response.ok) throw new Error(body.error?.message || `Readiness verification failed with status ${response.status}.`);
  const outputText = body.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("Readiness verification returned no structured output.");
  return (JSON.parse(outputText) as { findings: ValidationFinding[] }).findings;
}

function verdictToState(verdict?: ValidationFinding["verdict"]): "verified" | "review" | "blocked" {
  if (verdict === "source_matched") return "verified";
  if (verdict === "blocked") return "blocked";
  return "review";
}
