#!/usr/bin/env bash
set -euo pipefail

project="grantdeskhq-proto-ek-2026"
region="us-central1"
job="grantdeskhq-daily-reliability-canary"
service_account_name="grantdeskhq-health-scheduler"
service_account="${service_account_name}@${project}.iam.gserviceaccount.com"
schedule="${GRANTDESK_RELIABILITY_SCHEDULE:-20 5 * * *}"
origin="${GRANTDESK_CANARY_ORIGIN:-}"

if [[ -z "${origin}" ]]; then
  echo "GRANTDESK_CANARY_ORIGIN is required." >&2
  exit 2
fi
if [[ "${GRANTDESK_RELIABILITY_INFRA_CONFIRM:-}" != "grantdeskhq-proto-ek-2026" ]]; then
  echo "Set GRANTDESK_RELIABILITY_INFRA_CONFIRM=grantdeskhq-proto-ek-2026 to confirm this scoped infrastructure change." >&2
  exit 2
fi

if ! gcloud iam service-accounts describe "${service_account}" --project="${project}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${service_account_name}" \
    --project="${project}" \
    --display-name="GrantDeskHQ reliability canary scheduler"
fi

common=(
  --project="${project}"
  --location="${region}"
  --schedule="${schedule}"
  --time-zone="Etc/UTC"
  --uri="${origin%/}/api/internal/reliability/canary"
  --http-method=POST
  --headers="Content-Type=application/json,x-grantdesk-health-scheduler=1"
  --message-body='{"trigger":"daily"}'
  --oidc-service-account-email="${service_account}"
  --oidc-token-audience="${origin%/}"
  --attempt-deadline=30m
  --max-retry-attempts=1
  --min-backoff=60s
  --max-backoff=300s
)

if gcloud scheduler jobs describe "${job}" --project="${project}" --location="${region}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${job}" "${common[@]}"
else
  gcloud scheduler jobs create http "${job}" "${common[@]}"
fi

gcloud scheduler jobs describe "${job}" --project="${project}" --location="${region}"
