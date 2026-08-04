import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { adminDb } from "@/lib/db.server";
import { isBillingConfigured, overagePriceId, stripe } from "@/lib/billing.server";
import { writeAudit } from "@/lib/audit.server";

// POST /api/billing/webhook — Stripe events. This is the ONLY place that
// grants plan='pro': signature-verified, so a plan change can never be forged
// from a browser. Configure the endpoint in the Stripe dashboard to send:
//   checkout.session.completed
//   customer.subscription.updated   (syncs overage-block quantity)
//   customer.subscription.deleted
//   invoice.payment_failed
// Stays active whenever keys exist — BILLING_ENABLED only gates NEW purchases,
// so cancellations and quantity syncs keep flowing while sales are paused.
export async function POST(req: NextRequest) {
  if (!isBillingConfigured()) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const payload = await req.text();
    event = stripe().webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = adminDb();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const teacherId = session.client_reference_id ?? session.metadata?.teacher_id;
      if (!teacherId) break; // not one of ours — acknowledge and move on

      // Blocks bought up front ride on the new subscription — read the
      // confirmed quantity so the cap is right from the first second.
      const subId = typeof session.subscription === "string" ? session.subscription : null;
      let blocks = 0;
      const priceId = overagePriceId();
      if (subId && priceId) {
        try {
          const sub = await stripe().subscriptions.retrieve(subId);
          blocks = sub.items.data.find((i) => i.price.id === priceId)?.quantity ?? 0;
        } catch {
          blocks = 0; // subscription.updated events re-converge this later
        }
      }

      const { error } = await db
        .from("profiles")
        .update({
          plan: "pro",
          pro_overage_blocks: blocks,
          stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
          stripe_subscription_id: subId,
        })
        .eq("id", teacherId);
      if (error) {
        // 500 → Stripe retries the event; the upgrade is not lost.
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
      }
      await writeAudit({
        actorId: teacherId,
        actorRole: "teacher",
        action: "plan.pro_activate",
        targetType: "profile",
        targetId: teacherId,
        metadata: { via: "stripe_checkout", subscription: session.subscription ?? null },
      });
      break;
    }

    case "customer.subscription.updated": {
      // Backstop sync for overage blocks — the purchase route writes the
      // quantity directly, but any change made in the Stripe dashboard or a
      // failed direct write lands here and re-converges the cap.
      const sub = event.data.object as Stripe.Subscription;
      const priceId = overagePriceId();
      if (!priceId) break;
      const { data: profile } = await db
        .from("profiles")
        .select("id, pro_overage_blocks")
        .eq("stripe_subscription_id", sub.id)
        .maybeSingle();
      if (!profile) break;
      const quantity = sub.items.data.find((i) => i.price.id === priceId)?.quantity ?? 0;
      if (quantity !== profile.pro_overage_blocks) {
        const { error } = await db
          .from("profiles")
          .update({ pro_overage_blocks: quantity })
          .eq("id", profile.id);
        if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const { data: profile } = await db
        .from("profiles")
        .select("id")
        .eq("stripe_subscription_id", sub.id)
        .maybeSingle();
      if (!profile) break;
      const { error } = await db
        .from("profiles")
        .update({ plan: "free", stripe_subscription_id: null, pro_overage_blocks: 0 })
        .eq("id", profile.id);
      if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
      await writeAudit({
        actorId: profile.id,
        actorRole: "teacher",
        action: "plan.pro_cancel",
        targetType: "profile",
        targetId: profile.id,
        metadata: { via: "stripe_subscription_deleted", subscription: sub.id },
      });
      break;
    }

    case "invoice.payment_failed": {
      // Stripe retries per its dunning schedule and emits subscription.deleted
      // if recovery ultimately fails — the downgrade happens there, not here.
      break;
    }
  }

  return NextResponse.json({ received: true });
}
