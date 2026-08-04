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
    ["/", /Spend less time building grant reports\. Catch more before review\./i],
    ["/demo", /Six-Month Progress Report/i],
    ["/sample-report", /See the complete review package/i],
    ["/privacy", /A careful start with client data/i],
    ["/pilot", /Founding Agency Pilot/i]
  ])("renders %s", (route, heading) => {
    renderRoute(route);
    expect(screen.getAllByRole("heading", { name: heading }).length).toBeGreaterThan(0);
  });

  it("navigates from the landing page into the interactive demo", async () => {
    const user = userEvent.setup();
    renderRoute("/");
    await user.click(screen.getByRole("link", { name: /See GrantDesk in action/i }));
    expect(await screen.findByText("Agency workspace")).toBeInTheDocument();
    expect(screen.getByText("Northstar Nonprofit Finance")).toBeInTheDocument();
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
    renderRoute("/pilot");
    expect(screen.getByRole("heading", { name: "Contact us" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toBeInTheDocument();
    expect(screen.getByLabelText("Firm name")).toBeInTheDocument();
    expect(screen.getByLabelText("Current grant-reporting process")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send enquiry/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/eli@|Eli Katz/i);
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
    await user.click(screen.getByRole("button", { name: "Mark prototype certification signed" }));
    expect(generate).toBeEnabled();
    await user.click(generate);
    expect(await screen.findByText("Synthetic review package generated")).toBeInTheDocument();
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
