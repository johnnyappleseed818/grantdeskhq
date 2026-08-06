const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function parseCsv(source) {
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
      record.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      record.push(field.trim());
      field = "";
      if (record.some(Boolean)) records.push(record);
      record = [];
    } else {
      field += character;
    }
  }

  if (field || record.length) {
    record.push(field.trim());
    records.push(record);
  }

  const [headers = [], ...data] = records;
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function toCsv(rows, columns) {
  const escape = (value) => {
    const normalized = String(value ?? "");
    return /[",\n\r]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
  };
  return [columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n") + "\n";
}

export function scoreProspect(row) {
  const role = (row.role ?? "").toLowerCase();
  const financeLeadership = /(chief financial|\bcfo\b|controller|vice president.*finance|director of finance|finance.*director|fiscal director|fiscal officer)/.test(role);
  const grantLeadership = /(director of grants|grants manager|grants.*compliance|grants.*financial strategy)/.test(role);
  const rolePoints = financeLeadership ? 3 : grantLeadership ? 2 : 0;
  const score = rolePoints
    + (row.priority === "A" ? 2 : row.priority === "B" ? 1 : 0)
    + (row.organization?.trim() ? 1 : 0)
    + (row.official_source?.startsWith("https://") ? 1 : 0);

  const gaps = [];
  if (!row.email?.trim()) gaps.push("no permissioned email");
  if (!/^(opted_in|yes)$/i.test(row.consent_status ?? "")) gaps.push("no email consent");
  gaps.push("post-award workflow not yet verified");
  gaps.push("active-grant volume not yet verified");

  return {
    ...row,
    fit_score: score,
    fit_tier: score >= 7 ? "priority research" : score >= 5 ? "standard research" : "needs qualification",
    fit_basis: financeLeadership ? "verified nonprofit finance leader" : grantLeadership ? "verified nonprofit grants leader" : "role requires review",
    unresolved: gaps.join("; ")
  };
}

export function isEligibleOptIn(row) {
  const optedOut = /^(true|yes|1)$/i.test(row.unsubscribed ?? "");
  const consent = /^(opted_in|yes)$/i.test(row.consent_status ?? "");
  return Boolean(
    EMAIL_PATTERN.test(row.email ?? "")
      && consent
      && row.consent_source?.trim()
      && /^\d{4}-\d{2}-\d{2}$/.test(row.consent_date ?? "")
      && !optedOut
  );
}

export function summarizeSignals(signals, painThemes) {
  const themeCounts = Object.fromEntries(Object.keys(painThemes).map((theme) => [theme, 0]));
  for (const signal of signals) {
    for (const theme of signal.painThemes ?? []) themeCounts[theme] = (themeCounts[theme] ?? 0) + 1;
  }
  return Object.entries(themeCounts)
    .map(([key, count]) => ({ key, count, description: painThemes[key] ?? key }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

export function renderOptInEmailText({ questionnaireUrl = "{{QUESTIONNAIRE_URL}}", postalAddress, discount }) {
  return `Hi {{{contact.first_name|there}}},

Many nonprofit finance teams keep accurate records in QuickBooks or another accounting system and still rebuild each funder's report in Excel—mapping transactions to funder budget lines, chasing program updates, and copying the results into a separate template.

GrantDeskHQ is an AI-assisted workflow designed to turn an approved grant budget, accounting export, program update, and funder form into a source-linked report draft for professional review. It works around the accounting system you already use rather than replacing it.

Would you share how your team handles post-award grant reporting today? The short questionnaire is here:
${questionnaireUrl}

As a thank-you, ${discount}.

Thank you,
Eli Katz
GrantDeskHQ
https://grantdeskhq.com

Advertisement from GrantDeskHQ. You received this because you opted in to GrantDeskHQ research and product updates.
${postalAddress}
Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`;
}

export function renderOptInEmailHtml({ questionnaireUrl = "{{QUESTIONNAIRE_URL}}", postalAddress, discount }) {
  return `<!doctype html><html><body style="margin:0;background:#f5f6f2;color:#263444;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #dce2dd;padding:32px"><p style="margin:0 0 18px">Hi {{{contact.first_name|there}}},</p><p style="line-height:1.65">Many nonprofit finance teams keep accurate records in QuickBooks or another accounting system and still rebuild each funder's report in Excel—mapping transactions to funder budget lines, chasing program updates, and copying the results into a separate template.</p><p style="line-height:1.65"><strong>GrantDeskHQ</strong> is an AI-assisted workflow designed to turn an approved grant budget, accounting export, program update, and funder form into a source-linked report draft for professional review. It works around the accounting system you already use rather than replacing it.</p><p style="line-height:1.65">Would you share how your team handles post-award grant reporting today?</p><p style="margin:26px 0"><a href="${escapeHtml(questionnaireUrl)}" style="display:inline-block;background:#16344c;color:#fff;text-decoration:none;padding:13px 18px;border-radius:6px;font-weight:700">Take the short workflow questionnaire</a></p><p style="line-height:1.65">As a thank-you, ${escapeHtml(discount)}.</p><p style="margin-top:26px;line-height:1.6">Thank you,<br>Eli Katz<br>GrantDeskHQ<br><a href="https://grantdeskhq.com" style="color:#3f6f58">grantdeskhq.com</a></p></div><div style="padding:18px 6px;font-size:11px;line-height:1.55;color:#697580"><p>Advertisement from GrantDeskHQ. You received this because you opted in to GrantDeskHQ research and product updates.</p><p>${escapeHtml(postalAddress)}<br><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#697580">Unsubscribe</a></p></div></div></body></html>`;
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}
