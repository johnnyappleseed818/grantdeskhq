import type { GrantWorkflowObligation } from "../types/prototype";

export function normalizeWorkflowObligations(obligations: GrantWorkflowObligation[]) {
  const normalized = obligations.flatMap(splitEmergencyAssistanceRule).map((obligation) => {
    const text = `${obligation.title} ${obligation.detail} ${obligation.trigger}`.toLowerCase();
    const applicability = isExtensionRequest(text) ? "conditional" as const : obligation.applicability;
    const status = obligation.status === "review" && sourceExplicitlySupportsIndirectCap(obligation) ? "verified" as const : obligation.status;
    return { ...obligation, applicability, status };
  });
  const seen = new Set<string>();
  return normalized.filter((obligation) => {
    const key = semanticObligationKey(obligation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function futureWorkflowStatus(obligation: GrantWorkflowObligation) {
  const text = `${obligation.title} ${obligation.detail} ${obligation.trigger}`.toLowerCase();
  if (/unspent|remaining balance|remaining funds/.test(text)) {
    return "Not yet applicable · only if an unspent balance remains";
  }
  return "Not yet applicable";
}

function isExtensionRequest(text: string) {
  return /no-cost\s+extension|extension request/.test(text) && /request|seek|sought|needed|if/.test(text);
}

function splitEmergencyAssistanceRule(obligation: GrantWorkflowObligation): GrantWorkflowObligation[] {
  const text = `${obligation.title} ${obligation.detail} ${obligation.trigger}`;
  const threshold = text.match(/(?:above|exceeds?)\s+(\$\s*[\d,]+(?:\.\d{2})?)/i)?.[1]?.replace(/\s+/g, "");
  const combinesDocumentationAndApproval = /emergency (?:client )?assistance/i.test(text)
    && /payment record/i.test(text)
    && /housing(?:-related)? purpose|housing-purpose/i.test(text)
    && /(?:written )?(?:program[- ]director )?approval/i.test(text)
    && Boolean(threshold);
  if (!combinesDocumentationAndApproval || /-documentation$|-approval$/.test(obligation.id)) return [obligation];
  return [
    {
      ...obligation,
      id: `${obligation.id}-documentation`,
      title: "Document all emergency client assistance",
      detail: "Retain a payment record and documentation of the housing-related purpose for every emergency client assistance transaction.",
      applicability: "conditional",
      trigger: "Applies whenever emergency client assistance is charged to the grant."
    },
    {
      ...obligation,
      id: `${obligation.id}-approval`,
      title: `Obtain Program Director approval for assistance above ${threshold}`,
      detail: `Written Program Director approval is additionally required when emergency client assistance exceeds ${threshold} per household.`,
      applicability: "conditional",
      trigger: `Applies only when an emergency client assistance payment exceeds ${threshold} per household.`
    }
  ];
}

function sourceExplicitlySupportsIndirectCap(obligation: GrantWorkflowObligation) {
  const proposed = `${obligation.title} ${obligation.detail}`;
  const source = obligation.source.excerpt;
  if (!/indirect/i.test(proposed) || !/indirect/i.test(source) || !/lesser of|may not exceed|limited to/i.test(source)) return false;
  const proposedPercent = proposed.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
  const sourcePercent = source.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
  const proposedAmount = proposed.match(/\$\s*([\d,]+(?:\.\d{2})?)/)?.[1]?.replaceAll(",", "");
  const sourceAmount = source.match(/\$\s*([\d,]+(?:\.\d{2})?)/)?.[1]?.replaceAll(",", "");
  return Boolean(proposedPercent && proposedAmount && proposedPercent === sourcePercent && proposedAmount === sourceAmount);
}

function semanticObligationKey(obligation: GrantWorkflowObligation) {
  const text = `${obligation.title} ${obligation.detail} ${obligation.trigger}`.toLowerCase();
  if (/emergency (?:client )?assistance/.test(text) && /payment record|housing(?:-related)? purpose|housing-purpose/.test(text) && !/approval/.test(text)) return "emergency-assistance-documentation";
  if (/emergency (?:client )?assistance/.test(text) && /approval/.test(text)) return `emergency-assistance-approval-${text.match(/\$\s*[\d,]+/)?.[0] || "threshold"}`;
  return obligation.id;
}
