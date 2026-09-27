import { describe, expect, it } from "vitest";
import { outboundCircuitTelemetry } from "../../server/persistence.ts";

describe("scheduler-visible outbound circuit telemetry", () => {
  it("preserves incident correlation while excluding free-text detail", () => {
    const telemetry = outboundCircuitTelemetry({
      tripped: true,
      reason: "AMBIGUOUS_PROVIDER_OUTCOME",
      detail: "Recipient-specific provider response must not leave the runtime.",
      trippedAt: "2026-09-27T09:00:00.000Z",
      incidentId: "incident-1",
      version: 4,
      generation: 3,
      resetEventId: "",
      resetReason: "",
      resolvedIncidentId: "",
      resolutionAuditId: ""
    });
    expect(telemetry).toEqual({
      tripped: true,
      reason: "AMBIGUOUS_PROVIDER_OUTCOME",
      trippedAt: "2026-09-27T09:00:00.000Z",
      incidentId: "incident-1",
      version: 4,
      generation: 3,
      resetEventId: "",
      resolvedIncidentId: "",
      resolutionAuditId: ""
    });
    expect(JSON.stringify(telemetry)).not.toContain("Recipient-specific");
  });
});
