#!/usr/bin/env bash
set -euo pipefail
project="grantdeskhq-proto-ek-2026"
region="us-central1"
origin="${GRANTDESK_GTM_ORIGIN:-}"
service_account="${GTM_SCHEDULER_SERVICE_ACCOUNT:-grantdeskhq-gtm-scheduler@${project}.iam.gserviceaccount.com}"
if [[ -z "${origin}" ]]; then echo "GRANTDESK_GTM_ORIGIN is required." >&2; exit 2; fi
if [[ "${GRANTDESK_GTM_INFRA_CONFIRM:-}" != "${project}" ]]; then echo "Set GRANTDESK_GTM_INFRA_CONFIRM=${project}." >&2; exit 2; fi
upsert() {
 local job="$1" schedule="$2" uri="$3" body="$4"
 local common=(--project="${project}" --location="${region}" --schedule="${schedule}" --time-zone="Etc/UTC" --uri="${origin%/}${uri}" --http-method=POST --headers="Content-Type=application/json,x-grantdesk-gtm-scheduler=1" --message-body="${body}" --oidc-service-account-email="${service_account}" --oidc-token-audience="${origin%/}" --attempt-deadline=10m --max-retry-attempts=1 --min-backoff=60s --max-backoff=300s)
 if gcloud scheduler jobs describe "${job}" --project="${project}" --location="${region}" >/dev/null 2>&1; then gcloud scheduler jobs update http "${job}" "${common[@]}"; else gcloud scheduler jobs create http "${job}" "${common[@]}"; fi
}
upsert "grantdeskhq-hunter-enrichment" "${HUNTER_ENRICHMENT_SCHEDULE:-15 6 * * 1-5}" "/api/gtm/contact-enrichment/batch" '{"segment":"partner","limit":20}'
upsert "grantdeskhq-search-console-sync" "${SEARCH_CONSOLE_SYNC_SCHEDULE:-30 5 * * *}" "/api/gtm/search-console/reconcile" '{}'
gcloud scheduler jobs describe "grantdeskhq-hunter-enrichment" --project="${project}" --location="${region}"
gcloud scheduler jobs describe "grantdeskhq-search-console-sync" --project="${project}" --location="${region}"
