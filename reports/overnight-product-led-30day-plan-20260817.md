# Free First Award: 30-day non-email acquisition plan

Date: 2026-08-17  
Task: `overnight-product-led-30day-plan-20260817`  
Mode: planning and source review only. No outreach, posting, account creation, form submission, email, payment, production traffic change, or external-console change occurred.

## Executive decision

Keep the Free First Award as the single anonymous primary CTA and make the first-use experience easier to understand before adding more acquisition volume. The safest 30-day program is product-led and education-led: improve the handoff into `/assessment`, strengthen links from existing proof, publish a small number of source-grounded resources, and measure progression to report start. Email automation remains deferred.

## What is actual today

These are repository or audit observations, not performance claims:

- The homepage and anonymous navigation use **Free First Award** and route to `/assessment`.
- The assessment path has a questionnaire/no-file route and an email-draft route. The CTA discloses that it opens a local draft; it is not a submitted web form.
- The product positioning is post-award reporting: agreement and funder form → requirements/checklist → finance and program inputs → evidence → source-linked draft → human review. Accounting remains the book of record; the product does not submit, certify, or approve reports.
- Public proof exists in the synthetic sample report, downloadable synthetic agreement/budget/ledger/evidence assets, six published articles, Resources, Pricing, and How It Works routes. Synthetic/redacted inputs are explicitly supported for evaluation.
- GA4 is consent-gated. Manual page views and allowlisted conversion events are wired; private routes and sensitive form, account, file, grant, and payment data are excluded. A live audit observed one manual page view for `/` and one after navigation to `/pricing`, plus `pricing_view` in that test session. This is not a traffic baseline.
- The sitemap lists 10 public URLs. A live raw-HTML audit found route-specific article metadata/body is added after hydration, so crawler-facing SEO performance is not established.
- Community research identifies relevant nonprofit education and association channel families, but does not establish current posting permissions, reach, or acceptance of commercial content. No posts were made.
- Existing content and audit work explicitly prohibit fabricated citations, unsupported accuracy/compliance/customer claims, mass-generated pages, and disguised lead generation.

## Journey assessment and low-risk friction reductions

| Stage | Evidence-backed friction | 30-day reduction | Success signal |
|---|---|---|---|
| Discover → understand | The product category can be confused with discovery/proposal software; the site says it starts after award. | Repeat one plain-language sentence in the homepage hero, resource intros, sample page, and assessment intro: “Turn one awarded grant into a reviewable reporting workflow.” Link to the relevant proof. | Fewer navigation dead ends; higher CTA-to-assessment progression (target below). |
| Assessment entry | `/assessment` is the primary route, but visitors may not know what to prepare. | Add a short “bring one award” checklist using existing inventory: agreement, funder form, approved budget, accounting export, program update, and evidence. Label optional/synthetic inputs clearly. | Assessment starts and completed intake steps. |
| Assessment choice | Email draft and questionnaire are different paths. | Present questionnaire as the immediate no-file path and email draft as an optional handoff, with the existing disclosure unchanged. Do not introduce automation. | Fewer abandoned assessment starts; no increase in email handling burden. |
| Proof → trial | The sample page demonstrates output, but the next step is below the downloads. | Add/retain a prominent “try one award” link beside the sample summary and each relevant article CTA, preserving the existing `/assessment#contact` destination where used. | Sample/article CTA clicks and assessment starts. |
| Trust → activation | Source-linked output and human review are differentiators, but they must remain concrete. | Show a compact “what the first run produces” checklist: requirements, reporting plan, financial mapping, program narrative, evidence gaps, and review queue. Do not promise accuracy or time savings. | Report started, upload, and report-generated events. |

All changes above are copy, navigation, checklist, or instrumentation-review candidates. They do not require Stripe, production traffic, outbound communication, or email automation.

## 30-day operating plan

Targets below are proposed operating targets, not forecasts. Baselines should be captured from consented analytics before judging performance.

### Days 1–7: instrument the first-use decision

- Capture a baseline for public CTA click → assessment start → questionnaire/email-draft choice → report start/upload/generated. Record counts and rates only when the existing consent and event contracts permit it.
- Review `/assessment`, sample output, Resources, and the six articles for consistent Free First Award links and the same preparation checklist.
- Create one reusable “bring one award” checklist from the existing supported input types. Keep a synthetic/redacted example beside it.
- **Target:** 100% of reviewed primary CTA surfaces use the same offer name and destination; 0 new email automation.

### Days 8–14: improve owned discovery

