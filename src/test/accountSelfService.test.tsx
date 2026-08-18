import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPage } from "../pages/AccountPage";

const mocks = vi.hoisted(() => ({
  token: vi.fn(async () => "test-token"),
  updateDisplayName: vi.fn(async () => undefined),
  apiRequest: vi.fn(),
  auth: { user: { uid: "user-1", displayName: "Finance Team", email: "finance@example.org" } as { uid: string; displayName: string; email: string } | null, loading: false }
}));

vi.mock("../lib/auth", () => ({ useAuth: () => ({ ...mocks.auth, token: mocks.token, updateDisplayName: mocks.updateDisplayName }) }));
vi.mock("../lib/api", () => ({ apiRequest: (...args: unknown[]) => mocks.apiRequest(...args) }));

describe("customer account and billing self-service", () => {
  beforeEach(() => {
    mocks.auth.user = { uid: "user-1", displayName: "Finance Team", email: "finance@example.org" };
    mocks.auth.loading = false;
    mocks.token.mockClear();
    mocks.updateDisplayName.mockClear();
    mocks.apiRequest.mockReset();
    mocks.apiRequest.mockResolvedValue({ billing: {
      planKey: "growth", subscriptionStatus: "active", foundingPricingApplied: true,
      currentPeriodEnd: "2026-09-17T00:00:00.000Z", cancelAtPeriodEnd: false, entitlementActive: true
    } });
  });

  it("shows a protected account profile, the current subscription, current price, renewal date, and secure portal CTA", async () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Manage your account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Login email")).toHaveValue("finance@example.org");
    expect(screen.getByLabelText("Login email")).toHaveAttribute("readonly");
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("$99/month")).toBeInTheDocument();
    expect(screen.getByText("September 17, 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Contact & feedback/i })).toHaveAttribute("href", "/contact");
    expect(mocks.apiRequest).toHaveBeenCalledWith("/api/billing/status", "test-token");
  });

  it("updates only a display name and leaves the login email in the separate secure auth flow", async () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    await screen.findByText("Subscription self-service");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Avery Finance" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(mocks.updateDisplayName).toHaveBeenCalledWith("Avery Finance"));
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    expect(screen.getByText(/cannot be changed here/i)).toBeInTheDocument();
  });

  it("requires sign-in before the account surface renders", () => {
    mocks.auth.user = null;
    render(<MemoryRouter initialEntries={["/account"]}><AccountPage /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: "Manage your account" })).not.toBeInTheDocument();
  });
});
