@RTK.md

# GrantDeskHQ project isolation

- Use `$major-decision-council` for consequential multi-option decisions; do not use it for routine execution or a clear incident rollback/recovery action.

- This repository belongs only to GrantDeskHQ.
- Do not inspect, edit, deploy, or otherwise access ZenLLM repositories, folders, services, or cloud resources while working here.
- Every Google Cloud command that can read or change a cloud resource must include `--project=grantdeskhq-proto-ek-2026` explicitly. Do not rely on the Cloud Shell default project.

# Autonomous execution contract

When the user explicitly asks Codex to **BUILD**, **IMPLEMENT**, **FIX**,
**MIGRATE**, **TEST**, **AUDIT**, **COMPLETE A PROJECT**, or **DEPLOY TO QA**,
Codex is authorized to continue through all reasonably necessary
non-destructive engineering actions in scope without repeatedly requesting
permission.

## Pre-authorized engineering actions

- Inspect source, configuration, logs, git state, and existing cloud resources.
- Create, edit, and delete in-scope project files; create local branches and
  worktrees; clean disposable test artifacts.
- Install normal development dependencies; run builds, lint, unit,
  integration, end-to-end, Playwright, regression, and reliability suites.
- Use normal Git/GitHub, existing GCP/Firebase, Stripe, npm, OpenAI, and QA
  tooling; use approved Secret Manager values without printing or committing
  them.
- Create temporary test data or accounts; inspect QA logs; deploy zero-traffic
  QA candidate revisions when validation requires it.
- Diagnose failures, inspect their output, apply safe repairs, retry bounded
  transient failures, choose a safe alternative, commit completed work, and
  push project branches when appropriate.

Do not stop merely to ask whether to continue, run tests, install a normal
dependency, fix an in-scope failure, or advance to the next required phase.

## Actions requiring human approval

Do not perform any of the following without explicit task-specific approval:

- Destructive production-data deletion, force-pushes/history rewriting, or
  deletion of validated tags.
- Live production traffic changes unless specifically authorized by the task.
- Purchases, material new cloud spending, billing-account changes, legal or
  contractual commitments, or disabling meaningful security controls.
- Live autonomous outbound marketing before explicit LIVE-mode authorization.
- Interactive OAuth/2FA that cannot be completed programmatically, or any
  exposure, printing, or insecure handling of secrets.

If one of these requires a human, finish all independent work first and report
the consolidated blocker once.

## Failure and completion standard

For failures: diagnose, inspect logs/output, apply a safe repair, retry with a
bounded count, try a reasonable alternative, and continue independent work.
Never loop indefinitely or weaken tests merely to obtain a pass.

A project is complete only when applicable implementation, build, tests,
critical regressions, QA/deployed validation, security sanity checks, git
state, commit, and a concise completion report are complete. Record each
autonomous project with a machine-readable `project-result.json` whose status
is `PASS`, `PARTIAL`, or `FAIL`; `PASS` cannot have critical unresolved
blockers.
