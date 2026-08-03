import type { ReactNode } from "react";

type Tone = "success" | "review" | "blocked" | "neutral" | "info";

export function StatusBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}
