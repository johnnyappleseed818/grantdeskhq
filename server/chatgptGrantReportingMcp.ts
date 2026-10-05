import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import type { AuthenticatedUser } from "./auth.ts";
import { beginFreeFirstAward, finalizeCompilationAnalysisCache, listReports, readBillingAttribution, readCompilationAnalysisCache, readCompilationById, readCompilationByRequest, saveCompilation } from "./persistence.ts";
import type { CompilationRequest, CompilationResult, PersistedCompilationResponse, SourceRole } from "../src/types/prototype.ts";
import { McpOauthAuthenticationError, grantReportingMcpScopes, hasMcpScope, oauthChallenge, requireGrantReportingMcpUser } from "./chatgptGrantReportingOAuth.ts";
import { validateCompilationRequest } from "../src/lib/prototype.ts";
import { normalizeCompilationSources } from "./sourceNormalization.ts";
import { compileGrantReport } from "./reportCompiler.ts";

const reportIdSchema = z.string().regex(/^report_[a-f0-9]{32}$/).describe("A GrantDeskHQ report ID returned by list_grant_reports.");
const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const readSecurity = [{ type: "oauth2" as const, scopes: [grantReportingMcpScopes.read] }];
const writeSecurity = [{ type: "oauth2" as const, scopes: [grantReportingMcpScopes.read, grantReportingMcpScopes.write] }];
const documentTextSchema = z.string().trim().min(1).max(40_000);
const reportSummarySchema = z.object({
  id: z.string(), organizationName: z.string(), grantName: z.string(), reportingPeriod: z.string(),
  status: z.enum(["review_required", "ready"]), createdAt: z.string(), updatedAt: z.string(),
  sourceCount: z.number(), evidenceCoveragePercent: z.number(), unresolvedItems: z.number()
});
const reportListOutputSchema = z.object({ reports: z.array(reportSummarySchema) });
const reportInputSchema = {
  requestId: z.string().regex(/^mcp_[a-zA-Z0-9_-]{12,100}$/),
  organizationName: z.string().trim().min(2).max(200),
  grantName: z.string().trim().min(2).max(200),
  reportingPeriod: z.string().trim().min(2).max(200),
  awardAgreementText: documentTextSchema,
  approvedBudgetText: documentTextSchema.optional(),
  ledgerExportText: documentTextSchema.optional(),
  funderTemplateText: documentTextSchema.optional(),
  programUpdateText: documentTextSchema.optional()
};
type DocumentTextInput = { requestId: string; organizationName: string; grantName: string; reportingPeriod: string; awardAgreementText: string; approvedBudgetText?: string; ledgerExportText?: string; funderTemplateText?: string; programUpdateText?: string };

type ToolContent = { content: Array<{ type: "text"; text: string }>; structuredContent: Record<string, unknown> };
type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  securitySchemes: Array<{ type: "oauth2"; scopes: string[] }>;
  outputSchema?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

/**
 * The currently installed MCP SDK (1.32) preserves arbitrary `_meta` but
 * does not yet serialize the MCP `securitySchemes` field from registerTool.
 * ChatGPT needs that field in an unauthenticated tools/list response before
 * it can launch OAuth linking. Keep this declaration at the protocol boundary
 * rather than relying on a TypeScript cast that the SDK later drops.
 */
