# GrantDeskHQ private ChatGPT MCP package

The deployed endpoint is `POST /mcp`. It exposes five read-only tools:

- `list_grant_reports`
- `get_agreement_analysis`
- `get_budget_vs_actual`
- `get_missing_report_inputs`
- `get_reviewable_report_draft`

Every request requires the existing GrantDeskHQ Firebase bearer token. The server derives the tenant solely from that verified token and reads only `organizations/org_<uid>/reports/*`; no tool accepts an organization ID, file path, GTM identifier, or outbound action.

The endpoint uses stateless Streamable HTTP so it does not rely on Cloud Run instance memory. It exposes persisted, source-linked report results and deterministic financial calculations only. It does not expose raw uploaded-file contents, campaign controls, contact data, GTM administration, report submission, or write actions.

## Private test status

The implementation is testable with an existing GrantDeskHQ Firebase ID token against a private candidate. It is **not ready for public ChatGPT submission** until GrantDeskHQ provides a standards-compatible OAuth authorization flow that can mint and refresh the same scoped tenant identity for ChatGPT. Existing Firebase bearer authentication is intentionally not weakened to make the endpoint public.

## Submission package checklist

The current Apps SDK submission guidance requires a verified domain, a remote MCP endpoint, accurate read-only annotations, authentication documentation/demo access, and both positive and negative tool tests. Before submission, record the resulting OAuth issuer/client metadata outside this repository and complete:

Positive tests:

1. List reports for a tenant with two reports.
2. Read source-linked agreement analysis for an owned report.
3. Read deterministic budget-versus-actual for an owned report.
4. Read missing inputs and review checks for an owned report.
5. Read a reviewable draft and confirm it is labelled human-review only.

Negative tests:

1. No bearer token returns 401.
2. A tenant attempts another tenant's report ID and receives no report data.
3. An invalid report ID is rejected before persistence access.

The submission demo must use synthetic or consented data only. Do not include credentials, real customer files, customer tokens, or GTM information.
