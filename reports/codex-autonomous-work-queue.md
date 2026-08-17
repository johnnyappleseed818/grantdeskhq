# Durable Codex work queue

## Supported local CLI mechanism

The installed CLI supports `codex exec` for non-interactive work with `--strict-config`, `--json`, `--output-schema`, and `--output-last-message`. It also supports `codex exec resume` for a named/last non-interactive session. The controller starts new bounded tasks with `codex exec`; it does not rely on fragile interactive-session continuation.

## Components

- `ops/codex-work-queue.json`: canonical task queue and checkpoint state.
- `ops/codex-operating-policy.md`: policy prepended to every task.
- `ops/codex-task-result.schema.json`: required final structured result.
- `scripts/codex-project-runner/queue.mjs`: status, run, stop, add, requeue, and blocker commands.
- `scripts/codex-project-runner/start-queue-tmux.sh`: detached tmux launcher.

The controller acquires a PID lock, detects stale locks, selects the highest-priority dependency-satisfied queued task, writes a RUNNING checkpoint, invokes the supported CLI, verifies declared artifacts/tests before accepting PASS, retries bounded failures, records blockers, and continues to the next unblocked task. It has an eight-hour default, 20-task ceiling, stop-file handling, and permanent NO_PRODUCTION/NO_OUTBOUND/NO_PURCHASES/NO_FORCE_PUSH environment policy.

## Commands

- `npm run codex:queue:status`
- `npm run codex:queue:run`
- `npm run codex:queue:stop`
- `npm run codex:queue:blockers`
- `node scripts/codex-project-runner/queue.mjs requeue <task-id>`
- `scripts/codex-project-runner/start-queue-tmux.sh`

The status file is `~/grantdeskhq-codex-run-status.txt`; run data is `~/grantdesk-project-runs/codex-queue/`.
\n\n## Cost-aware model routing\n\nThe queue controller now classifies every task before invocation using `ops/agent-model-policy.json`. It records selected tier, model, reasoning, rationale, route step, runtime, retry/escalation metadata, and aggregate model/reasoning counters. Use `npm run agent:status` to view current routing state, `npm run agent:routing:dry-run` for a no-credit classification audit, and see `reports/codex-cost-aware-model-router.md` for the operator guide.\n