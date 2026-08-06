import assert from "node:assert/strict";
import test from "node:test";
import { isEligibleOptIn, parseCsv, renderOptInEmailHtml, renderOptInEmailText, scoreProspect, summarizeSignals, toCsv } from "./lib.mjs";

test("CSV parsing preserves quoted organization names", () => {
  const rows = parseCsv('name,organization\nJordan,"Family Services, Inc."\n');
  assert.equal(rows[0].organization, "Family Services, Inc.");
  assert.match(toCsv(rows, ["name", "organization"]), /"Family Services, Inc\."/);
});

test("verified nonprofit finance leaders receive a visible research-fit score", () => {
  const prospect = scoreProspect({
    priority: "A",
    role: "Director of Finance",
    organization: "Example Nonprofit",
    official_source: "https://example.org/team",
    email: "",
    consent_status: ""
  });
  assert.equal(prospect.fit_score, 7);
  assert.equal(prospect.fit_tier, "priority research");
  assert.match(prospect.unresolved, /no email consent/);
  assert.match(prospect.unresolved, /workflow not yet verified/);
});

test("email eligibility requires documented opt-in and a valid address", () => {
  const eligible = {
    email: "finance@example.org",
    consent_status: "opted_in",
    consent_source: "GrantDeskHQ workflow questionnaire",
    consent_date: "2026-08-06",
    unsubscribed: "false"
  };
  assert.equal(isEligibleOptIn(eligible), true);
  assert.equal(isEligibleOptIn({ ...eligible, consent_status: "" }), false);
  assert.equal(isEligibleOptIn({ ...eligible, consent_date: "August 6" }), false);
  assert.equal(isEligibleOptIn({ ...eligible, unsubscribed: "true" }), false);
});

test("signal summaries count recurring themes", () => {
  const result = summarizeSignals([
    { painThemes: ["spreadsheet_bridge", "funder_mapping"] },
    { painThemes: ["spreadsheet_bridge"] }
  ], {
    spreadsheet_bridge: "Spreadsheet work",
    funder_mapping: "Mapping work"
  });
  assert.deepEqual(result.map(({ key, count }) => [key, count]), [["spreadsheet_bridge", 2], ["funder_mapping", 1]]);
});

test("opt-in campaign leads with validated value and includes review and unsubscribe boundaries", () => {
  const options = {
    questionnaireUrl: "https://example.org/questionnaire",
    postalAddress: "1021 East Lincolnway, Cheyenne, Wyoming 82001",
    discount: "10% off the first three monthly payments"
  };
  const text = renderOptInEmailText(options);
  const html = renderOptInEmailHtml(options);
  for (const output of [text, html]) {
    assert.match(output, /rebuild each funder.*report in Excel/i);
    assert.match(output, /professional review/i);
    assert.match(output, /rather than replacing/i);
    assert.match(output, /1021 East Lincolnway/);
    assert.match(output, /RESEND_UNSUBSCRIBE_URL/);
    assert.doesNotMatch(output, /fully automated|submission ready|100% accurate|guaranteed savings/i);
  }
});
