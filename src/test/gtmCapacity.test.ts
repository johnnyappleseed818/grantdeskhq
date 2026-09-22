import { describe, expect, it } from "vitest";
import { calculateInstantlyProviderCapacity, configuredCleanCampaignIds, configuredDailyInitialSendTarget, describeCampaignResponse, providerBackedCampaignLimit, resolveMappedCampaign } from "../../server/gtmCapacity.ts";

const direct = { id: "direct", status: 1, email_list: ["sender@example.org"], daily_max_leads: 300 };
const partner = { id: "partner", status: 1, email_list: ["sender@example.org"], daily_max_leads: 180 };
const readySender = { email: "sender@example.org", status: 1, warmup_status: 1, daily_limit: 300, setup_pending: false };

describe("provider-backed acquisition capacity", () => {
  it("uses each shared healthy mailbox once and lets campaign limits bound each segment", () => {
    const capacity = calculateInstantlyProviderCapacity({ accounts: { items: [readySender] }, directCampaign: direct, partnerCampaign: partner });
    expect(capacity).toMatchObject({ targetDailyCapacity: 300, providerDailyCapacity: 300, readyMailboxCount: 1, sharedMailboxCount: 1 });
    expect(capacity.segments.DIRECT).toMatchObject({ safeDailyCapacity: 300, senderReady: true });
    expect(capacity.segments.PARTNER).toMatchObject({ safeDailyCapacity: 180, senderReady: true });
  });

  it("uses the measured shared provider capacity as a campaign limit without making segment allocation a hard ceiling", () => {
    expect(providerBackedCampaignLimit({ providerDailyCapacity: 30 })).toBe(30);
    expect(providerBackedCampaignLimit({ providerDailyCapacity: 999 })).toBe(300);
    expect(providerBackedCampaignLimit({ providerDailyCapacity: 0 })).toBe(0);
  });

  it("fails closed for an unready sender or an absent provider cap", () => {
    const unhealthy = calculateInstantlyProviderCapacity({ accounts: { items: [{ ...readySender, warmup_status: 0 }] }, directCampaign: direct, partnerCampaign: partner });
    expect(unhealthy.providerDailyCapacity).toBe(0);
    expect(unhealthy.segments.DIRECT.safeDailyCapacity).toBe(0);
    const noCap = calculateInstantlyProviderCapacity({ accounts: { items: [readySender] }, directCampaign: { ...direct, daily_max_leads: null }, partnerCampaign: partner });
    expect(noCap.segments.DIRECT.safeDailyCapacity).toBe(0);
  });

  it("keeps a completed Clean campaign dispatchable while an explicit pause remains fail-closed", () => {
    const completed = calculateInstantlyProviderCapacity({
      accounts: { items: [readySender] },
      directCampaign: { ...direct, status: 3 },
      partnerCampaign: { ...partner, status: 3 }
    });
    expect(completed.segments.DIRECT).toMatchObject({ active: false, senderReady: true, safeDailyCapacity: 300 });
    expect(completed.segments.PARTNER).toMatchObject({ active: false, senderReady: true, safeDailyCapacity: 180 });
    const paused = calculateInstantlyProviderCapacity({
      accounts: { items: [readySender] },
      directCampaign: { ...direct, status: 2 },
      partnerCampaign: partner
    });
    expect(paused.segments.DIRECT).toMatchObject({ active: false, senderReady: true, safeDailyCapacity: 0 });
  });

  it("never permits an environment value to raise the 300/day commercial target", () => {
    expect(configuredDailyInitialSendTarget({ GTM_INITIAL_SEND_DAILY_TARGET: "999" })).toBe(300);
    expect(configuredDailyInitialSendTarget({ GTM_INITIAL_SEND_DAILY_TARGET: "250" })).toBe(250);
  });

  it("uses the full runtime mapping rather than the redacted health summary", () => {
    expect(configuredCleanCampaignIds({ directCampaignId: " direct-clean ", partnerCampaignId: " partner-clean " })).toEqual({ DIRECT: "direct-clean", PARTNER: "partner-clean" });
  });

  it("keeps the explicitly configured Clean campaign when a workspace list omits it", () => {
    expect(resolveMappedCampaign(direct, { items: [{ id: "legacy" }] }, "direct")).toBe(direct);
    expect(resolveMappedCampaign(null, { items: [partner] }, "partner")).toBe(partner);
    expect(resolveMappedCampaign(null, { items: [partner] }, "missing")).toBeNull();
  });

  it("normalizes documented campaign wrappers and emits only safe mapping telemetry", () => {
    const wrapped = { data: direct };
    expect(resolveMappedCampaign(wrapped, { items: [] }, "direct")).toBe(direct);
    expect(describeCampaignResponse(wrapped, "direct")).toEqual({ shape: "DATA_WRAPPER", returnedCampaignId: "direct", idMatchesExpected: true, valueKind: "OBJECT", topLevelKeys: ["data"] });
    expect(describeCampaignResponse({ id: "other" }, "direct")).toEqual({ shape: "ROOT", returnedCampaignId: "other", idMatchesExpected: false, valueKind: "OBJECT", topLevelKeys: ["id"] });
    expect(resolveMappedCampaign({ data: [direct] }, { items: [] }, "direct")).toBe(direct);
    expect(resolveMappedCampaign([direct], { items: [] }, "direct")).toBe(direct);
  });
});
