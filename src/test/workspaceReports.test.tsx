import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspacePage } from "../pages/WorkspacePage";

const apiRequest = vi.fn();
const token = vi.fn(async () => "test-token");

vi.mock("../lib/api", () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "user-1", email: "finance@example.org", displayName: "Finance Team" },
    loading: false,
    token,
    signOut: vi.fn()
  })
}));

describe("saved report workspace", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    token.mockClear();
    apiRequest.mockImplementation((path: string) => path === "/api/reports"
      ? Promise.resolve({
        reports: [{
          id: "report_1234567890abcdef1234567890abcdef",
          organizationName: "BridgeWorks Family Services",
          grantName: "Northstar Community Fund",
          reportingPeriod: "Feb 1 – Jul 31, 2027",
          status: "review_required",
          evidenceCoveragePercent: 93,
          unresolvedItems: 6,
          sourceCount: 3,
          createdAt: "2026-08-10T00:00:00.000Z",
          updatedAt: "2026-08-10T00:00:00.000Z"
        }]
      })
      : Promise.resolve({ billing: null }));
  });

  it("gives every saved report an explicit continuation link", async () => {
    render(<MemoryRouter><WorkspacePage /></MemoryRouter>);

    const link = await screen.findByRole("link", { name: /Continue review/i });
    expect(link).toHaveAttribute("href", "/compile?report=report_1234567890abcdef1234567890abcdef");
    expect(screen.getByText("BridgeWorks Family Services · Feb 1 – Jul 31, 2027")).toBeInTheDocument();
  });
});
