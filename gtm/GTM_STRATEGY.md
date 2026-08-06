# GrantDeskHQ go-to-market strategy

## The beachhead

Start with U.S. nonprofit finance teams that prepare recurring post-award grant reports and still use spreadsheets or document templates after exporting approved accounting data.

Primary users and buyers:

- CFOs, controllers, vice presidents of finance, and finance directors
- Directors of grants and compliance
- Grants managers who coordinate the financial and narrative report

Secondary channel after direct nonprofit validation:

- Outsourced nonprofit accounting and fractional-CFO firms managing the same workflow across multiple clients

This preserves the larger agency opportunity without making “outsourced” part of every customer-facing sentence.

## The category wedge

Instrumentl is strongest in grant discovery, funder research, applications, deadlines, and grant tracking. Accounting products are the financial source of truth. GrantDeskHQ should own the work between those systems and the funder's final reporting format.

The defensible workflow is:

1. Extract award rules and restrictions.
2. Understand the funder's actual reporting template.
3. Suggest GL-to-funder-budget mappings with evidence and confidence.
4. Calculate budget versus actual and identify material variances.
5. Ask program staff only for facts and documents that remain missing.
6. Draft source-supported financial explanations and narrative answers.
7. Detect contradictions and unsupported claims.
8. Produce a review package with citations and open items.

Do not position GrantDeskHQ as a replacement for Instrumentl, QuickBooks, Sage Intacct, or Blackbaud until real usage proves a broader replacement case. The immediate message is simpler: finish the post-award report with less spreadsheet work.

## ICP hypotheses to test

These are qualification hypotheses, not established customer facts.

Strong prospective fit:

- The organization manages several active restricted grants.
- Finance exports transactions from an accounting system into Excel for funder reporting.
- Funder periods or categories do not match fiscal-year accounting reports.
- Program and finance staff contribute different parts of the same report.
- The team repeatedly chases receipts, explanations, approvals, or program figures.
- A finance professional reviews the final package.

Weak fit:

- The organization primarily wants grant discovery or proposal writing.
- One simple grant is reported once per year with little financial detail.
- A current system already produces the exact funder format with minimal manual work.
- The buyer expects autonomous approval or automatic funder submission.

## Funnel

| Stage | Customer question | Asset | Primary measure |
| --- | --- | --- | --- |
| Pain discovery | “Is this my workflow?” | Reddit/LinkedIn educational post | Relevant replies and profile visits |
| Self-qualification | “Where is my process breaking?” | Post-award workflow questionnaire | Completed assessments |
| Proof | “Can it handle a real report?” | Historical report assessment / working prototype | Historical reports started |
| Trust | “Can I verify the AI?” | Evidence links, contradiction checks, review gates | Drafts reviewed and open items resolved |
| Conversion | “Is this worth keeping?” | Founding nonprofit plan | Paid conversions and retained reporting cycles |

## Channel engine

### 1. Reddit: listen first

- Monitor the five approved queries in `scripts/gtm/scan-reddit-api.mjs` only after Reddit commercial API access is cleared.
- Manually review threads and record the exact pain, current workaround, role, tool stack, price language, and workflow consequence.
- Participate only where subreddit rules permit it. Answer the question directly, disclose affiliation, and avoid dropping a link unless requested.
- Turn recurring language into product copy and educational posts; do not treat thread counts as market prevalence.

### 2. LinkedIn: build credibility through useful comments

- Follow the public practitioners and communities in `data/linkedin-engagement.json`.
- Review the queue weekly and contribute to two relevant conversations with a specific workflow observation or question.
- Publish two useful founder posts per week. One should describe a real workflow pattern; the other should show how source-linked AI review works using synthetic data.
- Never automate LinkedIn access or engagement.

### 3. Email: permission-based nurture

- The public research list is for organization research and message personalization only.
- Email becomes automated only after a person explicitly opts in through the questionnaire, website, event, or direct request.
- Use Resend Broadcasts so unsubscribe links and suppression are handled by the provider.
- Send one useful research follow-up first. Do not begin a generic multi-email sales sequence until engagement proves it is wanted.

### 4. Search and educational content

Build pages around the exact problem language:

- How to turn a QuickBooks grant export into a funder report
- Grant budget versus actual when the grant period differs from the fiscal year
- How to map GL accounts to funder budget categories
- Grant report checklist for finance and program teams
- How to reduce missing receipts and unsupported narrative claims
- Instrumentl plus QuickBooks: what still happens after the award

Each page should include a practical worksheet or synthetic example and one CTA: test a completed historical report.

## Four-week launch cycle

### Week 1 — sharpen the problem

- Publish: “Why accurate books still do not produce the funder report.”
- Comment on two reviewed LinkedIn discussions.
- Review the ten Reddit threads and add any new language to the pain taxonomy.
- Drive traffic to the workflow questionnaire.

### Week 2 — show the financial wedge

- Publish a synthetic GL-to-funder-category walkthrough.
- Publish a grant-period BVA example that does not imply autonomous reconciliation.
- Invite questionnaire opt-ins to test one historical report.

### Week 3 — show evidence controls

- Publish a synthetic example of a contradicted program figure and its source.
- Publish the missing-input questionnaire workflow.
- Ask engaged users which evidence or approval blocks their reports most often.

### Week 4 — test willingness to pay

- Offer the $49 founding nonprofit plan only after the historical report experience.
- Record objections by category: price, trust, workflow fit, data handling, missing integration, or no urgency.
- Decide whether to deepen nonprofit direct sales or prioritize the agency channel based on completed reports and paid conversion, not likes.

## Metrics that matter

- Qualified workflow-assessment completions
- Percentage reporting a spreadsheet bridge after accounting export
- Historical report assessments started and completed
- Percentage of reports with mapping, missing-evidence, or contradiction issues found
- Professional reviewers who return for a second report
- Trial-to-paid conversion at $49/month
- Cost per completed historical report assessment
- Opt-in email reply and unsubscribe rates

Do not use follower count, impressions, or raw lead count as proof of demand. The decisive milestone is a finance professional using GrantDeskHQ on a historical report and paying to use it again.