export function grantReportingMcpToolDefinitions(): McpToolDefinition[] {
  const reportId = { type: "string", pattern: "^report_[a-f0-9]{32}$" };
  const text = { type: "string", minLength: 1, maxLength: 40_000 };
  const tools: McpToolDefinition[] = [
    { name: "get_grantdeskhq_profile", title: "Get linked GrantDeskHQ profile", description: "Returns the stable profile for the linked GrantDeskHQ tenant.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: readOnlyAnnotations, securitySchemes: readSecurity, _meta: { "openai/profile": true } },
    { name: "list_grant_reports", title: "List GrantDeskHQ reports", description: "Lists only summary fields for reports belonging to the authenticated GrantDeskHQ tenant. Use a report-specific tool for analysis or draft content.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { reports: { type: "array", items: { type: "object", properties: { id: { type: "string" }, organizationName: { type: "string" }, grantName: { type: "string" }, reportingPeriod: { type: "string" }, status: { enum: ["review_required", "ready"] }, createdAt: { type: "string" }, updatedAt: { type: "string" }, sourceCount: { type: "number" }, evidenceCoveragePercent: { type: "number" }, unresolvedItems: { type: "number" } }, required: ["id", "organizationName", "grantName", "reportingPeriod", "status", "createdAt", "updatedAt", "sourceCount", "evidenceCoveragePercent", "unresolvedItems"], additionalProperties: false } } }, required: ["reports"], additionalProperties: false }, annotations: readOnlyAnnotations, securitySchemes: readSecurity },
    { name: "get_agreement_analysis", title: "Get source-linked agreement analysis", description: "Returns the persisted grant profile and source-cited obligations for one report owned by the authenticated tenant.", inputSchema: { type: "object", properties: { reportId }, required: ["reportId"], additionalProperties: false }, annotations: readOnlyAnnotations, securitySchemes: readSecurity },
    { name: "get_budget_vs_actual", title: "Get deterministic budget versus actual", description: "Returns persisted deterministic budget-to-actual calculations and financial controls for one tenant-owned report.", inputSchema: { type: "object", properties: { reportId }, required: ["reportId"], additionalProperties: false }, annotations: readOnlyAnnotations, securitySchemes: readSecurity },
    { name: "get_missing_report_inputs", title: "Get missing inputs and review items", description: "Returns persisted missing-input questions and source-cited review items for one tenant-owned report.", inputSchema: { type: "object", properties: { reportId }, required: ["reportId"], additionalProperties: false }, annotations: readOnlyAnnotations, securitySchemes: readSecurity },
    { name: "get_reviewable_report_draft", title: "Get a reviewable draft", description: "Returns the persisted source-linked draft narrative for one tenant-owned report. It cannot submit a report.", inputSchema: { type: "object", properties: { reportId }, required: ["reportId"], additionalProperties: false }, annotations: readOnlyAnnotations, securitySchemes: readSecurity },
    { name: "create_report_from_document_text", title: "Create a source-linked GrantDeskHQ report from document text", description: "Creates one tenant-owned report from user-provided agreement, budget, ledger, template, or program-update text. It never submits to a funder.", inputSchema: { type: "object", properties: { requestId: { type: "string", pattern: "^mcp_[a-zA-Z0-9_-]{12,100}$" }, organizationName: { type: "string", minLength: 2, maxLength: 200 }, grantName: { type: "string", minLength: 2, maxLength: 200 }, reportingPeriod: { type: "string", minLength: 2, maxLength: 200 }, awardAgreementText: text, approvedBudgetText: text, ledgerExportText: text, funderTemplateText: text, programUpdateText: text }, required: ["requestId", "organizationName", "grantName", "reportingPeriod", "awardAgreementText"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }, securitySchemes: writeSecurity }
  ];
  return tools.map((tool) => ({ ...tool, securitySchemes: tool.securitySchemes.map((scheme) => ({ ...scheme, scopes: [...scheme.scopes] })) }));
}

function toolContent(payload: Record<string, unknown>): ToolContent {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
}

/** These projections deliberately use only a customer's persisted report.
 * They neither access files directly nor accept a tenant or organization ID
 * from the tool caller; ownership is enforced by readCompilationById. */
export function agreementAnalysisProjection(saved: PersistedCompilationResponse) {
  const result = saved.result;
  return {
    report: saved.report,
    grantProfile: result.grantProfile,
    requirements: result.requirements.slice(0, 150).map((item) => ({ id: item.id, requirement: item.requirement, canonicalType: item.canonicalType || null, applicability: item.applicability || null, status: item.status, confidence: item.confidence, source: item.source })),
    workflow: result.workflow,
    sourceFiles: saved.sources.map((source) => ({ role: source.role, name: source.name, mimeType: source.mimeType, parsingStatus: source.parsingStatus || null, relevance: source.relevance || null }))
  };
}

export function budgetVsActualProjection(result: CompilationResult) {
  const financial = result.financialAnalysis;
  return {
    generatedAt: result.generatedAt,
    financialAnalysisAvailable: Boolean(financial),
    ledgerTransactionCount: financial?.ledgerTransactionCount ?? null,
    mappedTransactionCount: financial?.mappedTransactionCount ?? null,
    excludedTransactionCount: financial?.excludedTransactionCount ?? null,
    mappedActualTotal: financial?.mappedActualTotal ?? null,
    budgetVariances: (financial?.budgetVariances || []).map((item) => ({ category: item.category, approvedAmount: item.approvedAmount, actualAmount: item.actualAmount, varianceAmount: item.varianceAmount, variancePercent: item.variancePercent, explanationThreshold: item.explanationThreshold, explanationRequired: item.explanationRequired, status: item.status, transactionIds: item.transactionIds })),
    controlsRequiringAction: (financial?.controls || []).filter((item) => item.requiresAction).map((item) => ({ id: item.id, title: item.title, detail: item.detail, status: item.status, transactionIds: item.transactionIds, evidenceSatisfiedBy: item.evidenceSatisfiedBy || [] }))
  };
}

export function missingInputsProjection(result: CompilationResult) {
  return {
    workflow: result.workflow,
    setupConflicts: result.setupConflicts.map((item) => ({ id: item.id, type: item.type, title: item.title, detail: item.detail, status: item.status, source: item.source })),
    missingInputs: result.missingInputs.map((item) => ({ id: item.id, question: item.question, assignedRole: item.assignedRole, reason: item.reason, status: item.status })),
    openProgramChecks: (result.programChecks || []).filter((item) => item.resolution === "open" && item.severity !== "info").map((item) => ({ id: item.id, type: item.type, title: item.title, detail: item.detail, action: item.action, owner: item.owner, status: item.status, sources: item.sources }))
  };
}

export function reviewableDraftProjection(result: CompilationResult) {
  return {
    reportTitle: result.reportTitle,
    summary: result.summary,
    generatedAt: result.generatedAt,
    reviewRequired: result.workflow.readiness !== "ready_for_review",
    narrative: result.narrative.map((item) => ({ id: item.id, text: item.text, evidenceType: item.evidenceType, status: item.status, source: item.source })),
    warnings: result.warnings,
    note: "This is a source-linked draft for human review. It is not a compliance conclusion, approval, or automatic submission."
  };
}

async function ownedReport(user: AuthenticatedUser, reportId: string) {
  const saved = await readCompilationById(user, reportId);
  if (!saved) throw new Error("The requested report was not found for the authenticated GrantDeskHQ tenant.");
  return saved;
}

export function createGrantReportingMcpServer(user: AuthenticatedUser, scopes: readonly string[] = [grantReportingMcpScopes.read]) {
  const server = new McpServer({ name: "grantdeskhq-grant-reporting", version: "0.1.0" }, { capabilities: { logging: {} } });
  const requireRead = () => {
    if (!hasMcpScope(scopes, grantReportingMcpScopes.read)) throw new Error("The linked GrantDeskHQ account requires the grantdeskhq.reports.read scope.");
  };
  const requireWrite = () => {
    requireRead();
    if (!hasMcpScope(scopes, grantReportingMcpScopes.write)) throw new Error("The linked GrantDeskHQ account requires the grantdeskhq.reports.write scope to create a report.");
  };
  server.registerTool("get_grantdeskhq_profile", {
    title: "Get linked GrantDeskHQ profile",
    description: "Returns the stable profile for the linked GrantDeskHQ tenant.",
    inputSchema: {}, outputSchema: { id: z.string(), name: z.string().optional(), email: z.string().email().optional() },
    annotations: readOnlyAnnotations,
    _meta: { "openai/profile": true, securitySchemes: readSecurity }
  } as never, (async () => toolContent({ id: user.uid, name: user.name || undefined, email: user.email || undefined })) as never);
  server.registerTool("list_grant_reports", {
    title: "List GrantDeskHQ reports",
    description: "Lists only summary fields for reports belonging to the authenticated GrantDeskHQ tenant. Use a report-specific tool for analysis or draft content.",
    inputSchema: {}, outputSchema: reportListOutputSchema,
    annotations: readOnlyAnnotations, _meta: { securitySchemes: readSecurity }
  } as never, (async () => { requireRead(); return toolContent({ reports: await listReports(user) }); }) as never);
  server.registerTool("get_agreement_analysis", {
    title: "Get source-linked agreement analysis",
    description: "Returns the persisted grant profile and source-cited obligations for one report owned by the authenticated tenant.",
    inputSchema: { reportId: reportIdSchema },
    annotations: readOnlyAnnotations, _meta: { securitySchemes: readSecurity }
  } as never, (async ({ reportId }: { reportId: string }) => { requireRead(); return toolContent(agreementAnalysisProjection(await ownedReport(user, reportId))); }) as never);
  server.registerTool("get_budget_vs_actual", {
    title: "Get deterministic budget versus actual",
    description: "Returns persisted deterministic budget-to-actual calculations and financial controls for one tenant-owned report.",
    inputSchema: { reportId: reportIdSchema },
    annotations: readOnlyAnnotations, _meta: { securitySchemes: readSecurity }
  } as never, (async ({ reportId }: { reportId: string }) => { requireRead(); return toolContent(budgetVsActualProjection((await ownedReport(user, reportId)).result)); }) as never);
  server.registerTool("get_missing_report_inputs", {
    title: "Get missing inputs and review items",
    description: "Returns persisted missing-input questions and source-cited review items for one tenant-owned report.",
    inputSchema: { reportId: reportIdSchema },
    annotations: readOnlyAnnotations, _meta: { securitySchemes: readSecurity }
  } as never, (async ({ reportId }: { reportId: string }) => { requireRead(); return toolContent(missingInputsProjection((await ownedReport(user, reportId)).result)); }) as never);
  server.registerTool("get_reviewable_report_draft", {
    title: "Get a reviewable draft",
    description: "Returns the persisted source-linked draft narrative for one tenant-owned report. It cannot submit a report.",
    inputSchema: { reportId: reportIdSchema },
    annotations: readOnlyAnnotations, _meta: { securitySchemes: readSecurity }
  } as never, (async ({ reportId }: { reportId: string }) => { requireRead(); return toolContent(reviewableDraftProjection((await ownedReport(user, reportId)).result)); }) as never);
  server.registerTool("create_report_from_document_text", {
    title: "Create a source-linked GrantDeskHQ report from document text",
    description: "Creates one tenant-owned report from user-provided agreement, budget, ledger, template, or program-update text. It stores source inputs, runs the existing deterministic and source-linked report workflow, and never submits to a funder.",
    inputSchema: reportInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }, _meta: { securitySchemes: writeSecurity }
  } as never, (async (input: DocumentTextInput) => { requireWrite(); return toolContent(await createReportFromDocumentText(user, input)); }) as never);
  return server;
}

/**
 * ChatGPT passes the text it has permission to use; GrantDeskHQ retains the
 * same typed source roles, validation, storage, and idempotent request flow
 * as the existing upload UI.  Large/native files remain an explicit UI path
 * rather than being silently truncated through MCP.
 */
export function documentTextCompilationRequest(input: DocumentTextInput): CompilationRequest {
  const files: CompilationRequest["files"] = [];
  const add = (role: SourceRole, name: string, text: string | undefined) => {
    const body = text;
    if (!body) return;
    files.push({ role, name, mimeType: "text/plain", size: Buffer.byteLength(body, "utf8"), data: `data:text/plain;base64,${Buffer.from(body, "utf8").toString("base64")}` });
  };
  add("awardAgreement", "award-agreement.txt", input.awardAgreementText);
  add("approvedBudget", "approved-budget.txt", input.approvedBudgetText);
  add("ledgerExport", "ledger-export.txt", input.ledgerExportText);
  add("funderTemplate", "funder-template.txt", input.funderTemplateText);
  add("programUpdate", "program-update.txt", input.programUpdateText);
  return { organizationName: input.organizationName, grantName: input.grantName, reportingPeriod: input.reportingPeriod, requestId: input.requestId, files };
}

async function createReportFromDocumentText(user: AuthenticatedUser, input: DocumentTextInput) {
  const request = documentTextCompilationRequest(input);
  const errors = validateCompilationRequest(request);
  if (errors.length) throw new Error(errors.join(" "));
  const existing = await readCompilationByRequest(user, request.requestId);
  if (existing) return { reportId: existing.reportId, report: existing.report, idempotentReplay: true, sourceFiles: existing.sources };
  await beginFreeFirstAward(user, request.requestId!, await readBillingAttribution(user));
  const normalized = await normalizeCompilationSources(request);
  const cached = await readCompilationAnalysisCache(normalized.request);
  const result = cached || await finalizeCompilationAnalysisCache(normalized.request, await compileGrantReport(normalized.request, normalized.ledgerRows));
  const saved = await saveCompilation(user, normalized.request, result);
  return { reportId: saved.reportId, report: saved.report, idempotentReplay: false, sourceFiles: saved.sources, next: "Use the analysis, budget-versus-actual, missing-input, and draft tools with this report ID." };
}

/** Stateless Streamable HTTP is safe for Cloud Run scaling. Each request
 * re-verifies the Firebase bearer token and instantiates tools bound to only
 * that authenticated user; there is no cross-tenant session cache. */
export async function handleGrantReportingMcp(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return mcpError(response, 405, "Method not allowed.");
  const body = await readMcpJson(request);
  if (body && typeof body === "object" && (body as { method?: unknown }).method === "initialize") {
    const requested = String((body as { params?: { protocolVersion?: unknown } }).params?.protocolVersion || "");
    const protocolVersion = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"].includes(requested) ? requested : "2025-11-25";
    return mcpJson(response, 200, { jsonrpc: "2.0", id: (body as { id?: unknown }).id ?? null, result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "grantdeskhq-grant-reporting", version: "0.2.0" }, instructions: "GrantDeskHQ reporting tools require OAuth. Link a GrantDeskHQ account before calling a tool." } });
  }
  // OAuth discovery must happen before ChatGPT owns a user access token. The
  // SDK's current registerTool serialization omits securitySchemes, so serve
  // the standards-required, non-sensitive tool manifest directly here.
  if (body && typeof body === "object" && (body as { method?: unknown }).method === "tools/list") {
    return mcpJson(response, 200, { jsonrpc: "2.0", id: (body as { id?: unknown }).id ?? null, result: { tools: grantReportingMcpToolDefinitions() } });
  }
  let authorization: Awaited<ReturnType<typeof requireGrantReportingMcpUser>>;
  try { authorization = await requireGrantReportingMcpUser(request); }
  catch (error) {
    if (error instanceof McpOauthAuthenticationError) return mcpError(response, 401, error.message, true);
    throw error;
  }
  const server = createGrantReportingMcpServer(authorization.user, authorization.scopes);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  } catch (error) {
    if (!response.headersSent) return mcpError(response, 500, error instanceof Error ? error.message : "MCP request failed.");
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

async function readMcpJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 128_000) throw new Error("MCP request exceeds the 128 KiB limit.");
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("MCP request body must be valid JSON."); }
}

function mcpError(response: ServerResponse, status: number, message: string, authenticate = false) {
  if (authenticate) response.setHeader("WWW-Authenticate", oauthChallenge());
  const challenge = authenticate ? { "mcp/www_authenticate": oauthChallenge() } : undefined;
  return mcpJson(response, status, { jsonrpc: "2.0", error: { code: -32000, message, ...(challenge ? { data: { _meta: challenge } } : {}) }, ...(challenge ? { _meta: challenge } : {}), id: null });
}

function mcpJson(response: ServerResponse, status: number, payload: Record<string, unknown>) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}
