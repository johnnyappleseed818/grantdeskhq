import { MAX_EVIDENCE_FILE_BYTES, MAX_EVIDENCE_FILES, MAX_EVIDENCE_TOTAL_BYTES } from "./prototype";

export interface PendingEvidenceFile {
  id: string;
  file: File;
  uploadedAt: string;
}

export function mergePendingEvidenceFiles(current: PendingEvidenceFile[], selected: File[]) {
  const existing = new Set(current.map((item) => evidenceFileKey(item.file)));
  const additions = selected
    .filter((file) => !existing.has(evidenceFileKey(file)))
    .map((file) => ({ id: createEvidenceId(), file, uploadedAt: new Date().toISOString() }));
  const files = [...current, ...additions];
  if (files.length > MAX_EVIDENCE_FILES) return { files: current, error: `A report can contain up to ${MAX_EVIDENCE_FILES} supporting evidence files.` };
  if (files.some((item) => item.file.size > MAX_EVIDENCE_FILE_BYTES)) return { files: current, error: `Each supporting evidence file must be ${formatBytes(MAX_EVIDENCE_FILE_BYTES)} or less.` };
  if (files.reduce((sum, item) => sum + item.file.size, 0) > MAX_EVIDENCE_TOTAL_BYTES) return { files: current, error: `Supporting evidence files must total ${formatBytes(MAX_EVIDENCE_TOTAL_BYTES)} or less.` };
  return { files, error: "" };
}

export function createEvidenceId() {
  return `evidence_${crypto.randomUUID().replaceAll("-", "")}`;
}

function evidenceFileKey(file: File) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}
