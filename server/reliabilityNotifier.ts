import type { ReliabilityCanaryResult } from "../src/types/reliability.ts";

export interface ReliabilityNotification {
  level: "critical" | "warning";
  event: "grantdesk_reliability_alert";
  environment: string;
  deploymentRevision: string;
  runId: string;
  status: ReliabilityCanaryResult["status"];
  failingAssertionIds: string[];
  dashboardPath: string;
}

export interface ReliabilityNotifier {
  send(notification: ReliabilityNotification): Promise<void>;
}

export function reliabilityNotification(result: ReliabilityCanaryResult): ReliabilityNotification | null {
  if (result.status === "healthy") return null;
  return {
    level: result.status === "degraded" ? "warning" : "critical",
    event: "grantdesk_reliability_alert",
    environment: result.environment,
    deploymentRevision: result.deploymentRevision,
    runId: result.runId,
    status: result.status,
    failingAssertionIds: result.failingAssertionIds,
    dashboardPath: "/internal/reliability"
  };
}

export function configuredReliabilityNotifier(fetcher: typeof fetch = fetch): ReliabilityNotifier {
  return {
    async send(notification) {
      console.error(JSON.stringify(notification));
      const webhook = process.env.RELIABILITY_ALERT_WEBHOOK_URL?.trim();
      if (!webhook) return;
      const response = await fetcher(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notification),
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error(`Reliability alert delivery failed (${response.status}).`);
    }
  };
}

export async function notifyReliabilityResult(result: ReliabilityCanaryResult, notifier = configuredReliabilityNotifier()) {
  const notification = reliabilityNotification(result);
  if (notification) await notifier.send(notification);
}
