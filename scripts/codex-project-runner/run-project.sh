#!/usr/bin/env bash
# Run one bounded Codex project with durable, machine-readable evidence.
set -Eeuo pipefail

usage() {
  printf "Usage: %s [--tmux] <project-slug> <prompt-file> [worktree]\n" "$0" >&2
  exit 64
}

inside=0
if [[ $# -gt 0 && "$1" == "--inside" ]]; then
  inside=1
  shift
fi

use_tmux=0
if [[ $# -gt 0 && "$1" == "--tmux" ]]; then
  use_tmux=1
  shift
fi

[[ $# -ge 2 && $# -le 3 ]] || usage
project="$1"
prompt_file="$2"
worktree="$PWD"
if [[ $# -eq 3 ]]; then
  worktree="$3"
fi

[[ "$project" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { printf "Invalid project slug\n" >&2; exit 64; }
[[ -f "$prompt_file" ]] || { printf "Prompt file missing\n" >&2; exit 64; }
rtk git -C "$worktree" rev-parse --is-inside-work-tree >/dev/null

tmux_env="$(printenv TMUX 2>/dev/null || true)"
if [[ "$use_tmux" == "1" && -z "$tmux_env" && "$inside" == "0" ]]; then
  session="grantdesk-project-$project"
  rtk tmux has-session -t "$session" 2>/dev/null && { printf "Project tmux session already exists: %s\n" "$session" >&2; exit 75; }
  runner="$(rtk realpath "$0")"
  command="$(printf "%q " "$runner" --inside "$project" "$prompt_file" "$worktree")"
  rtk tmux new-session -d -s "$session" "cd $(printf "%q" "$worktree") && $command"
  printf "Started tmux session %s\n" "$session"
  exit 0
fi

run_base="$(printenv GRANTDESK_PROJECT_RUNS_DIR 2>/dev/null || true)"
[[ -n "$run_base" ]] || run_base="$HOME/grantdesk-project-runs"
project_base="$run_base/$project"
rtk mkdir -p "$project_base"
exec 9>"$project_base/.runner.lock"
rtk flock -n 9 || { printf "Another %s runner is active\n" "$project" >&2; exit 75; }

timestamp="$(rtk date -u +%Y%m%dT%H%M%SZ)"
run_dir="$project_base/$timestamp"
rtk mkdir -p "$run_dir"
rtk cp "$prompt_file" "$run_dir/project-prompt.txt"

start_time="$(rtk date -u +%FT%TZ)"
start_commit="$(rtk git -C "$worktree" rev-parse HEAD)"
branch="$(rtk git -C "$worktree" branch --show-current)"
script_dir="$(cd "$(dirname "$0")" && rtk pwd)"
schema="$script_dir/project-result.schema.json"
result="$run_dir/project-result.json"
report="$run_dir/final-report.txt"

valid_result() {
  rtk jq -e '
    type == "object"
    and ([.project, .started_at, .finished_at, .git_branch, .starting_commit, .ending_commit] | all(.[]; type == "string" and length > 0))
    and ([.tests_run, .passed, .failed, .skipped, .qa_validation, .remaining_blockers] | all(.[]; type == "array"))
    and (.status == "PASS" or .status == "PARTIAL" or .status == "FAIL")
  ' "$1" >/dev/null 2>&1
}

write_failure_result() {
  local failure_reason="$1"
  local finished end_commit
  finished="$(rtk date -u +%FT%TZ)"
  end_commit="$(rtk git -C "$worktree" rev-parse HEAD 2>/dev/null || printf '%s' "$start_commit")"
  rtk jq -n --arg project "$project" --arg started_at "$start_time" --arg finished_at "$finished" --arg git_branch "$branch" --arg starting_commit "$start_commit" --arg ending_commit "$end_commit" --arg reason "$failure_reason" '
    {project:$project,started_at:$started_at,finished_at:$finished_at,git_branch:$git_branch,starting_commit:$starting_commit,ending_commit:$ending_commit,tests_run:[],passed:[],failed:[$reason],skipped:[],qa_validation:[],remaining_blockers:[$reason],status:"FAIL"}
  ' > "$result.tmp"
  rtk mv "$result.tmp" "$result"
}

finalize_interrupted_run() {
  local code=$?
  trap - EXIT
  set +e
  if [[ "$code" -ne 0 && -n "${result:-}" && -d "${run_dir:-}" ]]; then
    local status
    status="$(rtk jq -r '.status // "INVALID"' "$result" 2>/dev/null || printf 'INVALID')"
    if [[ "$status" == "RUNNING" || "$status" == "PASS" || "$status" == "INVALID" ]]; then
      write_failure_result "Runner stopped before a verified PASS (exit code $code). Preserve and inspect the attempt logs."
    fi
    [[ -f "$report" ]] || printf "Runner stopped before a final report; see attempt logs.\n" > "$report"
    rtk ln -sfn "$run_dir" "$project_base/latest"
  fi
  exit "$code"
}

rtk jq -n --arg project "$project" --arg started_at "$start_time" --arg git_branch "$branch" --arg starting_commit "$start_commit" '
  {project:$project,started_at:$started_at,git_branch:$git_branch,starting_commit:$starting_commit,status:"RUNNING"}
' > "$result"
trap finalize_interrupted_run EXIT
trap 'exit 130' INT HUP
trap 'exit 143' TERM

agent_prompt="$run_dir/agent-prompt.txt"
{
  rtk cat "$prompt_file"
  printf "\n\nAutonomous runner requirements:\n"
  printf "%s\n" "- Work only in the supplied Git worktree and follow AGENTS.md."
  printf "%s\n" "- Diagnose and safely repair failures; do not weaken tests."
  printf "%s\n" "- Before finishing, write a concise final report to $report."
  printf "%s\n" "- Before finishing, write $result using this exact JSON Schema: $schema."
  printf "%s\n" "- Status PASS is forbidden if critical blockers remain."
} > "$agent_prompt"

exit_code=1
for attempt in 1 2; do
  attempt_log="$run_dir/codex-attempt-$attempt.jsonl"
  final_message="$run_dir/codex-attempt-$attempt-final.txt"
  set +e
  (
    cd "$worktree"
    rtk codex exec --sandbox workspace-write --approve-for-me --json       --output-schema "$schema" --output-last-message "$final_message"       "$(rtk cat "$agent_prompt")"
  ) > "$attempt_log" 2>&1
  exit_code=$?
  set -e
  [[ "$exit_code" == "0" ]] && break
  printf "Attempt %s exited %s; one bounded retry will inspect the preserved log.\n" "$attempt" "$exit_code" >> "$run_dir/runner.log"
  printf "\nPrior attempt exited nonzero. Inspect its log at %s, repair only safe in-scope issues, then complete the project.\n" "$attempt_log" >> "$agent_prompt"
done

if ! valid_result "$result"; then
  finished="$(rtk date -u +%FT%TZ)"
  end_commit="$(rtk git -C "$worktree" rev-parse HEAD)"
  rtk jq -n --arg project "$project" --arg started_at "$start_time" --arg finished_at "$finished" --arg git_branch "$branch" --arg starting_commit "$start_commit" --arg ending_commit "$end_commit" --argjson exit_code "$exit_code" '
    {project:$project,started_at:$started_at,finished_at:$finished_at,git_branch:$git_branch,starting_commit:$starting_commit,ending_commit:$ending_commit,tests_run:[],passed:[],failed:[("codex runner exited with code " + ($exit_code|tostring))],skipped:[],qa_validation:[],remaining_blockers:["Codex did not produce a valid completion record"],status:"FAIL"}
  ' > "$result"
fi

valid_result "$result"
rtk ln -sfn "$run_dir" "$project_base/latest"
[[ -f "$report" ]] || printf "Codex completed without a final report; see attempt logs.\n" > "$report"
[[ "$(rtk jq -r .status "$result")" == "PASS" && "$exit_code" == "0" ]]

