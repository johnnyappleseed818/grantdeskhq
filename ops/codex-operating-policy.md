# GrantDeskHQ queued-task policy

Routine safe work is pre-authorized: source inspection, code and documentation changes, public research, tests, feature branches, commits, pushes, and zero-traffic QA candidates.

Human approval is required for production traffic changes, destructive production actions, purchases or material paid enrichment, real outbound, live Stripe charges, broad IAM grants, legal commitments, and unavoidable OAuth/2FA.

Never force-push, expose secrets, fabricate data, guess business email addresses, mark uncertain emails VERIFIED, or send real outreach. GTM is SHADOW and human approval is required. If blocked, record the blocker and continue with the next unblocked task.


## Cost-aware Codex routing and hard run budget

The controller must classify each task using `ops/agent-model-policy.json` before invoking Codex. It passes only the selected task, this policy, and the task-scoped artifacts to the worker. Use GPT-5.6 Luna at low or medium reasoning for routine work; GPT-5.6 Terra at medium for normal implementation, high for genuinely complex debugging, and xhigh for high-risk work. GPT-5.6 Sol xhigh is disabled by default and requires an explicit human override.

Do not escalate for IAM, credentials, unavailable services, missing dependencies, malformed fixtures, rate limits, or other environmental/configuration failures. Preserve the current `approval_policy = on-request`; the controller must not bypass approvals. Do not use external coding-model providers.

`ops/agent-budget-policy.json` is the single hard execution-budget source. A normal focused run stops before dispatch when it reaches its worker, attempt, runtime, model, full-regression, or finalization-reserve limit. It executes only explicitly queued tasks and narrowly necessary implementation/validation subtasks; it must not manufacture bonus work because time remains. An extended run requires `CODEX_QUEUE_ALLOW_BUDGET_OVERRIDE=1` plus explicit bound values. Sol additionally requires `CODEX_QUEUE_ALLOW_SOL=1`.

Prefer targeted files and tests, compact checkpoints, concise stable-prefix prompts, and incremental verification. Do not pass full master prompts or worker transcripts to later workers. Run broad regressions only at appropriate integration gates.
