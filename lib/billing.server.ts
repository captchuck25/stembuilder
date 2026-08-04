// Stripe billing — Teacher Pro self-serve upgrades.
//
// Env-gated at two levels:
//   isBillingConfigured() — the three STRIPE_* vars exist. Without them the
//     webhook and checkout answer 503. Safe to deploy before Stripe is set up.
//   isCheckoutEnabled()  — configured AND BILLING_ENABLED=true. The explicit
//     kill switch: keys can sit in the environment (e.g. sandbox testing)
//     without any purchase being possible. The webhook stays active whenever
//     keys exist so cancellations/updates still sync while sales are paused.
// Required env:
//   STRIPE_SECRET_KEY         sk_live_... (or sk_test_...)
//   STRIPE_WEBHOOK_SECRET     whsec_...   (from the webhook endpoint config)
//   STRIPE_PRICE_TEACHER_PRO  price_...   ($60/year recurring)
//   BILLING_ENABLED           "true" to open checkout to teachers
// Optional:
//   STRIPE_PRICE_PRO_OVERAGE  price_...   ($10/year recurring, one unit = 25
//                             students; sold as a quantity on the same
//                             subscription via the overage route)

import Stripe from "stripe";

export function isBillingConfigured(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PRICE_TEACHER_PRO
  );
}

export function isCheckoutEnabled(): boolean {
  return isBillingConfigured() && process.env.BILLING_ENABLED === "true";
}

export function overagePriceId(): string | null {
  return process.env.STRIPE_PRICE_PRO_OVERAGE ?? null;
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

export function teacherProPriceId(): string {
  return process.env.STRIPE_PRICE_TEACHER_PRO!;
}

/** Absolute origin for Checkout redirect URLs. */
export function siteOrigin(): string {
  return process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "https://stembuilder.io";
}
