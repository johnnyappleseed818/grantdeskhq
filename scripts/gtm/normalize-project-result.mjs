#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve(process.argv[2] || "project-result.json");
const parsed = JSON.parse(await readFile(target, "utf8"));
if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("project-result.json must contain one JSON object.");
for (const key of ["project", "status", "updatedAt"]) {
  if (typeof parsed[key] !== "string" || !parsed[key]) throw new Error(`project-result.json is missing required string ${key}.`);
}
if (!["PASS", "PARTIAL", "FAIL"].includes(parsed.status)) throw new Error("project-result.json status must be PASS, PARTIAL, or FAIL.");
if (!Number.isFinite(Date.parse(parsed.updatedAt))) throw new Error("project-result.json updatedAt must be an ISO timestamp.");
await writeFile(target, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ file: target, status: parsed.status, updatedAt: parsed.updatedAt, valid: true }));
