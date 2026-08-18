# GrantDeskHQ autonomous project runner

## Focused cost-governed queue runs

For ordinary queued work, use the conservative default rather than an open-ended
overnight command:

```bash
npm run agent:run
npm run agent:status
npm run agent:queue:stop
```

`ops/agent-budget-policy.json` centrally limits a normal run to 12 worker
invocations, 20 task attempts, 90 minutes, five Terra medium/high invocations,
one Terra xhigh invocation, zero Sol invocations, and two full regressions. Two
worker slots are reserved for validation, checkpointing, commit/push, and the
final report. The runner launches only explicit queued tasks; it does not invent
additional work when time remains. `agent:status` reports live budget and any
available token/cache telemetry.

An operator may extend a run only with an explicit override, for example:

```bash
CODEX_QUEUE_ALLOW_BUDGET_OVERRIDE=1 CODEX_QUEUE_MAX_WORKERS=18 CODEX_QUEUE_MAX_RUNTIME_MINUTES=120 npm run agent:run
```

Sol remains disabled unless the same explicit override includes
`CODEX_QUEUE_ALLOW_SOL=1`; this does not bypass any production or human safety
approval.

Run one bounded project in a durable tmux session:

```bash
scripts/codex-project-runner/run-project.sh --tmux <project-slug> <prompt-file> [worktree]
```

Each run is serialized per project and saved under
`~/grantdesk-project-runs/<project-slug>/<UTC timestamp>/`. The directory
contains the prompt, JSONL execution logs, final agent output, `final-report.txt`,
and machine-readable `project-result.json`. A `latest` symlink points to the
newest run. The runner uses the documented `codex exec --sandbox
workspace-write --json` mode, makes at most one retry after a
nonzero exit, converts recoverable nonzero exits and TERM/INT/HUP interruptions
into a durable `FAIL` completion record, and exits zero only when both Codex and
the completion record report `PASS`.

Attach a detached run with:

```bash
tmux attach -t grantdesk-project-<project-slug>
```
