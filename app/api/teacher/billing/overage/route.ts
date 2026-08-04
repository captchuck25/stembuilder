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
// EXISTING Stripe subscription as a quantity on the overage price. Stripe
// charges the card already on file (prorated) — no second checkout page.
// The only client input is the purchase quantity, validated to a small
// integer; the resulting cap is derived from Stripe's response, and the
// webhook re-syncs it on every subscription update as a backstop.
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
    const existing = sub.items.data.find((i) => i.price.id === overagePriceId());
    newQuantity = (existing?.quantity ?? 0) + blocks;
    await stripe().subscriptions.update(subId, {
      items: existing
        ? [{ id: existing.id, quantity: newQuantity }]
        : [{ price: overagePriceId()!, quantity: newQuantity }],
      // Charge the prorated difference immediately rather than waiting for
      // the next renewal — the teacher gets the seats the moment they pay.
      proration_behavior: "always_invoice",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[billing] overage update failed:", message);
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
