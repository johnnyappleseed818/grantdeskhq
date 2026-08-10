import type { GrantWorkflowObligation } from "../types/prototype";

export function normalizeWorkflowObligations(obligations: GrantWorkflowObligation[]) {
  return obligations.map((obligation) => {
    const text = `${obligation.title} ${obligation.detail} ${obligation.trigger}`.toLowerCase();
    if (isExtensionRequest(text)) return { ...obligation, applicability: "conditional" as const };
    return obligation;
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
