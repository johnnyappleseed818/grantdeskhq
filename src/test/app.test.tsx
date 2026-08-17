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
    ["/", /Finish grant reports faster/i],
    ["/demo", /Six-Month Progress Report/i],
    ["/sample-report", /See the complete review package/i],
    ["/privacy", /Understand where your data goes and who can access it/i],
    ["/pricing", /Choose the GrantDeskHQ workflow that fits your reporting needs\./i],
    ["/assessment", /Let our AI-powered solution prepare your first report draft at no cost/i],
    ["/compile", /Bring what you have\. We’ll help with the rest/i],
    ["/readiness", /Find every reporting requirement before the deadline gets close/i],
    ["/resources", /Practical resources for post-award grant reporting/i],
    ["/login", /Spend less time building grant reports from scattered files/i]
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
    await user.click(screen.getAllByRole("link", { name: /^Prepare a report$/i })[0]);
    expect(await screen.findByRole("heading", { name: /Bring what you have\. We’ll help with the rest/i })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Getting started steps" })).toBeInTheDocument();
  });

  it("explains AI benefits in clear customer language", () => {
    renderRoute("/");
    expect(screen.getByRole("heading", { name: /Let our AI-powered solution prepare the report\. Keep your team focused on the decisions\./i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Start with the awarded grant" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bring finance and program updates together" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Get a funder-specific first draft" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review the exceptions and finish confidently" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Straight answers about your data/i })).toBeInTheDocument();
    expect(screen.getByText(/No\. You can begin with the documents your team already uses and an approved CSV export/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reduce manual overhead" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reduce reporting errors" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Free up team resources" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Give your team time back for work that matters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View previous priority" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View next priority" })).toBeInTheDocument();
    expect(screen.getByText(/no customer endorsement is implied/i)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/nonprofit finance teams/i);
    expect(document.body.textContent).toMatch(/built for what happens after the award/i);
    expect(document.body.textContent).toMatch(/GrantDeskHQ turns your grant agreement, accounting data, and program updates into a funder-specific report draft with the sources attached/i);
    expect(document.body.textContent).not.toMatch(/outsourced finance teams/i);
    expect(document.body.textContent).not.toMatch(/Catch more before review|production AI service|deterministic synthetic data/i);
  });

  it("adds Resources to public navigation without exposing internal destinations", () => {
    renderRoute("/");
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    const resources = navigation.querySelector<HTMLAnchorElement>("a[href=\"/resources\"]");
    expect(Array.from(navigation.querySelectorAll("a.nav-link")).slice(0, 5).map((link) => link.textContent)).toEqual(["How It Works", "Sample Output", "Resources", "Security & FAQ", "Pricing"]);
    expect(resources).toHaveTextContent("Resources");
    expect(navigation.querySelector("a.button[href=\"/assessment\"]")).toHaveTextContent("Free First Award");
    expect(screen.queryByRole("link", { name: "GTM Command Center" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Reliability" })).not.toBeInTheDocument();
  });

  it("publishes the Resources hub in static crawl controls", () => {
    expect(fs.readFileSync(path.resolve("public/sitemap.xml"), "utf8")).toContain("https://grantdeskhq.com/resources");
    expect(fs.readFileSync(path.resolve("scripts/create-spa-routes.js"), "utf8")).toContain("\"resources\"");
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

  it("opens Resources from mobile navigation", async () => {
    const user = userEvent.setup();
    renderRoute("/");
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    await user.click(navigation.querySelector<HTMLAnchorElement>("a[href=\"/resources\"]")!);
    expect(await screen.findByRole("heading", { name: /Practical resources for post-award grant reporting/i })).toBeInTheDocument();
  });

  it("provides a labelled contact form without exposing a personal address", () => {
    renderRoute("/assessment");
    expect(screen.getByRole("link", { name: /Tell us about your workflow/i })).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/docs\.google\.com\/forms\/d\/e\//)
    );
    expect(screen.getByRole("heading", { name: "Start your Free First Award" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toBeInTheDocument();
    expect(screen.getByLabelText("Organization")).toBeInTheDocument();
    expect(screen.getByLabelText("Current grant-reporting process")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open a Free First Award email draft/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/eli@|Eli Katz/i);
  });

  it("shows the approved self-service monthly pricing and capacity", () => {
    renderRoute("/pricing");
    for (const plan of ["Starter Nonprofit", "Growth", "Fractional CFO Agency"]) {
      expect(screen.getAllByText(plan).length).toBeGreaterThanOrEqual(2);
    }
    for (const amount of ["$99", "$199", "$499"]) expect(screen.getByText(amount)).toBeInTheDocument();
    expect(screen.getByText("Up to 5 active grants")).toBeInTheDocument();
    expect(screen.getByText("Up to 20 active grants")).toBeInTheDocument();
    expect(screen.getByText("Up to 50 active grants")).toBeInTheDocument();
    expect(screen.getAllByText("Unlimited archived grants")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Annual/i })).not.toBeInTheDocument();
  });

  it("keeps the normal list prices visible until the server confirms founding eligibility", () => {
    renderRoute("/pricing");
    for (const amount of ["$49", "$299"]) expect(screen.queryByText(amount)).not.toBeInTheDocument();
    expect(screen.queryByText(/50% off your first year/i)).not.toBeInTheDocument();
  });

  it("walks users through the report compiler one step at a time", async () => {
    const user = userEvent.setup();
    renderRoute("/compile");
    expect(screen.getByText(/AI-powered report preparation/i)).toBeInTheDocument();
    expect(screen.getByText(/You control which files GrantDeskHQ analyzes/i)).toBeInTheDocument();
    expect(screen.getByText("How GrantDeskHQ saves you time")).toBeInTheDocument();
    expect(screen.getByText(/You don’t need every document upfront/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/private beta/i);
    expect(document.body.textContent).not.toMatch(/How AI reduces the manual work/i);
    expect(screen.getByText("Choose the report")).toBeVisible();
    await user.type(screen.getByLabelText("Organization"), "BridgeWorks Family Services");
    await user.type(screen.getByLabelText("Grant or award"), "Northstar Community Fund");
    await user.type(screen.getByLabelText("Reporting period"), "Feb 1 – Jul 31, 2027");
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    expect(screen.getByText("Add the files your team already has")).toBeVisible();
    expect(screen.getByLabelText(/Award agreement or Notice of Award/i)).toBeRequired();
    expect(screen.getByLabelText(/Approved grant budget/i)).not.toBeRequired();
    expect(screen.getByLabelText(/General ledger export/i)).not.toBeRequired();
    expect(screen.getByLabelText(/Funder report template/i)).not.toBeRequired();
    expect(screen.getByLabelText(/Program update/i)).not.toBeRequired();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
  });

  it("continues with an award document while allowing every other source later", async () => {
    const user = userEvent.setup();
    renderRoute("/compile");
    await user.type(screen.getByLabelText("Organization"), "BridgeWorks Family Services");
    await user.type(screen.getByLabelText("Grant or award"), "Northstar Community Fund");
    await user.type(screen.getByLabelText("Reporting period"), "Feb 1 – Jul 31, 2027");
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.upload(
      screen.getByLabelText(/Award agreement or Notice of Award/i),
      new File(["award"], "Notice_of_Award.pdf", { type: "application/pdf" })
    );
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    expect(screen.getByText("Review the information used for your draft")).toBeVisible();
    expect(screen.getByText("1 of 1 required to start")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
    expect(screen.getByText("Add the files your team already has")).toBeVisible();
    expect(screen.getByText(/Award_Agreement\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/Approved_Grant_Budget\.xlsx/)).toBeInTheDocument();
    expect(screen.getByText(/General_Ledger_Export\.csv/)).toBeInTheDocument();
    expect(screen.getByText(/Funder_Report_Template\.docx/)).toBeInTheDocument();
    expect(screen.getByText(/Program_Update\.txt/)).toBeInTheDocument();
  });

  it("removes the old source slot when moving a misclassified ledger file", async () => {
    const user = userEvent.setup();
    renderRoute("/compile");
    await user.type(screen.getByLabelText("Organization"), "BridgeWorks Family Services");
    await user.type(screen.getByLabelText("Grant or award"), "Northstar Community Fund");
    await user.type(screen.getByLabelText("Reporting period"), "Feb 1 – Jul 31, 2027");
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.upload(
      screen.getByLabelText(/Award agreement or Notice of Award/i),
      new File(["award"], "Award_Agreement.pdf", { type: "application/pdf" })
    );
    await user.upload(
      screen.getByLabelText(/Approved grant budget/i),
      new File(["ledger"], "General_Ledger_Export.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    );
    await user.upload(
      screen.getByLabelText(/Program update/i),
      new File(["update"], "Program_Update.txt", { type: "text/plain" })
    );
    await user.click(await screen.findByRole("button", { name: "Move to Accounting data" }));
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    expect(screen.getByText("3 files · 17 B")).toBeVisible();
  });
});

describe("product messaging safeguards", () => {
  it("keeps the product promise human, post-award focused, and professionally reviewed", () => {
    const files = [
      "src/pages/LandingPage.tsx",
      "src/pages/LoginPage.tsx",
      "src/pages/CompilePage.tsx",
      "src/pages/ReadinessPage.tsx",
      "src/pages/PricingPage.tsx",
      "src/pages/PilotPage.tsx",
      "src/components/SiteLayout.tsx",
      "src/content/positioning.ts"
    ];
    const copy = files.map((file) => fs.readFileSync(path.resolve(file), "utf8")).join("\n");

    expect(copy).toMatch(/post-award|after the award/i);
    expect(copy).toMatch(/accounting data/i);
    expect(copy).toMatch(/program updates/i);
    expect(copy).toMatch(/professional review/i);
    expect(copy).not.toMatch(/submission[- ]ready|fully automated|automated reconciliation|100% accurate|guaranteed accuracy|dozens of hours|complete reports in five minutes|AI compliance/i);
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
