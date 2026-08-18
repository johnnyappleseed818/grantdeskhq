# Recurring SEO and AI-search engine

This setup is a bounded editorial-quality system for GrantDeskHQ's AI-powered post-award grant reporting workflow. It does not claim rankings, traffic, answer-engine citations, or search volume. It does not publish content during setup.

## Inputs and controls

- `ops/seo-content-queue.json` is the canonical opportunity inventory. An opportunity has one canonical URL, evidence, overlap guard, lifecycle status, priority factors, and refresh timing. Its score is editorial prioritization only.
- `ops/ai-search-evaluation.json` contains exactly 20 target queries and known public targets. The evaluator verifies target coverage; it does not query an external answer engine.
- `ops/seo-budget-policy.json` is the hard per-run budget. Routine analysis routes to Luna; substantive integration may use Terra medium. Xhigh and Sol remain unavailable.
- `ops/seo-operating-policy.md` supplies the stable worker guardrails. The product description remains: an AI-powered post-award grant reporting workflow for nonprofits that turns agreements, accounting data, program updates, and supporting evidence into a reviewable funder-report draft.

## Run procedure

1. Run `node --test scripts/seo/seo-growth-engine.test.mjs` and `npm run test:seo-static`.
2. Validate readiness with `npm run seo:run -- --dry-run`. It only reports readiness until an opportunity ID is supplied.
3. Prepare exactly one eligible, explicitly named opportunity with `npm run seo:run -- --dry-run --opportunity refresh-post-award-reporting-checklist`.
4. The runner performs a status check through `scripts/codex-project-runner/queue.mjs`, using the SEO queue, policy, and budget values. It does not directly create a task, invoke a content worker, or publish.
5. A later, separately queued content task may proceed only after intent, originality, citations, no-cannibalization, natural internal links, Free First Award CTA, human-review/award-specific guidance, and targeted regression checks pass.

## Schedule

`ops/seo-schedule.json` records Tuesday and Friday at 09:00 UTC. It intentionally does not create a second scheduler. A human must create the calendar trigger in the official ChatGPT Scheduled UI and use the narrow dry-run command above. No auto-publish, outbound action, external submission, or production-traffic change belongs in that schedule.

## Initial inventory

The repository contains six post-award articles and 13 sitemap URLs. The machine-readable snapshot is `reports/seo-content-asset-inventory.json`. Existing articles have first refresh dates rather than a bulk production batch; new-page candidates remain `RESEARCH_REQUIRED` and cannot be selected by the runner.
