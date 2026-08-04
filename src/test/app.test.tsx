import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../App";

function renderRoute(route: string) {
  return render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
}

describe("important routes", () => {
  it.each([
    ["/", /Build grant reports faster.*less manual work/i],
    ["/demo", /Six-Month Progress Report/i],
    ["/sample-report", /See the complete review package/i],
    ["/privacy", /A careful start with client data/i],
    ["/pricing", /Choose the reporting capacity your team needs/i],
    ["/assessment", /See where AI can reduce reporting work before you subscribe/i]
  ])("renders %s", (route, heading) => {
    renderRoute(route);
    expect(screen.getAllByRole("heading", { name: heading }).length).toBeGreaterThan(0);
  });

  it("navigates from the landing page into the interactive demo", async () => {
    const user = userEvent.setup();
    renderRoute("/");
    await user.click(screen.getByRole("link", { name: /See GrantDeskHQ in action/i }));
    expect(await screen.findByText("Agency workspace")).toBeInTheDocument();
    expect(screen.getByText("Northstar Nonprofit Finance")).toBeInTheDocument();
  });

  it("explains AI benefits in clear customer language", () => {
    renderRoute("/");
    expect(screen.getByRole("heading", { name: /Automate tedious manual work\. Keep every decision in your hands\./i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Prepare your documentation automatically" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Catch errors before they create rework" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reduce manual overhead" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reduce reporting errors" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Free up team resources" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Give your team time back for work that matters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View previous priority" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View next priority" })).toBeInTheDocument();
    expect(screen.getByText(/no customer endorsement is implied/i)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/nonprofit finance teams/i);
    expect(document.body.textContent).not.toMatch(/outsourced finance teams/i);
    expect(document.body.textContent).not.toMatch(/Catch more before review|production AI service|deterministic synthetic data/i);
  });

  it("opens and closes mobile navigation with both click and Escape", async () => {
    const user = userEvent.setup();
    renderRoute("/");
    const toggle = screen.getByRole("button", { name: "Open navigation" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("provides a labelled contact form without exposing a personal address", () => {
    renderRoute("/assessment");
    expect(screen.getByRole("heading", { name: "Discuss the workflow assessment" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toBeInTheDocument();
    expect(screen.getByLabelText("Organization")).toBeInTheDocument();
    expect(screen.getByLabelText("Current grant-reporting process")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Discuss the assessment/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/eli@|Eli Katz/i);
  });

  it("shows the exact subscription pricing and capacity", () => {
    renderRoute("/pricing");
    for (const plan of ["Essentials", "Growth", "Portfolio"]) {
      expect(screen.getByText(plan)).toBeInTheDocument();
    }
    for (const amount of ["$149", "$299", "$499", "or $1,490/year", "or $2,990/year", "or $4,990/year"]) {
      expect(screen.getByText(amount)).toBeInTheDocument();
    }
    expect(screen.getByText("Up to 5 active grants")).toBeInTheDocument();
    expect(screen.getByText("Up to 15 active grants")).toBeInTheDocument();
    expect(screen.getByText("Up to 40 active grants")).toBeInTheDocument();
    expect(screen.getAllByText("Unlimited archived grants")).toHaveLength(3);
    expect(screen.getByText("$75/month")).toBeInTheDocument();
    expect(screen.getByText("$25")).toBeInTheDocument();
  });
});

describe("demo controls and accessibility", () => {
  it("provides accessible labels for mapping controls and evidence actions", async () => {
    const user = userEvent.setup();
    renderRoute("/demo");
    await user.click(screen.getByRole("button", { name: "Financial Mapping" }));
    expect(screen.getByLabelText("Change category for PAY-001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open evidence for PAY-001" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve mapping for PAY-001" })).toBeInTheDocument();
  });

  it("keeps generation disabled, then enables it after all three local resolutions", async () => {
    const user = userEvent.setup();
    renderRoute("/demo");
    await user.click(screen.getByRole("button", { name: /^Quality Review/ }));
    const generate = screen.getByRole("button", { name: "Generate Review Package" });
    expect(generate).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Map and approve UNM-001" }));
    await user.click(screen.getByRole("button", { name: "Mark synthetic receipt received" }));
    await user.click(screen.getByRole("button", { name: "Mark demo certification signed" }));
    expect(generate).toBeEnabled();
    await user.click(generate);
    expect(await screen.findByText("Your synthetic review package is ready")).toBeInTheDocument();
  });

  it("contains no empty buttons across all demo screens", async () => {
    const user = userEvent.setup();
    renderRoute("/demo");
    for (const name of ["Agency Overview", "Source Package", "Requirements", "Financial Mapping", "Missing Inputs", "Narrative Draft", "Quality Review", "Export Package"]) {
      await user.click(screen.getByRole("button", { name: name === "Quality Review" ? /^Quality Review/ : name }));
      for (const button of screen.getAllByRole("button")) {
        expect((button.getAttribute("aria-label") ?? button.textContent ?? "").trim()).not.toBe("");
      }
    }
  });
});

describe("generated sample assets", () => {
  const assetNames = [
    "Synthetic_Grant_Agreement.pdf",
    "Approved_Grant_Budget.xlsx",
    "General_Ledger_Export.csv",
    "Synthetic_Funder_Report_Draft.pdf",
    "Transaction_Evidence_Schedule.xlsx"
  ];

  it("creates every linked sample asset with non-empty content", () => {
    for (const fileName of assetNames) {
      const filePath = path.resolve("public", "samples", fileName);
      expect(fs.existsSync(filePath), fileName).toBe(true);
      expect(fs.statSync(filePath).size, fileName).toBeGreaterThan(100);
    }
  });

  it("renders working sample-asset links", () => {
    renderRoute("/sample-report");
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    for (const fileName of assetNames) {
      expect(hrefs).toContain(`/samples/${fileName}`);
    }
  });
});
