import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReliabilityDashboardPage } from "../pages/ReliabilityDashboardPage";
import type { ReliabilityDashboardSnapshot } from "../types/reliability";

const apiRequest = vi.fn();
const token = vi.fn(async () => "admin-token");

vi.mock("../lib/api", () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { uid: "admin", email: "admin@example.org" }, loading: false, token }) }));

describe("internal reliability dashboard", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation((pathname: string) => pathname.endsWith("/access")
      ? Promise.resolve({ allowed: true })
      : Promise.resolve({ reliability: snapshot() }));
  });

  it("shows release gates, drift, incidents, and last-known-good identity only to an authorized administrator", async () => {
    render(<MemoryRouter><ReliabilityDashboardPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "GrantDeskHQ self-health" })).toBeInTheDocument();
    expect(screen.getByText("HEALTHY")).toBeInTheDocument();
    expect(screen.getByText("Financial deterministic accuracy · release gate")).toBeInTheDocument();
    expect(screen.getAllByText("good-revision")).toHaveLength(2);
    expect(screen.getByText("No active or escalated incidents.")).toBeInTheDocument();
  });
});

function snapshot(): ReliabilityDashboardSnapshot {
  return {
    environment: "qa",
    applicationRevision: "good-commit",
    deploymentRevision: "good-revision",
    overallHealth: "healthy",
    latestCanary: {
      runId: "canary-one", fixtureId: "northstar", trigger: "daily", environment: "qa", status: "healthy",
      startedAt: "2026-08-13T00:00:00.000Z", completedAt: "2026-08-13T00:01:00.000Z", durationMs: 60_000,
      applicationRevision: "good-commit", deploymentRevision: "good-revision", reportIds: [], assertions: [],
      scorecard: { status: "healthy", financialDeterministicAccuracy: 100, kpiFactualAccuracy: 100, obligationCoverage: 100, evidenceClassificationAccuracy: 100, evidenceAttributionAccuracy: 100, approvalStateAccuracy: 100, unsupportedCriticalClaims: 0, sameReportDeterminism: "pass", crossReportDeterminism: "pass", browserApiConsistency: "pass", thresholds: { obligationCoverage: 95, evidenceClassificationAccuracy: 95, criticalFabrication: 0 } },
      sameReportHashes: ["a", "a", "a", "a", "a"], crossReportHashes: ["a", "a"], canonicalBusinessStateHash: "a", failingAssertionIds: [], cleanup: { reportsDeleted: 2, identityDeleted: true, errors: [] }, artifacts: []
    },
    lastSuccessfulCanary: "2026-08-13T00:01:00.000Z",
    recentDriftEvents: [], recentDeployments: ["good-revision"], activeIncidents: [], escalatedIncidents: [],
    lastKnownGood: { recordedAt: "2026-08-13T00:01:00.000Z", environment: "qa", applicationRevision: "good-commit", deploymentRevision: "good-revision", primaryModel: "gpt-5.6-terra", verifierModel: "gpt-5.6-luna", promptVersion: "prompt", canonicalizationSchemaVersion: "schema", evaluationVersion: "eval", canaryRunId: "canary-one", canonicalBusinessStateHash: "a" }
  };
}
