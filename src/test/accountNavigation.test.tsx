import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteLayout } from "../components/SiteLayout";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  token: vi.fn(async () => "test-token")
}));

vi.mock("../lib/api", () => ({ apiRequest: (...args: unknown[]) => mocks.apiRequest(...args) }));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({ user: { uid: "customer-1", email: "finance@example.org" }, token: mocks.token })
}));

describe("authenticated account navigation", () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
    mocks.apiRequest.mockResolvedValue({ allowed: false });
  });

  it("exposes Account, My workspace, and Contact & Feedback without exposing operator-only navigation", async () => {
    render(<MemoryRouter><Routes><Route element={<SiteLayout />}><Route index element={<div>Customer workspace shell</div>} /></Route></Routes></MemoryRouter>);

    const header = screen.getByRole("banner");
    expect(await within(header).findByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
    expect(within(header).getByRole("link", { name: "My workspace" })).toHaveAttribute("href", "/workspace");
    expect(screen.getByRole("contentinfo").querySelector('a[href="/contact"]')).toHaveTextContent("Contact & Feedback");
    expect(screen.queryByRole("link", { name: "GTM Command Center" })).not.toBeInTheDocument();
  });
});
