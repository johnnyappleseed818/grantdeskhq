import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { isEligibleOptIn, parseCsv, renderOptInEmailHtml, renderOptInEmailText } from "./lib.mjs";

const CAMPAIGN = {
  id: "grantdeskhq-post-award-workflow-v2",
  name: "GrantDeskHQ post-award workflow research",
  subject: "Still rebuilding funder reports in Excel?",
  from: "Eli Katz <eli.katz@grantdeskhq.com>",
  postalAddress: "1021 East Lincolnway, Cheyenne, Wyoming 82001",
  discount: "questionnaire participants who later become new GrantDeskHQ customers can receive 10% off their first three monthly payments"
};

const csvPath = path.resolve(process.env.OPT_IN_CSV_PATH ?? "outreach/GrantDeskHQ_Resend_OptIn_Only_Template.csv");
const rows = parseCsv(await fs.readFile(csvPath, "utf8"));
const eligibleRecipients = rows.filter(isEligibleOptIn);
const createDraft = process.argv.includes("--create-draft");
const sendNow = process.argv.includes("--send");

console.log(`Loaded ${rows.length} row(s); ${eligibleRecipients.length} documented opt-in recipient(s).`);
console.log(renderOptInEmailText({
  questionnaireUrl: process.env.QUESTIONNAIRE_URL ?? "{{QUESTIONNAIRE_URL}}",
  postalAddress: CAMPAIGN.postalAddress,
  discount: CAMPAIGN.discount
}));

if (!createDraft && !sendNow) {
  console.log("\nPREVIEW ONLY — no Resend API call was made.");
  process.exit(0);
}

if (eligibleRecipients.length === 0) throw new Error("No documented opt-in recipients. Nothing was created or sent.");
const apiKey = requireEnvironment("RESEND_API_KEY");
const questionnaireUrl = requireHttpsUrl("QUESTIONNAIRE_URL");
requireExact("CONFIRM_ELIGIBLE_COUNT", String(eligibleRecipients.length));
if (sendNow) {
  requireExact("CONFIRM_RESEND_SEND", "YES");
  requireExact("CONFIRM_CAMPAIGN_ID", CAMPAIGN.id);
}

const segment = await resendRequest("/segments", apiKey, {
  method: "POST",
  body: {
    name: `${CAMPAIGN.name} ${new Date().toISOString().slice(0, 10)} ${createHash("sha256").update(eligibleRecipients.map((row) => row.email.toLowerCase()).sort().join("|")).digest("hex").slice(0, 8)}`
  }
});

for (const recipient of eligibleRecipients) {
  const contactPath = `/contacts/${encodeURIComponent(recipient.email)}`;
  const existing = await resendRequest(contactPath, apiKey, { method: "GET", allowNotFound: true });
  if (existing?.unsubscribed) throw new Error(`${recipient.email} is unsubscribed in Resend. The campaign was not created.`);
  if (existing) {
    await resendRequest(`${contactPath}/segments/${segment.id}`, apiKey, { method: "POST" });
  } else {
    await resendRequest("/contacts", apiKey, {
      method: "POST",
      body: {
        email: recipient.email,
        first_name: recipient.first_name || "",
        last_name: recipient.last_name || "",
        unsubscribed: false,
        segments: [{ id: segment.id }]
      }
    });
  }
}

const segmentContacts = await resendRequest(`/segments/${segment.id}/contacts`, apiKey, { method: "GET" });
if (segmentContacts.data?.length !== eligibleRecipients.length || segmentContacts.has_more) {
  throw new Error(`Resend segment verification failed: expected exactly ${eligibleRecipients.length} contact(s). The campaign was not created.`);
}

const broadcast = await resendRequest("/broadcasts", apiKey, {
  method: "POST",
  body: {
    segment_id: segment.id,
    from: process.env.RESEND_FROM?.trim() || CAMPAIGN.from,
    subject: CAMPAIGN.subject,
    name: CAMPAIGN.name,
    html: renderOptInEmailHtml({ questionnaireUrl, postalAddress: CAMPAIGN.postalAddress, discount: CAMPAIGN.discount }),
    text: renderOptInEmailText({ questionnaireUrl, postalAddress: CAMPAIGN.postalAddress, discount: CAMPAIGN.discount }),
    send: sendNow
  }
});

console.log(`${sendNow ? "Sent" : "Created draft"} Resend Broadcast ${broadcast.id} for ${eligibleRecipients.length} opted-in recipient(s).`);

async function resendRequest(endpoint, apiKey, { method, body, allowNotFound = false }) {
  const response = await fetch(`https://api.resend.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (allowNotFound && response.status === 404) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Resend ${endpoint} failed with ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requireHttpsUrl(name) {
  const value = requireEnvironment(name);
  if (!value.startsWith("https://")) throw new Error(`${name} must use HTTPS.`);
  return value;
}

function requireExact(name, expected) {
  if (process.env[name] !== expected) throw new Error(`${name} must be exactly ${expected}.`);
}
