# GrantDeskHQ live SEO/indexability audit — 2026-08-17

## Scope and method

Read-only audit of `https://grantdeskhq.com` at 2026-08-17 18:47 UTC. Public URLs were fetched with `curl -L`, including a Googlebot user-agent header check. Repository SEO routes, sitemap, robots, and route tests were inspected locally. No production traffic or Search Console/Bing changes were made.

## Live evidence

All sitemap URLs returned HTTP 200, `text/html; charset=utf-8`, and the same 1,870-byte SPA shell: `/`, `/pricing`, `/resources`, `/blog`, and these six articles:

- `/blog/post-award-grant-reporting-checklist`
- `/blog/budget-to-actual-grant-reporting-workflow`
- `/blog/turn-grant-agreement-into-reporting-plan`
- `/blog/grant-progress-report-workflow`
- `/blog/grant-closeout-checklist`
- `/blog/post-award-grant-management-software`

`/robots.txt` returned 200 and contains `User-agent: *`, `Allow: /`, and `Sitemap: https://grantdeskhq.com/sitemap.xml`. `/sitemap.xml` returned 200 and is well-formed enough for the listed URL set. No `X-Robots-Tag` was present in the inspected response headers. HTTPS is canonical at the origin; requests followed redirects successfully.

The live HTML shell contains a homepage title, description, Open Graph values, and canonical `https://grantdeskhq.com/`. It does **not** contain route-specific article titles, route-specific canonicals, Article JSON-LD, or rendered article body before JavaScript executes. The Googlebot-header response was also HTTP 200 with the same SPA shell. Route metadata and Article JSON-LD are added by React after hydration, and the static route generator copies the same shell to each route.

## Findings

- Sitemap/robots: PASS for availability and URL consistency; no thin or fake URL was added.
- Indexability/status: BLOCKED for confidently validating rendered route content from raw live HTML. HTTP 200 alone does not prove that the six article URLs expose unique crawlable content.
- Canonicals/metadata/structured data: PASS in client-rendered route tests, but live raw-HTML evidence is insufficient for crawler-facing validation.
- Internal links: PASS in route tests and source inspection: blog articles link to Resources, Blog, Pricing, and source references; the site layout links to Resources and the field guide.
- Mobile: responsive viewport metadata is present in the shell. A full browser mobile render was not promoted or changed; raw HTTP checks cannot validate layout behavior.
- Existing resources: all six existing blog URLs are live and return 200. The four overnight resource URLs are present in the sitemap, static route list, and substantive-content tests.

## Low-risk repair decision

No code repair was made. Adding static route-specific metadata requires changing the build/prerender strategy, and blindly copying metadata would risk duplicate or misleading SEO content. This is not a safe one-line repair.

## Human-only follow-up

After a route-aware/prerendered candidate is validated, a human should use Google Search Console URL Inspection for `/resources`, `/blog`, and all six article URLs, then request indexing where appropriate; separately validate the sitemap under Sitemaps. Repeat the same checks in Bing Webmaster Tools. These actions require account access and are not performed by this worker. Do not change production traffic until route-specific raw HTML or rendered-crawl evidence is available.

