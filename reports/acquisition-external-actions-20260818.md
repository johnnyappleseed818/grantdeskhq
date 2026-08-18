# Acquisition external-action record — 2026-08-18

This record separates completed actions from preparation. It does not describe an action as submitted or published unless the execution environment produced direct evidence.

## Completed external acquisition actions

None. No directory listing, search-engine submission, community post, form submission, purchase, or email was completed in this run.

The only external infrastructure action was the creation of a zero-traffic Cloud Run validation candidate. It is not public promotion and is not an acquisition publication.

## Search and indexing status

| Service | URL | Status | Evidence / blocker |
| --- | --- | --- | --- |
| Google Search Console | https://search.google.com/search-console | Human action required | No Search Console OAuth/browser session is available to this environment. After the candidate is promoted, use the verified `https://grantdeskhq.com/` property: **Sitemaps → Add a new sitemap → `sitemap.xml`**, then inspect `/resources`, `/blog`, and each current article and request indexing only after the live raw HTML is verified. |
| Bing Webmaster Tools | https://www.bing.com/webmasters | Human action required | Bing requires a verified owner session. Its official documentation confirms that a verified site can submit the sitemap and individual URLs. Importing a verified Search Console property is acceptable if the owner chooses it. |
| IndexNow | https://www.indexnow.org/documentation | Not implemented | An IndexNow key must be publicly served at the canonical production domain before URLs can be submitted. Creating a key before the SEO candidate is promoted would not produce a valid submission, so no request was sent. |

`https://grantdeskhq.com/robots.txt` currently permits crawling and references `https://grantdeskhq.com/sitemap.xml`; the current live sitemap was fetched read-only before candidate promotion.

## Credible free directory opportunities

No record was created or claimed because the required verified business facts and authorized owner sessions are unavailable here. The original evidence and requirements remain in [overnight-directory-entity-audit-20260817.md](./overnight-directory-entity-audit-20260817.md).

| Service | Submission / claim URL | Status | Exact human follow-up |
| --- | --- | --- | --- |
| LinkedIn Company Page | https://www.linkedin.com/help/linkedin/answer/a541981 | Human action required | An authorized founder or company-page admin should first search for an existing GrantDeskHQ page, claim it if present, or create one with only confirmed company facts. |
| Bing Places | https://www.bingplaces.com/ | Human action required | A verified owner should search for an existing record and claim it only if GrantDeskHQ meets the service's eligibility requirements and has confirmed business details. |
| Apple Business Connect | https://businessconnect.apple.com/ | Human action required | A verified owner should confirm eligibility, accurate business data, and verification requirements before claiming a place card. |
| Product Hunt | https://www.producthunt.com/ | Human decision required | A maker should decide whether a launch is strategically appropriate; a listing should not be created merely for a backlink. |

## Community publication

No authenticated official or founder social account session was available to this execution environment, so no post was attempted. Do not treat a missing session as permission to post from another identity.

### Prepared post

**Destination:** https://www.linkedin.com/feed/ (sign in only as an authorized GrantDeskHQ founder or Company Page administrator).

**Disclosure:** “I’m building GrantDeskHQ.”

**Post:**

> A grant reporting deadline is not the first date that matters. The practical deadline is when a finance, programs, and grants team can still reconcile numbers, locate supporting evidence, and complete review without rushing. One simple practice: keep a reporting calendar with the funder deadline, the internal review date, the data-owner date, and the source document for each requirement. It turns “we should start soon” into visible ownership. I’m building GrantDeskHQ around this post-award workflow and would value examples of what makes reporting calendars actually usable for your team.

**Exact manual action:** review the current platform/community rules, confirm the disclosure and audience fit, adapt the post rather than cross-posting it mechanically, publish once from the authorized account, and record the resulting URL. Do not add claims about customers, automation results, or product outcomes that are not substantiated.

## Safety confirmation

- Emails sent: 0
- Community posts/comments/DMs: 0
- Directory forms submitted: 0
- Purchases or trials: 0
- Production traffic changes: 0
