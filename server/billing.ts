import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthenticatedUser } from "./auth.ts";
import type { PlanId } from "../src/content/pricing.ts";

const stripeApi = "https://api.stripe.com/v1";
const planKeys = new Set<PlanId>(["starter", "growth", "agency"]);
export const ATTRIBUTION_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "lead_id", "campaign_id"] as const;
export type AttributionField = typeof ATTRIBUTION_FIELDS[number];
export type Attribution = Partial<Record<AttributionField, string>>;

export interface BillingSelection { plan: PlanId; }

export interface StripeWebhookEvent {
  id: string;
  type: string;
  created?: number;
  data: { object: Record<string, unknown>; };
}

export interface BillingEventSnapshot {
  eventId: string;
  eventType: string;
  stripeEventCreatedAt: string;
  uid: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  planKey: PlanId;
  subscriptionStatus: string;
  foundingPricingApplied: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  attribution: Attribution;
  updatedAt: string;
}

export function isBillingConfigured() {
  const pricesReady = [...planKeys].every((plan) => Boolean(priceIdFor(plan)));
  const couponsReady = !foundingPricingActive() || [...planKeys].every((plan) => Boolean(foundingCouponIdFor(plan)));
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && pricesReady && couponsReady);
}

export function foundingPricingActive(endAt = process.env.FOUNDING_PRICING_END_AT, now = Date.now()) {
  if (!endAt?.trim()) return false;
  const expiresAt = Date.parse(endAt);
  return Number.isFinite(expiresAt) && now < expiresAt;
}

export function validateBillingSelection(input: unknown): BillingSelection {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new BillingError(400, "Choose a valid GrantDeskHQ plan.");
  const candidate = input as Record<string, unknown>;
  if (Object.keys(candidate).length !== 1 || !Object.hasOwn(candidate, "plan") || !isPlanKey(candidate.plan)) {
    throw new BillingError(400, "Choose a valid GrantDeskHQ plan.");
  }
  return { plan: candidate.plan };
}

export function normalizeAttribution(input: unknown): Attribution {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const candidate = input as Record<string, unknown>;
  return Object.fromEntries(ATTRIBUTION_FIELDS.flatMap((field) => {
    const value = candidate[field];
    if (typeof value !== "string") return [];
    const clean = [...value].filter((character) => { const code = character.charCodeAt(0); return code >= 32 && code !== 127; }).join("").trim().slice(0, 180);
    return clean ? [[field, clean]] : [];
  })) as Attribution;
}

