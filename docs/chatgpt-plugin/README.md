# GrantDeskHQ Grant Reporting MCP

`https://grantdeskhq.com/mcp` is a tenant-isolated Streamable HTTP MCP
server for the GrantDeskHQ reporting workflow. It is deliberately separate
from GTM: it cannot view contacts, campaigns, delivery data, or GTM controls.

## Authentication and scopes

The server uses OAuth 2.1 authorization-code flow with PKCE S256:

- protected-resource metadata: `/.well-known/oauth-protected-resource`
- authorization-server metadata: `/.well-known/oauth-authorization-server`
- dynamic client registration: `POST /oauth/register`
- authorization UI: `GET /oauth/authorize`
- token exchange: `POST /oauth/token`
- tenant profile: `GET /oauth/userinfo`

The authorization server advertises issuer identification, so dynamic
registration accepts only ChatGPT's stable connector redirect URI:
`https://chatgpt.com/connector_platform_oauth_redirect`. It rejects arbitrary
HTTPS callbacks. Access tokens expire after one hour. Refresh tokens are opaque,
hashed at rest, resource-bound, rotate on use, and expire after 30 days.

`grantdeskhq.reports.read` permits the read-only report tools.
`grantdeskhq.reports.write` is required only for the idempotent
`create_report_from_document_text` tool. OAuth access tokens are opaque,
short-lived, resource-bound, and stored only as hashes. The browser uses the
existing GrantDeskHQ sign-in flow; its Firebase ID token is never sent to
ChatGPT or used as an MCP token.

The endpoint publishes `securitySchemes` on every tool and sends both the
HTTP `WWW-Authenticate` challenge and MCP `mcp/www_authenticate` metadata for
an unauthenticated tool call. This is required for ChatGPT to surface account
linking. See the current [OpenAI OAuth guidance](https://developers.openai.com/plugins/build/auth).

## Tools

1. `get_grantdeskhq_profile`
2. `list_grant_reports`
3. `get_agreement_analysis`
4. `get_budget_vs_actual`
5. `get_missing_report_inputs`
6. `get_reviewable_report_draft`
7. `create_report_from_document_text`

The create tool accepts typed user-provided plain text for an award agreement
and optional budget, ledger, funder-template, and program-update inputs. It
uses the same existing source normalization, deterministic financial analysis,
tenant ownership, and idempotent compilation persistence as the product UI.
It returns a human-review draft; it never submits anything to a funder. Large
or native files stay in the authenticated product upload path and are never
silently truncated through MCP.

## Package and developer-mode test

The portable package is in [`package`](./package), with a remote
`mcp.json` pointing only to the production MCP URL. It contains no credentials
or customer data.

1. Deploy a revision containing the OAuth endpoints.
2. In ChatGPT, enable **Developer mode** under **Settings → Security and
   login**, then add `https://grantdeskhq.com/mcp` in **Plugins**.
3. Complete GrantDeskHQ sign-in and consent. ChatGPT will use DCR, PKCE S256,
   and the stable connector callback; do not manually create a client secret.
4. With synthetic or consented documents, call the create tool, then the
   analysis, budget-versus-actual, missing-input, and draft tools using the
   returned report ID.
5. Verify a second tenant cannot read that ID, an unauthenticated tool call
   starts linking, a used authorization code cannot be exchanged again, and a
   write tool without the write scope is rejected.

This interactive ChatGPT connection is the remaining user-session test; it
cannot be performed by Cloud Run or a Codex terminal because it requires the
user's ChatGPT account and GrantDeskHQ sign-in consent. The precise owner test
script and submission readiness state are in
[`OWNER_CHECKLIST.md`](./OWNER_CHECKLIST.md).

## Submission package and remaining portal actions

The package follows OpenAI's portable plugin layout (`plugin.json` plus
`mcp.json`). Before public submission, the owner must complete identity/domain
verification, add the real support/privacy/terms URLs and approved brand
assets, host the OpenAI domain challenge, record exactly five positive and
three negative review cases, provide a consented demo recording, then use
**With MCP → Scan Tools** in the plugin submission portal. Those portal and
identity steps are external to the codebase; no secret or reviewer credential
belongs in this repository. Refer to [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server) and [plugin submission](https://developers.openai.com/plugins/deploy/submission).
