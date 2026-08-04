// Stripe billing — Teacher Pro self-serve upgrades.
//
// Env-gated: without the three STRIPE_* vars, isBillingConfigured() is false,
// the checkout route answers 503, and the upgrade page shows the contact
// fallback — safe to deploy before Stripe is set up. Required env:
//   STRIPE_SECRET_KEY        sk_live_... (or sk_test_...)
//   STRIPE_WEBHOOK_SECRET    whsec_...   (from the webhook endpoint config)
//   STRIPE_PRICE_TEACHER_PRO price_...   ($60/year recurring price)
//
// Overage blocks ($10/25 students) are still a contact flow — when they move
// to Stripe, add a second price and a quantity-bearing subscription item.

import Stripe from "stripe";

export function isBillingConfigured(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PRICE_TEACHER_PRO
  );
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
