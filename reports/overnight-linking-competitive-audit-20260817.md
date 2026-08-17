# Overnight internal-linking and competitive audit — 2026-08-17

## Result

All six published guides are reachable from `/blog` and `/resources`, and each article links back to both hubs, the assessment, and pricing. Each article now also exposes two same-cluster related resources, so the public guide graph has no orphaned content pages.

## Competitive facts reviewed

This is descriptive research, not a product ranking or comparison claim.

| Product | Current public fact | Source | GrantDeskHQ implication |
| --- | --- | --- | --- |
| Instrumentl | Its Full Lifecycle plan is positioned for discovery through post-award spend tracking and includes accounting integrations, Spenddown, 15 core users, 20 collaborators, and 40 projects by default. | [Instrumentl Full Lifecycle Plan](https://help.instrumentl.com/en/articles/14895858-full-lifecycle-plan), published May 27, 2026 | Keep the roadmap focused on the narrower post-award reporting handoff; do not imply coverage parity. |
| Foundant | Grant Lifecycle Manager is described as covering application through award and reporting for funders; Foundant also describes role-based permissions and integrations on its foundation product page. | [Foundant GLM introduction](https://support.foundant.com/hc/en-us/articles/8616868040087-Introduction-to-Grant-Lifecycle-Manager), [Foundant foundation grant software](https://www.foundant.com/en-gb/products/grant-management-software-for-foundations/) | Distinguish funder-side lifecycle administration from grantee-side report preparation. |
| Submittable | Its public grants page positions the product as full-lifecycle grant management and lists form building, collaboration, and financial tracking capabilities. | [Submittable grant management](https://www.submittable.com/solutions/grants) | Avoid broad “all-in-one” language; explain the specific reporting workflow and human review boundary. |

No competitor pricing, customer counts, performance metrics, security claims, or superiority claims were added to product pages. No copied competitor wording was used.

## Roadmap refresh

The next content work remains: grant reporting checklist, reporting calendar, variance narrative examples using fictional facts, reconciliation workflow, and a balanced comparison page only after another current fact, legal, and brand review. The comparison page remains conditional and unpublished.

## Checks

- `npm test -- --run src/test/blog.test.tsx src/test/app.test.tsx`
- `npm run build`
- Manual route inventory: six blog slugs, `/blog`, `/resources`, `/assessment`, and `/pricing`.
