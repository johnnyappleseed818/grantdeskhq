export const CANONICAL_ANALYSIS_VERSION = "2026-08-13-canonical-analysis-v31";
export const CANONICALIZATION_SCHEMA_VERSION = "grantdesk-canonical-state-v1";
export const REPORT_PROMPT_VERSION = "grant-report-compiler-2026-08-13-v1";
export const SOURCE_PARSER_VERSION = "grantdesk-source-parser-2026-08-13-v1";
export const RELIABILITY_EVALUATION_VERSION = "grantdesk-reliability-v1";

export function applicationRevision() {
  return process.env.GIT_COMMIT?.trim()
    || process.env.GITHUB_SHA?.trim()
    || process.env.COMMIT_SHA?.trim()
    || "unknown";
}

export function deploymentRevision() {
  return process.env.K_REVISION?.trim()
    || process.env.DEPLOYMENT_REVISION?.trim()
    || "local";
}

export function applicationEnvironment() {
  return process.env.GRANTDESK_ENVIRONMENT?.trim()
    || process.env.NODE_ENV?.trim()
    || "development";
}
