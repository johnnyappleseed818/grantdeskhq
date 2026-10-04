import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import { requireUser, type AuthenticatedUser } from "./auth.ts";
import { listReports, readCompilationById } from "./persistence.ts";
import type { CompilationResult, PersistedCompilationResponse } from "../src/types/prototype.ts";

const reportIdSchema = z.string().regex(/^report_[a-f0-9]{32}$/).describe("A GrantDeskHQ report ID returned by list_grant_reports.");
const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

type ToolContent = { content: Array<{ type: "text"; text: string }>; structuredContent: Record<string, unknown> };

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

export function createGrantReportingMcpServer(user: AuthenticatedUser) {
  const server = new McpServer({ name: "grantdeskhq-grant-reporting", version: "0.1.0" }, { capabilities: { logging: {} } });
  server.registerTool("list_grant_reports", {
    title: "List GrantDeskHQ reports",
    description: "Lists report summaries belonging only to the authenticated GrantDeskHQ tenant.",
    inputSchema: {},
    annotations: readOnlyAnnotations
  }, async () => toolContent({ reports: await listReports(user) }));
  server.registerTool("get_agreement_analysis", {
    title: "Get source-linked agreement analysis",
    description: "Returns the persisted grant profile and source-cited obligations for one report owned by the authenticated tenant.",
    inputSchema: { reportId: reportIdSchema },
    annotations: readOnlyAnnotations
  }, async ({ reportId }) => toolContent(agreementAnalysisProjection(await ownedReport(user, reportId))));
  server.registerTool("get_budget_vs_actual", {
    title: "Get deterministic budget versus actual",
    description: "Returns persisted deterministic budget-to-actual calculations and financial controls for one tenant-owned report.",
    inputSchema: { reportId: reportIdSchema },
    annotations: readOnlyAnnotations
  }, async ({ reportId }) => toolContent(budgetVsActualProjection((await ownedReport(user, reportId)).result)));
  server.registerTool("get_missing_report_inputs", {
    title: "Get missing inputs and review items",
    description: "Returns persisted missing-input questions and source-cited review items for one tenant-owned report.",
    inputSchema: { reportId: reportIdSchema },
    annotations: readOnlyAnnotations
  }, async ({ reportId }) => toolContent(missingInputsProjection((await ownedReport(user, reportId)).result)));
  server.registerTool("get_reviewable_report_draft", {
    title: "Get a reviewable draft",
    description: "Returns the persisted source-linked draft narrative for one tenant-owned report. It cannot submit a report.",
    inputSchema: { reportId: reportIdSchema },
    annotations: readOnlyAnnotations
  }, async ({ reportId }) => toolContent(reviewableDraftProjection((await ownedReport(user, reportId)).result)));
  return server;
}

/** Stateless Streamable HTTP is safe for Cloud Run scaling. Each request
 * re-verifies the Firebase bearer token and instantiates tools bound to only
 * that authenticated user; there is no cross-tenant session cache. */
export async function handleGrantReportingMcp(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return mcpError(response, 405, "Method not allowed.");
  const user = await requireUser(request);
  const body = await readMcpJson(request);
  const server = createGrantReportingMcpServer(user);
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

function mcpError(response: ServerResponse, status: number, message: string) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}
