# Cost-aware Codex model routing

## Actual local interface

- Codex CLI: `codex-cli 0.147.0`.
- Headless interface: `codex exec` accepts a task prompt directly or on stdin, supports `--model`, configuration overrides through `-c`, JSONL output, output schemas, saved final messages, and `exec resume`.
- The controller selects `--model` per task and sends `-c model_reasoning_effort=<level>`; it does not bypass the repository `on-request` approval policy.
- Models enabled for this environment and used by policy: `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol`. The CLI help does not enumerate provider availability, so policy is the authoritative approved set.
- Supported reasoning levels used by the installed configuration/current platform: `low`, `medium`, `high`, `xhigh`.

## Tiers

| Tier | Default | Escalation | Intended use |
| --- | --- | --- | --- |
| 0 routine | Luna / low | Luna / medium, then Terra / medium | reports, research processing, reconciliation, deterministic transforms, simple content |
| 1 standard | Terra / medium | Terra / high | normal repository coding, React/UI, APIs, GA4, tests |
| 2 complex | Terra / high | one Terra / xhigh attempt | persistent cross-service, concurrency, root-cause debugging |
| 3 high risk | Terra / xhigh | Sol / xhigh only with explicit per-task approval and recorded reason | production, Stripe, IAM, Secret Manager, credentials, security |

Environmental, permission, dependency, configuration, fixture, rate-limit, and availability failures are retried within their limit but never cause a reasoning escalation.

## Operator commands

- `npm run agent:status` — writes and prints queue/model status.
- `npm run agent:queue:run` — starts the bounded controller using the policy. Run it inside the existing VM tmux session for disconnection resilience.
- `npm run agent:queue:stop` — requests a graceful stop.
- `npm run agent:routing:dry-run` — classifies representative work only; it never invokes Codex.
- `npm run test:agent-routing` — validates routing decisions.
- `npm run test:codex-queue` — validates lock, queue, dry-run, and checkpoint behavior.

The controller persists selected tier/model/reasoning, selection rationale, route step, runtime, retry and escalation metadata on each task. It writes aggregate usage counters to its state directory and includes them in the status and overnight-report files. Exact dollar or credit use is intentionally not estimated because the CLI does not expose it.

## Guardrails

The policy at `ops/agent-model-policy.json` centrally defines model names, reasoning levels, runtime and retry caps, model escalation paths, and per-run expensive-invocation budgets. A task cannot route to Sol merely because it failed; it requires `exceptional_escalation_approved: true` and a specific `escalation_reason`. A budget guard blocks rather than silently escalating. The controller passes only one task plus this compact policy to each worker, then validates required artifacts/tests before granting PASS.

No production, outbound, purchase, paid-enrichment, force-push, or approval bypass is enabled by this tooling.
