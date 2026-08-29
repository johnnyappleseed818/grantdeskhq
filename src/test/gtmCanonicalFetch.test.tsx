import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalGtmModel } from "../lib/gtmCanonical";

const mocks = {
  apiRequest: vi.fn(),
  auth: { user: null as { uid: string; email: string } | null, loading: false, token: vi.fn() }
};

vi.mock("../lib/api", () => ({ apiRequest: (...args: unknown[]) => mocks.apiRequest(...args) }));
vi.mock("../lib/auth", () => ({ useAuth: () => mocks.auth }));

import { GtmDashboardContent, GtmDashboardPage } from "../pages/GtmDashboardPage";
import { loadCanonicalGtmModel } from "../lib/gtmDashboardApi";

const model: CanonicalGtmModel = {
  generatedAt: "2026-08-23T00:00:00.000Z",
  queues: {} as CanonicalGtmModel["queues"],
  records: [{
    id: "partner-ready", organizationId: "org:example.com", organization: "Verified Partner", organizationDomain: "example.com", segment: "PARTNER", state: "READY_TO_SEND", qualified: true,
    contact: "Partner Owner", title: "Founder", email: "owner@example.com", verificationStatus: "VERIFIED", suppressionStatus: "CLEAR", priorContact: false, blockers: [], nextAction: "Review", whyNow: "Fit", sourceUrl: "https://example.com", partnerType: "advisory", subject: "Hello", draft: "Draft", lastUpdated: "2026-08-23T00:00:00.000Z"
  }],
  metrics: { directReady: 0, partnerReady: 1, directNeedsVerification: 0, partnerNeedsVerification: 0, followUpsDue: 0, awaitingReply: 0, replies: 0, positiveReplies: 0, trials: 0, paid: 0, mrr: 0 }
};

function auxiliaryResponse(path: string) {
  if (path === "/api/gtm/opportunities") return { opportunities: [] };
  if (path === "/api/gtm/daily-signals") return { scan: null };
  if (path === "/api/gtm/award-signals") return { scan: null };
  if (path === "/api/gtm/control-plane-queue") return { reconciliation: null };
  if (path === "/api/gtm/overview") return { overview: {} };
  if (path === "/api/gtm/search-console") throw new Error("Search Console state could not be loaded (500).");
  if (path === "/api/gtm/outreach") return { outreach: [] };
  if (path === "/api/gtm/access") return { allowed: true };
  throw new Error("Unexpected route: " + path);
}

beforeEach(() => {
  mocks.auth.user = null;
  mocks.auth.loading = false;
  mocks.auth.token.mockReset().mockResolvedValue("token");
  mocks.apiRequest.mockReset().mockImplementation((path: string) => {
    if (path === "/api/gtm/canonical") return Promise.resolve({ model });
    return Promise.resolve(auxiliaryResponse(path));
  });
});

describe("canonical GTM loading", () => {
  it("loads canonical queues after delayed auth/token readiness even when Search Console fails", async () => {
    let releaseToken: (value: string) => void = () => {};
    const tokenPromise = new Promise<string>((resolve) => { releaseToken = resolve; });
    const delayedToken = vi.fn(() => tokenPromise);
    render(<MemoryRouter><GtmDashboardContent dailySignalToken={delayedToken} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("tab", { name: "Opportunities" }));
    expect(screen.getByText("Loading canonical GTM records")).toBeInTheDocument();
    releaseToken("delayed-token");
    await screen.findByRole("heading", { name: "Opportunities" });
    expect(screen.getByText("Verified Partner")).toBeInTheDocument();
  });

  it("uses a one-time refreshed Firebase token after a 401", async () => {
    const token = vi.fn().mockResolvedValueOnce("stale").mockResolvedValueOnce("fresh");
    const request = vi.fn()
      .mockRejectedValueOnce(new Error("GrantDeskHQ could not complete this request (status 401)."))
      .mockResolvedValueOnce({ model });
    await expect(loadCanonicalGtmModel(token, request)).resolves.toEqual(model);
    expect(token.mock.calls).toEqual([[false], [true]]);
    expect(request).toHaveBeenNthCalledWith(1, "/api/gtm/canonical", "stale", expect.any(Object));
    expect(request).toHaveBeenNthCalledWith(2, "/api/gtm/canonical", "fresh", expect.any(Object));
  });

  it("shows a bounded error and retries rather than leaving Leads on a spinner", async () => {
    mocks.apiRequest.mockImplementation((path: string) => {
      if (path === "/api/gtm/canonical") return mocks.apiRequest.mock.calls.filter(([calledPath]) => calledPath === "/api/gtm/canonical").length === 1
        ? Promise.reject(new Error("GrantDeskHQ could not complete this request (status 500)."))
        : Promise.resolve({ model });
      return Promise.resolve(auxiliaryResponse(path));
    });
    render(<MemoryRouter><GtmDashboardContent dailySignalToken={mocks.auth.token} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("tab", { name: "Opportunities" }));
    await screen.findByRole("heading", { name: "Unable to load GTM records." });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Opportunities" });
    expect(screen.queryByText("Loading canonical GTM records")).not.toBeInTheDocument();
  });

  it("renders Partner canonical READY records after the access check completes", async () => {
    mocks.auth.loading = true;
    const rendered = render(<MemoryRouter><GtmDashboardPage /></MemoryRouter>);
    expect(screen.getByText("Loading GTM command center…")).toBeInTheDocument();
    mocks.auth.loading = false;
    mocks.auth.user = { uid: "admin", email: "admin@example.org" };
    rendered.rerender(<MemoryRouter><GtmDashboardPage /></MemoryRouter>);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("/api/gtm/access", "token", expect.any(Object)));
    await screen.findByRole("heading", { name: "Demand, delivery, and blockers" });
    fireEvent.click(screen.getByRole("tab", { name: "Opportunities" }));
    expect(await screen.findByText("Verified Partner")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Verified Partner/ })).getByText("READY")).toBeInTheDocument();
  });

  it("rejects an invalid canonical response instead of rendering an ambiguous queue", async () => {
    await expect(loadCanonicalGtmModel(vi.fn().mockResolvedValue("token"), vi.fn().mockResolvedValue({ model: { records: [] } }))).rejects.toThrow("canonical GTM response is invalid");
  });
});
