import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const CAMPAIGN = {
  id: "grant-reporting-workflow-assessment-v1",
  subject: "Still rebuilding funder reports in Excel?",
  fromName: "Eli Katz",
  fromAddress: "eli.katz@grantdeskhq.com",
  postalAddress: "1021 East Lincolnway, Cheyenne, Wyoming 82001"
};

const csvPath = path.resolve(
  process.env.OPT_IN_CSV_PATH ?? "outreach/GrantDeskHQ_Resend_OptIn_Only_Template.csv"
);
const shouldSend = process.argv.includes("--send");

const rows = parseCsv(await fs.readFile(csvPath, "utf8"));
const recipients = rows.filter(isEligibleRecipient);

console.log(`Loaded ${rows.length} CSV row(s); ${recipients.length} eligible opted-in recipient(s).`);

if (!shouldSend) {
  console.log("PREVIEW ONLY — no email was sent.");
  console.log(renderText({ first_name: "Jordan", consent_source: "Nonprofit Grant Reporting Workflow Assessment", consent_date: "2026-08-04" }));
  process.exit(0);
}

requireValue("CONFIRM_RESEND_SEND", "YES");
const apiKey = requireEnvironment("RESEND_API_KEY");
const fromAddress = process.env.RESEND_FROM?.trim() || CAMPAIGN.fromAddress;
const replyTo = process.env.RESEND_REPLY_TO?.trim() || CAMPAIGN.fromAddress;
const questionnaireUrl = requireEnvironment("QUESTIONNAIRE_URL");
const postalAddress = process.env.PHYSICAL_POSTAL_ADDRESS?.trim() || CAMPAIGN.postalAddress;

if (recipients.length === 0) {
  throw new Error("No eligible opted-in recipients. Nothing was sent.");
}

for (const recipient of recipients) {
  const unsubscribeUrl = recipient.unsubscribe_url;
  if (!unsubscribeUrl?.startsWith("https://")) {
    throw new Error(`A valid HTTPS unsubscribe_url is required for every opted-in recipient.`);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey(recipient.email)
    },
    body: JSON.stringify({
      from: `${CAMPAIGN.fromName} <${fromAddress}>`,
      to: [recipient.email],
      subject: CAMPAIGN.subject,
      reply_to: replyTo,
      html: renderHtml(recipient, questionnaireUrl, postalAddress, unsubscribeUrl),
      text: renderText(recipient, questionnaireUrl, postalAddress, unsubscribeUrl),
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
      },
      tags: [{ name: "campaign", value: CAMPAIGN.id }]
    })
  });

  if (!response.ok) {
    throw new Error(`Resend rejected an opted-in email (${response.status}): ${await response.text()}`);
  }
  console.log(`Sent approved campaign to one opted-in recipient. Resend status: ${response.status}.`);
}

function isEligibleRecipient(row) {
  const optedOut = /^(true|yes|1)$/i.test(row.unsubscribed ?? "");
  return Boolean(
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email ?? "") &&
    /^(opted_in|yes)$/i.test(row.consent_status ?? "") &&
    row.consent_source?.trim() &&
    row.consent_date?.trim() &&
    row.unsubscribe_url?.trim() &&
    !optedOut
  );
}

function renderText(recipient, questionnaireUrl = "{{QUESTIONNAIRE_URL}}", postalAddress = CAMPAIGN.postalAddress, unsubscribeUrl = "{{UNSUBSCRIBE_URL}}") {
  const firstName = recipient.first_name?.trim() || "there";
  return `Hi ${firstName},

Nonprofit finance teams often spend significant time bringing award terms, GL data, program updates, and funder templates together for a single report.

We’re validating GrantDeskHQ, an AI-assisted workflow designed to reduce that manual work, flag missing support earlier, and prepare a source-backed draft for professional review.

Would you share how your team handles post-award reporting today? The questionnaire takes about three minutes:
${questionnaireUrl}

As a thank-you, questionnaire participants who later become new GrantDeskHQ customers can receive 10% off their first three monthly payments.

Thank you,
Eli Katz
GrantDeskHQ
https://grantdeskhq.com

This is a commercial message from GrantDeskHQ.
You opted in via ${recipient.consent_source || "{{CONSENT_SOURCE}}"} on ${recipient.consent_date || "{{CONSENT_DATE}}"}.
${postalAddress}
Unsubscribe: ${unsubscribeUrl}`;
}

function renderHtml(recipient, questionnaireUrl, postalAddress, unsubscribeUrl) {
  const firstName = escapeHtml(recipient.first_name?.trim() || "there");
  return `<!doctype html><html><body style="margin:0;background:#f5f6f2;color:#263444;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #dce2dd;padding:32px"><p style="margin:0 0 18px">Hi ${firstName},</p><p style="line-height:1.65">Nonprofit finance teams often spend significant time bringing award terms, GL data, program updates, and funder templates together for a single report.</p><p style="line-height:1.65">We’re validating <strong>GrantDeskHQ</strong>, an AI-assisted workflow designed to reduce that manual work, flag missing support earlier, and prepare a source-backed draft for professional review.</p><p style="line-height:1.65">Would you share how your team handles post-award reporting today? The questionnaire takes about three minutes.</p><p style="margin:26px 0"><a href="${escapeHtml(questionnaireUrl)}" style="display:inline-block;background:#16344c;color:#fff;text-decoration:none;padding:13px 18px;border-radius:6px;font-weight:700">Take the 3-minute questionnaire</a></p><p style="line-height:1.65">As a thank-you, questionnaire participants who later become new GrantDeskHQ customers can receive <strong>10% off their first three monthly payments</strong>.</p><p style="margin-top:26px;line-height:1.6">Thank you,<br>Eli Katz<br>GrantDeskHQ<br><a href="https://grantdeskhq.com" style="color:#3f6f58">grantdeskhq.com</a></p></div><div style="padding:18px 6px;font-size:11px;line-height:1.55;color:#697580"><p>This is a commercial message from GrantDeskHQ.<br>You opted in via ${escapeHtml(recipient.consent_source)} on ${escapeHtml(recipient.consent_date)}.</p><p>${escapeHtml(postalAddress)}<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#697580">Unsubscribe</a></p></div></div></body></html>`;
}

function parseCsv(source) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      record.push(field.trim()); field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      record.push(field.trim()); field = "";
      if (record.some(Boolean)) records.push(record);
      record = [];
    } else {
      field += character;
    }
  }
  if (field || record.length) { record.push(field.trim()); records.push(record); }
  const [headers = [], ...data] = records;
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requireValue(name, expected) {
  if (process.env[name] !== expected) throw new Error(`${name} must be exactly ${expected}.`);
}

function idempotencyKey(email) {
  return createHash("sha256").update(`${CAMPAIGN.id}:${email.toLowerCase()}`).digest("hex");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}
