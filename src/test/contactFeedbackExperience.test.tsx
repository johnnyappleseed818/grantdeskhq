import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactFeedbackPage } from "../pages/ContactFeedbackPage";
import { GtmFeedbackPage } from "../pages/GtmFeedbackPage";

const mocks = vi.hoisted(() => ({
  auth: { user: null as { displayName?: string | null; email?: string | null } | null, loading: false, token: vi.fn(async () => "test-token") },
  apiRequest: vi.fn(),
  track: vi.fn()
}));

vi.mock("../lib/auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("../lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/api")>()), apiRequest: mocks.apiRequest }));
vi.mock("../lib/analytics", () => ({ trackAnalyticsEvent: mocks.track }));

describe("contact and feedback experience", () => {
  beforeEach(() => {
    mocks.auth.user = null;
    mocks.auth.loading = false;
    mocks.auth.token.mockClear();
    mocks.apiRequest.mockReset();
    mocks.track.mockReset();
  });

  it("submits the labelled public form only to the feedback API and shows the unconfigured notification boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ submitted: true, notificationStatus: "NOT_CONFIGURED" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryRouter initialEntries={["/contact"]}><ContactFeedbackPage /></MemoryRouter>);

    const form = screen.getByRole("button", { name: "Submit feedback" }).closest("form")!;
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Avery Grant" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "avery@example.org" } });
    fireEvent.change(screen.getByLabelText("What can we help with?"), { target: { value: "PRODUCT_FEEDBACK" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "The evidence review workflow is helpful." } });
    fireEvent.submit(form);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/feedback", expect.objectContaining({ method: "POST" })));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ sourcePage: "/contact", website: "" });
    expect(await screen.findByText(/notifications are not configured/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders persisted feedback in the authenticated GTM review surface", async () => {
    mocks.auth.user = { displayName: "GTM Admin", email: "admin@example.org" };
    mocks.apiRequest.mockResolvedValue({ feedback: [{
      id: "feedback_0123456789abcdef0123456789abcdef", createdAt: "2026-08-17T12:00:00.000Z", userId: "uid", name: "Avery Grant", email: "avery@example.org", organization: "Example Community Action", category: "PRODUCT_FEEDBACK", message: "The evidence review workflow is helpful.", sourcePage: "/contact", status: "NEW", adminNotes: "", linkedCustomerId: null, notificationStatus: "NOT_CONFIGURED"
    }] });
    render(<MemoryRouter><GtmFeedbackPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Contact and feedback review" })).toBeInTheDocument();
    expect(screen.getByText("Avery Grant · avery@example.org · Example Community Action")).toBeInTheDocument();
    expect(screen.getByText("NOT CONFIGURED")).toBeInTheDocument();
    expect(mocks.apiRequest).toHaveBeenCalledWith("/api/gtm/feedback", "test-token");
  });

  it("keeps the server persistence, admin authorization, and narrow mobile layout contracts in source", () => {
    const server = fs.readFileSync(path.resolve("server/cloudRun.ts"), "utf8");
    const persistence = fs.readFileSync(path.resolve("server/persistence.ts"), "utf8");
    const styles = fs.readFileSync(path.resolve("styles.css"), "utf8");
    expect(server).toContain('if (url.pathname === "/api/feedback") return await handleFeedback');
    expect(server).toContain("requireGtmAdmin(await requireUser(request))");
    expect(server).toContain('notificationStatus: "NOT_CONFIGURED"');
    expect(persistence).toContain("export async function saveFeedback");
    expect(persistence).toContain("feedback/records/submissions");
    expect(styles).toContain(".contact-feedback-shell");
    expect(styles).toContain("@media (max-width: 520px)");
  });
});
