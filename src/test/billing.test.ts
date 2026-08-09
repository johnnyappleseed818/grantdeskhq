import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BillingError,
  billingSnapshotFromEvent,
  createCheckoutSession,
  validateBillingSelection,
  verifyStripeSignature,
  type StripeWebhookEvent
} from "../../server/billing";

afterEach(() => {
  vi.restoreAllMocks();
  for (const name of [
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_GROWTH_MONTHLY",
    "STRIPE_EARLY_ACCESS_COUPON_ID"
  ]) delete process.env[name];
});

describe("Stripe billing controls", () => {
  it("accepts only the six published plan and interval combinations", () => {
    expect(validateBillingSelection({ plan: "growth", interval: "year" })).toEqual({ plan: "growth", interval: "year" });
    expect(() => validateBillingSelection({ plan: "enterprise", interval: "month" })).toThrow(BillingError);
    expect(() => validateBillingSelection({ plan: "growth", interval: "week" })).toThrow(BillingError);
  });

  it("creates server-controlled Checkout data and applies the first-year coupon", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_grantdesk";
    process.env.STRIPE_PRICE_GROWTH_MONTHLY = "price_growth_month";
    process.env.STRIPE_EARLY_ACCESS_COUPON_ID = "coupon_first_year";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }), { status: 200 }));
    const result = await createCheckoutSession(
      { uid: "user_123", email: "finance@example.org", emailVerified: true, name: "Finance User" },
      { plan: "growth", interval: "month" },
      "https://grantdeskhq.com"
    );
    expect(result.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const [, init] = fetchMock.mock.calls[0];
    const body = init?.body as URLSearchParams;
    expect(body.get("line_items[0][price]")).toBe("price_growth_month");
    expect(body.get("discounts[0][coupon]")).toBe("coupon_first_year");
    expect(body.get("client_reference_id")).toBe("user_123");
    expect(body.get("success_url")).toBe("https://grantdeskhq.com/workspace?billing=success");
  });

  it("verifies a current Stripe signature and rejects tampering", () => {
    const payload = Buffer.from('{"id":"evt_123"}');
    const timestamp = 1_800_000_000;
    const signature = createHmac("sha256", "whsec_test").update(`${timestamp}.`).update(payload).digest("hex");
    expect(() => verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, "whsec_test", timestamp)).not.toThrow();
    expect(() => verifyStripeSignature(Buffer.from('{"id":"evt_changed"}'), `t=${timestamp},v1=${signature}`, "whsec_test", timestamp)).toThrow(BillingError);
  });

  it("turns supported webhook events into tenant-scoped billing snapshots", () => {
    const event: StripeWebhookEvent = {
      id: "evt_123",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "firebase_user", customer: "cus_123", subscription: "sub_123", status: "complete", metadata: { grantdeskhq_plan: "growth", grantdeskhq_interval: "year" } } }
    };
    expect(billingSnapshotFromEvent(event)).toMatchObject({
      eventId: "evt_123",
      uid: "firebase_user",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      plan: "growth",
      interval: "year",
      status: "complete"
    });
    expect(billingSnapshotFromEvent({ ...event, type: "payment_intent.created" })).toBeNull();
  });
});
