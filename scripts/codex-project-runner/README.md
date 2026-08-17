# GrantDeskHQ autonomous project runner

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
