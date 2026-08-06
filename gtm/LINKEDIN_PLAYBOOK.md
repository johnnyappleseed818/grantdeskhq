# LinkedIn community and comment playbook

LinkedIn does not permit third-party scraping or automated comments, likes, messages, or connection activity. This playbook creates a researched queue for a person to review and use manually.

## Signed-in group searches

Group membership and visibility vary by account, so these links search LinkedIn directly instead of inventing group URLs:

- [Nonprofit finance groups](https://www.linkedin.com/search/results/groups/?keywords=nonprofit%20finance)
- [Nonprofit accounting groups](https://www.linkedin.com/search/results/groups/?keywords=nonprofit%20accounting)
- [Grant management groups](https://www.linkedin.com/search/results/groups/?keywords=grant%20management)
- [Grant professionals groups](https://www.linkedin.com/search/results/groups/?keywords=grant%20professionals)
- [Nonprofit CFO groups](https://www.linkedin.com/search/results/groups/?keywords=nonprofit%20CFO)

Before joining, check whether vendors are permitted, whether promotional links are restricted, and whether finance/reporting discussions are active.

## Public communities to follow

- [Grant Professionals Association](https://www.linkedin.com/company/grant-professionals-association)
- [Association of Nonprofit Accountants & Finance Professionals](https://www.linkedin.com/company/anafp)
- [Nonprofit Financial Commons](https://www.linkedin.com/company/nonprofit-financial-commons)

These are public professional pages, not represented as private LinkedIn groups.

## Comment formula

1. Reflect the specific problem in the post.
2. Add one useful workflow observation.
3. Ask one genuine question that helps validate the problem.
4. Do not add a GrantDeskHQ link unless it directly answers a request.
5. If mentioning the product, say “I’m building GrantDeskHQ” so the affiliation is clear.

Example:

> The distinction between clean books and a completed funder report is important. Teams can have accurate QuickBooks data and still spend time mapping it to funder budget lines, collecting program updates, and assembling a separate template. Which part of that handoff creates the most rework for your team?

## Weekly routine

- Monday: review five saved searches and add up to five relevant posts to the queue.
- Tuesday and Thursday: post one reviewed, useful comment on an active discussion.
- Wednesday: publish one educational founder post using a synthetic example.
- Friday: record replies and update the pain taxonomy; do not treat likes as qualification.

The generated comment queue is refreshed by `npm run gtm:build` and stored at `gtm/generated/linkedin-engagement-queue.md`.
