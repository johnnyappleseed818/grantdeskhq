import fs from "node:fs";
import { randomBytes } from "node:crypto";

const apiKey = process.env.FIREBASE_WEB_API_KEY;
const apiOrigin = process.env.GRANTDESK_API_ORIGIN || "https://grantdeskhq-prototype-me423s5k5a-uc.a.run.app";
if (!apiKey) throw new Error("FIREBASE_WEB_API_KEY is required.");

const email = `qa-smoke-${Date.now()}@grantdeskhq.invalid`;
const password = `Gd!${randomBytes(18).toString("base64url")}`;
const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Referer: "https://grantdeskhq.com/" },
  body: JSON.stringify({ email, password, returnSecureToken: true })
});
const account = await signUp.json();
if (!signUp.ok) throw new Error(`QA signup failed: ${account.error?.message || signUp.status}`);

const request = {
  organizationName: "GrantDeskHQ QA — Synthetic",
  grantName: "Synthetic Evidence Control Test",
  reportingPeriod: "January–June 2026",
  files: [
    asset("awardAgreement", "Synthetic_Grant_Agreement.pdf", "application/pdf"),
    asset("approvedBudget", "Approved_Grant_Budget.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    asset("ledgerExport", "General_Ledger_Export.csv", "text/csv"),
    asset("funderTemplate", "Synthetic_Funder_Report_Draft.pdf", "application/pdf"),
    text("programUpdate", "Synthetic_Program_Update.txt", "Confirmed youth served: 118 of target 120. Three additional school-site visits were approved. One travel receipt is missing."),
    asset("supportingEvidence", "Transaction_Evidence_Schedule.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  ]
};
const compilation = await api("/api/reports/compile", account.idToken, { method: "POST", body: JSON.stringify(request) });
const listing = await api("/api/reports", account.idToken);
if (!listing.reports.some((report) => report.id === compilation.reportId)) throw new Error("Compiled report was not returned by the saved-workspace API.");
process.stdout.write(JSON.stringify({
  ok: true,
  qaEmail: email,
  localId: account.localId,
  reportId: compilation.reportId,
  status: compilation.report.status,
  sourceCount: compilation.report.sourceCount,
  evidenceCoveragePercent: compilation.report.evidenceCoveragePercent,
  savedReportCount: listing.reports.length
}));

async function api(path, token, init = {}) {
  const response = await fetch(`${apiOrigin}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${body.error || "unknown error"}`);
  return body;
}

function asset(role, name, mimeType) {
  const buffer = fs.readFileSync(new URL(`../public/samples/${name}`, import.meta.url));
  return { role, name, mimeType, size: buffer.byteLength, data: `data:${mimeType};base64,${buffer.toString("base64")}` };
}

function text(role, name, value) {
  const buffer = Buffer.from(value);
  return { role, name, mimeType: "text/plain", size: buffer.byteLength, data: `data:text/plain;base64,${buffer.toString("base64")}` };
}
