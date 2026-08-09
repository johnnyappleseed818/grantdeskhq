import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthenticatedUser } from "./auth.ts";
import type { BillingInterval, PlanId } from "../src/content/pricing.ts";

const stripeApi = "https://api.stripe.com/v1";
const checkoutSelections = new Set([
  "essentials:month", "essentials:year",
  "growth:month", "growth:year",
  "portfolio:month", "portfolio:year"
]);

export interface BillingSelection {
  plan: PlanId;
  interval: BillingInterval;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown> & {
      client_reference_id?: string;
      customer?: string;
      subscription?: string;
      status?: string;
      metadata?: Record<string, string>;
    };
  };
}

export interface BillingEventSnapshot {
  eventId: string;
  eventType: string;
  uid: string;
  customerId: string;
  subscriptionId: string;
  plan: string;
  interval: string;
  status: string;
  updatedAt: string;
}

export function isBillingConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY
    && process.env.STRIPE_WEBHOOK_SECRET
    && checkoutSelections.size === configuredPriceSelections().size
  );
}

export function validateBillingSelection(input: unknown): BillingSelection {
  const candidate = input as Partial<BillingSelection> | null;
  const key = `${candidate?.plan || ""}:${candidate?.interval || ""}`;
  if (!checkoutSelections.has(key)) throw new BillingError(400, "Choose a valid GrantDeskHQ plan and billing schedule.");
  return candidate as BillingSelection;
}

export async function createCheckoutSession(user: AuthenticatedUser, selection: BillingSelection, origin: string) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new BillingError(503, "Subscription checkout is being configured. Your free first report is still available.");
  const priceId = priceIdFor(selection);
  if (!priceId) throw new BillingError(503, "This subscription option is not available yet. Your free first report is still available.");

  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    client_reference_id: user.uid,
    customer_email: user.email,
    success_url: `${origin}/workspace?billing=success`,
    cancel_url: `${origin}/pricing?billing=cancelled`,
    "metadata[grantdeskhq_uid]": user.uid,
    "metadata[grantdeskhq_plan]": selection.plan,
    "metadata[grantdeskhq_interval]": selection.interval,
    "subscription_data[metadata][grantdeskhq_uid]": user.uid,
    "subscription_data[metadata][grantdeskhq_plan]": selection.plan,
    "subscription_data[metadata][grantdeskhq_interval]": selection.interval
  });
  const couponId = process.env.STRIPE_EARLY_ACCESS_COUPON_ID;
  if (couponId) body.set("discounts[0][coupon]", couponId);

  const response = await fetch(`${stripeApi}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const result = await response.json() as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !result.url) {
    console.error("Stripe Checkout error:", response.status, result.error?.message || "Missing checkout URL");
    throw new BillingError(502, "Secure checkout could not be started. Please try again.");
  }
  return { checkoutSessionId: result.id || "", url: result.url };
}

export function verifyStripeSignature(payload: Buffer, signatureHeader: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!signatureHeader || !secret) throw new BillingError(400, "Stripe webhook signature is missing.");
  const parts = signatureHeader.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value).filter(Boolean);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || signatures.length === 0) {
    throw new BillingError(400, "Stripe webhook signature is invalid or expired.");
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(payload).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const matched = signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const actualBuffer = Buffer.from(signature, "hex");
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  });
  if (!matched) throw new BillingError(400, "Stripe webhook signature could not be verified.");
}

export function billingSnapshotFromEvent(event: StripeWebhookEvent): BillingEventSnapshot | null {
  const object = event.data?.object;
  if (!object || !event.id || !event.type) return null;
  const metadata = object.metadata || {};
  const uid = String(metadata.grantdeskhq_uid || object.client_reference_id || "");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return null;
  if (event.type !== "checkout.session.completed" && !event.type.startsWith("customer.subscription.")) return null;
  return {
    eventId: event.id,
    eventType: event.type,
    uid,
    customerId: stringId(object.customer),
    subscriptionId: event.type === "checkout.session.completed" ? stringId(object.subscription) : stringId(object.id),
    plan: String(metadata.grantdeskhq_plan || ""),
    interval: String(metadata.grantdeskhq_interval || ""),
    status: String(object.status || (event.type === "checkout.session.completed" ? "checkout_completed" : "unknown")),
    updatedAt: new Date().toISOString()
  };
}

function configuredPriceSelections() {
  return new Set(Array.from(checkoutSelections).filter((selection) => {
    const [plan, interval] = selection.split(":") as [PlanId, BillingInterval];
    return Boolean(process.env[priceEnvironmentName(plan, interval)]);
  }));
}

function priceIdFor(selection: BillingSelection) {
  return process.env[priceEnvironmentName(selection.plan, selection.interval)] || "";
}

function priceEnvironmentName(plan: PlanId, interval: BillingInterval) {
  return `STRIPE_PRICE_${plan.toUpperCase()}_${interval === "month" ? "MONTHLY" : "ANNUAL"}`;
}

function stringId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String((value as { id: unknown }).id || "");
  return "";
}

export class BillingError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
