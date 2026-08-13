import { describe, expect, it } from "vitest";
import { mergePendingEvidenceFiles } from "../lib/evidenceUploads";

describe("supporting evidence upload collection", () => {
  it("appends simultaneous and repeated additions without replacing earlier files", () => {
    const first = mergePendingEvidenceFiles([], [file("receipt.pdf", 100), file("kpi.xlsx", 200)]);
    const second = mergePendingEvidenceFiles(first.files, [file("approval.docx", 300)]);
    expect(first.error).toBe("");
    expect(second.error).toBe("");
    expect(second.files.map((item) => item.file.name)).toEqual(["receipt.pdf", "kpi.xlsx", "approval.docx"]);
    expect(new Set(second.files.map((item) => item.id)).size).toBe(3);
  });

  it("preserves the existing collection when the 50-file limit would be exceeded", () => {
    const fifty = mergePendingEvidenceFiles([], Array.from({ length: 50 }, (_, index) => file(`evidence-${index}.pdf`, 10)));
    const overflow = mergePendingEvidenceFiles(fifty.files, [file("too-many.pdf", 10)]);
    expect(fifty.files).toHaveLength(50);
    expect(overflow.files).toHaveLength(50);
    expect(overflow.error).toMatch(/up to 50/);
  });
});

function file(name: string, size: number) {
  return new File([new Uint8Array(size)], name, { type: name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf", lastModified: size });
}
