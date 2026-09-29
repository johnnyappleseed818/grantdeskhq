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
ollama_bin="${GDH_OLLAMA_BIN:-$state_dir/ollama-runtime/bin/ollama}"
ollama_models="${OLLAMA_MODELS:-$state_dir/ollama-models}"
ollama_host="${OLLAMA_HOST:-127.0.0.1:11434}"

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

require_local_binary() {
  if [[ ! -x "$ollama_bin" ]]; then
    checkpoint "LOCAL_PROVIDER_UNAVAILABLE"
    printf '%s\n' "LOCAL_PROVIDER_UNAVAILABLE: install Ollama at $ollama_bin or set GDH_OLLAMA_BIN, then pull $local_model."
    exit 69
  fi
}

require_local_model() {
  if ! OLLAMA_HOST="$ollama_host" OLLAMA_MODELS="$ollama_models" "$ollama_bin" list 2>/dev/null | awk 'NR > 1 { print $1 }' | grep -Fxq "$local_model"; then
    checkpoint "LOCAL_MODEL_UNAVAILABLE"
    printf '%s\n' "LOCAL_MODEL_UNAVAILABLE: pull $local_model before running local mode."
    exit 69
  fi
}

ensure_local_server() {
  if curl -fsS "http://$ollama_host/api/tags" >/dev/null 2>&1; then return 0; fi
  mkdir -p "$state_dir" "$ollama_models"
  OLLAMA_HOST="$ollama_host" OLLAMA_MODELS="$ollama_models" nohup "$ollama_bin" serve >"$state_dir/ollama-local.log" 2>&1 &
  local pid=$!
  for _ in $(seq 1 20); do
    if curl -fsS "http://$ollama_host/api/tags" >/dev/null 2>&1; then
      printf '%s\n' "$pid" >"$state_dir/ollama-local.pid"
      return 0
    fi
    sleep 1
  done
  checkpoint "LOCAL_PROVIDER_START_FAILED"
  printf '%s\n' "LOCAL_PROVIDER_START_FAILED: see $state_dir/ollama-local.log"
  exit 69
}

run_local() {
  require_local_binary
  ensure_local_server
  require_local_model
  checkpoint "LOCAL_STARTED"
  exec env OLLAMA_HOST="$ollama_host" OLLAMA_MODELS="$ollama_models" flock -n "$lock_file" codex exec --oss --local-provider ollama -m "$local_model" --sandbox workspace-write "$@"
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
