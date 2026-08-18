# GrantDeskHQ acquisition finish — 2026-08-18

## Final status

**PARTIALLY COMPLETE.** The overnight work was preserved, reviewed, and stabilized on the dedicated completion branch. The new acquisition implementation is validated on a zero-traffic candidate, but it is not promoted because production GA4 is configured to emit a duplicate SPA `page_view` event. No indexing or community publication was represented as complete without evidence.

## Recovery review

| Category | Reviewed result |
| --- | --- |
| A — safe and useful | The 26 existing overnight commits were preserved. Their GTM, prospect, partner, content, and audit work remains on this branch. |
| B — corrected | `src/lib/gtmOverview.ts` now uses the explicit `.ts` extension required by Node 22's TypeScript stripper. This fixed the candidate runtime startup failure in revision `grantdeskhq-prototype-00175-tuk`. |
| C — incomplete | GA4 SPA duplicate-page-view behavior, Search Console/Bing access, IndexNow setup, directory claims, and social publishing all require the specific follow-up below. |
| D — not deployed | Historical queue state, generated synthetic samples, and planning reports were committed as evidence only; they do not change live product behavior. |

## Git

- Branch: `codex/acquisition-finish-20260818`
- Existing overnight commits reviewed: 26 (`origin/feature/outreach-feedback-tracking..279f94c`)
- Completion commits: `945f359`, `b2705d2`, and `da1e29f`
- Worktree and remote status: this completion branch was pushed; the local and remote branch heads matched at the final verification checkpoint.

## Tests and validation

All of the following completed with exit status 0 after the changes:

- `npm run build` (including typecheck and static route generation)
- `npm run test:seo-static` — 9 representative public routes passed title, canonical, Twitter metadata, static-content, sitemap, and robots checks
- `npm test`
- `npm run lint`
- `npm run gtm:test` — 5 GTM tests passed
- `npm run test:grantdesk-regression`
- `npm run audit:stripe-pci` — 191 files scanned, no raw-card-handling violation
- `git diff --check`

A filename-only secret-pattern scan found only a pre-existing billing test fixture outside this branch's diff; no new candidate secret pattern was introduced.

## Candidate and deployment

- Production before and after: `grantdeskhq-prototype-foundergtm0817`, **100% traffic**
- Zero-traffic candidate: `grantdeskhq-prototype-00177-bec`
- Candidate tag: `https://acquisition-finish-0818---grantdeskhq-prototype-me423s5k5a-uc.a.run.app`
- Candidate traffic: **0%**
- Candidate health: PASS
- Candidate route smoke: `/`, `/pricing`, `/resources`, `/blog`, an article, `/assessment`, `/contact`, and `/demo` all returned HTTP 200.

The candidate serves static acquisition content, route-specific title/description/canonical/Open Graph/Twitter metadata, and structured data for 13 public acquisition routes. It also serves a 13-URL sitemap; `robots.txt` permits crawling and points to the production sitemap.

**No promotion occurred.** The rollback revision remains `grantdeskhq-prototype-foundergtm0817`.

## GA4 verification evidence

The Playwright browser validator loaded the candidate, granted analytics consent, navigated through the SPA, and captured actual requests to Google collection endpoints:

- GA script loaded: PASS
- Measurement ID: `G-P6N5EME81J`
- Captured events: `page_view`, `pricing_view`, `free_first_report_click`
- Sensitive payload fields: none added by this implementation
- CSP allowed Google Analytics collection: PASS
- Duplicate page view: **detected for `/pricing`**

The duplicate is consistent with GA4 Enhanced Measurement's browser-history page-change option combined with the application's explicit SPA page-view event. The candidate remains at zero traffic until this is resolved.

### Exact GA4 human action

In the GA4 property for `G-P6N5EME81J`: **Admin → Data streams → select the GrantDeskHQ web stream → Enhanced measurement (gear) → turn off “Page changes based on browser history events” → Save.** Then re-run the candidate validator and promote only when `duplicatePageViews` is empty.

## Prospect and partner foundation

- Generated target list: `/home/eli_katz/grantdeskhq-acquisition-targets-20260818.csv`
- Count: 30 source-backed organizations — 20 direct nonprofits and 10 referral/implementation partners.
- Every row records fit rationale, a public award/organization source, and a named decision maker only where the existing research recorded one. Ambiguous or stale titles are explicitly marked for reconfirmation. No email was guessed or enriched, and no contact action occurred.

## Indexing, directories, and community actions

No directory listing, search-engine submission, social post, form submission, email, purchase, or trial occurred. The evidence-separated action record is [acquisition-external-actions-20260818.md](./acquisition-external-actions-20260818.md).

The live site already exposes crawl-permitting `robots.txt` and a sitemap. Search Console/Bing submission needs an authenticated verified-owner session; IndexNow should be implemented only after its public key file is live on the canonical domain. A prepared founder-disclosed community post and exact manual action are in the external-action record.

## Measurable results

This run produced no verified visitors, signups, replies, trials, customers, directory listings, index submissions, or published community posts. It produced a validated zero-traffic candidate, static SEO implementation, and a 30-organization research target file; those are outputs, not acquisition results.

## Rollback procedure

No rollback is currently needed because production traffic was not changed. If a later promotion requires rollback, use the Cloud Run revision preserved above:

```bash
gcloud run services update-traffic grantdeskhq-prototype \
  --to-revisions=grantdeskhq-prototype-foundergtm0817=100 \
  --region=us-central1 \
  --project=grantdeskhq-proto-ek-2026
```

## Human blockers

1. Disable GA4 Enhanced Measurement browser-history page changes for `G-P6N5EME81J`, then authorize/review the empty-duplicate candidate trace.
2. Use the verified Google Search Console and Bing Webmaster owner accounts to submit the sitemap and request indexing only after promotion.
3. Use an authorized official/founder social and directory owner session, after confirming the factual company profile details, for any community post or directory claim.

## Highest-priority next seven-day actions

1. Correct the one GA4 property setting above and re-run the browser trace.
2. Promote `grantdeskhq-prototype-00177-bec` only after the trace has no duplicate page views; retain `grantdeskhq-prototype-foundergtm0817` as rollback.
3. Submit `https://grantdeskhq.com/sitemap.xml` in Search Console and Bing Webmaster Tools; request indexing for Resources, Blog, and the six articles.
4. Have an authorized founder/company administrator publish the prepared, disclosed educational LinkedIn post once after reviewing current platform rules.
5. Human-review the 30 target rows, reconfirm the records marked stale, then run the existing approved contact-enrichment/suppression workflow for only the highest-priority contacts.
