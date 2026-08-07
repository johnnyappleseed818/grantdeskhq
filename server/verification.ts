import type { SourceReference, ValidationFinding } from "../src/types/prototype.ts";

const deterministicSource = (id: string, reason: string): SourceReference => ({ sourceName: "Verification completeness check", locator: id, excerpt: reason });

export function enforceVerificationCompleteness(expectedIds: string[], findings: ValidationFinding[]) {
  const expected = new Set(expectedIds);
  const seen = new Set<string>();
  const accepted: ValidationFinding[] = [];

  const duplicateExpected = expectedIds.filter((id, index) => expectedIds.indexOf(id) !== index);
  for (const id of new Set(duplicateExpected)) accepted.push(blocked(id, `The compiler reused output ID ${id}; each material item must have a unique ID.`));

  for (const finding of findings) {
    if (!expected.has(finding.itemId)) {
      accepted.push(blocked(finding.itemId, `The verifier returned an unknown candidate ID: ${finding.itemId}.`));
      continue;
    }
    if (seen.has(finding.itemId)) {
      accepted.push(blocked(finding.itemId, `The verifier returned more than one finding for ${finding.itemId}.`));
      continue;
    }
    seen.add(finding.itemId);
    accepted.push(finding);
  }
  for (const id of expected) {
    if (!seen.has(id)) accepted.push(blocked(id, `The verifier did not return a finding for ${id}.`));
  }
  return accepted;
}

function blocked(itemId: string, reason: string): ValidationFinding {
  return { id: `verification-completeness-${itemId}-${reason.length}`, itemId, verdict: "blocked", reason, source: deterministicSource(itemId, reason) };
}
