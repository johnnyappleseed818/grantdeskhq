# Queue supervisor hardening validation

The existing `scripts/codex-project-runner` queue controller remains the sole queue implementation.

- Active child invocations now write a durable status heartbeat every five minutes to the caller-selected status file.
- Status output records run start, elapsed time, task start, heartbeat, task counts, remaining work, latest commit, and next task.
- A child with no stdout/stderr activity for 20 minutes is terminated. The controller makes one scoped retry, then records a continuable `PARTIAL` outcome instead of hanging the queue.
- Safety gates remain unchanged: production, outbound, purchases, and force-pushes are disabled for child invocations.

Validation completed:

- `node --check scripts/codex-project-runner/queue.mjs`
- `node --test scripts/codex-project-runner/queue.test.mjs scripts/codex-project-runner/model-router.test.mjs` — 42 passing
- `git diff --check`

The queue tests deterministically exercise the five-minute heartbeat callback, the twenty-minute no-progress kill, and loop continuation after the single scoped retry.
