export type SocialActionStatus = "NEW" | "REVIEW" | "RESPONDED" | "SKIP" | "STALE";
export type SocialPlatform = "reddit" | "linkedin";

export interface SocialActionRecord {
  id: string;
  platform: SocialPlatform;
  normalizedUrl: string;
  status: SocialActionStatus;
  updatedAt: string | null;
}

export interface SocialQueueItem {
  id: string;
  platform: SocialPlatform;
  title: string;
  url: string;
  normalizedUrl: string;
  summary: string;
  suggestedResponse: string;
  observedAt: string | null;
  status: SocialActionStatus;
}

export function normalizeSocialUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key);
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch { return value.trim().replace(/\/$/, "").toLowerCase(); }
}

export function socialActionId(platform: SocialPlatform, url: string) {
  let hash = 5381;
  for (const character of `${platform}:${normalizeSocialUrl(url)}`) hash = (hash * 33) ^ character.charCodeAt(0);
  return `social_${platform}_${(hash >>> 0).toString(36)}`;
}

export function reconcileSocialQueue<T extends Omit<SocialQueueItem, "id" | "normalizedUrl" | "status"> & { initialStatus?: SocialActionStatus }>(items: T[], actions: SocialActionRecord[]): SocialQueueItem[] {
  const states = new Map(actions.map((action) => [`${action.platform}:${action.normalizedUrl}`, action.status]));
  const records = new Map<string, SocialQueueItem>();
  for (const item of items) {
    const normalizedUrl = normalizeSocialUrl(item.url);
    const status = states.get(`${item.platform}:${normalizedUrl}`) || item.initialStatus || "NEW";
    records.set(`${item.platform}:${normalizedUrl}`, { ...item, id: socialActionId(item.platform, item.url), normalizedUrl, status });
  }
  return [...records.values()];
}

export function isDefaultSocialAction(status: SocialActionStatus) { return status === "NEW" || status === "REVIEW"; }

export function socialActionUpdate(item: SocialQueueItem, status: SocialActionStatus, updatedAt: string | null): SocialActionRecord { return { id: item.id, platform: item.platform, normalizedUrl: item.normalizedUrl, status, updatedAt }; }

export function validateSocialActionRecord(value: unknown): SocialActionRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const platform = record.platform;
  const status = record.status;
  const normalizedUrl = String(record.normalizedUrl || "");
  const id = String(record.id || "");
  const updatedAt = record.updatedAt === null || record.updatedAt === undefined || record.updatedAt === "" ? null : String(record.updatedAt);
  if ((platform !== "reddit" && platform !== "linkedin") || !["NEW", "REVIEW", "RESPONDED", "SKIP", "STALE"].includes(String(status)) || !normalizedUrl || !/^social_(reddit|linkedin)_[a-z0-9]+$/.test(id)) return null;
  return { id, platform, normalizedUrl, status: status as SocialActionStatus, updatedAt };
}
