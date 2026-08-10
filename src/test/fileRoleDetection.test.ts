import { describe, expect, it } from "vitest";
import { detectRoleFromHeaders, inspectFileRole, sourceRoleSuggestionFromName } from "../lib/fileRoleDetection";

describe("source file role detection", () => {
  it("recognizes the uploaded synthetic GL before report processing", async () => {
    const file = new File(["placeholder"], "GrantDeskHQ_Synthetic_GL_Interim_Report_1 (1).xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      lastModified: 1
    });
    await expect(inspectFileRole(file, "approvedBudget")).resolves.toMatchObject({
      assignedRole: "approvedBudget",
      suggestedRole: "ledgerExport",
      fileName: file.name
    });
  });

  it("uses transaction-level spreadsheet columns when the filename is ambiguous", () => {
    expect(detectRoleFromHeaders(["Transaction ID", "Date", "Vendor", "GL Account", "Memo", "Amount"])).toBe("ledgerExport");
  });

  it("does not confuse an approved budget workbook with a ledger", () => {
    expect(sourceRoleSuggestionFromName("Approved_Grant_Budget.xlsx")).toBe("approvedBudget");
    expect(detectRoleFromHeaders(["Budget Category", "Approved Budget", "Approved Amount", "Allocation"])).toBe("approvedBudget");
  });
});
