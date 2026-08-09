import { PRICING_PLANS, EARLY_ACCESS_DISCOUNT_MONTHS, EARLY_ACCESS_DISCOUNT_PERCENT } from "../src/content/pricing.ts";

const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
const confirmed = process.env.STRIPE_SETUP_CONFIRM === "CREATE_GRANTDESKHQ_PRICING";
const apiBase = "https://api.stripe.com/v1";

if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required.");
if (!confirmed) throw new Error("Set STRIPE_SETUP_CONFIRM=CREATE_GRANTDESKHQ_PRICING after reviewing the exact products and prices in this script.");

const products = await stripeGet("/products?active=true&limit=100");
const output = {};

for (const plan of PRICING_PLANS) {
  let product = products.data.find((candidate) => candidate.metadata?.application === "grantdeskhq" && candidate.metadata?.tier === plan.id);
  if (!product) {
    product = await stripePost("/products", {
      name: `GrantDeskHQ ${plan.name}`,
      description: `${plan.bestFor}. Includes the GrantDeskHQ post-award reporting workflow.`,
      "metadata[application]": "grantdeskhq",
      "metadata[tier]": plan.id
    });
  }
  for (const [interval, amount] of [["month", plan.monthly], ["year", plan.annual]]) {
    const lookupKey = `grantdeskhq_${plan.id}_${interval}_20260809_annual10`;
    const listed = await stripeGet(`/prices?active=true&limit=1&lookup_keys[0]=${encodeURIComponent(lookupKey)}`);
    let price = listed.data[0];
    const amountInCents = Math.round(amount * 100);
    if (price) validateExistingPrice(price, product.id, amountInCents, interval, lookupKey);
    else {
      price = await stripePost("/prices", {
        product: product.id,
        currency: "usd",
        unit_amount: String(amountInCents),
        "recurring[interval]": interval,
        lookup_key: lookupKey,
        nickname: `${plan.name} ${interval === "month" ? "monthly" : "annual"} 2026 list price`,
        "metadata[application]": "grantdeskhq",
        "metadata[tier]": plan.id
      });
    }
    output[`STRIPE_PRICE_${plan.id.toUpperCase()}_${interval === "month" ? "MONTHLY" : "ANNUAL"}`] = price.id;
  }
}

const couponId = "grantdeskhq_early_access_50_first_year";
let coupon;
try { coupon = await stripeGet(`/coupons/${couponId}`); }
catch (error) {
  if (error.status !== 404) throw error;
  coupon = await stripePost("/coupons", {
    id: couponId,
    name: "GrantDeskHQ early access — 50% off first year",
    percent_off: String(EARLY_ACCESS_DISCOUNT_PERCENT),
    duration: "repeating",
    duration_in_months: String(EARLY_ACCESS_DISCOUNT_MONTHS),
    "metadata[application]": "grantdeskhq"
  });
}
if (coupon.percent_off !== EARLY_ACCESS_DISCOUNT_PERCENT || coupon.duration !== "repeating" || coupon.duration_in_months !== EARLY_ACCESS_DISCOUNT_MONTHS) {
  throw new Error(`Existing coupon ${couponId} does not match the approved 50%-for-12-months offer.`);
}
output.STRIPE_EARLY_ACCESS_COUPON_ID = coupon.id;

console.log(JSON.stringify(output, null, 2));

async function stripeGet(path) {
  return stripeRequest(path, { method: "GET" });
}

async function stripePost(path, values) {
  return stripeRequest(path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values) });
}

async function stripeRequest(path, init) {
  const response = await fetch(`${apiBase}${path}`, { ...init, headers: { Authorization: `Bearer ${secretKey}`, ...init.headers } });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error?.message || `Stripe request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function validateExistingPrice(price, productId, amount, interval, lookupKey) {
  if (price.product !== productId || price.currency !== "usd" || price.unit_amount !== amount || price.recurring?.interval !== interval) {
    throw new Error(`Existing Stripe price ${lookupKey} conflicts with the approved GrantDeskHQ price. No replacement was created.`);
  }
}
