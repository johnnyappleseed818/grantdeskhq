import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { prototypeFixture } from "../data/prototypeFixture";
import { CompilerResults } from "../pages/CompilePage";

const actions = {
  setActiveTab: vi.fn(),
  onResolve: vi.fn(),
  onDownload: vi.fn(),
  onEditSetup: vi.fn(),
  onAddSources: vi.fn()
};

describe("report review trust states", () => {
  it("does not offer a review override for an objective setup conflict", () => {
    const result = {
      ...prototypeFixture,
      setupConflicts: [{
        id: "setup-grant-identity",
        type: "grant_identity" as const,
        title: "Grant details do not match",
        detail: "The uploaded award identifies a different grant.",
        enteredValue: "Youth Access Initiative",
        sourceValue: "Youth Workforce Advancement Initiative",
        source: prototypeFixture.grantProfile.grantName.source,
        status: "action_required" as const
      }]
    };
    render(<CompilerResults result={result} activeTab="review" {...actions} />);
    const conflict = screen.getByRole("heading", { name: "Grant details do not match" }).closest("article");
    expect(conflict).not.toBeNull();
    expect(within(conflict!).getByRole("button", { name: "Fix report setup" })).toBeInTheDocument();
    expect(within(conflict!).queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
  });

  it("shows missing accounting data as not evaluated with an add-information action", () => {
    const result = {
      ...prototypeFixture,
      inputStatus: prototypeFixture.inputStatus.map((item) => item.role === "ledgerExport" ? { ...item, available: false } : item),
      qualityChecks: [...prototypeFixture.qualityChecks, {
        id: "deterministic-ledger",
        label: "Ledger reconciliation",
        detail: "Not evaluated — no accounting export has been added yet.",
        required: true,
        status: "not_evaluated" as const
      }]
    };
    render(<CompilerResults result={result} activeTab="review" {...actions} />);
    const ledgerCheck = screen.getByRole("heading", { name: "Ledger reconciliation" }).closest("article");
    expect(ledgerCheck).not.toBeNull();
    expect(within(ledgerCheck!).getByText("Not evaluated")).toBeInTheDocument();
    expect(within(ledgerCheck!).getByRole("button", { name: "Add information" })).toBeInTheDocument();
    expect(within(ledgerCheck!).queryByRole("button", { name: /confirm|reviewed/i })).not.toBeInTheDocument();
  });
});
