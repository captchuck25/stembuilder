import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminDb } from "@/lib/db.server";
import { roleAtLeast } from "@/lib/roles";
import { isBillingConfigured, stripe, teacherProPriceId, siteOrigin } from "@/lib/billing.server";

// POST /api/teacher/billing/checkout — start a Stripe Checkout session for
// the $60/year Teacher Pro subscription. No client input is read; eligibility
// is derived from the session + database. The plan itself is only ever set by
// the webhook after Stripe confirms payment.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isBillingConfigured()) {
    return NextResponse.json(
      { error: "Online checkout isn't available yet — email info@stembuilder.io to upgrade." },
      { status: 503 },
    );
  }

  const db = adminDb();
  const { data: profile } = await db
    .from("profiles")
    .select("role, plan, email, district_id, stripe_customer_id")
    .eq("id", session.user.id)
    .is("deleted_at", null)
    .single();

  if (!roleAtLeast(profile?.role, "teacher")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile!.district_id !== null) {
    return NextResponse.json(
      { error: "Your school or district plan already includes full access." },
      { status: 409 },
    );
  }
  if (profile!.plan === "pro") {
    return NextResponse.json({ error: "You're already on Teacher Pro." }, { status: 409 });
  }

  // Send the teacher back to the EXACT host they're browsing — a env-configured
  // origin that differs from it (www vs apex, vercel.app) drops the session
  // cookie on return and the success redirect looks like a logout. The Origin
  // header is trustworthy here: the route requires a same-site session cookie.
  const headerOrigin = req.headers.get("origin");
  const origin =
    headerOrigin &&
    (new URL(headerOrigin).hostname.endsWith("stembuilder.io") ||
      new URL(headerOrigin).hostname === "localhost")
      ? headerOrigin
      : siteOrigin();
  let checkout;
  try {
    checkout = await createCheckoutSession(origin, session.user.id, profile!);
  } catch (err) {
    // Surface Stripe's own message — it names the actual misconfiguration
    // (bad price id, key/mode mismatch, …) and contains nothing secret.
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[billing] checkout session failed:", message);
    return NextResponse.json({ error: `Stripe error: ${message}` }, { status: 502 });
  }

  return NextResponse.json({ url: checkout.url });
}

function createCheckoutSession(
  origin: string,
  teacherId: string,
  profile: { email: string | null; stripe_customer_id: string | null },
) {
  return stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: teacherProPriceId(), quantity: 1 }],
    client_reference_id: teacherId,
    ...(profile.stripe_customer_id
      ? { customer: profile.stripe_customer_id }
      : profile.email
        ? { customer_email: profile.email }
        : {}),
    metadata: { teacher_id: teacherId },
    subscription_data: { metadata: { teacher_id: teacherId } },
    allow_promotion_codes: true,
    success_url: `${origin}/teachers/dashboard?upgraded=1`,
    cancel_url: `${origin}/teachers/upgrade?canceled=1`,
  });
}
