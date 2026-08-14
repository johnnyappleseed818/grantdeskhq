const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
const apiBase = "https://api.stripe.com/v1";

if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required to discover existing GrantDeskHQ Stripe objects.");

const expectedPlans = [
  { key: "starter", productName: "Starter Nonprofit", amount: 99, foundingDiscount: 50 },
  { key: "growth", productName: "Growth Nonprofit", amount: 199, foundingDiscount: 100 },
  { key: "agency", productName: "Fractional CFO Agency", amount: 499, foundingDiscount: 200 }
];

const products = await stripeGet("/products?active=true&limit=100");
const coupons = await stripeGet("/coupons?limit=100");
const discovered = { mode: secretKey.startsWith("sk_live_") ? "live" : "test", products: {}, prices: {}, coupons: {}, required_environment: {} };

for (const plan of expectedPlans) {
  const product = exactlyOne(products.data.filter((candidate) => isGrantDeskPlan(candidate, plan)), `product for ${plan.key}`);
  const prices = await stripeGet(`/prices?active=true&limit=100&product=${encodeURIComponent(product.id)}`);
  const price = exactlyOne(prices.data.filter((candidate) => candidate.currency === "usd" && candidate.unit_amount === plan.amount * 100 && candidate.recurring?.interval === "month"), `monthly price for ${plan.key}`);
  const coupon = exactlyOne(coupons.data.filter((candidate) => candidate.valid && candidate.amount_off === plan.foundingDiscount * 100 && candidate.currency === "usd" && isGrantDeskPlan(candidate, plan)), `founding coupon for ${plan.key}`);
  discovered.products[plan.key] = product.id;
  discovered.prices[plan.key] = price.id;
  discovered.coupons[plan.key] = coupon.id;
  discovered.required_environment[`STRIPE_PRICE_${plan.key.toUpperCase()}_MONTHLY`] = price.id;
  discovered.required_environment[`STRIPE_FOUNDING_${plan.key.toUpperCase()}_COUPON_ID`] = coupon.id;
}

console.log(JSON.stringify(discovered, null, 2));

function isGrantDeskPlan(candidate, plan) {
  const metadata = candidate.metadata || {};
  const key = String(metadata.plan_key || metadata.planKey || metadata.tier || "").toLowerCase();
  if (metadata.application === "grantdeskhq" && key === plan.key) return true;
  const name = String(candidate.name || "");
  return name === plan.productName || name === "GrantDeskHQ " + plan.productName || name === plan.productName.replace(" Nonprofit", "") + " Discount" || name === plan.key.charAt(0).toUpperCase() + plan.key.slice(1) + " Discount";
}

function exactlyOne(matches, label) {
  if (matches.length !== 1) throw new Error(`Expected exactly one ${label}; found ${matches.length}. No Stripe objects were created or changed.`);
  return matches[0];
}

async function stripeGet(path) {
  const response = await fetch(`${apiBase}${path}`, { headers: { Authorization: `Bearer ${secretKey}` } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || `Stripe discovery failed with status ${response.status}.`);
  return body;
}
