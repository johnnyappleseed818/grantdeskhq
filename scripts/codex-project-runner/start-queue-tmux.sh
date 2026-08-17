#!/usr/bin/env bash
set -Eeuo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
session="grantdesk-codex-queue"
tmux has-session -t "$session" 2>/dev/null && { printf "Queue session already exists: %s\n" "$session"; exit 75; }
tmux new-session -d -s "$session" "cd $(printf %q "$root") && npm run codex:queue:run"
printf "Started detached queue session: %s\n" "$session"