- Publish or update one controlled evergreen resource: “Grant reporting checklist: agreement to reviewable draft.” Use primary-source links and clearly separate general guidance from award-specific instructions.
- Add contextual internal links from the existing six articles and Resources to the checklist, sample output, and assessment.
- Prepare (do not submit) a route-aware SEO/prerendering candidate because raw live HTML currently does not prove unique article content to crawlers. Validate locally before any deployment decision.
- **Target:** one reviewed resource, all links tested, no unsupported claims; SEO target is a testable crawlability improvement, not a ranking promise.

### Days 15–21: AI-search and community learning loops

- Turn the checklist into concise answer blocks with definitions, steps, caveats, and visible primary sources. Preserve factual Organization/WebSite structured data and avoid unsupported FAQ/review/rating schema.
- Draft two channel-adapted educational posts from the existing bank: FOA-to-plain-language brief and five-minute opportunity triage. A human must re-check each channel’s current rules and approve any publication. Do not post autonomously.
- Build a partner-ready one-page worksheet for a funder conversation or shared grant calendar. It is a local asset, not a partner contact or endorsement.
- **Target:** two drafts and one worksheet reviewed; 0 external publications without human approval.

### Days 22–30: product-led proof and referral readiness

- Add a non-automated referral prompt after a successful local/product milestone only if the existing UI has a suitable reviewable state; otherwise document the copy and event requirement for a later implementation.
- Create a lightweight “share this workflow with your finance/program reviewer” artifact or copy block. It must share product education, not personal data or an unsolicited message.
- Compare the baseline with the same funnel stages. Keep, revise, or retire assets based on assessment starts and report-start/generated signals, not pageviews alone.
- **Target:** establish a measured baseline and one decision record per channel/asset. No success-rate, revenue, or ranking target is asserted until actual data exists.

## Channel allocation

| Engine | 30-day action | Actual inventory | Target | Assumption / guardrail |
|---|---|---|---|---|
| SEO | One controlled checklist plus internal links; investigate route-aware rendering. | 10 sitemap URLs; six articles; existing SEO audits/tests. | 1 resource, 100% link/metadata tests pass. | Search demand and ranking are unknown; no volume forecast. |
| AI search | Answer-first blocks, stable definitions, primary-source links, factual schema. | Existing AI-search audit and structured-data tests. | 1 reviewed answer set; no unsupported claims. | Placement/citations are unmeasured; do not claim visibility. |
| Communities | Draft two educational posts; human review before any publication. | Existing community content bank and channel research. | 2 reviewed drafts, 0 autonomous posts. | Rules, reach, and fit are unverified. |
| Partners | Local worksheet and neutral educational asset. | Existing partner-intelligence reports, without assuming endorsement. | 1 asset ready for human selection. | No contact discovery or outreach in this task. |
| Organic content | Refresh one evergreen resource and connect existing articles. | Six published articles and Resources route. | 1 controlled update; review source links. | Publish only when useful, differentiated, and factually grounded. |
| Product-led | Preparation checklist, clearer assessment choice, proof-to-assessment links. | `/assessment`, sample output, synthetic downloads, analytics events. | Measure funnel; propose one safe copy/navigation iteration. | No guaranteed conversion lift. |
| Referrals | Reviewer/share artifact specification only. | Existing human-review positioning. | 1 non-automated concept ready. | No outbound or referral automation. |
| Email | Deferred. Preserve local draft/questionnaire behavior and disclosure. | Current assessment audit. | 0 automation, 0 sends. | Requires a separately authorized workflow and privacy review. |

## Measurement contract

Use the existing consent-gated GA4 allowlist and event names. Primary decisions should use `free_first_report_click`, assessment/report-start and upload/generated signals where already wired. Treat pageviews, search impressions, community reach, and email opens as secondary context, not product success. Do not add uploaded filenames, grant contents, form text, account IDs, or payment details to analytics.

## Stop conditions

Pause an asset if its claim cannot be traced to a primary source or clearly labeled product experience; if a channel’s rules prohibit commercial participation; if a proposed referral path requires unsolicited outreach; or if a change would require production traffic, Stripe, email automation, or a new data collection behavior. Escalate those as separate tasks with human review.

## Validation basis

This plan was checked against `reports/overnight-conversion-audit-20260817.md`, `reports/overnight-acquisition-qa-20260817.md`, `reports/ga4-live-audit-20260817.md`, `reports/overnight-community-content-20260817.md`, `reports/ai-search-readiness-20260817.md`, `reports/seo-live-indexability-audit-20260817.md`, the homepage, assessment, pricing, sample-report, blog, and analytics source/tests. It records actual inventory separately from targets and assumptions and keeps email automation deferred.
