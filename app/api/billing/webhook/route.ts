import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { adminDb } from "@/lib/db.server";
import { isBillingConfigured, stripe } from "@/lib/billing.server";
import { writeAudit } from "@/lib/audit.server";

// POST /api/billing/webhook — Stripe events. This is the ONLY place that
// grants plan='pro': signature-verified, so a plan change can never be forged
// from a browser. Configure the endpoint in the Stripe dashboard to send:
//   checkout.session.completed
//   customer.subscription.deleted
//   invoice.payment_failed
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
      const { error } = await db
        .from("profiles")
        .update({
          plan: "pro",
          stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
          stripe_subscription_id:
            typeof session.subscription === "string" ? session.subscription : null,
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
        .update({ plan: "free", stripe_subscription_id: null })
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