export async function createCheckoutSession(user: AuthenticatedUser, selection: BillingSelection, origin: string, attribution: Attribution = {}) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = priceIdFor(selection.plan);
  if (!secretKey || !priceId) throw new BillingError(503, "Subscription checkout is being configured. Your free first report is still available.");
  const founding = foundingPricingActive();
  const couponId = founding ? foundingCouponIdFor(selection.plan) : "";
  if (founding && !couponId) throw new BillingError(503, "The founding offer is being configured. Please try again shortly.");

  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    client_reference_id: user.uid,
    customer_email: user.email,
    success_url: `${origin}/workspace?billing=success`,
    cancel_url: `${origin}/pricing?billing=cancelled`,
    "metadata[grantdeskhq_uid]": user.uid,
    "metadata[grantdeskhq_plan_key]": selection.plan,
    "metadata[grantdeskhq_founding_pricing]": String(founding),
    "subscription_data[metadata][grantdeskhq_uid]": user.uid,
    "subscription_data[metadata][grantdeskhq_plan_key]": selection.plan,
    "subscription_data[metadata][grantdeskhq_founding_pricing]": String(founding)
  });
  for (const field of ATTRIBUTION_FIELDS) {
    const value = attribution[field];
    if (!value) continue;
    body.set(`metadata[${field}]`, value);
    body.set(`subscription_data[metadata][${field}]`, value);
  }
  if (couponId) body.set("discounts[0][coupon]", couponId);
  const response = await fetch(`${stripeApi}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const result = await response.json() as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !result.url) {
    console.error("Stripe Checkout error:", response.status, result.error?.message || "Missing checkout URL");
    throw new BillingError(502, "Secure checkout could not be started. Please try again.");
  }
  return { checkoutSessionId: result.id || "", url: result.url };
}

export async function createCustomerPortalSession(customerId: string, origin: string) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new BillingError(503, "Billing management is being configured. Please try again shortly.");
  if (!/^cus_[A-Za-z0-9]+$/.test(customerId)) throw new BillingError(409, "A Stripe customer record is not available for this account yet.");
  const response = await fetch(`${stripeApi}/billing_portal/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ customer: customerId, return_url: `${origin}/workspace` })
  });
  const result = await response.json() as { url?: string; error?: { message?: string } };
  if (!response.ok || !result.url) {
    console.error("Stripe Customer Portal error:", response.status, result.error?.message || "Missing portal URL");
    throw new BillingError(502, "Billing management could not be opened. Please try again.");
  }
  return { url: result.url };
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
  if (!object || !event.id || !supportedWebhookEvent(event.type)) return null;
  const metadata = metadataFor(object);
  const uid = String(metadata.grantdeskhq_uid || object.client_reference_id || "");
  const planKey = metadata.grantdeskhq_plan_key;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !isPlanKey(planKey)) return null;
  const invoice = event.type.startsWith("invoice.");
  const subscriptionId = event.type.startsWith("customer.subscription.") ? stringId(object.id) : stringId(object.subscription);
  return {
    eventId: event.id,
    eventType: event.type,
    stripeEventCreatedAt: stripeTime(event.created) || new Date().toISOString(),
    uid,
    stripeCustomerId: stringId(object.customer),
    stripeSubscriptionId: subscriptionId,
    stripePriceId: stripePriceId(object),
    planKey,
    subscriptionStatus: invoice ? invoiceSubscriptionStatus(event.type) : String(object.status || (event.type === "checkout.session.completed" ? "checkout_completed" : "unknown")),
    foundingPricingApplied: metadata.grantdeskhq_founding_pricing === "true",
    currentPeriodStart: stripeTime(object.current_period_start),
    currentPeriodEnd: stripeTime(object.current_period_end),
    cancelAtPeriodEnd: object.cancel_at_period_end === true,
    attribution: normalizeAttribution(metadata),
    updatedAt: new Date().toISOString()
  };
}

function supportedWebhookEvent(type: string) {
  return ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed"].includes(type);
}

function invoiceSubscriptionStatus(type: string) {
  if (type === "invoice.payment_failed") return "past_due";
  return "active";
}

function metadataFor(object: Record<string, unknown>) {
  const parent = asRecord(object.parent);
  const subscriptionDetails = asRecord(object.subscription_details) || asRecord(parent?.subscription_details);
  const direct = asStringRecord(object.metadata);
  if (direct && Object.keys(direct).length) return direct;
  return asStringRecord(subscriptionDetails?.metadata) || {};
}

function priceIdFor(plan: PlanId) { return process.env[`STRIPE_PRICE_${plan.toUpperCase()}_MONTHLY`] || ""; }
function foundingCouponIdFor(plan: PlanId) { return process.env[`STRIPE_FOUNDING_${plan.toUpperCase()}_COUPON_ID`] || ""; }
function isPlanKey(value: unknown): value is PlanId { return typeof value === "string" && planKeys.has(value as PlanId); }
function asRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function asStringRecord(value: unknown) { const record = asRecord(value); return record ? Object.fromEntries(Object.entries(record).filter(([, item]) => typeof item === "string").map(([key, item]) => [key, String(item)])) : null; }
function stringId(value: unknown) { if (typeof value === "string") return value; const record = asRecord(value); return record && typeof record.id === "string" ? record.id : ""; }
function stripeTime(value: unknown) { const seconds = typeof value === "number" ? value : Number(value); return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : ""; }
function stripePriceId(object: Record<string, unknown>) { const items = asRecord(object.items); const item = Array.isArray(items?.data) ? asRecord(items.data[0]) : null; return stringId(item?.price); }

export class BillingError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) { super(message); this.statusCode = statusCode; }
}
