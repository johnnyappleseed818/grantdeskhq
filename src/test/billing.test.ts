import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BillingError,
  billingSnapshotFromEvent,
  changeSubscriptionPlan,
  createCheckoutSession,
  createCustomerPortalSession,
  foundingPricingActive,
  normalizeAttribution,
  validateBillingSelection,
  verifyStripeSignature,
  type StripeWebhookEvent
} from "../../server/billing";
import { shouldApplyBillingEvent } from "../../server/persistence";

const configuredEnvironment = [
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "FOUNDING_PRICING_END_AT",
  "STRIPE_PRICE_STARTER_MONTHLY", "STRIPE_PRICE_GROWTH_MONTHLY", "STRIPE_PRICE_AGENCY_MONTHLY",
  "STRIPE_FOUNDING_STARTER_COUPON_ID", "STRIPE_FOUNDING_GROWTH_COUPON_ID", "STRIPE_FOUNDING_AGENCY_COUPON_ID"
];

afterEach(() => { vi.restoreAllMocks(); for (const name of configuredEnvironment) delete process.env[name]; });

function subscriptionEvent(type: string, status: string, eventId = "evt_123"): StripeWebhookEvent {
  return {
    id: eventId,
    type,
    created: 1_800_000_000,
    data: { object: {
      id: "sub_123", customer: "cus_123", status, current_period_start: 1_800_000_000, current_period_end: 1_800_086_400,
      cancel_at_period_end: status === "canceled",
      items: { data: [{ price: { id: "price_growth_month" } }] },
      metadata: { grantdeskhq_uid: "firebase_user", grantdeskhq_plan_key: "growth", grantdeskhq_founding_pricing: "true", utm_source: "newsletter", campaign_id: "campaign_42" }
    } }
  };
}

