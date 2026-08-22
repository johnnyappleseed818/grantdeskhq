#!/usr/bin/env bash
set -euo pipefail

project="grantdeskhq-proto-ek-2026"
region="us-central1"
service="grantdeskhq-prototype"
origin="${GRANTDESK_CANDIDATE_ORIGIN:-}"
service_account="${HEALTH_SCHEDULER_SERVICE_ACCOUNT:-grantdeskhq-health-scheduler@${project}.iam.gserviceaccount.com}"
scheduler_audience="${HEALTH_SCHEDULER_AUDIENCE:-${origin%/}}"
seo_reconciliation_job="grantdeskhq-seo-reconciliation"

trigger_post_deploy_sitemap_submission() {
  # Reuse the established OIDC scheduler job. The job verifies the public
  # sitemap, submits it to Search Console, and persists the resulting state.
  # This intentionally does not alter its normal twice-weekly schedule.
  gcloud scheduler jobs describe "${seo_reconciliation_job}" --project="${project}" --location="${region}" >/dev/null
  gcloud scheduler jobs run "${seo_reconciliation_job}" --project="${project}" --location="${region}"
  echo "Queued ${seo_reconciliation_job} after successful production promotion."
}

rollback_if_allowed() {
  local reason="$1"
  if [[ "${GRANTDESK_CANDIDATE_TRAFFIC_PERCENT:-0}" == "0" ]]; then
    echo "Candidate failed before receiving traffic; it will not be promoted. Failed revision is preserved for diagnosis." >&2
    return
  fi
  if [[ "${GRANTDESK_ALLOW_AUTOMATIC_ROLLBACK:-0}" != "1" || -z "${GRANTDESK_LAST_KNOWN_GOOD_REVISION:-}" ]]; then
    echo "Candidate has traffic and failed (${reason}); controlled rollback was not authorized or has no exact last-known-good revision." >&2
    return
  fi
  gcloud run revisions describe "${GRANTDESK_LAST_KNOWN_GOOD_REVISION}" --project="${project}" --region="${region}" >/dev/null
  gcloud run services update-traffic "${service}" \
    --project="${project}" \
    --region="${region}" \
    --to-revisions="${GRANTDESK_LAST_KNOWN_GOOD_REVISION}=100"
  echo "Traffic restored to validated revision ${GRANTDESK_LAST_KNOWN_GOOD_REVISION}; failed revision was not deleted. Reason: ${reason}" >&2
  local lkg_origin="${GRANTDESK_LAST_KNOWN_GOOD_ORIGIN:-https://grantdeskhq-prototype-me423s5k5a-uc.a.run.app}"
  local lkg_token
  lkg_token="$(gcloud auth print-identity-token --project="${project}" --audiences="${scheduler_audience%/}" --include-email --impersonate-service-account="${service_account}")"
  if ! GRANTDESK_HEALTH_ID_TOKEN="${lkg_token}" node scripts/run-reliability-canary.mjs "${lkg_origin}" manual; then
    echo "Post-rollback canary did not verify healthy state; operator escalation is required." >&2
  fi
}

if [[ -z "${origin}" ]]; then
  echo "GRANTDESK_CANDIDATE_ORIGIN must be a zero-traffic or low-traffic candidate URL." >&2
  exit 2
fi

if ! curl -fsS "${origin%/}/api/health" >/dev/null; then
  rollback_if_allowed "basic health check failed"
  exit 1
fi
if ! npm run test:grantdesk-regression -- "${origin%/}"; then
  rollback_if_allowed "complete regression release gate failed"
  exit 1
fi
token="$(gcloud auth print-identity-token --project="${project}" --audiences="${scheduler_audience%/}" --include-email --impersonate-service-account="${service_account}")"
if ! GRANTDESK_HEALTH_ID_TOKEN="${token}" GRANTDESK_BROWSER_API_CONSISTENCY=pass node scripts/run-reliability-canary.mjs "${origin}" post_deploy; then
  rollback_if_allowed "synthetic Northstar canary failed"
  exit 1
fi

echo "Candidate reliability gates passed. This script does not promote traffic automatically."
if [[ "${GRANTDESK_PROMOTE_VERIFIED_CANDIDATE:-0}" == "1" ]]; then
  if [[ -z "${GRANTDESK_CANDIDATE_REVISION:-}" ]]; then
    echo "GRANTDESK_CANDIDATE_REVISION is required for controlled promotion." >&2
    exit 2
  fi
  gcloud run services update-traffic "${service}" \
    --project="${project}" \
    --region="${region}" \
    --to-revisions="${GRANTDESK_CANDIDATE_REVISION}=100"
  trigger_post_deploy_sitemap_submission
fi
