#!/usr/bin/env bash
set -euo pipefail

project="grantdeskhq-proto-ek-2026"
region="us-central1"
job="grantdeskhq-daily-reliability-canary"
service_account_name="grantdeskhq-health-scheduler"
service_account="${service_account_name}@${project}.iam.gserviceaccount.com"
schedule="${GRANTDESK_RELIABILITY_SCHEDULE:-20 5 * * *}"
origin="${GRANTDESK_CANARY_ORIGIN:-}"
# Keep the OIDC audience aligned with HEALTH_SCHEDULER_AUDIENCE in the
# service.  The scheduler may target a tagged candidate URL, but the app
# intentionally verifies the stable service audience.
audience="${GRANTDESK_RELIABILITY_AUDIENCE:-https://grantdeskhq-prototype-me423s5k5a-uc.a.run.app}"

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
  --message-body='{"trigger":"daily"}'
  --oidc-service-account-email="${service_account}"
  --oidc-token-audience="${audience%/}"
  --attempt-deadline=30m
  --max-retry-attempts=1
  --min-backoff=60s
  --max-backoff=300s
)
headers="Content-Type=application/json,x-grantdesk-health-scheduler=1"

if gcloud scheduler jobs describe "${job}" --project="${project}" --location="${region}" >/dev/null 2>&1; then
  # `update http` accepts --update-headers, while `create http` accepts
  # --headers. Keeping these distinct makes repeated configuration durable.
  gcloud scheduler jobs update http "${job}" "${common[@]}" --update-headers="${headers}"
else
  gcloud scheduler jobs create http "${job}" "${common[@]}" --headers="${headers}"
fi

gcloud scheduler jobs describe "${job}" --project="${project}" --location="${region}"
