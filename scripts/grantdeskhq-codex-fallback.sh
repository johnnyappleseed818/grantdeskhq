#!/usr/bin/env bash
set -euo pipefail

# Local-first Codex launcher for this repository. It deliberately retains the
# configured Codex workspace sandbox and approval policy. No hosted API key,
# model credential, or automatic paid fallback is configured here.

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:-local}"
if [[ $# -gt 0 ]]; then shift; fi
local_model="${GDH_LOCAL_MODEL:-qwen2.5-coder:1.5b}"
state_dir="$root/.codex"
state_file="$state_dir/local-fallback-state.json"
lock_file="/tmp/grantdeskhq-codex-fallback.lock"

checkpoint() {
  mkdir -p "$state_dir"
  node -e '
    const fs = require("fs");
    const [file, mode, result] = process.argv.slice(1);
    const { execFileSync } = require("child_process");
    const value = (command) => { try { return execFileSync(command[0], command.slice(1), { encoding: "utf8" }).trim(); } catch { return "UNKNOWN"; } };
    fs.writeFileSync(file, JSON.stringify({ updatedAt: new Date().toISOString(), mode, result, repository: process.cwd(), branch: value(["git", "branch", "--show-current"]), revision: value(["git", "rev-parse", "HEAD"]) }, null, 2) + "\n");
  ' "$state_file" "$mode" "$1"
}

require_local_provider() {
  if ! command -v ollama >/dev/null 2>&1; then
    checkpoint "LOCAL_PROVIDER_UNAVAILABLE"
    printf '%s\n' "LOCAL_PROVIDER_UNAVAILABLE: install Ollama and pull $local_model on a persistent host with sufficient memory."
    exit 69
  fi
  if ! ollama list 2>/dev/null | awk 'NR > 1 { print $1 }' | grep -Fxq "$local_model"; then
    checkpoint "LOCAL_MODEL_UNAVAILABLE"
    printf '%s\n' "LOCAL_MODEL_UNAVAILABLE: pull $local_model before running local mode."
    exit 69
  fi
}

run_local() {
  require_local_provider
  checkpoint "LOCAL_STARTED"
  exec flock -n "$lock_file" codex exec --oss --local-provider ollama -m "$local_model" --sandbox workspace-write "$@"
}

run_cloud() {
  checkpoint "CLOUD_STARTED"
  exec flock -n "$lock_file" codex exec --sandbox workspace-write "$@"
}

run_auto() {
  local output status quota=false
  if [[ "${GDH_SYNTHETIC_CLOUD_QUOTA:-}" == "1" ]]; then
    quota=true
  else
    output="$(mktemp /tmp/grantdeskhq-codex-cloud.XXXXXX)"
    set +e
    flock -n "$lock_file" codex exec --sandbox workspace-write "$@" >"$output" 2>&1
    status=$?
    set -e
    if [[ $status -eq 0 ]]; then
      cat "$output"
      rm -f "$output"
      checkpoint "CLOUD_COMPLETED"
      return 0
    fi
    # Rate limits, auth/approval failures, and tool/test errors deliberately do
    # not switch models. Only a hosted quota/credit exhaustion may use local.
    if grep -Eiq 'quota[^[:alpha:]]*(exhaust|limit|exceed)|credit[^[:alpha:]]*(exhaust|balance|limit)|usage limit' "$output"; then quota=true; fi
    cat "$output"
    rm -f "$output"
    if [[ "$quota" != true ]]; then
      checkpoint "CLOUD_FAILED_NO_MODEL_SWITCH"
      return "$status"
    fi
  fi
  checkpoint "CLOUD_QUOTA_TO_LOCAL"
  run_local "$@"
}

case "$mode" in
  local) run_local "$@" ;;
  cloud) run_cloud "$@" ;;
  auto) run_auto "$@" ;;
  *)
    printf '%s\n' "Usage: $0 [local|cloud|auto] <prompt>"
    exit 64
    ;;
esac
