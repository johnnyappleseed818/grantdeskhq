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
    ["/", /Save time on grant reporting with AI-powered preparation/i],
    ["/demo", /Six-Month Progress Report/i],
    ["/sample-report", /See the complete review package/i],
    ["/privacy", /Know how your files are handled/i],
    ["/pricing", /Start affordably\. Prove the value on a real report/i],
    ["/assessment", /Analyze your first report for free/i],
    ["/compile", /Automate grant-report preparation, save time, and reduce errors/i],
    ["/readiness", /Upload the agreement\. Get a source-linked reporting plan\./i],
    ["/login", /Turn scattered grant files into an evidence-backed funder report/i]
  ])("renders %s", (route, heading) => {
    renderRoute(route);
    expect(screen.getAllByRole("heading", { name: heading }).length).toBeGreaterThan(0);
  });

  it("offers managed account access without collecting source files on the sign-in screen", () => {
    renderRoute("/login");
    expect(screen.getByRole("tab", { name: "Create account" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Work email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "8");
    expect(screen.queryByLabelText(/file/i)).not.toBeInTheDocument();
  });

  it("navigates from the landing page into the AI report compiler", async () => {
    const user = userEvent.setup();
    renderRoute("/");
    await user.click(screen.getByRole("link", { name: /Prepare a report with AI/i }));
    expect(await screen.findByRole("heading", { name: /Automate grant-report preparation, save time, and reduce errors/i })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Getting started steps" })).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: /Tell us about your workflow/i })).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/docs\.google\.com\/forms\/d\/e\//)
    );
    expect(screen.getByRole("heading", { name: "Request founding access" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toBeInTheDocument();
    expect(screen.getByLabelText("Organization")).toBeInTheDocument();
    expect(screen.getByLabelText("Current grant-reporting process")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Request founding access/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/eli@|Eli Katz/i);
  });

  it("shows the exact subscription pricing and capacity", () => {
    renderRoute("/pricing");
    for (const plan of ["Founding Nonprofit", "Founding Agency"]) {
      expect(screen.getByText(plan)).toBeInTheDocument();
    }
    for (const amount of ["$49", "$149", "or $490/year", "or $1,490/year"]) {
      expect(screen.getByText(amount)).toBeInTheDocument();
    }
    expect(screen.getByText("Up to 10 active grants")).toBeInTheDocument();
    expect(screen.getByText("Up to 30 active grants")).toBeInTheDocument();
    expect(screen.getAllByText("Unlimited archived grants")).toHaveLength(2);
    expect(screen.getByText("$15")).toBeInTheDocument();
  });

  it("walks users through the report compiler one step at a time", async () => {
    const user = userEvent.setup();
    renderRoute("/compile");
    expect(screen.getByText("Tell us which report you’re preparing")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    expect(screen.getByText("Add the files your team already uses")).toBeVisible();
    expect(screen.getByLabelText(/Award agreement/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Approved grant budget/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/General ledger export/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
  });

  it("opens a bulk document chooser and assigns clearly named source files", async () => {
    const user = userEvent.setup();
    renderRoute("/compile");
    const packageInput = screen.getByLabelText("Upload documentation for evaluation");
    await user.upload(packageInput, [
      new File(["award"], "Award_Agreement.pdf", { type: "application/pdf" }),
      new File(["budget"], "Approved_Grant_Budget.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      new File(["ledger"], "General_Ledger_Export.csv", { type: "text/csv" }),
      new File(["template"], "Funder_Report_Template.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      new File(["update"], "Program_Update.txt", { type: "text/plain" })
    ]);
    expect(screen.getByText("Add the files your team already uses")).toBeVisible();
    expect(screen.getByText(/Award_Agreement\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/Approved_Grant_Budget\.xlsx/)).toBeInTheDocument();
    expect(screen.getByText(/General_Ledger_Export\.csv/)).toBeInTheDocument();
    expect(screen.getByText(/Funder_Report_Template\.docx/)).toBeInTheDocument();
    expect(screen.getByText(/Program_Update\.txt/)).toBeInTheDocument();
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
