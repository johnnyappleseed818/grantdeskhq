# GrantDeskHQ ChatGPT plugin owner checklist

Status as of 2026-10-05: backend protocol checks pass; no authenticated
ChatGPT user session has been run. Do not mark the plugin complete until every
test below has a recorded result from a dedicated synthetic GrantDeskHQ tenant.

## Exact Developer Mode connection values

1. In ChatGPT, open **Settings → Security and login**, enable **Developer
   mode**, and add an MCP server connection with this exact URL:
   `https://grantdeskhq.com/mcp`.
2. Do not paste an API key, client secret, Firebase token, tenant ID, or GTM
   identifier. ChatGPT registers a public OAuth client through DCR.
3. The server requires these values; they are supplied automatically by
   ChatGPT and must be accepted unchanged:

   | OAuth field | Exact value / behavior |
   | --- | --- |
   | Protected resource | `https://grantdeskhq.com/mcp` |
   | Resource metadata | `https://grantdeskhq.com/.well-known/oauth-protected-resource` |
   | Authorization metadata | `https://grantdeskhq.com/.well-known/oauth-authorization-server` |
   | Authorization endpoint | `https://grantdeskhq.com/oauth/authorize` |
   | Token endpoint | `https://grantdeskhq.com/oauth/token` |
   | Redirect URI | `https://chatgpt.com/connector_platform_oauth_redirect` |
   | PKCE | `S256` only |
   | Scopes | `grantdeskhq.reports.read` and, for the create tool, `grantdeskhq.reports.write` |
   | Token behavior | OAuth code is single-use; access token lasts 1 hour; refresh token rotates and lasts 30 days |

The owner must sign in to a dedicated **synthetic** GrantDeskHQ account and
approve only those scopes. This is the one required next action: **connect
`https://grantdeskhq.com/mcp` in ChatGPT Developer Mode and complete the
synthetic-tenant test script below.**

## Synthetic test data

Use no customer or funder information. Create a dedicated tenant with no GTM
access and enter only this synthetic text:

| Field | Synthetic value |
| --- | --- |
| Organization | `MCP Synthetic Community Foundation` |
| Grant | `Synthetic Youth Learning Award` |
| Reporting period | `Q3 2026` |
| Agreement | `Restricted award of $12,000. Submit a quarterly financial and program report by October 15, 2026. Include actual expenditure by approved budget category and participant outcomes.` |
| Approved budget | `Program delivery,8000\nEvaluation,2000\nAdministration,2000` |
| Ledger | `Program delivery,7200\nEvaluation,2300\nAdministration,1500` |
| Program update | `142 students attended. Attendance reconciliation is pending for two sessions.` |

## Authenticated test script

| # | Prompt / action | Expected result | Status |
| --- | --- | --- | --- |
| 1 | Invoke `get_grantdeskhq_profile`. | ChatGPT starts OAuth linking; result identifies only the synthetic tenant. | PENDING_OWNER_TEST |
| 2 | Invoke `list_grant_reports`. | Empty or synthetic-tenant-only report list; no other tenant data. | PENDING_OWNER_TEST |
| 3 | Call `create_report_from_document_text` with a unique `requestId` and the synthetic values above. | One reviewable synthetic report and `reportId`; no funder submission. | PENDING_OWNER_TEST |
| 4 | Repeat step 3 with the same `requestId`. | Same `reportId` with `idempotentReplay: true`. | PENDING_OWNER_TEST |
| 5 | Call `get_agreement_analysis` using that `reportId`. | Source-linked quarterly-report obligation. | PENDING_OWNER_TEST |
| 6 | Call `get_budget_vs_actual` using that `reportId`. | Deterministic category variances, including Evaluation over budget and Administration under budget. | PENDING_OWNER_TEST |
| 7 | Call `get_missing_report_inputs` using that `reportId`. | Missing/verification item for the attendance reconciliation. | PENDING_OWNER_TEST |
| 8 | Call `get_reviewable_report_draft` using that `reportId`. | Reviewable source-linked draft; no submission action. | PENDING_OWNER_TEST |
| 9 | Allow the access token to expire or reconnect, then invoke `get_grantdeskhq_profile`. | A valid refresh flow rotates the refresh token, or ChatGPT relinks using OAuth; no raw token is displayed. | PENDING_OWNER_TEST |
| 10 | In a second synthetic tenant, request the first tenant's `reportId`. | Not found/unauthorized; no report content leaks. | PENDING_OWNER_TEST |

## Required error checks

1. Call a protected tool before linking: it must show the OAuth linking flow,
   not return tenant data.
2. Decline the write scope and invoke the create tool: it must reject the
   missing write scope without creating a report.
3. Use malformed document input: it must return a bounded validation error and
   no partial report.

## Submission readiness

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| Stable public HTTPS MCP endpoint | PASS | `https://grantdeskhq.com/mcp` on production Cloud Run. |
| Protected-resource and OAuth metadata | PASS | Deployed PKCE S256, DCR, resource binding, issuer response, and OAuth challenge. |
| Per-tool OAuth declarations | PASS | All seven tools publish `securitySchemes`; protected unauthenticated calls challenge OAuth. |
| Refresh-token rotation | PASS (backend) | Opaque, hashed, audience-bound one-time refresh records. |
| Authenticated ChatGPT session | FAIL / pending owner | Requires Developer Mode and synthetic-tenant consent. |
| All MCP tools exercised in ChatGPT | 0/7 | Execute the table above; do not substitute unit tests. |
| Tenant-isolation negative test | FAIL / pending owner | Requires second synthetic tenant. |
| Dedicated reviewer account with sample data | FAIL / owner action | Create a no-MFA review account and keep synthetic data available. |
| Five positive / three negative review cases | DRAFTED | Transfer the test cases above into the plugin review form after execution. |
| Consent-based demo recording | FAIL / pending owner | Record the executed synthetic workflow only. |
| Support / privacy / terms URLs | PARTIAL | Contact and privacy URLs exist; a reviewed public Terms URL is still required before submission. |
| Review package ZIP | PARTIAL | Portable `plugin.json` and `mcp.json` exist; complete approved public listing/legal metadata before zipping. |
| Published or submitted | NO | Do not submit until all prior FAIL/PENDING rows pass. |
