import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminDb } from "@/lib/db.server";
import { roleAtLeast } from "@/lib/roles";
import { isBillingConfigured, stripe, siteOrigin } from "@/lib/billing.server";

// POST /api/teacher/billing/portal — open the Stripe Customer Portal for the
// signed-in teacher: cancel (at period end), update card, view invoices.
// Gated on keys being configured but NOT on BILLING_ENABLED — existing
// subscribers must always be able to manage/cancel even while new sales are
// paused. (NY/CA auto-renewal laws require online cancellation for online
// signups.) Downgrade-on-cancellation flows through the existing
// customer.subscription.deleted webhook when the paid period ends.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isBillingConfigured()) {
    return NextResponse.json(
      { error: "Billing management isn't available — email support@stembuilder.io." },
      { status: 503 },
    );
  }

  const { data: profile } = await adminDb()
    .from("profiles")
    .select("role, stripe_customer_id")
    .eq("id", session.user.id)
    .is("deleted_at", null)
    .single();

  if (!roleAtLeast(profile?.role, "teacher")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!profile!.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account found — email support@stembuilder.io and we'll help." },
      { status: 409 },
    );
  }

  const headerOrigin = req.headers.get("origin");
  const origin =
    headerOrigin &&
    (new URL(headerOrigin).hostname.endsWith("stembuilder.io") ||
      new URL(headerOrigin).hostname === "localhost")
      ? headerOrigin
      : siteOrigin();

  try {
    const portal = await stripe().billingPortal.sessions.create({
      customer: profile!.stripe_customer_id,
      return_url: `${origin}/teachers/account`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[billing] portal session failed:", message);
    return NextResponse.json({ error: `Stripe error: ${message}` }, { status: 502 });
  }
}
