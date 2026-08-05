import { compilationSchema, verificationSchema } from "./compilerSchema.ts";
import type { CompilationRequest, CompilationResult, ValidationFinding } from "../src/types/prototype.ts";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_VERIFIER_MODEL = "gpt-5.6-luna";

const SYSTEM_PROMPT = `You are the evidence-first report compiler inside GrantDeskHQ, a post-award grant-reporting prototype.

Build a professional first draft for human review from only the supplied source files. Never invent a transaction, award rule, program result, explanation, citation, or source excerpt. If evidence is absent, create a missing-input question or a blocked quality check. Treat mappings as suggestions. Keep unresolved ledger rows out of mapped totals. Distinguish the annual budget from the elapsed-period spending plan. Flag contradictions. Every material narrative statement must include a precise source citation. Outputs are drafts, never audit findings, compliance conclusions, or automatic submissions.`;

interface OpenAIResponse {
  model?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
}

export async function compileGrantReport(request: CompilationRequest): Promise<CompilationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const verifierModel = process.env.OPENAI_VERIFIER_MODEL || DEFAULT_VERIFIER_MODEL;

  const sourceContent = request.files.map((file) => ({
    type: "input_file" as const,
    filename: file.name,
    file_data: file.data
  }));

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Compile a report draft for organization: ${request.organizationName}; grant: ${request.grantName}; reporting period: ${request.reportingPeriod}. File roles: ${request.files.map((file) => `${file.role}=${file.name}`).join(", ")}. Return concise, reviewable output.`
            },
            ...sourceContent
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "grant_report_compilation",
          strict: true,
          schema: compilationSchema
        }
      }
    })
  });

  const body = await response.json() as OpenAIResponse;
  if (!response.ok) throw new Error(body.error?.message || `AI compiler request failed with status ${response.status}.`);

  const outputText = body.output
    ?.flatMap((item) => item.content || [])
    .find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("The AI compiler returned no structured report output.");

  const compiled = JSON.parse(outputText) as Omit<CompilationResult, "generatedAt" | "model" | "validation">;
  const findings = await verifyAgainstSources(request, compiled, apiKey, verifierModel, sourceContent);
  const sourceMatchedItems = findings.filter((finding) => finding.verdict === "source_matched").length;
  const itemsNeedingReview = findings.filter((finding) => finding.verdict === "review").length;
  const blockedItems = findings.filter((finding) => finding.verdict === "blocked").length;
  const denominator = findings.length || 1;

  return {
    ...compiled,
    validation: {
      evidenceCoveragePercent: Math.round((sourceMatchedItems / denominator) * 100),
      sourceMatchedItems,
      itemsNeedingReview,
      blockedItems,
      method: "A separate AI verification pass checks each material output against the uploaded sources. Items without direct support remain in review or are blocked from export.",
      findings
    },
    generatedAt: new Date().toISOString(),
    model: body.model || model
  };
}

async function verifyAgainstSources(
  request: CompilationRequest,
  compiled: Omit<CompilationResult, "generatedAt" | "model" | "validation">,
  apiKey: string,
  model: string,
  sourceContent: Array<{ type: "input_file"; filename: string; file_data: string }>
): Promise<ValidationFinding[]> {
  const candidates = {
    requirements: compiled.requirements.map(({ id, requirement, source }) => ({ id, text: requirement, proposedSource: source })),
    mappings: compiled.mappings.map(({ transactionId, description, amount, suggestedCategory, rationale }) => ({ id: transactionId, description, amount, suggestedCategory, rationale })),
    narrative: compiled.narrative.map(({ id, text, source }) => ({ id, text, proposedSource: source }))
  };
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: "Act as a skeptical grant-report evidence verifier. Check every candidate against the supplied source files. Mark source_matched only when the material claim or mapping is directly supported and the excerpt is faithful. Mark review when support is ambiguous. Mark blocked when contradicted or unsupported. Never fill gaps with general knowledge. Return one finding for every candidate ID." }]
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: `Independently verify these compiled candidates for ${request.organizationName}: ${JSON.stringify(candidates)}` },
            ...sourceContent
          ]
        }
      ],
      text: { format: { type: "json_schema", name: "grant_report_verification", strict: true, schema: verificationSchema } }
    })
  });
  const body = await response.json() as OpenAIResponse;
  if (!response.ok) throw new Error(body.error?.message || `Evidence verification failed with status ${response.status}.`);
  const outputText = body.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("Evidence verification returned no structured output.");
  return (JSON.parse(outputText) as { findings: ValidationFinding[] }).findings;
}
