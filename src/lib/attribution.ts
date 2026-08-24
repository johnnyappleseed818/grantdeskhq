export const CAMPAIGN_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "lead_id", "campaign_id", "partner_referral_id", "referrer", "landing_page"] as const;
export type CampaignField = typeof CAMPAIGN_FIELDS[number];
export type CampaignAttribution = Partial<Record<CampaignField, string>>;

const storageKey = "grantdeskhq:campaign-attribution:v1";

export function currentCampaignAttribution(): CampaignAttribution {
  if (typeof window === "undefined") return {};
  const captured = cleanAttribution(new URLSearchParams(window.location.search));
  if (!captured.landing_page) captured.landing_page = `${window.location.pathname}${window.location.search}`.slice(0, 180);
  if (!captured.referrer && document.referrer) {
    try { captured.referrer = new URL(document.referrer).origin.slice(0, 180); } catch { /* Ignore malformed referrers. */ }
  }
  const stored = readStoredAttribution();
  const merged = { ...stored, ...captured };
  if (Object.keys(merged).length) window.localStorage.setItem(storageKey, JSON.stringify(merged));
  return merged;
}

function cleanAttribution(params: URLSearchParams): CampaignAttribution {
  return Object.fromEntries(CAMPAIGN_FIELDS.flatMap((field) => {
    const value = [...String(params.get(field) || "")].filter((character) => { const code = character.charCodeAt(0); return code >= 32 && code !== 127; }).join("").trim().slice(0, 180);
    return value ? [[field, value]] : [];
  })) as CampaignAttribution;
}

function readStoredAttribution(): CampaignAttribution {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(CAMPAIGN_FIELDS.flatMap((field) => {
      const item = (value as Record<string, unknown>)[field];
      return typeof item === "string" && item.trim() ? [[field, item.trim().slice(0, 180)]] : [];
    })) as CampaignAttribution;
  } catch { return {}; }
}
