import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCompilationRequest } from "../src/lib/prototype.ts";
import type { CompilationRequest } from "../src/types/prototype.ts";
import { compileGrantReport } from "./reportCompiler.ts";

const port = Number(process.env.PORT || 8080);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const maxBodyBytes = 4_000_000;

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/healthz" || url.pathname === "/api/health") {
      return json(response, 200, { status: "ok", service: "grantdeskhq-prototype" });
    }
    if (url.pathname === "/api/compile-report") return handleCompiler(request, response);
    if (request.method !== "GET" && request.method !== "HEAD") return json(response, 405, { error: "Method not allowed." });
    return serveStatic(url.pathname, request.method === "HEAD", response);
  } catch (error) {
    console.error("GrantDeskHQ server error:", error instanceof Error ? error.message : "Unknown error");
    return json(response, 500, { error: "The prototype server could not complete this request." });
  }
}).listen(port, "0.0.0.0", () => console.log(`GrantDeskHQ prototype listening on ${port}`));

async function handleCompiler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }
  const input = await readJson(request) as CompilationRequest;
  if (!input || !Array.isArray(input.files)) return json(response, 400, { error: "A source package is required." });
  const errors = validateCompilationRequest(input);
  if (errors.length) return json(response, 400, { error: errors.join(" ") });
  try {
    return json(response, 200, await compileGrantReport(input));
  } catch (error) {
    console.error("GrantDeskHQ compiler error:", error instanceof Error ? error.message : "Unknown error");
    return json(response, 502, { error: "The AI compiler could not complete this package. Try the synthetic package again." });
  }
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > maxBodyBytes) throw new Error("Request body exceeds the prototype limit.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(urlPath: string, headOnly: boolean, response: ServerResponse) {
  const decoded = decodeURIComponent(urlPath);
  const candidate = path.resolve(root, `.${decoded}`);
  const safeCandidate = candidate.startsWith(`${root}${path.sep}`) || candidate === root ? candidate : root;
  let filePath = safeCandidate;
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, "index.html");
    await stat(filePath);
  } catch {
    filePath = path.join(root, "index.html");
  }
  const body = await readFile(filePath);
  response.statusCode = 200;
  response.setHeader("Content-Type", mime(filePath));
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Cache-Control", filePath.endsWith("index.html") ? "no-cache" : "public, max-age=3600");
  response.end(headOnly ? undefined : body);
}

function json(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(body));
}

function mime(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".pdf": "application/pdf", ".csv": "text/csv; charset=utf-8", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  } as Record<string, string>)[extension] || "application/octet-stream";
}
