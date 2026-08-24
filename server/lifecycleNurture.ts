export type NurtureKind = "activation_reminder" | "input_help" | "report_upgrade" | "checkout_reminder" | "payment_failed";

export interface LifecycleNurtureCandidate {
  uid: string;
  email: string;
  event: string;
  occurredAt: string;
  promotionalNurtureAllowed: boolean;
}

export interface LifecycleNurtureTask {
  id: string;
  uid: string;
  email: string;
  kind: NurtureKind;
  eligibleAt: string;
  subject: string;
  body: string;
  classification: "promotional" | "service";
}

/** Pure, conservative policy. Delivery is a separate, explicitly enabled step. */
export function lifecycleNurtureTask(candidate: LifecycleNurtureCandidate, now = new Date()): LifecycleNurtureTask | null {
  if (!candidate.uid || !candidate.email || !candidate.occurredAt) return null;
  const occurred = Date.parse(candidate.occurredAt);
  if (!Number.isFinite(occurred)) return null;
  const schedule = (hours: number) => new Date(occurred + hours * 3_600_000).toISOString();
  const base = { uid: candidate.uid, email: candidate.email, eligibleAt: "", subject: "", body: "", classification: "promotional" as const };
  if (candidate.event === "account_created" && candidate.promotionalNurtureAllowed) return { ...base, id: `${candidate.uid}-activation`, kind: "activation_reminder", eligibleAt: schedule(24), subject: "Your first award is ready when you are", body: "Start with the award agreement. You can add the budget, ledger, program update, and supporting evidence when they are available. Try your first award free: https://grantdeskhq.com/assessment" };
  if ((candidate.event === "first_report_started" || candidate.event === "source_file_added") && candidate.promotionalNurtureAllowed) return { ...base, id: `${candidate.uid}-inputs`, kind: "input_help", eligibleAt: schedule(24), subject: "Pick up your GrantDeskHQ award when you are ready", body: "You do not need every file to keep moving. Return to your award, add what you have, and GrantDeskHQ will show the remaining gaps clearly." };
  if (candidate.event === "report_generated" && candidate.promotionalNurtureAllowed) return { ...base, id: `${candidate.uid}-upgrade`, kind: "report_upgrade", eligibleAt: schedule(2), subject: "Your first award is ready", body: "You have used your Free First Award. If GrantDeskHQ is useful for your next award, choose a self-service plan here: https://grantdeskhq.com/pricing" };
  if (candidate.event === "checkout_started" && candidate.promotionalNurtureAllowed) return { ...base, id: `${candidate.uid}-checkout`, kind: "checkout_reminder", eligibleAt: schedule(24), subject: "Finish setting up your GrantDeskHQ plan", body: "Your secure checkout was not completed. You can return to pricing whenever you are ready: https://grantdeskhq.com/pricing" };
  if (candidate.event === "payment_failed") return { ...base, id: `${candidate.uid}-payment`, kind: "payment_failed", eligibleAt: new Date(occurred).toISOString(), subject: "Action needed for your GrantDeskHQ billing", body: "We could not confirm your subscription payment. Update billing details in your account to keep your paid access active.", classification: "service" };
  return null;
}

export function dueForNurture(task: LifecycleNurtureTask, now = new Date()) { return Date.parse(task.eligibleAt) <= now.getTime(); }
