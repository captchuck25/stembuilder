import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminDb } from "@/lib/db.server";
import { roleAtLeast } from "@/lib/roles";
import { isCheckoutEnabled, overagePriceId, stripe } from "@/lib/billing.server";
import { getTeacherPlanUsage } from "@/lib/plan.server";
import { writeAudit } from "@/lib/audit.server";

// POST /api/teacher/billing/overage  { blocks }
//
// Adds overage blocks ($10/year each = 25 students) to a Pro teacher's
// EXISTING Stripe subscription as a quantity on the overage price, charged
// to the card already on file — no second checkout page. Deliberately NOT
// prorated: the full $10/block is invoiced today regardless of where the
// teacher is in their year (business decision 2026-08-04), and the block
// then renews at full price with the subscription. The only client input is
// the purchase quantity, validated to a small integer; the resulting cap is
// derived from Stripe's confirmed state, and the webhook re-syncs it on
// every subscription update as a backstop.
// Several sequential Stripe calls — give the function room beyond the
// platform default so a slow Stripe response can't strand the client.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isCheckoutEnabled() || !overagePriceId()) {
    return NextResponse.json(
      { error: "Online checkout isn't open yet — email info@stembuilder.io and we'll add the students." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const blocks = Number(body.blocks);
  if (!Number.isInteger(blocks) || blocks < 1 || blocks > 8) {
    return NextResponse.json({ error: "Choose between 1 and 8 blocks of 25 students." }, { status: 400 });
  }

  const db = adminDb();
  const { data: profile } = await db
    .from("profiles")
    .select("role, plan, district_id, stripe_subscription_id")
    .eq("id", session.user.id)
    .is("deleted_at", null)
    .single();

  if (!roleAtLeast(profile?.role, "teacher")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile!.plan !== "pro" || !profile!.stripe_subscription_id) {
    return NextResponse.json(
      { error: "Adding students requires an active Teacher Pro subscription." },
      { status: 409 },
    );
  }

  let newQuantity: number;
  try {
    const subId = profile!.stripe_subscription_id;
    const sub = await stripe().subscriptions.retrieve(subId);
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const existing = sub.items.data.find((i) => i.price.id === overagePriceId());
    newQuantity = (existing?.quantity ?? 0) + blocks;

    // The card on file: Checkout attaches it to the SUBSCRIPTION, not as the
    // customer default — resolve it from the subscription first, then fall
    // back to the customer's invoice default.
    let paymentMethod =
      typeof sub.default_payment_method === "string"
        ? sub.default_payment_method
        : sub.default_payment_method?.id ?? null;
    if (!paymentMethod) {
      const customer = await stripe().customers.retrieve(customerId);
      if (!customer.deleted) {
        const cpm = customer.invoice_settings?.default_payment_method;
        paymentMethod = typeof cpm === "string" ? cpm : cpm?.id ?? null;
      }
    }
    if (!paymentMethod) {
      return NextResponse.json(
        { error: "We couldn't find a card on file for your subscription — email info@stembuilder.io and we'll add the students." },
        { status: 409 },
      );
    }

    // 1. Charge the full price today — an immediate one-off invoice for
    //    $10 × blocks against that card. Payment must succeed before any
    //    capacity is granted.
    await stripe().invoiceItems.create({
      customer: customerId,
      amount: blocks * 10_00,
      currency: "usd",
      description: `Extra Students (25-pack) × ${blocks} — first year`,
    });
    const invoice = await stripe().invoices.create({
      customer: customerId,
      default_payment_method: paymentMethod,
      auto_advance: false,
      pending_invoice_items_behavior: "include",
    });
    const finalized = await stripe().invoices.finalizeInvoice(invoice.id!);
    if (finalized.status !== "paid") await stripe().invoices.pay(invoice.id!);

    // 2. Grant the capacity: bump the subscription quantity WITHOUT any
    //    proration charge (they just paid full price); renewals bill the
    //    block at full price alongside the base plan.
    await stripe().subscriptions.update(subId, {
      items: existing
        ? [{ id: existing.id, quantity: newQuantity }]
        : [{ price: overagePriceId()!, quantity: newQuantity }],
      proration_behavior: "none",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[billing] overage purchase failed:", message);
    return NextResponse.json({ error: `Stripe error: ${message}` }, { status: 502 });
  }

  // Sync immediately from Stripe's confirmed state (webhook re-syncs later).
  await db.from("profiles").update({ pro_overage_blocks: newQuantity }).eq("id", session.user.id);

  await writeAudit({
    actorId: session.user.id,
    actorRole: profile!.role ?? "teacher",
    action: "plan.overage_add",
    targetType: "profile",
    targetId: session.user.id,
    metadata: { blocks_added: blocks, blocks_total: newQuantity },
  });

  const usage = await getTeacherPlanUsage(session.user.id);
  return NextResponse.json(usage);
}
