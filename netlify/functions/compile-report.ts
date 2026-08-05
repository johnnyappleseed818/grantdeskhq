import { validateCompilationRequest } from "../../src/lib/prototype";
import type { CompilationRequest } from "../../src/types/prototype";
import { compileGrantReport } from "../../server/reportCompiler";

interface NetlifyEvent { httpMethod: string; body: string | null }

export async function handler(event: NetlifyEvent) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed." }) };
  try {
    const input = JSON.parse(event.body || "null") as CompilationRequest;
    if (!input || !Array.isArray(input.files)) return { statusCode: 400, headers, body: JSON.stringify({ error: "A source package is required." }) };
    const errors = validateCompilationRequest(input);
    if (errors.length) return { statusCode: 400, headers, body: JSON.stringify({ error: errors.join(" ") }) };
    const result = await compileGrantReport(input);
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown compiler error";
    console.error("GrantDeskHQ Netlify compiler error:", message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: "The AI compiler could not complete this package. Confirm the server configuration and try again." }) };
  }
}
