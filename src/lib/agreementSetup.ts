import type { CompilationPreflightResult, ReviewState } from "../types/prototype";

export function agreementSetup(preflight: CompilationPreflightResult) {
  const organizationName = usableProfileValue(preflight.grantProfile.granteeName);
  const funder = usableProfileValue(preflight.grantProfile.funderName);
  const grant = usableProfileValue(preflight.grantProfile.grantName);
  const verifiedPeriods = preflight.reportingPeriods
    .filter((period) => period.status === "verified" && isUsableDate(period.startDate) && isUsableDate(period.endDate))
    .sort((left, right) => Date.parse(left.startDate) - Date.parse(right.startDate));
  const period = verifiedPeriods.find((item) => item.id === preflight.referencePeriodId) || verifiedPeriods[0];
  return {
    organizationName,
    grantName: [funder, grant].filter(Boolean).join(" — "),
    awardAmount: usableProfileValue(preflight.grantProfile.awardAmount),
    period
  };
}

export function remainingSetupConflicts(preflight: CompilationPreflightResult) {
  const setup = agreementSetup(preflight);
  return preflight.setupConflicts.filter((conflict) => conflict.type === "reporting_period" && !setup.period);
}

function usableProfileValue(field: { value: string; status: ReviewState } | undefined) {
  if (!field || field.status === "blocked" || field.status === "not_evaluated") return "";
  const value = field.value.trim();
  return /^information required|unknown|not (found|stated)/i.test(value) ? "" : value;
}

function isUsableDate(value: string) {
  return Boolean(value && !/^information required|unknown|not (found|stated)/i.test(value) && Number.isFinite(Date.parse(value)));
}
