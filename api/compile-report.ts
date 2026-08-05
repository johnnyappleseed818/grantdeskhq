import { validateCompilationRequest } from "../src/lib/prototype";
import type { CompilationRequest } from "../src/types/prototype";
import { compileGrantReport } from "../server/reportCompiler";

interface ApiRequest { method?: string; body?: unknown }
interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

export const config = { maxDuration: 60 };

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const input = request.body as CompilationRequest;
  if (!input || !Array.isArray(input.files)) return response.status(400).json({ error: "A source package is required." });
  const errors = validateCompilationRequest(input);
  if (errors.length) return response.status(400).json({ error: errors.join(" ") });

  try {
    const result = await compileGrantReport(input);
    return response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The compiler could not process this package.";
    console.error("GrantDeskHQ compiler error:", message);
    return response.status(502).json({ error: "The AI compiler could not complete this package. Confirm the server configuration and try again." });
  }
}