describe("Stripe billing controls", () => {
  it("uses the approved cutoff only for new founding-price Checkouts", () => {
    const cutoff = "2027-02-14T23:59:59Z";
    expect(foundingPricingActive(cutoff, Date.parse("2027-02-14T23:59:58.999Z"))).toBe(true);
    expect(foundingPricingActive(cutoff, Date.parse(cutoff))).toBe(false);
  });

  it("accepts only a single internal plan key and rejects browser price or coupon overrides", () => {
    expect(validateBillingSelection({ plan: "starter" })).toEqual({ plan: "starter" });
    expect(() => validateBillingSelection({ plan: "enterprise" })).toThrow(BillingError);
    expect(() => validateBillingSelection({ plan: "starter", priceId: "price_attacker" })).toThrow(BillingError);
    expect(() => validateBillingSelection({ plan: "starter", couponId: "coupon_attacker" })).toThrow(BillingError);
  });

  it("maps the plan server-side and applies the configured founding coupon only while eligible", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_grantdesk";
    process.env.STRIPE_PRICE_GROWTH_MONTHLY = "price_growth_month";
    process.env.STRIPE_FOUNDING_GROWTH_COUPON_ID = "coupon_growth_100";
    process.env.FOUNDING_PRICING_END_AT = "2030-01-01T00:00:00Z";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }), { status: 200 }));
    await createCheckoutSession({ uid: "user_123", email: "finance@example.org", emailVerified: true, name: "Finance User" }, { plan: "growth" }, "https://grantdeskhq.com", { utm_source: "newsletter", campaign_id: "campaign_42" });
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price]")).toBe("price_growth_month");
    expect(body.get("discounts[0][coupon]")).toBe("coupon_growth_100");
    expect(body.get("metadata[grantdeskhq_plan_key]")).toBe("growth");
    expect(body.get("subscription_data[metadata][utm_source]")).toBe("newsletter");
    expect(body.get("metadata[campaign_id]")).toBe("campaign_42");
  });

  it("uses normal pricing with no founding coupon after the configured window expires", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_grantdesk";
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_month";
    process.env.STRIPE_FOUNDING_STARTER_COUPON_ID = "coupon_starter_50";
    process.env.FOUNDING_PRICING_END_AT = "2020-01-01T00:00:00Z";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }), { status: 200 }));
    await createCheckoutSession({ uid: "user_123", email: "finance@example.org", emailVerified: true, name: "Finance User" }, { plan: "starter" }, "https://grantdeskhq.com");
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(foundingPricingActive()).toBe(false);
    expect(body.get("line_items[0][price]")).toBe("price_starter_month");
    expect(body.get("discounts[0][coupon]")).toBeNull();
  });

  it("changes only the stored subscription item and remaps a founding discount server-side", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_grantdesk";
    process.env.STRIPE_PRICE_GROWTH_MONTHLY = "price_growth_month";
    process.env.STRIPE_FOUNDING_GROWTH_COUPON_ID = "coupon_growth_100";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sub_123", items: { data: [{ id: "si_123" }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sub_123", status: "active" }), { status: 200 }));
    await expect(changeSubscriptionPlan("sub_123", { plan: "growth" }, true)).resolves.toMatchObject({ stripeSubscriptionId: "sub_123", stripePriceId: "price_growth_month", planKey: "growth", foundingPricingApplied: true });
    const body = fetchMock.mock.calls[1][1]?.body as URLSearchParams;
    expect(body.get("items[0][id]")).toBe("si_123");
    expect(body.get("items[0][price]")).toBe("price_growth_month");
    expect(body.get("discounts[0][coupon]")).toBe("coupon_growth_100");
    expect(body.get("metadata[grantdeskhq_plan_key]")).toBe("growth");
  });

  it("verifies current Stripe signatures and rejects tampering", () => {
    const payload = Buffer.from("{\"id\":\"evt_123\"}");
    const timestamp = 1_800_000_000;
    const signature = createHmac("sha256", "whsec_test").update(`${timestamp}.`).update(payload).digest("hex");
    expect(() => verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, "whsec_test", timestamp)).not.toThrow();
    expect(() => verifyStripeSignature(Buffer.from("{\"id\":\"evt_changed\"}"), `t=${timestamp},v1=${signature}`, "whsec_test", timestamp)).toThrow(BillingError);
  });

  it("turns verified subscription, cancellation, and payment-failure events into canonical state", () => {
    const active = billingSnapshotFromEvent(subscriptionEvent("customer.subscription.created", "active"));
    expect(active).toMatchObject({ stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_123", stripePriceId: "price_growth_month", planKey: "growth", subscriptionStatus: "active", foundingPricingApplied: true, attribution: { utm_source: "newsletter", campaign_id: "campaign_42" } });
    expect(billingSnapshotFromEvent(subscriptionEvent("customer.subscription.deleted", "canceled"))).toMatchObject({ subscriptionStatus: "canceled", cancelAtPeriodEnd: true });
    const failed = billingSnapshotFromEvent({ id: "evt_failed", type: "invoice.payment_failed", created: 1_800_000_100, data: { object: { customer: "cus_123", subscription: "sub_123", metadata: {}, subscription_details: { metadata: { grantdeskhq_uid: "firebase_user", grantdeskhq_plan_key: "growth" } } } } });
    expect(failed).toMatchObject({ subscriptionStatus: "past_due", stripeSubscriptionId: "sub_123" });
  });

  it("uses event IDs and Stripe event ordering to prevent duplicate or stale webhook application", () => {
    const snapshot = billingSnapshotFromEvent(subscriptionEvent("customer.subscription.updated", "active"))!;
    expect(shouldApplyBillingEvent(snapshot)).toBe(true);
    expect(shouldApplyBillingEvent(snapshot, snapshot.eventId, "")).toBe(false);
    expect(shouldApplyBillingEvent(snapshot, "evt_other", "2099-01-01T00:00:00.000Z")).toBe(false);
  });

  it("sanitizes attribution and opens Customer Portal only for a server-provided customer", async () => {
    expect(normalizeAttribution({ utm_source: "newsletter", lead_id: "lead_42", ignored: "no", utm_content: "bad\u0000value" })).toEqual({ utm_source: "newsletter", lead_id: "lead_42", utm_content: "badvalue" });
    process.env.STRIPE_SECRET_KEY = "sk_test_grantdesk";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ url: "https://billing.stripe.com/session/test" }), { status: 200 }));
    await expect(createCustomerPortalSession("cus_123", "https://grantdeskhq.com")).resolves.toEqual({ url: "https://billing.stripe.com/session/test" });
    expect((fetchMock.mock.calls[0][1]?.body as URLSearchParams).get("customer")).toBe("cus_123");
    await expect(createCustomerPortalSession("not-a-customer", "https://grantdeskhq.com")).rejects.toBeInstanceOf(BillingError);
  });
});
